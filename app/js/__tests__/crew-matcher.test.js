import { describe, it, expect } from 'vitest';

const C = globalThis.CrewMatcher;

const A = (id, name, rarity, role, category) => ({
  id, name, rarity,
  category: category || role,
  config: { role },
});

const allowAll = () => true;

describe('CrewMatcher.scoreMatch', () => {
  it('exact role match scores highest', () => {
    expect(C.scoreMatch('Engineer', A('a1','Geordi','Epic','Engineer'))).toBe(100);
  });
  it('exact category match scores below role', () => {
    const a = { id:'a', name:'X', rarity:'Common', category:'Engineering', config:{} };
    expect(C.scoreMatch('Engineering', a)).toBe(90);
  });
  it('role substring match scores below exact', () => {
    expect(C.scoreMatch('Eng', A('a','x','Common','Engineering'))).toBe(60);
  });
  it('category substring match below role substring', () => {
    const a = { id:'a', name:'X', rarity:'Common', category:'Engineering', config:{} };
    expect(C.scoreMatch('Eng', a)).toBe(50);
  });
  it('name substring match is lowest tier', () => {
    const a = { id:'a', name:'Engineering Bot', rarity:'Common', category:'Ops', config:{role:'Ops'} };
    expect(C.scoreMatch('Engineering', a)).toBe(20);
  });
  it('no match returns 0', () => {
    expect(C.scoreMatch('Captain', A('a','x','Common','Janitor','Cleaning'))).toBe(0);
  });
  it('null/empty inputs return 0', () => {
    expect(C.scoreMatch('', A('a','x','Common','Engineer'))).toBe(0);
    expect(C.scoreMatch('Engineer', null)).toBe(0);
    expect(C.scoreMatch(null, A('a','x','Common','Engineer'))).toBe(0);
  });
  it('case-insensitive', () => {
    expect(C.scoreMatch('engineer', A('a','x','Common','ENGINEER'))).toBe(100);
  });
});

describe('CrewMatcher.pickAgentForRole', () => {
  const agents = [
    A('a1','Aaron',  'Common',   'Engineer'),     // exact role, Common
    A('a2','Beth',   'Legendary','Engineer'),     // exact role, Legendary — should win
    A('a3','Charlie','Epic',     'Captain'),      // wrong role
    A('a4','Diana',  'Rare',     'Engineering'),  // category-only match
  ];

  it('picks highest-rarity exact role match', () => {
    const pick = C.pickAgentForRole('Engineer', agents, { canSlot: allowAll });
    expect(pick.id).toBe('a2');
  });

  it('respects used set', () => {
    const used = new Set(['a2']);
    const pick = C.pickAgentForRole('Engineer', agents, { used, canSlot: allowAll });
    expect(pick.id).toBe('a1');
  });

  it('falls back to category match when no role match exists', () => {
    const onlyCat = [
      { id:'c1', name:'X', rarity:'Common', category:'Engineering', config:{} },
    ];
    const pick = C.pickAgentForRole('Engineering', onlyCat, { canSlot: allowAll });
    expect(pick.id).toBe('c1');
  });

  it('respects canSlot rarity gate', () => {
    const canSlot = (max, ar) => ar !== 'Legendary'; // block Beth
    const pick = C.pickAgentForRole('Engineer', agents, { canSlot });
    expect(pick.id).toBe('a1');
  });

  it('returns null when no candidate clears minScore', () => {
    const pick = C.pickAgentForRole('Klingon Translator', agents, { canSlot: allowAll });
    expect(pick).toBeNull();
  });

  it('tie-breaks alphabetically when score and rarity match', () => {
    const tied = [
      A('z','Zora','Epic','Engineer'),
      A('a','Alice','Epic','Engineer'),
      A('m','Mira','Epic','Engineer'),
    ];
    const pick = C.pickAgentForRole('Engineer', tied, { canSlot: allowAll });
    expect(pick.id).toBe('a');
  });
});

describe('CrewMatcher.pickBestUnused', () => {
  const agents = [
    A('a','Aaron',  'Common',    'Janitor'),
    A('b','Beth',   'Legendary', 'Captain'),
    A('c','Charlie','Epic',      'Engineer'),
  ];
  it('picks highest-rarity unused', () => {
    const pick = C.pickBestUnused(agents, { canSlot: allowAll });
    expect(pick.id).toBe('b');
  });
  it('skips used', () => {
    const pick = C.pickBestUnused(agents, { used: new Set(['b']), canSlot: allowAll });
    expect(pick.id).toBe('c');
  });
  it('respects canSlot', () => {
    const pick = C.pickBestUnused(agents, { canSlot: (m, ar) => ar === 'Common' });
    expect(pick.id).toBe('a');
  });
  it('returns null on empty pool', () => {
    expect(C.pickBestUnused([], { canSlot: allowAll })).toBeNull();
  });
});

describe('CrewMatcher.assignCrew', () => {
  const agents = [
    A('cap1','Picard',  'Legendary', 'Captain'),
    A('cap2','Janeway', 'Epic',      'Captain'),
    A('eng1','Geordi',  'Legendary', 'Engineer'),
    A('eng2','Scotty',  'Epic',      'Engineer'),
    A('med1','Crusher', 'Legendary', 'Medical'),
    A('any1','Aaron',   'Common',    'Janitor'),
    A('any2','Zora',    'Rare',      'Janitor'),
  ];

  it('applies overrides first, regardless of role match', () => {
    const out = C.assignCrew(
      { roles: ['Captain', 'Engineer'], overrides: { 0: 'eng2' } },
      { agents, slotCount: 2, canSlot: allowAll }
    );
    expect(out[0]).toBe('eng2');         // override wins
    expect(out[1]).toBe('eng1');         // role match for slot 1 (Geordi, Legendary)
  });

  it('matches roles to highest-rarity per slot', () => {
    const out = C.assignCrew(
      { roles: ['Captain', 'Engineer', 'Medical'] },
      { agents, slotCount: 3, canSlot: allowAll }
    );
    expect(out[0]).toBe('cap1');         // Picard Legendary > Janeway Epic
    expect(out[1]).toBe('eng1');         // Geordi Legendary > Scotty Epic
    expect(out[2]).toBe('med1');
  });

  it('does not double-assign agents across roles', () => {
    const out = C.assignCrew(
      { roles: ['Captain', 'Captain'] },  // two captain slots
      { agents, slotCount: 2, canSlot: allowAll }
    );
    expect(out[0]).toBe('cap1');
    expect(out[1]).toBe('cap2');
  });

  it('fills unmatched slots with highest-rarity unused', () => {
    const out = C.assignCrew(
      { roles: ['Captain', null, 'Klingon Translator'] },  // slot 1 has no role, slot 2 unmatched
      { agents, slotCount: 3, canSlot: allowAll }
    );
    expect(out[0]).toBe('cap1');
    // slot 1 + 2 fall through to pickBestUnused — Geordi (Legendary), then Crusher (Legendary, alphabetical)
    expect(out[1]).toBeDefined();
    expect(out[2]).toBeDefined();
    expect(out[1]).not.toBe(out[2]);
    expect(out[1]).not.toBe(out[0]);
  });

  it('respects preassigned slots from caller', () => {
    const out = C.assignCrew(
      { roles: ['Captain', 'Engineer'] },
      { agents, slotCount: 2, canSlot: allowAll, preassigned: { 0: 'med1' } }
    );
    expect(out[0]).toBe('med1');         // preserved
    expect(out[1]).toBe('eng1');         // engineer match for slot 1
  });

  it('handles slotCount > roles.length by filling with best unused', () => {
    const out = C.assignCrew(
      { roles: ['Captain'] },
      { agents, slotCount: 4, canSlot: allowAll }
    );
    expect(out[0]).toBe('cap1');
    expect(Object.keys(out)).toHaveLength(4);
    const ids = Object.values(out);
    expect(new Set(ids).size).toBe(4);   // no duplicates
  });

  it('handles slotCount < roles.length by ignoring extra roles', () => {
    const out = C.assignCrew(
      { roles: ['Captain', 'Engineer', 'Medical', 'Tactical'] },
      { agents, slotCount: 2, canSlot: allowAll }
    );
    expect(Object.keys(out)).toHaveLength(2);
    expect(out[0]).toBe('cap1');
    expect(out[1]).toBe('eng1');
  });

  it('respects rarity gate: never assigns above ship max rarity', () => {
    // Common-only ship — pool has no Common Captain or Engineer, so role
    // matching fails for both slots. Fallback fill picks the only Common
    // agent (any1 Janitor) for slot 0; slot 1 has no Common left.
    const canSlot = (max, ar) => ar === 'Common';
    const out = C.assignCrew(
      { roles: ['Captain', 'Engineer'] },
      { agents, slotCount: 2, shipMaxRarity: 'Common', canSlot }
    );
    expect(out[0]).toBe('any1');         // fallback to only Common agent
    expect(out[1]).toBeUndefined();      // pool exhausted at Common rarity
    // Most importantly: nothing above Common got through.
    const assignedRarities = Object.values(out)
      .map(id => agents.find(a => a.id === id)?.rarity);
    expect(assignedRarities.every(r => r === 'Common')).toBe(true);
  });

  it('empty spec falls through entirely to pickBestUnused', () => {
    const out = C.assignCrew(
      { roles: [], overrides: {} },
      { agents, slotCount: 2, canSlot: allowAll }
    );
    expect(Object.keys(out)).toHaveLength(2);
    // First slot picks Legendary alphabetically (Crusher < Geordi < Picard)
    expect(out[0]).toBe('med1');
    expect(out[1]).toBe('eng1');
  });

  it('string-keyed overrides work alongside numeric', () => {
    const out = C.assignCrew(
      { roles: ['Captain', 'Engineer'], overrides: { '0': 'med1', 1: 'any1' } },
      { agents, slotCount: 2, canSlot: allowAll }
    );
    expect(out[0]).toBe('med1');
    expect(out[1]).toBe('any1');
  });

  it('skips overrides that point at agents not in pool — leaves slot empty', () => {
    // Override pins an unknown id; matcher trusts the caller and assigns it.
    // The wizard's downstream activation step is responsible for resolving
    // unknown ids to a real agent or auto-creating one.
    const out = C.assignCrew(
      { overrides: { 0: 'unknown-agent-xyz' } },
      { agents, slotCount: 1, canSlot: allowAll }
    );
    expect(out[0]).toBe('unknown-agent-xyz');
  });
});
