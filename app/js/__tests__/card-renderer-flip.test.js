import { describe, it, expect } from 'vitest';

describe('CardRenderer — flip + back face', () => {
  describe('_extractDisciplines', () => {
    const ex = CardRenderer._extractDisciplines;

    it('parses "How you work:" bullets', () => {
      const prompt = [
        'You are the Practice Owner of The Practice.',
        '',
        'Your team:',
        '- Front Desk Coordinator',
        '- Medical Assistant',
        '',
        'How you work:',
        '- Route incoming work by what it needs first.',
        '- HIPAA is the floor, not the ceiling. Minimum-necessary PHI.',
        '- Informed consent is signed before any procedure, not after.',
      ].join('\n');

      const out = ex(prompt);
      expect(out).toHaveLength(3);
      expect(out[0]).toBe('Route incoming work by what it needs first.');
      expect(out[1]).toBe('HIPAA is the floor, not the ceiling. Minimum-necessary PHI.');
      expect(out[2]).toBe('Informed consent is signed before any procedure, not after.');
    });

    it('parses "How to work:" variant', () => {
      const prompt = 'You are an agent.\n\nHow to work:\n- Resolve the question into a CRM query.\n- Call search_crm_objects first.';
      const out = ex(prompt);
      expect(out).toEqual([
        'Resolve the question into a CRM query.',
        'Call search_crm_objects first.',
      ]);
    });

    it('stops at the next titled section', () => {
      const prompt = 'How you work:\n- First rule.\n- Second rule.\n\nOutput rules:\n- A different list.';
      const out = ex(prompt);
      expect(out).toEqual(['First rule.', 'Second rule.']);
    });

    it('returns [] when header is missing', () => {
      expect(ex('Just a freeform prompt with no header.')).toEqual([]);
      expect(ex('')).toEqual([]);
      expect(ex(null)).toEqual([]);
      expect(ex(undefined)).toEqual([]);
    });
  });

  describe('render — full ship card has front + back + flip button', () => {
    const SHIP = {
      id: 'bp-test-ship',
      name: 'Test Ship',
      type: 'spaceship',
      rarity: 'Common',
      category: 'Healthcare',
      tags: ['test'],
      description: 'A test ship.',
      flavor: 'A flavor scene.',
      config: {
        ship_system_prompt: 'You are the Captain.\n\nYour team:\n- Crew One\n\nHow you work:\n- Rule A.\n- Rule B is longer and spans multiple words.',
      },
      caps: ['cap one', 'cap two'],
      crew: [
        { slot: 0, label: 'Captain',        role: 'captain',    min_class: 'class-1' },
        { slot: 1, label: 'Front Desk',     role: 'operations', min_class: 'class-1' },
        { slot: 2, label: 'Medical Asst',   role: 'docs',       min_class: 'class-2' },
        { slot: 3, label: 'Insurance Lead', role: 'finance',    min_class: 'class-4' },
      ],
      stats: { crew: 6, slots: 12 },
    };

    const html = CardRenderer.render('spaceship', 'full', SHIP);

    it('wraps content in inner + front + back faces', () => {
      expect(html).toContain('class="blueprint-card-inner"');
      expect(html).toContain('class="blueprint-card-front"');
      expect(html).toContain('class="blueprint-card-back"');
    });

    it('includes a flip button with data-action', () => {
      expect(html).toContain('data-action="flip-card"');
      expect(html).toContain('class="blueprint-card-flip-btn"');
    });

    it('renders extracted disciplines as bullet items', () => {
      expect(html).toContain('Discipline');
      expect(html).toContain('<li>Rule A.</li>');
      expect(html).toContain('Rule B is longer and spans multiple words.');
    });

    it('falls back to caps when no system prompt has disciplines', () => {
      const noDisc = { ...SHIP, config: {} };
      const out = CardRenderer.render('spaceship', 'full', noDisc);
      expect(out).toContain('Capabilities');
      expect(out).toContain('<li>cap one</li>');
    });
  });

  describe('render — full agent card has back with system prompt', () => {
    const AGENT = {
      id: 'bp-test-agent',
      name: 'Test Agent',
      type: 'agent',
      rarity: 'Rare',
      category: 'Research',
      tags: ['test'],
      description: 'A test agent.',
      flavor: 'agent flavor',
      llm_engine: 'claude-4-6-sonnet',
      config: {
        system_prompt: 'You are a helpful research agent.',
        tools: ['search', 'fetch', 'summarize'],
      },
      stats: { spd: '4s', acc: '90%', cap: '1K', pwr: '8' },
    };

    const html = CardRenderer.render('agent', 'full', AGENT);

    it('renders the system prompt on the back', () => {
      expect(html).toContain('System Prompt');
      expect(html).toContain('You are a helpful research agent.');
    });

    it('renders tools as chips', () => {
      expect(html).toContain('Tools');
      expect(html).toContain('search');
      expect(html).toContain('fetch');
      expect(html).toContain('summarize');
    });

    it('renders model when present', () => {
      expect(html).toContain('Model');
      expect(html).toContain('claude-4-6-sonnet');
    });
  });

  describe('ship front — crew list replaces flavor + caps', () => {
    const SHIP_WITH_CREW = {
      id: 'bp-crew-ship',
      name: 'Crew Ship',
      type: 'spaceship',
      rarity: 'Common',
      tags: [],
      description: 'd',
      flavor: 'A flavor that should NOT appear on the front',
      caps: ['cap one should NOT appear', 'cap two'],
      crew: [
        { slot: 0, label: 'Captain',        min_class: 'class-1' },
        { slot: 1, label: 'Front Desk',     min_class: 'class-1' },
        { slot: 2, label: 'Medical Asst',   min_class: 'class-2' },
        { slot: 3, label: 'Compliance',     min_class: 'class-3' },
        { slot: 4, label: 'Insurance Lead', min_class: 'class-4' },
      ],
      stats: { crew: 5, slots: 12 },
    };

    const html = CardRenderer.render('spaceship', 'full', SHIP_WITH_CREW);

    it('renders the crew list', () => {
      expect(html).toContain('class="blueprint-card-crew-list"');
      expect(html).toContain('Captain');
      expect(html).toContain('Front Desk');
      expect(html).toContain('Insurance Lead');
    });

    it('tags each crew item with its class number', () => {
      expect(html).toMatch(/bp-crew-c1[^"]*"[^>]*title="Captain/);
      expect(html).toMatch(/bp-crew-c2[^"]*"[^>]*title="Medical Asst/);
      expect(html).toMatch(/bp-crew-c4[^"]*"[^>]*title="Insurance Lead/);
    });

    it('does not render flavor or caps on the front', () => {
      // Front face — must not contain the flavor quote or cap text
      const frontHTML = html.split('blueprint-card-back')[0];
      expect(frontHTML).not.toContain('A flavor that should NOT appear');
      expect(frontHTML).not.toContain('cap one should NOT');
      expect(frontHTML).not.toContain('blueprint-card-flavor');
    });

    it('agent front still shows flavor + caps (unchanged)', () => {
      const agent = {
        id: 'bp-a', name: 'A', type: 'agent', rarity: 'Common', tags: [],
        flavor: 'agent flavor stays', caps: ['agent cap stays'],
        stats: { spd: '1', acc: '1', cap: '1', pwr: '1' },
      };
      const agentHTML = CardRenderer.render('agent', 'full', agent);
      const frontHTML = agentHTML.split('blueprint-card-back')[0];
      expect(frontHTML).toContain('agent flavor stays');
      expect(frontHTML).toContain('agent cap stays');
      expect(frontHTML).not.toContain('blueprint-card-crew-list');
    });
  });

  describe('bindFlipCards', () => {
    it('toggles .flipped on click of the flip button', () => {
      document.body.innerHTML = `
        <div class="blueprint-card" data-id="x">
          <button class="blueprint-card-flip-btn" data-action="flip-card"></button>
          <div class="blueprint-card-inner"><div class="blueprint-card-front"></div><div class="blueprint-card-back"></div></div>
        </div>`;
      // bindFlipCards was auto-attached at module load; ensure it's bound here too
      CardRenderer.bindFlipCards(document.body);

      const card = document.body.querySelector('.blueprint-card');
      const btn = card.querySelector('[data-action="flip-card"]');
      expect(card.classList.contains('flipped')).toBe(false);
      btn.click();
      expect(card.classList.contains('flipped')).toBe(true);
      btn.click();
      expect(card.classList.contains('flipped')).toBe(false);
    });
  });
});
