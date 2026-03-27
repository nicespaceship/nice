/* ═══════════════════════════════════════════════════════════════════
   NICE — Auth Modal
   Inline sign-in / sign-up overlay usable from any view.
   Call AuthModal.open() to show, AuthModal.close() to hide.
═══════════════════════════════════════════════════════════════════ */

const AuthModal = (() => {
  let _overlay = null;

  function open(message) {
    if (_overlay) { _overlay.classList.add('open'); return; }

    _overlay = document.createElement('div');
    _overlay.className = 'auth-modal-overlay open';
    _overlay.innerHTML = `
      <div class="auth-modal">
        <button class="auth-modal-close" aria-label="Close">&times;</button>
        <h2>Sign in to NICE</h2>
        <p class="auth-sub">${_esc(message || 'Sign in to continue')}</p>

        <div class="auth-tabs">
          <button class="auth-tab active" data-tab="signin">Sign In</button>
          <button class="auth-tab" data-tab="signup">Sign Up</button>
        </div>

        <form class="auth-form" id="am-form-signin">
          <div class="auth-field">
            <label for="am-si-email">Email</label>
            <input type="email" id="am-si-email" required autocomplete="email" placeholder="pilot@nicespaceship.com" />
          </div>
          <div class="auth-field">
            <label for="am-si-pass">Password</label>
            <input type="password" id="am-si-pass" required autocomplete="current-password" placeholder="Enter password" />
          </div>
          <label class="auth-remember">
            <input type="checkbox" id="am-si-remember" checked />
            <span>Remember me</span>
          </label>
          <div class="auth-error" id="am-si-error"></div>
          <button type="submit" class="auth-submit" id="am-si-btn">Sign In</button>
          <div class="auth-divider"><span>or</span></div>
          <button type="button" class="auth-google-btn" id="am-google-btn">
            <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#4285F4" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#34A853" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#EA4335" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            Sign in with Google
          </button>
          <button type="button" class="auth-link" id="am-forgot-btn">Forgot password?</button>
        </form>

        <form class="auth-form" id="am-form-signup" style="display:none">
          <div class="auth-field">
            <label for="am-su-name">Display Name</label>
            <input type="text" id="am-su-name" required placeholder="Pilot_007" />
          </div>
          <div class="auth-field">
            <label for="am-su-email">Email</label>
            <input type="email" id="am-su-email" required autocomplete="email" placeholder="pilot@nicespaceship.com" />
          </div>
          <div class="auth-field">
            <label for="am-su-pass">Password</label>
            <input type="password" id="am-su-pass" required minlength="6" autocomplete="new-password" placeholder="Min 6 characters" />
          </div>
          <div class="auth-error" id="am-su-error"></div>
          <button type="submit" class="auth-submit" id="am-su-btn">Create Account</button>
          <div class="auth-divider"><span>or</span></div>
          <button type="button" class="auth-google-btn" id="am-google-btn-su">
            <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#4285F4" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#34A853" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#EA4335" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            Sign up with Google
          </button>
        </form>

        <div class="auth-footer">TRANSMISSION ENCRYPTED &mdash; TLS 1.3</div>
      </div>
    `;

    document.body.appendChild(_overlay);
    _bind();
  }

  function close() {
    if (_overlay) {
      _overlay.classList.remove('open');
      _overlay.remove();
      _overlay = null;
    }
  }

  function _bind() {
    _overlay.querySelector('.auth-modal-close').addEventListener('click', close);
    _overlay.addEventListener('click', e => { if (e.target === _overlay) close(); });

    _overlay.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        _overlay.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t === tab));
        document.getElementById('am-form-signin').style.display = tab.dataset.tab === 'signin' ? '' : 'none';
        document.getElementById('am-form-signup').style.display = tab.dataset.tab === 'signup' ? '' : 'none';
      });
    });

    document.getElementById('am-form-signin').addEventListener('submit', _handleSignIn);
    document.getElementById('am-form-signup').addEventListener('submit', _handleSignUp);
    document.getElementById('am-forgot-btn').addEventListener('click', _handleForgotPassword);
    document.getElementById('am-google-btn')?.addEventListener('click', _handleGoogleSignIn);
    document.getElementById('am-google-btn-su')?.addEventListener('click', _handleGoogleSignIn);
  }

  async function _handleSignIn(e) {
    e.preventDefault();
    const email = document.getElementById('am-si-email').value;
    const pass  = document.getElementById('am-si-pass').value;
    const errEl = document.getElementById('am-si-error');
    const btn   = document.getElementById('am-si-btn');

    errEl.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Signing in...';

    const remember = document.getElementById('am-si-remember')?.checked !== false;

    try {
      await SB.auth.signIn(email, pass);
      // If "Remember me" is unchecked, mark session as ephemeral
      // localStorage flag persists for next browser launch detection
      // sessionStorage flag marks current tab as active session
      if (!remember) {
        localStorage.setItem('nice-ephemeral-session', '1');
        sessionStorage.setItem('nice-ephemeral-session', '1');
      } else {
        localStorage.removeItem('nice-ephemeral-session');
        sessionStorage.removeItem('nice-ephemeral-session');
      }
      close();
      // Re-render current view by re-navigating to the current hash
      if (typeof Router !== 'undefined') {
        const h = location.hash || '#/';
        location.hash = '';
        setTimeout(() => { location.hash = h; }, 0);
      }
    } catch (err) {
      errEl.textContent = err.message || 'Sign in failed';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  }

  async function _handleSignUp(e) {
    e.preventDefault();
    const name  = document.getElementById('am-su-name').value;
    const email = document.getElementById('am-su-email').value;
    const pass  = document.getElementById('am-su-pass').value;
    const errEl = document.getElementById('am-su-error');
    const btn   = document.getElementById('am-su-btn');

    errEl.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Creating account...';

    try {
      await SB.auth.signUp(email, pass, name);
      errEl.style.color = 'var(--accent)';
      errEl.textContent = 'Check your email to confirm your account.';
    } catch (err) {
      errEl.textContent = err.message || 'Sign up failed';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Account';
    }
  }

  async function _handleGoogleSignIn() {
    try {
      const c = SB.client;
      if (!c) throw new Error('Service unavailable');
      const { error } = await c.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: location.origin + '/app/#/',
          scopes: 'email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/drive.readonly',
          queryParams: { access_type: 'offline', prompt: 'consent' },
        }
      });
      if (error) throw error;
      close();
    } catch (err) {
      const errEl = document.getElementById('am-si-error') || document.getElementById('am-su-error');
      if (errEl) errEl.textContent = err.message || 'Google sign-in failed';
    }
  }

  async function _handleForgotPassword() {
    const email = document.getElementById('am-si-email').value;
    const errEl = document.getElementById('am-si-error');
    if (!email) {
      errEl.textContent = 'Enter your email above first.';
      return;
    }
    const btn = document.getElementById('am-forgot-btn');
    btn.disabled = true;
    btn.textContent = 'Sending...';
    try {
      const c = SB.client;
      if (!c) throw new Error('Service unavailable');
      await c.auth.resetPasswordForEmail(email, {
        redirectTo: location.origin + '/app/#/profile'
      });
      errEl.style.color = 'var(--accent)';
      errEl.textContent = 'Password reset email sent. Check your inbox.';
    } catch (err) {
      errEl.textContent = err.message || 'Failed to send reset email';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Forgot password?';
    }
  }

  const _esc = Utils.esc;

  return { open, close };
})();
