/* ═══════════════════════════════════════════════════════════════════
   NICE — Model Catalog (SSOT)

   Single source of truth for the AI-model presentation layer:
   display name, provider, speed/quality bars, marketing description,
   and per-model attachment capability flags (vision/pdf/audio/video).

   Pool + weight live in TokenConfig.MODELS; this module's `id` field
   joins to that. The pair forms the complete model record.

   Consumed by:
     • app/js/views/vault.js — "AI Models" picker + re-exports as
       VaultView.MODEL_CATALOG for backwards compatibility
     • app/js/views/agent-builder.js — derives LLM_PROVIDERS / LLM_MODELS
     • app/js/views/settings.js — model-list checklist
     • app/js/views/docs.js — Models section table
     • scripts/build-pricing.mjs — marketing pricing page generator

   Edit display copy here, then:
     • The app picks up changes on next page load (no build).
     • Re-run `npm run build:pricing` to regenerate www/pricing.html.

   UMD wrapper: works as a browser <script> (assigns ModelCatalog
   global) and as Node require() (returns the module).
═══════════════════════════════════════════════════════════════════ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ModelCatalog = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  /* ── Catalog ──────────────────────────────────────────────────
     The 10 entries below match TokenConfig.MODELS (which is the
     SSOT for pool + weight). This catalog adds presentation-only
     fields like provider, speed, quality, and description copy.
     Capability flags drive prompt-panel attachment gating. */
  const MODEL_CATALOG = [
    // ── Free tier (Gemini 2.5 Flash — included for everyone)
    { id: 'gemini-2-5-flash', name: 'Gemini 2.5 Flash', provider: 'Google',    speed: 'fastest', quality: 'good',      desc: 'High-volume scaling. Best-in-class economics. Always free.', icon: 'circle', vision: true,  pdf: true,  audio: true,  video: true  },

    // ── Standard pool (Pro)
    { id: 'gpt-5-mini',       name: 'GPT-5 mini',        provider: 'OpenAI',    speed: 'fast',    quality: 'good',      desc: 'Low-cost, reliable general intelligence. Default workhorse.',        icon: 'circle', vision: true,  pdf: false, audio: false, video: false },
    // Llama 4 Scout via Groq: multimodal in the model card, but Groq's passthrough
    // of OpenAI-style image_url parts hasn't been verified end-to-end here yet.
    { id: 'llama-4-scout',    name: 'Llama 4 Scout',     provider: 'Meta',      speed: 'medium',  quality: 'good',      desc: '10M context window for local and air-gapped environments.',          icon: 'circle', vision: false, pdf: false, audio: false, video: false },
    // Grok 4.1 Fast: xAI supports vision, but not smoke-tested through nice-ai's
    // OpenAI-compat translator yet. Flip to true once verified.
    { id: 'grok-4-1-fast',    name: 'Grok 4.1 Fast',     provider: 'xAI',       speed: 'fast',    quality: 'excellent', desc: 'Industry-leading 2M token context window. Real-time research.',     icon: 'circle', vision: false, pdf: false, audio: false, video: false },

    // ── Claude pool (Claude add-on)
    { id: 'claude-4-6-sonnet', name: 'Claude 4.6 Sonnet', provider: 'Anthropic', speed: 'fast',    quality: 'excellent', desc: 'Best balance of speed, cost, and intelligence. Production default.', icon: 'circle', vision: true,  pdf: true,  audio: false, video: false },
    { id: 'claude-4-7-opus',   name: 'Claude 4.7 Opus',   provider: 'Anthropic', speed: 'slow',    quality: 'best',      desc: 'Expert writing and nuanced synthesis. Premium flagship.',            icon: 'circle', vision: true,  pdf: true,  audio: false, video: false },

    // ── Premium pool (Premium add-on)
    { id: 'gpt-5-4-pro',      name: 'GPT-5.4 Pro',       provider: 'OpenAI',    speed: 'medium',  quality: 'best',      desc: '1M context, 128K output, multimodal. OpenAI\'s flagship.',           icon: 'circle', vision: true,  pdf: false, audio: false, video: false },
    // Codex is tuned for agentic coding; OpenAI lists vision but we don't send
    // images to it until a product case emerges.
    { id: 'gpt-5-3-codex',    name: 'GPT-5.3 Codex',     provider: 'OpenAI',    speed: 'fast',    quality: 'excellent', desc: 'Specialized for agentic coding tasks. Code flagship.',               icon: 'circle', vision: false, pdf: false, audio: false, video: false },
    { id: 'openai-o3',        name: 'OpenAI o3',         provider: 'OpenAI',    speed: 'slow',    quality: 'best',      desc: 'Frontier-level reasoning and STEM solving. Hardest problems.',       icon: 'circle', vision: true,  pdf: false, audio: false, video: false },
    { id: 'gemini-2-5-pro',   name: 'Gemini 2.5 Pro',    provider: 'Google',    speed: 'medium',  quality: 'excellent', desc: 'Native multimodal synthesis. 1M+ token context window.',             icon: 'circle', vision: true,  pdf: true,  audio: true,  video: true  },
  ];

  function getById(id) {
    return MODEL_CATALOG.find(m => m.id === id) || null;
  }

  function listProviders() {
    return [...new Set(MODEL_CATALOG.map(m => m.provider))];
  }

  return { MODEL_CATALOG, getById, listProviders };
}));
