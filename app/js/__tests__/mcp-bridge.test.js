/**
 * McpBridge tool registration — the contract between McpBridge and
 * ToolRegistry that AgentExecutor + the LLM rely on for short-name
 * resolution. Pins down the fix for the 2026-04-23 smoke test where
 * agents couldn't find MCP tools by their short names.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));

function loadLibGlobal(rel) {
  let code = readFileSync(resolve(__dirname_local, '..', rel), 'utf-8');
  code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(code);
}

// Minimal globals. State is the only runtime dependency beyond
// ToolRegistry; McpBridge.loadTools reads mcp_connections from it.
globalThis.State = (() => {
  const data = {};
  return {
    get: (k) => data[k],
    set: (k, v) => { data[k] = v; },
    on: () => {}, off: () => {},
    _reset: () => { Object.keys(data).forEach(k => delete data[k]); },
  };
})();
globalThis.SB = { functions: { invoke: vi.fn() } };

loadLibGlobal('lib/tool-registry.js');
loadLibGlobal('lib/mcp-bridge.js');

describe('McpBridge.loadTools — short-name resolution for agents', () => {
  beforeEach(() => {
    // Clear registry between tests by re-loading the module fresh.
    // ToolRegistry keeps state between calls, so we unload first.
    if (typeof McpBridge?.unloadTools === 'function') McpBridge.unloadTools();
    State.set('mcp_connections', [
      {
        id: 'conn-gmail-1',
        name: 'Gmail',
        catalog_id: 'google-gmail',
        status: 'connected',
        available_tools: ['gmail_search_messages', 'gmail_create_draft'],
        tool_definitions: {},
      },
    ]);
  });

  it('registers tools with the bare short name as display name', () => {
    McpBridge.loadTools();
    const tool = ToolRegistry.resolve('gmail_create_draft');
    expect(tool).toBeTruthy();
    expect(tool.id).toBe('mcp:google-gmail:gmail_create_draft');
    expect(tool.name).toBe('gmail_create_draft');
  });

  it('resolves by short name even when a tool was previously registered with a prefixed name', () => {
    // Regression guard: an agent passes config.tools=['gmail_create_draft']
    // and AgentExecutor calls ToolRegistry.resolve on each. Before the
    // fix this returned null and the ReAct loop fell through to the
    // LLM, which role-played the tool call in text.
    McpBridge.loadTools();
    expect(ToolRegistry.resolve('gmail_create_draft')).toBeTruthy();
    expect(ToolRegistry.resolve('gmail_search_messages')).toBeTruthy();
  });

  it('resolves by prefixed id too (explicit tool id path)', () => {
    McpBridge.loadTools();
    expect(ToolRegistry.resolve('mcp:google-gmail:gmail_create_draft')).toBeTruthy();
  });

  it('registers an explicit short-name alias so later conflicting registrations do not break resolution', () => {
    McpBridge.loadTools();
    // Simulate another MCP also registering a tool named 'gmail_create_draft'
    // under a different prefix. Our explicit alias from the first
    // registration should still win.
    ToolRegistry.register({
      id: 'mcp:someother:gmail_create_draft',
      name: 'gmail_create_draft',
      description: 'collision',
      schema: {},
      execute: async () => null,
    });
    const tool = ToolRegistry.resolve('gmail_create_draft');
    expect(tool.id).toBe('mcp:google-gmail:gmail_create_draft');
  });

  it('unloadTools removes the registered tools', () => {
    McpBridge.loadTools();
    expect(ToolRegistry.resolve('gmail_create_draft')).toBeTruthy();
    McpBridge.unloadTools();
    expect(ToolRegistry.resolve('gmail_create_draft')).toBeNull();
  });

  it('skips disconnected connections', () => {
    State.set('mcp_connections', [
      { id: 'conn-1', name: 'Gmail', catalog_id: 'google-gmail', status: 'disconnected', available_tools: ['gmail_create_draft'] },
    ]);
    McpBridge.loadTools();
    expect(ToolRegistry.resolve('gmail_create_draft')).toBeNull();
  });
});
