/* ═══════════════════════════════════════════════════════════════════
   NICE — Wallet View
   Token balance, subscription management, transaction history, top-up.
═══════════════════════════════════════════════════════════════════ */

const WalletView = (() => {
  const title = 'Wallet';

  function render(el) {
    const user = State.get('user');
    if (!user) {
      el.innerHTML = `<div class="auth-prompt"><h2>Sign in to access your wallet</h2><p>Manage your subscription, token balance, and transaction history.</p></div>`;
      return;
    }

    el.innerHTML = `
      <div class="wallet-wrap">
        <h1 class="wallet-title">Wallet</h1>

        <!-- Balance & Subscription Row -->
        <div class="wallet-cards" id="wallet-cards">
          <div class="wallet-card wallet-balance-card">
            <div class="wallet-card-label">Token Balance</div>
            <div class="wallet-balance" id="wallet-balance">—</div>
            <div class="wallet-gauge-track">
              <div class="wallet-gauge-fill" id="wallet-gauge" style="width:0%"></div>
            </div>
            <div class="wallet-balance-sub" id="wallet-balance-sub">Loading...</div>
          </div>
          <div class="wallet-card wallet-sub-card">
            <div class="wallet-card-label">Subscription</div>
            <div class="wallet-plan" id="wallet-plan">—</div>
            <div class="wallet-plan-meta" id="wallet-plan-meta"></div>
            <div class="wallet-plan-actions" id="wallet-plan-actions"></div>
          </div>
        </div>

        <!-- Quick Top-Up -->
        <div class="wallet-section">
          <h3 class="wallet-section-title">Top Up Tokens</h3>
          <div class="wallet-topup-grid" id="wallet-topup">
            <button class="wallet-topup-btn" data-pack="starter">5K Tokens<span>$9.99</span></button>
            <button class="wallet-topup-btn" data-pack="booster">15K Tokens<span>$24.99</span></button>
            <button class="wallet-topup-btn wallet-topup-featured" data-pack="premium">30K Tokens<span>$49.99</span></button>
            <button class="wallet-topup-btn" data-pack="fleet">50K Tokens<span>$99.99</span></button>
          </div>
        </div>

        <!-- Upgrade Tiers -->
        <div class="wallet-section">
          <h3 class="wallet-section-title">Upgrade Plan</h3>
          <div class="wallet-tiers" id="wallet-tiers"></div>
        </div>

        <!-- Transaction History -->
        <div class="wallet-section">
          <h3 class="wallet-section-title">Transaction History</h3>
          <div class="wallet-txns" id="wallet-txns">
            <p class="text-muted" style="font-size:.78rem">Loading transactions...</p>
          </div>
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
    const balance = await Subscription.getTokenBalance();
    const sub = await Subscription.getSubscription();

    // Balance card
    const balEl = document.getElementById('wallet-balance');
    const gaugeEl = document.getElementById('wallet-gauge');
    const subEl = document.getElementById('wallet-balance-sub');
    if (balEl) balEl.textContent = tier.slots === -1 ? '∞' : balance.toLocaleString();
    if (gaugeEl) {
      const isUnlimited = tier.slots === -1;
      const pct = isUnlimited ? 100 : (balance > 0 ? Math.min(100, 50) : 0);
      gaugeEl.style.width = pct + '%';
      gaugeEl.style.background = isUnlimited ? '#22c55e' : pct < 20 ? '#ef4444' : pct < 50 ? '#f59e0b' : '#22c55e';
    }
    if (subEl) {
      subEl.textContent = tier.tokens === 'byok' ? 'Bring your own key — Free plan'
        : tier.slots === -1 ? 'Unlimited slots — Enterprise plan'
        : `Hosted LLM — ${tier.label} plan`;
    }

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
      if (sub?.current_period_end) lines.push(`Renews ${new Date(sub.current_period_end).toLocaleDateString()}`);
      if (sub?.cancel_at_period_end) lines.push('<span style="color:#ef4444">Cancels at period end</span>');
      metaEl.innerHTML = lines.join(' &middot; ');
    }
    if (actEl) {
      actEl.innerHTML = plan === 'free'
        ? '<a href="#/wallet" class="btn btn-sm btn-primary">Upgrade Plan</a>'
        : '<button class="btn btn-sm" id="wallet-manage-sub">Manage Subscription</button>';
    }

    // Tier cards
    _renderTiers(plan);

    // Transactions
    const txns = await Subscription.getTransactions(20);
    const txnEl = document.getElementById('wallet-txns');
    if (txnEl) {
      if (!txns.length) {
        txnEl.innerHTML = '<p class="text-muted" style="font-size:.78rem">No transactions yet.</p>';
      } else {
        txnEl.innerHTML = `
          <table class="wallet-txn-table">
            <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Balance</th><th>Description</th></tr></thead>
            <tbody>
              ${txns.map(t => `<tr>
                <td>${new Date(t.created_at).toLocaleDateString()}</td>
                <td><span class="wallet-txn-type wallet-txn-${t.amount > 0 ? 'credit' : 'debit'}">${t.amount > 0 ? 'Credit' : 'Debit'}</span></td>
                <td style="color:${t.amount > 0 ? '#22c55e' : '#ef4444'}">${t.amount > 0 ? '+' : ''}${t.amount.toLocaleString()}</td>
                <td>${t.balance_after.toLocaleString()}</td>
                <td>${t.description || '—'}</td>
              </tr>`).join('')}
            </tbody>
          </table>`;
      }
    }
  }

  function _renderTiers(currentPlan) {
    const container = document.getElementById('wallet-tiers');
    if (!container || typeof Subscription === 'undefined') return;

    const tiers = Subscription.PLAN_TIERS;
    container.innerHTML = Object.entries(tiers).map(([id, t]) => {
      const isCurrent = id === currentPlan;
      const priceLabel = t.price === 0 ? 'Free' : t.price === -1 ? 'Custom' : `$${t.price}/mo`;
      const slotsLabel = t.slots === 0 ? 'Slots via XP' : t.slots === -1 ? 'Unlimited slots' : `${t.slots} agent slots`;
      const tokenLabel = t.tokens === 'byok' ? 'Bring your own key' : 'Hosted LLM';
      return `
        <div class="wallet-tier-card ${isCurrent ? 'wallet-tier-current' : ''}" style="border-color:${t.color}">
          <div class="wallet-tier-icon">${t.icon}</div>
          <div class="wallet-tier-name" style="color:${t.color}">${t.label}</div>
          <div class="wallet-tier-price">${priceLabel}</div>
          <div class="wallet-tier-details">
            <span>${tokenLabel}</span>
            <span>${slotsLabel}</span>
          </div>
          <div class="wallet-tier-desc" style="font-size:.72rem;color:var(--text-muted);margin-top:.25rem">${t.desc}</div>
          ${isCurrent
            ? '<span class="wallet-tier-badge">Current Plan</span>'
            : t.price === -1
              ? `<a href="#/contact" class="btn btn-sm wallet-tier-btn" style="border-color:${t.color};color:${t.color}">Contact Sales</a>`
              : `<button class="btn btn-sm wallet-tier-btn" data-plan="${id}" style="border-color:${t.color};color:${t.color}">${t.price === 0 ? 'Downgrade' : 'Upgrade'}</button>`
          }
        </div>`;
    }).join('');
  }

  function _bindEvents() {
    // Top-up buttons
    document.getElementById('wallet-topup')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pack]');
      if (!btn) return;
      if (typeof Subscription !== 'undefined') Subscription.purchaseTokens(btn.dataset.pack);
      else if (typeof FuelModal !== 'undefined') FuelModal.open();
    });

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
