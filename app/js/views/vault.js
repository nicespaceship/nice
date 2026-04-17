/* ═══════════════════════════════════════════════════════════════════
   NICE — Vault View (Models)
   AI Model selector. NICE is the LLM provider — users toggle which
   models their agents can use, gated by their plan + add-ons.
     - Free models: always on, no tokens consumed (Gemini 2.5 Flash)
     - Standard pool: included in Pro
     - Claude pool: requires Claude add-on
     - Premium pool: requires Premium add-on
═══════════════════════════════════════════════════════════════════ */

const VaultView = (() => {
  const title = 'Models';
  const _esc = Utils.esc;

  /* ── Model Catalog ─────────────────────────────────────────────
     The 15 entries below match TokenConfig.MODELS (which is the
     SSOT for pool + weight). This catalog adds presentation-only
     fields like provider, speed, quality, and description copy. */
  const MODEL_CATALOG = [
    // ── Free tier (Gemini 2.5 Flash — included for everyone)
    { id: 'gemini-2-5-flash', name: 'Gemini 2.5 Flash', provider: 'Google',    speed: 'fastest', quality: 'good',      desc: 'High-volume scaling. Best-in-class economics. Always free.', icon: 'circle' },

    // ── Standard pool (Pro)
    { id: 'gpt-5-mini',       name: 'GPT-5 mini',       provider: 'OpenAI',    speed: 'fast',    quality: 'good',      desc: 'Low-cost, reliable general intelligence. Default workhorse.', icon: 'circle' },
    { id: 'glm-5',            name: 'GLM-5',            provider: 'Zhipu AI',  speed: 'fast',    quality: 'good',      desc: 'Highly capable open-weight flagship from Zhipu.',            icon: 'circle' },
    { id: 'llama-4-scout',    name: 'Llama 4 Scout',    provider: 'Meta',      speed: 'medium',  quality: 'good',      desc: '10M context window for local and air-gapped environments.',  icon: 'circle' },
    { id: 'grok-4-1-fast',    name: 'Grok 4.1 Fast',    provider: 'xAI',       speed: 'fast',    quality: 'excellent', desc: 'Industry-leading 2M token context window. Real-time research.', icon: 'circle' },

    // ── Claude pool (Claude add-on)
    { id: 'claude-4-6-sonnet', name: 'Claude 4.6 Sonnet', provider: 'Anthropic', speed: 'fast',  quality: 'excellent', desc: 'Best balance of speed, cost, and intelligence. Production default.', icon: 'circle' },
    { id: 'claude-4-6-opus',   name: 'Claude 4.6 Opus',   provider: 'Anthropic', speed: 'slow',  quality: 'best',      desc: 'Expert writing and nuanced synthesis. Premium flagship.',           icon: 'circle' },

    // ── Premium pool (Premium add-on)
    { id: 'gpt-5-4-pro',      name: 'GPT-5.4 Pro',     provider: 'OpenAI',    speed: 'medium',  quality: 'best',      desc: '1M context, 128K output, multimodal. OpenAI\'s flagship.',     icon: 'circle' },
    { id: 'gpt-5-3-codex',    name: 'GPT-5.3 Codex',   provider: 'OpenAI',    speed: 'fast',    quality: 'excellent', desc: 'Specialized for agentic coding tasks. Code flagship.',          icon: 'circle' },
    { id: 'openai-o3',        name: 'OpenAI o3',       provider: 'OpenAI',    speed: 'slow',    quality: 'best',      desc: 'Frontier-level reasoning and STEM solving. Hardest problems.',  icon: 'circle' },
    { id: 'gemini-3-1-pro',   name: 'Gemini 3.1 Pro',  provider: 'Google',    speed: 'medium',  quality: 'excellent', desc: 'Native multimodal synthesis. 1M+ token context window.',         icon: 'circle' },
  ];

  const POOL_LABELS = { standard: 'STANDARD', claude: 'CLAUDE', premium: 'PREMIUM' };
  const POOL_BADGES = {
    standard: { label: 'Included in Pro',          cls: 'tier-standard' },
    claude:   { label: 'Claude add-on +$9.99/mo',  cls: 'tier-claude'   },
    premium:  { label: 'Premium add-on +$9.99/mo', cls: 'tier-premium'  },
  };
  const SPEED_BARS = { fastest: '●●●●○', fast: '●●●○○', medium: '●●○○○', slow: '●○○○○' };
  const QUALITY_BARS = { best: '●●●●●', excellent: '●●●●○', good: '●●●○○', basic: '●●○○○' };

  /* ── Pool helpers ─────────────────────────────────────────────── */
  function _modelsByPool(poolId) {
    return MODEL_CATALOG.filter(m => TokenConfig.poolFor(m.id) === poolId);
  }

  function _freeModels() {
    return MODEL_CATALOG.filter(m => TokenConfig.isFreeModel(m.id));
  }

  /** Returns { remaining, allowance, used, purchased } for a pool. */
  function _poolStats(pools, poolId) {
    const p = pools?.[poolId] || { allowance: 0, used: 0, purchased: 0 };
    const allowanceLeft = Math.max(0, (p.allowance || 0) - (p.used || 0));
    return {
      allowanceLeft,
      allowance: p.allowance || 0,
      used: p.used || 0,
      purchased: p.purchased || 0,
      total: allowanceLeft + (p.purchased || 0),
    };
  }

  /* ── Render ─────────────────────────────────────────────────── */
  function render(el) {
    const balance = State.get('token_balance') || {};
    const pools = balance.pools || {};
    const isPro = typeof Subscription !== 'undefined' && Subscription.isPro && Subscription.isPro();
    const userAddons = typeof Subscription !== 'undefined' && Subscription.getAddons ? Subscription.getAddons() : [];
    const enabled = State.get('enabled_models') || _defaultEnabled();

    // Resolve the active stack (or pick a default for the user)
    if (typeof Stacks !== 'undefined' && !Stacks.activeStack()) {
      const def = Stacks.defaultStackForUser({ pro: isPro, addons: userAddons });
      Stacks.applyStack(def);
    }
    const activeStackId = typeof Stacks !== 'undefined' ? Stacks.activeStack() : null;
    const advancedOpen = localStorage.getItem('nice-vault-advanced') === '1';

    el.innerHTML = `
      <div class="vault-wrap">

        <!-- Token Balance Bars (one per active pool) -->
        ${_renderBalanceBars(pools, isPro, userAddons)}

        <!-- Stack Picker (primary UX) -->
        <div class="vault-section vault-stacks-section">
          <div class="vault-section-hdr">
            <h3 class="vault-section-title">Choose a Stack</h3>
            <span class="vault-section-badge tier-standard">Bundled model presets · Switch anytime</span>
          </div>
          <p class="vault-stacks-intro">Pick the stack that matches what you're doing. Each stack pre-configures 4–6 models so NICE Auto can route every task to the right one. You can also fine-tune individual models below.</p>
          <div class="vault-stack-grid">
            ${typeof Stacks !== 'undefined' ? Stacks.listStacks().map(s => _renderStackCard(s, activeStackId, isPro, userAddons)).join('') : ''}
          </div>
        </div>

        <!-- Advanced model toggles (collapsed by default) -->
        <div class="vault-section">
          <div class="vault-section-hdr">
            <h3 class="vault-section-title">Advanced — individual models</h3>
            <button class="btn btn-sm" id="vault-advanced-toggle">${advancedOpen ? 'Hide' : 'Show'}</button>
          </div>
          <p class="vault-stacks-intro">Override the active stack by toggling specific models. Useful for power users who want to mix-and-match across stacks.</p>
          <div class="vault-advanced-body" ${advancedOpen ? '' : 'hidden'}>
            <!-- Free Tier (always available) -->
            <div class="vault-subsection">
              <h4 class="vault-subsection-title">Free</h4>
              <div class="vault-model-grid">
                ${_freeModels().map(m => _renderModelCard(m, enabled, true)).join('')}
              </div>
            </div>
            <!-- Standard Pool (Pro plan) -->
            <div class="vault-subsection">
              <h4 class="vault-subsection-title">Standard ${_sectionBadge('standard', isPro, userAddons)}</h4>
              <div class="vault-model-grid">
                ${_modelsByPool('standard').map(m => _renderModelCard(m, enabled, isPro)).join('')}
              </div>
            </div>
            <!-- Claude Pool (Claude add-on) -->
            <div class="vault-subsection">
              <h4 class="vault-subsection-title">Claude ${_sectionBadge('claude', isPro, userAddons)}</h4>
              <div class="vault-model-grid">
                ${_modelsByPool('claude').map(m => _renderModelCard(m, enabled, isPro && userAddons.includes('claude'))).join('')}
              </div>
            </div>
            <!-- Premium Pool (Premium add-on) -->
            <div class="vault-subsection">
              <h4 class="vault-subsection-title">Premium ${_sectionBadge('premium', isPro, userAddons)}</h4>
              <div class="vault-model-grid">
                ${_modelsByPool('premium').map(m => _renderModelCard(m, enabled, isPro && userAddons.includes('premium'))).join('')}
              </div>
            </div>
          </div>
        </div>

        <!-- Stats footer -->
        <div class="vault-stats">
          <div class="vault-stat">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-cpu"/></svg>
            <span class="vault-stat-num">${MODEL_CATALOG.length}</span>
            <span class="vault-stat-label">Models in catalog</span>
          </div>
          <div class="vault-stat">
            <span class="status-dot dot-g"></span>
            <span class="vault-stat-num">NICE Auto</span>
            <span class="vault-stat-label">Routes to the best model in your active stack</span>
          </div>
        </div>
      </div>
    `;

    _bindEvents(el);
  }

  /* ── Stack card ────────────────────────────────────────────── */
  function _renderStackCard(stack, activeStackId, isPro, addons) {
    const unlocked = Stacks.isStackUnlocked(stack.id, { pro: isPro, addons });
    const isActive = stack.id === activeStackId;
    const lockReason = unlocked ? null : Stacks.lockReason(stack.id, { pro: isPro, addons });

    const modelChips = stack.models.map(id => {
      const m = MODEL_CATALOG.find(x => x.id === id);
      const name = m?.name || id;
      const w = TokenConfig.weightFor(id);
      const wLabel = w === 0 ? 'free' : `${w}t`;
      return `<span class="vault-stack-chip" title="${_esc(wLabel)}">${_esc(name)}</span>`;
    }).join('');

    let cta;
    if (isActive) {
      cta = `<button class="btn btn-sm" disabled>Active</button>`;
    } else if (unlocked) {
      cta = `<button class="btn btn-sm btn-primary" data-activate-stack="${stack.id}">Activate</button>`;
    } else {
      cta = `<button class="btn btn-sm" data-unlock-stack="${stack.id}">${_esc(lockReason)}</button>`;
    }

    return `
      <div class="vault-stack-card ${isActive ? 'vault-stack-active' : ''} ${unlocked ? '' : 'vault-stack-locked'}" data-stack="${stack.id}">
        <div class="vault-stack-hdr">
          <span class="vault-stack-icon">${stack.icon}</span>
          <div class="vault-stack-name-wrap">
            <span class="vault-stack-name">${_esc(stack.name)}</span>
            <span class="vault-stack-tagline">${_esc(stack.tagline)}</span>
          </div>
        </div>
        <p class="vault-stack-desc">${_esc(stack.description)}</p>
        <div class="vault-stack-chips">${modelChips}</div>
        <div class="vault-stack-actions">${cta}</div>
      </div>
    `;
  }

  /* ── Balance bars ─────────────────────────────────────────────── */
  function _renderBalanceBars(pools, isPro, userAddons) {
    if (!isPro) {
      return `
        <div class="vault-balance-bar">
          <div class="vault-balance-info">
            <span class="vault-balance-label">Free plan</span>
            <span class="vault-balance-num">Gemini 2.5 Flash only</span>
          </div>
          <div class="vault-balance-actions">
            <button class="btn btn-sm btn-primary" id="vault-upgrade">Upgrade to Pro</button>
          </div>
        </div>
      `;
    }

    const bars = [];
    bars.push(_oneBalanceBar('standard', _poolStats(pools, 'standard'), 'Standard'));
    if (userAddons.includes('claude'))  bars.push(_oneBalanceBar('claude',  _poolStats(pools, 'claude'),  'Claude'));
    if (userAddons.includes('premium')) bars.push(_oneBalanceBar('premium', _poolStats(pools, 'premium'), 'Premium'));
    return bars.join('');
  }

  function _oneBalanceBar(poolId, stats, label) {
    return `
      <div class="vault-balance-bar">
        <div class="vault-balance-info">
          <span class="vault-balance-label">${_esc(label)} tokens</span>
          <span class="vault-balance-num">${stats.total.toLocaleString()}</span>
          <span class="vault-balance-sub">${stats.allowanceLeft.toLocaleString()} allowance + ${stats.purchased.toLocaleString()} purchased</span>
        </div>
        <div class="vault-balance-actions">
          <button class="btn btn-sm" data-buy-pool="${poolId}">Buy more</button>
        </div>
      </div>
    `;
  }

  /* ── Section badge (status of pool entitlement) ────────────────── */
  function _sectionBadge(poolId, isPro, addons) {
    const badge = POOL_BADGES[poolId];
    if (!badge) return '';
    const requiredAddon = TokenConfig.requiredAddon(poolId);
    const entitled = isPro && (requiredAddon === null || addons.includes(requiredAddon));
    const cls = entitled ? badge.cls : 'tier-locked';
    const label = entitled ? `Active — ${TokenConfig.monthlyAllowance(poolId)} tokens/mo` : badge.label;
    return `<span class="vault-section-badge ${cls}">${_esc(label)}</span>`;
  }

  /* ── Upsell banner shown under a locked section ────────────────── */
  function _upsellBanner(name, copy) {
    return `
      <div class="vault-upsell">
        <span class="vault-upsell-icon">🔒</span>
        <p class="vault-upsell-copy">${_esc(copy)}</p>
        <button class="btn btn-sm btn-primary" id="vault-upsell-${_esc(name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}">Unlock</button>
      </div>
    `;
  }

  /* ── Model Card ─────────────────────────────────────────────── */
  function _renderModelCard(model, enabled, available) {
    const isFree = TokenConfig.isFreeModel(model.id);
    const pool = TokenConfig.poolFor(model.id);
    const weight = TokenConfig.weightFor(model.id);
    const isOn = !!enabled[model.id] || isFree;
    const lockedCls = available ? '' : 'vault-model-locked';
    const tierClass = isFree ? 'tier-free' : `tier-${pool}`;
    const weightLabel = isFree ? 'Free' : weight === 1 ? '1 token/msg' : `${weight} tokens/msg`;

    return `
      <div class="vault-model-card ${isOn && available ? 'active' : ''} ${tierClass} ${lockedCls}" data-model="${model.id}" title="${weightLabel}">
        <div class="vault-model-hdr">
          <span class="vault-model-icon"><svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-${model.icon}"/></svg></span>
          <div class="vault-model-name-wrap">
            <span class="vault-model-name">${_esc(model.name)}</span>
            <span class="vault-model-provider">${_esc(model.provider)}</span>
          </div>
          <label class="vault-toggle">
            <input type="checkbox" ${isOn ? 'checked' : ''} ${(isFree || !available) ? 'disabled' : ''} data-model="${model.id}">
            <span class="vault-toggle-slider"></span>
          </label>
        </div>
        <p class="vault-model-desc">${_esc(model.desc)}</p>
        <div class="vault-model-meta">
          <span class="vault-model-tier ${tierClass}">${_esc(weightLabel)}</span>
          <span class="vault-model-speed" title="Speed">${SPEED_BARS[model.speed] || ''}</span>
          <span class="vault-model-quality" title="Quality">${QUALITY_BARS[model.quality] || ''}</span>
        </div>
      </div>
    `;
  }

  /* ── Events ─────────────────────────────────────────────────── */
  function _bindEvents(el) {
    el.querySelectorAll('.vault-toggle input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const modelId = cb.dataset.model;
        const model = MODEL_CATALOG.find(m => m.id === modelId);
        if (!model || TokenConfig.isFreeModel(modelId)) return;

        const enabled = State.get('enabled_models') || _defaultEnabled();
        enabled[modelId] = cb.checked;
        State.set('enabled_models', enabled);
        try { localStorage.setItem(Utils.KEYS.enabledModels, JSON.stringify(enabled)); } catch {}

        const card = cb.closest('.vault-model-card');
        if (card) card.classList.toggle('active', cb.checked);

        if (typeof Notify !== 'undefined') {
          Notify.send({
            title: cb.checked ? 'Model Enabled' : 'Model Disabled',
            message: `${model.name} is now ${cb.checked ? 'available' : 'disabled'} for your agents.`,
            type: 'system',
          });
        }
      });
    });

    // Stack activation
    el.querySelectorAll('[data-activate-stack]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.activateStack;
        if (typeof Stacks === 'undefined') return;
        if (!Stacks.applyStack(id)) return;
        const stack = Stacks.getStack(id);
        if (typeof Notify !== 'undefined' && stack) {
          Notify.send({
            title: stack.name + ' activated',
            message: stack.tagline + ' · ' + stack.models.length + ' models enabled',
            type: 'system',
          });
        }
        // Re-render to reflect the new active state
        render(el);
      });
    });

    // Locked stack → upsell
    el.querySelectorAll('[data-unlock-stack]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (typeof UpgradeModal !== 'undefined') UpgradeModal.open();
        else if (typeof Router !== 'undefined') Router.navigate('/security?tab=wallet');
      });
    });

    // Advanced toggle (show/hide individual model grid)
    const advBtn = el.querySelector('#vault-advanced-toggle');
    if (advBtn) {
      advBtn.addEventListener('click', () => {
        const body = el.querySelector('.vault-advanced-body');
        if (!body) return;
        const isHidden = body.hasAttribute('hidden');
        if (isHidden) {
          body.removeAttribute('hidden');
          advBtn.textContent = 'Hide';
          localStorage.setItem('nice-vault-advanced', '1');
        } else {
          body.setAttribute('hidden', '');
          advBtn.textContent = 'Show';
          localStorage.removeItem('nice-vault-advanced');
        }
      });
    }

    // Upgrade-to-Pro CTA (visible to free users)
    const upgradeBtn = el.querySelector('#vault-upgrade');
    if (upgradeBtn) {
      upgradeBtn.addEventListener('click', () => {
        if (typeof UpgradeModal !== 'undefined') UpgradeModal.open();
      });
    }

    // Upsell unlock buttons
    el.querySelectorAll('[id^="vault-upsell-"]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (typeof UpgradeModal !== 'undefined') UpgradeModal.open();
      });
    });

    // Buy-more buttons (deep-link to wallet with pool query)
    el.querySelectorAll('[data-buy-pool]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (typeof Router !== 'undefined') {
          Router.navigate('/security?tab=wallet&pool=' + btn.dataset.buyPool);
        }
      });
    });
  }

  /* ── Defaults ───────────────────────────────────────────────── */
  function _defaultEnabled() {
    try {
      const saved = JSON.parse(localStorage.getItem(Utils.KEYS.enabledModels) || 'null');
      if (saved) return saved;
    } catch { /* ignore */ }

    // Default: free models on, everything else off
    const defaults = {};
    MODEL_CATALOG.forEach(m => { defaults[m.id] = TokenConfig.isFreeModel(m.id); });
    return defaults;
  }

  return { title, render, MODEL_CATALOG };
})();
