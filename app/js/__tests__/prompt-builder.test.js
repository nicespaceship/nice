import { describe, it, expect } from 'vitest';

describe('PromptBuilder', () => {

  const FULL_BLUEPRINT = {
    name: 'Research Navigator',
    description: 'Autonomous web research, source synthesis, and executive briefing generation.',
    flavor: 'The first question is never the last.',
    category: 'Research',
    rarity: 'Rare',
    tags: ['research', 'analysis'],
    config: {
      role: 'Research',
      type: 'Intelligence Agent',
      llm_engine: 'claude-4',
      tools: ['Web Search', 'Database', 'Summarize'],
    },
    stats: { spd: '4.2s', acc: '94%', cap: '2K', pwr: '82' },
    metadata: {
      art: 'intelligence',
      agentType: 'Intelligence Agent',
      caps: ['Web, paper & database search', '2,000 briefings/month', 'Synthesises multi-source findings'],
      card_num: 'NS-001',
    },
  };

  it('returns default prompt for null blueprint', () => {
    const result = PromptBuilder.build(null);
    expect(result).toContain('NICE AI');
    expect(result).toContain('general-purpose');
  });

  it('builds prompt from minimal blueprint (name + role only)', () => {
    const bp = { name: 'Test Agent', config: { role: 'Support' } };
    const result = PromptBuilder.build(bp);
    expect(result).toContain('You are Test Agent');
    expect(result).toContain('Support Agent');
    expect(result).not.toContain('undefined');
  });

  it('includes all rich fields from full blueprint', () => {
    const result = PromptBuilder.build(FULL_BLUEPRINT);
    expect(result).toContain('You are Research Navigator, an Intelligence Agent.');
    expect(result).toContain('Autonomous web research');
    expect(result).toContain('Domain: Research.');
    expect(result).toContain('- Web, paper & database search');
    expect(result).toContain('- 2,000 briefings/month');
    expect(result).toContain('Tools available: Web Search, Database, Summarize.');
    expect(result).toContain('Classification: Rare.');
    expect(result).toContain('The first question is never the last.');
  });

  it('does not include cosmetic stats in the prompt (handled by LLMConfig)', () => {
    const result = PromptBuilder.build(FULL_BLUEPRINT);
    expect(result).not.toContain('Operating parameters');
    expect(result).not.toContain('Accuracy:');
    expect(result).not.toContain('Speed:');
    // Raw HTML entities from the stats payload should never reach the prompt
    expect(result).not.toContain('&#8734;');
  });

  it('includes crew context when provided', () => {
    const result = PromptBuilder.build(FULL_BLUEPRINT, {
      crewContext: { shipName: 'USS Enterprise', slotLabel: 'Science Officer' },
    });
    expect(result).toContain('Science Officer');
    expect(result).toContain('USS Enterprise');
    expect(result).toContain('Ship\'s Log');
  });

  it('falls back to config.type when metadata.agentType is missing', () => {
    const bp = { name: 'Bot', config: { type: 'Ops Agent' } };
    const result = PromptBuilder.build(bp);
    expect(result).toContain('an Ops Agent');
  });

  it('falls back to role + Agent when no type fields exist', () => {
    const bp = { name: 'Bot', config: { role: 'Analytics' } };
    const result = PromptBuilder.build(bp);
    expect(result).toContain('an Analytics Agent');
  });

  it('falls back to top-level caps when metadata.caps is missing', () => {
    const bp = { name: 'Bot', caps: ['Can search', 'Can write'], config: {} };
    const result = PromptBuilder.build(bp);
    expect(result).toContain('- Can search');
    expect(result).toContain('- Can write');
  });

  it('gracefully handles missing optional fields', () => {
    const bp = { name: 'Bare Bot', config: {} };
    const result = PromptBuilder.build(bp);
    expect(result).toContain('You are Bare Bot');
    expect(result).not.toContain('undefined');
    expect(result).not.toContain('null');
    expect(result).not.toContain('Domain:');
    expect(result).not.toContain('Capabilities:');
    expect(result).not.toContain('Tools available:');
    expect(result).not.toContain('Operating parameters:');
    expect(result).not.toContain('Classification:');
    expect(result).not.toContain('Output format');
    expect(result).not.toContain('Example 1:');
    expect(result).not.toContain('Quality criteria');
  });

  describe('output_schema', () => {
    it('renders a flat shape into a JSON-shaped output section', () => {
      const bp = {
        name: 'Email Bot',
        config: {
          role: 'Comms',
          output_schema: { subject: 'string', body: 'string', to: 'email' },
        },
      };
      const result = PromptBuilder.build(bp);
      expect(result).toContain('Output format');
      expect(result).toContain('- subject (string)');
      expect(result).toContain('- body (string)');
      expect(result).toContain('- to (email)');
    });

    it('renders a JSON Schema with properties + descriptions', () => {
      const bp = {
        name: 'Order Bot',
        config: {
          role: 'Ops',
          output_schema: {
            description: 'an order confirmation',
            properties: {
              order_id: { type: 'string', description: 'Stripe order id' },
              total:    { type: 'number' },
            },
          },
        },
      };
      const result = PromptBuilder.build(bp);
      expect(result).toContain('Output format — an order confirmation:');
      expect(result).toContain('- order_id (string) — Stripe order id');
      expect(result).toContain('- total (number)');
    });

    it('skips an empty schema', () => {
      const bp = { name: 'X', config: { role: 'Ops', output_schema: {} } };
      const result = PromptBuilder.build(bp);
      expect(result).not.toContain('Output format');
    });
  });

  describe('example_io', () => {
    it('renders one example with string input/output', () => {
      const bp = {
        name: 'Echo',
        config: {
          role: 'Test',
          example_io: [{ input: 'say hello', output: 'hello' }],
        },
      };
      const result = PromptBuilder.build(bp);
      expect(result).toContain('Example 1:');
      expect(result).toContain('Input: say hello');
      expect(result).toContain('Output: hello');
    });

    it('serializes object input/output as JSON', () => {
      const bp = {
        name: 'JSON Bot',
        config: {
          role: 'Data',
          example_io: [{
            input:  { user: 'alice', action: 'login' },
            output: { ok: true, ts: 123 },
          }],
        },
      };
      const result = PromptBuilder.build(bp);
      expect(result).toContain('"user": "alice"');
      expect(result).toContain('"ok": true');
    });

    it('caps at 3 examples', () => {
      const bp = {
        name: 'Many',
        config: {
          role: 'Ops',
          example_io: [
            { input: 'a', output: '1' },
            { input: 'b', output: '2' },
            { input: 'c', output: '3' },
            { input: 'd', output: '4' },
            { input: 'e', output: '5' },
          ],
        },
      };
      const result = PromptBuilder.build(bp);
      expect(result).toContain('Example 1:');
      expect(result).toContain('Example 2:');
      expect(result).toContain('Example 3:');
      expect(result).not.toContain('Example 4:');
    });

    it('skips malformed examples missing input or output', () => {
      const bp = {
        name: 'Bad',
        config: {
          role: 'X',
          example_io: [{ input: 'orphan' }, null, { output: 'nope' }],
        },
      };
      const result = PromptBuilder.build(bp);
      expect(result).not.toContain('Example 1:');
    });
  });

  describe('eval_criteria', () => {
    it('renders quality criteria as a bulleted list', () => {
      const bp = {
        name: 'Strict Bot',
        config: {
          role: 'QA',
          eval_criteria: [
            'Output is valid JSON',
            'All fields are present',
            'Tone matches the brand voice',
          ],
        },
      };
      const result = PromptBuilder.build(bp);
      expect(result).toContain('Quality criteria');
      expect(result).toContain('- Output is valid JSON');
      expect(result).toContain('- All fields are present');
      expect(result).toContain('- Tone matches the brand voice');
    });

    it('skips empty criteria array', () => {
      const bp = { name: 'X', config: { role: 'X', eval_criteria: [] } };
      const result = PromptBuilder.build(bp);
      expect(result).not.toContain('Quality criteria');
    });
  });
});
