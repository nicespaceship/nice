import { describe, it, expect, beforeAll, vi } from 'vitest';

// NavCommands + ToolRegistry are loaded globally by setup.js.
// NavCommands.init() registers the nav/UI verbs on the bus; it is NOT called
// at module load (it runs from nice.js bootstrap), so this suite calls it.

describe('NavCommands', () => {
  beforeAll(() => {
    NavCommands.init();
  });

  it('exposes init, list, COMMANDS', () => {
    expect(typeof NavCommands.init).toBe('function');
    expect(typeof NavCommands.list).toBe('function');
    expect(Array.isArray(NavCommands.COMMANDS)).toBe(true);
    expect(NavCommands.COMMANDS.length).toBeGreaterThan(0);
  });

  describe('init() — registration on the bus', () => {
    it('registers every command id on ToolRegistry', () => {
      const ids = ToolRegistry.list().map(t => t.id);
      ['open-bridge', 'open-agents', 'open-agent-builder', 'open-shipyard',
       'open-missions', 'open-blueprint-catalog', 'open-operations', 'open-cost',
       'open-wallet', 'open-vault', 'open-security', 'open-log', 'open-profile', 'open-settings',
       'open-theme-editor', 'open-workflows',
       'create-agent', 'new-spaceship', 'cycle-theme', 'show-shortcuts', 'open-setup-wizard',
       'open-crew-designer', 'export-data',
      ].forEach(id => expect(ids).toContain(id));
    });

    it('registers nav/UI verbs as human-surface only (LLM cannot navigate by default)', () => {
      NavCommands.COMMANDS.forEach(c => {
        const tool = ToolRegistry.get(c.id);
        expect(tool).toBeTruthy();
        expect(tool.surfaces).toEqual(['human']);
      });
    });

    it('marks every nav/UI verb sideEffect:false even when the id carries a mutation substring', () => {
      // "create-agent" / "new-spaceship" would infer as writes via
      // SIDE_EFFECT_PATTERNS; explicit sideEffect:false keeps navigation out
      // of the approval gate.
      expect(ToolRegistry.isSideEffect('create-agent')).toBe(true); // substring matches
      NavCommands.COMMANDS.forEach(c => {
        expect(ToolRegistry.get(c.id).sideEffect).toBe(false);
      });
    });

    it('is idempotent — re-running init() does not throw or duplicate', () => {
      const before = ToolRegistry.list().length;
      NavCommands.init();
      NavCommands.init();
      expect(ToolRegistry.list().length).toBe(before);
    });
  });

  describe('execute via the bus', () => {
    it('a nav command navigates to its route hash', async () => {
      const spy = vi.spyOn(globalThis.Router, 'navigate').mockImplementation(() => {});
      const res = await ToolRegistry.execute('open-missions');
      expect(spy).toHaveBeenCalledWith('#/missions');
      expect(res).toMatchObject({ ok: true });
      spy.mockRestore();
    });

    it('an action command runs its UI action', async () => {
      const spy = vi.spyOn(globalThis.Router, 'navigate').mockImplementation(() => {});
      await ToolRegistry.execute('create-agent');
      expect(spy).toHaveBeenCalledWith('#/bridge/agents/new');
      spy.mockRestore();
    });

    it('does NOT trigger the approval gate even in review mode (navigation is not a side effect)', async () => {
      const spy = vi.spyOn(globalThis.Router, 'navigate').mockImplementation(() => {});
      const onApprovalNeeded = vi.fn(async () => true);
      await ToolRegistry.execute('create-agent', {}, { approvalMode: 'review', onApprovalNeeded });
      expect(onApprovalNeeded).not.toHaveBeenCalled();
      expect(spy).toHaveBeenCalledWith('#/bridge/agents/new');
      spy.mockRestore();
    });
  });

  describe('list() — display projection', () => {
    it('returns a descriptor per command with id/label/keywords/icon/kind', () => {
      const list = NavCommands.list();
      expect(list.length).toBe(NavCommands.COMMANDS.length);
      list.forEach(c => {
        expect(c).toHaveProperty('id');
        expect(c).toHaveProperty('label');
        expect(c).toHaveProperty('keywords');
        expect(c).toHaveProperty('icon');
        expect(['nav', 'action']).toContain(c.kind);
      });
    });

    it('resolves the themed mission noun into the Missions label + keywords', () => {
      const missions = NavCommands.list().find(c => c.id === 'open-missions');
      const noun = Terminology.label('mission', { plural: true });
      expect(missions.label).toBe(noun);
      expect(missions.keywords).toContain(Terminology.label('mission', { plural: true, lowercase: true }));
    });

    it('preserves canonical labels for non-mission commands', () => {
      const bridge = NavCommands.list().find(c => c.id === 'open-bridge');
      expect(bridge.label).toBe('Bridge');
    });
  });

  describe('resolve() — keyword → command id (chat NL resolver, Phase 3)', () => {
    it('maps a bare noun to its nav command', () => {
      expect(NavCommands.resolve('missions').id).toBe('open-missions');
      expect(NavCommands.resolve('settings').id).toBe('open-settings');
      expect(NavCommands.resolve('wallet').id).toBe('open-wallet');
      expect(NavCommands.resolve('profile').id).toBe('open-profile');
    });

    it('matches singular/plural via substring (agents ↔ agent, ships ↔ spaceship)', () => {
      expect(NavCommands.resolve('agent').id).toBe('open-agents');
      expect(NavCommands.resolve('spaceships').id).toBe('open-shipyard');
    });

    it('ignores nav verbs and function words, scoring only content tokens', () => {
      expect(NavCommands.resolve('show me the operations').id).toBe('open-operations');
      expect(NavCommands.resolve('open my vault').id).toBe('open-vault');
    });

    it('returns null when no nav command matches (so chat falls through to the LLM)', () => {
      expect(NavCommands.resolve('what do my agents think of the plan')).not.toBeNull(); // 'agents' still matches — caller gates on phrasing
      expect(NavCommands.resolve('cyberpunk neon')).toBeNull();
      expect(NavCommands.resolve('write a tagline for my bakery')).toBeNull();
      expect(NavCommands.resolve('')).toBeNull();
    });

    it('never resolves a UI action (theme/export/crew) — only kind:nav commands', () => {
      // "switch to cyberpunk" must reach the theme handler, not toggle the theme.
      expect(NavCommands.resolve('cyberpunk')).toBeNull();
      // export/crew verbs have dedicated triggers, not fuzzy nav.
      const ids = NavCommands.COMMANDS.filter(c => c.kind === 'action').map(c => c.id);
      ids.forEach(id => {
        const hit = NavCommands.resolve(id.replace(/-/g, ' '));
        if (hit) expect(NavCommands.COMMANDS.find(c => c.id === hit.id).kind).toBe('nav');
      });
    });
  });

  describe('param-carrying action commands', () => {
    it('open-crew-designer forwards its prompt param to CrewDesigner.open', async () => {
      const open = vi.fn();
      globalThis.CrewDesigner = { open };
      await ToolRegistry.execute('open-crew-designer', { prompt: 'a bakery in Austin' });
      expect(open).toHaveBeenCalledWith({ prompt: 'a bakery in Austin' });
      delete globalThis.CrewDesigner;
    });

    it('open-crew-designer opens with an empty prompt when dispatched param-less (palette)', async () => {
      const open = vi.fn();
      globalThis.CrewDesigner = { open };
      await ToolRegistry.execute('open-crew-designer');
      expect(open).toHaveBeenCalledWith({ prompt: '' });
      delete globalThis.CrewDesigner;
    });

    it('export-data invokes DataIO.exportData', async () => {
      const spy = vi.spyOn(globalThis.DataIO, 'exportData').mockImplementation(() => {});
      await ToolRegistry.execute('export-data');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
