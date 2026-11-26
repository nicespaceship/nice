/**
 * NICE Desktop — your own API keys
 *
 * Keeps the API keys the user adds for model providers and makes model
 * calls with them from the main process, so a key never reaches the page:
 * the page sees only which providers have one. Keys are encrypted with
 * Electron's safeStorage (the macOS Keychain, Windows DPAPI, or the Linux
 * secret store) and written to a file only the user can read. Without a
 * real store nothing is saved: on Linux with no keyring, safeStorage
 * reports itself available but uses a password built into Chromium
 * ('basic_text'), which is refused here.
 *
 * Requests and replies use nice-ai's shape, so AgentExecutor treats a call
 * on the user's key like one through NICE:
 *   in:  { model: 'byo:<provider>:<model>', messages: [{ role, content }],
 *          tools?: [{ name, description, parameters }], temperature?, max_tokens? }
 *        content is a string or parts: text, tool_use, tool_result, image_url
 *   out: { content: [text | tool_use parts], stop_reason, usage, model }
 */

const fs = require('fs');
const path = require('path');

const ANTHROPIC_VERSION = '2023-06-01';
const TIMEOUT_MS = 5 * 60 * 1000;
const MAX_BODY_BYTES = 16 * 1024 * 1024;
const MAX_MODELS = 300;

// OpenAI-compatible providers differ in base URL and in which listed
// models can chat.
const PROVIDERS = {
  // sees(model): whether the model takes images. A model that doesn't gets
  // a line of text in place of each image (a screenshot, an attachment).
  anthropic: { label: 'Anthropic', kind: 'anthropic', base: 'https://api.anthropic.com/v1', sees: (id) => !/^claude-(2|instant)/.test(id) },
  openai: {
    label: 'OpenAI', kind: 'openai', base: 'https://api.openai.com/v1',
    // Pro, Codex and deep-research models answer only on the Responses API.
    chatModel: (id) => /^(gpt-|o\d|chatgpt-)/.test(id) && !/(audio|realtime|transcribe|tts|image|search|instruct|embedding|codex|deep-research|-pro\b)/.test(id),
    newParams: true,
    sees: (id) => !/^(gpt-3\.5|o1-mini|o3-mini)/.test(id),
  },
  google: { label: 'Google Gemini', kind: 'gemini', base: 'https://generativelanguage.googleapis.com/v1beta', sees: () => true },
  xai: { label: 'xAI', kind: 'openai', base: 'https://api.x.ai/v1', chatModel: (id) => !/(image|imagine|embed)/.test(id), sees: (id) => /(vision|grok-4)/.test(id) },
  groq: { label: 'Groq', kind: 'openai', base: 'https://api.groq.com/openai/v1', chatModel: (id) => !/(whisper|tts|guard|playai)/.test(id), sees: (id) => /(llama-4|vision)/.test(id) },
  // The reasoner's thinking has its own rules for tool calls across steps,
  // which this does not handle yet.
  deepseek: { label: 'DeepSeek', kind: 'openai', base: 'https://api.deepseek.com', chatModel: (id) => !/reasoner/.test(id), sees: () => false },
};

class LlmHostError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    if (status) this.status = status;
  }
}

const fail = (code, message, status) => { throw new LlmHostError(code, message, status); };

function _provider(id) {
  if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(PROVIDERS, id)) fail('EINVAL', 'Unknown provider: ' + String(id));
  return PROVIDERS[id];
}

/* ── Key store ─────────────────────────────────────────────────────── */

function secureStoreAvailable(safe, platform = process.platform) {
  if (!safe || !safe.isEncryptionAvailable()) return false;
  if (platform === 'linux' && typeof safe.getSelectedStorageBackend === 'function') {
    const backend = safe.getSelectedStorageBackend();
    if (backend === 'basic_text' || backend === 'unknown') return false;
  }
  return true;
}

class KeyStore {
  constructor(file, safeStorage) {
    this.file = file;
    this.safe = safeStorage;
  }

  _available() { return secureStoreAvailable(this.safe); }

  _load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch { return {}; }
  }

  _save(data) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  has(provider) { return Object.prototype.hasOwnProperty.call(this._load(), provider); }

  get(provider) {
    const enc = this._load()[provider];
    if (!enc) return null;
    if (!this._available()) fail('ENOSTORE', 'This computer\'s key store is not available, so saved keys cannot be read.');
    try { return this.safe.decryptString(Buffer.from(enc, 'base64')); }
    catch { fail('ENOSTORE', 'The saved key could not be read. Add it again.'); }
  }

  set(provider, key) {
    if (!this._available()) fail('ENOSTORE', 'This computer has no secure key store available, so NICE will not save the key.');
    const data = this._load();
    data[provider] = this.safe.encryptString(key).toString('base64');
    this._save(data);
  }

  clear(provider) {
    const data = this._load();
    if (!(provider in data)) return false;
    delete data[provider];
    this._save(data);
    return true;
  }
}

/* ── HTTP ──────────────────────────────────────────────────────────── */

// Provider error messages sometimes quote part of the key; the page never
// gets one back.
function _redact(text, key) {
  let s = String(text || '');
  if (key) s = s.split(key).join('[key]');
  return s.replace(/\b(sk-[A-Za-z0-9_*-]{4,}|sk_[A-Za-z0-9_*-]{4,}|xai-[A-Za-z0-9_*-]{4,}|gsk_[A-Za-z0-9_*-]{4,}|AIza[A-Za-z0-9_*-]{4,})/g, '[key]');
}

function _errorFor(status, body, key, label) {
  let msg = '';
  try {
    const j = JSON.parse(body);
    const e = j && (j.error || j);
    msg = typeof e === 'string' ? e : (e && (e.message || e.msg)) || '';
  } catch { msg = String(body || '').slice(0, 300); }
  msg = _redact(msg, key).slice(0, 500);
  // Google answers a bad key with 400.
  if (status === 401 || status === 403 || (status === 400 && /api.?key/i.test(msg))) return new LlmHostError('EKEY', label + ' refused the key' + (msg ? ': ' + msg : '.'), status);
  if (status === 429) return new LlmHostError('ERATELIMIT', label + ' is rate limiting this key' + (msg ? ': ' + msg : '.'), status);
  if (status === 404) return new LlmHostError('ENOMODEL', label + ' does not have that model' + (msg ? ': ' + msg : '.'), status);
  return new LlmHostError('EPROVIDER', label + ' answered ' + status + (msg ? ': ' + msg : '.'), status);
}

async function _request(fetchFn, url, { method = 'GET', headers = {}, body, key, label }) {
  let res;
  try {
    res = await fetchFn(url, {
      method,
      headers: body ? { 'content-type': 'application/json', ...headers } : headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const timeout = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    fail(timeout ? 'ETIMEDOUT' : 'ENETWORK', timeout ? label + ' did not answer in time.' : 'Could not reach ' + label + ': ' + _redact(e && e.message, key));
  }
  const text = await res.text();
  if (!res.ok) throw _errorFor(res.status, text, key, label);
  try { return JSON.parse(text); }
  catch { fail('EPROVIDER', label + ' sent a reply that is not JSON.'); }
}

function _authHeaders(p, key) {
  if (p.kind === 'anthropic') return { 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION };
  if (p.kind === 'gemini') return { 'x-goog-api-key': key };
  return { authorization: 'Bearer ' + key };
}

/* ── Models ────────────────────────────────────────────────────────── */

async function listModels(fetchFn, providerId, key) {
  const p = _provider(providerId);
  const auth = { headers: _authHeaders(p, key), key, label: p.label };
  let models;
  if (p.kind === 'anthropic') {
    const r = await _request(fetchFn, p.base + '/models?limit=1000', auth);
    models = (r.data || []).map(m => ({ id: m.id, label: m.display_name || m.id }));
  } else if (p.kind === 'gemini') {
    const r = await _request(fetchFn, p.base + '/models?pageSize=1000', auth);
    models = (r.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent') && /^models\/gemini/.test(m.name || '')
        && !/(tts|image|embedding|live|native-audio)/.test(m.name))
      .map(m => ({ id: m.name.slice('models/'.length), label: m.displayName || m.name.slice('models/'.length) }));
  } else {
    const r = await _request(fetchFn, p.base + '/models', auth);
    models = (r.data || []).map(m => ({ id: m.id, label: m.id })).filter(m => !p.chatModel || p.chatModel(m.id));
  }
  return models
    .filter(m => typeof m.id === 'string' && m.id && m.id.length <= 200)
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(0, MAX_MODELS);
}

/* ── Requests ──────────────────────────────────────────────────────── */

const _parts = (content) => typeof content === 'string'
  ? (content ? [{ type: 'text', text: content }] : [])
  : (Array.isArray(content) ? content.filter(Boolean) : []);

const _resultText = (c) => typeof c === 'string' ? c : JSON.stringify(c == null ? '' : c);

function _dataUrl(url) {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(String(url || ''));
  return m ? { mime: m[1], data: m[2] } : null;
}

// What a provider cannot take (a PDF, audio, video, an image it was given
// by URL) becomes a line of text, so the model knows something was left out.
const _leftOut = (part) => ({ type: 'text', text: '[An attachment (' + (part.type || 'file') + ') was left out: this model was called with your own key, which sends text and images only.]' });

function _splitSystem(messages) {
  const system = [];
  const rest = [];
  for (const m of messages || []) {
    if (m && m.role === 'system') system.push(typeof m.content === 'string' ? m.content : _parts(m.content).map(p => p.text || '').join('\n'));
    else if (m && (m.role === 'user' || m.role === 'assistant')) rest.push(m);
  }
  return { system: system.filter(Boolean).join('\n\n'), messages: rest };
}

function _anthropicBody(model, body) {
  const { system, messages } = _splitSystem(body.messages);
  const out = {
    model,
    // Claude 3 models stop at 4096 output tokens; later ones take more.
    max_tokens: body.max_tokens || (/^claude-3-(haiku|opus|sonnet)/.test(model) ? 4096 : 8192),
    messages: messages.map(m => ({
      role: m.role,
      content: _parts(m.content).map(p => {
        if (p.type === 'text') return p.text ? { type: 'text', text: p.text } : null;
        if (p.type === 'tool_use') return { type: 'tool_use', id: p.id, name: p.name, input: p.input || {} };
        if (p.type === 'tool_result') return { type: 'tool_result', tool_use_id: p.tool_use_id, content: _resultText(p.content), ...(p.is_error ? { is_error: true } : {}) };
        if (p.type === 'image_url') {
          const d = _dataUrl(p.image_url && p.image_url.url);
          return d ? { type: 'image', source: { type: 'base64', media_type: d.mime, data: d.data } } : _leftOut(p);
        }
        return _leftOut(p);
      }).filter(Boolean),
    })).filter(m => m.content.length),
  };
  if (system) out.system = system;
  if (typeof body.temperature === 'number') out.temperature = body.temperature;
  if (Array.isArray(body.tools) && body.tools.length) {
    out.tools = body.tools.map(t => ({ name: t.name, description: t.description || '', input_schema: t.parameters || { type: 'object', properties: {} } }));
  }
  return out;
}

function _anthropicReply(r) {
  const content = (r.content || []).map(p => {
    if (p.type === 'text') return { type: 'text', text: p.text || '' };
    if (p.type === 'tool_use') return { type: 'tool_use', id: p.id, name: p.name, input: p.input || {} };
    return null;
  }).filter(Boolean);
  const stop = r.stop_reason === 'tool_use' ? 'tool_use' : r.stop_reason === 'max_tokens' ? 'max_tokens' : 'end_turn';
  const u = r.usage || {};
  return { content, stop_reason: stop, usage: { input_tokens: u.input_tokens || 0, output_tokens: u.output_tokens || 0 }, model: r.model };
}

function _openaiBody(p, model, body) {
  const { system, messages } = _splitSystem(body.messages);
  const out = [];
  if (system) out.push({ role: 'system', content: system });
  for (const m of messages) {
    const parts = _parts(m.content);
    if (m.role === 'assistant') {
      const text = parts.filter(x => x.type === 'text').map(x => x.text).join('\n');
      const calls = parts.filter(x => x.type === 'tool_use').map(x => ({
        id: x.id, type: 'function', function: { name: x.name, arguments: JSON.stringify(x.input || {}) },
      }));
      if (!text && !calls.length) continue;
      out.push({ role: 'assistant', content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
      continue;
    }
    // A user turn: tool results go first as their own messages, then the rest.
    for (const x of parts.filter(x => x.type === 'tool_result')) {
      out.push({ role: 'tool', tool_call_id: x.tool_use_id, content: _resultText(x.content) });
    }
    const rest = parts.filter(x => x.type !== 'tool_result').map(x => {
      if (x.type === 'text') return x.text ? { type: 'text', text: x.text } : null;
      if (x.type === 'image_url' && x.image_url && x.image_url.url) return { type: 'image_url', image_url: { url: x.image_url.url } };
      return _leftOut(x);
    }).filter(Boolean);
    if (!rest.length) continue;
    out.push({ role: 'user', content: rest.every(x => x.type === 'text') ? rest.map(x => x.text).join('\n') : rest });
  }
  const req = { model, messages: out };
  // OpenAI's reasoning models take max_completion_tokens and only the
  // default temperature.
  const reasoning = p.newParams && /^(o\d|gpt-5)/.test(model);
  // Reasoning spends from the same budget as the answer.
  // Older GPT-4 and 3.5 models stop at 4096.
  const maxOut = body.max_tokens || (reasoning ? 32000 : /^gpt-(3\.5|4)(-turbo|-\d|$)/.test(model) ? 4096 : 8192);
  req[p.newParams ? 'max_completion_tokens' : 'max_tokens'] = maxOut;
  if (typeof body.temperature === 'number' && !reasoning) req.temperature = body.temperature;
  if (Array.isArray(body.tools) && body.tools.length) {
    req.tools = body.tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description || '', parameters: t.parameters || { type: 'object', properties: {} } } }));
  }
  return req;
}

function _openaiReply(r) {
  const choice = (r.choices || [])[0] || {};
  const msg = choice.message || {};
  const content = [];
  if (typeof msg.content === 'string' && msg.content) content.push({ type: 'text', text: msg.content });
  (msg.tool_calls || []).forEach((c, i) => {
    if (!c || !c.function) return;
    let input = {};
    try { input = JSON.parse(c.function.arguments || '{}') || {}; } catch { input = {}; }
    content.push({ type: 'tool_use', id: c.id || 'call_' + i, name: c.function.name, input });
  });
  const hasCalls = content.some(x => x.type === 'tool_use');
  const stop = hasCalls ? 'tool_use' : choice.finish_reason === 'length' ? 'max_tokens' : 'end_turn';
  const u = r.usage || {};
  return { content, stop_reason: stop, usage: { input_tokens: u.prompt_tokens || 0, output_tokens: u.completion_tokens || 0 }, model: r.model };
}

function _geminiBody(body, model) {
  const { system, messages } = _splitSystem(body.messages);
  // Gemini answers a function call by its name, not an id.
  const names = new Map();
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: _parts(m.content).map(p => {
      if (p.type === 'text') return p.text ? { text: p.text } : null;
      if (p.type === 'tool_use') {
        names.set(p.id, p.name);
        return { functionCall: { name: p.name, args: p.input || {} }, ...(p.signature ? { thoughtSignature: p.signature } : {}) };
      }
      if (p.type === 'tool_result') {
        return { functionResponse: { name: p.name || names.get(p.tool_use_id) || 'tool', response: { content: _resultText(p.content) } } };
      }
      if (p.type === 'image_url') {
        const d = _dataUrl(p.image_url && p.image_url.url);
        return d ? { inlineData: { mimeType: d.mime, data: d.data } } : { text: _leftOut(p).text };
      }
      return { text: _leftOut(p).text };
    }).filter(Boolean),
  })).filter(c => c.parts.length);
  const out = { contents, generationConfig: {} };
  if (system) out.systemInstruction = { parts: [{ text: system }] };
  // Gemini 3 is meant to run at its default temperature.
  if (typeof body.temperature === 'number' && !/^gemini-3/.test(String(model || ''))) out.generationConfig.temperature = body.temperature;
  // Thinking models (2.5 and later) spend from the same budget as the answer.
  out.generationConfig.maxOutputTokens = body.max_tokens || (/^gemini-(2\.5|[3-9])/.test(String(model || '')) ? 32768 : 8192);
  if (Array.isArray(body.tools) && body.tools.length) {
    out.tools = [{ functionDeclarations: body.tools.map(t => ({ name: t.name, description: t.description || '', ...(t.parameters ? { parameters: t.parameters } : {}) })) }];
  }
  return out;
}

function _geminiReply(r, model) {
  if (!(r.candidates || []).length && r.promptFeedback && r.promptFeedback.blockReason) {
    fail('EPROVIDER', 'Google Gemini declined the request (' + r.promptFeedback.blockReason + ').');
  }
  const cand = (r.candidates || [])[0] || {};
  const content = [];
  ((cand.content && cand.content.parts) || []).forEach((p, i) => {
    if (p.thought) return;
    if (typeof p.text === 'string' && p.text) content.push({ type: 'text', text: p.text });
    else if (p.functionCall) {
      content.push({
        type: 'tool_use', id: 'call_' + i + '_' + Date.now().toString(36), name: p.functionCall.name, input: p.functionCall.args || {},
        ...(p.thoughtSignature ? { signature: p.thoughtSignature } : {}),
      });
    }
  });
  if (!content.length && cand.finishReason && cand.finishReason !== 'STOP' && cand.finishReason !== 'MAX_TOKENS') {
    fail('EPROVIDER', 'Google Gemini stopped without an answer (' + cand.finishReason + ').');
  }
  const hasCalls = content.some(x => x.type === 'tool_use');
  const stop = hasCalls ? 'tool_use' : cand.finishReason === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn';
  const u = r.usageMetadata || {};
  return { content, stop_reason: stop, usage: { input_tokens: u.promptTokenCount || 0, output_tokens: u.candidatesTokenCount || 0 }, model: r.modelVersion || model };
}

/** 'byo:<provider>:<model>' → { provider, model }. The model id may hold ':'. */
function parseModel(id) {
  const m = /^byo:([a-z]+):(.+)$/.exec(String(id || ''));
  if (!m || !Object.prototype.hasOwnProperty.call(PROVIDERS, m[1])) fail('EINVAL', 'Not a model on your own key: ' + String(id));
  return { provider: m[1], model: m[2] };
}

/** The request with each image part replaced by a line saying the model can't see it. */
function _withoutImages(body, model) {
  const note = { type: 'text', text: '[An image was left out: ' + model + ' cannot see images.]' };
  return {
    ...body,
    messages: body.messages.map(m => (m && Array.isArray(m.content) && m.content.some(p => p && p.type === 'image_url'))
      ? { ...m, content: m.content.map(p => (p && p.type === 'image_url' ? note : p)) }
      : m),
  };
}

async function chat(fetchFn, store, body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.messages)) fail('EINVAL', 'A chat request needs messages.');
  if (Buffer.byteLength(JSON.stringify(body)) > MAX_BODY_BYTES) fail('ETOOBIG', 'This conversation is too large to send.');
  const { provider, model } = parseModel(body.model);
  const p = PROVIDERS[provider];
  const key = store.get(provider);
  if (!key) fail('ENOKEY', 'There is no ' + p.label + ' key. Add one in API keys.');
  if (p.sees && !p.sees(model)) body = _withoutImages(body, model);
  const auth = { method: 'POST', headers: _authHeaders(p, key), key, label: p.label };
  if (p.kind === 'anthropic') {
    return _anthropicReply(await _request(fetchFn, p.base + '/messages', { ...auth, body: _anthropicBody(model, body) }));
  }
  if (p.kind === 'gemini') {
    const url = p.base + '/models/' + encodeURIComponent(model) + ':generateContent';
    return _geminiReply(await _request(fetchFn, url, { ...auth, body: _geminiBody(body, model) }), model);
  }
  return _openaiReply(await _request(fetchFn, p.base + '/chat/completions', { ...auth, body: _openaiBody(p, model, body) }));
}

/* ── The host the IPC handlers call ────────────────────────────────── */

function createLlmHost({ file, safeStorage, fetch: fetchFn = globalThis.fetch }) {
  const store = new KeyStore(file, safeStorage);
  return {
    /** [{ id, label, hasKey }]; never a key. */
    providers: () => Object.entries(PROVIDERS).map(([id, p]) => ({ id, label: p.label, hasKey: store.has(id) })),
    /** Checks the key by listing the provider's models, then saves it. Resolves to the models. */
    async setKey(providerId, key) {
      _provider(providerId);
      const k = typeof key === 'string' ? key.trim() : '';
      if (k.length < 8 || k.length > 1024 || /\s/.test(k)) fail('EINVAL', 'That does not look like an API key.');
      if (!secureStoreAvailable(safeStorage)) fail('ENOSTORE', 'This computer has no secure key store available, so NICE will not save the key.');
      const models = await listModels(fetchFn, providerId, k);
      store.set(providerId, k);
      return models;
    },
    clearKey: (providerId) => { _provider(providerId); return store.clear(providerId); },
    async models(providerId) {
      _provider(providerId);
      const key = store.get(providerId);
      if (!key) fail('ENOKEY', 'There is no ' + PROVIDERS[providerId].label + ' key.');
      return listModels(fetchFn, providerId, key);
    },
    chat: (body) => chat(fetchFn, store, body),
  };
}

module.exports = { createLlmHost, KeyStore, secureStoreAvailable, LlmHostError, PROVIDERS, parseModel, _redact, _anthropicBody, _openaiBody, _geminiBody, _anthropicReply, _openaiReply, _geminiReply };
