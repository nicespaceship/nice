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
    expect(result).toContain('Accuracy: 94%');
    expect(result).toContain('Classification: Rare.');
    expect(result).toContain('The first question is never the last.');
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
  });
});
