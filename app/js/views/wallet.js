/* ═══════════════════════════════════════════════════════════════════
   NICE — Wallet View
   Subscription cards (Pro, Claude add-on, Premium add-on),
   per-pool token balances, top-up packages (Pro-only),
   transaction history. Rendered as a tab inside Security.

   Self-hosters with `window.NICE_CONFIG = { paywallEnabled: false }`
   see a banner explaining that billing is disabled.
═══════════════════════════════════════════════════════════════════ */

const WalletView = (() => {
  const title = 'Wallet';
  const _esc = Utils.esc;

  // Capitalize a pool id for display ("standard" → "Standard"). Use everywhere
  // the pool name is shown to the user so balance cards, top-up cards, and
  // transaction rows stay in sync.
  const _poolLabel = (pool) => {
    const id = String(pool || 'standard');
    return id.charAt(0).toUpperCase() + id.slice(1);
  };

  /* ── Top-up Packages — sourced from StripeConfig SSOT ────────
     All 6 packs live in app/js/lib/stripe-config.js with real
     live-mode product/price/payment-link IDs. Wallet just renders
     whatever StripeConfig exposes. */
  function _getTopUps() {
    if (typeof StripeConfig === 'undefined') return [];
    return StripeConfig.listTopUps().map(t => ({
      id: t.id,
      pool: t.pool,
      name: t.name,
      tokens: t.tokens,
      price: '$' + t.price.toFixed(2),
      desc: t.desc,
      badge: t.badge || '',
      url: t.paymentLinkUrl,
    }));
  }

  /* ── Render ─────────────────────────────────────────────────── */
  async function render(el) {
    const user = State.get('user');
    const balance = State.get('token_balance') || {};
    const pools = balance.pools || {};
    // Await the subscription read up front so the first paint reflects
    // the actual server state. Without this, a fresh load on the wallet
    // page renders before Subscription.init has populated its cache —
    // so isPro() returns false and every add-on card shows "Pro required"
    // despite the user being on Pro in the DB.
    if (typeof Subscription !== 'undefined' && Subscription.getSubscription) {
      try { await Subscription.getSubscription(); } catch { /* ignore */ }
    }
    const isPro = typeof Subscription !== 'undefined' && Subscription.isPro && Subscription.isPro();
    const userAddons = typeof Subscription !== 'undefined' && Subscription.getAddons ? Subscription.getAddons() : [];
    const paywallEnabled = typeof Subscription !== 'undefined' && Subscription.paywallEnabled ? Subscription.paywallEnabled() : true;

    el.innerHTML = `
      <div class="wallet-wrap">

        ${!paywallEnabled ? `
        <div class="wallet-self-host-banner">
          <strong>Self-hosted:</strong> Billing is disabled via <code>window.NICE_CONFIG.paywallEnabled = false</code>.
          Every user has full Pro access with both add-ons. Stripe checkout buttons are decorative.
        </div>
        ` : ''}

        <!-- Plan Cards: Free / Pro / Pro+Claude / Pro+Premium -->
        <div class="wallet-section">
          <h3 class="wallet-section-title">Plans</h3>
          <div class="wallet-plan-grid">
            ${_renderPlanCard('free', isPro)}
            ${_renderPlanCard('pro', isPro)}
            ${_renderAddonCard('claude', isPro, userAddons)}
            ${_renderAddonCard('premium', isPro, userAddons)}
          </div>
        </div>

        <!-- Per-pool Token Balances (Pro users only) -->
        ${isPro ? `
        <div class="wallet-section">
          <h3 class="wallet-section-title">Token Balance</h3>
          <div class="wallet-balance-grid">
            ${_renderPoolBalance('standard', pools, true)}
            ${userAddons.includes('claude')  ? _renderPoolBalance('claude',  pools, true) : ''}
            ${userAddons.includes('premium') ? _renderPoolBalance('premium', pools, true) : ''}
          </div>
        </div>
        ` : ''}

        <!-- Top-up Packages (Pro only) -->
        <div class="wallet-section">
          <h3 class="wallet-section-title">Token Top-ups</h3>
          ${!isPro ? `
            <p class="wallet-locked-note">🔒 Subscribe to Pro to buy token top-ups.</p>
          ` : `
            <div class="wallet-topup-grid">
              ${_getTopUps().filter(t => _topupVisibleForUser(t, userAddons)).map(t => _renderTopUp(t)).join('')}
            </div>
          `}
        </div>

        <!-- How It Works -->
        <div class="wallet-section">
          <h3 class="wallet-section-title">How Tokens Work</h3>
          <div class="wallet-info-grid">
            <div class="wallet-info-card">
              <span class="wallet-info-icon"><svg class="icon" fill="none" stroke="currentColor" stroke-width="1.5" style="width:24px;height:24px"><use href="#icon-sparkle"/></svg></span>
              <span class="wallet-info-title">Free models</span>
              <span class="wallet-info-desc">Gemini 2.5 Flash is always free. No tokens consumed.</span>
            </div>
            <div class="wallet-info-card">
              <span class="wallet-info-icon"><svg class="icon" fill="none" stroke="currentColor" stroke-width="1.5" style="width:24px;height:24px"><use href="#icon-zap"/></svg></span>
              <span class="wallet-info-title">Weighted by model</span>
              <span class="wallet-info-desc">1 token ≈ 1 standard message. Sonnet = 3 tokens. Opus = 10. o3 = 15.</span>
            </div>
            <div class="wallet-info-card">
              <span class="wallet-info-icon"><svg class="icon" fill="none" stroke="currentColor" stroke-width="1.5" style="width:24px;height:24px"><use href="#icon-bot"/></svg></span>
              <span class="wallet-info-title">Allowance + top-ups</span>
              <span class="wallet-info-desc">Monthly allowance burns first. Top-ups never expire.</span>
            </div>
          </div>
        </div>

        ${user ? `
        <div class="wallet-section">
          <h3 class="wallet-section-title">Recent Activity</h3>
          <div class="wallet-transactions" id="wallet-transactions">
            <p class="text-muted" style="font-size:.75rem">Loading transactions...</p>
          </div>
        </div>
        ` : ''}
      </div>
    `;

    if (user) _loadTransactions();
    _bindEvents(el);
  }

  /* ── Plan / Add-on cards ──────────────────────────────────────── */
  function _renderPlanCard(planId, isPro) {
    const plan = Subscription?.PLANS?.[planId] || {};
    const isCurrent = (planId === 'pro' && isPro) || (planId === 'free' && !isPro);
    const price = plan.price === 0 ? 'Free' : `$${plan.price}/mo`;
    const slots = `${plan.slots} slots`;
    const ctaLabel = isCurrent ? 'Current plan' : (planId === 'pro' ? 'Upgrade to Pro' : 'Downgrade');
    return `
      <div class="wallet-plan-card ${isCurrent ? 'wallet-plan-current' : ''}" data-plan="${planId}">
        <div class="wallet-plan-icon">${plan.icon || ''}</div>
        <div class="wallet-plan-name">${_esc(plan.label || planId)}</div>
        <div class="wallet-plan-price">${price}</div>
        <div class="wallet-plan-slots">${_esc(slots)}</div>
        <p class="wallet-plan-desc">${_esc(plan.desc || '')}</p>
        <button class="btn btn-sm ${isCurrent ? '' : 'btn-primary'}" data-action="${isCurrent ? '' : (planId === 'pro' ? 'subscribe-pro' : 'cancel-pro')}" ${isCurrent ? 'disabled' : ''}>
          ${_esc(ctaLabel)}
        </button>
      </div>
    `;
  }

  function _renderAddonCard(addonId, isPro, userAddons) {
    const addon = Subscription?.ADDONS?.[addonId] || {};
    const isActive = userAddons.includes(addonId);
    const ctaLabel = !isPro ? 'Pro required' : isActive ? 'Active' : 'Add ($' + addon.price + '/mo)';
    return `
      <div class="wallet-plan-card wallet-addon-card ${isActive ? 'wallet-plan-current' : ''}" data-addon="${addonId}">
        <div class="wallet-plan-icon">${addon.icon || ''}</div>
        <div class="wallet-plan-name">${_esc(addon.label || addonId)} add-on</div>
        <div class="wallet-plan-price">+$${addon.price}/mo</div>
        <div class="wallet-plan-slots">${_esc('Add-on for Pro')}</div>
        <p class="wallet-plan-desc">${_esc(addon.desc || '')}</p>
        <button class="btn btn-sm ${isActive ? '' : 'btn-primary'}" data-action="${isPro ? (isActive ? 'remove-' + addonId : 'add-' + addonId) : ''}" ${(!isPro || isActive) ? 'disabled' : ''}>
          ${_esc(ctaLabel)}
        </button>
      </div>
    `;
  }

  /* ── Per-pool balance row ──────────────────────────────────────── */
  function _renderPoolBalance(poolId, pools, _entitled) {
    const p = pools?.[poolId] || { allowance: 0, used: 0, purchased: 0 };
    const allowanceLeft = Math.max(0, (p.allowance || 0) - (p.used || 0));
    const total = allowanceLeft + (p.purchased || 0);
    const allowance = TokenConfig.monthlyAllowance(poolId);
    const pct = allowance > 0 ? Math.min(100, Math.round((allowanceLeft / allowance) * 100)) : 0;
    const label = _poolLabel(poolId);
    return `
      <div class="wallet-balance-card">
        <div class="wallet-balance-main">
          <span class="wallet-balance-label">${_esc(label)} tokens</span>
          <span class="wallet-balance-num">${total.toLocaleString()}</span>
        </div>
        <div class="wallet-balance-bar">
          <div class="wallet-balance-fill" style="width:${pct}%"></div>
        </div>
        <div class="wallet-balance-breakdown">
          <span>${allowanceLeft.toLocaleString()} / ${allowance.toLocaleString()} allowance</span>
          <span>+ ${(p.purchased || 0).toLocaleString()} purchased</span>
        </div>
      </div>
    `;
  }

  /* ── Top-up card ──────────────────────────────────────────────── */
  function _topupVisibleForUser(t, addons) {
    if (t.pool === 'standard') return true;          // every Pro user sees standard top-ups
    if (t.pool === 'claude')   return addons.includes('claude');
    if (t.pool === 'premium')  return addons.includes('premium');
    return false;
  }

  function _renderTopUp(t) {
    // Route through Subscription.buyTopUp so client_reference_id +
    // prefilled_email get attached to the Stripe URL. A raw <a href>
    // would leave the webhook no way to map the purchase to a user
    // without an email-match fallback.
    return `
      <div class="wallet-package wallet-package--${t.pool}">
        ${t.badge ? `<span class="wallet-package-badge">${_esc(t.badge)}</span>` : ''}
        <span class="wallet-package-name">${_esc(t.name)}</span>
        <span class="wallet-package-tokens">${t.tokens.toLocaleString()}</span>
        <span class="wallet-package-tokens-label">${_esc(_poolLabel(t.pool))} tokens</span>
        <span class="wallet-package-price">${_esc(t.price)}</span>
        <p class="wallet-package-desc">${_esc(t.desc)}</p>
        <button type="button" class="btn btn-sm btn-primary wallet-buy-btn" data-topup-id="${_esc(t.id)}">Buy</button>
      </div>
    `;
  }

  /* ── Events ───────────────────────────────────────────────────── */
  function _bindEvents(el) {
    el.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (!action) return;
        if (action === 'subscribe-pro' && Subscription?.subscribe) {
          Subscription.subscribe('pro');
        } else if (action === 'cancel-pro' && Subscription?.openBillingPortal) {
          Subscription.openBillingPortal();
        } else if (action.startsWith('add-') && Subscription?.setAddon) {
          Subscription.setAddon(action.slice(4), true);
        } else if (action.startsWith('remove-') && Subscription?.setAddon) {
          Subscription.setAddon(action.slice(7), false);
        }
      });
    });

    el.querySelectorAll('button[data-topup-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.topupId;
        if (id && Subscription?.buyTopUp) Subscription.buyTopUp(id);
      });
    });
  }

  /* ── Load Transactions from DB ──────────────────────────────── */
  async function _loadTransactions() {
    const container = document.getElementById('wallet-transactions');
    if (!container) return;

    try {
      if (typeof SB === 'undefined' || !SB.client) {
        container.innerHTML = '<p class="text-muted" style="font-size:.75rem">Sign in to view transaction history.</p>';
        return;
      }

      const { data, error } = await SB.client
        .from('token_transactions')
        .select('type, pool, amount, balance_after, model, metadata, created_at')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error || !data || data.length === 0) {
        container.innerHTML = '<p class="text-muted" style="font-size:.75rem">No transactions yet. Start using your agents!</p>';
        return;
      }

      container.innerHTML = `
        <div class="wallet-tx-list">
          ${data.map(tx => {
            // The ledger writer uses these types:
            //   'topup'            — one-time pool credit (Stripe payment link)
            //   'subscription_grant'  — monthly subscription grant
            //   'debit'            — per-model use by nice-ai
            const isCredit = tx.type !== 'debit';
            const icon = tx.type === 'topup' ? 'credit-card'
              : tx.type === 'subscription_grant' ? 'gift'
              : 'bot';
            const poolName = _poolLabel(tx.pool);
            const label = tx.type === 'topup' ? `Top-up (${poolName})`
              : tx.type === 'subscription_grant' ? `${poolName} allowance`
              : tx.model ? `${tx.model}` : 'Agent usage';
            const date = new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
            const display = isCredit ? '+' + tx.amount.toLocaleString() : '-' + tx.amount.toLocaleString();
            return `
              <div class="wallet-tx-row">
                <span class="wallet-tx-icon">${icon}</span>
                <div class="wallet-tx-info">
                  <span class="wallet-tx-label">${_esc(label)}</span>
                  <span class="wallet-tx-date">${date} · ${_esc(poolName)}</span>
                </div>
                <span class="wallet-tx-amount ${isCredit ? 'tx-credit' : 'tx-debit'}">${display}</span>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } catch {
      container.innerHTML = '<p class="text-muted" style="font-size:.75rem">Could not load transactions.</p>';
    }
  }

  return { title, render };
})();
