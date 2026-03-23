/* ═══════════════════════════════════════════════════════════════════
   NICE — Token Purchase Modal
   Stripe Checkout integration for buying token packs.
═══════════════════════════════════════════════════════════════════ */

const FuelModal = (() => {
  const PACKS = [
    { id: 'starter',  name: 'Starter Pack',  tokens: '5,000',  price: '$9.99',   tag: '' },
    { id: 'booster',  name: 'Booster Pack',  tokens: '15,000', price: '$24.99',  tag: 'Popular' },
    { id: 'premium',  name: 'Premium Pack',  tokens: '30,000', price: '$49.99',  tag: 'Best Value' },
    { id: 'fleet',    name: 'Fleet Pack',    tokens: '50,000', price: '$99.99',  tag: '' },
  ];

  let _overlay = null;
  let _purchasing = false;

  function open() {
    if (_overlay) return;
    const user = State.get('user');
    if (!user) {
      Notify.send('Sign in to purchase tokens', 'warning');
      return;
    }
    _overlay = document.createElement('div');
    _overlay.className = 'token-modal-overlay';
    _overlay.innerHTML = `
      <div class="token-modal">
        <div class="token-modal-header">
          <h2>Buy Tokens</h2>
          <button class="token-modal-close" aria-label="Close">&times;</button>
        </div>
        <p class="token-modal-desc">Tokens power your AI agent missions. Choose a pack below.</p>
        ${typeof Subscription !== 'undefined' ? `<p class="token-modal-sub-info" style="font-size:.72rem;color:var(--accent);margin-bottom:8px;">Current plan: <strong>${(Subscription.getCurrentPlan() || 'scout').toUpperCase()}</strong> &middot; Monthly tokens: ${(() => { const t = Subscription.getPlanTier(Subscription.getCurrentPlan()); return t.tokens === -1 ? 'Unlimited' : t.tokens.toLocaleString(); })()}</p>` : ''}
        <div class="token-packs">
          ${PACKS.map(p => `
            <button class="token-pack ${p.tag ? 'token-pack--featured' : ''}" data-pack="${p.id}">
              ${p.tag ? `<span class="token-pack-tag">${p.tag}</span>` : ''}
              <span class="token-pack-name">${p.name}</span>
              <span class="token-pack-tokens">${p.tokens} units</span>
              <span class="token-pack-price">${p.price}</span>
            </button>
          `).join('')}
        </div>
        <p class="token-modal-footer">Secure checkout powered by Stripe. No API keys needed.</p>
      </div>
    `;
    document.body.appendChild(_overlay);

    // Bind events
    _overlay.querySelector('.token-modal-close').addEventListener('click', close);
    _overlay.addEventListener('click', (e) => { if (e.target === _overlay) close(); });
    _overlay.querySelectorAll('.token-pack').forEach(btn => {
      btn.addEventListener('click', () => _purchase(btn.dataset.pack));
    });
    document.addEventListener('keydown', _onKey);
  }

  function _onKey(e) {
    if (e.key === 'Escape' && _overlay) close();
  }

  function close() {
    if (_overlay) {
      document.removeEventListener('keydown', _onKey);
      _overlay.remove();
      _overlay = null;
    }
  }

  async function _purchase(packId) {
    if (_purchasing) return;
    _purchasing = true;
    const user = State.get('user');
    if (!user) { _purchasing = false; return; }

    // Show loading state on the clicked pack
    const btn = _overlay?.querySelector(`[data-pack="${packId}"]`);
    if (btn) {
      btn.classList.add('token-pack--loading');
      btn.setAttribute('disabled', 'true');
    }

    try {
      if (typeof Subscription !== 'undefined') {
        await Subscription.purchaseTokens(packId);
        return;
      }

      const { data, error } = await SB.functions.invoke('stripe-checkout', {
        packId,
        userId: user.id,
        email: user.email,
      });

      if (error || !data?.url) {
        Notify.send(error || 'Failed to create checkout session', 'error');
        return;
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (err) {
      Notify.send('Checkout error: ' + (err.message || 'Unknown'), 'error');
    } finally {
      _purchasing = false;
      if (btn) {
        btn.classList.remove('token-pack--loading');
        btn.removeAttribute('disabled');
      }
    }
  }

  // Check URL params for success/cancel on load
  function checkReturn() {
    const hash = location.hash || '';
    if (hash.includes('fuel=success')) {
      Notify.send('Tokens purchased! Your balance will update shortly.', 'success');
      // Clean up URL
      history.replaceState(null, '', location.pathname + '#/settings');
    } else if (hash.includes('fuel=cancelled')) {
      Notify.send('Token purchase cancelled.', 'warning');
      history.replaceState(null, '', location.pathname + '#/settings');
    }
  }

  return { open, close, checkReturn };
})();
