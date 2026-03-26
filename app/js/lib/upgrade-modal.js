/* ═══════════════════════════════════════════════════════════════════
   NICE — Upgrade Modal
   Shows Pro/Team/Enterprise upgrade options with Stripe integration.
═══════════════════════════════════════════════════════════════════ */

const UpgradeModal = (() => {
  let _overlay = null;
  let _upgrading = false;
  let _spaceshipId = null;
  let _currentClassId = null;

  /* ── Open the upgrade modal ── */
  function open(spaceshipId, currentClassId) {
    if (_overlay) return;
    const user = typeof State !== 'undefined' ? State.get('user') : null;
    if (!user) {
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Sign In Required', message: 'Sign in to upgrade.', type: 'warning' });
      return;
    }

    _spaceshipId = spaceshipId;
    _currentClassId = currentClassId;

    const currentPlan = typeof Subscription !== 'undefined' ? Subscription.getCurrentPlan() : 'free';
    const maxSlots = typeof Gamification !== 'undefined' ? Gamification.getMaxSlots() : 5;
    const plans = typeof Subscription !== 'undefined' ? Subscription.PLANS : {};

    _overlay = document.createElement('div');
    _overlay.className = 'upgrade-modal-overlay';
    _overlay.innerHTML = `
      <div class="upgrade-modal">
        <div class="upgrade-modal-header">
          <h2>Upgrade Plan</h2>
          <button class="upgrade-modal-close" aria-label="Close">&times;</button>
        </div>
        <p class="upgrade-modal-desc">Unlock 60 agent slots, 5 spaceships, and auto-unlock Legendary blueprints.</p>
        <div class="upgrade-modal-current">
          <span class="upgrade-current-label">Current</span>
          <span class="upgrade-current-name">${plans[currentPlan]?.label || 'Open Source'}</span>
          <span class="upgrade-current-slots">${maxSlots} slots (${currentPlan === 'free' ? 'XP-based' : 'plan'})</span>
        </div>
        <div class="upgrade-tier-grid">
          ${['pro', 'team', 'enterprise'].map(planId => {
            const p = plans[planId] || {};
            const isCurrent = currentPlan === planId;
            const btnHTML = isCurrent
              ? '<span class="upgrade-tier-badge">Current</span>'
              : `<button class="btn btn-sm btn-primary upgrade-tier-btn" data-plan="${planId}">${planId === 'enterprise' ? 'Contact Sales' : 'Upgrade'}</button>`;
            return `
              <div class="upgrade-tier-card${isCurrent ? ' upgrade-tier-current' : ''}" style="--tier-color:${p.color || '#6366f1'}">
                <div class="upgrade-tier-icon">${p.icon || '🚀'}</div>
                <div class="upgrade-tier-name">${p.label || planId}</div>
                <div class="upgrade-tier-price">${p.price === -1 ? 'Custom' : p.price === 0 ? 'Free' : '$' + p.price + '/mo'}</div>
                <div class="upgrade-tier-slots">${p.slots === -1 ? 'Unlimited' : p.slots} agent slots</div>
                <p class="upgrade-tier-desc">${p.desc || ''}</p>
                ${btnHTML}
              </div>
            `;
          }).join('')}
        </div>
        <p class="upgrade-modal-footer">Secure billing powered by Stripe. Upgrades take effect immediately.</p>
      </div>
    `;

    document.body.appendChild(_overlay);
    requestAnimationFrame(() => _overlay.classList.add('open'));

    // Bind events
    _overlay.querySelector('.upgrade-modal-close').addEventListener('click', close);
    _overlay.addEventListener('click', (e) => { if (e.target === _overlay) close(); });
    _overlay.querySelectorAll('.upgrade-tier-btn').forEach(btn => {
      btn.addEventListener('click', () => _handleUpgrade(btn.dataset.plan, btn.dataset.class, btn));
    });
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

  /* ── Handle upgrade/downgrade click ── */
  async function _handleUpgrade(planId, classId, btn) {
    if (_upgrading) return;
    _upgrading = true;

    // Loading state
    const origText = btn.textContent;
    btn.textContent = 'Redirecting...';
    btn.disabled = true;

    try {
      if (typeof Subscription !== 'undefined') {
        await Subscription.upgradeSpaceship(planId, _spaceshipId, _currentClassId);
      } else {
        throw new Error('Subscription module not available');
      }
    } catch (err) {
      if (typeof Notify !== 'undefined') {
        Notify.send({ title: 'Upgrade Error', message: err.message || 'Failed to start upgrade checkout.', type: 'error' });
      }
      btn.textContent = origText;
      btn.disabled = false;
    } finally {
      _upgrading = false;
    }
  }

  /* ── Check URL for post-checkout return ── */
  function checkReturn() {
    const hash = location.hash || '';
    if (hash.includes('upgrade=success')) {
      if (typeof Notify !== 'undefined') {
        Notify.send({ title: 'Spaceship Upgraded!', message: 'Your spaceship class has been upgraded. New slots are now available.', type: 'success' });
      }
      if (typeof Gamification !== 'undefined') Gamification.addXP('upgrade_spaceship');
      // Clean up URL param
      const cleanHash = hash.replace(/[?&]upgrade=success/, '').replace(/\?$/, '');
      history.replaceState(null, '', location.pathname + cleanHash);
    } else if (hash.includes('upgrade=cancel')) {
      if (typeof Notify !== 'undefined') {
        Notify.send({ title: 'Upgrade Cancelled', message: 'No changes were made to your spaceship.', type: 'info' });
      }
      const cleanHash = hash.replace(/[?&]upgrade=cancel/, '').replace(/\?$/, '');
      history.replaceState(null, '', location.pathname + cleanHash);
    }
  }

  return { open, close, checkReturn };
})();
