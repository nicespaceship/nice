/**
 * WalletView render tests — first consumer of the view-harness helper.
 *
 * Pins the billing surface that real money flows through: plan/add-on cards,
 * Pro-gated token-balance + top-up sections, the past-due and self-host
 * banners, per-pool balance math, the transaction ledger, and that each
 * billing button dispatches the right Subscription call.
 *
 * Loads the REAL Subscription + StripeConfig libs (so PLANS / ADDONS / top-up
 * data never drift from production) and overrides only the methods a test
 * needs to control (isPro / getAddons / paywallEnabled / getSubscription) plus
 * spies on the action methods.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installViewMocks, loadModule, mountView } from './helpers/view-harness.js';

const mocks = installViewMocks();
loadModule('lib/stripe-config.js'); // real top-up catalog
loadModule('lib/subscription.js');  // real PLANS / ADDONS
loadModule('views/wallet.js');

/** Override the controllable surface of the real Subscription lib. */
function configureSub({ isPro = false, addons = [], paywall = true, sub = null } = {}) {
  Subscription.isPro = () => isPro;
  Subscription.getAddons = () => addons;
  Subscription.paywallEnabled = () => paywall;
  Subscription.getSubscription = async () => sub;
  Subscription.subscribe = vi.fn(async () => {});
  Subscription.openBillingPortal = vi.fn(async () => {});
  Subscription.setAddon = vi.fn(async () => {});
  Subscription.buyTopUp = vi.fn(async () => {});
}

// A token_balance must exist in State or render's _awaitBalance polls for 3s.
const BAL = (pools = {}) => ({ pools });

beforeEach(() => {
  configureSub();              // default: free user, paywall on
  globalThis.SB.client = null; // offline by default
});

describe('WalletView', () => {
  it('exposes the title "Wallet"', () => {
    expect(WalletView.title).toBe('Wallet');
  });

  it('renders the wallet shell without throwing (free user)', async () => {
    const { el } = await mountView(WalletView, { state: { token_balance: BAL() } });
    expect(el.querySelector('.wallet-wrap')).toBeTruthy();
    expect(el.innerHTML.length).toBeGreaterThan(0);
  });

  it('always renders the four plan + add-on cards', async () => {
    const { el } = await mountView(WalletView, { state: { token_balance: BAL() } });
    expect(el.querySelectorAll('.wallet-plan-card').length).toBe(4);
    expect(el.querySelector('[data-plan="free"]')).toBeTruthy();
    expect(el.querySelector('[data-plan="pro"]')).toBeTruthy();
    expect(el.querySelector('[data-addon="claude"]')).toBeTruthy();
    expect(el.querySelector('[data-addon="premium"]')).toBeTruthy();
  });

  describe('free user', () => {
    beforeEach(() => configureSub({ isPro: false }));

    it('offers "Upgrade to Pro" and hides "Cancel Pro"', async () => {
      const { el } = await mountView(WalletView, { state: { token_balance: BAL() } });
      expect(el.querySelector('[data-action="subscribe-pro"]')).toBeTruthy();
      expect(el.querySelector('[data-action="cancel-pro"]')).toBeNull();
    });

    it('hides the token-balance section (Pro-gated)', async () => {
      const { el } = await mountView(WalletView, { state: { token_balance: BAL() } });
      expect(el.querySelector('.wallet-balance-grid')).toBeNull();
    });

    it('locks top-ups behind a Pro note instead of a grid', async () => {
      const { el } = await mountView(WalletView, { state: { token_balance: BAL() } });
      expect(el.querySelector('.wallet-locked-note')).toBeTruthy();
      expect(el.querySelector('.wallet-topup-grid')).toBeNull();
    });

    it('disables the add-on buttons with "Pro required"', async () => {
      const { el } = await mountView(WalletView, { state: { token_balance: BAL() } });
      const claudeBtn = el.querySelector('[data-addon="claude"] button');
      expect(claudeBtn.disabled).toBe(true);
      expect(claudeBtn.textContent).toContain('Pro required');
    });
  });

  describe('Pro user (no add-ons)', () => {
    beforeEach(() => configureSub({ isPro: true, addons: [] }));

    it('offers "Cancel Pro" and hides "Upgrade"', async () => {
      const { el } = await mountView(WalletView, { state: { token_balance: BAL() } });
      expect(el.querySelector('[data-action="cancel-pro"]')).toBeTruthy();
      expect(el.querySelector('[data-action="subscribe-pro"]')).toBeNull();
    });

    it('renders the standard pool balance only', async () => {
      const { el } = await mountView(WalletView, { state: { token_balance: BAL() } });
      const cards = el.querySelectorAll('.wallet-balance-card');
      expect(cards.length).toBe(1);
      // Scope to the balance labels — the add-on card desc ("500 Claude
      // tokens/month") always renders and would falsely match innerHTML.
      const labels = [...el.querySelectorAll('.wallet-balance-label')].map(n => n.textContent);
      expect(labels).toContain('Standard tokens');
      expect(labels).not.toContain('Claude tokens');
    });

    it('shows standard top-ups but not claude/premium ones', async () => {
      const { el } = await mountView(WalletView, { state: { token_balance: BAL() } });
      const packs = el.querySelectorAll('.wallet-package');
      expect(packs.length).toBeGreaterThan(0);
      expect(el.querySelector('.wallet-package--standard')).toBeTruthy();
      expect(el.querySelector('.wallet-package--claude')).toBeNull();
    });

    it('offers to add the Claude add-on', async () => {
      const { el } = await mountView(WalletView, { state: { token_balance: BAL() } });
      const btn = el.querySelector('[data-action="add-claude"]');
      expect(btn).toBeTruthy();
      expect(btn.disabled).toBe(false);
    });

    it('computes pool totals from allowance − used + purchased', async () => {
      const pools = { standard: { allowance: 1000, used: 200, purchased: 50 } };
      const { el } = await mountView(WalletView, { state: { token_balance: BAL(pools) } });
      const num = el.querySelector('.wallet-balance-num');
      expect(num.textContent).toBe('850'); // (1000-200) + 50
      expect(el.querySelector('.wallet-balance-breakdown').textContent).toContain('800');
    });
  });

  describe('Pro user with the Claude add-on', () => {
    beforeEach(() => configureSub({ isPro: true, addons: ['claude'] }));

    it('renders the claude pool balance', async () => {
      const pools = { standard: {}, claude: { allowance: 500, used: 0, purchased: 0 } };
      const { el } = await mountView(WalletView, { state: { token_balance: BAL(pools) } });
      const labels = [...el.querySelectorAll('.wallet-balance-label')].map(n => n.textContent);
      expect(labels).toContain('Claude tokens'); // the pool-balance card, not the add-on desc
      expect(el.querySelectorAll('.wallet-balance-card').length).toBe(2); // standard + claude
    });

    it('offers to cancel the claude add-on (own Stripe subscription)', async () => {
      const { el } = await mountView(WalletView, { state: { token_balance: BAL() } });
      const btn = el.querySelector('[data-action="cancel-claude"]');
      expect(btn).toBeTruthy();
      expect(btn.textContent).toContain('Cancel add-on');
    });

    it('surfaces claude top-up packages', async () => {
      const { el } = await mountView(WalletView, { state: { token_balance: BAL() } });
      expect(el.querySelector('.wallet-package--claude')).toBeTruthy();
    });
  });

  describe('banners', () => {
    it('shows the past-due recovery banner for a past_due subscriber', async () => {
      configureSub({ isPro: false, sub: { status: 'past_due' } });
      const { el } = await mountView(WalletView, { state: { token_balance: BAL() } });
      expect(el.querySelector('.wallet-past-due-banner')).toBeTruthy();
      expect(el.querySelector('[data-action="fix-billing"]')).toBeTruthy();
    });

    it('shows the self-host banner when the paywall is disabled', async () => {
      configureSub({ isPro: true, addons: ['claude', 'premium'], paywall: false });
      const { el } = await mountView(WalletView, { state: { token_balance: BAL() } });
      expect(el.querySelector('.wallet-self-host-banner')).toBeTruthy();
    });

    it('omits both banners in the normal Pro case', async () => {
      configureSub({ isPro: true });
      const { el } = await mountView(WalletView, { state: { token_balance: BAL() } });
      expect(el.querySelector('.wallet-past-due-banner')).toBeNull();
      expect(el.querySelector('.wallet-self-host-banner')).toBeNull();
    });
  });

  describe('transaction ledger', () => {
    it('renders the section only when a user is present', async () => {
      const { el } = await mountView(WalletView, { state: { token_balance: BAL() } });
      expect(el.querySelector('#wallet-transactions')).toBeNull();

      const r = await mountView(WalletView, { state: { user: { id: 'u1' }, token_balance: BAL() } });
      expect(r.el.querySelector('#wallet-transactions')).toBeTruthy();
    });

    it('renders ledger rows from the DB with credit/debit signs', async () => {
      configureSub({ isPro: true });
      globalThis.SB.client = {
        from: () => ({
          select: () => ({
            order: () => ({
              limit: async () => ({
                data: [
                  { type: 'topup', pool: 'standard', amount: 1000, balance_after: 1000, model: null, metadata: {}, created_at: '2026-06-01T10:00:00Z' },
                  { type: 'debit', pool: 'standard', amount: 3, balance_after: 997, model: 'claude-4-6-sonnet', metadata: {}, created_at: '2026-06-02T10:00:00Z' },
                ],
                error: null,
              }),
            }),
          }),
        }),
      };
      try {
        const { el } = await mountView(WalletView, { state: { user: { id: 'u1' }, token_balance: BAL() } });
        await new Promise(r => setTimeout(r, 0)); // _loadTransactions is fire-and-forget
        const rows = el.querySelectorAll('.wallet-tx-row');
        expect(rows.length).toBe(2);
        expect(el.querySelector('.tx-credit').textContent).toContain('+');
        expect(el.querySelector('.tx-debit').textContent).toContain('-');
        expect(el.innerHTML).toContain('claude-4-6-sonnet');
      } finally {
        globalThis.SB.client = null;
      }
    });

    it('shows the offline note when there is no DB client', async () => {
      const { el } = await mountView(WalletView, { state: { user: { id: 'u1' }, token_balance: BAL() } });
      await new Promise(r => setTimeout(r, 0));
      expect(el.querySelector('#wallet-transactions').textContent).toContain('Sign in to view');
    });
  });

  describe('billing actions', () => {
    it('subscribe-pro click calls Subscription.subscribe("pro")', async () => {
      configureSub({ isPro: false });
      const { el } = await mountView(WalletView, { state: { token_balance: BAL() } });
      el.querySelector('[data-action="subscribe-pro"]').click();
      expect(Subscription.subscribe).toHaveBeenCalledWith('pro');
    });

    it('cancel-pro click opens the pro billing portal', async () => {
      configureSub({ isPro: true });
      const { el } = await mountView(WalletView, { state: { token_balance: BAL() } });
      el.querySelector('[data-action="cancel-pro"]').click();
      expect(Subscription.openBillingPortal).toHaveBeenCalledWith('pro');
    });

    it('buy-topup click calls Subscription.buyTopUp with the pack id', async () => {
      configureSub({ isPro: true });
      const { el } = await mountView(WalletView, { state: { token_balance: BAL() } });
      const buyBtn = el.querySelector('.wallet-buy-btn[data-topup-id]');
      const id = buyBtn.dataset.topupId;
      buyBtn.click();
      expect(Subscription.buyTopUp).toHaveBeenCalledWith(id);
    });

    it('guards against double-click double-charge by disabling the button', async () => {
      configureSub({ isPro: false });
      const { el } = await mountView(WalletView, { state: { token_balance: BAL() } });
      const btn = el.querySelector('[data-action="subscribe-pro"]');
      btn.click();
      btn.click(); // second click while disabled is a no-op
      expect(btn.disabled).toBe(true);
      expect(Subscription.subscribe).toHaveBeenCalledTimes(1);
    });
  });
});
