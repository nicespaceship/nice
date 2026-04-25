import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('AgentExecutor', () => {
  describe('core API', () => {
    it('exposes execute and converse', () => {
      expect(typeof AgentExecutor.execute).toBe('function');
      expect(typeof AgentExecutor.converse).toBe('function');
    });
  });

  describe('converse', () => {
    it('returns a conversation controller with send, history, reset, getTokensUsed', () => {
      const controller = AgentExecutor.converse({
        id: 'test-agent',
        name: 'Test Agent',
        config: { role: 'General', tools: [] },
      });
      expect(typeof controller.send).toBe('function');
      expect(typeof controller.history).toBe('function');
      expect(typeof controller.reset).toBe('function');
      expect(typeof controller.getTokensUsed).toBe('function');
    });

    it('starts with empty history', () => {
      const controller = AgentExecutor.converse({
        id: 'test-agent-2',
        name: 'Test Agent 2',
        config: { role: 'General', tools: [] },
      });
      expect(controller.history()).toEqual([]);
      expect(controller.getTokensUsed()).toBe(0);
    });

    it('reset clears history and tokens', () => {
      const controller = AgentExecutor.converse({
        id: 'test-agent-3',
        name: 'Test Agent 3',
        config: { role: 'General', tools: [] },
      });
      controller.reset();
      expect(controller.history()).toEqual([]);
      expect(controller.getTokensUsed()).toBe(0);
    });
  });

  // ── Native tool-use end-to-end (the Microsoft 365 / Outlook regression
  // that motivated the converse() rewrite). These tests exercise the
  // full LLM → tool_use → tool_result → final answer loop with a mocked
  // SB.functions.invoke and verify both the network shape (tools array
  // present) and the side effects (tool execution, ship_log persistence,
  // history accumulation). ───────────────────────────────────────────
  describe('converse — native tool-use', () => {
    let _origSB;
    let _origShipLog;
    let _capturedRequests;
    let _scriptedResponses;
    let _toolCalls;
    let _logCalls;
    const TOOL_ID = 'mcp:test:outlook_search_messages';

    beforeEach(() => {
      _capturedRequests = [];
      _scriptedResponses = [];
      _toolCalls = [];
      _logCalls = [];

      _origSB = globalThis.SB;
      globalThis.SB = {
        functions: {
          invoke: async (_name, opts) => {
            _capturedRequests.push(opts?.body || null);
            const next = _scriptedResponses.shift();
            if (!next) throw new Error('No scripted response left');
            return { data: next, error: null };
          },
        },
      };

      _origShipLog = globalThis.ShipLog;
      globalThis.ShipLog = {
        append: (spaceshipId, payload) => {
          _logCalls.push({ spaceshipId, ...payload });
          return Promise.resolve({ id: 'sl-' + _logCalls.length });
        },
      };

      // Register a mock MCP-style tool. ToolRegistry.deregister is a
      // no-op when the id isn't present, so it's safe to register fresh
      // each test even if a prior run left it behind.
      ToolRegistry.deregister(TOOL_ID);
      ToolRegistry.register({
        id: TOOL_ID,
        name: 'outlook_search_messages',
        description: 'Search the user inbox',
        schema: { type: 'object', properties: { query: { type: 'string' } } },
        execute: async (input) => {
          _toolCalls.push(input);
          return [{ subject: 'Hello', from: 'a@b.com' }];
        },
      });
    });

    afterEach(() => {
      globalThis.SB = _origSB;
      globalThis.ShipLog = _origShipLog;
      ToolRegistry.deregister(TOOL_ID);
    });

    it('passes the tools schema to nice-ai when the agent has tools', async () => {
      _scriptedResponses.push({
        content: 'Final Answer: Inbox is empty.',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const controller = AgentExecutor.converse(
        { id: 'agent-tools-1', name: 'Outlook', config: { role: 'Assistant', tools: ['outlook_search_messages'] } },
        { tools: ['outlook_search_messages'], spaceshipId: 'ship-1' },
      );
      await controller.send('check inbox');

      expect(_capturedRequests.length).toBe(1);
      const req = _capturedRequests[0];
      expect(Array.isArray(req.tools)).toBe(true);
      expect(req.tools.length).toBeGreaterThan(0);
      expect(req.tools[0].name).toBe('outlook_search_messages');
      expect(req.tools[0].parameters).toEqual({ type: 'object', properties: { query: { type: 'string' } } });
    });

    it('executes a native tool_use block and loops with tool_result', async () => {
      // Turn 1 from LLM: native Anthropic-style tool_use block
      _scriptedResponses.push({
        content: [
          { type: 'text', text: 'Searching your inbox.' },
          { type: 'tool_use', id: 'tu-1', name: 'outlook_search_messages', input: { query: 'unread' } },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 50, output_tokens: 20 },
      });
      // Turn 2: final answer after the tool_result is fed back
      _scriptedResponses.push({
        content: 'Final Answer: Found 1 message from a@b.com titled "Hello".',
        stop_reason: 'end_turn',
        usage: { input_tokens: 80, output_tokens: 30 },
      });

      const controller = AgentExecutor.converse(
        { id: 'agent-tools-2', name: 'Outlook', config: { role: 'Assistant', tools: ['outlook_search_messages'] } },
        { tools: ['outlook_search_messages'], spaceshipId: 'ship-2' },
      );
      const result = await controller.send('search inbox for unread');

      // Tool actually executed with the LLM's input
      expect(_toolCalls.length).toBe(1);
      expect(_toolCalls[0]).toEqual({ query: 'unread' });

      // Two LLM calls: initial + after tool_result
      expect(_capturedRequests.length).toBe(2);
      const second = _capturedRequests[1];
      // Second call's last user message should be the tool_result echo
      const lastUser = second.messages[second.messages.length - 1];
      expect(lastUser.role).toBe('user');
      expect(Array.isArray(lastUser.content)).toBe(true);
      expect(lastUser.content[0].type).toBe('tool_result');
      expect(lastUser.content[0].tool_use_id).toBe('tu-1');

      // Final answer reached, `done: true`
      expect(result.done).toBe(true);
      expect(result.text).toContain('Found 1 message');

      // History records only the user message + final assistant text
      // (intermediate tool_use/tool_result stay inside the per-turn loop)
      const history = controller.history();
      expect(history.length).toBe(2);
      expect(history[0].role).toBe('user');
      expect(history[1].role).toBe('assistant');
      expect(history[1].content).toContain('Found 1 message');
    });

    it('persists tool_use and tool_result rows to ship_log', async () => {
      _scriptedResponses.push({
        content: [
          { type: 'text', text: 'Looking it up.' },
          { type: 'tool_use', id: 'tu-2', name: 'outlook_search_messages', input: {} },
        ],
        stop_reason: 'tool_use',
      });
      _scriptedResponses.push({
        content: 'Final Answer: All clear.',
        stop_reason: 'end_turn',
      });

      const controller = AgentExecutor.converse(
        { id: 'agent-tools-3', name: 'Outlook', config: { role: 'Assistant', tools: ['outlook_search_messages'] } },
        { tools: ['outlook_search_messages'], spaceshipId: 'ship-3' },
      );
      await controller.send('check it');

      const events = _logCalls.map(c => c.metadata?.event);
      expect(events).toContain('mission_start');
      expect(events).toContain('tool_use');
      expect(events).toContain('tool_result');
      expect(events).toContain('final_answer');

      // tool_use row carries the tool name + input
      const toolUseRow = _logCalls.find(c => c.metadata?.event === 'tool_use');
      expect(toolUseRow.metadata.tool_name).toBe('outlook_search_messages');
      expect(toolUseRow.metadata.tool_use_id).toBe('tu-2');
    });

    it('preserves history across turns and reuses it on the next send', async () => {
      _scriptedResponses.push({ content: 'Final Answer: Hi there.', stop_reason: 'end_turn' });
      _scriptedResponses.push({ content: 'Final Answer: Yes I do.', stop_reason: 'end_turn' });

      const controller = AgentExecutor.converse(
        { id: 'agent-tools-4', name: 'Chatty', config: { role: 'Assistant', tools: ['outlook_search_messages'] } },
        { tools: ['outlook_search_messages'], spaceshipId: 'ship-4' },
      );
      await controller.send('hello');
      await controller.send('do you remember me?');

      // Second turn must include the first turn's user + assistant
      // pairs in the messages payload.
      const secondReq = _capturedRequests[1];
      const roles = secondReq.messages.map(m => m.role);
      expect(roles[0]).toBe('system');
      // [system, user(hello), assistant(Hi there), user(do you remember me)]
      expect(roles.slice(1)).toEqual(['user', 'assistant', 'user']);

      // History reflects two complete turns
      const history = controller.history();
      expect(history.length).toBe(4);
    });

    it('gates side-effect tools through onApprovalNeeded in review mode', async () => {
      // Register a write tool — the SIDE_EFFECT_PATTERNS list catches "send".
      ToolRegistry.deregister('mcp:test:outlook_send_message');
      const sendCalls = [];
      ToolRegistry.register({
        id: 'mcp:test:outlook_send_message',
        name: 'outlook_send_message',
        description: 'Send mail',
        schema: { type: 'object', properties: {} },
        execute: async () => { sendCalls.push(1); return { ok: true }; },
      });

      _scriptedResponses.push({
        content: [
          { type: 'text', text: 'Sending the email.' },
          { type: 'tool_use', id: 'tu-3', name: 'outlook_send_message', input: { to: 'x' } },
        ],
        stop_reason: 'tool_use',
      });
      _scriptedResponses.push({
        content: 'Final Answer: Cancelled — user declined.',
        stop_reason: 'end_turn',
      });

      const approvalSeen = [];
      const controller = AgentExecutor.converse(
        { id: 'agent-tools-5', name: 'Mailer', config: { role: 'Assistant', tools: ['outlook_send_message'] } },
        {
          tools: ['outlook_send_message'],
          spaceshipId: 'ship-5',
          approvalMode: 'review',
          onApprovalNeeded: (action) => {
            approvalSeen.push(action.tool);
            return Promise.resolve(false); // deny
          },
        },
      );
      await controller.send('email Bob');

      expect(approvalSeen).toEqual(['outlook_send_message']);
      expect(sendCalls.length).toBe(0); // tool was NOT actually called

      ToolRegistry.deregister('mcp:test:outlook_send_message');
    });

    it('returns an error turn (does not throw) when the LLM call fails', async () => {
      const _SBsave = globalThis.SB;
      globalThis.SB = {
        functions: {
          invoke: async () => ({ data: null, error: { message: 'boom' } }),
        },
      };

      const controller = AgentExecutor.converse(
        { id: 'agent-tools-6', name: 'Broken', config: { role: 'Assistant', tools: ['outlook_search_messages'] } },
        { tools: ['outlook_search_messages'], spaceshipId: 'ship-6' },
      );
      const result = await controller.send('hi');

      expect(result.error).toBe(true);
      expect(result.done).toBe(false);
      expect(result.text).toMatch(/boom/);

      globalThis.SB = _SBsave;
    });
  });

  describe('_parseReActResponse (via structured JSON)', () => {
    // We test the parsing indirectly through the module's behavior
    // The structured JSON parser should handle these formats

    it('handles text-based ReAct format gracefully', () => {
      // AgentExecutor is loaded as a global IIFE — we can test it
      // by verifying it exists and has the expected API
      expect(AgentExecutor).toBeDefined();
    });
  });

  describe('classifyTool / _isSideEffectTool', () => {
    it('exposes the helpers on the module', () => {
      expect(typeof AgentExecutor.classifyTool).toBe('function');
      expect(typeof AgentExecutor._isSideEffectTool).toBe('function');
    });

    // The tools below cover every write tool currently seeded in
    // integrations.js. If any of these slip through the pattern list,
    // the Integrations UI will mislabel the pill AND the agent will
    // skip the approval gate in `review` mode, so the test is a real
    // safety rail against regressions.
    const WRITE_TOOLS = [
      // Gmail
      'gmail_send_message',
      'gmail_create_draft',
      'gmail_reply_message',
      // Calendar
      'calendar_create_event',
      'calendar_update_event',
      'calendar_delete_event',
      // Drive
      'drive_create_file',
      'drive_update_file',
      'drive_upload_file',
      // Outlook (Microsoft Graph)
      'outlook_send_message',
      'outlook_create_draft',
      'outlook_reply_message',
      // Calendar (Microsoft)
      'calendar_ms_create_event',
      'calendar_ms_update_event',
      'calendar_ms_delete_event',
      // OneDrive
      'onedrive_upload_file',
      'onedrive_update_file',
      // Social
      'social_create_post',
      'social_publish_post',
      'social_schedule_post',
      // Slack / generic
      'slack_send_message',
      'slack_post_message',
      // Payments (future — just make sure the pattern catches them)
      'stripe_create_charge',
      'stripe_refund_charge',
    ];

    const READ_TOOLS = [
      'gmail_search_messages',
      'gmail_read_message',
      'gmail_list_labels',
      'calendar_list_events',
      'calendar_get_event',
      'calendar_list_calendars',
      'drive_search_files',
      'drive_get_file',
      'drive_read_file',
      // Outlook (Microsoft Graph) read
      'outlook_search_messages',
      'outlook_read_message',
      'outlook_list_folders',
      // Calendar (Microsoft) read
      'calendar_ms_list_events',
      'calendar_ms_get_event',
      'calendar_ms_list_calendars',
      // Contacts (Microsoft) read — 'search' is a noun here, not a side-effect verb
      'contacts_ms_search',
      'contacts_ms_read',
      // OneDrive read
      'onedrive_search_files',
      'onedrive_get_file',
      'onedrive_read_file',
      'web_search',
      'calculator',
    ];

    WRITE_TOOLS.forEach(tool => {
      it('flags ' + tool + ' as a side-effect tool', () => {
        expect(AgentExecutor._isSideEffectTool(tool)).toBe(true);
        expect(AgentExecutor.classifyTool(tool)).toBe('write');
      });
    });

    READ_TOOLS.forEach(tool => {
      it('does not flag ' + tool + ' as a side-effect tool', () => {
        expect(AgentExecutor._isSideEffectTool(tool)).toBe(false);
        expect(AgentExecutor.classifyTool(tool)).toBe('read');
      });
    });

    it('handles empty and malformed tool IDs', () => {
      expect(AgentExecutor._isSideEffectTool('')).toBe(false);
      expect(AgentExecutor._isSideEffectTool(null)).toBe(false);
      expect(AgentExecutor._isSideEffectTool(undefined)).toBe(false);
      expect(AgentExecutor._isSideEffectTool(42)).toBe(false);
      expect(AgentExecutor.classifyTool('')).toBe('read');
    });
  });
});

describe('AgentExecutor — _logToShipLog', () => {
  // Persistence is observability — DB write failures must never break a
  // mission run. The helper has to be no-op safe (missing ShipLog,
  // missing scope, async rejections) AND consistently shape the rows
  // when conditions are right, so the Execution Log can replay traces.
  const calls = [];
  let _origShipLog;

  beforeEach(() => {
    calls.length = 0;
    _origShipLog = globalThis.ShipLog;
    globalThis.ShipLog = {
      append: (spaceshipId, payload) => {
        calls.push({ spaceshipId, ...payload });
        return Promise.resolve({ id: 'sl-' + calls.length });
      },
    };
  });

  afterEach(() => {
    globalThis.ShipLog = _origShipLog;
  });

  it('writes a row when ShipLog.append exists', () => {
    AgentExecutor._logToShipLog('mission-abc', 'agent-1', 'agent', 'hello', { event: 'x' });
    expect(calls.length).toBe(1);
    expect(calls[0].spaceshipId).toBe('mission-abc');
    expect(calls[0].agentId).toBe('agent-1');
    expect(calls[0].role).toBe('agent');
    expect(calls[0].content).toBe('hello');
    expect(calls[0].metadata.event).toBe('x');
  });

  it('no-ops when spaceshipId is missing', () => {
    AgentExecutor._logToShipLog(null, 'a', 'agent', 'hi', {});
    AgentExecutor._logToShipLog('', 'a', 'agent', 'hi', {});
    expect(calls.length).toBe(0);
  });

  it('no-ops when ShipLog.append is missing', () => {
    globalThis.ShipLog = { execute: async () => ({}) };
    expect(() => AgentExecutor._logToShipLog('mission-abc', null, 'system', 'x', {})).not.toThrow();
  });

  it('caps very large content to keep row size bounded', () => {
    const big = 'x'.repeat(20000);
    AgentExecutor._logToShipLog('mission-abc', null, 'system', big, {});
    expect(calls[0].content.length).toBeLessThan(20000);
    expect(calls[0].content.endsWith('… [truncated]')).toBe(true);
  });

  it('JSON-stringifies non-string content', () => {
    AgentExecutor._logToShipLog('mission-abc', null, 'system', { foo: 1 }, {});
    expect(calls[0].content).toBe('{"foo":1}');
  });

  it('swallows promise rejections from ShipLog.append', async () => {
    globalThis.ShipLog = {
      append: () => Promise.reject(new Error('db down')),
    };
    // Should not throw synchronously and the rejection must be caught.
    expect(() => AgentExecutor._logToShipLog('mission-abc', null, 'system', 'x', {})).not.toThrow();
    // Microtask drain — if .catch wasn't attached, vitest would see an unhandled rejection.
    await Promise.resolve();
  });
});

describe('AgentMemory', () => {
  const TEST_AGENT = 'test-agent-memory-' + Date.now();

  it('exposes full API', () => {
    expect(typeof AgentMemory.getMemory).toBe('function');
    expect(typeof AgentMemory.addFact).toBe('function');
    expect(typeof AgentMemory.addSuccess).toBe('function');
    expect(typeof AgentMemory.addFailure).toBe('function');
    expect(typeof AgentMemory.setContext).toBe('function');
    expect(typeof AgentMemory.buildPromptContext).toBe('function');
    expect(typeof AgentMemory.learn).toBe('function');
    expect(typeof AgentMemory.clear).toBe('function');
  });

  it('starts with empty memory for a new agent', () => {
    const mem = AgentMemory.getMemory(TEST_AGENT);
    expect(mem.facts).toEqual([]);
    expect(mem.successPatterns).toEqual([]);
    expect(mem.failurePatterns).toEqual([]);
  });

  it('adds and retrieves facts', () => {
    AgentMemory.addFact(TEST_AGENT, 'The sky is blue');
    const mem = AgentMemory.getMemory(TEST_AGENT);
    expect(mem.facts).toContain('The sky is blue');
  });

  it('deduplicates facts', () => {
    AgentMemory.addFact(TEST_AGENT, 'Water is wet');
    AgentMemory.addFact(TEST_AGENT, 'Water is wet');
    const mem = AgentMemory.getMemory(TEST_AGENT);
    const count = mem.facts.filter(f => f === 'Water is wet').length;
    expect(count).toBe(1);
  });

  it('records success patterns', () => {
    AgentMemory.addSuccess(TEST_AGENT, { task: 'Write email', approach: 'Used template', result: 'Approved' });
    const mem = AgentMemory.getMemory(TEST_AGENT);
    expect(mem.successPatterns.length).toBeGreaterThan(0);
    expect(mem.successPatterns[0].task).toBe('Write email');
  });

  it('records failure patterns', () => {
    AgentMemory.addFailure(TEST_AGENT, { task: 'Generate code', approach: 'Used GPT', reason: 'Syntax errors' });
    const mem = AgentMemory.getMemory(TEST_AGENT);
    expect(mem.failurePatterns.length).toBeGreaterThan(0);
    expect(mem.failurePatterns[0].reason).toBe('Syntax errors');
  });

  it('builds prompt context from memory', () => {
    AgentMemory.setContext(TEST_AGENT, 'Company', 'Acme Corp');
    const ctx = AgentMemory.buildPromptContext(TEST_AGENT);
    expect(ctx).toContain('Agent Memory');
    expect(ctx).toContain('Acme Corp');
  });

  it('returns empty string for agent with no memory', () => {
    const ctx = AgentMemory.buildPromptContext('nonexistent-agent-xyz');
    expect(ctx).toBe('');
  });

  it('learn() adds success pattern on approval', () => {
    const learnAgent = 'test-learn-' + Date.now();
    AgentMemory.learn(learnAgent, { task: 'Draft proposal', content: 'Here is the proposal...' }, 'approved');
    const mem = AgentMemory.getMemory(learnAgent);
    expect(mem.successPatterns.length).toBe(1);
    expect(mem.successPatterns[0].task).toBe('Draft proposal');
    AgentMemory.clear(learnAgent);
  });

  it('learn() adds failure pattern on rejection', () => {
    const learnAgent = 'test-learn-fail-' + Date.now();
    AgentMemory.learn(learnAgent, { task: 'Bad email', content: 'Wrong tone' }, 'rejected');
    const mem = AgentMemory.getMemory(learnAgent);
    expect(mem.failurePatterns.length).toBe(1);
    AgentMemory.clear(learnAgent);
  });

  it('clear() removes all memory for an agent', () => {
    AgentMemory.clear(TEST_AGENT);
    const mem = AgentMemory.getMemory(TEST_AGENT);
    expect(mem.facts).toEqual([]);
    expect(mem.successPatterns).toEqual([]);
  });
});

describe('ShipBehaviors', () => {
  const TEST_SHIP = 'test-ship-behaviors-' + Date.now();

  it('exposes full API', () => {
    expect(typeof ShipBehaviors.getBehaviors).toBe('function');
    expect(typeof ShipBehaviors.setBehavior).toBe('function');
    expect(typeof ShipBehaviors.checkBudget).toBe('function');
    expect(typeof ShipBehaviors.deductBudget).toBe('function');
    expect(typeof ShipBehaviors.resetDailyBudgets).toBe('function');
  });

  it('returns defaults for unknown ship', () => {
    const b = ShipBehaviors.getBehaviors(TEST_SHIP);
    expect(b.approvalMode).toBe('review');
    expect(b.maxConcurrent).toBe(3);
    expect(b.dailyBudget).toBe(0);
  });

  it('sets and retrieves a behavior', () => {
    ShipBehaviors.setBehavior(TEST_SHIP, 'approvalMode', 'autonomous');
    expect(ShipBehaviors.getBehaviors(TEST_SHIP).approvalMode).toBe('autonomous');
  });

  it('checkBudget returns true when no budget set', () => {
    expect(ShipBehaviors.checkBudget(TEST_SHIP, 1000)).toBe(true);
  });

  it('checkBudget enforces budget limit', () => {
    const budgetShip = 'test-budget-' + Date.now();
    ShipBehaviors.setBehavior(budgetShip, 'dailyBudget', 5000);
    ShipBehaviors.setBehavior(budgetShip, 'budgetUsedToday', 4500);
    expect(ShipBehaviors.checkBudget(budgetShip, 400)).toBe(true);
    expect(ShipBehaviors.checkBudget(budgetShip, 600)).toBe(false);
  });

  it('deductBudget increments usage', () => {
    const deductShip = 'test-deduct-' + Date.now();
    ShipBehaviors.deductBudget(deductShip, 100);
    ShipBehaviors.deductBudget(deductShip, 200);
    const b = ShipBehaviors.getBehaviors(deductShip);
    expect(b.budgetUsedToday).toBe(300);
  });
});
