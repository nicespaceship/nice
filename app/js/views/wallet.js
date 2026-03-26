/* ═══════════════════════════════════════════════════════════════════
   NICE — Wallet View
   Subscription management and plan upgrades.
═══════════════════════════════════════════════════════════════════ */

const WalletView = (() => {
  const title = 'Wallet';

  function render(el) {
    const user = State.get('user');
    if (!user) {
      el.innerHTML = `<div class="auth-prompt"><h2>Sign in to access your wallet</h2><p>Manage your subscription plan.</p></div>`;
      return;
    }

    el.innerHTML = `
      <div class="wallet-wrap">
        <h1 class="wallet-title">Wallet</h1>

        <!-- Subscription Card -->
        <div class="wallet-cards" id="wallet-cards">
          <div class="wallet-card wallet-sub-card">
            <div class="wallet-card-label">Current Plan</div>
            <div class="wallet-plan" id="wallet-plan">—</div>
            <div class="wallet-plan-meta" id="wallet-plan-meta"></div>
            <div class="wallet-plan-actions" id="wallet-plan-actions"></div>
          </div>
        </div>

        <!-- Plan Options -->
        <div class="wallet-section">
          <h3 class="wallet-section-title">Plans</h3>
          <div class="wallet-tiers" id="wallet-tiers"></div>
        </div>

        <!-- Payment Management -->
        <div class="wallet-section">
          <button class="btn btn-sm" id="wallet-portal-btn">Manage Payment Methods</button>
        </div>
      </div>
    `;

    _loadData();
    _bindEvents();
  }

  async function _loadData() {
    if (typeof Subscription === 'undefined') return;

    await Subscription.init();
    const plan = Subscription.getCurrentPlan();
    const tier = Subscription.getPlanTier(plan);
    const sub = await Subscription.getSubscription();

    // Subscription card
    const planEl = document.getElementById('wallet-plan');
    const metaEl = document.getElementById('wallet-plan-meta');
    const actEl = document.getElementById('wallet-plan-actions');
    if (planEl) {
      planEl.innerHTML = `<span style="color:${tier.color}">${tier.icon} ${tier.label}</span>`;
    }
    if (metaEl) {
      const lines = [];
      if (tier.price > 0) lines.push(`$${tier.price}/month`);
      else lines.push('Free forever');
      if (tier.slots === 0) lines.push('Slots earned via XP');
      else lines.push(`${tier.slots} agent slots`);
      if (sub?.current_period_end) lines.push(`Renews ${new Date(sub.current_period_end).toLocaleDateString()}`);
      if (sub?.cancel_at_period_end) lines.push('<span style="color:#ef4444">Cancels at period end</span>');
      metaEl.innerHTML = lines.join(' &middot; ');
    }
    if (actEl) {
      actEl.innerHTML = plan === 'free'
        ? ''
        : '<button class="btn btn-sm" id="wallet-manage-sub">Manage Subscription</button>';
    }

    // Tier cards
    _renderTiers(plan);
  }

  function _renderTiers(currentPlan) {
    const container = document.getElementById('wallet-tiers');
    if (!container || typeof Subscription === 'undefined') return;

    const tiers = Subscription.PLAN_TIERS;
    container.innerHTML = Object.entries(tiers).map(([id, t]) => {
      const isCurrent = id === currentPlan;
      const priceLabel = t.price === 0 ? 'Free' : `$${t.price}/mo`;
      const slotsLabel = t.slots === 0 ? 'Slots earned via XP (6\u201312)' : `${t.slots} agent slots (5 spaceships)`;
      return `
        <div class="wallet-tier-card ${isCurrent ? 'wallet-tier-current' : ''}" style="border-color:${t.color}">
          <div class="wallet-tier-icon">${t.icon}</div>
          <div class="wallet-tier-name" style="color:${t.color}">${t.label}</div>
          <div class="wallet-tier-price">${priceLabel}</div>
          <div class="wallet-tier-details">
            <span>${slotsLabel}</span>
          </div>
          <div class="wallet-tier-desc" style="font-size:.72rem;color:var(--text-muted);margin-top:.25rem">${t.desc}</div>
          ${isCurrent
            ? '<span class="wallet-tier-badge">Current Plan</span>'
            : `<button class="btn btn-sm wallet-tier-btn" data-plan="${id}" style="border-color:${t.color};color:${t.color}">${t.price === 0 ? 'Downgrade' : 'Upgrade'}</button>`
          }
        </div>`;
    }).join('');
  }

  function _bindEvents() {
    // Tier upgrade buttons
    document.getElementById('wallet-tiers')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-plan]');
      if (!btn) return;
      if (typeof Subscription !== 'undefined') Subscription.subscribe(btn.dataset.plan);
    });

    // Manage subscription
    document.addEventListener('click', (e) => {
      if (e.target.id === 'wallet-manage-sub') {
        if (typeof Subscription !== 'undefined') Subscription.openBillingPortal();
      }
    });

    // Billing portal
    document.getElementById('wallet-portal-btn')?.addEventListener('click', () => {
      if (typeof Subscription !== 'undefined') Subscription.openBillingPortal();
    });
  }

  return { title, render };
})();
