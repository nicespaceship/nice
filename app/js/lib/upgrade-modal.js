/* ═══════════════════════════════════════════════════════════════════
   NICE — Upgrade Modal
   Single Pro pitch: Free vs Pro comparison + Subscribe button.
   Add-ons (Claude, Premium) are surfaced separately in the Wallet view.
═══════════════════════════════════════════════════════════════════ */

const UpgradeModal = (() => {
  let _overlay = null;
  let _upgrading = false;

  /* ── Open the upgrade modal ── */
  function open(/* legacy args ignored */) {
    if (_overlay) return;
    const user = typeof State !== 'undefined' ? State.get('user') : null;
    if (!user) {
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Sign In Required', message: 'Sign in to upgrade.', type: 'warning' });
      return;
    }

    const isPro = typeof Subscription !== 'undefined' && Subscription.isPro && Subscription.isPro();
    if (isPro) {
      // Already Pro — nothing to upsell on the base plan
      if (typeof Router !== 'undefined') Router.navigate('/security?tab=wallet');
      return;
    }

    const free = Subscription?.PLANS?.free || {};
    const pro = Subscription?.PLANS?.pro || {};

    _overlay = document.createElement('div');
    _overlay.className = 'upgrade-modal-overlay';
    _overlay.innerHTML = `
      <div class="upgrade-modal upgrade-modal-pro">
        <div class="upgrade-modal-header">
          <h2>Upgrade to Pro</h2>
          <button class="upgrade-modal-close" aria-label="Close">&times;</button>
        </div>

        <p class="upgrade-modal-tagline">$9.99/month · Cancel anytime</p>

        <table class="upgrade-compare">
          <thead>
            <tr>
              <th></th>
              <th class="upgrade-compare-col">${_esc(free.label || 'Free')}</th>
              <th class="upgrade-compare-col upgrade-compare-pro">${_esc(pro.label || 'Pro')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Slots</th>
              <td>${free.slots || 6}</td>
              <td><strong>${pro.slots || 12}</strong></td>
            </tr>
            <tr>
              <th>Max rarity</th>
              <td>Up to Legendary <small>(via XP)</small></td>
              <td><strong>Legendary instantly</strong></td>
            </tr>
            <tr>
              <th>Free models</th>
              <td>Gemini 2.5 Flash</td>
              <td>Gemini 2.5 Flash</td>
            </tr>
            <tr>
              <th>Standard models</th>
              <td>—</td>
              <td><strong>6 models</strong> (GPT-5 mini, DeepSeek R1, Kimi, GLM-5, Llama Scout, Grok 4.1)</td>
            </tr>
            <tr>
              <th>Monthly tokens</th>
              <td>—</td>
              <td><strong>1,000 standard tokens</strong> (refills each cycle)</td>
            </tr>
            <tr>
              <th>Top-ups</th>
              <td>—</td>
              <td>Available</td>
            </tr>
            <tr>
              <th>Claude add-on</th>
              <td>—</td>
              <td>+$9.99/mo for Claude 4.6 Sonnet & Opus</td>
            </tr>
            <tr>
              <th>Premium add-on</th>
              <td>—</td>
              <td>+$9.99/mo for GPT-5.4 Pro, Codex, o3, Gemini 3.1 Pro</td>
            </tr>
          </tbody>
        </table>

        <div class="upgrade-modal-actions">
          <button class="btn btn-sm" id="upgrade-cancel">Maybe later</button>
          <button class="btn btn-sm btn-primary" id="upgrade-subscribe">Subscribe to Pro · $9.99/mo</button>
        </div>

        <p class="upgrade-modal-footer">Secure billing powered by Stripe. Mythic rarity is milestone-only — earned by both Free and Pro users.</p>
      </div>
    `;

    document.body.appendChild(_overlay);
    requestAnimationFrame(() => _overlay.classList.add('open'));

    _overlay.querySelector('.upgrade-modal-close').addEventListener('click', close);
    _overlay.querySelector('#upgrade-cancel').addEventListener('click', close);
    _overlay.querySelector('#upgrade-subscribe').addEventListener('click', _handleSubscribe);
    _overlay.addEventListener('click', (e) => { if (e.target === _overlay) close(); });
    document.addEventListener('keydown', _onKey);
  }

  function _onKey(e) {
    if (e.key === 'Escape' && _overlay) close();
  }

  function close() {
    if (_overlay) {
      document.removeEventListener('keydown', _onKey);
      _overlay.classList.remove('open');
      setTimeout(() => { _overlay?.remove(); _overlay = null; }, 200);
    }
  }

  function _esc(s) {
    if (typeof Utils !== 'undefined' && Utils.esc) return Utils.esc(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ── Handle subscribe click ── */
  async function _handleSubscribe() {
    if (_upgrading) return;
    _upgrading = true;

    const btn = _overlay?.querySelector('#upgrade-subscribe');
    if (btn) {
      btn.textContent = 'Redirecting…';
      btn.disabled = true;
    }

    try {
      if (typeof Subscription !== 'undefined' && Subscription.subscribe) {
        await Subscription.subscribe('pro');
      } else {
        throw new Error('Subscription module not available');
      }
    } catch (err) {
      if (typeof Notify !== 'undefined') {
        Notify.send({ title: 'Upgrade Error', message: err.message || 'Failed to start checkout.', type: 'error' });
      }
      if (btn) {
        btn.textContent = 'Subscribe to Pro · $9.99/mo';
        btn.disabled = false;
      }
    } finally {
      _upgrading = false;
    }
  }

  /* ── Check URL for post-checkout return ── */
  function checkReturn() {
    const hash = location.hash || '';
    if (hash.includes('upgrade=success')) {
      if (typeof Notify !== 'undefined') {
        Notify.send({ title: 'Welcome to Pro!', message: 'Your subscription is active. 12 slots and Legendary blueprints unlocked.', type: 'success' });
      }
      if (typeof Gamification !== 'undefined') Gamification.addXP('upgrade_spaceship');
      const cleanHash = hash.replace(/[?&]upgrade=success/, '').replace(/\?$/, '');
      history.replaceState(null, '', location.pathname + cleanHash);
    } else if (hash.includes('upgrade=cancel')) {
      if (typeof Notify !== 'undefined') {
        Notify.send({ title: 'Upgrade Cancelled', message: 'No changes were made.', type: 'info' });
      }
      const cleanHash = hash.replace(/[?&]upgrade=cancel/, '').replace(/\?$/, '');
      history.replaceState(null, '', location.pathname + cleanHash);
    }
  }

  return { open, close, checkReturn };
})();
