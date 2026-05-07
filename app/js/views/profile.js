/* ═══════════════════════════════════════════════════════════════════
   NICE — Profile View
   Auth (login/signup), account info, sign out.
═══════════════════════════════════════════════════════════════════ */

const ProfileView = (() => {
  const title = 'Profile';

  function render(el) {
    const user = State.get('user');
    if (!user) {
      _renderAuth(el);
    } else {
      _renderProfile(el, user);
    }

    // Re-render when auth state changes
    State.onScoped('user', u => {
      if (el.isConnected) {
        if (!u) _renderAuth(el);
        else _renderProfile(el, u);
      }
    });
  }

  function _renderAuth(el) {
    el.innerHTML = `
      <div class="auth-wrap">
        <div class="auth-card">
          <div class="auth-logo">
            <svg class="auth-logo-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 5000 5000" fill="currentColor" aria-hidden="true">
              <path d="M2463.17,3633.17c348.87-33.89,529.56,395.76,262.71,618.71-179.73,150.16-459.24,78.58-546.6-137.16-85.98-212.33,54.43-459.26,283.89-481.55Z"/>
              <path d="M3763.2,2905.2c246.91-17.2,431.6,227.75,353.89,461.89-87.4,263.37-443.86,323.54-610.74,100.57-168.07-224.56-21.82-543.04,256.85-562.46Z"/>
              <path d="M2467.2,673.2c345.58-32.47,524.02,397,258.68,618.68-180.13,150.49-459.08,78.97-546.6-137.16-87.17-215.28,55.93-459.73,287.92-481.52Z"/>
              <path d="M1203.18,2905.19c275.09-15.44,457.71,280.84,322.9,522.88-119.67,214.87-425.07,238.14-577.97,45.82-177.41-223.16-28.22-552.8,255.07-568.7Z"/>
              <path d="M3537.4,2014.6c-177.73-177.72-114.08-485.01,120.51-574.69,274.93-105.11,544.87,148.19,461.85,429.85-73.68,249.96-398.06,329.14-582.35,144.85Z"/>
              <path d="M1187.2,1409.2c279.69-26.25,476.07,269.48,341.49,517.49-117.32,216.2-419.09,243.76-576.57,55.2-178.93-214.25-41.59-546.72,235.08-572.68Z"/>
              <path d="M2447.2,1853.2c550.99-42.77,908.61,573.22,585.69,1025.69-276.72,387.72-866.37,355.58-1097.57-60.2-228.12-410.24,44.43-929.2,511.88-965.49ZM2455.2,1953.2c-427.55,33.48-653.11,541.85-388.78,882.39,257.89,332.24,777.21,269.58,942.28-116.89,164.38-384.87-139.97-797.88-553.5-765.5Z"/>
              <path d="M1272,2204v604c-33.72-4.09-66.28-4.09-100,0v-604c31.79,6.4,68.34,6.38,100,0Z"/>
              <path d="M3836,2808c-34.42-3.47-65.53-5.37-100,0v-596c2.93-1.06,4.78,4,6,4h84c1.4,0,4.44-7.1,10,2v590Z"/>
              <polygon points="3375.95 1580 2868.23 1291.66 2912.04 1203.99 3418.07 1491.98 3423.59 1497.98 3375.95 1580"/>
              <polygon points="2139.99 1291.94 1637.96 1579.88 1588.37 1497.36 2086.75 1204.5 2095.49 1210.49 2139.99 1291.94"/>
              <path d="M2139.98,3712.08c2.15,3.03-33.45,55.51-38.18,63.72-4.14,7.19-5.9,25.29-15.33,23.83l-494.1-289.2,43.94-82.16,11.78,1.54,491.88,282.27Z"/>
              <path d="M3366,3424.08l45.38,82.85-3.37,11.08-492.12,280.28c-7.13-25.22-36.8-54.55-44.83-75.52-1.4-3.67-4.89-6.66-1.38-10.87l496.32-287.83Z"/>
              <path d="M2483.19,2101.18c280.93-16.74,488.07,258.72,401.96,525.96-85.83,266.35-424.89,363.36-639.04,180.75-276.2-235.52-124.03-685.19,237.08-706.71Z"/>
            </svg>
          </div>
          <h2 class="auth-title">Sign in to NICE</h2>
          <p class="auth-sub">Neural Intelligence Command Engine</p>

          <div class="auth-tabs">
            <button class="auth-tab active" data-tab="signin" onclick="ProfileView._switchTab('signin')">Sign In</button>
            <button class="auth-tab" data-tab="signup" onclick="ProfileView._switchTab('signup')">Sign Up</button>
          </div>

          <!-- Sign In Form -->
          <form class="auth-form" id="form-signin" onsubmit="ProfileView._handleSignIn(event)">
            <div class="auth-field">
              <label for="si-email">Email</label>
              <input type="email" id="si-email" required autocomplete="email" placeholder="pilot@nicespaceship.com" />
            </div>
            <div class="auth-field">
              <label for="si-pass">Password</label>
              <input type="password" id="si-pass" required autocomplete="current-password" placeholder="Enter password" />
            </div>
            <label class="auth-remember">
              <input type="checkbox" id="si-remember" checked />
              <span>Keep me signed in</span>
            </label>
            <div class="auth-error" id="si-error"></div>
            <button type="submit" class="auth-submit" id="si-btn">Sign In</button>
            <div class="auth-divider"><span>or</span></div>
            <button type="button" class="auth-google-btn" onclick="ProfileView._handleOAuth('google')">
              <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#4285F4" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#34A853" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#EA4335" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
              Continue with Google
            </button>
            <button type="button" class="auth-microsoft-btn" onclick="ProfileView._handleOAuth('azure')">
              <svg width="18" height="18" viewBox="0 0 24 24"><rect fill="#F25022" x="2" y="2" width="9.5" height="9.5"/><rect fill="#7FBA00" x="12.5" y="2" width="9.5" height="9.5"/><rect fill="#00A4EF" x="2" y="12.5" width="9.5" height="9.5"/><rect fill="#FFB900" x="12.5" y="12.5" width="9.5" height="9.5"/></svg>
              Continue with Microsoft
            </button>
            <button type="button" class="auth-github-btn" onclick="ProfileView._handleOAuth('github')">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
              Continue with GitHub
            </button>
          </form>

          <!-- Sign Up Form -->
          <form class="auth-form" id="form-signup" style="display:none" onsubmit="ProfileView._handleSignUp(event)">
            <div class="auth-field">
              <label for="su-name">Display Name</label>
              <input type="text" id="su-name" required placeholder="Pilot_007" />
            </div>
            <div class="auth-field">
              <label for="su-email">Email</label>
              <input type="email" id="su-email" required autocomplete="email" placeholder="pilot@nicespaceship.com" />
            </div>
            <div class="auth-field">
              <label for="su-pass">Password</label>
              <input type="password" id="su-pass" required minlength="6" autocomplete="new-password" placeholder="Min 6 characters" />
            </div>
            <div class="auth-error" id="su-error"></div>
            <button type="submit" class="auth-submit" id="su-btn">Create Account</button>
            <div class="auth-divider"><span>or</span></div>
            <button type="button" class="auth-google-btn" onclick="ProfileView._handleOAuth('google')">
              <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#4285F4" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#34A853" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#EA4335" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
              Continue with Google
            </button>
            <button type="button" class="auth-microsoft-btn" onclick="ProfileView._handleOAuth('azure')">
              <svg width="18" height="18" viewBox="0 0 24 24"><rect fill="#F25022" x="2" y="2" width="9.5" height="9.5"/><rect fill="#7FBA00" x="12.5" y="2" width="9.5" height="9.5"/><rect fill="#00A4EF" x="2" y="12.5" width="9.5" height="9.5"/><rect fill="#FFB900" x="12.5" y="12.5" width="9.5" height="9.5"/></svg>
              Continue with Microsoft
            </button>
            <button type="button" class="auth-github-btn" onclick="ProfileView._handleOAuth('github')">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
              Continue with GitHub
            </button>
          </form>

          <div class="auth-footer">
            <span>TRANSMISSION ENCRYPTED &mdash; TLS 1.3</span>
          </div>
        </div>
      </div>
    `;
  }

  function _renderProfile(el, user) {
    const meta = user.user_metadata || {};
    const name = meta.display_name || user.email?.split('@')[0] || 'Pilot';
    const initials = name.slice(0, 2).toUpperCase();
    const avatarUrl = meta.avatar_url || localStorage.getItem(Utils.KEYS.avatarUrl) || '';

    el.innerHTML = `
      <div class="profile-wrap">
        <div class="profile-card">
          <div class="profile-avatar-wrap" id="profile-avatar-wrap" title="Click to change photo">
            ${avatarUrl
              ? `<img class="profile-avatar-img" src="${_esc(avatarUrl)}" alt="${_esc(name)}" />`
              : `<div class="profile-avatar">${_esc(initials)}</div>`
            }
            <div class="profile-avatar-overlay">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"/><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"/></svg>
            </div>
            <input type="file" id="profile-avatar-input" accept="image/*" style="display:none" />
          </div>
          <h2 class="profile-name">${_esc(name)}</h2>
          <p class="profile-email">${_esc(user.email || '')}</p>
          <div class="profile-badge">PILOT</div>
        </div>

        <div class="profile-section">
          <h3 class="profile-section-title">Account</h3>
          <div class="profile-row">
            <span class="profile-row-label">Plan</span>
            <span class="profile-row-val">${typeof Subscription !== 'undefined' ? Subscription.getPlanTier(Subscription.getCurrentPlan()).label : 'Free'}</span>
          </div>
          <div class="profile-row">
            <span class="profile-row-label">Member Since</span>
            <span class="profile-row-val">${new Date(user.created_at).toLocaleDateString()}</span>
          </div>
          <div class="profile-row">
            <span class="profile-row-label">User ID</span>
            <span class="profile-row-val mono">${user.id.slice(0, 8)}...</span>
          </div>
        </div>

        <div class="profile-section">
          <h3 class="profile-section-title">Rank &amp; Resources</h3>
          <div id="profile-rank">
            ${typeof Gamification !== 'undefined' ? Gamification.renderRankBadge(false) : ''}
          </div>
          <div id="profile-resources" style="margin-top:12px">
            ${typeof Gamification !== 'undefined' && Gamification.renderResourceBar ? Gamification.renderResourceBar() : ''}
          </div>
        </div>

        <div class="profile-section">
          <h3 class="profile-section-title">Weekly Summary</h3>
          <div id="profile-weekly-summary" class="home-weekly-summary"></div>
        </div>

        <div class="profile-section">
          <h3 class="profile-section-title">Achievements</h3>
          <div class="ach-gallery">
            ${typeof Gamification !== 'undefined' ? Gamification.renderAchievementGallery() : ''}
          </div>
        </div>

        <div class="profile-section">
          <h3 class="profile-section-title">Voice Sample</h3>
          <p class="voice-sample-sub">
            Paste 2&ndash;3 paragraphs of your own writing — a recent email,
            a post, a Slack message you're proud of. The Inbox Captain's
            Drafter reads this and mirrors your tone, phrasing, and length
            patterns when it writes replies in your voice.
          </p>
          <textarea
            id="profile-voice-sample"
            class="voice-sample-input"
            rows="6"
            maxlength="4000"
            placeholder="e.g. Quick one — Thursday works on my end. I'll bring the updated deck. Ping Sarah if you want her on it."
          >${_esc(_readVoiceSample())}</textarea>
          <div class="voice-sample-actions">
            <span class="voice-sample-status" id="profile-voice-status" aria-live="polite"></span>
            <button type="button" class="profile-action-btn voice-sample-save" id="btn-voice-save" style="width:auto">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-check"/></svg>
              Save voice sample
            </button>
          </div>
        </div>

        <div class="profile-section">
          <h3 class="profile-section-title">Referral Program</h3>
          <p style="font-size:.82rem;color:var(--text-muted);margin-bottom:12px;">Invite a friend — you both earn 500 XP when they sign up.</p>
          <div class="profile-row">
            <span class="profile-row-label">Referral Code</span>
            <span class="profile-row-val mono" style="color:var(--accent);letter-spacing:.1em;">${user.id.slice(0, 8).toUpperCase()}</span>
          </div>
          <div class="profile-row">
            <span class="profile-row-label">Referrals</span>
            <span class="profile-row-val" id="profile-referral-count">Loading...</span>
          </div>
          <button class="profile-action-btn" id="btn-copy-referral" style="margin-top:8px;">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-share"/></svg>
            Copy Referral Link
          </button>
        </div>

        <div class="profile-section">
          <h3 class="profile-section-title">Actions</h3>
          <a href="#/" class="profile-action-btn" style="text-decoration:none;">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-dashboard"/></svg>
            Mission Dashboard
          </a>
          <button class="profile-action-btn" onclick="ProfileView._signOut()">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-logout"/></svg>
            Sign Out
          </button>
        </div>
      </div>
    `;

    // Load referral count
    _loadReferralData(user);

    // Load weekly summary
    _loadProfileWeekly();

    // Avatar upload
    const avatarWrap = document.getElementById('profile-avatar-wrap');
    const avatarInput = document.getElementById('profile-avatar-input');
    if (avatarWrap && avatarInput) {
      avatarWrap.addEventListener('click', () => avatarInput.click());
      avatarInput.addEventListener('change', (e) => _handleAvatarUpload(e, user));
    }

    // Voice sample save — persists to localStorage via Utils.KEYS.
    // Drafter reads this on its next run via WorkflowEngine's
    // persona_dispatch path. Status line gives the user confirmation
    // the write succeeded; clears itself after 4s.
    document.getElementById('btn-voice-save')?.addEventListener('click', () => {
      const ta = document.getElementById('profile-voice-sample');
      const statusEl = document.getElementById('profile-voice-status');
      if (!ta || !statusEl) return;
      const value = ta.value || '';
      const ok = _saveVoiceSample(value);
      if (!ok) {
        statusEl.textContent = 'Could not save — storage unavailable.';
        statusEl.className = 'voice-sample-status voice-sample-status-err';
        return;
      }
      const clean = value.trim();
      statusEl.textContent = clean
        ? `Saved (${clean.length} char${clean.length === 1 ? '' : 's'}). Drafter will use this on the next run.`
        : 'Cleared. Drafter will run without a voice reference.';
      statusEl.className = 'voice-sample-status voice-sample-status-ok';
      if (typeof Notify !== 'undefined') {
        Notify.send({ title: 'Voice sample saved', message: 'Your Drafter now knows how to write in your voice.', type: 'success' });
      }
      setTimeout(() => {
        if (statusEl && statusEl.textContent.startsWith('Saved')) statusEl.textContent = '';
      }, 4000);
    });

    // Copy referral link button
    document.getElementById('btn-copy-referral')?.addEventListener('click', () => {
      const link = 'https://nicespaceship.ai/#/?ref=' + user.id.slice(0, 8);
      navigator.clipboard.writeText(link).then(() => {
        const btn = document.getElementById('btn-copy-referral');
        if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.innerHTML = '<svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-share"/></svg> Copy Referral Link'; }, 2000); }
      }).catch(() => {});
    });
  }

  async function _loadReferralData(user) {
    const countEl = document.getElementById('profile-referral-count');
    if (!countEl) return;

    try {
      if (typeof SB !== 'undefined' && SB.isReady()) {
        const referrals = await SB.db('referrals').list({ referrer_id: user.id });
        if (Array.isArray(referrals)) {
          countEl.textContent = referrals.length + ' referral' + (referrals.length !== 1 ? 's' : '');
          return;
        }
      }
    } catch (err) {
      console.warn('[Profile] Failed to load referrals:', err.message);
    }

    countEl.textContent = '0 referrals';
  }

  function _switchTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.getElementById('form-signin').style.display = tab === 'signin' ? '' : 'none';
    document.getElementById('form-signup').style.display = tab === 'signup' ? '' : 'none';
  }

  async function _handleSignIn(e) {
    e.preventDefault();
    const email = document.getElementById('si-email').value;
    const pass  = document.getElementById('si-pass').value;
    const errEl = document.getElementById('si-error');
    const btn   = document.getElementById('si-btn');
    const remember = document.getElementById('si-remember')?.checked !== false;

    errEl.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Signing in...';

    try {
      await SB.auth.signIn(email, pass);
      // Ephemeral session flag: unchecked → nice.js signs out on next browser launch.
      if (!remember) {
        localStorage.setItem(Utils.KEYS.ephemeralSession, '1');
        sessionStorage.setItem(Utils.KEYS.ephemeralSession, '1');
      } else {
        localStorage.removeItem(Utils.KEYS.ephemeralSession);
        sessionStorage.removeItem(Utils.KEYS.ephemeralSession);
      }
      const hq = Router.hashQuery();
      Router.navigate(hq.redirect ? '#' + hq.redirect : '#/');
    } catch (err) {
      errEl.textContent = err.message || 'Sign in failed';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  }

  async function _handleSignUp(e) {
    e.preventDefault();
    const name  = document.getElementById('su-name').value;
    const email = document.getElementById('su-email').value;
    const pass  = document.getElementById('su-pass').value;
    const errEl = document.getElementById('su-error');
    const btn   = document.getElementById('su-btn');

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

  async function _handleOAuth(provider) {
    const errEl = document.getElementById('si-error') || document.getElementById('su-error');
    try {
      const c = SB.client;
      if (!c) throw new Error('Service unavailable');
      const opts = { redirectTo: location.origin + '/app/#/' };
      if (provider === 'google') {
        opts.scopes = 'email profile https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive.file';
        opts.queryParams = { access_type: 'offline', prompt: 'consent' };
      }
      const { error } = await c.auth.signInWithOAuth({ provider, options: opts });
      if (error) throw error;
    } catch (err) {
      if (errEl) errEl.textContent = err.message || 'Sign in failed';
    }
  }

  async function _signOut() {
    try {
      await SB.auth.signOut();
      State.set('user', null);
      Router.navigate('#/profile');
    } catch (err) {
      console.error('Sign out error:', err);
    }
  }


  function _loadProfileWeekly() {
    const el = document.getElementById('profile-weekly-summary');
    if (!el) return;
    try {
      const xp = typeof Gamification !== 'undefined' ? Gamification.getXP?.() || 0 : 0;
      const missions = (State.get('missions') || []);
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const thisWeek = missions.filter(m => new Date(m.created_at) > weekAgo);
      const completed = thisWeek.filter(m => m.status === 'completed').length;
      const running = thisWeek.filter(m => m.status === 'running').length;

      el.innerHTML = `
        <div class="profile-row"><span class="profile-row-label">Missions This Week</span><span class="profile-row-val">${thisWeek.length}</span></div>
        <div class="profile-row"><span class="profile-row-label">Completed</span><span class="profile-row-val">${completed}</span></div>
        <div class="profile-row"><span class="profile-row-label">Running</span><span class="profile-row-val">${running}</span></div>
        <div class="profile-row"><span class="profile-row-label">Total XP</span><span class="profile-row-val">${xp}</span></div>
      `;
    } catch (e) {
      el.innerHTML = '<p class="text-muted" style="font-size:.82rem">Summary unavailable.</p>';
    }
  }

  const _esc = Utils.esc;

  /* ── Voice sample (localStorage SSOT via Utils.KEYS.voiceSample) ──
     Read by WorkflowEngine._executePersonaDispatch when a node has
     personaHint='user_voice'. Lives in localStorage rather than the
     profiles table for now so agents run offline-first and don't need a
     migration round-trip. A Supabase-backed mirror comes with the
     Settings sync work when multi-device is a priority. */
  function _readVoiceSample() {
    try { return localStorage.getItem(Utils.KEYS.voiceSample) || ''; }
    catch { return ''; }
  }

  function _saveVoiceSample(value) {
    try {
      const clean = (value || '').trim();
      if (clean) localStorage.setItem(Utils.KEYS.voiceSample, clean);
      else localStorage.removeItem(Utils.KEYS.voiceSample);
      return true;
    } catch { return false; }
  }

  /* ── Avatar upload ── */
  async function _handleAvatarUpload(e, user) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate
    if (!file.type.startsWith('image/')) {
      if (typeof Notify !== 'undefined') Notify.show('Please select an image file', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      if (typeof Notify !== 'undefined') Notify.show('Image must be under 2MB', 'error');
      return;
    }

    // Convert to base64 data URL for local storage
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;

      // Resize to 128x128 for performance
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        // Center crop
        const size = Math.min(img.width, img.height);
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        ctx.drawImage(img, sx, sy, size, size, 0, 0, 128, 128);
        const resized = canvas.toDataURL('image/jpeg', 0.85);

        // Save locally
        localStorage.setItem(Utils.KEYS.avatarUrl, resized);

        // Try to update Supabase user metadata
        if (typeof SB !== 'undefined' && SB.client) {
          try {
            await SB.client.auth.updateUser({ data: { avatar_url: resized } });
          } catch (err) {
            console.warn('[Profile] Failed to save avatar to Supabase:', err);
          }
        }

        // Update profile avatar
        const wrap = document.getElementById('profile-avatar-wrap');
        if (wrap) {
          const existing = wrap.querySelector('.profile-avatar, .profile-avatar-img');
          if (existing) {
            const newImg = document.createElement('img');
            newImg.className = 'profile-avatar-img';
            newImg.src = resized;
            newImg.alt = 'Avatar';
            existing.replaceWith(newImg);
          }
        }

        // Update sidebar avatar
        _updateSidebarAvatar(resized);

        if (typeof Notify !== 'undefined') Notify.show('Photo updated', 'success');
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  function _updateSidebarAvatar(url) {
    const userCard = document.getElementById('hdr-user');
    if (!userCard) return;
    const iconEl = userCard.querySelector('.icon');
    if (iconEl && url) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = 'Avatar';
      img.style.cssText = 'width:18px;height:18px;border-radius:50%;object-fit:cover;';
      iconEl.replaceWith(img);
    }
  }

  // On load, update sidebar if avatar exists
  function _initAvatar() {
    const url = localStorage.getItem(Utils.KEYS.avatarUrl);
    if (url) _updateSidebarAvatar(url);
  }
  // Run on module load
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _initAvatar);
    else setTimeout(_initAvatar, 100);
  }

  return {
    title, render, _switchTab, _handleSignIn, _handleSignUp, _handleOAuth, _signOut,
    // Voice sample — exposed for unit testing + Composer debug read-back.
    _readVoiceSample, _saveVoiceSample,
  };
})();
