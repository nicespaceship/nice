/* ═══════════════════════════════════════════════════════════════════
   NICE — Theme Editor
   Custom color/typography editor with shareable settings codes.
   Settings codes ≠ Themes. Codes = colors + fonts. Themes = full
   experience packages (layout, effects, animations, purchasable).
═══════════════════════════════════════════════════════════════════ */

const ThemeCreatorView = (() => {
  const title = 'Theme Editor';
  const STORAGE_KEY = 'nice-custom-themes';

  const CSS_VARS = [
    { key: '--bg',        label: 'Background',       default: '#080808' },
    { key: '--bg2',       label: 'Background Alt',    default: '#101010' },
    { key: '--surface',   label: 'Surface',           default: '#161616' },
    { key: '--surface2',  label: 'Surface Alt',       default: '#1e1e1e' },
    { key: '--border',    label: 'Border',            default: '#2a2a2a' },
    { key: '--border-hi', label: 'Border Highlight',  default: '#555555' },
    { key: '--accent',    label: 'Accent',            default: '#ffffff' },
    { key: '--accent2',   label: 'Accent 2',          default: '#888888' },
    { key: '--text',      label: 'Text',              default: '#f0f0f0' },
    { key: '--text-muted',label: 'Text Muted',        default: '#666666' },
    { key: '--glow',      label: 'Glow',              default: '#000000' },
    { key: '--panel-bg',  label: 'Panel BG',          default: '#111111' },
  ];

  const FONT_OPTIONS = [
    // System & bundled
    { value: 'Inter, sans-serif',               label: 'Inter (Clean)',         group: 'Bundled' },
    { value: 'Orbitron, sans-serif',             label: 'Orbitron (Space)',      group: 'Bundled' },
    { value: 'Rajdhani, sans-serif',             label: 'Rajdhani (HUD)',        group: 'Bundled' },
    { value: 'Fira Code, monospace',             label: 'Fira Code (Mono)',      group: 'Bundled' },
    { value: 'Share Tech Mono, monospace',       label: 'Share Tech Mono',       group: 'Bundled' },
    { value: 'Press Start 2P, monospace',        label: 'Press Start 2P (Pixel)',group: 'Bundled' },
    { value: 'Playfair Display, serif',          label: 'Playfair Display',      group: 'Bundled' },
    { value: 'system-ui, sans-serif',            label: 'System Default',        group: 'Bundled' },
    // Google Fonts — Sans-Serif
    { value: 'Roboto, sans-serif',               label: 'Roboto',               group: 'Google Sans' },
    { value: 'Open Sans, sans-serif',            label: 'Open Sans',            group: 'Google Sans' },
    { value: 'Lato, sans-serif',                 label: 'Lato',                 group: 'Google Sans' },
    { value: 'Montserrat, sans-serif',           label: 'Montserrat',           group: 'Google Sans' },
    { value: 'Poppins, sans-serif',              label: 'Poppins',              group: 'Google Sans' },
    { value: 'Nunito, sans-serif',               label: 'Nunito',               group: 'Google Sans' },
    { value: 'Raleway, sans-serif',              label: 'Raleway',              group: 'Google Sans' },
    { value: 'Work Sans, sans-serif',            label: 'Work Sans',            group: 'Google Sans' },
    { value: 'DM Sans, sans-serif',              label: 'DM Sans',              group: 'Google Sans' },
    { value: 'Space Grotesk, sans-serif',        label: 'Space Grotesk',        group: 'Google Sans' },
    { value: 'Outfit, sans-serif',               label: 'Outfit',               group: 'Google Sans' },
    { value: 'Exo 2, sans-serif',                label: 'Exo 2',                group: 'Google Sans' },
    { value: 'Kanit, sans-serif',                label: 'Kanit',                group: 'Google Sans' },
    { value: 'Barlow, sans-serif',               label: 'Barlow',               group: 'Google Sans' },
    { value: 'Quicksand, sans-serif',            label: 'Quicksand',            group: 'Google Sans' },
    // Google Fonts — Serif
    { value: 'Merriweather, serif',              label: 'Merriweather',         group: 'Google Serif' },
    { value: 'Lora, serif',                      label: 'Lora',                 group: 'Google Serif' },
    { value: 'Crimson Text, serif',              label: 'Crimson Text',         group: 'Google Serif' },
    { value: 'EB Garamond, serif',               label: 'EB Garamond',          group: 'Google Serif' },
    { value: 'Libre Baskerville, serif',         label: 'Libre Baskerville',    group: 'Google Serif' },
    // Google Fonts — Monospace
    { value: 'JetBrains Mono, monospace',        label: 'JetBrains Mono',       group: 'Google Mono' },
    { value: 'Source Code Pro, monospace',        label: 'Source Code Pro',       group: 'Google Mono' },
    { value: 'IBM Plex Mono, monospace',          label: 'IBM Plex Mono',        group: 'Google Mono' },
    { value: 'Space Mono, monospace',             label: 'Space Mono',           group: 'Google Mono' },
    // Google Fonts — Display
    { value: 'Bebas Neue, sans-serif',            label: 'Bebas Neue',           group: 'Google Display' },
    { value: 'Oswald, sans-serif',                label: 'Oswald',               group: 'Google Display' },
    { value: 'Archivo Black, sans-serif',         label: 'Archivo Black',        group: 'Google Display' },
    { value: 'Righteous, cursive',                label: 'Righteous',            group: 'Google Display' },
    { value: 'Russo One, sans-serif',             label: 'Russo One',            group: 'Google Display' },
    { value: 'Bungee, cursive',                   label: 'Bungee',               group: 'Google Display' },
  ];

  // Set of loaded Google Font families (avoid duplicate <link> tags)
  const _loadedFonts = new Set();

  const LIVE_KEY = 'nice-gui-settings';
  let _liveValues = {};
  let _selectedTheme = null;

  /* ── Google Fonts loader ─────────────────────────────────────── */
  function _loadGoogleFont(fontValue) {
    const family = fontValue.split(',')[0].trim();
    if (_loadedFonts.has(family)) return;
    // Skip system/bundled fonts (already in theme.css)
    const bundled = ['Inter','Orbitron','Rajdhani','Fira Code','Share Tech Mono','Press Start 2P','Playfair Display','system-ui'];
    if (bundled.includes(family)) return;
    _loadedFonts.add(family);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;600;700&display=swap`;
    document.head.appendChild(link);
  }

  /* ── Settings Code (serial) ──────────────────────────────────── */
  // Encodes current colors + typography into a compact shareable string.
  // Format: base64 of JSON { c: [12 hex colors], h: fontIndex, b: fontIndex, r: radius }
  // This is NOT a theme — just a lightweight appearance preset.

  function _generateCode() {
    const colors = CSS_VARS.map(v => (_liveValues[v.key] || v.default).replace('#', ''));
    const hIdx = FONT_OPTIONS.findIndex(f => f.value === _liveValues['--font-h']) || 0;
    const bIdx = FONT_OPTIONS.findIndex(f => f.value === _liveValues['--font-b']) || 0;
    const radius = parseInt(_liveValues['--radius']) || 0;
    const promptRadius = parseInt(_liveValues['--prompt-radius']) || 0;
    const payload = colors.join('') + '|' + hIdx.toString(36) + '|' + bIdx.toString(36) + '|' + radius.toString(36) + '|' + promptRadius.toString(36);
    // Base64 and make URL-safe, trim padding
    return btoa(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function _applyCode(code) {
    try {
      // Restore base64 padding
      const padded = code.replace(/-/g, '+').replace(/_/g, '/');
      const payload = atob(padded);
      const parts = payload.split('|');
      if (parts.length < 4) throw new Error('Invalid code');

      const hexStr = parts[0];
      if (hexStr.length !== 72) throw new Error('Invalid color data'); // 12 colors × 6 chars
      const hIdx = parseInt(parts[1], 36);
      const bIdx = parseInt(parts[2], 36);
      const radius = parseInt(parts[3], 36);

      // Apply colors
      CSS_VARS.forEach((v, i) => {
        const hex = '#' + hexStr.slice(i * 6, i * 6 + 6);
        _setVar(v.key, hex);
      });

      // Apply fonts
      if (FONT_OPTIONS[hIdx]) {
        _loadGoogleFont(FONT_OPTIONS[hIdx].value);
        _setVar('--font-h', FONT_OPTIONS[hIdx].value);
        _setVar('--font-d', FONT_OPTIONS[hIdx].value);
      }
      if (FONT_OPTIONS[bIdx]) {
        _loadGoogleFont(FONT_OPTIONS[bIdx].value);
        _setVar('--font-b', FONT_OPTIONS[bIdx].value);
      }

      // Apply radius
      _setVar('--radius', radius + 'px');

      // Apply prompt radius (optional field for backwards compat)
      const promptRadius = parts[4] !== undefined ? parseInt(parts[4], 36) : 0;
      _setVar('--prompt-radius', promptRadius + 'px');

      return true;
    } catch (e) {
      return false;
    }
  }

  /* ── Font select HTML with optgroups ─────────────────────────── */
  function _fontSelectHTML(id, selectedValue) {
    const groups = {};
    FONT_OPTIONS.forEach(f => {
      const g = f.group || 'Other';
      if (!groups[g]) groups[g] = [];
      groups[g].push(f);
    });
    let html = `<select class="tc-select" id="${id}">`;
    for (const [group, fonts] of Object.entries(groups)) {
      html += `<optgroup label="${_esc(group)}">`;
      fonts.forEach(f => {
        html += `<option value="${_esc(f.value)}" ${selectedValue === f.value ? 'selected' : ''}>${_esc(f.label)}</option>`;
      });
      html += '</optgroup>';
    }
    html += '</select>';
    return html;
  }

  /* ── Render ──────────────────────────────────────────────────── */
  function render(el) {
    _loadCurrentVars();

    el.innerHTML = `
      <div class="tc-wrap">
        <div class="tc-header">
          <div>
            <h1 class="tc-title">Theme Editor</h1>
            <p class="tc-sub">Design your own custom theme with live preview.</p>
          </div>
        </div>

        <!-- HUD Dock Selection -->
        <div class="tc-section">
          <h2 class="tc-panel-title">HUD Dock Themes <span id="tc-dock-count" style="font-size:.6em;color:var(--text-muted);font-weight:400">${_getDockSelection().length}/11</span></h2>
          <p class="tc-sub" style="margin:0 0 10px">Select up to 11 themes for the HUD quick-switch dock.</p>
          <div class="tc-dock-grid" id="tc-dock-grid">
            ${_renderDockSelection()}
          </div>
        </div>

        <!-- Colors -->
        <div class="tc-section">
          <h2 class="tc-panel-title">Colors</h2>
          <div class="tc-grid tc-grid--colors">
            ${CSS_VARS.map(v => `
              <div class="tc-field">
                <label class="tc-label">${v.label}</label>
                <div class="tc-color-row">
                  <input type="color" class="tc-color" data-var="${v.key}" value="${_liveValues[v.key] || v.default}" />
                  <input type="text" class="tc-hex" data-var="${v.key}" value="${_liveValues[v.key] || v.default}" maxlength="7" />
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Typography & Effects -->
        <div class="tc-section">
          <h2 class="tc-panel-title">Typography & Effects</h2>
          <div class="tc-grid tc-grid--typo">
            <div class="tc-field">
              <label class="tc-label">Heading Font</label>
              ${_fontSelectHTML('tc-font-h', _liveValues['--font-h'])}
            </div>
            <div class="tc-field">
              <label class="tc-label">Body Font</label>
              ${_fontSelectHTML('tc-font-b', _liveValues['--font-b'])}
            </div>
            <div class="tc-field">
              <label class="tc-label">Border Radius</label>
              <div class="tc-range-row">
                <input type="range" class="tc-range" id="tc-radius" min="0" max="20" value="${parseInt(_liveValues['--radius']) || 0}" />
                <span class="tc-range-val" id="tc-radius-val">${parseInt(_liveValues['--radius']) || 0}px</span>
              </div>
            </div>
            <div class="tc-field">
              <label class="tc-label">Card Radius</label>
              <div class="tc-range-row">
                <input type="range" class="tc-range" id="tc-card-radius" min="0" max="20" value="${parseInt(_liveValues['--card-radius']) || 0}" />
                <span class="tc-range-val" id="tc-card-radius-val">${parseInt(_liveValues['--card-radius']) || 0}px</span>
              </div>
            </div>
            <div class="tc-field">
              <label class="tc-label">Prompt Bar Radius</label>
              <div class="tc-range-row">
                <input type="range" class="tc-range" id="tc-prompt-radius" min="0" max="24" value="${parseInt(_liveValues['--prompt-radius']) || 0}" />
                <span class="tc-range-val" id="tc-prompt-radius-val">${parseInt(_liveValues['--prompt-radius']) || 0}px</span>
              </div>
            </div>
            <div class="tc-field">
              <label class="tc-label">Button Radius</label>
              <div class="tc-range-row">
                <input type="range" class="tc-range" id="tc-btn-radius" min="0" max="20" value="${parseInt(_liveValues['--btn-radius']) || 0}" />
                <span class="tc-range-val" id="tc-btn-radius-val">${parseInt(_liveValues['--btn-radius']) || 0}px</span>
              </div>
            </div>
            <div class="tc-field">
              <label class="tc-label">Glow Effect</label>
              <div class="tc-range-row">
                <input type="range" class="tc-range" id="tc-glow-size" min="0" max="30" value="0" />
                <span class="tc-range-val" id="tc-glow-val">0px</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Settings Code -->
        <div class="tc-section">
          <h2 class="tc-panel-title">Settings Code</h2>
          <p class="tc-sub" style="margin:0 0 10px">Active code: <code class="mono" id="tc-active-code" style="user-select:all;cursor:pointer;font-size:11px;opacity:.7">${_generateCode()}</code></p>
          <div class="tc-code-row">
            <input type="text" class="tc-code-input" id="tc-code" placeholder="Paste a code or generate one..." spellcheck="false" />
            <button class="btn btn-xs btn-primary" id="tc-code-gen" title="Generate code from current settings">Generate</button>
            <button class="btn btn-xs" id="tc-code-apply" title="Apply pasted code">Apply</button>
          </div>
          <div class="tc-code-msg" id="tc-code-msg"></div>
        </div>

        <!-- Actions Bar -->
        <div class="tc-actions">
          <button class="btn btn-sm btn-primary" id="tc-save">Save Settings</button>
          <button class="btn btn-sm" id="tc-reset">Reset to Default</button>
        </div>

        <!-- Live Preview -->
        <div class="tc-preview">
          <h2 class="tc-panel-title">Live Preview</h2>
          <div class="tc-preview-box" id="tc-preview-box">
            <div class="tc-preview-card">
              <h3>Sample Card</h3>
              <p>This is preview text showing your custom theme colors and typography.</p>
              <div class="tc-preview-btns">
                <button class="btn btn-sm btn-primary">Primary</button>
                <button class="btn btn-sm">Secondary</button>
              </div>
              <div class="tc-preview-stats">
                <span class="tc-preview-accent">Accent Color</span>
                <span class="tc-preview-muted">Muted Text</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    _bindEvents(el);
    _bindDockSelection(el);
  }

  function _bindEvents(el) {
    // Color pickers
    el.querySelectorAll('.tc-color').forEach(input => {
      input.addEventListener('input', (e) => {
        const varName = e.target.dataset.var;
        const val = e.target.value;
        _setVar(varName, val);
        const hex = el.querySelector(`.tc-hex[data-var="${varName}"]`);
        if (hex) hex.value = val;
      });
    });

    // Hex inputs
    el.querySelectorAll('.tc-hex').forEach(input => {
      input.addEventListener('input', (e) => {
        const varName = e.target.dataset.var;
        let val = e.target.value;
        if (/^#[0-9a-fA-F]{6}$/.test(val)) {
          _setVar(varName, val);
          const color = el.querySelector(`.tc-color[data-var="${varName}"]`);
          if (color) color.value = val;
        }
      });
    });

    // Font selects — load Google Font on change
    document.getElementById('tc-font-h')?.addEventListener('change', (e) => {
      _loadGoogleFont(e.target.value);
      _setVar('--font-h', e.target.value);
      _setVar('--font-d', e.target.value);
    });
    document.getElementById('tc-font-b')?.addEventListener('change', (e) => {
      _loadGoogleFont(e.target.value);
      _setVar('--font-b', e.target.value);
    });

    // Radius slider
    document.getElementById('tc-radius')?.addEventListener('input', (e) => {
      const val = e.target.value + 'px';
      _setVar('--radius', val);
      document.getElementById('tc-radius-val').textContent = val;
    });

    // Card radius slider
    document.getElementById('tc-card-radius')?.addEventListener('input', (e) => {
      const val = e.target.value + 'px';
      _setVar('--card-radius', val);
      document.getElementById('tc-card-radius-val').textContent = val;
    });

    // Prompt bar radius slider
    document.getElementById('tc-prompt-radius')?.addEventListener('input', (e) => {
      const val = e.target.value + 'px';
      _setVar('--prompt-radius', val);
      document.getElementById('tc-prompt-radius-val').textContent = val;
    });

    // Button radius slider
    document.getElementById('tc-btn-radius')?.addEventListener('input', (e) => {
      const val = e.target.value + 'px';
      _setVar('--btn-radius', val);
      document.getElementById('tc-btn-radius-val').textContent = val;
    });

    // Glow slider
    document.getElementById('tc-glow-size')?.addEventListener('input', (e) => {
      const size = e.target.value;
      document.getElementById('tc-glow-val').textContent = size + 'px';
      if (parseInt(size) === 0) {
        _setVar('--glow', 'none');
        _setVar('--glow-hi', 'none');
      } else {
        const accentColor = _liveValues['--accent'] || '#ffffff';
        _setVar('--glow', `0 0 ${size}px ${accentColor}40`);
        _setVar('--glow-hi', `0 0 ${size * 2}px ${accentColor}60`);
      }
    });

    // Settings Code — Generate
    document.getElementById('tc-code-gen')?.addEventListener('click', () => {
      const code = _generateCode();
      const input = document.getElementById('tc-code');
      const msg = document.getElementById('tc-code-msg');
      if (input) input.value = code;
      navigator.clipboard.writeText(code).then(() => {
        if (msg) { msg.textContent = 'Code generated & copied to clipboard!'; msg.className = 'tc-code-msg tc-code-ok'; }
      }).catch(() => {
        if (msg) { msg.textContent = 'Code generated! Select and copy it.'; msg.className = 'tc-code-msg tc-code-ok'; }
      });
      if (input) { input.select(); input.focus(); }
    });

    // Settings Code — Apply
    document.getElementById('tc-code-apply')?.addEventListener('click', () => {
      const input = document.getElementById('tc-code');
      const msg = document.getElementById('tc-code-msg');
      if (!input?.value.trim()) {
        if (msg) { msg.textContent = 'Paste a settings code first.'; msg.className = 'tc-code-msg tc-code-err'; }
        return;
      }
      const ok = _applyCode(input.value.trim());
      if (ok) {
        if (msg) { msg.textContent = 'Settings applied!'; msg.className = 'tc-code-msg tc-code-ok'; }
        render(el.closest('#app-content') || el.closest('.settings-collapse-body') || el);
      } else {
        if (msg) { msg.textContent = 'Invalid code. Check and try again.'; msg.className = 'tc-code-msg tc-code-err'; }
      }
    });

    // Export CSS

    // Save Settings — persist current live values to localStorage
    document.getElementById('tc-save')?.addEventListener('click', () => {
      localStorage.setItem(LIVE_KEY, JSON.stringify(_liveValues));
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Settings Saved', message: 'Your GUI settings have been saved.', type: 'system' });
    });

    // Reset
    document.getElementById('tc-reset')?.addEventListener('click', () => {
      _clearInlineVars();
      _liveValues = {};
      _selectedTheme = null;
      Theme.init();
      render(el.closest('#app-content') || el.closest('.settings-collapse-body') || el);
    });


    // Load saved theme buttons
    el.querySelectorAll('.tc-load-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.name;
        _loadSavedTheme(name);
        render(el.closest('#app-content') || el.closest('.settings-collapse-body') || el);
      });
    });

    // Delete saved theme buttons
    el.querySelectorAll('.tc-del-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.name;
        if (!confirm(`Delete preset "${name}"?`)) return;
        _deleteSavedTheme(name);
        render(el.closest('#app-content') || el.closest('.settings-collapse-body') || el);
      });
    });
  }

  function _updateActiveCode() {
    const el = document.getElementById('tc-active-code');
    if (el) el.textContent = _generateCode();
  }

  function _setVar(key, value) {
    _liveValues[key] = value;
    document.documentElement.style.setProperty(key, value);
    _updateActiveCode();
  }

  function _clearInlineVars() {
    CSS_VARS.forEach(v => document.documentElement.style.removeProperty(v.key));
    ['--font-h', '--font-d', '--font-b', '--radius', '--card-radius', '--btn-radius', '--prompt-radius', '--glow', '--glow-hi'].forEach(
      k => document.documentElement.style.removeProperty(k)
    );
  }

  function _loadCurrentVars() {
    const style = getComputedStyle(document.documentElement);
    _liveValues = {};
    CSS_VARS.forEach(v => {
      let val = style.getPropertyValue(v.key).trim();
      if (val.startsWith('rgb')) val = _rgbToHex(val);
      if (val === 'none' || val === '') val = v.default;
      _liveValues[v.key] = val;
    });
    _liveValues['--font-h'] = style.getPropertyValue('--font-h').trim() || style.getPropertyValue('--font-d').trim();
    _liveValues['--font-b'] = style.getPropertyValue('--font-b').trim();
    _liveValues['--radius'] = style.getPropertyValue('--radius').trim();
    _liveValues['--card-radius'] = style.getPropertyValue('--card-radius').trim() || '0px';
    _liveValues['--btn-radius'] = style.getPropertyValue('--btn-radius').trim() || '0px';
    _liveValues['--prompt-radius'] = style.getPropertyValue('--prompt-radius').trim() || '0px';
  }

  function _rgbToHex(rgb) {
    const match = rgb.match(/\d+/g);
    if (!match || match.length < 3) return '#000000';
    return '#' + match.slice(0, 3).map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
  }

  /* ── Save / Load / Delete ── */

  function _getSavedThemes() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }

  function _saveTheme() {
    const name = prompt('Preset name:');
    if (!name || !name.trim()) return;
    const themes = _getSavedThemes();
    themes[name.trim()] = { ..._liveValues };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(themes));
    _selectedTheme = name.trim();
    Notify.send({ title: 'Preset Saved', message: `"${name.trim()}" saved to your collection.`, type: 'system' });
    const wrap = document.querySelector('.tc-wrap');
    if (wrap) render(wrap.parentElement);
  }

  function _loadSavedTheme(name) {
    const themes = _getSavedThemes();
    const theme = themes[name];
    if (!theme) return;
    _selectedTheme = name;
    _liveValues = { ...theme };
    Object.entries(theme).forEach(([key, val]) => {
      document.documentElement.style.setProperty(key, val);
    });
    // Load any Google Fonts referenced
    if (theme['--font-h']) _loadGoogleFont(theme['--font-h']);
    if (theme['--font-b']) _loadGoogleFont(theme['--font-b']);
  }

  function _deleteSavedTheme(name) {
    const themes = _getSavedThemes();
    delete themes[name];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(themes));
    if (_selectedTheme === name) _selectedTheme = null;
  }

  function _exportCSS() {
    const lines = ['/* Custom NICE Theme */'];
    lines.push('[data-theme="custom"] {');
    Object.entries(_liveValues).forEach(([key, val]) => {
      if (val) lines.push(`  ${key}: ${val};`);
    });
    lines.push('}');
    const css = lines.join('\n');
    navigator.clipboard.writeText(css).then(() => {
      Notify.send({ title: 'CSS Copied', message: 'Theme CSS copied to clipboard.', type: 'system' });
    }).catch(() => {
      prompt('Copy this CSS:', css);
    });
  }

  function destroy() {}

  const _esc = Utils.esc;

  /** Restore saved GUI settings on app init (called from nice.js) */
  function restoreSaved() {
    try {
      const saved = JSON.parse(localStorage.getItem(LIVE_KEY) || 'null');
      if (!saved) return;
      for (const [key, value] of Object.entries(saved)) {
        document.documentElement.style.setProperty(key, value);
      }
    } catch { /* ignore */ }
  }

  /* ── HUD Dock Selection ── */
  const DOCK_STORAGE_KEY = 'nice-hud-dock-themes';

  function _getDockSelection() {
    try {
      const saved = JSON.parse(localStorage.getItem(DOCK_STORAGE_KEY));
      if (Array.isArray(saved) && saved.length) return saved;
    } catch {}
    // Default 11
    return ['spaceship','robotech','navigator','solar','matrix','retro','lcars','pixel','cyberpunk','ocean','sunset'];
  }

  function _saveDockSelection(ids) {
    localStorage.setItem(DOCK_STORAGE_KEY, JSON.stringify(ids));
    // Re-render the HUD dock with only selected themes
    Theme.renderDock(ids);
  }

  function _renderDockSelection() {
    const selected = _getDockSelection();
    const sorted = [...Theme.THEMES].sort((a, b) => a.name.localeCompare(b.name));
    return sorted.map(t => {
      const accent = t.accent || (t.preview && t.preview[1]) || '#888';
      const checked = selected.includes(t.id) ? 'checked' : '';
      return `
        <label class="tc-dock-item" title="${t.name}">
          <input type="checkbox" class="tc-dock-check" data-theme-id="${t.id}" ${checked} />
          <span class="tc-dock-swatch" style="background:${accent}"></span>
          <span class="tc-dock-name">${t.name}</span>
        </label>`;
    }).join('');
  }

  function _bindDockSelection(el) {
    const MAX_DOCK = 11;
    el.querySelectorAll('.tc-dock-check').forEach(cb => {
      cb.addEventListener('change', () => {
        const checked = el.querySelectorAll('.tc-dock-check:checked');
        if (checked.length > MAX_DOCK) {
          cb.checked = false;
          return;
        }
        const ids = [];
        checked.forEach(c => ids.push(c.dataset.themeId));
        _saveDockSelection(ids);
        // Update counter
        const counter = el.querySelector('#tc-dock-count');
        if (counter) counter.textContent = `${ids.length}/${MAX_DOCK}`;
      });
    });
  }

  return { title, render, destroy, restoreSaved };
})();
