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
          <button type="button" class="auth-github-btn" id="am-github-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            Sign in with GitHub
          </button>
          <button type="button" class="auth-x-btn" id="am-x-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            Sign in with X
          </button>
          <button type="button" class="auth-apple-btn" id="am-apple-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
            Sign in with Apple
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
          <button type="button" class="auth-github-btn" id="am-github-btn-su">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            Sign up with GitHub
          </button>
          <button type="button" class="auth-x-btn" id="am-x-btn-su">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            Sign up with X
          </button>
          <button type="button" class="auth-apple-btn" id="am-apple-btn-su">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
            Sign up with Apple
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
    document.getElementById('am-github-btn')?.addEventListener('click', _handleGitHubSignIn);
    document.getElementById('am-github-btn-su')?.addEventListener('click', _handleGitHubSignIn);
    document.getElementById('am-x-btn')?.addEventListener('click', _handleXSignIn);
    document.getElementById('am-x-btn-su')?.addEventListener('click', _handleXSignIn);
    document.getElementById('am-apple-btn')?.addEventListener('click', _handleAppleSignIn);
    document.getElementById('am-apple-btn-su')?.addEventListener('click', _handleAppleSignIn);
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

  async function _handleAppleSignIn() {
    try {
      const c = SB.client;
      if (!c) throw new Error('Service unavailable');
      const { error } = await c.auth.signInWithOAuth({
        provider: 'apple',
        options: { redirectTo: location.origin + '/app/#/' },
      });
      if (error) throw error;
      close();
    } catch (err) {
      const errEl = document.getElementById('am-si-error') || document.getElementById('am-su-error');
      if (errEl) errEl.textContent = err.message || 'Apple sign-in failed';
    }
  }

  async function _handleXSignIn() {
    try {
      const c = SB.client;
      if (!c) throw new Error('Service unavailable');
      const { error } = await c.auth.signInWithOAuth({
        provider: 'twitter',
        options: { redirectTo: location.origin + '/app/#/' },
      });
      if (error) throw error;
      close();
    } catch (err) {
      const errEl = document.getElementById('am-si-error') || document.getElementById('am-su-error');
      if (errEl) errEl.textContent = err.message || 'X sign-in failed';
    }
  }

  async function _handleGitHubSignIn() {
    try {
      const c = SB.client;
      if (!c) throw new Error('Service unavailable');
      const { error } = await c.auth.signInWithOAuth({
        provider: 'github',
        options: { redirectTo: location.origin + '/app/#/' },
      });
      if (error) throw error;
      close();
    } catch (err) {
      const errEl = document.getElementById('am-si-error') || document.getElementById('am-su-error');
      if (errEl) errEl.textContent = err.message || 'GitHub sign-in failed';
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
