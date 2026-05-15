import { describe, it, expect } from 'vitest';

// BlueprintUtils + Gamification are loaded globally by setup.js.

describe('BlueprintUtils.getSlotTemplate — min_class propagation', () => {
  it('lifts min_class from crew defs onto the slot template entries', () => {
    // Mirrors the live shape `_translateSpaceshipBlueprintRow` produces from a
    // `ship_slots` join: each crew entry is `{ label, role, slot, agent_id,
    // min_class }`. Card renderer + wizard read the template, so the
    // propagation here is what drives the lock visual end-to-end.
    const bp = {
      name: 'The Madison',
      stats: { slots: '12' },
      metadata: {
        crew: [
          { label: 'Agency Director', min_class: 'class-1' },
          { label: 'Account Director', min_class: 'class-1' },
          { label: 'Creative Director', min_class: 'class-1' },
          { label: 'Campaign Manager', min_class: 'class-1' },
          { label: 'Project Manager', min_class: 'class-1' },
          { label: 'Copywriter', min_class: 'class-1' },
          { label: 'Comms Lead', min_class: 'class-2' },
          { label: 'Media Producer', min_class: 'class-2' },
          { label: 'Performance Lead', min_class: 'class-3' },
          { label: 'Studio Manager', min_class: 'class-3' },
          { label: 'Strategy Lead', min_class: 'class-4' },
          { label: 'Finance Lead', min_class: 'class-4' },
        ],
      },
    };
    const tmpl = BlueprintUtils.getSlotTemplate(bp);
    expect(tmpl.slots).toHaveLength(12);
    expect(tmpl.slots[0].min_class).toBe('class-1');
    expect(tmpl.slots[5].min_class).toBe('class-1');
    expect(tmpl.slots[6].min_class).toBe('class-2');
    expect(tmpl.slots[8].min_class).toBe('class-3');
    expect(tmpl.slots[10].min_class).toBe('class-4');
  });

  it('defaults to class-1 when a crew entry has no min_class', () => {
    const bp = {
      stats: { slots: '3' },
      metadata: { crew: [{ label: 'A' }, { label: 'B' }, {}] },
    };
    const tmpl = BlueprintUtils.getSlotTemplate(bp);
    expect(tmpl.slots.every(s => s.min_class === 'class-1')).toBe(true);
  });

  it('defaults to class-1 when a slot has no matching crew def', () => {
    // Synthetic slots beyond crew length (e.g. older blueprints whose
    // `stats.slots` exceeds metadata.crew.length) still receive a sensible
    // default so the lock comparator never trips on an undefined value.
    const bp = {
      stats: { slots: '5' },
      metadata: { crew: [{ label: 'A', min_class: 'class-2' }] },
    };
    const tmpl = BlueprintUtils.getSlotTemplate(bp);
    expect(tmpl.slots[0].min_class).toBe('class-2');
    expect(tmpl.slots[4].min_class).toBe('class-1');
  });
});
