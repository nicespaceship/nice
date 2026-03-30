/* ═══════════════════════════════════════════════════════════════════
   VirtualFS — In-memory file system with localStorage persistence
   ═══════════════════════════════════════════════════════════════════ */
const VirtualFS = (() => {
  const STORAGE_KEY = Utils.KEYS.ideProjects;
  const MAX_SIZE = 5 * 1024 * 1024; // 5MB
  const WARN_SIZE = 4 * 1024 * 1024;

  /* ── Internal state ── */
  let _projects = {};

  /* ── Persistence ── */
  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      _projects = raw ? JSON.parse(raw) : {};
    } catch { _projects = {}; }
  }

  function _save() {
    const json = JSON.stringify(_projects);
    if (json.length > MAX_SIZE) {
      console.warn('[VirtualFS] Storage limit exceeded (5MB)');
      return false;
    }
    if (json.length > WARN_SIZE) {
      console.warn('[VirtualFS] Approaching storage limit (4MB/5MB)');
    }
    try {
      localStorage.setItem(STORAGE_KEY, json);
      if (typeof State !== 'undefined') State.set('ide_projects', { ..._projects });
      return true;
    } catch (e) {
      console.error('[VirtualFS] Save failed:', e);
      return false;
    }
  }

  function _id() {
    return 'proj_' + Array.from(crypto.getRandomValues(new Uint8Array(4)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function _now() { return new Date().toISOString(); }

  /* ── Templates ── */
  const TEMPLATES = {
    blank: {
      'index.html': '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>My Project</title>\n</head>\n<body>\n  <h1>Hello, World!</h1>\n</body>\n</html>'
    },
    'landing-page': {
      'index.html': '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Landing Page</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <header>\n    <nav>\n      <h1>My App</h1>\n    </nav>\n  </header>\n  <main>\n    <section class="hero">\n      <h2>Welcome</h2>\n      <p>Build something amazing.</p>\n      <button id="cta">Get Started</button>\n    </section>\n  </main>\n  <script src="script.js"><\/script>\n</body>\n</html>',
      'style.css': '* { margin:0; padding:0; box-sizing:border-box; }\nbody { font-family:system-ui, sans-serif; background:#0a0a0a; color:#fafafa; }\nnav { padding:1rem 2rem; border-bottom:1px solid #222; }\nnav h1 { font-size:1.2rem; }\n.hero { text-align:center; padding:6rem 2rem; }\n.hero h2 { font-size:3rem; margin-bottom:1rem; }\n.hero p { color:#888; font-size:1.2rem; margin-bottom:2rem; }\nbutton { padding:.75rem 2rem; background:#6366f1; color:#fff; border:none; border-radius:8px; font-size:1rem; cursor:pointer; }\nbutton:hover { background:#4f46e5; }',
      'script.js': 'document.getElementById(\'cta\').addEventListener(\'click\', () => {\n  alert(\'Let\\\'s go!\');\n});'
    },
    dashboard: {
      'index.html': '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Dashboard</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <div class="dashboard">\n    <header class="dash-header">\n      <h1>Dashboard</h1>\n    </header>\n    <div class="cards">\n      <div class="card"><h3>Users</h3><p class="stat">1,234</p></div>\n      <div class="card"><h3>Revenue</h3><p class="stat">$12.4K</p></div>\n      <div class="card"><h3>Orders</h3><p class="stat">567</p></div>\n      <div class="card"><h3>Growth</h3><p class="stat">+23%</p></div>\n    </div>\n  </div>\n  <script src="app.js"><\/script>\n</body>\n</html>',
      'style.css': '* { margin:0; padding:0; box-sizing:border-box; }\nbody { font-family:system-ui, sans-serif; background:#0a0a0a; color:#fafafa; }\n.dashboard { max-width:1200px; margin:0 auto; padding:2rem; }\n.dash-header { margin-bottom:2rem; }\n.cards { display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:1rem; }\n.card { background:#18181b; border:1px solid #27272a; border-radius:12px; padding:1.5rem; }\n.card h3 { font-size:.85rem; color:#a1a1aa; margin-bottom:.5rem; }\n.stat { font-size:2rem; font-weight:700; }',
      'app.js': '// Dashboard logic\nconsole.log(\'Dashboard loaded\');'
    },
    'edge-function': {
      'index.ts': 'import "jsr:@supabase/functions-js/edge-runtime.d.ts";\n\nDeno.serve(async (req: Request) => {\n  const url = new URL(req.url);\n  \n  if (req.method === "OPTIONS") {\n    return new Response(null, {\n      headers: {\n        "Access-Control-Allow-Origin": "*",\n        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",\n        "Access-Control-Allow-Headers": "Content-Type, Authorization"\n      }\n    });\n  }\n\n  const data = { message: "Hello from NICE!" };\n\n  return new Response(JSON.stringify(data), {\n    headers: {\n      "Content-Type": "application/json",\n      "Connection": "keep-alive"\n    }\n  });\n});'
    }
  };

  /* ── Project CRUD ── */
  function createProject(name, templateId) {
    const id = _id();
    const files = TEMPLATES[templateId || 'blank'] || TEMPLATES.blank;
    _projects[id] = {
      name: name || 'Untitled',
      files: { ...files },
      created: _now(),
      modified: _now()
    };
    _save();
    return id;
  }

  function deleteProject(id) {
    if (!_projects[id]) return false;
    delete _projects[id];
    _save();
    return true;
  }

  function getProjects() {
    const out = {};
    for (const [id, p] of Object.entries(_projects)) {
      out[id] = { name: p.name, created: p.created, modified: p.modified, fileCount: Object.keys(p.files).length };
    }
    return out;
  }

  function getProject(id) {
    return _projects[id] || null;
  }

  function renameProject(id, name) {
    if (!_projects[id]) return false;
    _projects[id].name = name;
    _projects[id].modified = _now();
    _save();
    return true;
  }

  /* ── File operations ── */
  function listFiles(projectId) {
    const p = _projects[projectId];
    return p ? Object.keys(p.files).sort() : [];
  }

  function getFileTree(projectId) {
    const paths = listFiles(projectId);
    const root = { name: '/', type: 'folder', children: [], path: '' };
    for (const path of paths) {
      const parts = path.split('/');
      let node = root;
      for (let i = 0; i < parts.length; i++) {
        const name = parts[i];
        const isFile = i === parts.length - 1;
        const fullPath = parts.slice(0, i + 1).join('/');
        if (isFile) {
          node.children.push({ name, type: 'file', path: fullPath });
        } else {
          let folder = node.children.find(c => c.name === name && c.type === 'folder');
          if (!folder) {
            folder = { name, type: 'folder', children: [], path: fullPath };
            node.children.push(folder);
          }
          node = folder;
        }
      }
    }
    // Sort: folders first, then files, alphabetical
    function sortTree(node) {
      if (node.children) {
        node.children.sort((a, b) => {
          if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        node.children.forEach(sortTree);
      }
    }
    sortTree(root);
    return root;
  }

  function getFile(projectId, path) {
    const p = _projects[projectId];
    return p && p.files[path] !== undefined ? p.files[path] : null;
  }

  function setFile(projectId, path, content) {
    const p = _projects[projectId];
    if (!p) return false;
    p.files[path] = content;
    p.modified = _now();
    const ok = _save();
    if (ok && typeof State !== 'undefined') {
      State.set('ide_file_changed', { projectId, path, ts: Date.now() });
    }
    return ok;
  }

  function deleteFile(projectId, path) {
    const p = _projects[projectId];
    if (!p || p.files[path] === undefined) return false;
    delete p.files[path];
    // Also delete any files inside if it was treated as a folder prefix
    for (const key of Object.keys(p.files)) {
      if (key.startsWith(path + '/')) delete p.files[key];
    }
    p.modified = _now();
    _save();
    return true;
  }

  function renameFile(projectId, oldPath, newPath) {
    const p = _projects[projectId];
    if (!p || p.files[oldPath] === undefined) return false;
    p.files[newPath] = p.files[oldPath];
    delete p.files[oldPath];
    // Rename nested files if folder
    for (const key of Object.keys(p.files)) {
      if (key.startsWith(oldPath + '/')) {
        p.files[newPath + key.slice(oldPath.length)] = p.files[key];
        delete p.files[key];
      }
    }
    p.modified = _now();
    _save();
    return true;
  }

  function createFolder(projectId, path) {
    // Folders are implicit (from file paths), but we store a .keep
    return setFile(projectId, path + '/.keep', '');
  }

  function exportProject(projectId) {
    const p = _projects[projectId];
    if (!p) return null;
    return { name: p.name, files: { ...p.files }, exported: _now() };
  }

  function importProject(data) {
    if (!data || !data.files) return null;
    const id = _id();
    _projects[id] = {
      name: data.name || 'Imported',
      files: { ...data.files },
      created: _now(),
      modified: _now()
    };
    _save();
    return id;
  }

  /* ── Language detection ── */
  function detectLanguage(path) {
    const ext = (path || '').split('.').pop().toLowerCase();
    const map = {
      html: 'html', htm: 'html',
      css: 'css', scss: 'css', less: 'css',
      js: 'javascript', mjs: 'javascript', jsx: 'javascript',
      ts: 'typescript', tsx: 'typescript',
      json: 'json',
      md: 'markdown',
      svg: 'html',
      txt: 'text'
    };
    return map[ext] || 'text';
  }

  /* ── Init ── */
  _load();

  return {
    createProject, deleteProject, getProjects, getProject, renameProject,
    listFiles, getFileTree, getFile, setFile, deleteFile, renameFile,
    createFolder, exportProject, importProject, detectLanguage,
    TEMPLATES
  };
})();
