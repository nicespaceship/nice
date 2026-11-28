/**
 * NiceChatView (#/, #/project/:id, #/chat/:id): the NICE chat app. Pinned here:
 *   - Home greets and offers quick starts; a project lists its chats,
 *   - a signed-out send asks for a sign-in and keeps the text,
 *   - a send from Home or a project makes a chat (in that project) and opens it,
 *   - the model gets the finished turns as history and the prompt on its own,
 *   - a failed reply says why and offers Retry; Stop drops the reply,
 *   - the model picked is the chat's and the next chat's,
 *   - everything user-written is escaped.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installViewMocks, loadModule } from './helpers/view-harness.js';

const mocks = installViewMocks();
if (!window.matchMedia) window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
if (!globalThis.CSS) globalThis.CSS = {};
if (!CSS.escape) CSS.escape = (s) => String(s).replace(/["\\]/g, '\\$&');
loadModule('lib/cselect.js');
loadModule('lib/chat-store.js');
loadModule('views/nice-chat.js');

globalThis.PromptPanel = { _md: (t) => `<p>${Utils.esc(t)}</p>` };
globalThis.SpaceCards = {
  available: () => ['gemini-2-5-flash', 'grok-4-3'],
  label: (id) => ({ 'gemini-2-5-flash': 'Gemini 2.5 Flash', 'grok-4-3': 'Grok 4.3' }[id] || id),
};
globalThis.AuthModal = { open: vi.fn() };

let path = '/';
let replies = [];   // what each converse().send resolves to, in order
let calls = [];     // { blueprint, opts, prompt }
let release = null; // set to hold the next reply until called

globalThis.AgentExecutor = {
  converse: (blueprint, opts) => ({
    send: async (prompt) => {
      calls.push({ blueprint, opts, prompt });
      if (release === 'hold') await new Promise(r => { release = r; });
      const next = replies.shift();
      if (next instanceof Error) throw next;
      return next || { text: 'ok', done: true };
    },
  }),
};

const flush = () => new Promise(r => setTimeout(r, 0));

let el;
function mount(p, params) {
  path = p;
  Router.path = () => path;
  el = document.createElement('div');
  document.body.appendChild(el);
  NiceChatView.render(el, params || {});
  return el;
}

function type(text) {
  const input = el.querySelector('#nc-input');
  input.value = text;
  input.dispatchEvent(new Event('input'));
  return input;
}
const send = () => el.querySelector('#nc-prompt').dispatchEvent(new Event('submit', { cancelable: true }));

beforeEach(() => {
  localStorage.clear();
  ChatStore._reset();
  NiceChatView._resetForTest();
  State.set('user', { id: 'u1', email: 'ben@test.com' });
  replies = [];
  calls = [];
  release = null;
  AuthModal.open.mockClear();
  // Router.navigate re-renders the way the router would.
  mocks.Router.navigate.mockImplementation((hash) => {
    NiceChatView.destroy();
    el.innerHTML = '';
    const m = hash.match(/^#\/(chat|project)\/(.+)$/);
    path = m ? `/${m[1]}/${decodeURIComponent(m[2])}` : '/';
    NiceChatView.render(el, m ? { id: decodeURIComponent(m[2]) } : {});
  });
});
afterEach(() => {
  NiceChatView.destroy();
  el?.remove();
});

describe('NiceChatView', () => {
  it('greets by name on Home with the quick starts', () => {
    mount('/');
    expect(el.querySelector('.nc-greeting').textContent).toMatch(/^Good (morning|afternoon|evening), ben$/);
    expect([...el.querySelectorAll('.nc-start')].map(b => b.textContent.trim())).toEqual(['Research', 'Write', 'Code', 'Analyze', 'Brainstorm', 'Plan']);
    el.querySelectorAll('.nc-start')[4].click();
    expect(el.querySelector('#nc-input').value).toBe('Brainstorm ideas for ');
  });

  it('asks a signed-out user to sign in and keeps the text', async () => {
    State.set('user', null);
    mount('/');
    type('Hello');
    send();
    await flush();
    expect(AuthModal.open).toHaveBeenCalledWith('Sign in to chat with Gemini 2.5 Flash');
    expect(el.querySelector('#nc-input').value).toBe('Hello');
    expect(ChatStore.chats()).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('makes a chat from Home, opens it, and shows the reply', async () => {
    mount('/');
    replies = [{ text: 'Hi **there**', done: true }];
    type('Hello');
    send();
    await flush();
    const [chat] = ChatStore.chats();
    expect(chat).toMatchObject({ title: 'Hello', project_id: null, model: 'gemini-2-5-flash' });
    expect(path).toBe('/chat/' + chat.id);
    expect(calls[0].prompt).toBe('Hello');
    expect(calls[0].opts.history).toEqual([]);
    expect(calls[0].opts.tools).toEqual([]);
    expect(calls[0].blueprint.config.llm_engine).toBe('gemini-2-5-flash');
    expect(el.querySelector('.nc-msg-assistant .nc-who').textContent).toBe('Gemini 2.5 Flash');
    expect(el.querySelector('.nc-msg-assistant .nc-md').textContent).toBe('Hi **there**');
    expect(el.querySelector('.nc-starts')).toBeNull();
  });

  it('starts a chat inside the project it was sent from, and lists it there', async () => {
    const p = ChatStore.createProject('Launch');
    mount('/project/' + p.id, { id: p.id });
    expect(el.querySelector('.nc-greeting').textContent).toBe('Launch');
    type('Plan it');
    send();
    await flush();
    expect(ChatStore.chats(p.id).map(c => c.title)).toEqual(['Plan it']);
    expect(el.querySelector('.nc-head-project').textContent).toBe('Launch');
    mocks.Router.navigate('#/project/' + p.id);
    expect([...el.querySelectorAll('.nc-chat-link span')].map(s => s.textContent)).toEqual(['Plan it']);
  });

  it('sends the finished turns as history, a failed turn riding with the next prompt', async () => {
    const c = ChatStore.createChat({ model: 'grok-4-3' });
    ChatStore.addMessage(c.id, { role: 'user', text: 'one' });
    ChatStore.addMessage(c.id, { role: 'assistant', text: 'first', model: 'grok-4-3' });
    ChatStore.addMessage(c.id, { role: 'user', text: 'two' });
    ChatStore.addMessage(c.id, { role: 'assistant', text: 'quota', model: 'grok-4-3', status: 'error' });
    mount('/chat/' + c.id, { id: c.id });
    type('three');
    send();
    await flush();
    // The unanswered "two" rides with "three", so the turns still alternate.
    expect(calls[0].opts.history).toEqual([
      { role: 'user', content: 'one' },
      { role: 'assistant', content: 'first' },
    ]);
    expect(calls[0].prompt).toBe('two\n\nthree');
    expect(calls[0].blueprint.config.llm_engine).toBe('grok-4-3');
  });

  it('says why a reply failed and retries it in place', async () => {
    const c = ChatStore.createChat();
    mount('/chat/' + c.id, { id: c.id });
    replies = [{ text: 'Error: Insufficient tokens', error: true }, { text: 'Second time', done: true }];
    type('Hi');
    send();
    await flush();
    const failed = el.querySelector('.nc-msg-assistant');
    expect(failed.querySelector('.nc-note').textContent).toBe('Insufficient tokens');
    failed.querySelector('[data-act="retry"]').click();
    await flush();
    const msgs = ChatStore.messages(c.id);
    expect(msgs).toHaveLength(2);
    expect(msgs[1]).toMatchObject({ text: 'Second time' });
    expect(calls[1].prompt).toBe('Hi');
    expect(calls[1].opts.history).toEqual([]);
  });

  it('shows a thrown failure as the reply', async () => {
    const c = ChatStore.createChat();
    mount('/chat/' + c.id, { id: c.id });
    replies = [new Error('Network down')];
    type('Hi');
    send();
    await flush();
    expect(ChatStore.messages(c.id)[1]).toMatchObject({ status: 'error', text: 'Network down' });
  });

  it('drops a reply that lands after Stop, and takes no second prompt meanwhile', async () => {
    const c = ChatStore.createChat();
    mount('/chat/' + c.id, { id: c.id });
    release = 'hold';
    replies = [{ text: 'too late', done: true }];
    type('Hi');
    send();
    await flush();
    expect(el.querySelector('.nc-working')).toBeTruthy();
    type('Again');
    send();
    await flush();
    expect(calls).toHaveLength(1);
    el.querySelector('#nc-stop').click();
    expect(ChatStore.messages(c.id)[1].status).toBe('stopped');
    release();
    await flush();
    expect(ChatStore.messages(c.id)[1]).toMatchObject({ status: 'stopped', text: '' });
    expect(el.querySelector('#nc-send')).toBeTruthy();
  });

  it('saves the model picked on the chat and for the next chat', () => {
    const c = ChatStore.createChat();
    mount('/chat/' + c.id, { id: c.id });
    const root = el.querySelector('#nc-model');
    root.querySelector('.bp-cselect-trigger').click();
    root.querySelector('.bp-cselect-option[data-value="grok-4-3"]').click();
    expect(ChatStore.chat(c.id).model).toBe('grok-4-3');
    expect(localStorage.getItem('nice-chat-model')).toBe('grok-4-3');
  });

  it('escapes what the user and the model wrote', async () => {
    const c = ChatStore.createChat();
    ChatStore.addMessage(c.id, { role: 'user', text: '<img src=x onerror=alert(1)> "q"' });
    ChatStore.addMessage(c.id, { role: 'assistant', text: 'boom', status: 'error' });
    ChatStore.renameChat(c.id, '<b>x</b>');
    mount('/chat/' + c.id, { id: c.id });
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('b')).toBeNull();
    expect(el.querySelector('.nc-bubble').textContent).toBe('<img src=x onerror=alert(1)> "q"');
    expect(el.querySelector('.nc-title').textContent).toBe('<b>x</b>');
  });

  it('says so when the chat is gone', () => {
    mount('/chat/nope', { id: 'nope' });
    expect(el.querySelector('.app-empty h2').textContent).toBe('This chat is gone');
  });
});
