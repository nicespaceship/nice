/* ═══════════════════════════════════════════════════════════════════
   NICE — Front page script (nicespaceship.ai/)
   The starfield, the header and its section marks, the example mission
   playing out, the Inside NICE tabs and theme picker, and the Codex. The
   page reads fine without it: the Codex shows every entry in one column.
═══════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Starfield ─────────────────────────────────────────────────── */
  function starfield() {
    const canvas = document.getElementById('lp-stars');
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    let stars = [];
    let shooting = [];
    let w = 0, h = 0, lastShot = 0;

    function size() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(320, Math.round((w * h) / 5200));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.4 + 0.3,
        a: Math.random() * 0.7 + 0.25,
        drift: Math.random() * 0.12 + 0.02,
        twinkle: Math.random() * 0.02 + 0.004,
        phase: Math.random() * Math.PI * 2,
        // Mostly cool white, now and then a warm star.
        hue: Math.random() > 0.86 ? 30 + Math.random() * 20 : 210 + Math.random() * 30,
        sat: Math.random() > 0.7 ? 35 : 10,
      }));
    }

    function drawStars(move) {
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        if (move) {
          s.phase += s.twinkle;
          s.y += s.drift;
          if (s.y > h + 4) { s.y = -4; s.x = Math.random() * w; }
        }
        const alpha = s.a * (0.55 + 0.45 * Math.sin(s.phase));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${s.hue}, ${s.sat}%, 90%, ${alpha})`;
        ctx.fill();
        if (s.r > 1.1) {
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * 3.2, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${s.hue}, ${s.sat}%, 80%, ${alpha * 0.1})`;
          ctx.fill();
        }
      }
    }

    function drawShooting(time) {
      if (time - lastShot > 5200) {
        lastShot = time;
        shooting.push({
          x: Math.random() * w * 0.8, y: Math.random() * h * 0.4,
          len: 70 + Math.random() * 80, speed: 7 + Math.random() * 5,
          angle: Math.PI / 6 + Math.random() * Math.PI / 8, life: 1, decay: 0.016 + Math.random() * 0.01,
        });
      }
      shooting = shooting.filter(s => s.life > 0);
      for (const s of shooting) {
        s.x += Math.cos(s.angle) * s.speed;
        s.y += Math.sin(s.angle) * s.speed;
        s.life -= s.decay;
        const tx = s.x - Math.cos(s.angle) * s.len;
        const ty = s.y - Math.sin(s.angle) * s.len;
        const grad = ctx.createLinearGradient(tx, ty, s.x, s.y);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
        grad.addColorStop(1, `rgba(205, 222, 255, ${Math.max(0, s.life) * 0.8})`);
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(s.x, s.y);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    }

    function frame(time) {
      drawStars(true);
      drawShooting(time);
      requestAnimationFrame(frame);
    }

    size();
    window.addEventListener('resize', () => { size(); if (calm) drawStars(false); });
    if (calm) drawStars(false);
    else requestAnimationFrame(frame);
  }

  /* ── The example mission, playing out ──────────────────────────── */
  // One frame per beat: each node's state, and the mission's status.
  // The review loop sends the draft back once before it passes.
  const MISSION = [
    { s: ['working', 'working', 'queued', 'queued', 'queued'], status: 'Running' },
    { s: ['done', 'done', 'working', 'queued', 'queued'], status: 'Running' },
    { s: ['done', 'done', 'done', 'working', 'queued'], status: 'Running' },
    { s: ['done', 'done', 'revising', 'sent-back', 'queued'], status: 'Running' },
    { s: ['done', 'done', 'done', 'working', 'queued'], status: 'Running' },
    { s: ['done', 'done', 'done', 'passed', 'waiting'], status: 'Waiting for you', hold: true },
  ];
  const STATE_TEXT = {
    working: 'Working', done: 'Done', queued: 'Queued', revising: 'Revising',
    'sent-back': 'Sent back', passed: 'Passed', waiting: 'Waiting for you',
  };
  const STATE_CLASS = { working: 'is-working', revising: 'is-working', queued: 'is-queued', 'sent-back': 'is-queued' };

  function mission() {
    const fig = document.getElementById('lp-mission');
    if (!fig) return;
    const nodes = [...fig.querySelectorAll('.lp-node')];
    const status = fig.querySelector('[data-mission-status]');
    let at = 0, timer = null;

    function paint(f) {
      nodes.forEach((node, i) => {
        const st = f.s[i];
        node.classList.remove('is-working', 'is-queued');
        if (STATE_CLASS[st]) node.classList.add(STATE_CLASS[st]);
        node.querySelector('[data-state]').textContent = STATE_TEXT[st];
      });
      status.textContent = f.status;
      status.classList.toggle('is-waiting', f.status !== 'Running');
    }
    function step() {
      const f = MISSION[at];
      paint(f);
      at = (at + 1) % MISSION.length;
      timer = setTimeout(step, f.hold ? 4200 : 1700);
    }

    paint(MISSION[MISSION.length - 1]);
    if (calm || !('IntersectionObserver' in window)) return;
    // Play only while it can be seen.
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !timer) { at = 0; step(); }
      else if (!e.isIntersecting && timer) { clearTimeout(timer); timer = null; }
    }, { threshold: 0.3 }).observe(fig);
  }

  /* ── Inside NICE tabs ──────────────────────────────────────────── */
  function tabs() {
    const list = document.querySelector('.lp-tabs');
    if (!list) return;
    const tabEls = [...list.querySelectorAll('[role="tab"]')];
    function select(tab, focus) {
      tabEls.forEach(t => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
      });
      if (focus) tab.focus();
    }
    list.addEventListener('click', e => {
      const tab = e.target.closest('[role="tab"]');
      if (tab) select(tab, false);
    });
    list.addEventListener('keydown', e => {
      const i = tabEls.indexOf(document.activeElement);
      if (i < 0) return;
      const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabEls.length - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      select(tabEls[(to + tabEls.length) % tabEls.length], true);
    });
  }

  /* ── Header: solid once scrolled; marks the section in view ─────── */
  function header() {
    const bar = document.querySelector('.lp-header');
    if (!bar) return;
    const onScroll = () => bar.classList.toggle('is-scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    if (!('IntersectionObserver' in window)) return;
    const links = new Map([...bar.querySelectorAll('.lp-nav-link[href^="#"]')].map(a => [a.getAttribute('href').slice(1), a]));
    const visible = new Set();
    // A section counts as current while it crosses a band just above the
    // middle of the screen; the first of the nav's sections in it wins.
    const io = new IntersectionObserver(items => {
      items.forEach(i => (i.isIntersecting ? visible.add(i.target.id) : visible.delete(i.target.id)));
      const id = [...links.keys()].find(k => visible.has(k));
      links.forEach((a, k) => (k === id ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
    }, { rootMargin: '-40% 0px -55% 0px' });
    links.forEach((_a, id) => { const el = document.getElementById(id); if (el) io.observe(el); });
  }

  /* ── Theme picker: repaints the Inside NICE window ─────────────── */
  function skins() {
    const win = document.querySelector('.lp-window');
    const group = document.querySelector('.lp-skins-list');
    if (!win || !group) return;
    // Text on an accent fill is black or white, whichever reads better.
    const luminance = hex => {
      const [r, g, b] = hex.replace('#', '').match(/../g).map(h => {
        const c = parseInt(h, 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const onAccent = hex => {
      const l = luminance(hex);
      return (l + 0.05) / 0.05 > 1.05 / (l + 0.05) ? '#000000' : '#ffffff';
    };
    group.addEventListener('click', e => {
      const btn = e.target.closest('button[data-skin-bg]');
      if (!btn) return;
      win.style.setProperty('--w-bg', btn.dataset.skinBg);
      win.style.setProperty('--w-ac', btn.dataset.skinAc);
      win.style.setProperty('--w-on-ac', onAccent(btn.dataset.skinAc));
      win.classList.toggle('is-light', btn.hasAttribute('data-skin-light'));
      group.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
    });
  }

  /* ── The Codex ─────────────────────────────────────────────────── */
  // Entries are plain articles in the page (readable without this
  // script and by search engines). Here they become an index by group,
  // a search, one entry at a time with previous and next, and links
  // like #codex/space.
  function codex() {
    const root = document.querySelector('[data-codex]');
    if (!root) return;
    const nav = root.querySelector('.lp-codex-nav');
    const pages = root.querySelector('.lp-codex-pages');
    const search = root.querySelector('#codex-search');
    const wide = window.matchMedia('(min-width: 960px)');
    const all = [...root.querySelectorAll('.lp-entry')];
    const pad = n => String(n).padStart(2, '0');
    const entries = all.map((el, i) => {
      const title = el.querySelector('h3');
      title.tabIndex = -1;
      const words = el.textContent.toLowerCase();
      // "05 / 20  Your crew" above each title.
      const tag = document.createElement('p');
      tag.className = 'lp-entry-group';
      const num = document.createElement('b');
      num.textContent = `${pad(i + 1)} / ${pad(all.length)}`;
      tag.append(num, document.createTextNode(el.dataset.group));
      el.insertBefore(tag, title);
      return { el, num: pad(i + 1), id: el.id.replace(/^codex-/, ''), group: el.dataset.group, title: title.textContent, words };
    });
    const groups = [...new Set(entries.map(e => e.group))];
    let current = entries[0];

    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'lp-codex-back';
    back.textContent = '← All entries';
    back.addEventListener('click', () => {
      root.classList.remove('is-reading');
      nav.querySelector('[aria-current="true"]')?.focus();
    });
    pages.prepend(back);

    // "approve" should find approval and approved too: match on the start
    // of a word, with common endings trimmed off longer terms.
    const stem = t => (t.length > 4 ? t.replace(/(ing|ed|es|e|s|al)$/, '') : t);

    function renderNav() {
      const terms = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean).map(stem);
      const found = entries.filter(e => terms.every(t => e.words.includes(t)));
      nav.textContent = '';
      if (!found.length) {
        const none = document.createElement('p');
        none.className = 'lp-codex-none';
        none.textContent = `No entries match “${search.value.trim()}”.`;
        nav.append(none);
        return;
      }
      for (const group of groups) {
        const inGroup = found.filter(e => e.group === group);
        if (!inGroup.length) continue;
        const box = document.createElement('div');
        box.className = 'lp-codex-group';
        const head = document.createElement('h4');
        head.textContent = group;
        const ul = document.createElement('ul');
        for (const e of inGroup) {
          const li = document.createElement('li');
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.dataset.entry = e.id;
          const num = document.createElement('span');
          num.className = 'lp-codex-num';
          num.textContent = e.num;
          btn.append(num, document.createTextNode(e.title));
          if (e === current) btn.setAttribute('aria-current', 'true');
          li.append(btn);
          ul.append(li);
        }
        box.append(head, ul);
        nav.append(box);
      }
    }

    function stepButton(entry, label, cls) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = cls;
      btn.dataset.entry = entry.id;
      const small = document.createElement('small');
      small.textContent = label;
      btn.append(small, document.createTextNode(entry.title));
      return btn;
    }

    function show(entry, { focus = false, remember = false } = {}) {
      current = entry;
      entries.forEach(e => { e.el.hidden = e !== entry; });
      root.querySelector('.lp-entry-steps')?.remove();
      const at = entries.indexOf(entry);
      const steps = document.createElement('nav');
      steps.className = 'lp-entry-steps';
      steps.setAttribute('aria-label', 'Previous and next entries');
      if (entries[at - 1]) steps.append(stepButton(entries[at - 1], '← Previous', 'is-prev'));
      if (entries[at + 1]) steps.append(stepButton(entries[at + 1], 'Next →', 'is-next'));
      entry.el.append(steps);
      nav.querySelectorAll('button').forEach(b => {
        if (b.dataset.entry === entry.id) b.setAttribute('aria-current', 'true');
        else b.removeAttribute('aria-current');
      });
      if (remember) history.replaceState(null, '', `#codex/${entry.id}`);
      if (focus) entry.el.querySelector('h3').focus({ preventScroll: true });
    }

    function open(id, opts) {
      const entry = entries.find(e => e.id === id);
      if (!entry) return;
      show(entry, opts);
      root.classList.add('is-reading');
      if (!wide.matches) root.scrollIntoView({ block: 'start' });
    }

    root.addEventListener('click', e => {
      const btn = e.target.closest('button[data-entry]');
      if (btn) open(btn.dataset.entry, { focus: true, remember: true });
    });
    search.addEventListener('input', renderNav);
    // "/" jumps to the search from anywhere on the page, as on most docs sites.
    document.addEventListener('keydown', e => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t.closest && t.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      root.classList.remove('is-reading');
      root.scrollIntoView({ block: 'start' });
      search.focus({ preventScroll: true });
    });
    search.addEventListener('keydown', e => {
      if (e.key === 'Escape' && search.value) { search.value = ''; renderNav(); }
    });

    // Entries renamed with the app keep their old links working.
    const RENAMED = { compare: 'space', outbox: 'ship', library: 'blueprints', spaceship: 'projects', 'first-spaceship': 'first-project' };
    function fromHash() {
      const m = /^#codex\/([\w-]+)$/.exec(location.hash);
      if (!m) return;
      const id = RENAMED[m[1]] || m[1];
      if (id !== m[1]) history.replaceState(null, '', `#codex/${id}`);
      open(id, { focus: false });
      document.getElementById('codex').scrollIntoView({ block: 'start' });
    }
    window.addEventListener('hashchange', fromHash);

    root.classList.add('is-live');
    renderNav();
    show(current);
    fromHash();
  }

  /* ── Renamed sections ───────────────────────────────────────── */
  // Sections renamed with the app keep their old links: #library lands on
  // #blueprints.
  function renamedSections() {
    const RENAMED = { library: 'blueprints' };
    const go = () => {
      const id = RENAMED[location.hash.slice(1)];
      if (!id) return;
      history.replaceState(null, '', '#' + id);
      document.getElementById(id)?.scrollIntoView({ block: 'start' });
    };
    window.addEventListener('hashchange', go);
    go();
  }

  starfield();
  header();
  mission();
  tabs();
  skins();
  codex();
  renamedSections();
})();
