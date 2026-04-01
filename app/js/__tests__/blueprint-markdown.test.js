import { describe, it, expect } from 'vitest';

describe('BlueprintMarkdown', () => {

  // ── Fixtures ──

  const FULL_AGENT = {
    type: 'agent',
    name: 'Research Navigator',
    serial_key: 'NS-001',
    description: 'Autonomous web research, source synthesis, and executive briefing generation.',
    flavor: 'The first question is never the last.',
    category: 'Research',
    rarity: 'Rare',
    tags: ['research', 'analysis'],
    config: {
      role: 'Research',
      type: 'Intelligence Agent',
      llm_engine: 'claude-4',
      temperature: 0.7,
      memory: true,
      tools: ['Web Search', 'Database', 'Summarize'],
      persona: {
        personality: 'Methodical and thorough',
        expertise: ['Web research', 'Source synthesis'],
        tone: 'Professional',
        constraints: ['Always cite sources'],
      },
    },
    stats: { spd: '4.2s', acc: '94%', cap: '2K' },
    metadata: {
      agentType: 'Intelligence Agent',
      caps: ['Web, paper & database search', '2,000 briefings/month', 'Synthesises multi-source findings'],
    },
  };

  const FULL_SPACESHIP = {
    type: 'spaceship',
    name: 'SaaS Startup',
    serial_key: 'SS-0001',
    category: 'Engineering',
    rarity: 'class-2',
    tags: ['saas', 'startup'],
    description: 'Full-stack startup crew for shipping products fast.',
    flavor: 'Ship faster. Scale smarter.',
    config: {
      slot_assignments: { '0': 'bp-agent-06', '1': 'bp-agent-05' },
    },
    stats: { crew: '2', slots: '4', tier: 'PRO' },
    metadata: {
      recommended_class: 'class-2',
      caps: ['Route feature requests', 'Coordinate sprints'],
      crew: [
        { slot: 0, role: 'Product Manager', agent: 'bp-agent-06' },
        { slot: 1, role: 'CTO Agent', agent: 'bp-agent-05' },
      ],
    },
  };

  const FULL_WORKFLOW = {
    type: 'workflow',
    name: 'Feature Ship Pipeline',
    trigger: 'manual',
    description: 'Break feature requests into stories, plan, then draft release notes.',
    nodes: [
      { id: 'step-0', label: 'Product Manager', type: 'agent', config: { agent: 'bp-agent-06', prompt: 'Break this feature request into user stories.' } },
      { id: 'step-1', label: 'CTO Agent', type: 'agent', config: { agent: 'bp-agent-05', prompt: 'Create a technical implementation plan.' } },
      { id: 'step-2', label: 'Ship It', type: 'output', config: { format: 'text', prompt: '' } },
    ],
    connections: [
      { from: 'step-0', to: 'step-1' },
      { from: 'step-1', to: 'step-2' },
    ],
  };

  const MINIMAL_AGENT_MD = `---
type: agent
name: Test Bot
---

A simple test agent.
`;

  const FULL_AGENT_MD = `---
type: agent
name: Research Navigator
serial_key: NS-001
category: Research
rarity: Rare
tags: [research, analysis]
role: Research
agent_type: Intelligence Agent
llm_engine: claude-4
temperature: 0.7
memory: true
tools: [Web Search, Database, Summarize]
stats:
  spd: "4.2s"
  acc: "94%"
  cap: "2K"
persona:
  personality: Methodical and thorough
  expertise: [Web research, Source synthesis]
  tone: Professional
  constraints: [Always cite sources]
---

Autonomous web research, source synthesis, and executive briefing generation.

## Capabilities

- Web, paper & database search
- 2,000 briefings/month
- Synthesises multi-source findings

## Flavor

The first question is never the last.
`;

  // ═══════════════════════════════════════════
  //  PARSE
  // ═══════════════════════════════════════════

  describe('parse', () => {

    it('returns null for empty input', () => {
      expect(BlueprintMarkdown.parse('')).toBeNull();
      expect(BlueprintMarkdown.parse(null)).toBeNull();
    });

    it('parses minimal agent markdown', () => {
      const bp = BlueprintMarkdown.parse(MINIMAL_AGENT_MD);
      expect(bp.type).toBe('agent');
      expect(bp.name).toBe('Test Bot');
      expect(bp.description).toBe('A simple test agent.');
    });

    it('parses full agent markdown with all fields', () => {
      const bp = BlueprintMarkdown.parse(FULL_AGENT_MD);
      expect(bp.type).toBe('agent');
      expect(bp.name).toBe('Research Navigator');
      expect(bp.serial_key).toBe('NS-001');
      expect(bp.category).toBe('Research');
      expect(bp.rarity).toBe('Rare');
      expect(bp.tags).toEqual(['research', 'analysis']);

      // Config assembled from flat frontmatter keys
      expect(bp.config.role).toBe('Research');
      expect(bp.config.llm_engine).toBe('claude-4');
      expect(bp.config.temperature).toBe(0.7);
      expect(bp.config.memory).toBe(true);
      expect(bp.config.tools).toEqual(['Web Search', 'Database', 'Summarize']);

      // Persona
      expect(bp.config.persona.personality).toBe('Methodical and thorough');
      expect(bp.config.persona.expertise).toEqual(['Web research', 'Source synthesis']);
      expect(bp.config.persona.tone).toBe('Professional');
      expect(bp.config.persona.constraints).toEqual(['Always cite sources']);

      // Stats
      expect(bp.stats.spd).toBe('4.2s');
      expect(bp.stats.acc).toBe('94%');
      expect(bp.stats.cap).toBe('2K');

      // Body sections
      expect(bp.description).toBe('Autonomous web research, source synthesis, and executive briefing generation.');
      expect(bp.metadata.caps).toEqual([
        'Web, paper & database search',
        '2,000 briefings/month',
        'Synthesises multi-source findings',
      ]);
      expect(bp.flavor).toBe('The first question is never the last.');
    });

    it('parses spaceship with crew manifest', () => {
      const md = `---
type: spaceship
name: SaaS Startup
category: Engineering
---

Full-stack startup crew.

## Crew Manifest

| Slot | Role | Agent |
|------|------|-------|
| 0 | Product Manager | bp-agent-06 |
| 1 | CTO Agent | bp-agent-05 |
`;
      const bp = BlueprintMarkdown.parse(md);
      expect(bp.type).toBe('spaceship');
      expect(bp.config.slot_assignments).toEqual({ '0': 'bp-agent-06', '1': 'bp-agent-05' });
      expect(bp.metadata.crew).toHaveLength(2);
      expect(bp.metadata.crew[0].role).toBe('Product Manager');
    });

    it('parses workflow with steps', () => {
      const md = `---
type: workflow
name: Feature Pipeline
trigger: manual
---

A multi-step pipeline.

## Steps

1. **Product Manager** (agent: bp-agent-06)
   Break this into user stories.

2. **CTO Agent** (agent: bp-agent-05)
   Create implementation plan.

3. **Ship It** (output, format: text)
`;
      const bp = BlueprintMarkdown.parse(md);
      expect(bp.type).toBe('workflow');
      expect(bp.nodes).toHaveLength(3);
      expect(bp.nodes[0].label).toBe('Product Manager');
      expect(bp.nodes[0].config.agent).toBe('bp-agent-06');
      expect(bp.nodes[0].config.prompt).toBe('Break this into user stories.');
      expect(bp.nodes[2].type).toBe('output');
      expect(bp.nodes[2].config.format).toBe('text');
      expect(bp.connections).toHaveLength(2);
      expect(bp.connections[0]).toEqual({ from: 'step-0', to: 'step-1' });
    });

    it('handles markdown without frontmatter', () => {
      const bp = BlueprintMarkdown.parse('Just some text without frontmatter');
      expect(bp.type).toBe('agent');
      expect(bp.description).toBe('Just some text without frontmatter');
    });
  });

  // ═══════════════════════════════════════════
  //  FRONTMATTER PARSER EDGE CASES
  // ═══════════════════════════════════════════

  describe('frontmatter parsing', () => {

    it('handles quoted values with colons', () => {
      const md = `---
type: agent
name: "Agent: Special"
---
`;
      const bp = BlueprintMarkdown.parse(md);
      expect(bp.name).toBe('Agent: Special');
    });

    it('handles booleans', () => {
      const md = `---
type: agent
name: Bot
memory: false
---
`;
      const bp = BlueprintMarkdown.parse(md);
      expect(bp.config.memory).toBe(false);
    });

    it('handles empty arrays', () => {
      const md = `---
type: agent
name: Bot
tags: []
tools: []
---
`;
      const bp = BlueprintMarkdown.parse(md);
      expect(bp.tags).toEqual([]);
      expect(bp.config.tools).toEqual([]);
    });

    it('handles numeric values that are not stats', () => {
      const md = `---
type: agent
name: Bot
temperature: 0.3
---
`;
      const bp = BlueprintMarkdown.parse(md);
      expect(bp.config.temperature).toBe(0.3);
    });
  });

  // ═══════════════════════════════════════════
  //  SERIALIZE
  // ═══════════════════════════════════════════

  describe('serialize', () => {

    it('returns empty string for null', () => {
      expect(BlueprintMarkdown.serialize(null)).toBe('');
    });

    it('serializes minimal agent', () => {
      const md = BlueprintMarkdown.serialize({ type: 'agent', name: 'Bot' });
      expect(md).toContain('---');
      expect(md).toContain('type: agent');
      expect(md).toContain('name: Bot');
    });

    it('serializes full agent with all sections', () => {
      const md = BlueprintMarkdown.serialize(FULL_AGENT);
      expect(md).toContain('type: agent');
      expect(md).toContain('name: Research Navigator');
      expect(md).toContain('category: Research');
      expect(md).toContain('rarity: Rare');
      expect(md).toContain('tags: [research, analysis]');
      expect(md).toContain('role: Research');
      expect(md).toContain('temperature: 0.7');
      expect(md).toContain('memory: true');
      expect(md).toContain('tools: [Web Search, Database, Summarize]');
      expect(md).toContain('spd:');
      expect(md).toContain('## Capabilities');
      expect(md).toContain('- Web, paper & database search');
      expect(md).toContain('## Flavor');
      expect(md).toContain('The first question is never the last.');
    });

    it('serializes spaceship with crew manifest table', () => {
      const md = BlueprintMarkdown.serialize(FULL_SPACESHIP);
      expect(md).toContain('type: spaceship');
      expect(md).toContain('## Crew Manifest');
      expect(md).toContain('| 0 | Product Manager | bp-agent-06 |');
      expect(md).toContain('| 1 | CTO Agent | bp-agent-05 |');
    });

    it('serializes workflow with steps', () => {
      const md = BlueprintMarkdown.serialize(FULL_WORKFLOW);
      expect(md).toContain('type: workflow');
      expect(md).toContain('trigger: manual');
      expect(md).toContain('## Steps');
      expect(md).toContain('1. **Product Manager** (agent: bp-agent-06)');
      expect(md).toContain('2. **CTO Agent** (agent: bp-agent-05)');
      expect(md).toContain('3. **Ship It** (output, format: text)');
    });
  });

  // ═══════════════════════════════════════════
  //  ROUND-TRIP
  // ═══════════════════════════════════════════

  describe('round-trip', () => {

    it('agent: parse(serialize(bp)) preserves key fields', () => {
      const md = BlueprintMarkdown.serialize(FULL_AGENT);
      const rt = BlueprintMarkdown.parse(md);

      expect(rt.name).toBe(FULL_AGENT.name);
      expect(rt.category).toBe(FULL_AGENT.category);
      expect(rt.rarity).toBe(FULL_AGENT.rarity);
      expect(rt.tags).toEqual(FULL_AGENT.tags);
      expect(rt.description).toBe(FULL_AGENT.description);
      expect(rt.flavor).toBe(FULL_AGENT.flavor);
      expect(rt.config.role).toBe(FULL_AGENT.config.role);
      expect(rt.config.tools).toEqual(FULL_AGENT.config.tools);
      expect(rt.config.temperature).toBe(FULL_AGENT.config.temperature);
      expect(rt.config.memory).toBe(FULL_AGENT.config.memory);
      expect(rt.config.persona.tone).toBe(FULL_AGENT.config.persona.tone);
      expect(rt.metadata.caps).toEqual(FULL_AGENT.metadata.caps);
    });

    it('spaceship: parse(serialize(bp)) preserves crew manifest', () => {
      const md = BlueprintMarkdown.serialize(FULL_SPACESHIP);
      const rt = BlueprintMarkdown.parse(md);

      expect(rt.name).toBe(FULL_SPACESHIP.name);
      expect(rt.type).toBe('spaceship');
      expect(rt.config.slot_assignments).toEqual(FULL_SPACESHIP.config.slot_assignments);
      expect(rt.metadata.crew).toHaveLength(2);
      expect(rt.metadata.crew[0].agent).toBe('bp-agent-06');
    });

    it('workflow: parse(serialize(wf)) preserves steps', () => {
      const md = BlueprintMarkdown.serialize(FULL_WORKFLOW);
      const rt = BlueprintMarkdown.parse(md);

      expect(rt.name).toBe(FULL_WORKFLOW.name);
      expect(rt.type).toBe('workflow');
      expect(rt.nodes).toHaveLength(3);
      expect(rt.nodes[0].label).toBe('Product Manager');
      expect(rt.nodes[0].config.agent).toBe('bp-agent-06');
      expect(rt.connections).toHaveLength(2);
    });

    it('agent round-trip produces same PromptBuilder output', () => {
      const md = BlueprintMarkdown.serialize(FULL_AGENT);
      const rt = BlueprintMarkdown.parse(md);

      // Attach agentType to metadata (PromptBuilder reads it from there)
      rt.metadata.agentType = rt.config.agent_type || (rt.metadata && rt.metadata.agentType);

      const originalPrompt = PromptBuilder.build(FULL_AGENT);
      const roundTripPrompt = PromptBuilder.build(rt);

      // Both should contain same identity line
      expect(roundTripPrompt).toContain('You are Research Navigator');
      expect(roundTripPrompt).toContain('Intelligence Agent');
      expect(roundTripPrompt).toContain('Domain: Research.');
      expect(roundTripPrompt).toContain('Tools available: Web Search, Database, Summarize.');
      expect(roundTripPrompt).toContain('The first question is never the last.');
    });
  });

  // ═══════════════════════════════════════════
  //  VALIDATE
  // ═══════════════════════════════════════════

  describe('validate', () => {

    it('rejects empty input', () => {
      const r = BlueprintMarkdown.validate('');
      expect(r.valid).toBe(false);
      expect(r.errors.length).toBeGreaterThan(0);
    });

    it('rejects missing frontmatter', () => {
      const r = BlueprintMarkdown.validate('Just text, no frontmatter');
      expect(r.valid).toBe(false);
      expect(r.errors[0]).toContain('frontmatter');
    });

    it('rejects missing name', () => {
      const r = BlueprintMarkdown.validate('---\ntype: agent\n---\n');
      expect(r.valid).toBe(false);
      expect(r.errors).toContain('Missing required field: name');
    });

    it('rejects invalid type', () => {
      const r = BlueprintMarkdown.validate('---\ntype: invalid\nname: Bot\n---\n');
      expect(r.valid).toBe(false);
      expect(r.errors[0]).toContain('Invalid type');
    });

    it('accepts valid agent', () => {
      const r = BlueprintMarkdown.validate(FULL_AGENT_MD);
      expect(r.valid).toBe(true);
      expect(r.errors).toHaveLength(0);
    });

    it('warns on agent with no tools', () => {
      const r = BlueprintMarkdown.validate('---\ntype: agent\nname: Bot\nrole: Ops\n---\n');
      expect(r.valid).toBe(true);
      expect(r.warnings).toContain('No tools specified');
    });

    it('warns on spaceship with no crew', () => {
      const r = BlueprintMarkdown.validate('---\ntype: spaceship\nname: Ship\n---\nA ship.\n');
      expect(r.valid).toBe(true);
      expect(r.warnings).toContain('No crew manifest');
    });

    it('warns on workflow with no steps', () => {
      const r = BlueprintMarkdown.validate('---\ntype: workflow\nname: Flow\n---\n');
      expect(r.valid).toBe(true);
      expect(r.warnings).toContain('No steps defined');
    });
  });
});
