/* ═══════════════════════════════════════════════════════════════════
   EngineeringView — In-App IDE
   Route: #/engineering
   ═══════════════════════════════════════════════════════════════════ */
const EngineeringView = (() => {
  const title = 'Engineering';
  const _esc = typeof Utils !== 'undefined' ? Utils.esc : s => s;

  /* ── Private state ── */
  let _el = null;
  let _activeProject = null;
  let _activeFile = null;
  let _openTabs = []; // [{ path, dirty }]
  let _bottomMode = 'preview'; // 'preview' | 'terminal'
  let _terminalLogs = [];
  let _viewport = 'desktop'; // 'desktop' | 'tablet' | 'mobile'
  let _aiOpen = false;
  let _bottomHeight = 250;

  /* ── CodeMirror state ── */
  let _cm = null;        // CodeMirror modules
  let _cmView = null;    // Current EditorView
  let _cmLoaded = false;
  let _cmLoading = false;

  /* ── Debounce helpers ── */
  let _saveTimer = null;
  let _previewTimer = null;

  /* ══════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════ */
  function render(el) {
    _el = el;
    // Restore last project
    _activeProject = localStorage.getItem('nice-ide-last-project') || null;
    const p = _activeProject ? VirtualFS.getProject(_activeProject) : null;
    if (_activeProject && !p) _activeProject = null;

    if (!_activeProject) {
      _renderProjectPicker(el);
      return;
    }

    _renderIDE(el);
  }

  /* ── Project Picker ── */
  function _renderProjectPicker(el) {
    const projects = VirtualFS.getProjects();
    const list = Object.entries(projects);

    el.innerHTML = `
      <div class="ide-new-project">
        <h2>Engineering</h2>
        <p style="color:var(--text-muted);font-size:.85rem;margin-top:-12px;">Create or open a project</p>
        ${list.length ? `
          <div style="width:100%;max-width:600px;">
            <h3 style="font-size:.75rem;color:var(--text-muted);margin-bottom:8px;font-family:var(--font-b)">RECENT PROJECTS</h3>
            <div style="display:flex;flex-direction:column;gap:6px;">
              ${list.map(([id, p]) => `
                <button class="ide-template-card" data-open-project="${_esc(id)}" style="text-align:left;display:flex;justify-content:space-between;align-items:center;padding:14px 16px;">
                  <div>
                    <h3 style="margin:0">${_esc(p.name)}</h3>
                    <p style="margin:0">${p.fileCount} file${p.fileCount !== 1 ? 's' : ''}</p>
                  </div>
                  <span style="font-size:.65rem;color:var(--text-muted)">${new Date(p.modified).toLocaleDateString()}</span>
                </button>
              `).join('')}
            </div>
          </div>
        ` : ''}
        <div>
          <h3 style="font-size:.75rem;color:var(--text-muted);margin-bottom:8px;font-family:var(--font-b)">NEW PROJECT</h3>
          <div class="ide-template-grid">
            <button class="ide-template-card" data-template="blank">
              <h3>Blank</h3>
              <p>Empty HTML file</p>
            </button>
            <button class="ide-template-card" data-template="landing-page">
              <h3>Landing Page</h3>
              <p>HTML + CSS + JS</p>
            </button>
            <button class="ide-template-card" data-template="dashboard">
              <h3>Dashboard</h3>
              <p>Cards + grid layout</p>
            </button>
            <button class="ide-template-card" data-template="edge-function">
              <h3>Edge Function</h3>
              <p>Deno / Supabase</p>
            </button>
          </div>
        </div>
      </div>
    `;

    el.addEventListener('click', _onProjectPickerClick);
  }

  function _onProjectPickerClick(e) {
    const tpl = e.target.closest('[data-template]');
    if (tpl) {
      const template = tpl.dataset.template;
      const name = prompt('Project name:', template === 'blank' ? 'My Project' : template.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
      if (!name) return;
      const id = VirtualFS.createProject(name, template);
      _activeProject = id;
      localStorage.setItem('nice-ide-last-project', id);
      _openTabs = [];
      _activeFile = null;
      // Auto-open first file
      const files = VirtualFS.listFiles(id);
      if (files.length) {
        _activeFile = files.find(f => f.endsWith('.html')) || files[0];
        _openTabs = [{ path: _activeFile, dirty: false }];
      }
      _renderIDE(_el);
      if (typeof Gamification !== 'undefined') Gamification.addXP('create_project', 20);
      return;
    }
    const open = e.target.closest('[data-open-project]');
    if (open) {
      _activeProject = open.dataset.openProject;
      localStorage.setItem('nice-ide-last-project', _activeProject);
      _openTabs = [];
      _activeFile = null;
      const files = VirtualFS.listFiles(_activeProject);
      if (files.length) {
        _activeFile = files.find(f => f.endsWith('.html')) || files[0];
        _openTabs = [{ path: _activeFile, dirty: false }];
      }
      _renderIDE(_el);
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     FULL IDE RENDER
  ══════════════════════════════════════════════════════════════════ */
  function _renderIDE(el) {
    const proj = VirtualFS.getProject(_activeProject);
    if (!proj) { _renderProjectPicker(el); return; }

    el.innerHTML = `
      <div class="ide-layout${_aiOpen ? ' ide-ai-open' : ''}">
        <!-- File Tree -->
        <div class="ide-file-tree" id="ide-file-tree">
          <div class="ide-project-bar">
            <select class="ide-project-select" id="ide-project-select"></select>
            <button class="ide-project-btn" id="ide-new-proj-btn" title="New project">+</button>
          </div>
          <div class="ide-tree-scroll" id="ide-tree-scroll"></div>
        </div>

        <!-- Editor Area -->
        <div class="ide-editor-area">
          <div class="ide-tab-bar" id="ide-tab-bar"></div>
          <div class="ide-editor-wrap" id="ide-editor-mount"></div>
          <div class="ide-resize-v" id="ide-resize-bottom"></div>
          <div class="ide-bottom-panel" id="ide-bottom-panel" style="height:${_bottomHeight}px">
            <div class="ide-bottom-toolbar">
              <div class="ide-bottom-btn-group">
                <button class="ide-bottom-btn${_bottomMode === 'preview' ? ' active' : ''}" data-bottom="preview">Preview</button>
                <button class="ide-bottom-btn${_bottomMode === 'terminal' ? ' active' : ''}" data-bottom="terminal">Terminal</button>
              </div>
              <div class="ide-viewport-btns" id="ide-viewport-btns" style="${_bottomMode !== 'preview' ? 'display:none' : ''}">
                <button class="ide-bottom-btn${_viewport === 'desktop' ? ' active' : ''}" data-viewport="desktop" title="Desktop">🖥</button>
                <button class="ide-bottom-btn${_viewport === 'tablet' ? ' active' : ''}" data-viewport="tablet" title="Tablet">📱</button>
                <button class="ide-bottom-btn${_viewport === 'mobile' ? ' active' : ''}" data-viewport="mobile" title="Mobile">📱</button>
              </div>
              <button class="ide-bottom-btn" id="ide-clear-term" style="${_bottomMode !== 'terminal' ? 'display:none' : ''}">Clear</button>
            </div>
            <div class="ide-preview-wrap${_viewport !== 'desktop' ? ' viewport-' + _viewport : ''}" id="ide-preview-wrap" style="${_bottomMode !== 'preview' ? 'display:none' : ''}">
              <iframe class="ide-preview-frame" id="ide-preview-frame" sandbox="allow-scripts"></iframe>
            </div>
            <div class="ide-terminal" id="ide-terminal" style="${_bottomMode !== 'terminal' ? 'display:none' : ''}"></div>
          </div>
        </div>

        <!-- Status Bar -->
        <div class="ide-status-bar">
          <span id="ide-status-file">${_activeFile ? _esc(_activeFile) : 'No file'}</span>
          <span id="ide-status-lang">${_activeFile ? VirtualFS.detectLanguage(_activeFile) : ''}</span>
          <span id="ide-status-pos">Ln 1, Col 1</span>
          <span class="ide-status-spacer"></span>
          <span>${_esc(proj.name)}</span>
          <button class="ide-project-btn" id="ide-toggle-ai" style="font-size:.6rem">AI</button>
        </div>
      </div>
    `;

    // Populate
    _populateProjectSelect();
    _renderFileTree();
    _renderTabs();
    _loadCodeMirror().then(() => { if (_activeFile) _openFileInEditor(_activeFile); });
    _refreshPreview();
    _attachHandlers(el);

    // Listen for file changes
    if (typeof State !== 'undefined') {
      State.onScoped('ide_file_changed', () => {
        clearTimeout(_previewTimer);
        _previewTimer = setTimeout(_refreshPreview, 500);
      });
    }

    // Listen for console messages from iframe
    window.addEventListener('message', _onIframeMessage);
  }

  /* ── Populate project dropdown ── */
  function _populateProjectSelect() {
    const sel = document.getElementById('ide-project-select');
    if (!sel) return;
    const projects = VirtualFS.getProjects();
    sel.innerHTML = Object.entries(projects).map(([id, p]) =>
      `<option value="${_esc(id)}"${id === _activeProject ? ' selected' : ''}>${_esc(p.name)}</option>`
    ).join('');
  }

  /* ══════════════════════════════════════════════════════════════════
     FILE TREE
  ══════════════════════════════════════════════════════════════════ */
  function _renderFileTree() {
    const container = document.getElementById('ide-tree-scroll');
    if (!container) return;
    const tree = VirtualFS.getFileTree(_activeProject);
    container.innerHTML = _renderTreeNodes(tree.children, 0);
  }

  function _renderTreeNodes(nodes, depth) {
    return nodes.map(n => {
      const indent = '<span class="ide-tree-indent"></span>'.repeat(depth);
      if (n.type === 'folder') {
        return `
          <div class="ide-tree-item" data-folder="${_esc(n.path)}" data-depth="${depth}">
            ${indent}
            <span class="ide-tree-folder-toggle">▶</span>
            <span class="ide-tree-icon folder">📁</span>
            ${_esc(n.name)}
          </div>
          <div class="ide-tree-children" data-folder-children="${_esc(n.path)}">
            ${_renderTreeNodes(n.children, depth + 1)}
          </div>`;
      }
      const icon = _fileIcon(n.name);
      const isActive = n.path === _activeFile;
      return `<div class="ide-tree-item${isActive ? ' active' : ''}" data-file="${_esc(n.path)}" data-depth="${depth}">
        ${indent}<span class="ide-tree-icon">${icon}</span>${_esc(n.name)}
      </div>`;
    }).join('');
  }

  function _fileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    const map = { html: '🌐', css: '🎨', js: '⚡', ts: '🔷', json: '📋', md: '📝', svg: '🖼' };
    return map[ext] || '📄';
  }

  /* ══════════════════════════════════════════════════════════════════
     TABS
  ══════════════════════════════════════════════════════════════════ */
  function _renderTabs() {
    const bar = document.getElementById('ide-tab-bar');
    if (!bar) return;
    bar.innerHTML = _openTabs.map(t => {
      const name = t.path.split('/').pop();
      const isActive = t.path === _activeFile;
      return `<div class="ide-tab${isActive ? ' active' : ''}${t.dirty ? ' dirty' : ''}" data-tab="${_esc(t.path)}">
        <span class="ide-tab-dot"></span>
        <span>${_esc(name)}</span>
        <button class="ide-tab-close" data-close-tab="${_esc(t.path)}">✕</button>
      </div>`;
    }).join('');
  }

  function _openTab(path) {
    if (!_openTabs.find(t => t.path === path)) {
      _openTabs.push({ path, dirty: false });
    }
    _activeFile = path;
    _renderTabs();
    _openFileInEditor(path);
    _updateStatus();
    _highlightTreeItem(path);
  }

  function _closeTab(path) {
    _openTabs = _openTabs.filter(t => t.path !== path);
    if (_activeFile === path) {
      _activeFile = _openTabs.length ? _openTabs[_openTabs.length - 1].path : null;
    }
    _renderTabs();
    if (_activeFile) _openFileInEditor(_activeFile);
    else _showEmptyEditor();
    _updateStatus();
  }

  /* ══════════════════════════════════════════════════════════════════
     CODEMIRROR 6
  ══════════════════════════════════════════════════════════════════ */
  async function _loadCodeMirror() {
    if (_cmLoaded || _cmLoading) return;
    _cmLoading = true;
    try {
      const BASE = 'https://esm.sh/';
      const [
        { EditorView, basicSetup },
        { EditorState },
        { javascript },
        { html },
        { css },
        { oneDark }
      ] = await Promise.all([
        import(/* @vite-ignore */ BASE + 'codemirror'),
        import(/* @vite-ignore */ BASE + '@codemirror/state'),
        import(/* @vite-ignore */ BASE + '@codemirror/lang-javascript'),
        import(/* @vite-ignore */ BASE + '@codemirror/lang-html'),
        import(/* @vite-ignore */ BASE + '@codemirror/lang-css'),
        import(/* @vite-ignore */ BASE + '@codemirror/theme-one-dark')
      ]);
      _cm = { EditorView, EditorState, basicSetup, javascript, html, css, oneDark };
      _cmLoaded = true;
      _cmLoading = false;
    } catch (e) {
      console.warn('[Engineering] CodeMirror load failed, using textarea fallback:', e);
      _cmLoading = false;
    }
  }

  function _getLangExtension(path) {
    if (!_cm) return [];
    const lang = VirtualFS.detectLanguage(path);
    switch (lang) {
      case 'html': return [_cm.html()];
      case 'css': return [_cm.css()];
      case 'javascript': return [_cm.javascript()];
      case 'typescript': return [_cm.javascript({ typescript: true })];
      default: return [];
    }
  }

  function _openFileInEditor(path) {
    const content = VirtualFS.getFile(_activeProject, path);
    if (content === null) return;
    const mount = document.getElementById('ide-editor-mount');
    if (!mount) return;

    if (_cmLoaded && _cm) {
      // Destroy old editor
      if (_cmView) { _cmView.destroy(); _cmView = null; }

      const updateListener = _cm.EditorView.updateListener.of(update => {
        if (update.docChanged) {
          _onEditorChange(path, update.state.doc.toString());
          // Update cursor position
          const cursor = update.state.selection.main.head;
          const line = update.state.doc.lineAt(cursor);
          _updateCursorPos(line.number, cursor - line.from + 1);
        }
      });

      const state = _cm.EditorState.create({
        doc: content,
        extensions: [
          _cm.basicSetup,
          _cm.oneDark,
          ..._getLangExtension(path),
          updateListener,
          _cm.EditorView.theme({
            '&': { height: '100%', fontSize: '13px' },
            '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--font-m, "Fira Code", monospace)' },
            '.cm-content': { caretColor: 'var(--accent, #6366f1)' },
            '.cm-cursor': { borderLeftColor: 'var(--accent, #6366f1)' },
            '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { background: 'rgba(99, 102, 241, 0.2) !important' }
          })
        ]
      });

      _cmView = new _cm.EditorView({ state, parent: mount });
    } else {
      // Fallback textarea
      mount.innerHTML = `<textarea class="ide-fallback-editor" id="ide-textarea" spellcheck="false">${_esc(content)}</textarea>`;
      const ta = document.getElementById('ide-textarea');
      if (ta) {
        ta.addEventListener('input', () => _onEditorChange(path, ta.value));
        ta.addEventListener('keydown', e => {
          if (e.key === 'Tab') {
            e.preventDefault();
            const start = ta.selectionStart;
            ta.value = ta.value.substring(0, start) + '  ' + ta.value.substring(ta.selectionEnd);
            ta.selectionStart = ta.selectionEnd = start + 2;
            _onEditorChange(path, ta.value);
          }
        });
      }
    }
  }

  function _showEmptyEditor() {
    const mount = document.getElementById('ide-editor-mount');
    if (!mount) return;
    if (_cmView) { _cmView.destroy(); _cmView = null; }
    mount.innerHTML = `
      <div class="ide-empty-state">
        <svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"/></svg>
        <p>Select a file to start editing</p>
      </div>
    `;
  }

  function _onEditorChange(path, content) {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
      VirtualFS.setFile(_activeProject, path, content);
      const tab = _openTabs.find(t => t.path === path);
      if (tab) { tab.dirty = false; _renderTabs(); }
    }, 800);
    // Mark dirty immediately
    const tab = _openTabs.find(t => t.path === path);
    if (tab && !tab.dirty) { tab.dirty = true; _renderTabs(); }
  }

  function _updateCursorPos(line, col) {
    const el = document.getElementById('ide-status-pos');
    if (el) el.textContent = `Ln ${line}, Col ${col}`;
  }

  /* ══════════════════════════════════════════════════════════════════
     LIVE PREVIEW
  ══════════════════════════════════════════════════════════════════ */
  function _refreshPreview() {
    const frame = document.getElementById('ide-preview-frame');
    if (!frame || _bottomMode !== 'preview') return;

    const files = VirtualFS.listFiles(_activeProject);
    let htmlFile = files.find(f => f.endsWith('.html'));
    if (!htmlFile) {
      frame.srcdoc = '<html><body style="background:#1a1a1a;color:#888;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh"><p>No HTML file found</p></body></html>';
      return;
    }

    let html = VirtualFS.getFile(_activeProject, htmlFile) || '';

    // Inline CSS files referenced via <link>
    html = html.replace(/<link\s+[^>]*href=["']([^"']+\.css)["'][^>]*>/gi, (match, href) => {
      const cssContent = VirtualFS.getFile(_activeProject, href);
      if (cssContent !== null) return `<style>/* ${_esc(href)} */\n${cssContent}</style>`;
      return match;
    });

    // Inline JS files referenced via <script src>
    html = html.replace(/<script\s+[^>]*src=["']([^"']+\.js)["'][^>]*><\/script>/gi, (match, src) => {
      const jsContent = VirtualFS.getFile(_activeProject, src);
      if (jsContent !== null) return `<script>/* ${src} */\n${jsContent}<\/script>`;
      return match;
    });

    // Inject console capture
    const consoleCapture = `<script>
(function(){
  var _orig = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  function _send(level, args) {
    try {
      parent.postMessage({ type: 'nice-ide-console', level: level, args: Array.from(args).map(function(a) { try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch(e) { return String(a); } }) }, '*');
    } catch(e) {}
  }
  console.log = function() { _send('log', arguments); _orig.log.apply(console, arguments); };
  console.warn = function() { _send('warn', arguments); _orig.warn.apply(console, arguments); };
  console.error = function() { _send('error', arguments); _orig.error.apply(console, arguments); };
  console.info = function() { _send('info', arguments); _orig.info.apply(console, arguments); };
  window.onerror = function(msg, src, line, col, err) { _send('error', ['Error: ' + msg + ' (line ' + line + ')']); };
  window.addEventListener('unhandledrejection', function(e) { _send('error', ['Unhandled rejection: ' + e.reason]); });
})();
<\/script>`;

    // Insert console capture before </head> or at start
    if (html.includes('</head>')) {
      html = html.replace('</head>', consoleCapture + '</head>');
    } else {
      html = consoleCapture + html;
    }

    frame.srcdoc = html;
  }

  function _onIframeMessage(e) {
    if (!e.data || e.data.type !== 'nice-ide-console') return;
    const { level, args } = e.data;
    _terminalLogs.push({ level, text: args.join(' '), ts: Date.now() });
    if (_terminalLogs.length > 500) _terminalLogs = _terminalLogs.slice(-500);
    _renderTerminal();
  }

  function _renderTerminal() {
    const term = document.getElementById('ide-terminal');
    if (!term || _bottomMode !== 'terminal') return;
    const wasScrolled = term.scrollTop >= term.scrollHeight - term.clientHeight - 20;
    term.innerHTML = _terminalLogs.map(l =>
      `<div class="ide-terminal-line ${l.level}">${_esc(l.text)}</div>`
    ).join('');
    if (wasScrolled) term.scrollTop = term.scrollHeight;
  }

  /* ══════════════════════════════════════════════════════════════════
     CONTEXT MENU
  ══════════════════════════════════════════════════════════════════ */
  function _showContextMenu(x, y, items) {
    _hideContextMenu();
    const menu = document.createElement('div');
    menu.className = 'ide-ctx-menu';
    menu.id = 'ide-ctx-menu';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.innerHTML = items.map(item => {
      if (item === 'sep') return '<div class="ide-ctx-sep"></div>';
      return `<button class="ide-ctx-item" data-action="${item.action}">${_esc(item.label)}</button>`;
    }).join('');
    document.body.appendChild(menu);
    // Close on click outside
    setTimeout(() => document.addEventListener('click', _hideContextMenu, { once: true }), 0);
  }

  function _hideContextMenu() {
    const m = document.getElementById('ide-ctx-menu');
    if (m) m.remove();
  }

  /* ══════════════════════════════════════════════════════════════════
     EVENT HANDLERS
  ══════════════════════════════════════════════════════════════════ */
  function _attachHandlers(el) {
    el.addEventListener('click', _onClick);
    el.addEventListener('contextmenu', _onContextMenu);
    document.addEventListener('keydown', _onKeydown);
  }

  function _onClick(e) {
    // File tree click
    const fileItem = e.target.closest('[data-file]');
    if (fileItem) {
      _openTab(fileItem.dataset.file);
      return;
    }

    // Folder toggle
    const folderItem = e.target.closest('[data-folder]');
    if (folderItem) {
      const children = document.querySelector(`[data-folder-children="${folderItem.dataset.folder}"]`);
      const toggle = folderItem.querySelector('.ide-tree-folder-toggle');
      if (children) {
        const hidden = children.style.display === 'none';
        children.style.display = hidden ? '' : 'none';
        if (toggle) toggle.textContent = hidden ? '▼' : '▶';
      }
      return;
    }

    // Tab click
    const tab = e.target.closest('[data-tab]');
    if (tab && !e.target.closest('[data-close-tab]')) {
      _openTab(tab.dataset.tab);
      return;
    }

    // Tab close
    const closeTab = e.target.closest('[data-close-tab]');
    if (closeTab) {
      e.stopPropagation();
      _closeTab(closeTab.dataset.closeTab);
      return;
    }

    // Bottom panel mode
    const bottomBtn = e.target.closest('[data-bottom]');
    if (bottomBtn) {
      _bottomMode = bottomBtn.dataset.bottom;
      _updateBottomPanel();
      return;
    }

    // Viewport
    const vpBtn = e.target.closest('[data-viewport]');
    if (vpBtn) {
      _viewport = vpBtn.dataset.viewport;
      _updateViewport();
      return;
    }

    // New project
    if (e.target.closest('#ide-new-proj-btn')) {
      _activeProject = null;
      localStorage.removeItem('nice-ide-last-project');
      _renderProjectPicker(_el);
      return;
    }

    // Project select change
    if (e.target.closest('#ide-project-select')) return; // handled by change event

    // Toggle AI panel
    if (e.target.closest('#ide-toggle-ai')) {
      _aiOpen = !_aiOpen;
      const layout = _el.querySelector('.ide-layout');
      if (layout) layout.classList.toggle('ide-ai-open', _aiOpen);
      return;
    }

    // Clear terminal
    if (e.target.closest('#ide-clear-term')) {
      _terminalLogs = [];
      _renderTerminal();
      return;
    }

    // Context menu action
    const ctxAction = e.target.closest('[data-action]');
    if (ctxAction) {
      _handleContextAction(ctxAction.dataset.action);
      return;
    }
  }

  function _onContextMenu(e) {
    const fileItem = e.target.closest('[data-file]');
    const folderItem = e.target.closest('[data-folder]');
    const treeScroll = e.target.closest('#ide-tree-scroll');

    if (fileItem) {
      e.preventDefault();
      const path = fileItem.dataset.file;
      _showContextMenu(e.clientX, e.clientY, [
        { label: 'Rename', action: 'rename:' + path },
        { label: 'Delete', action: 'delete:' + path },
        'sep',
        { label: 'New file here', action: 'newfile' }
      ]);
    } else if (folderItem) {
      e.preventDefault();
      const path = folderItem.dataset.folder;
      _showContextMenu(e.clientX, e.clientY, [
        { label: 'New file', action: 'newfilein:' + path },
        { label: 'New folder', action: 'newfolder:' + path },
        'sep',
        { label: 'Delete folder', action: 'deletefolder:' + path }
      ]);
    } else if (treeScroll) {
      e.preventDefault();
      _showContextMenu(e.clientX, e.clientY, [
        { label: 'New file', action: 'newfile' },
        { label: 'New folder', action: 'newfolder' }
      ]);
    }
  }

  function _handleContextAction(action) {
    _hideContextMenu();
    if (action === 'newfile') {
      const name = prompt('File name:', 'untitled.html');
      if (name) { VirtualFS.setFile(_activeProject, name, ''); _renderFileTree(); _openTab(name); }
    } else if (action.startsWith('newfilein:')) {
      const folder = action.slice(10);
      const name = prompt('File name:');
      if (name) { VirtualFS.setFile(_activeProject, folder + '/' + name, ''); _renderFileTree(); _openTab(folder + '/' + name); }
    } else if (action.startsWith('newfolder:')) {
      const parent = action.slice(10);
      const name = prompt('Folder name:');
      if (name) { VirtualFS.createFolder(_activeProject, (parent ? parent + '/' : '') + name); _renderFileTree(); }
    } else if (action === 'newfolder') {
      const name = prompt('Folder name:');
      if (name) { VirtualFS.createFolder(_activeProject, name); _renderFileTree(); }
    } else if (action.startsWith('rename:')) {
      const old = action.slice(7);
      const newName = prompt('New name:', old.split('/').pop());
      if (newName && newName !== old.split('/').pop()) {
        const dir = old.includes('/') ? old.substring(0, old.lastIndexOf('/') + 1) : '';
        VirtualFS.renameFile(_activeProject, old, dir + newName);
        // Update tabs
        _openTabs.forEach(t => { if (t.path === old) t.path = dir + newName; });
        if (_activeFile === old) _activeFile = dir + newName;
        _renderFileTree();
        _renderTabs();
      }
    } else if (action.startsWith('delete:')) {
      const path = action.slice(7);
      if (confirm('Delete ' + path + '?')) {
        VirtualFS.deleteFile(_activeProject, path);
        _closeTab(path);
        _renderFileTree();
      }
    } else if (action.startsWith('deletefolder:')) {
      const path = action.slice(13);
      if (confirm('Delete folder ' + path + ' and all contents?')) {
        VirtualFS.deleteFile(_activeProject, path);
        _renderFileTree();
      }
    }
  }

  function _onKeydown(e) {
    // Cmd+S — save current file
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      if (_activeFile && _cmView) {
        const content = _cmView.state.doc.toString();
        VirtualFS.setFile(_activeProject, _activeFile, content);
        const tab = _openTabs.find(t => t.path === _activeFile);
        if (tab) { tab.dirty = false; _renderTabs(); }
        if (typeof Notify !== 'undefined') Notify.show('Saved', 'success');
      }
    }
    // Cmd+P — quick file open
    if ((e.metaKey || e.ctrlKey) && e.key === 'p' && _activeProject) {
      e.preventDefault();
      const files = VirtualFS.listFiles(_activeProject);
      const pick = prompt('Open file:\n' + files.join('\n'));
      if (pick && files.includes(pick)) _openTab(pick);
    }
  }

  /* ── UI updates ── */
  function _updateBottomPanel() {
    const previewWrap = document.getElementById('ide-preview-wrap');
    const terminal = document.getElementById('ide-terminal');
    const vpBtns = document.getElementById('ide-viewport-btns');
    const clearBtn = document.getElementById('ide-clear-term');

    document.querySelectorAll('[data-bottom]').forEach(b => b.classList.toggle('active', b.dataset.bottom === _bottomMode));

    if (previewWrap) previewWrap.style.display = _bottomMode === 'preview' ? '' : 'none';
    if (terminal) terminal.style.display = _bottomMode === 'terminal' ? '' : 'none';
    if (vpBtns) vpBtns.style.display = _bottomMode === 'preview' ? '' : 'none';
    if (clearBtn) clearBtn.style.display = _bottomMode === 'terminal' ? '' : 'none';

    if (_bottomMode === 'preview') _refreshPreview();
    if (_bottomMode === 'terminal') _renderTerminal();
  }

  function _updateViewport() {
    const wrap = document.getElementById('ide-preview-wrap');
    if (wrap) {
      wrap.className = 'ide-preview-wrap' + (_viewport !== 'desktop' ? ' viewport-' + _viewport : '');
    }
    document.querySelectorAll('[data-viewport]').forEach(b => b.classList.toggle('active', b.dataset.viewport === _viewport));
  }

  function _updateStatus() {
    const fileEl = document.getElementById('ide-status-file');
    const langEl = document.getElementById('ide-status-lang');
    if (fileEl) fileEl.textContent = _activeFile || 'No file';
    if (langEl) langEl.textContent = _activeFile ? VirtualFS.detectLanguage(_activeFile) : '';
  }

  function _highlightTreeItem(path) {
    const tree = document.getElementById('ide-tree-scroll');
    if (!tree) return;
    tree.querySelectorAll('.ide-tree-item').forEach(item => {
      item.classList.toggle('active', item.dataset.file === path);
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     CLEANUP
  ══════════════════════════════════════════════════════════════════ */
  function destroy() {
    if (_cmView) { _cmView.destroy(); _cmView = null; }
    clearTimeout(_saveTimer);
    clearTimeout(_previewTimer);
    window.removeEventListener('message', _onIframeMessage);
    document.removeEventListener('keydown', _onKeydown);
    if (typeof State !== 'undefined') State.destroyScoped();
    _el = null;
  }

  return { render, destroy, title };
})();
