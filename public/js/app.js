/* ═══════════════════════════════════════════════════════════════════
   NICE SPACESHIP — Shared Scripts
   Modular JS — each export maps to a future Next.js component.
═══════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────────
   SUPABASE CLIENT (shared across all pages via app.js)
───────────────────────────────────────────────────────────────── */
const _SB_URL = 'https://zacllshbgmnwsmliteqx.supabase.co';
const _SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4cHJwdGRybnNhbnNqZm95c2p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwODAzNTYsImV4cCI6MjA4ODY1NjM1Nn0.SW6_480FohkwaxVX-y8ddT5UkjWE9ZMch1W7A2Ji1Zc';
const _sbApp = (typeof supabase !== 'undefined')
  ? supabase.createClient(_SB_URL, _SB_KEY)
  : null;

/* ─────────────────────────────────────────────────────────────────
   MODULE: Theme Engine
───────────────────────────────────────────────────────────────── */
const Theme = (() => {
  const THEMES = ['nice','hal-9000','grid','solar','matrix','retro','lcars','pixel'];
  const BTN    = { nice:'d-sp', 'hal-9000':'d-iv', grid:'d-nv', solar:'d-sl', matrix:'d-mx', retro:'d-rt', lcars:'d-lc', pixel:'d-px' };

  function set(name) {
    if (!THEMES.includes(name)) return;
    document.documentElement.setAttribute('data-theme', name);
    localStorage.setItem('ns-theme', name);
    document.querySelectorAll('.db').forEach(b => b.classList.remove('active'));
    document.querySelector('.' + BTN[name])?.classList.add('active');
    MatrixRain.toggle(name === 'matrix');
  }

  function init() {
    const saved = localStorage.getItem('ns-theme');
    set(THEMES.includes(saved) ? saved : 'nice');
  }

  return { set, init };
})();

/* ─────────────────────────────────────────────────────────────────
   MODULE: Font Engine
───────────────────────────────────────────────────────────────── */
const Font = (() => {
  const FONTS = ['auto','clean','space','tac','code','serif','mono','pixel'];

  function set(name) {
    if (!FONTS.includes(name)) return;
    if (name === 'auto') {
      document.documentElement.removeAttribute('data-font');
    } else {
      document.documentElement.setAttribute('data-font', name);
    }
    localStorage.setItem('ns-font', name);
    document.querySelectorAll('.fb').forEach(b => b.classList.remove('active'));
    document.querySelector(`.fb[data-fid="${name}"]`)?.classList.add('active');
  }

  function init() {
    const saved = localStorage.getItem('ns-font') || 'auto';
    set(saved);
  }

  return { set, init };
})();

/* ─────────────────────────────────────────────────────────────────
   MODULE: Matrix Rain (canvas)
───────────────────────────────────────────────────────────────── */
const MatrixRain = (() => {
  const canvas = document.getElementById('matrix-canvas');
  if (!canvas) return { toggle: () => {} };
  const ctx   = canvas.getContext('2d');
  const CHARS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEF<>{}[]/\\|';
  const FS    = 14;
  let   cols  = [], raf = null;

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    cols = Array.from({ length: Math.floor(canvas.width / FS) }, () => Math.random() * -80);
  }

  function draw() {
    ctx.fillStyle = 'rgba(0,8,0,0.05)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#00ff41';
    ctx.font = `${FS}px 'Fira Code', monospace`;
    cols.forEach((y, i) => {
      ctx.fillText(CHARS[Math.floor(Math.random() * CHARS.length)], i * FS, Math.floor(y) * FS);
      cols[i] = y > canvas.height / FS + Math.random() * 20 ? 0 : y + 0.15;
    });
    raf = requestAnimationFrame(draw);
  }

  function toggle(on) {
    if (on) { resize(); if (!raf) draw(); }
    else {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  window.addEventListener('resize', () => { if (raf) resize(); });
  return { toggle };
})();

/* ─────────────────────────────────────────────────────────────────
   MODULE: Telemetry Clock (Mission Elapsed Time)
───────────────────────────────────────────────────────────────── */
const Telemetry = (() => {
  const t0 = Date.now();
  const p2 = n => String(n).padStart(2, '0');

  function tick() {
    // Mission elapsed time
    const s = Math.floor((Date.now() - t0) / 1000);
    document.querySelectorAll('.met').forEach(el => {
      el.textContent = `T+${p2(Math.floor(s/3600))}:${p2(Math.floor(s%3600/60))}:${p2(s%60)}`;
    });
  }

  return { init: () => setInterval(tick, 250) };
})();

/* ─────────────────────────────────────────────────────────────────
   MODULE: Mission Control HUD
   Animates dial, position coords, and console log.
───────────────────────────────────────────────────────────────── */
const MissionControl = (() => {
  const LOGS = [
    'OPTIMIZING WORKFLOW_ALPHA...',
    'NICE SPACESHIP NODE STABLE: CONFIRMED.',
    'SCALING AGENT FLEET...',
    'DAEMON SHIELD ACTIVE.',
    'SYNTHESIZING DATA_SET_7...',
    'UPDATING MCP CONNECTORS...',
    'THREAT SCAN: CLEAR.',
    'MISSION PARAMETERS UPDATED.',
    'AGENT_DELTA TASK COMPLETE.',
    'DEPLOYING WORKFLOW_BETA...',
    'CHECKPOINT LOGGED: T+00:04:11.',
    'LLM CONTEXT WINDOW: 98% UTILIZED.',
  ];
  let logHistory = [
    '> INITIALIZING AGENT_DELTA...',
    '> SCANNING LOCAL_MCP_NODES...',
    '> DATA_SYNTHESIS_COMPLETE.',
    '> STANDING BY FOR USER_INPUT.',
  ];

  function tick() {
    // Position coords
    document.querySelectorAll('[data-pos]').forEach(el => {
      el.textContent = (Math.random() * 999).toFixed(1);
    });
    // Thrust / dial value
    const thrust = Math.floor(Math.random() * (97 - 80 + 1) + 80);
    document.querySelectorAll('.dial-val').forEach(el => {
      el.textContent = thrust + '%';
    });
    // System Diagnostics bars
    const diags = { cpu: [55, 95], mem: [40, 78], net: [15, 60], pool: [80, 99] };
    for (const [key, [lo, hi]] of Object.entries(diags)) {
      const val = Math.floor(Math.random() * (hi - lo + 1) + lo);
      document.querySelectorAll(`[data-diag="${key}"]`).forEach(el => {
        el.style.width = val + '%';
      });
      document.querySelectorAll(`[data-diag-val="${key}"]`).forEach(el => {
        el.textContent = val + '%';
      });
    }
    // Coordinate Vector Grid
    const coords = { az: [0, 360, 1], el: [0, 90, 1], rng: [500, 999, 1], vel: [5, 12, 2], hdg: [0, 360, 1], alt: [200, 600, 1] };
    for (const [key, [lo, hi, dec]] of Object.entries(coords)) {
      const val = (Math.random() * (hi - lo) + lo).toFixed(dec);
      document.querySelectorAll(`[data-coord="${key}"]`).forEach(el => {
        el.textContent = val;
      });
    }
    // Console log
    const newLine = '> ' + LOGS[Math.floor(Math.random() * LOGS.length)];
    logHistory = [newLine, ...logHistory.slice(0, 4)];
    document.querySelectorAll('.console-log').forEach(el => {
      el.innerHTML = logHistory.join('<br>');
    });
  }

  return { init: () => setInterval(tick, 1800) };
})();

/* ─────────────────────────────────────────────────────────────────
   MODULE: Toggle Switches
───────────────────────────────────────────────────────────────── */
const Toggles = (() => ({
  init() {
    document.querySelectorAll('[data-toggle]').forEach(wrap => {
      wrap.addEventListener('click', () => wrap.classList.toggle('toggle-on'));
    });
  }
}))();

/* ─────────────────────────────────────────────────────────────────
   MODULE: Mobile Menu
───────────────────────────────────────────────────────────────── */
const MobileMenu = (() => ({
  init() {
    const btn  = document.getElementById('hamburger');
    const menu = document.getElementById('mobile-menu');
    btn?.addEventListener('click', () => menu?.classList.toggle('open'));
    menu?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => menu.classList.remove('open')));
  }
}))();

/* ─────────────────────────────────────────────────────────────────
   MODULE: Auth (Pilot Account System)
   localStorage-based persistence, structured for future Firestore migration.
   Keys: ns-pilots (user array), ns-session (callsign), ns-fleet-{callsign} (ships)
───────────────────────────────────────────────────────────────── */
const Auth = (() => {
  const PILOTS_KEY  = 'ns-pilots';
  const SESSION_KEY = 'ns-session';

  function _getPilots() {
    try { return JSON.parse(localStorage.getItem(PILOTS_KEY)) || []; }
    catch { return []; }
  }

  function _savePilots(pilots) {
    localStorage.setItem(PILOTS_KEY, JSON.stringify(pilots));
  }

  function _showError(msg) {
    const el = document.getElementById('auth-error');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 4000);
  }

  function _hashPass(plain) { return btoa(plain); }
  function _checkPass(plain, hashed) { return btoa(plain) === hashed; }

  function openModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.style.display = 'flex';
    showLogin();
  }

  function closeModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.style.display = 'none';
    const err = document.getElementById('auth-error');
    if (err) err.style.display = 'none';
  }

  function showLogin() {
    const login = document.getElementById('auth-login-view');
    const signup = document.getElementById('auth-signup-view');
    if (login) login.style.display = 'block';
    if (signup) signup.style.display = 'none';
  }

  function showSignup() {
    const login = document.getElementById('auth-login-view');
    const signup = document.getElementById('auth-signup-view');
    if (login) login.style.display = 'none';
    if (signup) signup.style.display = 'block';
  }

  function signup(e) {
    e.preventDefault();
    const callsign = document.getElementById('auth-signup-call')?.value.trim().toLowerCase();
    const email    = document.getElementById('auth-signup-email')?.value.trim().toLowerCase();
    const pass     = document.getElementById('auth-signup-pass')?.value;

    if (!callsign || !email || !pass) { _showError('All fields are required.'); return; }
    if (pass.length < 6) { _showError('Access code must be at least 6 characters.'); return; }

    const pilots = _getPilots();
    if (pilots.find(p => p.callsign === callsign)) {
      _showError('Callsign already registered.'); return;
    }
    if (pilots.find(p => p.email === email)) {
      _showError('Email already registered.'); return;
    }

    pilots.push({
      callsign,
      email,
      password: _hashPass(pass),
      created: new Date().toISOString()
    });
    _savePilots(pilots);

    // Initialize empty fleet
    localStorage.setItem('ns-fleet-' + callsign, JSON.stringify([]));

    // Auto-login
    localStorage.setItem(SESSION_KEY, callsign);
    closeModal();
    window.location.href = './fleet.html';
  }

  function login(e) {
    e.preventDefault();
    const callsign = document.getElementById('auth-login-call')?.value.trim().toLowerCase();
    const pass     = document.getElementById('auth-login-pass')?.value;

    if (!callsign || !pass) { _showError('All fields are required.'); return; }

    const pilots = _getPilots();
    const pilot  = pilots.find(p => p.callsign === callsign);
    if (!pilot) { _showError('Callsign not found.'); return; }
    if (!_checkPass(pass, pilot.password)) { _showError('Invalid access code.'); return; }

    localStorage.setItem(SESSION_KEY, callsign);
    closeModal();
    window.location.href = './fleet.html';
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    window.location.href = './index.html';
  }

  function isLoggedIn() {
    return !!localStorage.getItem(SESSION_KEY);
  }

  function getCurrentPilot() {
    return localStorage.getItem(SESSION_KEY);
  }

  function getFleet() {
    const callsign = getCurrentPilot();
    if (!callsign) return [];
    try { return JSON.parse(localStorage.getItem('ns-fleet-' + callsign)) || []; }
    catch { return []; }
  }

  function saveShip(config) {
    const callsign = getCurrentPilot();
    if (!callsign) return;
    const fleet = getFleet();
    if (!config.id) config.id = 'ship-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    config.modified = new Date().toISOString();
    const idx = fleet.findIndex(s => s.id === config.id);
    if (idx >= 0) fleet[idx] = config;
    else fleet.push(config);
    localStorage.setItem('ns-fleet-' + callsign, JSON.stringify(fleet));
  }

  function deleteShip(id) {
    const callsign = getCurrentPilot();
    if (!callsign) return;
    const fleet = getFleet().filter(s => s.id !== id);
    localStorage.setItem('ns-fleet-' + callsign, JSON.stringify(fleet));
  }

  function _updateNav() {
    if (!isLoggedIn()) return;
    const callsign = getCurrentPilot();
    // Update desktop CTA
    const desktopCta = document.querySelector('.nav-cta-d');
    if (desktopCta) {
      desktopCta.textContent = callsign.toUpperCase();
      desktopCta.href = './fleet.html';
    }
    // Update mobile CTA (last link in mobile menu)
    const mobileCta = document.querySelector('#mobile-menu .btn');
    if (mobileCta) {
      mobileCta.textContent = callsign.toUpperCase();
      mobileCta.href = './fleet.html';
    }
  }

  function init() {
    _updateNav();
    // If not logged in, make CTA buttons open the auth modal instead
    if (!isLoggedIn()) {
      const desktopCta = document.querySelector('.nav-cta-d');
      if (desktopCta) {
        desktopCta.addEventListener('click', (e) => {
          // Only intercept if it still points to contact
          if (desktopCta.href.includes('contact')) {
            e.preventDefault();
            openModal();
          }
        });
      }
    }
  }

  return { login, signup, logout, openModal, closeModal, showLogin, showSignup, isLoggedIn, getCurrentPilot, getFleet, saveShip, deleteShip, init };
})();

/* ─────────────────────────────────────────────────────────────────
   MODULE: FleetDash — NICE SPACESHIP™ Dashboard
───────────────────────────────────────────────────────────────── */
const FleetDash = (() => {

  // ── Blueprint Data ──────────────────────────────────────────
  const PROJ_BP = [
    { id:'restaurant', icon:'🍽️', name:'The Kitchen Crew', desc:'Full team for restaurants & food businesses',
      agents:[
        {name:'Front of House', role:'Customer Service', tasks:['Handle reservations and inquiries','Respond to online reviews','Send promotional messages to regulars']},
        {name:'Chef Planner',   role:'Scheduling',       tasks:['Plan weekly menus and specials','Track ingredient inventory','Schedule supplier deliveries']},
        {name:'Inventory Bot',  role:'Analytics',        tasks:['Monitor stock levels daily','Generate purchase orders when low','Alert on expiring items']},
        {name:'Marketing',      role:'Marketing',        tasks:['Post daily specials on social media','Design promotional flyers','Monitor competitor promotions']},
      ]},
    { id:'mechanic', icon:'🔧', name:'The Pit Crew', desc:'Agent team for auto repair & mechanic shops',
      agents:[
        {name:'Scheduler',      role:'Scheduling',       tasks:['Book and confirm appointments','Send reminders to customers','Manage the daily calendar']},
        {name:'Diagnostics',    role:'Research',         tasks:['Look up repair guides and TSBs','Pull vehicle service history','Estimate time and parts cost']},
        {name:'Parts Manager',  role:'Analytics',        tasks:['Track parts inventory levels','Order low-stock items automatically','Compare supplier prices']},
        {name:'Customer Comms', role:'Customer Service', tasks:['Update customers on repair status','Send invoices and receipts','Follow up after service completion']},
      ]},
    { id:'lawfirm', icon:'⚖️', name:'The Legal Team', desc:'Built for law firms & legal practices',
      agents:[
        {name:'Research',         role:'Research',             tasks:['Search case law and precedents','Summarize findings for attorneys','Flag new relevant rulings']},
        {name:'Document Manager', role:'Document Management',  tasks:['Draft contracts and briefs','Organize case filings','Track filing deadlines']},
        {name:'Calendar',         role:'Scheduling',           tasks:['Schedule hearings and depositions','Send deadline reminders','Manage court date calendar']},
        {name:'Client Manager',   role:'Customer Service',     tasks:['Respond to client status emails','Send case update summaries','Handle new client intake']},
        {name:'Billing',          role:'Finance',              tasks:['Track billable hours per matter','Generate invoices monthly','Follow up on overdue payments']},
      ]},
    { id:'marketing', icon:'📣', name:'The Growth Engine', desc:'Full-stack team for marketing agencies',
      agents:[
        {name:'Content Writer',    role:'Content',    tasks:['Write weekly blog posts','Draft social media captions','Create email newsletter copy']},
        {name:'SEO Agent',         role:'Research',   tasks:['Research target keywords','Analyze competitor content','Identify pages to optimize']},
        {name:'Analytics',         role:'Analytics',  tasks:['Track campaign KPIs weekly','Generate performance reports','Alert on traffic drops or spikes']},
        {name:'Social Media',      role:'Marketing',  tasks:['Schedule posts across platforms','Monitor brand mentions','Respond to comments and DMs']},
        {name:'Campaign Planner',  role:'Scheduling', tasks:['Plan monthly campaign calendar','Coordinate content deadlines','Track campaign budgets']},
      ]},
    { id:'ecommerce', icon:'🛒', name:'The Shop Floor', desc:'Agent team for e-commerce & online retail',
      agents:[
        {name:'Product Lister',    role:'Content',          tasks:['Write and update product descriptions','Manage product categories and tags','Optimize titles for search']},
        {name:'Customer Support',  role:'Customer Service', tasks:['Answer order status questions','Process return requests','Resolve complaints quickly']},
        {name:'Inventory',         role:'Analytics',        tasks:['Track stock levels in real time','Set automatic reorder alerts','Sync with supplier inventory']},
        {name:'Pricing Engine',    role:'Analytics',        tasks:['Monitor competitor pricing daily','Suggest price adjustments','Track profit margins by product']},
      ]},
  ];

  const AGENT_BP = [
    {icon:'🔭', name:'Research Navigator',   role:'Research',             desc:'Finds, analyzes, and summarizes information so you always have the intel you need.',    tasks:['Search for relevant information on a topic','Compile findings into a clear summary','Flag important updates or changes']},
    {icon:'✍️', name:'Content Broadcaster',  role:'Content',              desc:'Creates and schedules written content across all your channels.',                      tasks:['Write blog posts and articles','Draft social media posts','Edit and proofread existing content']},
    {icon:'📊', name:'Data Analyst',         role:'Analytics',            desc:'Tracks your key numbers and turns data into clear, actionable decisions.',             tasks:['Pull weekly performance reports','Monitor KPIs for changes','Generate insights and recommendations']},
    {icon:'💬', name:'Customer Comms',       role:'Customer Service',     desc:'Handles customer inquiries and keeps your clients informed and happy.',                tasks:['Respond to customer questions promptly','Escalate complex issues to humans','Send follow-up satisfaction messages']},
    {icon:'📅', name:'Mission Planner',      role:'Scheduling',           desc:'Keeps everything on schedule so nothing falls through the cracks.',                    tasks:['Manage calendars and track deadlines','Send reminders for upcoming tasks','Prioritize the team task queue']},
    {icon:'📄', name:'Document Scribe',      role:'Document Management',  desc:'Creates, organizes, and manages all your documents and files.',                        tasks:['Draft reports and business documents','Organize file structure and naming','Convert and export files as needed']},
    {icon:'💰', name:'Finance Officer',      role:'Finance',              desc:'Manages budgets, invoices, and financial tracking so you stay profitable.',             tasks:['Track expenses and income weekly','Generate monthly financial summaries','Send invoice reminders to clients']},
    {icon:'📢', name:'Marketing Agent',      role:'Marketing',            desc:'Plans and executes marketing campaigns to grow your audience and revenue.',             tasks:['Plan the monthly campaign calendar','Create promotional content and assets','Monitor ad performance and spend']},
  ];

  let agents = [];
  let llmCfg = null;
  let velData = [];
  let pendingTaskAgentId = null;

  // ── Init ────────────────────────────────────────────────────
  function init() {
    if (!Auth.isLoggedIn()) { window.location.href = './index.html'; return; }
    agents = Auth.getFleet() || [];
    llmCfg = _loadLLM();
    _setupHeader();
    _updateLLMStatus();
    _render();
    _setupEvents();
    _populateBlueprints();
    velData = Array(24).fill(0);
    _startLive();
    _log('SYS', 'NICE SPACESHIP™ v3.5 initialized');
    if (llmCfg) _log('LLM', `Engine: ${llmCfg.model} (${llmCfg.prov})`);
    if (agents.length) _log('FLEET', `${agents.length} agent${agents.length > 1 ? 's' : ''} online`);
  }

  // ── Header ──────────────────────────────────────────────────
  function _setupHeader() {
    const el = _id('pilot-ind');
    if (el) el.textContent = Auth.getCurrentPilot() || '—';
    const btn = _id('exit-btn');
    if (btn) btn.onclick = () => Auth.logout();
  }

  function _loadLLM() {
    try { return JSON.parse(localStorage.getItem('ns-llm') || 'null'); } catch (e) { return null; }
  }

  function _updateLLMStatus() {
    const dot = _id('llm-dot'), txt = _id('llm-ind-txt');
    if (!dot || !txt) return;
    if (llmCfg) { dot.className = 'dot dot-g'; txt.textContent = llmCfg.model; }
    else { dot.className = 'dot dot-r dot-pulse'; txt.textContent = 'No Engine'; }
  }

  // ── Render ──────────────────────────────────────────────────
  function _render() {
    const grid = _id('agent-grid'), empty = _id('atm-empty');
    if (!grid || !empty) return;
    if (!agents.length) {
      empty.style.display = 'flex'; grid.style.display = 'none';
    } else {
      empty.style.display = 'none'; grid.style.display = 'grid';
      grid.innerHTML = agents.map(_cardHtml).join('');
      requestAnimationFrame(() => {
        agents.forEach(a => {
          const fill = _id(`ar-${a.id}`);
          if (fill) { const c = 2 * Math.PI * 22; fill.style.strokeDashoffset = c - (a.progress / 100) * c; }
        });
      });
    }
    _updateStats();
  }

  function _cardHtml(a) {
    const sc = a.status === 'active' ? 'dot-g' : a.status === 'error' ? 'dot-r' : 'dot-a';
    const tasks = (a.tasks || []).slice(0, 4).map(t =>
      `<div class="task-row t-${t.status}"><span class="task-d"></span><span>${t.text}</span></div>`
    ).join('');
    const more = (a.tasks || []).length - 4;
    return `<div class="ac" data-aid="${a.id}">
      <div class="ac-hd">
        <div class="ac-id">
          <span class="dot ${sc}"></span>
          <div><div class="ac-name">${a.name}</div><div class="ac-role">${a.role}</div></div>
        </div>
        <div class="ac-acts">
          <button class="c-btn" data-add-task="${a.id}">+ Task</button>
          <button class="c-btn c-btn-del" data-del="${a.id}">✕</button>
        </div>
      </div>
      <div class="ac-body">
        <div class="ac-ring-wrap">
          <svg class="ac-ring-svg" viewBox="0 0 56 56">
            <circle class="ac-ring-bg" cx="28" cy="28" r="22"/>
            <circle class="ac-ring-fill" id="ar-${a.id}" cx="28" cy="28" r="22"/>
          </svg>
          <div class="ac-ring-center">${a.progress}%</div>
        </div>
        <div class="ac-stats">
          <div class="ac-stat"><div class="ac-stat-n">${a.tasksCompleted || 0}</div><div class="ac-stat-k">Done</div></div>
          <div class="ac-stat"><div class="ac-stat-n">${(a.tasks || []).filter(t => t.status === 'active').length}</div><div class="ac-stat-k">Active</div></div>
          <div class="ac-stat"><div class="ac-stat-n">${a.successRate || 100}%</div><div class="ac-stat-k">Rate</div></div>
        </div>
      </div>
      <div class="ac-tasks">
        ${tasks}
        ${more > 0 ? `<div class="task-more">+${more} more tasks</div>` : ''}
        ${a.desc ? `<div class="ac-desc">${a.desc}</div>` : ''}
        <button class="add-task-btn" data-add-task="${a.id}">+ Assign Task</button>
      </div>
    </div>`;
  }

  function _updateStats() {
    const all = agents.flatMap(a => a.tasks || []);
    const done = all.filter(t => t.status === 'done').length;
    const active = all.filter(t => t.status === 'active').length;
    const pending = all.filter(t => t.status === 'pending').length;
    const pct = all.length ? Math.round((done / all.length) * 100) : 0;
    _set('s-active', active); _set('s-done', done); _set('s-queue', pending);
    _set('m-ring-pct', pct + '%');
    const fill = _id('m-ring-fill');
    if (fill) { const c = 2 * Math.PI * 42; fill.style.strokeDasharray = c; fill.style.strokeDashoffset = c - (pct / 100) * c; }
  }

  // ── Events ──────────────────────────────────────────────────
  function _setupEvents() {
    ['btn-deploy', 'empty-deploy'].forEach(i => { const b = _id(i); if (b) b.onclick = () => _openM('m-deploy'); });
    ['btn-blueprints', 'empty-blueprints'].forEach(i => { const b = _id(i); if (b) b.onclick = () => _openM('m-blueprints'); });
    const lb = _id('btn-llm'); if (lb) lb.onclick = _openLLMModal;

    document.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => _closeM(b.dataset.close); });
    document.querySelectorAll('.m-ov').forEach(ov => { ov.onclick = e => { if (e.target === ov) _closeM(ov.id); }; });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.m-ov.open').forEach(m => m.classList.remove('open')); });

    const dc = _id('d-confirm'); if (dc) dc.onclick = _deployAgent;
    const lc = _id('llm-confirm'); if (lc) lc.onclick = _connectLLM;
    const ld = _id('llm-disc'); if (ld) ld.onclick = _disconnectLLM;

    document.querySelectorAll('.llm-opt').forEach(o => {
      o.onclick = () => { document.querySelectorAll('.llm-opt').forEach(x => x.classList.remove('sel')); o.classList.add('sel'); };
    });

    const tc = _id('task-confirm'); if (tc) tc.onclick = _addTask;

    document.querySelectorAll('.mtab').forEach(t => {
      t.onclick = () => {
        document.querySelectorAll('.mtab').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.m-tab-pane').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        const p = _id(t.dataset.tab); if (p) p.classList.add('active');
      };
    });

    document.querySelectorAll('.tbtn').forEach(b => {
      b.onclick = () => { document.querySelectorAll('.tbtn').forEach(x => x.classList.remove('active')); b.classList.add('active'); };
    });

    const grid = _id('agent-grid');
    if (grid) {
      grid.onclick = e => {
        const at = e.target.closest('[data-add-task]');
        const dl = e.target.closest('[data-del]');
        if (at) _openTaskModal(at.dataset.addTask);
        if (dl) _deleteAgent(dl.dataset.del);
      };
    }
  }

  // ── Agent Actions ────────────────────────────────────────────
  function _deployAgent() {
    const name = (_id('d-name')?.value || '').trim();
    if (!name) { _id('d-name')?.focus(); return; }
    const role = _id('d-role')?.value || 'Custom';
    const desc = (_id('d-desc')?.value || '').trim();
    const raw = (_id('d-tasks')?.value || '').trim();
    const tasks = raw ? raw.split('\n').filter(t => t.trim()).map((t, i) => ({
      id: `t${Date.now()}${i}`, text: t.trim(), status: i === 0 ? 'active' : 'pending'
    })) : [];
    agents.push({ id: `a${Date.now()}`, name, role, desc, status: tasks.length ? 'active' : 'idle',
      progress: 0, tasksCompleted: 0, successRate: 100, tasks, created: new Date().toISOString() });
    _save(); _closeM('m-deploy'); _render();
    _log(name.toUpperCase(), `Deployed · ${tasks.length} task${tasks.length !== 1 ? 's' : ''}`);
    ['d-name', 'd-desc', 'd-tasks'].forEach(i => { const e = _id(i); if (e) e.value = ''; });
  }

  function _deleteAgent(aid) {
    const a = agents.find(x => x.id === aid);
    agents = agents.filter(x => x.id !== aid);
    _save(); _render();
    if (a) _log(a.name.toUpperCase(), 'Agent removed from fleet');
  }

  function _openTaskModal(aid) {
    const a = agents.find(x => x.id === aid); if (!a) return;
    pendingTaskAgentId = aid;
    const n = _id('task-agent-nm'); if (n) n.textContent = a.name;
    _openM('m-task');
  }

  function _addTask() {
    const txt = (_id('task-txt')?.value || '').trim();
    if (!txt || !pendingTaskAgentId) return;
    const a = agents.find(x => x.id === pendingTaskAgentId); if (!a) return;
    a.tasks = a.tasks || [];
    a.tasks.push({ id: `t${Date.now()}`, text: txt, status: 'pending' });
    a.status = 'active';
    _save(); _closeM('m-task'); _render();
    _log(a.name.toUpperCase(), `Task: "${txt.slice(0, 36)}${txt.length > 36 ? '…' : ''}"`);
    const e = _id('task-txt'); if (e) e.value = '';
    pendingTaskAgentId = null;
  }

  // ── LLM ─────────────────────────────────────────────────────
  function _openLLMModal() {
    const ok = _id('llm-ok'), disc = _id('llm-disc');
    if (llmCfg) {
      if (ok) ok.style.display = 'flex'; if (disc) disc.style.display = '';
      document.querySelectorAll('.llm-opt').forEach(o => o.classList.toggle('sel', o.dataset.llm === llmCfg.model));
    } else {
      if (ok) ok.style.display = 'none'; if (disc) disc.style.display = 'none';
    }
    _openM('m-llm');
  }

  function _connectLLM() {
    const sel = document.querySelector('.llm-opt.sel');
    if (!sel) { alert('Please select an AI model.'); return; }
    const key = (_id('llm-key')?.value || '').trim();
    llmCfg = { model: sel.dataset.llm, prov: sel.dataset.prov, keyHint: key ? key.slice(0, 6) + '…' : 'none' };
    localStorage.setItem('ns-llm', JSON.stringify(llmCfg));
    _updateLLMStatus(); _closeM('m-llm');
    _log('LLM', `Connected: ${llmCfg.model} · ${llmCfg.prov}`);
  }

  function _disconnectLLM() {
    llmCfg = null; localStorage.removeItem('ns-llm');
    _updateLLMStatus(); _closeM('m-llm');
    _log('LLM', 'Engine disconnected');
  }

  // ── Blueprints ───────────────────────────────────────────────
  function _populateBlueprints() {
    const pg = _id('bp-proj-grid'), ag = _id('bp-agent-grid');
    if (pg) {
      pg.innerHTML = PROJ_BP.map(b =>
        `<div class="blueprint-tile">
          <span class="bp-ico">${b.icon}</span>
          <div class="bp-name">${b.name}</div>
          <div class="bp-desc">${b.desc}</div>
          <div class="bp-tags">${b.agents.map(a => `<span class="bp-tag">${a.name}</span>`).join('')}</div>
          <button class="btn btn-solid bp-deploy" data-pbp="${b.id}">Deploy Team</button>
        </div>`
      ).join('');
      pg.addEventListener('click', e => {
        const btn = e.target.closest('[data-pbp]');
        if (btn) { const bp = PROJ_BP.find(x => x.id === btn.dataset.pbp); if (bp) _deployProjBP(bp); }
      });
    }
    if (ag) {
      ag.innerHTML = AGENT_BP.map((b, i) =>
        `<div class="blueprint-tile">
          <span class="bp-ico">${b.icon}</span>
          <div class="bp-name">${b.name}</div>
          <div class="bp-desc">${b.desc}</div>
          <div class="bp-tags"><span class="bp-tag">${b.role}</span></div>
          <button class="btn btn-solid bp-deploy" data-abp="${i}">Add Agent</button>
        </div>`
      ).join('');
      ag.addEventListener('click', e => {
        const btn = e.target.closest('[data-abp]');
        if (btn) { const bp = AGENT_BP[+btn.dataset.abp]; if (bp) _deployAgentBP(bp); }
      });
    }
  }

  function _deployProjBP(bp) {
    bp.agents.forEach((a, i) => {
      agents.push({ id: `a${Date.now()}${i}`, name: a.name, role: a.role, desc: '', status: 'active',
        progress: 0, tasksCompleted: 0, successRate: 100,
        tasks: a.tasks.map((t, j) => ({ id: `t${Date.now()}${i}${j}`, text: t, status: j === 0 ? 'active' : 'pending' })),
        created: new Date().toISOString() });
    });
    _save(); _closeM('m-blueprints'); _render();
    _log('BLUEPRINT', `${bp.name} · ${bp.agents.length} agents deployed`);
  }

  function _deployAgentBP(bp) {
    agents.push({ id: `a${Date.now()}`, name: bp.name, role: bp.role, desc: bp.desc, status: 'active',
      progress: 0, tasksCompleted: 0, successRate: 100,
      tasks: bp.tasks.map((t, j) => ({ id: `t${Date.now()}${j}`, text: t, status: j === 0 ? 'active' : 'pending' })),
      created: new Date().toISOString() });
    _save(); _closeM('m-blueprints'); _render();
    _log('BLUEPRINT', `${bp.name} added to fleet`);
  }

  // ── Live Simulation ──────────────────────────────────────────
  function _startLive() {
    _drawVel();
    setInterval(() => {
      const active = agents.filter(a => a.status === 'active').length;
      velData.push(active ? Math.floor(Math.random() * 4 * active) + 1 : Math.floor(Math.random() * 2));
      if (velData.length > 24) velData.shift();
      _drawVel();

      if (agents.length && Math.random() > 0.65) {
        const aa = agents.filter(a => a.status === 'active');
        if (aa.length) {
          const a = aa[Math.floor(Math.random() * aa.length)];
          const act = (a.tasks || []).filter(t => t.status === 'active');
          const pend = (a.tasks || []).filter(t => t.status === 'pending');
          if (act.length && Math.random() > 0.5) {
            act[0].status = 'done';
            a.tasksCompleted = (a.tasksCompleted || 0) + 1;
            const done = (a.tasks || []).filter(t => t.status === 'done').length;
            a.progress = Math.min(100, Math.round(done / a.tasks.length * 100));
            _log(a.name.toUpperCase(), `✓ ${act[0].text.slice(0, 34)}${act[0].text.length > 34 ? '…' : ''}`);
            if (pend.length) { pend[0].status = 'active'; _log(a.name.toUpperCase(), `▶ ${pend[0].text.slice(0, 34)}${pend[0].text.length > 34 ? '…' : ''}`); }
            else { a.status = 'idle'; _log(a.name.toUpperCase(), 'All tasks complete'); }
            _save(); _render();
          } else if (!act.length && pend.length) {
            pend[0].status = 'active'; _save(); _render();
          }
        }
      }
    }, 4000);
  }

  function _drawVel() {
    const canvas = _id('vel-graph'); if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.offsetWidth || 232; canvas.width = w;
    const h = canvas.height, max = Math.max(...velData, 1);
    const cs = getComputedStyle(document.documentElement);
    const accent = cs.getPropertyValue('--accent').trim() || '#fff';
    const border = cs.getPropertyValue('--border').trim() || '#222';
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
    [1/3, 2/3].forEach(r => { ctx.beginPath(); ctx.moveTo(0, h * r); ctx.lineTo(w, h * r); ctx.stroke(); });
    ctx.setLineDash([]);
    const pts = velData.map((v, i) => [(i / (velData.length - 1)) * w, h - (v / max) * (h - 6) - 3]);
    ctx.beginPath();
    pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.stroke();
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
    ctx.fillStyle = accent + '1a'; ctx.fill();
  }

  // ── Log ──────────────────────────────────────────────────────
  function _log(src, msg) {
    const log = _id('atm-log'); if (!log) return;
    const now = new Date();
    const ts = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    const row = document.createElement('div');
    row.className = 'log-row';
    row.innerHTML = `<span class="log-ts">${ts}</span><span class="log-src">[${src}]</span><span class="log-msg">${msg}</span>`;
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
    while (log.children.length > 60) log.removeChild(log.firstChild);
  }

  // ── Modal Helpers ────────────────────────────────────────────
  function _openM(id) { const e = _id(id); if (e) e.classList.add('open'); }
  function _closeM(id) { const e = _id(id); if (e) e.classList.remove('open'); }

  // ── Utils ────────────────────────────────────────────────────
  function _save() {
    const cs = Auth.getCurrentPilot(); if (!cs) return;
    localStorage.setItem(`ns-fleet-${cs}`, JSON.stringify(agents));
  }
  const _id = i => document.getElementById(i);
  const _set = (i, v) => { const e = _id(i); if (e) e.textContent = v; };

  return { init };
})();

/* ─────────────────────────────────────────────────────────────────
   MODULE: Active Nav Link
───────────────────────────────────────────────────────────────── */
const NavActive = (() => ({
  init() {
    const page = location.pathname.split('/').pop().replace('.html','') || 'index';
    document.querySelectorAll('.nav-links a').forEach(a => {
      const href = a.getAttribute('href') || '';
      const name = href.split('/').pop().replace('.html','');
      if (name && name === page) a.classList.add('active');
    });
  }
}))();

/* ─────────────────────────────────────────────────────────────────
   INIT — runs on every page
───────────────────────────────────────────────────────────────── */
// ── NAV HUD DROPDOWN ────────────────────────────────────────────
const NavHUD = (() => {
  let _open = false;
  function toggle() {
    _open = !_open;
    document.querySelectorAll('.nav-hud-panel').forEach(p => p.classList.toggle('open', _open));
    document.querySelectorAll('.nav-hud-btn').forEach(b => b.classList.toggle('active', _open));
  }
  function init() {
    // Close panel when clicking outside
    document.addEventListener('click', e => {
      if (_open && !e.target.closest('.nav-hud-btn') && !e.target.closest('.nav-hud-panel')) {
        _open = false;
        document.querySelectorAll('.nav-hud-panel').forEach(p => p.classList.remove('open'));
        document.querySelectorAll('.nav-hud-btn').forEach(b => b.classList.remove('active'));
      }
    });
  }
  return { toggle, init };
})();

/* ─────────────────────────────────────────────────────────────────
   MODULE: AuthNav — Auth-Aware Navigation
   Updates marketing nav links based on Supabase/demo auth state.
───────────────────────────────────────────────────────────────── */
const AuthNav = (() => {
  async function init() {
    let isAuth = false;

    // Check Supabase session
    if (_sbApp) {
      try {
        const { data: { session } } = await _sbApp.auth.getSession();
        if (session) isAuth = true;
      } catch (e) { /* no session */ }
    }

    // Check demo session
    if (!isAuth && localStorage.getItem('ns-demo-session')) isAuth = true;

    if (!isAuth) return;

    // Update nav profile button to go to dashboard
    const profileBtn = document.querySelector('.nav-profile-btn');
    if (profileBtn) profileBtn.setAttribute('href', './dashboard.html');

    // Update mobile menu "Account" link to "Dashboard"
    const mobileLinks = document.querySelectorAll('#mobile-menu a');
    mobileLinks.forEach(a => {
      if (a.getAttribute('href') === './account.html') {
        a.setAttribute('href', './dashboard.html');
        a.textContent = 'Dashboard';
      }
    });

    // Show nav user block with display name
    const userBlock = document.getElementById('nav-user-block');
    const nameEl = document.getElementById('nav-username-display');
    if (userBlock && nameEl) {
      let name = 'Pilot';
      if (_sbApp) {
        try {
          const { data: { user } } = await _sbApp.auth.getUser();
          if (user) name = user.user_metadata?.display_name || user.email?.split('@')[0] || 'Pilot';
        } catch (e) { /* ignore */ }
      }
      const demo = localStorage.getItem('ns-demo-session');
      if (demo) {
        try { name = JSON.parse(demo).displayName || 'Pilot'; } catch(e) {}
      }
      nameEl.textContent = name;
      userBlock.style.display = '';
    }
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  Theme.init();
  Font.init();
  Telemetry.init();
  MobileMenu.init();
  NavActive.init();
  NavHUD.init();
  MissionControl.init();
  Toggles.init();
  Auth.init();
  AuthNav.init();
  if (document.getElementById('agent-grid')) FleetDash.init();
  if (document.getElementById('bp-lib-grid'))  { BP.init(); BPComm.init(); }

  if (document.getElementById('comms-tabs-bar') || document.getElementById('tab-contact')) Comms.init();
  if (document.getElementById('logs-filter-bar'))  Logs.init();
  if (document.getElementById('pricing-toggle'))   Pricing.init();
  if (document.getElementById('roi-step-1'))        ROI.init();
  if (document.getElementById('wz-step-1'))         WizardApp.init();
});

/* ─────────────────────────────────────────────────────────────────
   MODULE: Blueprint Library (BP)
───────────────────────────────────────────────────────────────── */
const BP = (() => {
  const FAV_KEY   = 'ns-bp-fav';
  const SAVED_KEY = 'ns-bp-saved';
  let _editingId  = null;
  let _activeTab  = 'spaceship';
  let _activeTag  = 'all';

  // ── Data ──────────────────────────────────────────────────────
  const AGENT_BPS = [
    { id:'bp-agent-001', icon:'icon-info',      name:'Ensign Template',       role:'Support · Basic',             tags:['support','basic','template'],    art:'ops',          rarity:'common',    card_num:'NS-001', agentType:'Support Specialist', flavor:'Standing by for orders.',                     caps:['Routine task handling','Basic reporting','Simple automations'],                                  stats:{spd:'3.0s',acc:'85%',cap:'1K',pwr:'40'},  desc:'Basic support agent. Handles routine tasks with reliable, straightforward execution.', tasks:['Execute routine task','Generate basic report','Run simple automation'] },
    { id:'bp-agent-002', icon:'icon-build',     name:'Lt. Template',          role:'Engineering · Multi-tool',    tags:['engineering','multi-tool','template'], art:'automation', rarity:'rare',      card_num:'NS-002', agentType:'Engineer',           flavor:'On it, Commander.',                           caps:['Code generation','Bug triage','CI/CD management'],                                               stats:{spd:'2.5s',acc:'92%',cap:'5K',pwr:'65'},  desc:'Competent engineering agent with multi-tool capability and solid performance.', tasks:['Generate code','Triage bugs','Manage CI/CD pipeline'] },
    { id:'bp-agent-003', icon:'icon-analytics', name:'Cmdr. Template',        role:'Analytics · Advanced',        tags:['analytics','advanced','template'], art:'analytics',    rarity:'epic',      card_num:'NS-003', agentType:'Senior Analyst',     flavor:'The data tells the story.',                   caps:['Statistical modeling','Pattern recognition','Predictive analytics'],                              stats:{spd:'2.0s',acc:'96%',cap:'10K',pwr:'82'}, desc:'Advanced analytics agent with deep reasoning and multi-domain expertise.', tasks:['Build statistical model','Recognize patterns','Run predictive analysis'] },
    { id:'bp-agent-004', icon:'icon-deploy',    name:'Capt. Template',        role:'Ops · Strategy',              tags:['leadership','strategy','template'], art:'intelligence', rarity:'legendary', card_num:'NS-004', agentType:'Commander',          flavor:'Engage.',                                     caps:['Strategic command','Cross-department coordination','Executive decision-making'],                   stats:{spd:'1.5s',acc:'99%',cap:'&#8734;',pwr:'95'}, desc:'Elite command agent. Strategic vision, cross-department authority, and unmatched decision-making.', tasks:['Set strategic direction','Coordinate departments','Execute key decisions'] },
    { id:'bp-agent-005', icon:'icon-search',    name:'Admiral Template',      role:'Research · Innovation',       tags:['mythic','transcendent','template'], art:'intelligence', rarity:'mythic',   card_num:'NS-005', agentType:'Fleet Admiral',      flavor:'Beyond the final frontier.',                  caps:['Autonomous strategic planning','Multi-agent orchestration','Self-evolving capabilities'],         stats:{spd:'0.5s',acc:'99%',cap:'&#8734;',pwr:'100'}, desc:'Transcendent agent. Pushes boundaries of what AI can achieve. Only the most dedicated commanders unlock this tier.', tasks:['Plan strategy autonomously','Orchestrate multi-agent ops','Self-evolve capabilities'] },
  ];

  const SPACESHIP_BPS = [
    { id:'ship-01', name:'Scout Runner',           category:'Support',      class_id:'class-1', tier:'free',  flavor:'Small but swift.',                       caps:['Single-agent ops','Basic automation','Quick deployments'],                                        stats:{crew:'1',slots:'2',tier:'FREE',cost:'$0'},    card_num:'NS-F01', tags:['scout','starter','template'],    desc:'A lightweight vessel for solo missions.' },
    { id:'ship-02', name:'Frigate Alpha',          category:'Ops',          class_id:'class-2', tier:'pro',   flavor:'Lean and capable.',                      caps:['3-agent team ops','Multi-channel comms','Moderate automation'],                                   stats:{crew:'3',slots:'3',tier:'PRO',cost:'$49'},    card_num:'NS-F02', tags:['frigate','team','template'],     desc:'A versatile vessel for small team operations.' },
    { id:'ship-03', name:'Cruiser Prime',          category:'Engineering',  class_id:'class-3', tier:'pro',   flavor:'Balanced firepower.',                     caps:['5-agent crew','Full engineering suite','Strategic operations'],                                   stats:{crew:'5',slots:'5',tier:'PRO',cost:'$149'},   card_num:'NS-F03', tags:['cruiser','balanced','template'], desc:'A well-rounded vessel for mid-scale operations.' },
    { id:'ship-04', name:'Dreadnought Omega',      category:'Ops',          class_id:'class-4', tier:'elite', flavor:'Overwhelming force.',                     caps:['8-agent ops','Enterprise automation','Full-spectrum command'],                                    stats:{crew:'8',slots:'8',tier:'ELITE',cost:'$349'}, card_num:'NS-F04', tags:['dreadnought','enterprise','template'], desc:'A heavy vessel for large-scale enterprise operations.' },
    { id:'ship-05', name:'Flagship Sovereign',     category:'Engineering',  class_id:'class-5', tier:'elite', flavor:'The pinnacle.',                           caps:['12-agent armada','Unlimited capacity','Every integration'],                                       stats:{crew:'12',slots:'12',tier:'ELITE',cost:'$799'}, card_num:'NS-F05', tags:['flagship','sovereign','template'], desc:'The ultimate vessel. Full enterprise command with every capability.' },
  ];

  // ── Ship Class Definitions ─────────────────────────────────────
  const _SHIP_CLASSES = {
    'class-1': { name:'Scout',       tier:'FREE',  slots:[{max:'Common',label:'Bridge'},{max:'Common',label:'Ops'}] },
    'class-2': { name:'Frigate',     tier:'PRO',   slots:[{max:'Epic',label:'Bridge'},{max:'Rare',label:'Comms'},{max:'Rare',label:'Ops'}] },
    'class-3': { name:'Cruiser',     tier:'PRO',   slots:[{max:'Epic',label:'Bridge'},{max:'Epic',label:'Comms'},{max:'Epic',label:'Tactical'},{max:'Rare',label:'Science'},{max:'Rare',label:'Engineering'}] },
    'class-4': { name:'Dreadnought', tier:'ELITE', slots:[{max:'Legendary',label:'Bridge'},{max:'Epic',label:'Comms'},{max:'Epic',label:'Tactical'},{max:'Epic',label:'Science'},{max:'Epic',label:'Engineering'},{max:'Rare',label:'Ops'},{max:'Rare',label:'Logistics'},{max:'Rare',label:'Support'}] },
    'class-5': { name:'Flagship',    tier:'ELITE', slots:[{max:'Mythic',label:'Bridge'},{max:'Legendary',label:'Command'},{max:'Epic',label:'Comms'},{max:'Epic',label:'Tactical'},{max:'Epic',label:'Science'},{max:'Epic',label:'Engineering'},{max:'Epic',label:'Analytics'},{max:'Epic',label:'Operations'},{max:'Rare',label:'Support'},{max:'Rare',label:'Logistics'},{max:'Rare',label:'Intel'},{max:'Rare',label:'Creative'}] }
  };
  const _SLOT_COLORS = { Common:'#94a3b8', Rare:'#6366f1', Epic:'#a855f7', Legendary:'#f59e0b', Mythic:'#ff2d55' };
  const _categoryColors = {
    Research:'#6366f1', Analytics:'#f59e0b', Content:'#ec4899', Engineering:'#06b6d4',
    Ops:'#22c55e', Sales:'#f97316', Support:'#8b5cf6', Legal:'#64748b',
    Marketing:'#e11d48', Automation:'#14b8a6', Hospitality:'#06b6d4', Professional:'#64748b',
    Retail:'#f97316'
  };
  const RARITY_COLORS = { Common:'#94a3b8', Rare:'#6366f1', Epic:'#a855f7', Legendary:'#f59e0b', Mythic:'#ff2d55' };
  const _NS_LOGO_BTN = '<svg viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg" style="width:10px;height:10px;display:block" fill="currentColor"><path d="M962.08,762.91c-3.6,3.81-23,22.39-23.4,25.12s1.65,9.46,1.81,12.8c6.2,134.27-22.47,251.36-96.57,363.41-10.14,15.32-44.07,64.4-57.7,72.3-10.64,6.16-17.08,4.1-26.74-2.68l-205.91-206.08-2.61-1.47c-13.79,3.14-27.33,7.97-41.2,10.78-12.14,2.46-39.23,7.32-50.52,5.02-5.43-1.11-8.8-8.83-13.02-7.63-56.83,48.42-130.21,76.33-203.49,88.59-23.32,3.9-79.67,11.72-100.43,4.99-28.92-9.37-32.15-31.74-31.74-58.17,1.36-87.99,28.47-185.28,80.14-256.85,2.24-3.1,15.39-18.18,15.71-19.38.7-2.69-7.89-8.08-8.8-14.88-1.33-9.98,3.07-34.86,5.18-45.64,2.91-14.86,7.64-29.47,11.6-44.06L6.97,481.35c-6.58-10.16-9.77-14.46-3.86-25.92,4.89-9.48,28.96-27.24,38.49-34.51,113.03-86.2,243.65-127.64,386.44-121.64,5.01.21,23.34,2.94,26.44,1.52,117.49-117.68,260.78-215.29,420.81-265.18,95.99-29.93,217.05-45.19,316.54-29.13,13.03,2.1,32.43,2.67,37.16,16.84,5.97,17.89,9.64,56.02,10.55,75.45,12,255.12-107.2,483.74-277.46,664.12ZM842.3,261.63c-101.28,8.13-152.88,125.4-90.22,205.62,56.08,71.8,169.37,61.28,211.94-18.9,46.73-88.01-22.45-194.69-121.72-186.72ZM276.84,862.98c-1.02-.92-3.11-5.35-5.37-4.22-.87.43-8.43,11.31-9.79,13.25-32.97,47.21-49,105.67-56.19,162.31,1.77,1.77,42.17-6.13,48.04-7.46,31.2-7.03,64.74-18.77,92.63-34.37,4.52-2.53,34.5-21.3,35.27-23.8.34-1.12-.09-2.12-.89-2.92-35.52-32.96-67.86-70.35-103.71-102.79Z"/></svg>';

  // ── Helpers ──────────────────────────────────────────────────
  function _getFavs()  { return new Set(JSON.parse(localStorage.getItem(FAV_KEY)  || '[]')); }
  function _saveFavs(s){ localStorage.setItem(FAV_KEY, JSON.stringify([...s])); }
  function _getSaved() { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); }
  function _saveSaved(a){ localStorage.setItem(SAVED_KEY, JSON.stringify(a)); }
  function _getCustom(id){ try{ return JSON.parse(localStorage.getItem('ns-bp-custom-'+id))||null; }catch(e){ return null; } }
  function _saveCustom(id, obj){ localStorage.setItem('ns-bp-custom-'+id, JSON.stringify(obj)); }
  function _toast(msg){ const t=document.getElementById('bp-toast'); if(!t)return; t.textContent=msg; t.style.display='block'; setTimeout(()=>t.style.display='none', 2200); }
  function _esc(s){ const d=document.createElement('div'); d.textContent=s||''; return d.innerHTML; }

  // ── Supabase DB sync ──────────────────────────────────────────
  async function _getUser() {
    if (!_sbApp) return null;
    const { data: { session } } = await _sbApp.auth.getSession();
    return session?.user || null;
  }
  async function _syncFromDB() {
    const user = await _getUser();
    if (!user) return;
    // Favorites
    const { data: favRows } = await _sbApp.from('blueprint_favorites').select('blueprint_id').eq('user_id', user.id);
    if (favRows?.length) {
      const favSet = new Set(favRows.map(r => r.blueprint_id));
      _saveFavs(favSet);
    }
    // Saves
    const { data: saveRows } = await _sbApp.from('blueprint_saves').select('blueprint_id, custom_edits').eq('user_id', user.id);
    if (saveRows?.length) {
      _saveSaved(saveRows.map(r => r.blueprint_id));
      saveRows.forEach(r => { if (r.custom_edits && Object.keys(r.custom_edits).length) _saveCustom(r.blueprint_id, r.custom_edits); });
    }
  }
  async function _persistFav(id, isFav) {
    const user = await _getUser();
    if (!user || !_sbApp) return;
    if (isFav) {
      await _sbApp.from('blueprint_favorites').upsert({ user_id: user.id, blueprint_id: id });
    } else {
      await _sbApp.from('blueprint_favorites').delete().eq('user_id', user.id).eq('blueprint_id', id);
    }
  }
  async function _persistSave(id, edits) {
    const user = await _getUser();
    if (!user || !_sbApp) return;
    await _sbApp.from('blueprint_saves').upsert({ user_id: user.id, blueprint_id: id, custom_edits: edits || {} });
  }

  function _icon(name) {
    return `<svg class="icon icon-lg" aria-hidden="true" style="fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round;"><use href="#${name}"/></svg>`;
  }

  // ── Deterministic 10-char alphanumeric serial — unique fingerprint per blueprint ──
  const _SERIAL_CHARS = 'A0B1C2D3E4F5G6H7J8K9LMNPQRSTUVWXYZ';
  function _serialHash(str, len) {
    len = len || 10;
    let h = 0;
    for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    const chars = [];
    const speeds = [];
    let n = Math.abs(h);
    for (let i = 0; i < len; i++) {
      n = ((n * 9301 + 49297) % 233280);
      const idx = n % _SERIAL_CHARS.length;
      chars.push(_SERIAL_CHARS[idx]);
      const ch = _SERIAL_CHARS[idx];
      speeds.push(ch >= '0' && ch <= '9' ? +ch : (ch.charCodeAt(0) - 65) % 10);
    }
    return { code: chars.join(''), speeds };
  }

  // ── Avatar Art (agent cards — category-colored initials + orbiting dots) ──
  function _avatarArt(name, category, serial) {
    const color = _categoryColors[category] || '#6366f1';
    const initials = (name || 'AG').split(/\\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    if (!serial) serial = _serialHash(name);

    const dotColors = ['#f43f5e','#f97316','#eab308','#22c55e','#14b8a6','#06b6d4','#3b82f6','#6366f1','#a855f7','#ec4899'];

    let dots = '';
    for (let i = 0; i < 10; i++) {
      const spd = serial.speeds[i];
      const dur = 24 - (spd * 2);
      const startAngle = i * 36;
      const r = 1.5 + (spd * 0.15);
      const dc = dotColors[i];
      dots += `<circle cx="100" cy="20" r="${r + 2}" fill="${dc}" opacity="0.2"><animateTransform attributeName="transform" type="rotate" from="${startAngle} 100 60" to="${startAngle + 360} 100 60" dur="${dur}s" repeatCount="indefinite"/></circle>`;
      dots += `<circle cx="100" cy="20" r="${r}" fill="${dc}" opacity="0.85"><animateTransform attributeName="transform" type="rotate" from="${startAngle} 100 60" to="${startAngle + 360} 100 60" dur="${dur}s" repeatCount="indefinite"/></circle>`;
    }

    return `<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
      <line x1="0" y1="30" x2="200" y2="30" stroke="${color}" stroke-width="0.5" opacity="0.08"/>
      <line x1="0" y1="60" x2="200" y2="60" stroke="${color}" stroke-width="0.5" opacity="0.08"/>
      <line x1="0" y1="90" x2="200" y2="90" stroke="${color}" stroke-width="0.5" opacity="0.08"/>
      <line x1="50" y1="0" x2="50" y2="120" stroke="${color}" stroke-width="0.5" opacity="0.08"/>
      <line x1="100" y1="0" x2="100" y2="120" stroke="${color}" stroke-width="0.5" opacity="0.08"/>
      <line x1="150" y1="0" x2="150" y2="120" stroke="${color}" stroke-width="0.5" opacity="0.08"/>
      <circle cx="100" cy="60" r="40" fill="none" stroke="${color}" stroke-width="3" opacity="0.18"/>
      ${dots}
      <circle cx="100" cy="60" r="32" fill="${color}" opacity="0.9"/>
      <text x="100" y="60" text-anchor="middle" dominant-baseline="central" fill="#fff" font-family="var(--font-h, Inter, sans-serif)" font-size="24" font-weight="700" letter-spacing="1">${initials}</text>
    </svg>`;
  }

  /* ── Slot Diagram Art (static slots + neural network dot animation) ── */
  function _slotDiagramArt(classId, serial) {
    const cls = _SHIP_CLASSES[classId] || _SHIP_CLASSES['class-1'];
    const slots = cls.slots;
    const n = slots.length;
    if (!serial) serial = _serialHash(classId, 12);

    const cx = 100, cy = 60;

    // Fixed slot positions per layout
    const positions = n === 2
      ? [{x:72,y:60},{x:128,y:60}]
      : n === 3
      ? [{x:100,y:30},{x:60,y:80},{x:140,y:80}]
      : n === 5
      ? [{x:100,y:20},{x:50,y:50},{x:150,y:50},{x:65,y:95},{x:135,y:95}]
      : n === 8
      ? [{x:100,y:15},{x:155,y:30},{x:175,y:65},{x:155,y:95},{x:100,y:108},{x:45,y:95},{x:25,y:65},{x:45,y:30}]
      : n === 12
      ? [{x:100,y:10},{x:140,y:15},{x:170,y:35},{x:180,y:65},{x:170,y:90},{x:140,y:108},{x:100,y:113},{x:60,y:108},{x:30,y:90},{x:20,y:65},{x:30,y:35},{x:60,y:15}]
      : [{x:55,y:35},{x:100,y:35},{x:145,y:35},{x:55,y:85},{x:100,y:85},{x:145,y:85}];

    // Neural network connections between slot pairs
    const conns = n === 2 ? [[0,1]]
      : n === 3 ? [[0,1],[1,2],[0,2]]
      : n === 5 ? [[0,1],[0,2],[1,3],[2,4],[3,4],[1,2]]
      : n === 8 ? [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,0],[0,4],[2,6]]
      : n === 12 ? [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],[10,11],[11,0],[0,6],[3,9]]
      : [[0,1],[1,2],[3,4],[4,5],[0,3],[2,5],[1,4]];

    const dotColors = ['#f43f5e','#f97316','#eab308','#22c55e','#14b8a6','#06b6d4',
                       '#3b82f6','#6366f1','#a855f7','#ec4899','#84cc16','#fb923c'];
    const localOrbitR = 18;

    // ── Background grid ──
    let svg = `<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
      <line x1="10" y1="20" x2="190" y2="20" stroke="#3b82f6" stroke-width="0.5" opacity="0.1"/>
      <line x1="10" y1="40" x2="190" y2="40" stroke="#3b82f6" stroke-width="0.5" opacity="0.1"/>
      <line x1="10" y1="60" x2="190" y2="60" stroke="#3b82f6" stroke-width="0.5" opacity="0.1"/>
      <line x1="10" y1="80" x2="190" y2="80" stroke="#3b82f6" stroke-width="0.5" opacity="0.1"/>
      <line x1="10" y1="100" x2="190" y2="100" stroke="#3b82f6" stroke-width="0.5" opacity="0.1"/>
      <line x1="30" y1="5" x2="30" y2="115" stroke="#3b82f6" stroke-width="0.5" opacity="0.1"/>
      <line x1="60" y1="5" x2="60" y2="115" stroke="#3b82f6" stroke-width="0.5" opacity="0.1"/>
      <line x1="90" y1="5" x2="90" y2="115" stroke="#3b82f6" stroke-width="0.5" opacity="0.1"/>
      <line x1="120" y1="5" x2="120" y2="115" stroke="#3b82f6" stroke-width="0.5" opacity="0.1"/>
      <line x1="150" y1="5" x2="150" y2="115" stroke="#3b82f6" stroke-width="0.5" opacity="0.1"/>
      <line x1="180" y1="5" x2="180" y2="115" stroke="#3b82f6" stroke-width="0.5" opacity="0.1"/>`;

    // ── Center hub ──
    svg += `<circle cx="${cx}" cy="${cy}" r="5" fill="#3b82f6" opacity="0.3"/>`;

    // ── Neural network connection lines (slot-to-slot) ──
    conns.forEach(pair => {
      const a = positions[pair[0]], b = positions[pair[1]];
      svg += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#3b82f6" stroke-width="0.6" opacity="0.1"/>`;
    });

    // ── Spoke lines (hub to each slot) ──
    positions.forEach(p => {
      svg += `<line x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}" stroke="#3b82f6" stroke-width="0.8" opacity="0.12"/>`;
    });

    // ── Static slot circles ──
    slots.forEach((slot, i) => {
      const p = positions[i];
      const color = _SLOT_COLORS[slot.max] || '#6366f1';
      const r = 14;
      svg += `<circle cx="${p.x}" cy="${p.y}" r="${r + 3}" fill="${color}" opacity="0.12"/>`;
      svg += `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="5,3" opacity="0.7"/>`;
      svg += `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${color}" opacity="0.06"/>`;
      svg += `<text x="${p.x}" y="${p.y}" text-anchor="middle" dominant-baseline="central" fill="${color}" font-size="12" font-weight="300" opacity="0.6">+</text>`;
    });

    // ── Local orbit dots (one per slot) ──
    slots.forEach((slot, i) => {
      const p = positions[i];
      const spd = serial.speeds[i] || 0;
      const dur = 20 - (spd * 1.5);
      const dotR = 1.5 + (spd * 0.12);
      const dc = dotColors[i % dotColors.length];
      svg += `<circle cx="${p.x + localOrbitR}" cy="${p.y}" r="${dotR + 1.5}" fill="${dc}" opacity="0.2"><animateTransform attributeName="transform" type="rotate" from="0 ${p.x} ${p.y}" to="360 ${p.x} ${p.y}" dur="${dur}s" repeatCount="indefinite"/></circle>`;
      svg += `<circle cx="${p.x + localOrbitR}" cy="${p.y}" r="${dotR}" fill="${dc}" opacity="0.85"><animateTransform attributeName="transform" type="rotate" from="0 ${p.x} ${p.y}" to="360 ${p.x} ${p.y}" dur="${dur}s" repeatCount="indefinite"/></circle>`;
    });

    // ── Traveling dots between connections (neural data flow) ──
    const travelSpeeds = serial.speeds.slice(n);
    conns.forEach((pair, ci) => {
      const a = positions[pair[0]], b = positions[pair[1]];
      const spd = travelSpeeds[ci % travelSpeeds.length] || 3;
      const dur = 6 + (9 - spd) * 1.2;
      const dotR = 1.2 + (spd * 0.08);
      const dc = dotColors[(ci + n) % dotColors.length];
      const delay = ((ci * 0.7) % dur).toFixed(1);
      svg += `<circle r="${dotR + 1}" fill="${dc}" opacity="0.2"><animate attributeName="cx" values="${a.x};${b.x};${a.x}" dur="${dur}s" begin="${delay}s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1"/><animate attributeName="cy" values="${a.y};${b.y};${a.y}" dur="${dur}s" begin="${delay}s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1"/></circle>`;
      svg += `<circle r="${dotR}" fill="${dc}" opacity="0.7"><animate attributeName="cx" values="${a.x};${b.x};${a.x}" dur="${dur}s" begin="${delay}s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1"/><animate attributeName="cy" values="${a.y};${b.y};${a.y}" dur="${dur}s" begin="${delay}s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1"/></circle>`;
    });

    svg += '</svg>';
    return svg;
  }

  // ── Render ────────────────────────────────────────────────────
  // ── TCG Art Illustrations (legacy abstract art - kept as fallback) ──
  function _tcgArt(t) {
    const arts = {
      automation: `<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
        <line x1="20" y1="60" x2="78" y2="60" stroke="currentColor" stroke-width="1" opacity="0.2"/>
        <line x1="78" y1="60" x2="78" y2="28" stroke="currentColor" stroke-width="1" opacity="0.2"/>
        <line x1="78" y1="28" x2="138" y2="28" stroke="currentColor" stroke-width="1" opacity="0.2"/>
        <line x1="122" y1="60" x2="180" y2="60" stroke="currentColor" stroke-width="1" opacity="0.2"/>
        <line x1="122" y1="60" x2="122" y2="92" stroke="currentColor" stroke-width="1" opacity="0.2"/>
        <line x1="122" y1="92" x2="62" y2="92" stroke="currentColor" stroke-width="1" opacity="0.2"/>
        <circle cx="78" cy="60" r="4" fill="var(--accent)" opacity="0.7"/>
        <circle cx="78" cy="28" r="3" fill="var(--accent)" opacity="0.55"/>
        <circle cx="138" cy="28" r="4" fill="var(--accent)" opacity="0.7"/>
        <circle cx="122" cy="60" r="4" fill="var(--accent)" opacity="0.7"/>
        <circle cx="122" cy="92" r="3" fill="var(--accent)" opacity="0.55"/>
        <circle cx="62" cy="92" r="4" fill="var(--accent)" opacity="0.7"/>
        <circle cx="100" cy="60" r="18" fill="none" stroke="var(--accent)" stroke-width="1.5" opacity="0.8"/>
        <circle cx="100" cy="60" r="10" fill="var(--accent)" opacity="0.12"/>
        <circle cx="100" cy="60" r="5" fill="var(--accent)"/>
        <line x1="100" y1="40" x2="100" y2="44" stroke="var(--accent)" stroke-width="2"/>
        <line x1="100" y1="76" x2="100" y2="80" stroke="var(--accent)" stroke-width="2"/>
        <line x1="80" y1="60" x2="84" y2="60" stroke="var(--accent)" stroke-width="2"/>
        <line x1="116" y1="60" x2="120" y2="60" stroke="var(--accent)" stroke-width="2"/>
      </svg>`,
      intelligence: `<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
        <line x1="28" y1="28" x2="88" y2="48" stroke="currentColor" stroke-width="0.8" opacity="0.2"/>
        <line x1="28" y1="60" x2="88" y2="48" stroke="currentColor" stroke-width="0.8" opacity="0.2"/>
        <line x1="28" y1="60" x2="88" y2="72" stroke="currentColor" stroke-width="0.8" opacity="0.2"/>
        <line x1="28" y1="92" x2="88" y2="72" stroke="currentColor" stroke-width="0.8" opacity="0.2"/>
        <line x1="88" y1="48" x2="148" y2="36" stroke="currentColor" stroke-width="0.8" opacity="0.2"/>
        <line x1="88" y1="48" x2="148" y2="72" stroke="currentColor" stroke-width="0.8" opacity="0.2"/>
        <line x1="88" y1="72" x2="148" y2="36" stroke="currentColor" stroke-width="0.8" opacity="0.2"/>
        <line x1="88" y1="72" x2="148" y2="72" stroke="currentColor" stroke-width="0.8" opacity="0.2"/>
        <line x1="88" y1="72" x2="148" y2="92" stroke="currentColor" stroke-width="0.8" opacity="0.2"/>
        <line x1="148" y1="36" x2="182" y2="60" stroke="currentColor" stroke-width="0.8" opacity="0.2"/>
        <line x1="148" y1="72" x2="182" y2="60" stroke="currentColor" stroke-width="0.8" opacity="0.2"/>
        <line x1="148" y1="92" x2="182" y2="60" stroke="currentColor" stroke-width="0.8" opacity="0.2"/>
        <circle cx="28" cy="28" r="4" fill="var(--accent)" opacity="0.5"/>
        <circle cx="28" cy="60" r="5" fill="var(--accent)" opacity="0.7"/>
        <circle cx="28" cy="92" r="4" fill="var(--accent)" opacity="0.5"/>
        <circle cx="88" cy="48" r="7" fill="var(--accent)" opacity="0.85"/>
        <circle cx="88" cy="72" r="7" fill="var(--accent)"/>
        <circle cx="148" cy="36" r="5" fill="var(--accent)" opacity="0.65"/>
        <circle cx="148" cy="72" r="6" fill="var(--accent)" opacity="0.9"/>
        <circle cx="148" cy="92" r="5" fill="var(--accent)" opacity="0.65"/>
        <circle cx="182" cy="60" r="9" fill="var(--accent)" opacity="0.95"/>
      </svg>`,
      analytics: `<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
        <line x1="24" y1="100" x2="188" y2="100" stroke="currentColor" stroke-width="1" opacity="0.25"/>
        <line x1="24" y1="100" x2="24" y2="14" stroke="currentColor" stroke-width="1" opacity="0.25"/>
        <rect x="36"  y="70" width="20" height="30" fill="var(--accent)" opacity="0.35"/>
        <rect x="66"  y="50" width="20" height="50" fill="var(--accent)" opacity="0.55"/>
        <rect x="96"  y="30" width="20" height="70" fill="var(--accent)" opacity="0.8"/>
        <rect x="126" y="44" width="20" height="56" fill="var(--accent)" opacity="0.6"/>
        <rect x="156" y="58" width="20" height="42" fill="var(--accent)" opacity="0.4"/>
        <polyline points="46,68 76,48 106,28 136,42 166,56" fill="none" stroke="var(--accent)" stroke-width="1.5"/>
        <circle cx="46"  cy="68" r="3" fill="var(--accent)"/>
        <circle cx="76"  cy="48" r="3" fill="var(--accent)"/>
        <circle cx="106" cy="28" r="4" fill="var(--accent)"/>
        <circle cx="136" cy="42" r="3" fill="var(--accent)"/>
        <circle cx="166" cy="56" r="3" fill="var(--accent)"/>
      </svg>`,
      ops: `<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
        <line x1="20" y1="30" x2="180" y2="30" stroke="currentColor" stroke-width="0.5" opacity="0.12"/>
        <line x1="20" y1="60" x2="180" y2="60" stroke="currentColor" stroke-width="0.5" opacity="0.12"/>
        <line x1="20" y1="90" x2="180" y2="90" stroke="currentColor" stroke-width="0.5" opacity="0.12"/>
        <line x1="50"  y1="10" x2="50"  y2="110" stroke="currentColor" stroke-width="0.5" opacity="0.12"/>
        <line x1="100" y1="10" x2="100" y2="110" stroke="currentColor" stroke-width="0.5" opacity="0.12"/>
        <line x1="150" y1="10" x2="150" y2="110" stroke="currentColor" stroke-width="0.5" opacity="0.12"/>
        <rect x="24"  y="44" width="40" height="26" rx="2" fill="none" stroke="var(--accent)" stroke-width="1.5" opacity="0.7"/>
        <rect x="80"  y="44" width="40" height="26" rx="2" fill="var(--accent)" opacity="0.12" stroke="var(--accent)" stroke-width="1.5"/>
        <rect x="136" y="44" width="40" height="26" rx="2" fill="none" stroke="var(--accent)" stroke-width="1.5" opacity="0.7"/>
        <line x1="64" y1="57" x2="77" y2="57" stroke="var(--accent)" stroke-width="1.5"/>
        <polygon points="77,53 77,61 83,57" fill="var(--accent)"/>
        <line x1="120" y1="57" x2="133" y2="57" stroke="var(--accent)" stroke-width="1.5"/>
        <polygon points="133,53 133,61 139,57" fill="var(--accent)"/>
        <circle cx="44"  cy="57" r="4" fill="var(--accent)" opacity="0.6"/>
        <circle cx="100" cy="57" r="5" fill="var(--accent)"/>
        <circle cx="156" cy="57" r="4" fill="var(--accent)" opacity="0.6"/>
        <rect x="88" y="20" width="24" height="14" rx="1" fill="var(--accent)" opacity="0.25"/>
        <rect x="88" y="86" width="24" height="14" rx="1" fill="var(--accent)" opacity="0.18"/>
        <line x1="100" y1="34" x2="100" y2="44" stroke="var(--accent)" stroke-width="1" stroke-dasharray="2,2" opacity="0.55"/>
        <line x1="100" y1="70" x2="100" y2="86" stroke="var(--accent)" stroke-width="1" stroke-dasharray="2,2" opacity="0.55"/>
      </svg>`,
      spaceship: `<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
        <line x1="100" y1="44" x2="100" y2="23" stroke="var(--accent)" stroke-width="1.5" opacity="0.65"/>
        <line x1="100" y1="76" x2="100" y2="97" stroke="var(--accent)" stroke-width="1.5" opacity="0.65"/>
        <line x1="84"  y1="60" x2="54"  y2="40" stroke="var(--accent)" stroke-width="1.5" opacity="0.65"/>
        <line x1="84"  y1="60" x2="54"  y2="80" stroke="var(--accent)" stroke-width="1.5" opacity="0.65"/>
        <line x1="116" y1="60" x2="146" y2="40" stroke="var(--accent)" stroke-width="1.5" opacity="0.65"/>
        <line x1="116" y1="60" x2="146" y2="80" stroke="var(--accent)" stroke-width="1.5" opacity="0.65"/>
        <rect x="84" y="44" width="32" height="32" rx="2" fill="var(--accent)" opacity="0.15" stroke="var(--accent)" stroke-width="2"/>
        <circle cx="100" cy="60" r="9" fill="var(--accent)"/>
        <rect x="86"  y="11" width="28" height="16" rx="2" fill="none" stroke="var(--accent)" stroke-width="1.5" opacity="0.75"/>
        <rect x="86"  y="93" width="28" height="16" rx="2" fill="none" stroke="var(--accent)" stroke-width="1.5" opacity="0.75"/>
        <rect x="30"  y="30" width="28" height="16" rx="2" fill="none" stroke="var(--accent)" stroke-width="1.5" opacity="0.75"/>
        <rect x="30"  y="74" width="28" height="16" rx="2" fill="none" stroke="var(--accent)" stroke-width="1.5" opacity="0.75"/>
        <rect x="142" y="30" width="28" height="16" rx="2" fill="none" stroke="var(--accent)" stroke-width="1.5" opacity="0.75"/>
        <rect x="142" y="74" width="28" height="16" rx="2" fill="none" stroke="var(--accent)" stroke-width="1.5" opacity="0.75"/>
        <circle cx="100" cy="19" r="3" fill="var(--accent)" opacity="0.7"/>
        <circle cx="100" cy="101" r="3" fill="var(--accent)" opacity="0.7"/>
        <circle cx="44"  cy="38" r="3" fill="var(--accent)" opacity="0.7"/>
        <circle cx="44"  cy="82" r="3" fill="var(--accent)" opacity="0.7"/>
        <circle cx="156" cy="38" r="3" fill="var(--accent)" opacity="0.7"/>
        <circle cx="156" cy="82" r="3" fill="var(--accent)" opacity="0.7"/>
      </svg>`
    };
    return arts[t] || arts.automation;
  }

  // ── TCG Card Render ────────────────────────────────────────────────────
  function _tcgCardHTML(bp, type) {
    const favs   = _getFavs();
    const custom = _getCustom(bp.id);
    const data   = custom ? {...bp, ...custom} : bp;
    const isFav  = favs.has(bp.id);
    const caps   = data.caps || [];

    if (type === 'spaceship') {
      // ── Spaceship Blueprint Card ──
      const cls = _SHIP_CLASSES[data.class_id] || _SHIP_CLASSES['class-1'];
      const classLabel = cls.name.toUpperCase();
      const tierBadge = cls.tier;
      const shipTierColors = { free:'#22c55e', lite:'#22c55e', pro:'#6366f1', elite:'#f59e0b' };
      const shipColor = shipTierColors[data.tier || 'free'] || '#22c55e';
      const statKeys = ['crew','slots','tier','cost'];
      const statLbls = ['CREW','SLOTS','TIER','COST'];
      const statVals = statKeys.map(k => data.stats?.[k] || '&#8212;');
      const serial = _serialHash(bp.id || data.name, 12);
      return `<div class="blueprint-card blueprint-clickable" data-id="${bp.id}" data-type="spaceship" data-tags="${(data.tags||[]).join(',')}" data-category="${_esc(data.category||'')}" data-rarity="${data.rarity||'common'}">
        <div class="blueprint-card-name-bar"><span class="blueprint-card-name">${_esc(data.name)}</span></div>
        <div class="blueprint-card-art">
          <div class="blueprint-card-art-serial" title="Serial: ${serial.code}"><span class="blueprint-card-serial-code">${serial.code}</span></div>
          <div class="blueprint-card-art-class"><span class="blueprint-card-serial-code" style="color:${shipColor};border:1px solid ${shipColor}">${tierBadge}</span></div>
          <div class="blueprint-card-art-bottom-right"><span class="blueprint-card-serial-code" style="color:${shipColor}">${classLabel}</span></div>
          ${_slotDiagramArt(data.class_id, serial)}
        </div>
        <div class="blueprint-card-type-line">SPACESHIP BLUEPRINT &bull; ${tierBadge} &bull; NICE SPACESHIP&trade; v3.5</div>
        <div class="blueprint-card-text-box">
          <p class="blueprint-card-flavor">"${_esc(data.flavor || data.desc)}"</p>
          ${caps.slice(0,3).map(c => `<p class="blueprint-card-cap">${_esc(c)}</p>`).join('')}
        </div>
        <div class="blueprint-card-stats">${statLbls.map((l,i) => `<div class="blueprint-card-stat"><span class="blueprint-card-stat-val">${statVals[i]}</span><span class="blueprint-card-stat-lbl">${l}</span></div>`).join('')}</div>
        <div class="blueprint-card-footer"><span>${data.card_num || bp.id.toUpperCase()}</span><span>2026 &bull; NICE SPACESHIP &#9670;</span></div>
        <div class="blueprint-card-actions">
          <button class="c-btn" data-action="savebp" data-id="${bp.id}">Save</button>
          <button class="c-btn bp-build-btn" data-action="build" data-id="${bp.id}">Configure</button>
        </div>
      </div>`;
    }

    // ── Agent Blueprint Card ──
    const rarity = data.rarity || 'common';
    const rarityLabel = { common:'COMMON', rare:'RARE', epic:'EPIC', legendary:'LEGENDARY', mythic:'MYTHIC' }[rarity] || '';
    const rarityColor = RARITY_COLORS[rarity.charAt(0).toUpperCase()+rarity.slice(1)] || RARITY_COLORS.Common;
    // Derive category from role or agentType
    const catTag = (data.role||'').split('·')[0].trim().replace(/\s+/g,'');
    const statKeys = ['spd','acc','cap','pwr'];
    const statLbls = ['SPD','ACC','CAP','PWR'];
    const statVals = statKeys.map(k => data.stats?.[k] || '&#8212;');
    const serial = _serialHash(bp.id || data.name);
    const typeLine = `${(data.agentType || 'AUTOMATION AGENT').toUpperCase()} &bull; NICE SPACESHIP&trade; v3.5`;
    return `<div class="blueprint-card blueprint-clickable" data-id="${bp.id}" data-type="agent" data-tags="${(data.tags||[]).join(',')}" data-category="${_esc(catTag)}" data-rarity="${rarity}">
      <div class="blueprint-card-name-bar"><span class="blueprint-card-name">${_esc(data.name)}</span></div>
      <div class="blueprint-card-art">
        <div class="blueprint-card-art-serial" title="Serial: ${serial.code}"><span class="blueprint-card-serial-code">${serial.code}</span></div>
        <div class="blueprint-card-art-class"><span class="blueprint-card-serial-code" style="color:${rarityColor};border:1px solid ${rarityColor}">${rarityLabel}</span></div>
        ${_avatarArt(data.name, catTag, serial)}
      </div>
      <div class="blueprint-card-type-line">${typeLine}</div>
      <div class="blueprint-card-text-box">
        <p class="blueprint-card-flavor">"${_esc(data.flavor || data.desc)}"</p>
        ${caps.slice(0,3).map(c => `<p class="blueprint-card-cap">${_esc(c)}</p>`).join('')}
      </div>
      <div class="blueprint-card-stats">${statLbls.map((l,i) => `<div class="blueprint-card-stat"><span class="blueprint-card-stat-val">${statVals[i]}</span><span class="blueprint-card-stat-lbl">${l}</span></div>`).join('')}</div>
      <div class="blueprint-card-actions">
        <button class="c-btn bp-logo-btn" data-fav="${bp.id}" aria-label="${isFav?'Unfavorite':'Favorite'}" style="border-color:${rarityColor};color:${rarityColor}">${_NS_LOGO_BTN}</button>
        <button class="c-btn" data-action="savebp" data-id="${bp.id}">Save</button>
        <button class="c-btn bp-build-btn" data-action="build" data-id="${bp.id}">Build</button>
      </div>
    </div>`;
  }


  function _getDataForTab() {
    if (_activeTab === 'spaceship') return SPACESHIP_BPS;
    return AGENT_BPS;
  }

  function render() {
    const grid = document.getElementById('bp-lib-grid');
    if (!grid) return;
    const all = _getDataForTab();
    grid.innerHTML = all.map(bp => _tcgCardHTML(bp, _activeTab)).join('');
    _attachEvents(grid);
    filter();
  }

  function _attachEvents(container) {
    if (!container) return;
    container.addEventListener('click', e => {
      // Card click (not on action button) → preview
      const card = e.target.closest('.blueprint-clickable');
      const btn  = e.target.closest('[data-action]') || e.target.closest('[data-fav]');
      if (btn) {
        e.stopPropagation();
        const id  = btn.dataset.id || btn.dataset.fav;
        const act = btn.dataset.action || 'fav';
        if (act === 'savebp') saveBP(id);
        if (act === 'share')  share(id);
        if (act === 'build')  build(id);
        if (act === 'fav')    fav(id);
        return;
      }
      if (card) showPreview(card.dataset.id);
    });
  }

  // ── Public API ────────────────────────────────────────────────
  function init() {
    render();
    renderFeatured();
    _syncFromDB().then(() => render());
  }

  function switchTab(t) {
    _activeTab = t;
    document.querySelectorAll('.bp-lib-tab').forEach(b => b.classList.toggle('active', b.dataset.bptab===t));
    if (window.BPHeroAnim) BPHeroAnim.setMode(t);
    // Update tab counts
    const tabs = document.querySelectorAll('.bp-tab-count');
    if (tabs.length >= 2) {
      tabs[0].textContent = '(' + SPACESHIP_BPS.length + ')';
      tabs[1].textContent = '(' + AGENT_BPS.length + ')';
    }
    render();
    renderFeatured();
  }

  function filter() {
    const q = (document.getElementById('bp-search')?.value||'').toLowerCase();
    const grid = document.getElementById('bp-lib-grid');
    if (!grid) return;
    grid.querySelectorAll('.blueprint-card').forEach(c => {
      const tags = (c.dataset.tags||'').toLowerCase();
      const cat  = (c.dataset.category||'').toLowerCase();
      const name = c.querySelector('.blueprint-card-name')?.textContent.toLowerCase()||'';
      const desc = c.querySelector('.blueprint-card-text-box')?.textContent.toLowerCase()||'';
      const catMatch = _activeTag==='all' || cat === _activeTag.toLowerCase() || tags.includes(_activeTag.toLowerCase());
      const txtMatch = !q || name.includes(q) || desc.includes(q) || tags.includes(q);
      c.style.display = (catMatch && txtMatch) ? '' : 'none';
    });
    const visible = [...grid.querySelectorAll('.blueprint-card')].filter(c=>c.style.display!=='none').length;
    const noRes = document.getElementById('bp-no-results');
    if (noRes) noRes.style.display = visible ? 'none' : 'block';
  }

  function filterTag(tag, btn) {
    _activeTag = tag;
    document.querySelectorAll('.bp-filter-btn').forEach(b=>b.classList.toggle('active',b===btn));
    filter();
  }

  function sort(sortBy) {
    const grid = document.getElementById('bp-lib-grid');
    if (!grid) return;
    const all = _getDataForTab();
    let sorted = [...all];
    if (sortBy === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'rating') {
      if (_activeTab === 'spaceship') {
        const classOrder = { 'class-3':0, 'class-2':1, 'class-1':2 };
        sorted.sort((a, b) => (classOrder[a.class_id]||2) - (classOrder[b.class_id]||2));
      } else {
        const rarityOrder = { legendary:0, epic:1, rare:2, common:3 };
        sorted.sort((a, b) => (rarityOrder[a.rarity]||3) - (rarityOrder[b.rarity]||3));
      }
    }
    // default: popular (original order)
    grid.innerHTML = sorted.map(bp => _tcgCardHTML(bp, _activeTab)).join('');
    _attachEvents(grid);
    filter();
  }

  function fav(id) {
    const favs = _getFavs();
    if (favs.has(id)) favs.delete(id); else favs.add(id);
    _saveFavs(favs);
    const btn = document.querySelector(`[data-fav="${id}"]`);
    if (btn) btn.classList.toggle('active', favs.has(id));
    _toast(favs.has(id) ? '★ ADDED TO FAVORITES' : 'REMOVED FROM FAVORITES');
    _persistFav(id, favs.has(id));
  }

  function showPreview(id) {
    const all = [...AGENT_BPS, ...SPACESHIP_BPS];
    const bp  = all.find(b => b.id === id);
    if (!bp) return;
    const modal = document.getElementById('m-bp-preview');
    const title = document.getElementById('bp-preview-title');
    const body  = document.getElementById('bp-preview-body');
    if (!modal || !body) return;
    title.textContent = bp.name;

    const isAgent = AGENT_BPS.includes(bp);
    const isShip  = SPACESHIP_BPS.includes(bp);

    if (isShip) {
      const cls = _SHIP_CLASSES[bp.class_id] || _SHIP_CLASSES['class-1'];
      body.innerHTML = `
        <div style="color:${_SLOT_COLORS[cls.slots[cls.slots.length-1]?.max]||'#6366f1'};font-size:0.78rem;letter-spacing:1px;margin-bottom:12px;">${cls.name} &bull; ${cls.tier} &bull; ${_esc(bp.category)}</div>
        <p style="font-size:0.85rem;line-height:1.7;color:var(--text-muted);margin-bottom:16px;">${_esc(bp.desc)}</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
          <div class="label-sm">Class: <strong>${cls.name}</strong></div>
          <div class="label-sm">Slots: <strong>${cls.slots.length}</strong></div>
          <div class="label-sm">Tier: <strong>${cls.tier}</strong></div>
          <div class="label-sm">Cost: <strong>${bp.stats?.cost||'—'}</strong></div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;">${(bp.caps||[]).map(c=>`<span class="tag">${_esc(c)}</span>`).join('')}</div>
        <button class="btn btn-solid" style="width:100%;" onclick="BP.build('${bp.id}');BP.closePreview();">Configure Spaceship &rarr;</button>`;
    } else {
      const rarityColor = RARITY_COLORS[bp.rarity] || RARITY_COLORS[(bp.rarity||'').charAt(0).toUpperCase()+(bp.rarity||'').slice(1)] || '#94a3b8';
      body.innerHTML = `
        <div style="color:${rarityColor};font-size:0.78rem;letter-spacing:1px;margin-bottom:12px;">${_esc((bp.rarity||'common').toUpperCase())} &bull; ${_esc((bp.role||'').split('·')[0].trim())}</div>
        <p style="font-size:0.85rem;line-height:1.7;color:var(--text-muted);margin-bottom:16px;">${_esc(bp.desc)}</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
          <div class="label-sm">Speed: <strong>${bp.stats?.spd||'—'}</strong></div>
          <div class="label-sm">Accuracy: <strong>${bp.stats?.acc||'—'}</strong></div>
          <div class="label-sm">Capacity: <strong>${bp.stats?.cap||'—'}</strong></div>
          <div class="label-sm">Power: <strong>${bp.stats?.pwr||'—'}</strong></div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;">${(bp.caps||[]).map(c=>`<span class="tag">${_esc(c)}</span>`).join('')}</div>
        <button class="btn btn-solid" style="width:100%;" onclick="BP.build('${bp.id}');BP.closePreview();">Install Blueprint &rarr;</button>`;
    }
    modal.style.display = 'flex';
  }

  function closePreview() {
    const modal = document.getElementById('m-bp-preview');
    if (modal) modal.style.display = 'none';
  }

  function saveBP(id) {
    const saved = _getSaved();
    if (!saved.includes(id)) saved.push(id);
    _saveSaved(saved);
    _persistSave(id, _getCustom(id) || {});
    _toast('BLUEPRINT SAVED TO LIBRARY');
  }

  function share(id) {
    const url = location.href.split('?')[0] + '?bp=' + id;
    navigator.clipboard?.writeText(url).then(()=>_toast('LINK COPIED TO CLIPBOARD')).catch(()=>_toast('COPY: '+url));
  }

  function build(id) {
    const base = location.pathname.includes('blueprints') ? './demo/atm/index.html' : '../demo/atm/index.html';
    window.location.href = base + '?deploy=' + id;
  }

  function renderFeatured() {
    const grid  = document.getElementById('bp-featured-grid');
    const label = document.getElementById('bp-featured-label');
    if (!grid) return;

    let featuredItems;
    const labels = { agent:'Featured Blueprints', spaceship:'Featured Spaceships' };
    if (label) label.textContent = labels[_activeTab] || 'Featured Blueprints';

    if (_activeTab === 'spaceship') {
      featuredItems = [...SPACESHIP_BPS].sort((a,b) => (b.class_id||'').localeCompare(a.class_id||'')).slice(0, 3);
    } else {
      const order = { mythic:0, legendary:1, epic:2, rare:3, common:4 };
      featuredItems = [...AGENT_BPS].sort((a,b) => (order[a.rarity]||3)-(order[b.rarity]||3)).slice(0, 3);
    }
    if (!featuredItems.length) { grid.innerHTML = ''; return; }
    grid.innerHTML = featuredItems.map(bp => _tcgCardHTML(bp, _activeTab)).join('');
    _attachEvents(grid);
  }

  return { init, switchTab, filter, filterTag, sort, fav, showPreview, closePreview, saveBP, share, build, renderFeatured, agentData: AGENT_BPS, spaceshipData: SPACESHIP_BPS };
})();

/* ─────────────────────────────────────────────────────────────────
   MODULE: Communications Hub (Comms)
───────────────────────────────────────────────────────────────── */
const Comms = (() => {
  const SETTINGS_KEY = 'ns-comms-settings';

  function _getSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}'); } catch(e) { return {}; }
  }
  function _saveSettings(obj) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(obj)); }

  function switchTab(tab) {
    document.querySelectorAll('.comms-tb').forEach(b => b.classList.toggle('active', b.dataset.ctab===tab));
    document.querySelectorAll('.comms-tab-pane').forEach(p => {
      p.style.display = p.id === 'tab-'+tab ? 'block' : 'none';
    });
    // Special case: settings tab has different id to avoid clash
    if (tab === 'settings') {
      document.querySelectorAll('.comms-tab-pane').forEach(p => {
        p.style.display = (p.id === 'tab-settings-c') ? 'block' : 'none';
      });
    }
  }

  function loadProfile() {
    const callsign = localStorage.getItem('ns-session');
    if (!callsign) return;
    const av = document.getElementById('prof-avatar');
    if (av) { av.textContent = callsign.charAt(0).toUpperCase(); }
    const cs = document.getElementById('prof-callsign');
    if (cs) cs.textContent = callsign;
    // Fleet data
    try {
      const fleet = JSON.parse(localStorage.getItem('ns-fleet-'+callsign)||'[]');
      const tasks = fleet.reduce((sum, a) => sum + (a.tasksCompleted||0), 0);
      const el1 = document.getElementById('prof-agents');
      const el2 = document.getElementById('prof-tasks');
      if (el1) el1.textContent = fleet.length;
      if (el2) el2.textContent = tasks;
    } catch(e){}
    // Joined date
    try {
      const pilots = JSON.parse(localStorage.getItem('ns-pilots')||'[]');
      const pilot  = pilots.find(p=>p.callsign===callsign);
      const el = document.getElementById('prof-joined');
      if (el && pilot?.created) el.textContent = new Date(pilot.created).toLocaleDateString();
    } catch(e){}
  }

  function loadSettings() {
    const s = _getSettings();
    const toggles = {
      'toggle-mission': s.notifyMission !== false,
      'toggle-errors':  s.notifyErrors  !== false,
      'toggle-digest':  s.notifyDigest  === true,
    };
    Object.entries(toggles).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.checked = val;
    });
  }

  function saveSettings() {
    const s = _getSettings();
    s.notifyMission = document.getElementById('toggle-mission')?.checked ?? true;
    s.notifyErrors  = document.getElementById('toggle-errors')?.checked  ?? true;
    s.notifyDigest  = document.getElementById('toggle-digest')?.checked  ?? false;
    _saveSettings(s);
  }

  function clearData() {
    if (!confirm('Clear all Nice Spaceship data? This will log you out and remove all agents and settings. This cannot be undone.')) return;
    const keys = Object.keys(localStorage).filter(k => k.startsWith('ns-'));
    keys.forEach(k => localStorage.removeItem(k));
    window.location.reload();
  }

  function _initLLMCards() {
    const llm = localStorage.getItem('ns-llm');
    if (!llm) return;
    try {
      const cfg = JSON.parse(llm);
      document.querySelectorAll('.int-card[data-llm]').forEach(card => {
        const connected = card.dataset.llm === cfg.model;
        const badge = card.querySelector('.int-card-status');
        const btn   = card.querySelector('.int-connect-btn');
        if (badge) { badge.textContent = connected ? 'CONNECTED' : 'CONNECT'; badge.classList.toggle('connected', connected); }
        if (btn)   btn.textContent = connected ? 'Disconnect' : 'Connect';
      });
    } catch(e){}
  }

  function init() {
    // Tab wiring
    document.querySelectorAll('.comms-tb').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.ctab));
    });
    // Init profile + settings
    loadProfile();
    loadSettings();
    _initLLMCards();
    // Toggle save
    document.querySelectorAll('.toggle-switch input').forEach(inp => inp.addEventListener('change', saveSettings));
    // Clear data btn
    const clrBtn = document.getElementById('cfg-clear-data');
    if (clrBtn) clrBtn.addEventListener('click', clearData);
    // Theme swatches
    document.querySelectorAll('.theme-swatch').forEach(sw => {
      sw.addEventListener('click', () => Theme.set(sw.dataset.theme));
    });
    // LLM connect buttons
    document.querySelectorAll('.int-connect-btn[data-llm]').forEach(btn => {
      btn.addEventListener('click', () => {
        const model = btn.dataset.llm;
        const key   = prompt(`Enter API key for ${model} (demo only — stored locally):`);
        if (!key) return;
        localStorage.setItem('ns-llm', JSON.stringify({model, prov:model, keyHint:key.slice(0,4)+'...'}));
        _initLLMCards();
      });
    });
    // Show default tab
    switchTab('contact');
  }

  return { init, switchTab };
})();

/* ─────────────────────────────────────────────────────────────────
   MODULE: Mission Logs (Logs)
───────────────────────────────────────────────────────────────── */
const Logs = (() => {
  const LOGS_DATA = [
    {
      slug: 'atm-v3-5-launch',
      cat: 'PRODUCT',
      title: 'NICE SPACESHIP™ v3.5: What\'s New in the Mission Control Update',
      excerpt: 'The biggest update to NICE SPACESHIP™ yet — multi-agent orchestration improvements, a redesigned Fleet panel, and real-time throughput telemetry now available in the dashboard.',
      date: 'March 5, 2026',
      readTime: '5 min read'
    },
    {
      slug: 'prompt-engineering-101',
      cat: 'TUTORIAL',
      title: 'Prompt Engineering 101: From Zero-Shot to Chain-of-Thought',
      excerpt: 'The single biggest lever over an AI agent\'s performance isn\'t the model — it\'s the prompt. A practical guide to zero-shot, few-shot, CoT, and structured output techniques.',
      date: 'February 22, 2026',
      readTime: '8 min read'
    },
    {
      slug: 'multi-agent-architecture',
      cat: 'ENGINEERING',
      title: 'Building Multi-Agent Systems That Don\'t Break',
      excerpt: 'Designing for failure, graceful degradation, and observability are the keys to running multi-agent pipelines in production. Here\'s what we\'ve learned after shipping dozens of them.',
      date: 'February 10, 2026',
      readTime: '10 min read'
    },
    {
      slug: 'fleet-project-management',
      cat: 'INDUSTRY',
      title: 'How Agent Fleets Replace Project Managers for SMBs',
      excerpt: 'Small teams are using coordinated agent fleets to replace entire categories of coordination overhead. Task delegation, status rollups, and follow-ups — fully automated.',
      date: 'January 28, 2026',
      readTime: '7 min read'
    },
    {
      slug: 'mcp-integration-guide',
      cat: 'ENGINEERING',
      title: 'MCP Integration: Connecting Agents to Any Tool',
      excerpt: 'The Model Context Protocol opens every business tool to your agent stack. A practical walkthrough of connecting CRMs, databases, and custom APIs using MCP adapters.',
      date: 'January 15, 2026',
      readTime: '9 min read'
    },
    {
      slug: 'roi-of-ai-agents',
      cat: 'INDUSTRY',
      title: 'The Real ROI of Deploying AI Agents in 2026',
      excerpt: 'Cutting through the hype: a data-driven look at where AI agents are actually delivering measurable ROI versus where businesses are still burning runway on the wrong use cases.',
      date: 'January 3, 2026',
      readTime: '6 min read'
    }
  ];

  const CAT_MAP = { all:'all', engineering:'ENGINEERING', product:'PRODUCT', industry:'INDUSTRY', tutorial:'TUTORIAL' };
  let _activeCat = 'all';

  function _cardHTML(log) {
    return `<div class="log-card" data-cat="${log.cat}">
      <div class="log-card-header">
        <div class="log-cat">${log.cat}</div>
        <div class="log-title">${log.title}</div>
      </div>
      <div class="log-card-body">
        <div class="log-excerpt">${log.excerpt}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:auto;padding-top:12px;border-top:1px solid var(--border);">
          <div class="log-meta"><span>${log.date}</span><span>&middot;</span><span>${log.readTime}</span></div>
          <a href="./logs/${log.slug}.html" class="label-sm" style="color:var(--accent);text-decoration:none;white-space:nowrap;">Read Transmission →</a>
        </div>
      </div>
    </div>`;
  }

  function _render() {
    const grid = document.getElementById('logs-grid');
    if (!grid) return;
    const filtered = _activeCat === 'all' ? LOGS_DATA : LOGS_DATA.filter(l => l.cat === CAT_MAP[_activeCat]);
    grid.innerHTML = filtered.map(_cardHTML).join('');
  }

  function init() {
    _render();
    document.querySelectorAll('.log-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.log-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _activeCat = btn.dataset.cat;
        _render();
      });
    });
  }

  return { init, data: LOGS_DATA };
})();

/* ─────────────────────────────────────────────────────────────────
   MODULE: Pricing (Pricing)
───────────────────────────────────────────────────────────────── */
const Pricing = (() => {
  const PRICES = {
    monthly: { pilot: '$149', commander: '$499', pilotNote: 'billed monthly', commanderNote: 'billed monthly' },
    annual:  { pilot: '$119', commander: '$399', pilotNote: 'billed as $1,428/year', commanderNote: 'billed as $4,788/year' }
  };

  function toggleBilling(isAnnual) {
    const mode = isAnnual ? 'annual' : 'monthly';
    const p    = PRICES[mode];

    const elPilot = document.getElementById('price-pilot');
    const elCmd   = document.getElementById('price-commander');
    const elPN    = document.getElementById('price-pilot-note');
    const elCN    = document.getElementById('price-commander-note');
    const saveBadge = document.getElementById('pricing-save-badge');
    const monthlyLbl = document.getElementById('billing-lbl-monthly');
    const annualLbl  = document.getElementById('billing-lbl-annual');

    if (elPilot) elPilot.textContent = p.pilot;
    if (elCmd)   elCmd.textContent   = p.commander;
    if (elPN)    elPN.textContent    = p.pilotNote;
    if (elCN)    elCN.textContent    = p.commanderNote;
    if (saveBadge)  saveBadge.style.opacity  = isAnnual ? '1' : '0.3';
    if (monthlyLbl) monthlyLbl.classList.toggle('active', !isAnnual);
    if (annualLbl)  annualLbl.classList.toggle('active',  isAnnual);
  }

  function init() {
    // FAQ accordion
    document.querySelectorAll('.pfaq-item').forEach(item => {
      item.querySelector('.pfaq-q').addEventListener('click', () => {
        const wasOpen = item.classList.contains('open');
        document.querySelectorAll('.pfaq-item').forEach(i => i.classList.remove('open'));
        if (!wasOpen) item.classList.add('open');
      });
    });
    // Set monthly as default active
    const monthlyLbl = document.getElementById('billing-lbl-monthly');
    if (monthlyLbl) monthlyLbl.classList.add('active');
  }

  return { init, toggleBilling };
})();

/* ─────────────────────────────────────────────────────────────────
   MODULE: ROI Calculator (ROI)
───────────────────────────────────────────────────────────────── */
const ROI = (() => {
  let _step       = 1;
  const TOTAL     = 4; // steps before results
  let _state      = { industry: null, teamSize: 10, workflows: [], hoursPerWeek: 10 };

  const AGENT_REC = {
    saas:       { name: 'Customer Success Agent',  link: './blueprints.html' },
    ecommerce:  { name: 'Order Management Agent',  link: './blueprints.html' },
    agency:     { name: 'Client Reporting Agent',  link: './blueprints.html' },
    healthcare: { name: 'Intake Coordinator Agent',link: './blueprints.html' },
    finance:    { name: 'Compliance Monitor Agent',link: './blueprints.html' },
    legal:      { name: 'Contract Review Agent',   link: './blueprints.html' }
  };

  function _setProgress(step) {
    document.querySelectorAll('.roi-prog-step').forEach((seg, i) => {
      seg.classList.toggle('done', i < step);
    });
  }

  function _showStep(n) {
    document.querySelectorAll('.roi-step').forEach(s => s.classList.remove('active'));
    const target = document.getElementById('roi-step-' + n);
    if (target) target.classList.add('active');
    _setProgress(n - 1);
    _step = n;
  }

  function _calculate() {
    const wfCount    = _state.workflows.length || 1;
    const hrs        = _state.hoursPerWeek;
    const hoursSaved = Math.round(wfCount * hrs * 0.7 * 4.3);
    const dollarSaved= hoursSaved * 85;
    const roiMult    = (dollarSaved / 149).toFixed(1);
    const rec        = AGENT_REC[_state.industry] || { name: 'Custom Agent', link: './blueprints.html' };

    const elHours = document.getElementById('roi-res-hours');
    const elValue = document.getElementById('roi-res-value');
    const elRoi   = document.getElementById('roi-res-roi');
    const elRec   = document.getElementById('roi-recommendation');

    if (elHours) elHours.textContent = hoursSaved.toLocaleString() + ' hrs';
    if (elValue) elValue.textContent = '$' + dollarSaved.toLocaleString();
    if (elRoi)   elRoi.textContent   = roiMult + 'x';
    if (elRec)   elRec.innerHTML     = `<div class="label-sm" style="margin-bottom:10px;">RECOMMENDED AGENT</div>
      <div style="font-size:1.1rem;font-family:var(--font-h);margin-bottom:6px;">${rec.name}</div>
      <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:16px;">Based on your ${_state.industry || 'industry'} profile and workflow patterns.</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">
        <a href="${rec.link}" class="btn btn-solid">View Blueprint →</a>
        <a href="./contact.html" class="btn btn-outline">Talk to an Engineer</a>
      </div>`;
    _showStep(5);
    _setProgress(5);
  }

  function init() {
    // Industry cards
    document.querySelectorAll('.roi-ind-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.roi-ind-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        _state.industry = card.dataset.industry;
      });
    });

    // Team size slider
    const teamSlider = document.getElementById('roi-team-slider');
    const teamVal    = document.getElementById('roi-team-val');
    if (teamSlider) {
      teamSlider.addEventListener('input', () => {
        _state.teamSize = +teamSlider.value;
        if (teamVal) teamVal.textContent = teamSlider.value;
      });
    }

    // Hours slider
    const hrsSlider = document.getElementById('roi-hours-slider');
    const hrsVal    = document.getElementById('roi-hours-val');
    if (hrsSlider) {
      hrsSlider.addEventListener('input', () => {
        _state.hoursPerWeek = +hrsSlider.value;
        if (hrsVal) hrsVal.textContent = hrsSlider.value;
      });
    }

    // Workflow checkboxes
    document.querySelectorAll('.roi-wf-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        _state.workflows = [...document.querySelectorAll('.roi-wf-cb:checked')].map(c => c.value);
      });
    });

    // Next buttons
    ['1','2','3'].forEach(n => {
      const btn = document.getElementById('roi-next-' + n);
      if (btn) btn.addEventListener('click', () => _showStep(+n + 1));
    });

    // Back buttons
    ['2','3','4'].forEach(n => {
      const btn = document.getElementById('roi-back-' + n);
      if (btn) btn.addEventListener('click', () => _showStep(+n - 1));
    });

    // Calculate btn
    const calcBtn = document.getElementById('roi-calc-btn');
    if (calcBtn) calcBtn.addEventListener('click', _calculate);

    // Restart
    const restartBtn = document.getElementById('roi-restart');
    if (restartBtn) restartBtn.addEventListener('click', () => {
      _state = { industry: null, teamSize: 10, workflows: [], hoursPerWeek: 10 };
      document.querySelectorAll('.roi-ind-card').forEach(c => c.classList.remove('selected'));
      document.querySelectorAll('.roi-wf-cb').forEach(c => c.checked = false);
      _showStep(1);
    });

    _showStep(1);
  }

  return { init };
})();

/* ─────────────────────────────────────────────────────────────────
   MODULE: Onboarding Wizard (WizardApp)
───────────────────────────────────────────────────────────────── */
const WizardApp = (() => {
  const STATE_KEY = 'ns-wizard-state';
  let _step = 1;
  const TOTAL = 5;
  let _state = { industry: null, goal: null, agentName: '', role: '', tasks: [] };

  const TASK_LIBRARY = {
    saas:       { automate: ['Onboarding email sequences','Usage-based alert triggers','Subscription renewal reminders','Churn risk detection'], content: ['Release notes drafts','Changelog summaries','Help doc updates','Feature announcement copy'], customers: ['Support ticket triage','Live chat escalation routing','NPS survey follow-ups','Refund request processing'], analyze: ['Cohort retention analysis','Feature adoption tracking','Revenue churn modeling','User journey mapping'] },
    ecommerce:  { automate: ['Order status notifications','Inventory reorder alerts','Returns processing','Abandoned cart follow-ups'], content: ['Product description generation','SEO metadata writing','Email campaign copy','Social media posts'], customers: ['Shipping inquiry responses','Review response drafts','Loyalty program comms','Complaint escalation'], analyze: ['Sales trend analysis','SKU performance reports','Customer lifetime value','Return rate tracking'] },
    agency:     { automate: ['Client report generation','Project status rollups','Invoice creation','Time tracking summaries'], content: ['Proposal drafting','Case study writing','Social content creation','Ad copy variants'], customers: ['Client update emails','Feedback collection','Meeting prep briefs','Approval request routing'], analyze: ['Campaign performance dashboards','Budget utilization reports','Client ROI summaries','Competitive benchmarking'] },
    healthcare: { automate: ['Appointment reminders','Intake form processing','Insurance verification checks','Prescription refill alerts'], content: ['Patient education materials','Care plan summaries','Discharge instruction docs','Newsletter content'], customers: ['Patient inquiry responses','Follow-up scheduling','Referral coordination','Billing question routing'], analyze: ['Patient outcome tracking','Appointment no-show analysis','Staff utilization reports','Compliance audit prep'] },
    finance:    { automate: ['Transaction categorization','Compliance report generation','Payment reminder sending','Reconciliation workflows'], content: ['Investment memo drafting','Market commentary','Client portfolio summaries','Regulatory filing prep'], customers: ['Account inquiry responses','Onboarding document collection','KYC status updates','Dispute resolution routing'], analyze: ['Portfolio performance analysis','Risk exposure modeling','Cash flow forecasting','Regulatory change monitoring'] },
    legal:      { automate: ['Contract clause extraction','Deadline and filing reminders','Matter status updates','Document routing workflows'], content: ['Brief and memo drafting','Contract template generation','Engagement letter creation','Research summary writing'], customers: ['Client status update emails','Document request follow-ups','Billing inquiry responses','Intake questionnaire processing'], analyze: ['Case outcome tracking','Billable hours analysis','Contract risk flagging','Regulatory compliance monitoring'] }
  };

  const ROLE_LABELS = { automate: 'Automation Engineer', content: 'Content Strategist', customers: 'Customer Success', analyze: 'Data Analyst' };

  function _setProgress(step) {
    document.querySelectorAll('.wiz-prog-seg').forEach((seg, i) => {
      seg.classList.toggle('done', i < step);
    });
    const lbl = document.getElementById('wiz-step-label');
    const labels = ['Choose Industry', 'Set Your Goal', 'Name Your Agent', 'Assign Tasks', 'Mission Ready'];
    if (lbl) lbl.textContent = `Step ${step} of ${TOTAL} — ${labels[step - 1]}`;
  }

  function _showStep(n) {
    document.querySelectorAll('.wiz-step').forEach(s => s.classList.remove('active'));
    const target = document.getElementById('wz-step-' + n);
    if (target) target.classList.add('active');
    _setProgress(n);
    _step = n;
    if (n === 4) _renderTasks();
    if (n === 5) _generateBlueprint();
  }

  function _renderTasks() {
    const list = document.getElementById('wz-task-list');
    if (!list) return;
    const industry = _state.industry || 'saas';
    const goal     = _state.goal     || 'automate';
    const tasks    = (TASK_LIBRARY[industry] && TASK_LIBRARY[industry][goal]) || ['Automate email drafts','Generate status reports','Route incoming requests','Analyze performance data','Summarize data trends','Schedule follow-up tasks'];
    list.innerHTML = tasks.map((t, i) => `<label class="wiz-task-item">
      <input type="checkbox" class="wiz-task-cb" value="${t}" ${i < 3 ? 'checked' : ''}>
      <span class="wiz-task-lbl">${t}</span>
    </label>`).join('');
    list.querySelectorAll('.wiz-task-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        _state.tasks = [...list.querySelectorAll('.wiz-task-cb:checked')].map(c => c.value);
      });
    });
    // Init state.tasks from pre-checked
    _state.tasks = [...list.querySelectorAll('.wiz-task-cb:checked')].map(c => c.value);
  }

  function _generateBlueprint() {
    const card = document.getElementById('wz-agent-card');
    if (!card) return;
    const name     = _state.agentName || 'My Agent';
    const role     = _state.role      || ROLE_LABELS[_state.goal] || 'AI Agent';
    const industry = _state.industry  || 'saas';
    const tasks    = _state.tasks.length ? _state.tasks : ['Process incoming requests','Generate automated reports','Send status notifications'];
    card.innerHTML = `<div class="wiz-agent-name">
        <svg width="18" height="18"><use href="#icon-agent"/></svg>
        ${name}
        <span class="label-sm" style="margin-left:8px;">${role.toUpperCase()}</span>
      </div>
      <div class="log-meta" style="margin:8px 0 16px;">${industry.charAt(0).toUpperCase()+industry.slice(1)} Industry &middot; ${tasks.length} Tasks Configured</div>
      <div class="wiz-agent-tasks">
        ${tasks.slice(0,5).map(t => `<div class="wiz-agent-task"><svg width="14" height="14"><use href="#icon-check"/></svg>${t}</div>`).join('')}
      </div>`;
    // Persist to localStorage
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({ ..._state, savedAt: Date.now() }));
    } catch(e){}
  }

  function saveBlueprintToLib() {
    try {
      const name  = _state.agentName || 'Custom Agent';
      const tasks = _state.tasks.length ? _state.tasks : ['Automate workflows'];
      const custom = JSON.parse(localStorage.getItem('ns-bp-custom') || '[]');
      custom.push({ id: 'custom-' + Date.now(), name, role: _state.role || 'Custom Role', industry: _state.industry, tasks, saved: true });
      localStorage.setItem('ns-bp-custom', JSON.stringify(custom));
      const btn = document.getElementById('wz-save-bp');
      if (btn) { btn.textContent = '✓ Saved to Blueprint Library'; btn.disabled = true; }
    } catch(e){}
  }

  function init() {
    // Industry choices
    document.querySelectorAll('#wz-step-1 .wz-choice').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('#wz-step-1 .wz-choice').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        _state.industry = card.dataset.industry;
      });
    });

    // Goal choices
    document.querySelectorAll('#wz-step-2 .wz-choice').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('#wz-step-2 .wz-choice').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        _state.goal = card.dataset.goal;
        // Pre-fill role
        const roleSelect = document.getElementById('wz-agent-role');
        if (roleSelect && ROLE_LABELS[_state.goal]) {
          for (let o of roleSelect.options) {
            if (o.text.includes(ROLE_LABELS[_state.goal])) { roleSelect.value = o.value; break; }
          }
        }
      });
    });

    // Agent name input
    const nameInput = document.getElementById('wz-agent-name');
    if (nameInput) nameInput.addEventListener('input', () => { _state.agentName = nameInput.value.trim(); });

    // Role selector
    const roleSelect = document.getElementById('wz-agent-role');
    if (roleSelect) roleSelect.addEventListener('change', () => { _state.role = roleSelect.options[roleSelect.selectedIndex].text; });

    // Next buttons
    ['1','2','3','4'].forEach(n => {
      const btn = document.getElementById('wz-next-' + n);
      if (btn) btn.addEventListener('click', () => _showStep(+n + 1));
    });

    // Back buttons
    ['2','3','4'].forEach(n => {
      const btn = document.getElementById('wz-back-' + n);
      if (btn) btn.addEventListener('click', () => _showStep(+n - 1));
    });

    // Save blueprint
    const saveBtn = document.getElementById('wz-save-bp');
    if (saveBtn) saveBtn.addEventListener('click', saveBlueprintToLib);

    // Restart
    const restartBtn = document.getElementById('wz-restart');
    if (restartBtn) restartBtn.addEventListener('click', () => {
      _state = { industry: null, goal: null, agentName: '', role: '', tasks: [] };
      document.querySelectorAll('.wz-choice').forEach(c => c.classList.remove('selected'));
      const ni = document.getElementById('wz-agent-name');
      if (ni) ni.value = '';
      _showStep(1);
    });

    _showStep(1);
  }

  return { init, saveBlueprintToLib };
})();

/* ─────────────────────────────────────────────────────────────────
   MODULE: Blueprint Tab Wiring (BPComm - kept for backward compat)
───────────────────────────────────────────────────────────────── */
const BPComm = (() => {
  function init() {
    // Wire blueprint tab buttons to BP.switchTab
    document.querySelectorAll('.bp-lib-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.bptab;
        if (t) BP.switchTab(t);
      });
    });
    // Close preview modal on overlay click
    const modal = document.getElementById('m-bp-preview');
    if (modal) modal.addEventListener('click', e => { if (e.target === modal) BP.closePreview(); });
  }
  return { init };
})();
