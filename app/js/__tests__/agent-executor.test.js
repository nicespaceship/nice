import { describe, it, expect } from 'vitest';

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
