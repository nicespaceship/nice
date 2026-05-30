/* ═══════════════════════════════════════════════════════════════════
   NICE — Training-data Consent Prompt (NICE-1 Phase 0)
   A one-time, affirmative opt-in ask shown after sign-in. Consent stays
   OFF by default (GDPR-valid: a clear affirmative action, never pre-ticked).
   SSOT for the consent write — the Settings toggle calls setConsent() too.
   See docs/nice-1-phase0-spec.md.
═══════════════════════════════════════════════════════════════════ */

const ConsentPrompt = (() => {
  // Bump when the consent copy / policy materially changes so users who
  // predate the change get re-asked. Mirrors training_consent_version.
  const VERSION = '2026-05-v1';

  let _overlay = null;

  /* ── SSOT consent write (shared with SettingsView) ── */
  async function setConsent(on) {
    const user = (typeof State !== 'undefined') ? State.get('user') : null;
    if (!user || typeof SB === 'undefined' || !SB.isReady()) return false;
    await SB.db('profiles').update(user.id, {
      training_consent: on,
      training_consent_at: new Date().toISOString(),
      training_consent_version: on ? VERSION : null,
    });
    return true;
  }

  function _promptedKey() {
    return (typeof Utils !== 'undefined' && Utils.KEYS) ? Utils.KEYS.consentPrompted : 'nice-consent-prompted';
  }
  function _alreadyPrompted() {
    try { return localStorage.getItem(_promptedKey()) === VERSION; } catch { return false; }
  }
  function _markPrompted() {
    try { localStorage.setItem(_promptedKey(), VERSION); } catch { /* private mode */ }
  }

  /* ── Subscribe to auth so the ask fires once the user is settled ── */
  function init() {
    if (typeof State === 'undefined') return;
    State.on('user', (user) => { if (user) _schedule(); });
    if (State.get('user')) _schedule();
  }

  function _schedule() {
    // Delay past the first-run setup wizard's own settle (1.5s) so the wizard
    // wins for brand-new users; maybeShow self-guards against stacking anyway.
    setTimeout(() => { maybeShow().catch(() => {}); }, 4000);
  }

  async function maybeShow() {
    if (_overlay) return;
    const user = (typeof State !== 'undefined') ? State.get('user') : null;
    if (!user) return;
    if (_alreadyPrompted()) return;
    if (document.querySelector('.wizard-overlay')) return; // never stack on the wizard

    // Only ask if we can actually persist the answer. A successful profile read
    // confirms a real authenticated session (a stale user object with no valid
    // token fails RLS here), so we never show on the signed-out / sign-in screen.
    if (typeof SB === 'undefined' || !SB.isReady()) return;
    let profile;
    try {
      profile = await SB.db('profiles').get(user.id);
    } catch {
      return; // no working session — ask on a later load
    }
    if (!profile) return;

    // Already decided at this version (e.g. via the Settings toggle).
    if (profile.training_consent || profile.training_consent_version === VERSION) {
      _markPrompted();
      return;
    }

    _render();
  }

  function _render() {
    _overlay = document.createElement('div');
    _overlay.className = 'consent-modal-overlay';
    _overlay.setAttribute('role', 'dialog');
    _overlay.setAttribute('aria-modal', 'true');
    _overlay.setAttribute('aria-label', 'Help improve NICE');
    _overlay.innerHTML = `
      <div class="consent-modal">
        <div class="consent-modal-glyph" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.5 2.5M16.5 16.5L19 19M19 5l-2.5 2.5M7.5 16.5L5 19"/>
            <circle cx="12" cy="12" r="3.2"/>
          </svg>
        </div>
        <h2 class="consent-modal-title">Help build a faster, cheaper NICE</h2>
        <p class="consent-modal-body">NICE can learn from how your spaceships run missions to train its own models. The AI you use gets faster and costs you fewer tokens over time. Your data is never sold, and you can turn this off anytime in Settings.</p>
        <div class="consent-modal-actions">
          <button class="btn btn-sm" id="consent-decline" type="button">Not now</button>
          <button class="btn btn-sm btn-primary" id="consent-accept" type="button">Yes, help improve NICE</button>
        </div>
        <p class="consent-modal-footer">Off by default. You stay in control.</p>
      </div>
    `;
    document.body.appendChild(_overlay);
    requestAnimationFrame(() => _overlay.classList.add('open'));

    _overlay.querySelector('#consent-accept').addEventListener('click', () => _decide(true));
    _overlay.querySelector('#consent-decline').addEventListener('click', () => _decide(false));
    document.addEventListener('keydown', _onKey);
    // Deliberately no backdrop-dismiss: we want an explicit choice, and "Not
    // now" makes declining one click. Escape resolves to "Not now".
  }

  function _onKey(e) {
    if (e.key === 'Escape') _decide(false);
  }

  async function _decide(accepted) {
    // Dismiss first so the UI is never stuck, then persist in the background.
    close();
    _markPrompted();

    if (!accepted) {
      if (typeof AuditLog !== 'undefined') AuditLog.log('training_consent_declined', { source: 'onboarding' });
      return;
    }

    try {
      const ok = await setConsent(true);
      if (!ok) {
        if (typeof Notify !== 'undefined') {
          Notify.send({ title: 'Sign in to enable', message: 'Sign in, then turn this on in Settings, Privacy and Data.', type: 'agent_error' });
        }
        return;
      }
      if (typeof Notify !== 'undefined') {
        Notify.send({ title: 'Thanks for helping improve NICE', message: 'NICE will learn from your missions. Turn it off anytime in Settings.', type: 'system' });
      }
      if (typeof AuditLog !== 'undefined') AuditLog.log('training_consent_granted', { source: 'onboarding' });
    } catch {
      if (typeof Notify !== 'undefined') {
        Notify.send({ title: 'Could not save', message: 'Try again from Settings, Privacy and Data.', type: 'agent_error' });
      }
    }
  }

  function close() {
    if (!_overlay) return;
    document.removeEventListener('keydown', _onKey);
    _overlay.classList.remove('open');
    const ref = _overlay;
    _overlay = null;
    setTimeout(() => ref.remove(), 200);
  }

  return { VERSION, init, maybeShow, setConsent, close };
})();
