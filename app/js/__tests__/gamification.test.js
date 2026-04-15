import { describe, it, expect, beforeEach } from 'vitest';

// Gamification is loaded globally by setup.js

describe('Gamification', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('XP', () => {
    it('should start with 0 XP', () => {
      expect(Gamification.getXP()).toBe(0);
    });

    it('should add XP for known actions', () => {
      const amount = Gamification.addXP('create_agent');
      expect(amount).toBe(20);
      expect(Gamification.getXP()).toBe(20);
    });

    it('should return 0 for unknown actions', () => {
      const amount = Gamification.addXP('unknown_action');
      expect(amount).toBe(0);
      expect(Gamification.getXP()).toBe(0);
    });

    it('should accumulate XP across actions', () => {
      Gamification.addXP('create_agent');    // 20
      Gamification.addXP('complete_mission'); // 15
      Gamification.addXP('chat_agent');       // 5
      expect(Gamification.getXP()).toBe(40);
    });
  });

  describe('Ranks', () => {
    it('should start at Ensign rank', () => {
      const rank = Gamification.getRank(0);
      expect(rank.name).toBe('Ensign');
    });

    it('should progress to Lieutenant JG at 10000 XP', () => {
      const rank = Gamification.getRank(10000);
      expect(rank.name).toBe('Lieutenant JG');
    });

    it('should progress to Commander at 100000 XP', () => {
      const rank = Gamification.getRank(100000);
      expect(rank.name).toBe('Commander');
    });

    it('should progress to Captain at 200000 XP', () => {
      const rank = Gamification.getRank(200000);
      expect(rank.name).toBe('Captain');
    });

    it('should get next rank correctly', () => {
      const next = Gamification.getNextRank(5000);
      expect(next.name).toBe('Lieutenant JG');
      expect(next.xp).toBe(10000);
    });

    it('should return null for max rank', () => {
      const next = Gamification.getNextRank(2500000);
      expect(next).toBeNull();
    });

    it('should calculate rank progress percentage', () => {
      // At 5000 XP, between Ensign(0) and Lieutenant JG(10000) = 50%
      const pct = Gamification.getRankProgress(5000);
      expect(pct).toBe(50);
    });

    it('should return 100% at max rank', () => {
      const pct = Gamification.getRankProgress(2500000);
      expect(pct).toBe(100);
    });
  });

  describe('XP Progression Classes', () => {
    it('should return class-1 for current rank (0 XP)', () => {
      const cls = Gamification.getCurrentClass();
      expect(cls.id).toBe('class-1');
      expect(cls.maxRarity).toBe('Common');
    });

    it('should check rarity unlock at 0 XP', () => {
      expect(Gamification.isRarityUnlocked('Common')).toBe(true);
      expect(Gamification.isRarityUnlocked('Rare')).toBe(false);
    });
  });

  describe('Slot Progression', () => {
    it('RANKS all have 6 slots — slot count is sub-based, not rank-based', () => {
      // Every rank now grants 6 slots — Pro subscription (handled in
      // Subscription.getSlotLimit) is the only thing that bumps it to 12.
      for (const rank of Gamification.RANKS) {
        expect(rank.slots).toBe(6);
      }
    });

    it('RANKS still have maxRarity progression (Common → Legendary)', () => {
      expect(Gamification.RANKS[0].maxRarity).toBe('Common');
      expect(Gamification.RANKS[5].maxRarity).toBe('Legendary'); // Captain
      // Fleet Admiral caps at Legendary — Mythic is milestone-only
      const fleetAdmiral = Gamification.RANKS[Gamification.RANKS.length - 1];
      expect(fleetAdmiral.name).toBe('Fleet Admiral');
      expect(fleetAdmiral.maxRarity).toBe('Legendary');
    });

    it('getMaxSlots returns 6 for free user (no Subscription)', () => {
      // setup.js does not load Subscription, so getMaxSlots falls back to 6
      expect(Gamification.getMaxSlots()).toBe(6);
    });

    it('getSlotTemplate generates correct slot count with Common rarity (free tier)', () => {
      const template = Gamification.getSlotTemplate(7);
      expect(template.slots).toHaveLength(7);
      expect(template.slots[0].label).toBe('Bridge');
      expect(template.slots[0].maxRarity).toBe('Common');
      expect(template.slots[3].maxRarity).toBe('Common');
    });

    it('getSlotTemplate defaults to getMaxSlots', () => {
      const template = Gamification.getSlotTemplate();
      expect(template.slots.length).toBe(Gamification.getMaxSlots());
    });
  });

  describe('Achievements', () => {
    it('should start with no achievements', () => {
      const unlocked = Gamification.getUnlockedAchievements();
      expect(unlocked).toHaveLength(0);
    });

    it('should unlock an achievement', () => {
      const result = Gamification.unlockAchievement('first-agent');
      expect(result).toBe(true);
      expect(Gamification.getUnlockedAchievements()).toHaveLength(1);
    });

    it('should not double-unlock', () => {
      Gamification.unlockAchievement('first-agent');
      const result = Gamification.unlockAchievement('first-agent');
      expect(result).toBe(false);
      expect(Gamification.getUnlockedAchievements()).toHaveLength(1);
    });

    it('should reject unknown achievement IDs', () => {
      const result = Gamification.unlockAchievement('fake-achievement');
      expect(result).toBe(false);
    });
  });

  describe('Resources', () => {
    it('should calculate resources from state', () => {
      State.set('agents', []);
      State.set('missions', []);
      const res = Gamification.getResources();
      expect(res).toHaveProperty('tokens');
      expect(res).toHaveProperty('power');
      expect(res).toHaveProperty('credits');
    });
  });

  describe('Agent Rarity', () => {
    it('should score a basic agent as Common', () => {
      const agent = {
        llm_engine: 'gpt-4o-mini',
        type: 'Specialist',
        config: { tools: [], memory: false, temperature: 0.7 }
      };
      const rarity = Gamification.calcAgentRarity(agent);
      expect(rarity.name).toBe('Common');
      expect(rarity.score).toBeLessThanOrEqual(3);
    });

    it('should score a mid-range agent as Rare', () => {
      const agent = {
        llm_engine: 'claude-3.5',
        type: 'Specialist',
        config: { tools: ['A', 'B', 'C'], memory: false, temperature: 0.7 }
      };
      const rarity = Gamification.calcAgentRarity(agent);
      expect(rarity.name).toBe('Rare');
    });

    it('should score an advanced agent as Epic', () => {
      const agent = {
        llm_engine: 'claude-4',
        type: 'Hybrid',
        config: { tools: ['A', 'B', 'C', 'D'], memory: true, temperature: 0.7 }
      };
      const rarity = Gamification.calcAgentRarity(agent);
      expect(rarity.name).toBe('Epic');
    });

    it('should score a fully-loaded agent as Legendary', () => {
      const agent = {
        llm_engine: 'claude-4',
        type: 'General',
        config: { tools: ['A','B','C','D','E','F','G'], memory: true, temperature: 0.5 }
      };
      const rarity = Gamification.calcAgentRarity(agent);
      expect(rarity.name).toBe('Legendary');
    });

    it('should handle null/undefined agent gracefully', () => {
      expect(Gamification.calcAgentRarity(null).name).toBe('Common');
      expect(Gamification.calcAgentRarity(undefined).name).toBe('Common');
    });

    it('should handle agent with missing config', () => {
      const agent = { llm_engine: 'claude-4', type: 'Specialist' };
      const rarity = Gamification.calcAgentRarity(agent);
      expect(rarity.name).toBeDefined();
    });

    it('should include rarity color', () => {
      const agent = { llm_engine: 'claude-4', type: 'General', config: { tools: ['A','B','C','D','E','F','G'], memory: true, temperature: 0.5 } };
      const rarity = Gamification.calcAgentRarity(agent);
      expect(rarity.color).toBe('#f59e0b');
    });
  });

  describe('Slot Acceptance', () => {
    it('should accept Common in a Rare slot', () => {
      expect(Gamification.canSlotAccept('Rare', 'Common')).toBe(true);
    });

    it('should accept Rare in a Rare slot', () => {
      expect(Gamification.canSlotAccept('Rare', 'Rare')).toBe(true);
    });

    it('should reject Epic in a Rare slot', () => {
      expect(Gamification.canSlotAccept('Rare', 'Epic')).toBe(false);
    });

    it('should reject Legendary in an Epic slot', () => {
      expect(Gamification.canSlotAccept('Epic', 'Legendary')).toBe(false);
    });

    it('should accept any rarity in a Legendary slot', () => {
      expect(Gamification.canSlotAccept('Legendary', 'Common')).toBe(true);
      expect(Gamification.canSlotAccept('Legendary', 'Rare')).toBe(true);
      expect(Gamification.canSlotAccept('Legendary', 'Epic')).toBe(true);
      expect(Gamification.canSlotAccept('Legendary', 'Legendary')).toBe(true);
    });

    it('should reject Mythic in a Legendary slot', () => {
      expect(Gamification.canSlotAccept('Legendary', 'Mythic')).toBe(false);
    });

    it('should accept any rarity in a Mythic slot', () => {
      expect(Gamification.canSlotAccept('Mythic', 'Common')).toBe(true);
      expect(Gamification.canSlotAccept('Mythic', 'Rare')).toBe(true);
      expect(Gamification.canSlotAccept('Mythic', 'Epic')).toBe(true);
      expect(Gamification.canSlotAccept('Mythic', 'Legendary')).toBe(true);
      expect(Gamification.canSlotAccept('Mythic', 'Mythic')).toBe(true);
    });
  });

  describe('Spaceship Classes', () => {
    it('should have 5 spaceship classes', () => {
      expect(Gamification.SPACESHIP_CLASSES).toHaveLength(5);
    });

    it('class-1: 6 slots, Common max rarity', () => {
      const cls = Gamification.getSpaceshipClass('class-1');
      expect(cls.id).toBe('class-1');
      expect(cls.slots).toHaveLength(6);
      expect(cls.maxRarity).toBe('Common');
      expect(cls.slots[0].maxRarity).toBe('Common');
    });

    it('class-2: 6 slots, Rare max rarity', () => {
      // Slot count is now sub-based, not class-based — every free
      // class is 6 slots; Pro upgrade to class-5 jumps to 12.
      const cls = Gamification.getSpaceshipClass('class-2');
      expect(cls.slots).toHaveLength(6);
      expect(cls.maxRarity).toBe('Rare');
    });

    it('class-3: 6 slots, Epic max rarity', () => {
      const cls = Gamification.getSpaceshipClass('class-3');
      expect(cls.slots).toHaveLength(6);
      expect(cls.maxRarity).toBe('Epic');
    });

    it('class-4: 6 slots, Legendary max rarity', () => {
      const cls = Gamification.getSpaceshipClass('class-4');
      expect(cls.slots).toHaveLength(6);
      expect(cls.maxRarity).toBe('Legendary');
    });

    it('class-5: 12 Legendary slots (Pro subscription)', () => {
      // Pro plan grants 12 slots and instant Legendary; Mythic is
      // milestone-only, never granted by class or subscription.
      const cls = Gamification.getSpaceshipClass('class-5');
      expect(cls.slots).toHaveLength(12);
      expect(cls.maxRarity).toBe('Legendary');
      expect(cls.subscription).toBe(true);
    });

    it('should fallback to dynamic template for unknown ID', () => {
      const cls = Gamification.getSpaceshipClass('unknown');
      expect(cls.slots.length).toBeGreaterThanOrEqual(6);
    });

    it('should render a rarity badge', () => {
      const badge = Gamification.renderRarityBadge('Epic');
      expect(badge).toContain('rarity-epic');
      expect(badge).toContain('Epic');
    });
  });

  describe('Streak Multipliers', () => {
    it('should return 1.0x for no streak', () => {
      expect(Gamification.getStreakMultiplier()).toBe(1.0);
    });

    it('should return 1.25x for 3-day streak', () => {
      localStorage.setItem('nice-streak', '3');
      localStorage.setItem('nice-last-active', new Date().toDateString());
      expect(Gamification.getStreakMultiplier()).toBe(1.25);
    });

    it('should return 1.5x for 7-day streak', () => {
      localStorage.setItem('nice-streak', '7');
      localStorage.setItem('nice-last-active', new Date().toDateString());
      expect(Gamification.getStreakMultiplier()).toBe(1.5);
    });

    it('should return 2.0x for 30+ day streak', () => {
      localStorage.setItem('nice-streak', '30');
      localStorage.setItem('nice-last-active', new Date().toDateString());
      expect(Gamification.getStreakMultiplier()).toBe(2.0);
    });

    it('should apply streak multiplier to XP', () => {
      localStorage.setItem('nice-streak', '7');
      localStorage.setItem('nice-last-active', new Date().toDateString());
      const amount = Gamification.addXP('create_agent'); // 20 * 1.5 = 30
      expect(amount).toBe(30);
      expect(Gamification.getXP()).toBe(30);
    });
  });

  describe('Mission XP Scaling', () => {
    it('should return base XP for medium priority', () => {
      const xp = Gamification.getMissionXP({ priority: 'medium' });
      expect(xp).toBe(15); // base 15 * 1.0 * 1.0
    });

    it('should scale down for low priority', () => {
      const xp = Gamification.getMissionXP({ priority: 'low' });
      expect(xp).toBe(11); // 15 * 0.75 = 11.25 → 11
    });

    it('should scale up for critical priority', () => {
      const xp = Gamification.getMissionXP({ priority: 'critical' });
      expect(xp).toBe(30); // 15 * 2.0
    });

    it('should combine priority and streak multipliers', () => {
      localStorage.setItem('nice-streak', '7');
      localStorage.setItem('nice-last-active', new Date().toDateString());
      const xp = Gamification.getMissionXP({ priority: 'high' });
      expect(xp).toBe(34); // 15 * 1.5 * 1.5 = 33.75 → 34
    });

    it('should add mission XP to total', () => {
      const amount = Gamification.addMissionXP({ priority: 'critical' });
      expect(amount).toBe(30);
      expect(Gamification.getXP()).toBe(30);
    });
  });

  describe('Missing XP Actions', () => {
    it('should award XP for create_station', () => {
      expect(Gamification.XP_ACTIONS.create_station).toBe(60);
    });

    it('should award XP for install_blueprint', () => {
      expect(Gamification.XP_ACTIONS.install_blueprint).toBe(15);
    });
  });

  describe('Streak Achievements', () => {
    it('should have streak-7 achievement defined', () => {
      expect(Gamification.ACHIEVEMENTS.find(a => a.id === 'streak-7')).toBeDefined();
    });

    it('should have streak-14 achievement defined', () => {
      expect(Gamification.ACHIEVEMENTS.find(a => a.id === 'streak-14')).toBeDefined();
    });

    it('should have streak-30 achievement defined', () => {
      expect(Gamification.ACHIEVEMENTS.find(a => a.id === 'streak-30')).toBeDefined();
    });

    it('should unlock streak-7 when streak >= 7', () => {
      localStorage.setItem('nice-streak', '7');
      localStorage.setItem('nice-last-active', new Date().toDateString());
      State.set('agents', []);
      State.set('missions', []);
      State.set('spaceships', []);
      Gamification.checkAchievements();
      const unlocked = Gamification.getUnlockedAchievements();
      expect(unlocked.find(a => a.id === 'streak-7')).toBeDefined();
    });
  });

  describe('Agent Progression', () => {
    beforeEach(() => {
      localStorage.removeItem('nice-agent-stats');
    });

    it('should record an agent mission', () => {
      const s = Gamification.recordAgentMission('agent-1', { success: true, tokens: 50, tools: ['search'] });
      expect(s.missions_completed).toBe(1);
      expect(s.missions_succeeded).toBe(1);
      expect(s.tokens_consumed).toBe(50);
      expect(s.tools_used).toContain('search');
    });

    it('should accumulate mission stats', () => {
      Gamification.recordAgentMission('agent-2', { success: true, tokens: 30 });
      Gamification.recordAgentMission('agent-2', { success: true, tokens: 20 });
      Gamification.recordAgentMission('agent-2', { success: false, tokens: 10 });
      const s = Gamification.getAgentStats('agent-2');
      expect(s.missions_completed).toBe(3);
      expect(s.missions_succeeded).toBe(2);
      expect(s.tokens_consumed).toBe(60);
    });

    it('should return null for unknown agent', () => {
      expect(Gamification.getAgentStats('nonexistent')).toBeNull();
    });

    it('should check epic milestone', () => {
      for (let i = 0; i < 25; i++) {
        Gamification.recordAgentMission('agent-epic', { success: true, tokens: 25, tools: ['a', 'b', 'c'] });
      }
      const stats = JSON.parse(localStorage.getItem('nice-agent-stats'));
      stats['agent-epic'].active_days = 14;
      localStorage.setItem('nice-agent-stats', JSON.stringify(stats));

      const milestone = Gamification.checkAgentMilestone('agent-epic');
      expect(milestone.epicMet).toBe(true);
      expect(milestone.earnedRarity).toBe('Epic');
    });

    it('should calculate progression percentage', () => {
      Gamification.recordAgentMission('agent-prog', { success: true, tokens: 10 });
      const prog = Gamification.getAgentProgression('agent-prog');
      expect(prog.level).toBe(0);
      expect(prog.nextMilestone).toBe('Epic');
      expect(typeof prog.progress).toBe('number');
    });
  });

  describe('Rarity Unlock Gating', () => {
    it('should unlock Common at Ensign rank (0 XP)', () => {
      localStorage.setItem('nice-xp', '0');
      expect(Gamification.isRarityUnlocked('Common')).toBe(true);
    });

    it('should block Rare at Ensign rank', () => {
      localStorage.setItem('nice-xp', '0');
      expect(Gamification.isRarityUnlocked('Rare')).toBe(false);
    });

    it('should unlock Rare at Lieutenant rank (25K XP)', () => {
      localStorage.setItem('nice-xp', '25000');
      expect(Gamification.isRarityUnlocked('Rare')).toBe(true);
    });

    it('should block Legendary below Captain rank', () => {
      localStorage.setItem('nice-xp', '100000');
      expect(Gamification.isRarityUnlocked('Legendary')).toBe(false);
    });

    it('should unlock Legendary at Captain rank (200K XP)', () => {
      localStorage.setItem('nice-xp', '200000');
      expect(Gamification.isRarityUnlocked('Legendary')).toBe(true);
    });

    it('should never unlock Mythic via rank — Mythic is milestone-only', () => {
      // Even at the highest rank (Fleet Admiral, 2.5M XP), Mythic is
      // not granted by rank or subscription. It's earned through
      // milestone achievements outside the rank ladder.
      localStorage.setItem('nice-xp', '2500000');
      expect(Gamification.isRarityUnlocked('Mythic')).toBe(false);
    });
  });

  describe('Mythic Rarity Threshold', () => {
    it('should not compute Mythic from agent config (max score is 13, threshold is 14)', () => {
      // Maxed out agent: top model (4) + General (3) + 7 tools (4) + memory (1) + non-default temp (1) = 13
      const maxAgent = {
        llm_engine: 'claude-4',
        type: 'General',
        config: { tools: ['A','B','C','D','E','F','G'], memory: true, temperature: 0.3 }
      };
      const rarity = Gamification.calcAgentRarity(maxAgent);
      expect(rarity.name).not.toBe('Mythic');
      expect(rarity.score).toBeLessThan(14);
    });
  });

  describe('Progression Info', () => {
    it('should return progression to next tier', () => {
      localStorage.setItem('nice-xp', '5000');
      const p = Gamification.getProgressToNextTier();
      expect(p.rank.name).toBe('Ensign');
      expect(p.nextRank).toBeDefined();
      expect(p.nextRank.name).toBe('Lieutenant JG');
      expect(p.xpNeeded).toBe(5000);
      expect(p.progress).toBe(50);
    });

    it('should return 0 xpNeeded at max rank', () => {
      localStorage.setItem('nice-xp', '3000000');
      const p = Gamification.getProgressToNextTier();
      expect(p.rank.name).toBe('Fleet Admiral');
      expect(p.nextRank).toBeNull();
      expect(p.xpNeeded).toBe(0);
      expect(p.progress).toBe(100);
    });
  });
});
