import { describe, it, expect, beforeEach } from 'vitest';

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

  describe('ship front — tab strip with crew as default panel', () => {
    const SHIP_WITH_CREW = {
      id: 'bp-crew-ship',
      name: 'Crew Ship',
      type: 'spaceship',
      rarity: 'Common',
      tags: [],
      description: 'd',
      flavor: 'A flavor scene.',
      caps: ['cap one'],
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

    it('replaces the scrolling marquee with an icon tab strip', () => {
      expect(html).toContain('class="blueprint-card-front-tabs"');
      expect(html).not.toContain('class="blueprint-card-marquee"');
    });

    it('renders the sub-header row with category + rarity (serial no longer on the front)', () => {
      expect(html).toContain('class="blueprint-card-sub-header"');
      expect(html).toContain('class="blueprint-card-sub-category"');
      expect(html).toMatch(/blueprint-card-sub-rarity[^"]*"[^>]*>COMMON</);
      expect(html).not.toContain('blueprint-card-art-role');
      expect(html).not.toContain('blueprint-card-art-class');
      expect(html).not.toContain('blueprint-card-art-serial');
    });

    it('renders all 4 tabs in the strip', () => {
      expect(html).toContain('data-tab="crew"');
      expect(html).toContain('data-tab="specialties"');
      expect(html).toContain('data-tab="workflows"');
      expect(html).toContain('data-tab="protocols"');
    });

    it('marks Crew as the default active tab + panel', () => {
      expect(html).toMatch(/blueprint-card-front-tab active[^>]*data-tab="crew"/);
      expect(html).toMatch(/blueprint-card-front-panel active[^>]*data-tab="crew"/);
    });

    it('renders the crew roster inside the Crew panel', () => {
      expect(html).toContain('class="blueprint-card-crew-list"');
      expect(html).toContain('Captain');
      expect(html).toContain('Insurance Lead');
    });

    it('tags each crew item with its class number', () => {
      expect(html).toMatch(/bp-crew-c1[^"]*"[^>]*title="Captain/);
      expect(html).toMatch(/bp-crew-c2[^"]*"[^>]*title="Medical Asst/);
      expect(html).toMatch(/bp-crew-c4[^"]*"[^>]*title="Insurance Lead/);
    });

    it('renders Coming-soon stub for Workflows (still pending data)', () => {
      expect(html).toMatch(/blueprint-card-front-panel[^>]*data-tab="workflows"[^>]*>[\s\S]*?Workflows[\s\S]*?Coming soon/);
    });

    it('specialties panel falls back to Coming soon when ship has no specialties', () => {
      expect(html).toMatch(/blueprint-card-front-panel[^>]*data-tab="specialties"[^>]*>[\s\S]*?Specialties[\s\S]*?Coming soon/);
    });

    it('protocols panel falls back to Coming soon when ship has no system prompt', () => {
      expect(html).toMatch(/blueprint-card-front-panel[^>]*data-tab="protocols"[^>]*>[\s\S]*?Protocols[\s\S]*?Coming soon/);
    });

    it('places a hover-title overlay inside the art zone', () => {
      expect(html).toContain('class="blueprint-card-art-hover-title"');
    });

    it('protocols panel renders parsed "How you work:" bullets when present', () => {
      const SHIP_WITH_PROTOCOLS = {
        ...SHIP_WITH_CREW,
        id: 'bp-protocols-ship',
        config: {
          ship_system_prompt: [
            'You are the Captain.',
            '',
            'How you work:',
            '- HIPAA is the floor, not the ceiling. Minimum-necessary PHI on every disclosure.',
            '- Informed consent is signed before any procedure, not after. The form lists the risks.',
            '- Coding accuracy cuts both ways. Documentation supports the level billed.',
          ].join('\n'),
        },
      };
      const protocolsHTML = CardRenderer.render('spaceship', 'full', SHIP_WITH_PROTOCOLS);
      expect(protocolsHTML).toContain('class="blueprint-card-front-protocols-list"');
      expect(protocolsHTML).toContain('HIPAA is the floor, not the ceiling');
      expect(protocolsHTML).toContain('Informed consent is signed before any procedure, not after');
      expect(protocolsHTML).toContain('Coding accuracy cuts both ways');
      expect(protocolsHTML).not.toMatch(/blueprint-card-front-panel[^>]*data-tab="protocols"[^>]*>[\s\S]*?Coming soon/);
    });

    it('specialties panel renders curated noun-phrase chips when card.specialties is set', () => {
      const SHIP_WITH_SPECIALTIES = {
        ...SHIP_WITH_CREW,
        id: 'bp-specialties-ship',
        card: {
          specialties: ['revenue cycle', 'denial workflow', 'eligibility verification'],
        },
      };
      const specHTML = CardRenderer.render('spaceship', 'full', SHIP_WITH_SPECIALTIES);
      expect(specHTML).toContain('class="blueprint-card-front-specialties-list"');
      expect(specHTML).toContain('>revenue cycle<');
      expect(specHTML).toContain('>denial workflow<');
      expect(specHTML).toContain('>eligibility verification<');
      const specPanel = specHTML.match(/<div class="blueprint-card-front-panel[^"]*" data-tab="specialties">([\s\S]*?)<\/div><div class="blueprint-card-front-panel/);
      expect(specPanel).not.toBeNull();
      expect(specPanel[1]).not.toContain('Coming soon');
    });

    it('specialties panel honors top-level + config-nested aliases', () => {
      const SHIP_TOP = { ...SHIP_WITH_CREW, id: 'bp-spec-top', specialties: ['top-level tag'] };
      const SHIP_CONFIG = { ...SHIP_WITH_CREW, id: 'bp-spec-config', config: { specialties: ['nested tag'] } };
      const topHTML = CardRenderer.render('spaceship', 'full', SHIP_TOP);
      const configHTML = CardRenderer.render('spaceship', 'full', SHIP_CONFIG);
      expect(topHTML).toContain('>top-level tag<');
      expect(configHTML).toContain('>nested tag<');
    });

    it('protocol bullets get trimmed to their leading clause for scannability', () => {
      const SHIP = {
        ...SHIP_WITH_CREW,
        id: 'bp-trim-ship',
        config: {
          ship_system_prompt: 'How you work:\n- HIPAA is the floor. Minimum-necessary PHI on every disclosure.',
        },
      };
      const trimHTML = CardRenderer.render('spaceship', 'full', SHIP);
      const frontMatch = trimHTML.match(/<ul class="blueprint-card-front-protocols-list">([\s\S]*?)<\/ul>/);
      expect(frontMatch).not.toBeNull();
      expect(frontMatch[1]).toContain('<li>HIPAA is the floor</li>');
      expect(frontMatch[1]).not.toContain('Minimum-necessary PHI');
    });

    it('agent front keeps the marquee + flavor + caps (unchanged)', () => {
      const agent = {
        id: 'bp-a', name: 'A', type: 'agent', rarity: 'Common', tags: [],
        description: 'desc',
        flavor: 'agent flavor stays', caps: ['agent cap stays'],
        stats: { spd: '1', acc: '1', cap: '1', pwr: '1' },
      };
      const agentHTML = CardRenderer.render('agent', 'full', agent);
      expect(agentHTML).toContain('blueprint-card-marquee');
      expect(agentHTML).toContain('agent flavor stays');
      expect(agentHTML).toContain('agent cap stays');
      expect(agentHTML).not.toContain('blueprint-card-front-tabs');
      expect(agentHTML).not.toContain('blueprint-card-art-hover-title');
    });
  });

  describe('bindFrontTabs interactions', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('clicking a tab swaps active tab and panel', () => {
      document.body.innerHTML = `
        <div class="blueprint-card">
          <div class="blueprint-card-front">
            <div class="blueprint-card-art"><div class="blueprint-card-art-hover-title"><span></span></div></div>
            <div class="blueprint-card-front-tabs">
              <button class="blueprint-card-front-tab active" data-tab="crew" data-title="Crew"></button>
              <button class="blueprint-card-front-tab" data-tab="specialties" data-title="Specialties"></button>
            </div>
            <div class="blueprint-card-text-box">
              <div class="blueprint-card-front-panel active" data-tab="crew">CREW</div>
              <div class="blueprint-card-front-panel" data-tab="specialties">TRY</div>
            </div>
          </div>
        </div>`;

      const tabTry  = document.querySelector('[data-tab="specialties"].blueprint-card-front-tab');
      const tabCrew = document.querySelector('[data-tab="crew"].blueprint-card-front-tab');
      const panelTry  = document.querySelector('.blueprint-card-front-panel[data-tab="specialties"]');
      const panelCrew = document.querySelector('.blueprint-card-front-panel[data-tab="crew"]');

      tabTry.click();
      expect(tabTry.classList.contains('active')).toBe(true);
      expect(tabCrew.classList.contains('active')).toBe(false);
      expect(panelTry.classList.contains('active')).toBe(true);
      expect(panelCrew.classList.contains('active')).toBe(false);
    });

    it('hovering a tab shows its title in the art-zone overlay; leaving hides it', () => {
      document.body.innerHTML = `
        <div class="blueprint-card">
          <div class="blueprint-card-front">
            <div class="blueprint-card-art"><div class="blueprint-card-art-hover-title"><span></span></div></div>
            <div class="blueprint-card-front-tabs">
              <button class="blueprint-card-front-tab active" data-tab="crew" data-title="Crew"></button>
              <button class="blueprint-card-front-tab" data-tab="workflows" data-title="Workflows"></button>
            </div>
          </div>
        </div>`;

      const tabPlug = document.querySelector('[data-tab="workflows"].blueprint-card-front-tab');
      const overlay = document.querySelector('.blueprint-card-art-hover-title');
      const span = overlay.querySelector('span');

      tabPlug.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      expect(span.textContent).toBe('Workflows');
      expect(overlay.classList.contains('visible')).toBe(true);

      tabPlug.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
      expect(overlay.classList.contains('visible')).toBe(false);
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
