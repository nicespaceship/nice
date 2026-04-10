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
            <svg class="auth-logo-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1240.37 1240.21" fill="currentColor" aria-hidden="true">
              <path d="M962.08,762.91c-3.6,3.81-23,22.39-23.4,25.12s1.65,9.46,1.81,12.8c6.2,134.27-22.47,251.36-96.57,363.41-10.14,15.32-44.07,64.4-57.7,72.3-10.64,6.16-17.08,4.1-26.74-2.68l-205.91-206.08-2.61-1.47c-13.79,3.14-27.33,7.97-41.2,10.78-12.14,2.46-39.23,7.32-50.52,5.02-5.43-1.11-8.8-8.83-13.02-7.63-56.83,48.42-130.21,76.33-203.49,88.59-23.32,3.9-79.67,11.72-100.43,4.99-28.92-9.37-32.15-31.74-31.74-58.17,1.36-87.99,28.47-185.28,80.14-256.85,2.24-3.1,15.39-18.18,15.71-19.38.7-2.69-7.89-8.08-8.8-14.88-1.33-9.98,3.07-34.86,5.18-45.64,2.91-14.86,7.64-29.47,11.6-44.06L6.97,481.35c-6.58-10.16-9.77-14.46-3.86-25.92,4.89-9.48,28.96-27.24,38.49-34.51,113.03-86.2,243.65-127.64,386.44-121.64,5.01.21,23.34,2.94,26.44,1.52,117.49-117.68,260.78-215.29,420.81-265.18,95.99-29.93,217.05-45.19,316.54-29.13,13.03,2.1,32.43,2.67,37.16,16.84,5.97,17.89,9.64,56.02,10.55,75.45,12,255.12-107.2,483.74-277.46,664.12ZM842.3,261.63c-101.28,8.13-152.88,125.4-90.22,205.62,56.08,71.8,169.37,61.28,211.94-18.9,46.73-88.01-22.45-194.69-121.72-186.72ZM276.84,862.98c-1.02-.92-3.11-5.35-5.37-4.22-.87.43-8.43,11.31-9.79,13.25-32.97,47.21-49,105.67-56.19,162.31,1.77,1.77,42.17-6.13,48.04-7.46,31.2-7.03,64.74-18.77,92.63-34.37,4.52-2.53,34.5-21.3,35.27-23.8.34-1.12-.09-2.12-.89-2.92-35.52-32.96-67.86-70.35-103.71-102.79Z"/>
            </svg>
          </div>
          <h2 class="auth-title">Sign in to NICE</h2>
          <p class="auth-sub">NICE&trade; &mdash; Bridge</p>

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
            <div class="auth-error" id="si-error"></div>
            <button type="submit" class="auth-submit" id="si-btn">Sign In</button>
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

    errEl.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Signing in...';

    try {
      await SB.auth.signIn(email, pass);
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

  return { title, render, _switchTab, _handleSignIn, _handleSignUp, _signOut };
})();
