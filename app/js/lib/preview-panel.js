/* ═══════════════════════════════════════════════════════════════════
   NICE — Preview Panel
   Slide-out panel from right: live browser preview + agent output.
   Features: resize (mobile/tablet/desktop), refresh, console log,
   auto-open on agent output.
═══════════════════════════════════════════════════════════════════ */

const PreviewPanel = (() => {
  let _isOpen = false;
  let _activeTab = 'browser';
  let _viewport = 'desktop'; // desktop | tablet | mobile
  let _logs = [];

  const VIEWPORTS = {
    desktop:  { width: '100%', height: '100%', label: 'Desktop' },
    tablet:   { width: '768px', height: '100%', label: 'Tablet' },
    mobile:   { width: '375px', height: '100%', label: 'Mobile' },
  };

  function _getEls() {
    return {
      panel: document.getElementById('preview-panel'),
      iframe: document.getElementById('preview-iframe'),
      output: document.getElementById('preview-output'),
      console: document.getElementById('preview-console'),
      urlInput: document.getElementById('preview-url'),
      tabs: document.querySelectorAll('.preview-tab'),
      viewportBtns: document.querySelectorAll('.preview-viewport-btn'),
    };
  }

  /* ── Open / Close ── */
  function open(url) {
    const { panel } = _getEls();
    if (!panel) return;
    _isOpen = true;
    panel.classList.add('open');
    document.body.classList.add('preview-active');
    if (url) loadURL(url);
    AuditLog?.add?.('preview_open', { url: url || '' });
  }

  function close() {
    const { panel } = _getEls();
    if (!panel) return;
    _isOpen = false;
    panel.classList.remove('open');
    document.body.classList.remove('preview-active');
  }

  function toggle() { _isOpen ? close() : open(); }
  function isOpen() { return _isOpen; }

  /* ── Tabs ── */
  function setTab(tab) {
    const { iframe, output, console: consoleEl, tabs } = _getEls();
    if (!iframe || !output) return;
    _activeTab = tab;
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    iframe.parentElement.style.display = tab === 'browser' ? 'flex' : 'none';
    output.style.display = tab === 'output' ? 'block' : 'none';
    if (consoleEl) consoleEl.style.display = tab === 'console' ? 'flex' : 'none';
  }

  /* ── Browser ── */
  function loadURL(url) {
    const { iframe, urlInput } = _getEls();
    if (!iframe) return;
    if (url && !url.startsWith('http')) url = 'https://' + url;
    iframe.src = url || '';
    if (urlInput) urlInput.value = url || '';
    setTab('browser');
    _clearLogs();
    _log('info', `Navigated to ${url}`);
  }

  function refresh() {
    const { iframe } = _getEls();
    if (!iframe || !iframe.src) return;
    _log('info', 'Refreshing...');
    iframe.src = iframe.src;
  }

  function goBack() {
    try {
      const { iframe } = _getEls();
      if (iframe?.contentWindow) iframe.contentWindow.history.back();
    } catch { /* cross-origin */ }
  }

  function goForward() {
    try {
      const { iframe } = _getEls();
      if (iframe?.contentWindow) iframe.contentWindow.history.forward();
    } catch { /* cross-origin */ }
  }

  /* ── Viewport Resize ── */
  function setViewport(size) {
    const { iframe, viewportBtns } = _getEls();
    if (!iframe) return;
    _viewport = size;
    const vp = VIEWPORTS[size] || VIEWPORTS.desktop;
    const wrapper = iframe.parentElement;
    if (wrapper) {
      wrapper.style.maxWidth = vp.width;
      wrapper.style.margin = vp.width === '100%' ? '0' : '0 auto';
    }
    viewportBtns.forEach(b => b.classList.toggle('active', b.dataset.viewport === size));
    _log('info', `Viewport: ${vp.label} (${vp.width})`);
  }

  /* ── Console Log ── */
  function _log(level, text) {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
    _logs.push({ level, text, ts });
    if (_logs.length > 200) _logs.shift();
    _renderConsole();
  }

  function _clearLogs() {
    _logs = [];
    _renderConsole();
  }

  function _renderConsole() {
    const { console: el } = _getEls();
    if (!el) return;
    const list = el.querySelector('.preview-console-list');
    if (!list) return;
    list.innerHTML = _logs.map(l =>
      `<div class="preview-log preview-log-${l.level}"><span class="preview-log-ts">${l.ts}</span> ${_escHtml(l.text)}</div>`
    ).join('');
    list.scrollTop = list.scrollHeight;
  }

  function log(level, text) { _log(level, text); }

  /* ── Agent Output ── */
  function showOutput(html) {
    const { output } = _getEls();
    if (!output) return;
    output.innerHTML = html;
    setTab('output');
    if (!_isOpen) open();
  }

  function appendOutput(html) {
    const { output } = _getEls();
    if (!output) return;
    output.innerHTML += html;
    output.scrollTop = output.scrollHeight;
    if (!_isOpen) open();
  }

  /* ── Auto-detect URLs/HTML in agent responses ── */
  function detectAndOpen(text) {
    if (!text) return false;
    // Check for URLs
    const urlMatch = text.match(/https?:\/\/[^\s<>"']+/);
    if (urlMatch) {
      open(urlMatch[0]);
      return true;
    }
    // Check for HTML output
    if (text.includes('<!DOCTYPE') || text.includes('<html') || /<[a-z][\s\S]*>/i.test(text)) {
      showOutput(text);
      return true;
    }
    return false;
  }

  /* ── Helpers ── */
  function _escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ── Init ── */
  function init() {
    // Tab switching
    document.querySelectorAll('.preview-tab').forEach(tab => {
      tab.addEventListener('click', () => setTab(tab.dataset.tab));
    });

    // Close
    const closeBtn = document.getElementById('preview-close');
    if (closeBtn) closeBtn.addEventListener('click', close);

    // URL input — Enter to load
    const urlInput = document.getElementById('preview-url');
    if (urlInput) {
      urlInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); loadURL(urlInput.value.trim()); }
      });
    }

    // Refresh
    const refreshBtn = document.getElementById('preview-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', refresh);

    // Back / Forward
    const backBtn = document.getElementById('preview-back');
    if (backBtn) backBtn.addEventListener('click', goBack);
    const fwdBtn = document.getElementById('preview-forward');
    if (fwdBtn) fwdBtn.addEventListener('click', goForward);

    // Viewport buttons
    document.querySelectorAll('.preview-viewport-btn').forEach(btn => {
      btn.addEventListener('click', () => setViewport(btn.dataset.viewport));
    });

    // Console clear
    const clearBtn = document.getElementById('preview-console-clear');
    if (clearBtn) clearBtn.addEventListener('click', _clearLogs);

    // Drag handle resize
    _initDragResize();
  }

  /* ── Drag Resize ── */
  function _initDragResize() {
    const handle = document.getElementById('preview-drag-handle');
    if (!handle) return;

    let _dragging = false;

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      _dragging = true;
      handle.classList.add('dragging');
      document.body.classList.add('preview-dragging');
    });

    document.addEventListener('mousemove', (e) => {
      if (!_dragging) return;
      const panel = document.getElementById('preview-panel');
      const main = document.querySelector('.app-main');
      const niceAi = document.querySelector('.nice-ai');
      if (!panel) return;

      const vw = window.innerWidth;
      const minW = 280;
      const maxW = vw - 280;
      const panelW = Math.max(minW, Math.min(maxW, vw - e.clientX));
      const pct = (panelW / vw) * 100;

      panel.style.width = pct + '%';
      handle.style.right = pct + '%';
      if (main) main.style.marginRight = pct + '%';
      if (niceAi) {
        const mainPct = 100 - pct;
        niceAi.style.left = (mainPct / 2 + 28 / vw * 100) + '%';
        niceAi.style.width = (mainPct - 104 / vw * 100) + '%';
      }
    });

    document.addEventListener('mouseup', () => {
      if (!_dragging) return;
      _dragging = false;
      handle.classList.remove('dragging');
      document.body.classList.remove('preview-dragging');
    });
  }

  /* ── Update handle position on open/close ── */
  const _origOpen = open;
  open = function(url) {
    _origOpen(url);
    const handle = document.getElementById('preview-drag-handle');
    const panel = document.getElementById('preview-panel');
    if (handle && panel) {
      handle.style.right = panel.style.width || '50%';
    }
  };

  const _origClose = close;
  close = function() {
    _origClose();
    const handle = document.getElementById('preview-drag-handle');
    if (handle) handle.style.right = '';
    // Reset custom widths
    const panel = document.getElementById('preview-panel');
    const main = document.querySelector('.app-main');
    const niceAi = document.querySelector('.nice-ai');
    if (panel) panel.style.width = '';
    if (main) main.style.marginRight = '';
    if (niceAi) { niceAi.style.left = ''; niceAi.style.width = ''; }
  };

  return {
    init, open, close, toggle, isOpen,
    setTab, loadURL, refresh, goBack, goForward,
    setViewport, showOutput, appendOutput,
    detectAndOpen, log,
  };
})();
