#!/usr/bin/env python3
"""
1. blueprints.html: replace static card grid with empty tcg-grid container
2. app.js: add renderFeatured() to BP module
"""

# ─── 1. blueprints.html ───────────────────────────────────────────────────

with open('blueprints.html', 'r') as f:
    bp_html = f.read()

# Replace the grid opening div class and remove all static cards
OLD_GRID_OPEN = '      <div class="bp-lib-grid" id="bp-lib-grid">'
OLD_GRID_CLOSE = '      </div><!-- /bp-lib-grid -->'

new_grid = '      <div class="tcg-grid" id="bp-lib-grid">\n        <!-- Cards rendered by BP.init() -->\n      </div><!-- /bp-lib-grid -->'

# Find start and end
start = bp_html.index(OLD_GRID_OPEN)
end   = bp_html.index(OLD_GRID_CLOSE) + len(OLD_GRID_CLOSE)
bp_html = bp_html[:start] + new_grid + bp_html[end:]

with open('blueprints.html', 'w') as f:
    f.write(bp_html)
print('blueprints.html patched.')

# ─── 2. app.js: add renderFeatured() to BP module ────────────────────────

with open('public/js/app.js', 'r') as f:
    app = f.read()

# Add renderFeatured function just before the return statement in BP module
OLD_RETURN = '  return { init, switchTab, filter, filterTag, fav, closeEdit, saveEdit, saveBP, share, build };'
NEW_RETURN = '''\
  function renderFeatured(gridId, type, count) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    const all  = type === 'fleet' ? FLEET_BPS : AGENT_BPS;
    const order = { legendary:0, epic:1, rare:2, common:3 };
    const sorted = [...all].sort((a, b) => (order[a.rarity]||3) - (order[b.rarity]||3));
    grid.innerHTML = sorted.slice(0, count).map(bp => _tcgCardHTML(bp, type)).join('');
    // attach events
    grid.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]') || e.target.closest('[data-fav]');
      if (!btn) return;
      const id  = btn.dataset.id || btn.dataset.fav;
      const act = btn.dataset.action || 'fav';
      if (act === 'savebp') saveBP(id);
      if (act === 'build')  build(id);
      if (act === 'fav')    fav(id);
    });
  }

  return { init, switchTab, filter, filterTag, fav, closeEdit, saveEdit, saveBP, share, build, renderFeatured };'''

app = app.replace(OLD_RETURN, NEW_RETURN, 1)

with open('public/js/app.js', 'w') as f:
    f.write(app)
print('app.js renderFeatured() added.')
