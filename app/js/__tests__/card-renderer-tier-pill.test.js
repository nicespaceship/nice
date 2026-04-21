import { describe, it, expect } from 'vitest';

/**
 * Tier pill tests — verifies the FREE/PRO badge that surfaces
 * blueprint.config.model_profile.tier on TCG cards.
 *
 * The pill is the user-visible side of the model_profile rarity ladder
 * — without it, users have no way to tell at a glance which agents will
 * cost tokens before they activate them.
 */
describe('CardRenderer tier pill', () => {
  const baseAgent = {
    id: 'bp-test-1',
    name: 'Test Bot',
    category: 'Ops',
    rarity: 'Common',
    description: 'A test agent',
    flavor: 'Test flavor',
    stats: { spd: '2.0s', acc: '90%', cap: '∞', pwr: '70' },
    metadata: { caps: ['Does test things'] },
    config: { role: 'Operations', tools: [] },
  };

  describe('full card', () => {
    it('renders FREE pill for free tier blueprints', () => {
      const bp = { ...baseAgent, config: { ...baseAgent.config, model_profile: { tier: 'free' } } };
      const html = CardRenderer.render('agent', 'full', bp, {});
      expect(html).toContain('blueprint-card-tier-pill');
      expect(html).toContain('blueprint-card-tier-pill--free');
      expect(html).toContain('>FREE<');
    });

    it('renders PRO pill for premium tier blueprints', () => {
      const bp = { ...baseAgent, rarity: 'Legendary', config: { ...baseAgent.config, model_profile: { tier: 'premium' } } };
      const html = CardRenderer.render('agent', 'full', bp, {});
      expect(html).toContain('blueprint-card-tier-pill--premium');
      expect(html).toContain('>PRO<');
    });

    it('renders no pill when model_profile is missing', () => {
      const html = CardRenderer.render('agent', 'full', baseAgent, {});
      expect(html).not.toContain('blueprint-card-tier-pill');
    });

    it('renders no pill when tier is unknown', () => {
      const bp = { ...baseAgent, config: { ...baseAgent.config, model_profile: { tier: 'gold' } } };
      const html = CardRenderer.render('agent', 'full', bp, {});
      expect(html).not.toContain('blueprint-card-tier-pill');
    });

    it('places the pill inside the name bar', () => {
      const bp = { ...baseAgent, config: { ...baseAgent.config, model_profile: { tier: 'free' } } };
      const html = CardRenderer.render('agent', 'full', bp, {});
      // Pill should appear between the name bar opening and its closing div
      const nameBarStart = html.indexOf('blueprint-card-name-bar');
      const pillIdx = html.indexOf('blueprint-card-tier-pill');
      const artStart = html.indexOf('blueprint-card-art');
      expect(nameBarStart).toBeGreaterThan(-1);
      expect(pillIdx).toBeGreaterThan(nameBarStart);
      expect(pillIdx).toBeLessThan(artStart);
    });

    it('includes a tooltip explaining what the tier means', () => {
      const free = CardRenderer.render('agent', 'full', { ...baseAgent, config: { ...baseAgent.config, model_profile: { tier: 'free' } } }, {});
      const prem = CardRenderer.render('agent', 'full', { ...baseAgent, rarity: 'Legendary', config: { ...baseAgent.config, model_profile: { tier: 'premium' } } }, {});
      expect(free).toContain('no token cost');
      expect(prem).toContain('costs tokens');
    });
  });

  describe('grid card', () => {
    it('renders the pill on grid view too', () => {
      const bp = { ...baseAgent, config: { ...baseAgent.config, model_profile: { tier: 'premium' } } };
      const html = CardRenderer.render('agent', 'grid', bp, {});
      expect(html).toContain('blueprint-card-tier-pill--premium');
      expect(html).toContain('>PRO<');
    });

    it('renders no pill on grid when model_profile is missing', () => {
      const html = CardRenderer.render('agent', 'grid', baseAgent, {});
      expect(html).not.toContain('blueprint-card-tier-pill');
    });
  });

  describe('case insensitivity and edge cases', () => {
    it('handles tier value with different casing', () => {
      const bp1 = { ...baseAgent, config: { ...baseAgent.config, model_profile: { tier: 'FREE' } } };
      const bp2 = { ...baseAgent, config: { ...baseAgent.config, model_profile: { tier: 'Premium' } } };
      const h1 = CardRenderer.render('agent', 'full', bp1, {});
      const h2 = CardRenderer.render('agent', 'full', bp2, {});
      expect(h1).toContain('blueprint-card-tier-pill--free');
      expect(h2).toContain('blueprint-card-tier-pill--premium');
    });

    it('does not crash on null/undefined config', () => {
      const bp = { ...baseAgent, config: null };
      expect(() => CardRenderer.render('agent', 'full', bp, {})).not.toThrow();
    });

    it('does not crash when model_profile has no tier field', () => {
      const bp = { ...baseAgent, config: { ...baseAgent.config, model_profile: { preferred: 'gemini-2.5-flash' } } };
      const html = CardRenderer.render('agent', 'full', bp, {});
      expect(html).not.toContain('blueprint-card-tier-pill');
    });
  });
});
