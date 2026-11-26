// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { createLlmHost, parseModel, _redact, secureStoreAvailable, _anthropicBody, _openaiBody, _geminiBody, PROVIDERS } = require('../llm-host.js');

// Stands in for Electron's safeStorage: reversible, but never the plain key.
const safe = (available = true) => ({
  isEncryptionAvailable: () => available,
  encryptString: (s) => Buffer.from('enc:' + Buffer.from(s).toString('hex')),
  decryptString: (b) => Buffer.from(b.toString().slice(4), 'hex').toString(),
});

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });

let tmp, file;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nice-llm-')); file = path.join(tmp, 'keys.json'); });
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const KEY = 'sk-ant-test-1234567890';

function hostWith(responder, { available = true } = {}) {
  const fetch = vi.fn(async (url, init) => responder(url, init));
  return { fetch, host: createLlmHost({ file, safeStorage: safe(available), fetch }) };
}

const messages = [
  { role: 'system', content: 'Be brief.' },
  { role: 'user', content: 'fix it' },
  { role: 'assistant', content: [{ type: 'text', text: 'Reading.' }, { type: 'tool_use', id: 't1', name: 'read_file', input: { path: 'a.js' } }] },
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', name: 'read_file', content: '{"content":"x"}' }] },
];
const tools = [{ name: 'read_file', description: 'Read', parameters: { type: 'object', properties: { path: { type: 'string' } } } }];

describe('keys', () => {
  it('checks a key with the provider, saves it encrypted, and never hands it back', async () => {
    const { fetch, host } = hostWith(() => json(200, { data: [{ id: 'claude-x', display_name: 'Claude X' }] }));
    const models = await host.setKey('anthropic', '  ' + KEY + ' ');
    expect(models).toEqual([{ id: 'claude-x', label: 'Claude X' }]);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/models?limit=1000');
    expect(init.headers['x-api-key']).toBe(KEY);
    const saved = fs.readFileSync(file, 'utf8');
    expect(saved).not.toContain(KEY);
    expect((fs.statSync(file).mode & 0o777).toString(8)).toBe('600');
    const list = host.providers();
    expect(list.find(p => p.id === 'anthropic')).toEqual({ id: 'anthropic', label: 'Anthropic', hasKey: true });
    expect(JSON.stringify(list)).not.toContain(KEY);
    expect(host.clearKey('anthropic')).toBe(true);
    expect(host.providers().find(p => p.id === 'anthropic').hasKey).toBe(false);
  });

  it('does not save a key the provider refuses', async () => {
    const { host } = hostWith(() => json(401, { error: { message: 'invalid x-api-key ' + KEY } }));
    await expect(host.setKey('anthropic', KEY)).rejects.toMatchObject({ code: 'EKEY', status: 401 });
    await expect(host.setKey('anthropic', KEY)).rejects.toThrow(/\[key\]/);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('saves nothing without a secure key store', async () => {
    const { fetch, host } = hostWith(() => json(200, { data: [] }), { available: false });
    await expect(host.setKey('openai', 'sk-abcdefgh12345')).rejects.toMatchObject({ code: 'ENOSTORE' });
    expect(fetch).not.toHaveBeenCalled();
    expect(fs.existsSync(file)).toBe(false);
  });

  it('refuses unknown providers and things that are not keys', async () => {
    const { host } = hostWith(() => json(200, {}));
    await expect(host.setKey('nope', KEY)).rejects.toMatchObject({ code: 'EINVAL' });
    await expect(host.setKey('openai', 'short')).rejects.toMatchObject({ code: 'EINVAL' });
    await expect(host.setKey('openai', 'has a space in it')).rejects.toMatchObject({ code: 'EINVAL' });
    expect(() => host.clearKey('__proto__')).toThrow();
  });

  it('lists only chat models for OpenAI and Gemini', async () => {
    const { host } = hostWith((url) => url.includes('openai')
      ? json(200, { data: [{ id: 'gpt-5' }, { id: 'text-embedding-3' }, { id: 'gpt-4o-realtime' }, { id: 'o3' }, { id: 'dall-e-3' }] })
      : json(200, { models: [
        { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
      ] }));
    expect((await host.setKey('openai', 'sk-abcdefgh12345')).map(m => m.id)).toEqual(['gpt-5', 'o3']);
    expect(await host.setKey('google', 'AIzaabcdefgh12345')).toEqual([{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' }]);
  });
});

describe('chat', () => {
  async function chatWith(provider, reply, body) {
    const { fetch, host } = hostWith(() => json(200, { data: [], models: [] }));
    await host.setKey(provider, provider === 'google' ? 'AIzaabcdefgh12345' : 'sk-abcdefgh12345');
    fetch.mockImplementation(async () => json(200, reply));
    const out = await host.chat({ messages, tools, temperature: 0.3, max_tokens: 1000, ...body });
    return { out, url: fetch.mock.calls[1][0], sent: JSON.parse(fetch.mock.calls[1][1].body), headers: fetch.mock.calls[1][1].headers };
  }

  it('speaks Anthropic', async () => {
    const { out, url, sent } = await chatWith('anthropic', {
      model: 'claude-x', stop_reason: 'tool_use', usage: { input_tokens: 5, output_tokens: 2 },
      content: [{ type: 'thinking', thinking: '…' }, { type: 'text', text: 'Editing.' }, { type: 'tool_use', id: 't2', name: 'edit_file', input: { path: 'a.js' } }],
    }, { model: 'byo:anthropic:claude-x' });
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(sent.system).toBe('Be brief.');
    expect(sent.messages.map(m => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(sent.messages[2].content[0]).toEqual({ type: 'tool_result', tool_use_id: 't1', content: '{"content":"x"}' });
    expect(sent.tools[0].input_schema).toEqual(tools[0].parameters);
    expect(out).toEqual({
      content: [{ type: 'text', text: 'Editing.' }, { type: 'tool_use', id: 't2', name: 'edit_file', input: { path: 'a.js' } }],
      stop_reason: 'tool_use', usage: { input_tokens: 5, output_tokens: 2 }, model: 'claude-x',
    });
  });

  it('speaks OpenAI chat completions, with reasoning-model parameters', async () => {
    const { out, url, sent, headers } = await chatWith('openai', {
      model: 'gpt-5', usage: { prompt_tokens: 7, completion_tokens: 3 },
      choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'run_command', arguments: '{"command":"npm test"}' } }] } }],
    }, { model: 'byo:openai:gpt-5' });
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(headers.authorization).toBe('Bearer sk-abcdefgh12345');
    expect(sent.messages.map(m => m.role)).toEqual(['system', 'user', 'assistant', 'tool']);
    expect(sent.messages[2].tool_calls[0]).toEqual({ id: 't1', type: 'function', function: { name: 'read_file', arguments: '{"path":"a.js"}' } });
    expect(sent.messages[3]).toEqual({ role: 'tool', tool_call_id: 't1', content: '{"content":"x"}' });
    expect(sent.max_completion_tokens).toBe(1000);
    expect(sent.temperature).toBeUndefined();
    expect(out.content).toEqual([{ type: 'tool_use', id: 'c1', name: 'run_command', input: { command: 'npm test' } }]);
    expect(out.stop_reason).toBe('tool_use');
    expect(out.usage).toEqual({ input_tokens: 7, output_tokens: 3 });
  });

  it('speaks Gemini and carries the thought signature of a call back', async () => {
    const { out, url, sent, headers } = await chatWith('google', {
      modelVersion: 'gemini-2.5-flash', usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 1 },
      candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'hmm' }, { functionCall: { name: 'list_files', args: {} }, thoughtSignature: 'sig1' }] } }],
    }, { model: 'byo:google:gemini-2.5-flash', messages: [...messages, { role: 'assistant', content: [{ type: 'tool_use', id: 't9', name: 'list_files', input: {}, signature: 'sig0' }] }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't9', content: '[]' }] }] });
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    expect(url).not.toContain('key=');
    expect(headers['x-goog-api-key']).toBe('AIzaabcdefgh12345');
    expect(sent.systemInstruction).toEqual({ parts: [{ text: 'Be brief.' }] });
    expect(sent.contents.map(c => c.role)).toEqual(['user', 'model', 'user', 'model', 'user']);
    expect(sent.contents[3].parts[0]).toEqual({ functionCall: { name: 'list_files', args: {} }, thoughtSignature: 'sig0' });
    expect(sent.contents[4].parts[0]).toEqual({ functionResponse: { name: 'list_files', response: { content: '[]' } } });
    expect(sent.tools[0].functionDeclarations[0].name).toBe('read_file');
    expect(out.content).toHaveLength(1);
    expect(out.content[0]).toMatchObject({ type: 'tool_use', name: 'list_files', signature: 'sig1' });
    expect(out.stop_reason).toBe('tool_use');
  });

  it('turns what it cannot send into a note', async () => {
    const { sent } = await chatWith('anthropic', { content: [], stop_reason: 'end_turn' }, {
      model: 'byo:anthropic:claude-x', tools: [],
      messages: [{ role: 'user', content: [{ type: 'text', text: 'see' }, { type: 'document', document: { url: 'data:application/pdf;base64,AA' } }, { type: 'image_url', image_url: { url: 'data:image/png;base64,QUJD' } }] }],
    });
    const parts = sent.messages[0].content;
    expect(parts[1].text).toMatch(/left out/);
    expect(parts[2]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'QUJD' } });
    expect(sent.tools).toBeUndefined();
  });

  it('says when there is no key, and refuses ids that are not own-key models', async () => {
    const { fetch, host } = hostWith(() => json(200, {}));
    await expect(host.chat({ model: 'byo:openai:gpt-5', messages })).rejects.toMatchObject({ code: 'ENOKEY' });
    await expect(host.chat({ model: 'gemini-2-5-flash', messages })).rejects.toMatchObject({ code: 'EINVAL' });
    await expect(host.chat({ model: 'byo:evil:x', messages })).rejects.toMatchObject({ code: 'EINVAL' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('codes rate limits and missing models so the caller can retry or say so', async () => {
    const { fetch, host } = hostWith(() => json(200, { data: [] }));
    await host.setKey('openai', 'sk-abcdefgh12345');
    fetch.mockImplementationOnce(async () => json(429, { error: { message: 'slow down' } }));
    await expect(host.chat({ model: 'byo:openai:gpt-5', messages })).rejects.toMatchObject({ code: 'ERATELIMIT', status: 429 });
    fetch.mockImplementationOnce(async () => json(404, { error: { message: 'no such model' } }));
    await expect(host.chat({ model: 'byo:openai:gpt-9', messages })).rejects.toMatchObject({ code: 'ENOMODEL', status: 404 });
    fetch.mockImplementationOnce(async () => { throw Object.assign(new Error('timed out'), { name: 'TimeoutError' }); });
    await expect(host.chat({ model: 'byo:openai:gpt-5', messages })).rejects.toMatchObject({ code: 'ETIMEDOUT' });
  });
});

describe('provider rules', () => {
  it('refuses Linux\'s built-in-password store', () => {
    const s = { ...safe(), getSelectedStorageBackend: () => 'basic_text' };
    expect(secureStoreAvailable(s, 'linux')).toBe(false);
    expect(secureStoreAvailable({ ...safe(), getSelectedStorageBackend: () => 'gnome_libsecret' }, 'linux')).toBe(true);
    expect(secureStoreAvailable(s, 'darwin')).toBe(true);
    expect(secureStoreAvailable(safe(false), 'darwin')).toBe(false);
  });

  it('leaves out models the chat API cannot run', () => {
    const openai = PROVIDERS.openai.chatModel;
    expect(['gpt-5', 'gpt-5-mini', 'o3'].every(openai)).toBe(true);
    expect(['gpt-5-pro', 'o3-pro', 'gpt-5-codex', 'o3-deep-research'].some(openai)).toBe(false);
    expect(PROVIDERS.deepseek.chatModel('deepseek-reasoner')).toBe(false);
    expect(PROVIDERS.deepseek.chatModel('deepseek-chat')).toBe(true);
  });

  it('sets output limits each provider takes', () => {
    const msgs = [{ role: 'user', content: 'hi' }];
    expect(_anthropicBody('claude-3-haiku-20240307', { messages: msgs }).max_tokens).toBe(4096);
    expect(_anthropicBody('claude-sonnet-4-5', { messages: msgs }).max_tokens).toBe(8192);
    expect(_openaiBody(PROVIDERS.openai, 'o3', { messages: msgs }).max_completion_tokens).toBe(32000);
    expect(_openaiBody(PROVIDERS.groq, 'llama', { messages: msgs, temperature: 0.3 })).toMatchObject({ max_tokens: 8192, temperature: 0.3 });
    expect(_openaiBody(PROVIDERS.openai, 'gpt-4-turbo', { messages: msgs }).max_completion_tokens).toBe(4096);
    expect(_openaiBody(PROVIDERS.openai, 'gpt-4o', { messages: msgs }).max_completion_tokens).toBe(8192);
    expect(_geminiBody({ messages: msgs, temperature: 0.3 }, 'gemini-3-pro').generationConfig).toEqual({ maxOutputTokens: 32768 });
    expect(_geminiBody({ messages: msgs }, 'gemini-2.0-flash').generationConfig).toEqual({ maxOutputTokens: 8192 });
    expect(_geminiBody({ messages: msgs, temperature: 0.3 }, 'gemini-2.5-flash').generationConfig.temperature).toBe(0.3);
  });

  it('reads Google\'s 400 for a bad key as a refused key, and a blocked prompt as an error', async () => {
    const { fetch, host } = hostWith(() => json(400, { error: { message: 'API key not valid. Please pass a valid API key.' } }));
    await expect(host.setKey('google', 'AIzaabcdefgh12345')).rejects.toMatchObject({ code: 'EKEY' });
    fetch.mockImplementation(async () => json(200, { models: [] }));
    await host.setKey('google', 'AIzaabcdefgh12345');
    fetch.mockImplementation(async () => json(200, { promptFeedback: { blockReason: 'SAFETY' } }));
    await expect(host.chat({ model: 'byo:google:gemini-2.5-flash', messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow(/declined the request \(SAFETY\)/);
  });
});

describe('helpers', () => {
  it('parses own-key model ids, keeping colons in the model', () => {
    expect(parseModel('byo:groq:openai/gpt-oss-120b')).toEqual({ provider: 'groq', model: 'openai/gpt-oss-120b' });
    expect(parseModel('byo:openai:ft:gpt-4o:acme')).toEqual({ provider: 'openai', model: 'ft:gpt-4o:acme' });
  });
  it('redacts keys from provider messages', () => {
    expect(_redact('Incorrect API key provided: sk-proj-ab***xyz', null)).toBe('Incorrect API key provided: [key]');
    expect(_redact('bad secret123secret', 'secret123secret')).toBe('bad [key]');
  });
});
