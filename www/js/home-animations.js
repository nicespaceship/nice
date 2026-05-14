/* nicespaceship.com — Home animations dynamic-DOM generator.
   Builds the per-frame elements that the stage choreography in site.css
   animates: data shower particles (Mission/Platform), background card
   cascade (How/Inside reveal), and output-icon emoji flow (Inside).
   Ported verbatim from www/intro-animations.html sandbox — counts,
   palettes, ranges, and emoji lists must match the user-approved
   sandbox state. */
const HomeAnimations = (() => {
  // ─── SHOWER ─────────────────────────────────────────────────────
  // 180 colored dots streaming inward. Sapphire is intentionally NOT
  // in the palette — reserved for "data within NICE" elsewhere.
  const SHOWER_PALETTE = [
    '#ff5e7e', // coral
    '#ffa724', // amber
    '#f7d100', // yellow
    '#2ed573', // green
    '#00d9ff', // cyan
    '#8c52ff', // purple
    '#ff3eb5', // magenta
    '#7afbff', // ice
    '#ffce5c', // gold
    '#a0ff5c', // lime
  ];
  // Delay range = longest stage cycle so particles spread uniformly
  // across the full cycle. Negative values jump each particle
  // mid-cycle at page load — no warm-up gap.
  const SHOWER_DELAY_RANGE = 6;
  const SHOWER_COUNT = 180;

  function _generateShower() {
    const shower = document.querySelector('.home-particles-shower');
    if (!shower) return;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < SHOWER_COUNT; i++) {
      const p = document.createElement('span');
      p.className = 'home-particle';
      const angle = Math.random() * 360;
      const delay = -Math.random() * SHOWER_DELAY_RANGE;
      const color = SHOWER_PALETTE[i % SHOWER_PALETTE.length];
      p.style.setProperty('--angle', angle + 'deg');
      p.style.setProperty('--delay', delay + 's');
      p.style.background = color;
      p.style.boxShadow = '0 0 8px ' + color;
      frag.appendChild(p);
    }
    shower.appendChild(frag);
  }

  // ─── CASCADE ────────────────────────────────────────────────────
  // 70 small rarity-colored cards raining down the background during
  // How (reveal) + Inside (sustained).
  const CASCADE_PALETTE = [
    '#FF3EB5', '#FBBF24', '#C084FC', '#60A5FA', '#9CA3AF',
    '#FF5E7E', '#2ED573', '#00D9FF', '#FFCE5C', '#A0FF5C',
    '#8C52FF', '#F7D100', '#7AFBFF', '#FF5C8A',
  ];
  const CASCADE_COUNT = 70;

  function _generateCascade() {
    const cascade = document.querySelector('.home-card-cascade');
    if (!cascade) return;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < CASCADE_COUNT; i++) {
      const card = document.createElement('div');
      card.className = 'home-cascade-card';
      const color = CASCADE_PALETTE[Math.floor(Math.random() * CASCADE_PALETTE.length)];
      const left = Math.random() * 100;
      const duration = 11 + Math.random() * 10;
      const delay = -Math.random() * duration;
      const scale = 0.55 + Math.random() * 0.7;
      card.style.setProperty('--cascade-color', color);
      card.style.setProperty('--cascade-duration', duration + 's');
      card.style.setProperty('--cascade-delay', delay + 's');
      card.style.setProperty('--cascade-scale', scale);
      card.style.left = left + '%';
      frag.appendChild(card);
    }
    cascade.appendChild(frag);
  }

  // ─── OUTPUT ICONS ───────────────────────────────────────────────
  // 60 emoji items shoot out from core through the 6 gaps between
  // agent cards (gap angles: 30/90/150/210/270/330).
  const OUTPUT_ICONS = [
    // Communication / messaging
    '\u{1F4E7}','\u{1F4E8}','✉️','\u{1F48C}','\u{1F4E4}','\u{1F4E5}','\u{1F4EC}','\u{1F4ED}','\u{1F4EE}','\u{1F4DE}','\u{1F4F2}','\u{1F4AC}','\u{1F4AD}','\u{1F4E2}','\u{1F4E3}','\u{1F514}','\u{1F426}','\u{1F5E8}️',
    // Documents
    '\u{1F4C4}','\u{1F4D1}','\u{1F4CB}','\u{1F4DD}','\u{1F4DC}','\u{1F4C3}','\u{1F4D2}','\u{1F4D3}','\u{1F4D5}','\u{1F4D7}','\u{1F4D8}','\u{1F4D9}','\u{1F4DA}','\u{1F5C2}️','\u{1F4C1}','\u{1F4C2}','\u{1F5C3}️','\u{1F5C4}️','\u{1F9FE}',
    // Charts / data / code
    '\u{1F4CA}','\u{1F4C8}','\u{1F4C9}','\u{1F4BE}','\u{1F517}','\u{1F9EE}','\u{1F4D0}','\u{1F4CF}','#️⃣',
    // Media — image / video / audio
    '\u{1F39E}️','\u{1F3AC}','\u{1F3A5}','\u{1F4F7}','\u{1F4F8}','\u{1F5BC}️','\u{1F4FA}','\u{1F4FB}','\u{1F3B5}','\u{1F3B6}','\u{1F3BC}','\u{1F3A4}','\u{1F3A7}','\u{1F399}️','\u{1F50A}','\u{1F3A8}','\u{1F58C}️','\u{1F58D}️',
    // Tech devices
    '\u{1F4BB}','\u{1F5A5}️','\u{1F4F1}','⌚','\u{1F4BD}','\u{1F4BF}','\u{1F4C0}','\u{1F5A8}️','\u{1F5B1}️','\u{1F3AE}','\u{1F579}️',
    // Marketing / business / commerce
    '\u{1F4F0}','\u{1F5DE}️','\u{1F3F7}️','\u{1F4BC}','\u{1F4B0}','\u{1F4B5}','\u{1F4B3}','\u{1F48E}','\u{1F6D2}','\u{1F9F0}','\u{1F39F}️','\u{1F3AB}','\u{1F4E6}','\u{1F381}','\u{1F3C6}','\u{1F947}','\u{1F396}️','\u{1F3C5}','\u{1F3AF}','\u{1F4CC}','\u{1F4CD}',
    // Energy / ideas / brand flair
    '⭐','\u{1F31F}','✨','\u{1F4A1}','\u{1F680}','⚡','\u{1F525}','\u{1F310}','\u{1F4E1}','\u{1F30D}','⚙️','\u{1F527}','\u{1F50D}','\u{1F510}','❤️','\u{1F389}','\u{1F38A}','\u{1F44D}',
  ];
  // Gaps between agent cards (CSS rotate scheme: 0°=up, clockwise).
  // Cards sit at 0/60/120/180/240/300; gaps are at the midpoints.
  const OUTPUT_BASE_ANGLES = [30, 90, 150, 210, 270, 330];
  const OUTPUT_COUNT = 60;
  const OUTPUT_DELAY_START = 7.5; // matches inside-cascade-ripple end + buffer

  function _generateOutputs() {
    const outputs = document.querySelector('.home-output-icons');
    if (!outputs) return;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < OUTPUT_COUNT; i++) {
      const wrap = document.createElement('span');
      wrap.className = 'home-output-icon-wrap';
      const icon = document.createElement('span');
      icon.className = 'home-output-icon';
      icon.textContent = OUTPUT_ICONS[Math.floor(Math.random() * OUTPUT_ICONS.length)];
      wrap.appendChild(icon);
      const baseAngle = OUTPUT_BASE_ANGLES[i % OUTPUT_BASE_ANGLES.length];
      const angleJitter = (Math.random() - 0.5) * 36; // ±18° spread
      const angle = baseAngle + angleJitter;
      const duration = 4 + Math.random() * 4;             // 4–8s travel
      const delay = OUTPUT_DELAY_START + Math.random() * 5; // 7.5–12.5s start
      const size = 22;                                    // uniform
      wrap.style.setProperty('--angle', angle + 'deg');
      wrap.style.setProperty('--out-duration', duration + 's');
      wrap.style.setProperty('--out-delay', delay + 's');
      wrap.style.setProperty('--icon-size', size + 'px');
      frag.appendChild(wrap);
    }
    outputs.appendChild(frag);
  }

  // ─── AGENT CARDS (MCP cycle + EQ bars) ──────────────────────────
  // Each of the 6 agent cards gets an array of white MCP logos that
  // round-robin via card-mcp-cycle (Inside only), plus an array of
  // equalizer bars that animate via eq-bounce (Inside only).
  const MCP_LOGO_URLS = [
    'https://cdn.simpleicons.org/github/ffffff',
    'https://cdn.simpleicons.org/hubspot/ffffff',
    'https://cdn.simpleicons.org/stripe/ffffff',
    'https://cdn.simpleicons.org/atlassian/ffffff',
    'https://cdn.simpleicons.org/linear/ffffff',
    'https://cdn.simpleicons.org/notion/ffffff',
    'https://cdn.simpleicons.org/sentry/ffffff',
    'https://cdn.simpleicons.org/zapier/ffffff',
    'https://cdn.simpleicons.org/figma/ffffff',
    'https://cdn.simpleicons.org/cloudflare/ffffff',
    'https://cdn.simpleicons.org/airtable/ffffff',
    'https://cdn.simpleicons.org/miro/ffffff',
    'https://cdn.simpleicons.org/vercel/ffffff',
    'https://cdn.simpleicons.org/asana/ffffff',
    'https://cdn.simpleicons.org/replicate/ffffff',
    'https://cdn.simpleicons.org/gmail/ffffff',
    'https://cdn.simpleicons.org/googledrive/ffffff',
    'https://cdn.simpleicons.org/googlecalendar/ffffff',
    'https://cdn.simpleicons.org/pagerduty/ffffff',
    'https://cdn.simpleicons.org/intercom/ffffff',
  ];
  const STEP_DURATION = 3; // seconds per MCP logo step
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function _enhanceAgentCards() {
    const cards = document.querySelectorAll('.home-agent-card');
    if (!cards.length) return;
    cards.forEach((card, cardIdx) => {
      // Insert all MCP logos in this card. Round-robin offset by
      // cardIdx ensures the 6 cards never show the same MCP at once.
      const mcpGroup = document.createElementNS(SVG_NS, 'g');
      mcpGroup.setAttribute('class', 'home-card-mcp-cycle');
      const N = MCP_LOGO_URLS.length;
      for (let p = 0; p < N; p++) {
        const href = MCP_LOGO_URLS[(p + cardIdx) % N];
        const img = document.createElementNS(SVG_NS, 'image');
        img.setAttribute('class', 'home-card-mcp');
        img.setAttribute('href', href);
        img.setAttribute('x', '-50');
        img.setAttribute('y', '-155');
        img.setAttribute('width', '100');
        img.setAttribute('height', '100');
        img.style.setProperty('--mcp-cycle-delay', (p * STEP_DURATION) + 's');
        mcpGroup.appendChild(img);
      }
      const agentText = card.querySelector('text');
      card.insertBefore(mcpGroup, agentText);

      // Equalizer bars — hidden by default, only visible on Inside.
      const eqGroup = document.createElementNS(SVG_NS, 'g');
      eqGroup.setAttribute('class', 'home-card-eq');
      const BAR_COUNT = 14;
      const BAR_WIDTH = 12;
      const BAR_SPACING = 4;
      const BAR_AREA_WIDTH = BAR_COUNT * BAR_WIDTH + (BAR_COUNT - 1) * BAR_SPACING;
      const startX = -BAR_AREA_WIDTH / 2;
      for (let i = 0; i < BAR_COUNT; i++) {
        const bar = document.createElementNS(SVG_NS, 'rect');
        bar.setAttribute('class', 'home-eq-bar');
        bar.setAttribute('x', String(startX + i * (BAR_WIDTH + BAR_SPACING)));
        bar.setAttribute('y', '70');
        bar.setAttribute('width', String(BAR_WIDTH));
        bar.setAttribute('height', '30');
        bar.setAttribute('rx', '2');
        bar.style.setProperty('--eq-delay', (Math.random() * 0.95).toFixed(2) + 's');
        eqGroup.appendChild(bar);
      }
      const badge = card.querySelector('.home-card-badge');
      card.insertBefore(eqGroup, badge);
    });
  }

  // ─── IMAGE PRE-WARM ─────────────────────────────────────────────
  // Browser image cache for every MCP + LLM URL referenced in the SVG
  // and the agent-card MCP cycle so <image href> never shows the
  // broken-placeholder while a fetch is in flight.
  const PREWARM_URLS = [
    // MCP umbrellas referenced directly in the SVG
    'https://cdn.simpleicons.org/github',
    'https://cdn.simpleicons.org/hubspot/FF7A59',
    'https://cdn.simpleicons.org/stripe/635BFF',
    'https://cdn.simpleicons.org/atlassian/0052CC',
    'https://cdn.simpleicons.org/notion/000000',
    // Agent-card MCP cycle
    ...MCP_LOGO_URLS,
  ];
  function _preWarmImages() {
    PREWARM_URLS.forEach((url) => { const i = new Image(); i.src = url; });
  }

  // ─── HUD TICKS ──────────────────────────────────────────────────
  // 36 radial tick marks around the inside of the HUD frame on Intro.
  // Each tick gets a stagger delay so they pulse around the rim in a
  // continuous scan rather than firing in sync.
  const TICK_COUNT = 36;
  const TICK_R_INNER = 2325;
  const TICK_R_OUTER = 2440;

  function _generateHUDTicks() {
    const ticks = document.querySelector('.home-hud-ticks');
    if (!ticks) return;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < TICK_COUNT; i++) {
      const tick = document.createElementNS(SVG_NS, 'line');
      tick.setAttribute('class', 'home-hud-tick');
      tick.setAttribute('x1', '0');
      tick.setAttribute('y1', String(-TICK_R_INNER));
      tick.setAttribute('x2', '0');
      tick.setAttribute('y2', String(-TICK_R_OUTER));
      tick.setAttribute('transform', `translate(2500 2500) rotate(${i * 10})`);
      tick.style.setProperty('--tick-delay', ((i * 5 / TICK_COUNT)).toFixed(2) + 's');
      frag.appendChild(tick);
    }
    ticks.appendChild(frag);
  }

  // ─── SCHEMATIC TRACES ───────────────────────────────────────────
  // Manhattan-routed circuit traces drifting across the Intro
  // background. Each trace starts at an edge, makes 2-4 right-angle
  // turns, ends with a small square pad. Traces fade in/out on a
  // staggered loop so the background reads as live blueprint art.
  const TRACE_COUNT = 28;
  const TRACE_VB_W = 1600;
  const TRACE_VB_H = 900;

  function _generateSchematicTraces() {
    const host = document.querySelector('.home-schematic-traces');
    if (!host) return;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < TRACE_COUNT; i++) {
      const startEdge = Math.floor(Math.random() * 4); // 0=top 1=right 2=bottom 3=left
      let x = 0, y = 0;
      if (startEdge === 0) { x = Math.random() * TRACE_VB_W; y = 0; }
      else if (startEdge === 1) { x = TRACE_VB_W; y = Math.random() * TRACE_VB_H; }
      else if (startEdge === 2) { x = Math.random() * TRACE_VB_W; y = TRACE_VB_H; }
      else { x = 0; y = Math.random() * TRACE_VB_H; }

      const segs = 2 + Math.floor(Math.random() * 3); // 2-4 turns
      let d = `M ${x.toFixed(0)} ${y.toFixed(0)}`;
      let horizontal = startEdge === 1 || startEdge === 3;
      for (let s = 0; s < segs; s++) {
        if (horizontal) {
          const dx = (40 + Math.random() * 180) * (startEdge === 1 ? -1 : (Math.random() > 0.5 ? 1 : -1));
          x = Math.max(20, Math.min(TRACE_VB_W - 20, x + dx));
          d += ` L ${x.toFixed(0)} ${y.toFixed(0)}`;
        } else {
          const dy = (40 + Math.random() * 180) * (startEdge === 2 ? -1 : (Math.random() > 0.5 ? 1 : -1));
          y = Math.max(20, Math.min(TRACE_VB_H - 20, y + dy));
          d += ` L ${x.toFixed(0)} ${y.toFixed(0)}`;
        }
        horizontal = !horizontal;
      }

      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('class', 'home-schematic-trace');
      path.setAttribute('d', d);
      const delay = (-Math.random() * 7).toFixed(2) + 's';
      path.style.setProperty('--trace-delay', delay);
      frag.appendChild(path);

      // End-pad: small filled rect at the last vertex
      const padSize = 4 + Math.floor(Math.random() * 4);
      const pad = document.createElementNS(SVG_NS, 'rect');
      pad.setAttribute('class', 'home-schematic-trace-end');
      pad.setAttribute('x', (x - padSize / 2).toFixed(0));
      pad.setAttribute('y', (y - padSize / 2).toFixed(0));
      pad.setAttribute('width', String(padSize));
      pad.setAttribute('height', String(padSize));
      pad.style.setProperty('--trace-delay', delay);
      frag.appendChild(pad);
    }
    host.appendChild(frag);
  }

  // ─── STAGE CARD HEIGHT ──────────────────────────────────────────
  // The persistent card at the bottom holds 6 absolute-positioned
  // panes (one per stage). The frame's height transitions to the
  // active pane's offsetHeight so the card resizes smoothly when
  // the user scrolls between stages.
  let _frame = null;
  let _panes = null;

  function _activeStage() {
    const cls = document.body.className;
    const m = cls.match(/stage-([a-z]+)/);
    return m ? m[1] : null;
  }
  function _measure() {
    if (!_frame) return;
    const stage = _activeStage();
    if (!stage) return;
    const pane = _panes[stage];
    if (!pane) return;
    _frame.style.height = pane.offsetHeight + 'px';
  }
  function _initStageCard() {
    _frame = document.querySelector('.home-stage-card-frame');
    if (!_frame) return;
    _panes = {};
    document.querySelectorAll('.home-stage-card-pane').forEach((p) => {
      _panes[p.dataset.stage] = p;
    });
    _measure();
    // Re-measure when the active stage class changes on body.
    new MutationObserver(_measure).observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });
    // And when the viewport resizes (line-wrapping changes pane height).
    window.addEventListener('resize', _measure);
    // Final pass once fonts have loaded (FA, Orbitron) — text height
    // can shift when web fonts swap in.
    if (document.fonts?.ready) {
      document.fonts.ready.then(_measure);
    } else {
      setTimeout(_measure, 600);
    }
  }

  function init() {
    _preWarmImages();
    _generateShower();
    _generateCascade();
    _generateOutputs();
    _enhanceAgentCards();
    _generateHUDTicks();
    _generateSchematicTraces();
    _initStageCard();
  }

  return { init };
})();
