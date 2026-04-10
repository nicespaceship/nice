/* ═══════════════════════════════════════════════════════════════════
   NICE — Vault View
   AI Model selector. NICE provides all LLMs — users choose which
   models their agents can use. Free tier = Gemini Flash.
   Premium models cost tokens (purchased via Stripe).
═══════════════════════════════════════════════════════════════════ */

const VaultView = (() => {
  const title = 'Vault';
  const _esc = Utils.esc;

  /* ── Model Catalog ──────────────────────────────────────────── */
  const MODEL_CATALOG = [
    // Free tier
    { id: 'gemini-2.5-flash',    name: 'Gemini 2.5 Flash',   provider: 'Google',    icon: 'circle', tier: 'free',    speed: 'fast',   quality: 'good',    desc: 'Fast & free. Great for most tasks.' },
    { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Lite',  provider: 'Google',    icon: 'circle', tier: 'free',    speed: 'fastest', quality: 'basic',   desc: 'Ultra-fast for simple tasks.' },
    // Premium
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', provider: 'Anthropic', icon: 'circle', tier: 'premium', speed: 'fastest', quality: 'good',     desc: 'Fast, cheap-premium. Default for Epic-tier agents.' },
    { id: 'claude-sonnet-4-6',   name: 'Claude Sonnet 4.6',   provider: 'Anthropic', icon: 'circle', tier: 'premium', speed: 'fast',   quality: 'excellent', desc: 'Best balance of speed and intelligence. Default for Legendary agents.' },
    { id: 'claude-opus-4-6',     name: 'Claude Opus 4.6',     provider: 'Anthropic', icon: 'circle', tier: 'premium', speed: 'slow',   quality: 'best',    desc: 'Most capable model. Default for Mythic agents.' },
    { id: 'gpt-5.2',             name: 'GPT-5.2',             provider: 'OpenAI',    icon: 'circle', tier: 'premium', speed: 'fast',   quality: 'excellent', desc: 'OpenAI\'s latest flagship model.' },
    { id: 'gpt-5-mini',          name: 'GPT-5 Mini',          provider: 'OpenAI',    icon: 'circle', tier: 'premium', speed: 'fast',   quality: 'good',    desc: 'Fast and affordable from OpenAI.' },
    { id: 'gemini-2.5-pro',      name: 'Gemini 2.5 Pro',      provider: 'Google',    icon: 'circle', tier: 'premium', speed: 'medium', quality: 'excellent', desc: 'Google\'s most capable model.' },
    // Budget
    { id: 'deepseek-chat',       name: 'DeepSeek V3',         provider: 'DeepSeek',  icon: 'cpu', tier: 'budget',  speed: 'fast',   quality: 'good',    desc: 'Powerful open-weight model. Very affordable.' },
    { id: 'mistral-large-latest', name: 'Mistral Large 3',    provider: 'Mistral',   icon: 'circle', tier: 'budget',  speed: 'fast',   quality: 'good',    desc: 'European AI. Strong multilingual.' },
    { id: 'grok-4',              name: 'Grok 4',              provider: 'xAI',       icon: 'circle', tier: 'premium', speed: 'fast',   quality: 'excellent', desc: 'xAI\'s real-time knowledge model.' },
  ];

  const TIER_LABELS = { free: 'FREE', premium: 'PREMIUM', budget: 'BUDGET' };
  const TIER_CLASSES = { free: 'tier-free', premium: 'tier-premium', budget: 'tier-budget' };
  const SPEED_BARS = { fastest: '●●●●○', fast: '●●●○○', medium: '●●○○○', slow: '●○○○○' };
  const QUALITY_BARS = { best: '●●●●○', excellent: '●●●○○', good: '●●○○○', basic: '●○○○○' };

  /* ── Render ─────────────────────────────────────────────────── */
  function render(el) {
    // Get enabled models from state (default: free models on)
    const enabled = State.get('enabled_models') || _defaultEnabled();
    const tokenBalance = State.get('token_balance') || { balance: 0, free_tier_remaining: 100000 };
    const totalAvailable = (tokenBalance.balance || 0) + (tokenBalance.free_tier_remaining || 0);
    const enabledCount = Object.values(enabled).filter(Boolean).length;
    const freeModels = MODEL_CATALOG.filter(m => m.tier === 'free');
    const premiumModels = MODEL_CATALOG.filter(m => m.tier === 'premium');
    const budgetModels = MODEL_CATALOG.filter(m => m.tier === 'budget');

    el.innerHTML = `
      <div class="vault-wrap">

        <!-- Token Balance Bar -->
        <div class="vault-balance-bar">
          <div class="vault-balance-info">
            <span class="vault-balance-label">Token Balance</span>
            <span class="vault-balance-num">${totalAvailable.toLocaleString()}</span>
          </div>
          <div class="vault-balance-actions">
            <button class="btn btn-sm" id="vault-buy-tokens">Buy Tokens</button>
          </div>
        </div>

        <!-- Free Tier -->
        <div class="vault-section">
          <div class="vault-section-hdr">
            <h3 class="vault-section-title">Free Models</h3>
            <span class="vault-section-badge free">Always available — no tokens required</span>
          </div>
          <div class="vault-model-grid" id="vault-free-models">
            ${freeModels.map(m => _renderModelCard(m, enabled)).join('')}
          </div>
        </div>

        <!-- Premium Tier -->
        <div class="vault-section">
          <div class="vault-section-hdr">
            <h3 class="vault-section-title">Premium Models</h3>
            <span class="vault-section-badge premium">Uses tokens — best quality</span>
          </div>
          <div class="vault-model-grid" id="vault-premium-models">
            ${premiumModels.map(m => _renderModelCard(m, enabled)).join('')}
          </div>
        </div>

        <!-- Budget Tier -->
        <div class="vault-section">
          <div class="vault-section-hdr">
            <h3 class="vault-section-title">Budget Models</h3>
            <span class="vault-section-badge budget">Uses tokens — cost-effective</span>
          </div>
          <div class="vault-model-grid" id="vault-budget-models">
            ${budgetModels.map(m => _renderModelCard(m, enabled)).join('')}
          </div>
        </div>

        <!-- Stats -->
        <div class="vault-stats">
          <div class="vault-stat">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-cpu"/></svg>
            <span class="vault-stat-num">${enabledCount}/${MODEL_CATALOG.length}</span>
            <span class="vault-stat-label">Models Active</span>
          </div>
          <div class="vault-stat">
            <span class="status-dot dot-g"></span>
            <span class="vault-stat-num">NICE Auto</span>
            <span class="vault-stat-label">Picks the best model for each task</span>
          </div>
        </div>
      </div>
    `;

    _bindEvents(el);
  }

  /* ── Model Card ─────────────────────────────────────────────── */
  function _renderModelCard(model, enabled) {
    const isOn = !!enabled[model.id];
    const isFree = model.tier === 'free';
    const tierLabel = TIER_LABELS[model.tier];
    const tierClass = TIER_CLASSES[model.tier];

    return `
      <div class="vault-model-card ${isOn ? 'active' : ''} ${tierClass}" data-model="${model.id}">
        <div class="vault-model-hdr">
          <span class="vault-model-icon"><svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5" style="color:${model.tier === 'free' ? 'var(--color-success)' : model.tier === 'premium' ? '#a855f7' : '#eab308'}"><use href="#icon-${model.icon}"/></svg></span>
          <div class="vault-model-name-wrap">
            <span class="vault-model-name">${_esc(model.name)}</span>
            <span class="vault-model-provider">${_esc(model.provider)}</span>
          </div>
          <label class="vault-toggle">
            <input type="checkbox" ${isOn ? 'checked' : ''} ${isFree ? 'checked disabled' : ''} data-model="${model.id}">
            <span class="vault-toggle-slider"></span>
          </label>
        </div>
        <p class="vault-model-desc">${_esc(model.desc)}</p>
        <div class="vault-model-meta">
          <span class="vault-model-tier ${tierClass}">${tierLabel}</span>
          <span class="vault-model-speed" title="Speed">${SPEED_BARS[model.speed]}</span>
          <span class="vault-model-quality" title="Quality">${QUALITY_BARS[model.quality]}</span>
        </div>
      </div>
    `;
  }

  /* ── Events ─────────────────────────────────────────────────── */
  function _bindEvents(el) {
    // Model toggles
    el.querySelectorAll('.vault-toggle input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const modelId = cb.dataset.model;
        const model = MODEL_CATALOG.find(m => m.id === modelId);
        if (!model || model.tier === 'free') return; // Can't disable free models

        const enabled = State.get('enabled_models') || _defaultEnabled();
        enabled[modelId] = cb.checked;
        State.set('enabled_models', enabled);
        localStorage.setItem(Utils.KEYS.enabledModels, JSON.stringify(enabled));

        // Update card visual
        const card = cb.closest('.vault-model-card');
        if (card) card.classList.toggle('active', cb.checked);

        // Update stats
        const count = Object.values(enabled).filter(Boolean).length;
        const statNum = el.querySelector('.vault-stat-num');
        if (statNum) statNum.textContent = `${count}/${MODEL_CATALOG.length}`;

        if (typeof Notify !== 'undefined') {
          Notify.send({
            title: cb.checked ? 'Model Enabled' : 'Model Disabled',
            message: `${model.name} is now ${cb.checked ? 'available' : 'disabled'} for your agents.`,
            type: 'system',
          });
        }
      });
    });

    // Buy tokens button
    const buyBtn = el.querySelector('#vault-buy-tokens');
    if (buyBtn) {
      buyBtn.addEventListener('click', () => {
        if (typeof Router !== 'undefined') Router.go('#/wallet');
      });
    }
  }

  /* ── Defaults ───────────────────────────────────────────────── */
  function _defaultEnabled() {
    try {
      const saved = JSON.parse(localStorage.getItem(Utils.KEYS.enabledModels) || 'null');
      if (saved) return saved;
    } catch { /* ignore */ }

    // Default: free models on, everything else off
    const defaults = {};
    MODEL_CATALOG.forEach(m => { defaults[m.id] = m.tier === 'free'; });
    return defaults;
  }

  return { title, render, MODEL_CATALOG };
})();
