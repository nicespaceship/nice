/* ═══════════════════════════════════════════════════════════════════
   NICE — Wallet View
   Token balance, purchase tokens, transaction history.
   Rendered as a tab inside Security page.
═══════════════════════════════════════════════════════════════════ */

const WalletView = (() => {
  const title = 'Wallet';
  const _esc = typeof Utils !== 'undefined' ? Utils.esc : (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]);

  /* ── Token Packages ─────────────────────────────────────────── */
  const PACKAGES = [
    { id: 'starter',    name: 'Starter',    tokens: 500000,    price: '$4.99',  url: 'https://buy.stripe.com/bJe5kCbtm3Fu4k5fUc33W00', badge: '' },
    { id: 'pro',        name: 'Pro',        tokens: 5000000,   price: '$19.99', url: 'https://buy.stripe.com/7sY7sK54YgsgeYJ6jC33W01', badge: 'Best Value' },
    { id: 'enterprise', name: 'Enterprise', tokens: 25000000,  price: '$69.99', url: 'https://buy.stripe.com/6oU14meFy4Jy5o937q33W02', badge: 'Max Power' },
  ];

  /* ── Render ─────────────────────────────────────────────────── */
  function render(el) {
    const user = State.get('user');
    const balance = State.get('token_balance') || { balance: 0, free_tier_remaining: 100000, lifetime_used: 0, lifetime_purchased: 0 };
    const totalAvailable = (balance.balance || 0) + (balance.free_tier_remaining || 0);

    el.innerHTML = `
      <div class="wallet-wrap">

        <!-- Balance Overview -->
        <div class="wallet-balance-card">
          <div class="wallet-balance-main">
            <span class="wallet-balance-label">Available Tokens</span>
            <span class="wallet-balance-num">${totalAvailable.toLocaleString()}</span>
          </div>
          <div class="wallet-balance-breakdown">
            <div class="wallet-breakdown-item">
              <span class="wallet-breakdown-label">Free Tier</span>
              <span class="wallet-breakdown-val">${(balance.free_tier_remaining || 0).toLocaleString()}</span>
            </div>
            <div class="wallet-breakdown-item">
              <span class="wallet-breakdown-label">Purchased</span>
              <span class="wallet-breakdown-val">${(balance.balance || 0).toLocaleString()}</span>
            </div>
            <div class="wallet-breakdown-item">
              <span class="wallet-breakdown-label">Lifetime Used</span>
              <span class="wallet-breakdown-val">${(balance.lifetime_used || 0).toLocaleString()}</span>
            </div>
          </div>
        </div>

        <!-- Token Packages -->
        <div class="wallet-section">
          <h3 class="wallet-section-title">Buy Tokens</h3>
          <div class="wallet-packages">
            ${PACKAGES.map(p => `
              <div class="wallet-package ${p.id === 'pro' ? 'wallet-package--featured' : ''}">
                ${p.badge ? `<span class="wallet-package-badge">${_esc(p.badge)}</span>` : ''}
                <span class="wallet-package-name">${_esc(p.name)}</span>
                <span class="wallet-package-tokens">${p.tokens.toLocaleString()}</span>
                <span class="wallet-package-tokens-label">tokens</span>
                <span class="wallet-package-price">${p.price}</span>
                <a href="${p.url}" target="_blank" rel="noopener" class="btn btn-sm wallet-buy-btn ${p.id === 'pro' ? 'btn-primary' : ''}">Buy ${p.name}</a>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- How Tokens Work -->
        <div class="wallet-section">
          <h3 class="wallet-section-title">How Tokens Work</h3>
          <div class="wallet-info-grid">
            <div class="wallet-info-card">
              <span class="wallet-info-icon">✦</span>
              <span class="wallet-info-title">Free Models</span>
              <span class="wallet-info-desc">Gemini Flash is always free. No tokens needed.</span>
            </div>
            <div class="wallet-info-card">
              <span class="wallet-info-icon">⚡</span>
              <span class="wallet-info-title">Premium Models</span>
              <span class="wallet-info-desc">Claude, GPT-5, and others use tokens from your balance.</span>
            </div>
            <div class="wallet-info-card">
              <span class="wallet-info-icon">🤖</span>
              <span class="wallet-info-title">NICE Auto</span>
              <span class="wallet-info-desc">Automatically picks the best model. Uses free when possible.</span>
            </div>
          </div>
        </div>

        ${user ? `
        <!-- Transaction History -->
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
        .select('type, amount, balance_after, model, metadata, created_at')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error || !data || data.length === 0) {
        container.innerHTML = '<p class="text-muted" style="font-size:.75rem">No transactions yet. Start using your agents!</p>';
        return;
      }

      container.innerHTML = `
        <div class="wallet-tx-list">
          ${data.map(tx => {
            const isCredit = tx.amount > 0;
            const icon = tx.type === 'purchase' ? '💳' : tx.type === 'free_grant' ? '🎁' : '🤖';
            const label = tx.type === 'purchase' ? `Purchased (${tx.metadata?.package || 'tokens'})`
              : tx.type === 'free_grant' ? 'Free tier grant'
              : tx.model ? `Used ${tx.model}` : 'Agent usage';
            const date = new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
            return `
              <div class="wallet-tx-row">
                <span class="wallet-tx-icon">${icon}</span>
                <div class="wallet-tx-info">
                  <span class="wallet-tx-label">${_esc(label)}</span>
                  <span class="wallet-tx-date">${date}</span>
                </div>
                <span class="wallet-tx-amount ${isCredit ? 'tx-credit' : 'tx-debit'}">${isCredit ? '+' : ''}${tx.amount.toLocaleString()}</span>
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
