import { describe, it, expect } from 'vitest';

describe('CardRenderer — marquee field preference', () => {
  const BASE_SHIP = {
    id: 'bp-marquee-ship',
    name: 'Test Ship',
    type: 'spaceship',
    rarity: 'Common',
    tags: [],
    description: 'A long-form description that should NOT appear on the scrolling marquee.',
    flavor: 'A flavor scene.',
    stats: { crew: 6, slots: 12 },
  };

  function extractMarqueeSpans(html) {
    const re = /<div class="blueprint-card-marquee-track">([\s\S]*?)<\/div>/;
    const m = html.match(re);
    if (!m) return null;
    return Array.from(m[1].matchAll(/<span>([^<]*)<\/span>/g)).map(x => x[1]);
  }

  it('uses bp.marquee when present', () => {
    const ship = { ...BASE_SHIP, marquee: 'Schedule, encounter, document, bill.' };
    const html = CardRenderer.render('spaceship', 'full', ship);
    const spans = extractMarqueeSpans(html);
    expect(spans).toEqual([
      'Schedule, encounter, document, bill.',
      'Schedule, encounter, document, bill.',
    ]);
    // Long-form description must NOT leak into the marquee
    expect(spans[0]).not.toContain('long-form description');
  });

  it('falls back to bp.description when marquee is missing', () => {
    const html = CardRenderer.render('spaceship', 'full', BASE_SHIP);
    const spans = extractMarqueeSpans(html);
    expect(spans[0]).toContain('long-form description');
  });

  it('falls back to bp.description when marquee is empty string', () => {
    const ship = { ...BASE_SHIP, marquee: '' };
    const html = CardRenderer.render('spaceship', 'full', ship);
    const spans = extractMarqueeSpans(html);
    expect(spans[0]).toContain('long-form description');
  });

  it('escapes marquee HTML', () => {
    const ship = { ...BASE_SHIP, marquee: 'Build, <ship>, deploy.' };
    const html = CardRenderer.render('spaceship', 'full', ship);
    const spans = extractMarqueeSpans(html);
    expect(spans[0]).toContain('&lt;ship&gt;');
    expect(spans[0]).not.toContain('<ship>');
  });

  it('also applies to agent cards', () => {
    const agent = {
      id: 'bp-marquee-agent',
      name: 'A',
      type: 'agent',
      rarity: 'Common',
      tags: [],
      description: 'long agent description',
      marquee: 'Read, summarize, cite.',
      stats: { spd: '1', acc: '1', cap: '1', pwr: '1' },
    };
    const html = CardRenderer.render('agent', 'full', agent);
    const spans = extractMarqueeSpans(html);
    expect(spans[0]).toBe('Read, summarize, cite.');
  });
});
