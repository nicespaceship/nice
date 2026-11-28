/**
 * ChatStore (lib/chat-store.js): the NICE chat app's projects, chats and
 * messages. Pinned here:
 *   - each account on the device has its own record (and guests theirs),
 *   - chats sit in a project or loose, newest first; a project goes with its chats,
 *   - a chat takes its first prompt as its title, names are trimmed and capped,
 *   - a reply left pending by a closed page reads as stopped on the next load,
 *   - a broken record starts empty instead of throwing,
 *   - every change fires the event.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installViewMocks, loadModule } from './helpers/view-harness.js';

installViewMocks();
loadModule('lib/chat-store.js');

beforeEach(() => {
  localStorage.clear();
  State.set('user', { id: 'u1' });
  ChatStore._reset();
});

describe('ChatStore', () => {
  it('keeps each account in its own record', () => {
    ChatStore.createProject('Mine');
    expect(JSON.parse(localStorage.getItem('nice-chats-u1')).projects).toHaveLength(1);
    State.set('user', { id: 'u2' });
    expect(ChatStore.projects()).toEqual([]);
    State.set('user', null);
    expect(ChatStore.projects()).toEqual([]);
    ChatStore.createChat();
    expect(JSON.parse(localStorage.getItem('nice-chats-guest')).chats).toHaveLength(1);
    State.set('user', { id: 'u1' });
    expect(ChatStore.projects().map(p => p.name)).toEqual(['Mine']);
  });

  it('lists a project’s chats apart from the loose ones, newest first', () => {
    const p = ChatStore.createProject('Launch');
    const a = ChatStore.createChat({ projectId: p.id });
    const b = ChatStore.createChat();
    const c = ChatStore.createChat({ projectId: p.id });
    ChatStore.addMessage(a.id, { role: 'user', text: 'later' });
    expect(ChatStore.chats(p.id).map(x => x.id)).toEqual([a.id, c.id]);
    expect(ChatStore.chats(null).map(x => x.id)).toEqual([b.id]);
    expect(ChatStore.chats()).toHaveLength(3);
  });

  it('puts a chat for a project that is gone with the loose chats', () => {
    const c = ChatStore.createChat({ projectId: 'nope' });
    expect(c.project_id).toBeNull();
  });

  it('deletes a project with its chats and their messages', () => {
    const p = ChatStore.createProject('Launch');
    const a = ChatStore.createChat({ projectId: p.id });
    const b = ChatStore.createChat();
    ChatStore.addMessage(a.id, { role: 'user', text: 'hi' });
    expect(ChatStore.deleteProject(p.id)).toBe(true);
    expect(ChatStore.project(p.id)).toBeNull();
    expect(ChatStore.chat(a.id)).toBeNull();
    expect(ChatStore.messages(a.id)).toEqual([]);
    expect(ChatStore.chat(b.id)).toBeTruthy();
    expect(ChatStore.deleteProject(p.id)).toBe(false);
  });

  it('titles a chat from its first prompt, trimmed and capped', () => {
    const c = ChatStore.createChat();
    ChatStore.addMessage(c.id, { role: 'user', text: '  Plan   the\nlaunch  ' + 'x'.repeat(100) });
    ChatStore.addMessage(c.id, { role: 'user', text: 'second' });
    const title = ChatStore.chat(c.id).title;
    expect(title.startsWith('Plan the launch')).toBe(true);
    expect(title).toHaveLength(ChatStore.TITLE_MAX);
  });

  it('renames only to a real name', () => {
    const p = ChatStore.createProject('');
    expect(p.name).toBe('New project');
    ChatStore.renameProject(p.id, '   ');
    expect(ChatStore.project(p.id).name).toBe('New project');
    ChatStore.renameProject(p.id, ' Q1 "launch" ');
    expect(ChatStore.project(p.id).name).toBe('Q1 "launch"');
    const c = ChatStore.createChat();
    ChatStore.renameChat(c.id, 'Budget');
    expect(ChatStore.chat(c.id).title).toBe('Budget');
  });

  it('updates a reply in place and removes one', () => {
    const c = ChatStore.createChat();
    const m = ChatStore.addMessage(c.id, { role: 'assistant', text: '', model: 'gemini-2-5-flash', status: 'pending' });
    ChatStore.updateMessage(c.id, m.id, { text: 'Done', status: null });
    expect(ChatStore.messages(c.id)[0]).toMatchObject({ text: 'Done', model: 'gemini-2-5-flash' });
    expect(ChatStore.messages(c.id)[0].status).toBeUndefined();
    expect(ChatStore.removeMessage(c.id, m.id)).toBe(true);
    expect(ChatStore.messages(c.id)).toEqual([]);
  });

  it('reads a reply a closed page left pending as stopped', () => {
    const c = ChatStore.createChat();
    ChatStore.addMessage(c.id, { role: 'assistant', text: '', status: 'pending' });
    ChatStore._reset();
    ChatStore.init();
    expect(ChatStore.messages(c.id)[0].status).toBe('stopped');
  });

  it('starts empty when the saved record is broken', () => {
    localStorage.setItem('nice-chats-u1', '{not json');
    expect(ChatStore.projects()).toEqual([]);
    ChatStore._reset();
    localStorage.setItem('nice-chats-u1', JSON.stringify({ v: 1, projects: 'x' }));
    expect(ChatStore.chats()).toEqual([]);
  });

  it('fires its event on every change', () => {
    const seen = vi.fn();
    document.addEventListener(ChatStore.EVENT, seen);
    const p = ChatStore.createProject('A');
    const c = ChatStore.createChat({ projectId: p.id });
    ChatStore.addMessage(c.id, { role: 'user', text: 'hi' });
    ChatStore.deleteChat(c.id);
    document.removeEventListener(ChatStore.EVENT, seen);
    expect(seen.mock.calls.map(([e]) => e.detail.type)).toEqual(['project', 'chat', 'message', 'chat']);
  });
});
