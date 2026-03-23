#!/usr/bin/env python3
import os

WDIR = '/Users/ben/Documents/GitHub/nicespaceship.com/.claude/worktrees/happy-blackwell/'

def read(p): 
    with open(p) as f: return f.read()
def write(p, c): 
    with open(p, 'w') as f: f.write(c)

# ══════════════════════════════════════════════════════════════════
# INDEX.HTML  — Remove 3 ATM sections, replace Pillars with Fleet
# ══════════════════════════════════════════════════════════════════

DEMO_STRIP = '''
  <!-- DEMO CTA STRIP -->
  <section class="demo-strip">
    <div class="inner">
      <div class="demo-strip-inner">

        <!-- Animated orbital SVG -->
        <div class="demo-strip-viz" aria-hidden="true">
          <svg class="dcs-svg" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
            <!-- Static outer ring -->
            <circle cx="80" cy="80" r="72" stroke="currentColor" stroke-width="1" opacity=".1"/>
            <!-- Outer orbit group (CW) -->
            <g class="dcs-outer-g">
              <circle cx="80" cy="8"  r="5" fill="var(--accent)" opacity=".7"/>
              <circle cx="152" cy="80" r="4" fill="var(--accent)" opacity=".5"/>
              <circle cx="80" cy="152" r="5" fill="var(--accent)" opacity=".6"/>
              <circle cx="8"   cy="80" r="4" fill="var(--accent)" opacity=".5"/>
              <circle cx="80" cy="80" r="68" stroke="var(--accent)" stroke-width="1" stroke-dasharray="4 8" opacity=".2"/>
            </g>
            <!-- Inner orbit group (CCW) -->
            <g class="dcs-inner-g">
              <circle cx="80" cy="36" r="4"  fill="var(--border-hi)" opacity=".8"/>
              <circle cx="124" cy="80" r="3.5" fill="var(--border-hi)" opacity=".6"/>
              <circle cx="80" cy="124" r="4" fill="var(--border-hi)" opacity=".7"/>
              <circle cx="36"  cy="80" r="3.5" fill="var(--border-hi)" opacity=".6"/>
              <circle cx="80" cy="80" r="44" stroke="var(--border-hi)" stroke-width="1" stroke-dasharray="3 6" opacity=".15"/>
            </g>
            <!-- ATM Core -->
            <circle cx="80" cy="80" r="24" fill="var(--surface)" stroke="var(--accent)" stroke-width="1.5"/>
            <text x="80" y="77" text-anchor="middle" fill="var(--accent)" font-family="var(--font-d)" font-size="7" font-weight="700" letter-spacing="1">NS</text>
            <text x="80" y="88" text-anchor="middle" fill="var(--accent)" font-family="var(--font-d)" font-size="7" font-weight="700" letter-spacing="1">ATM</text>
          </svg>
        </div>

        <!-- Copy + CTAs -->
        <div class="demo-strip-copy">
          <div class="dcs-eyebrow">&#9679; Interactive Demo — No Login Required</div>
          <h2 class="dcs-title">See Four AI Agents Working<br/>In Real Time</h2>
          <p class="dcs-desc">Watch four AI agents work live — customer service, research, content, and analytics. No login, no setup.</p>
          <div class="dcs-btns">
            <a href="./demo/atm/" class="btn btn-solid">Launch Interactive Demo &rarr;</a>
            <a href="./demo/"     class="btn">View All Demos</a>
          </div>
          <div class="dcs-tags">
            <span class="dcs-tag">4 Live Agents</span>
            <span class="dcs-tag">No Account Needed</span>
            <span class="dcs-tag">Resets on Refresh</span>
            <span class="dcs-tag">All Themes</span>
          </div>
        </div>

      </div>
    </div>
  </section>

  <!-- ATM SUMMARY -->
  <section class="sec atm-sec" id="atm">
    <div class="inner">
      <div class="atm-grid">
        <div style="display:flex;flex-direction:column;align-items:center;">
          <div class="atm-visual">
            <div class="ring ring-1"></div>
            <div class="ring ring-2"></div>
            <div class="ring ring-3"></div>
            <div class="atm-core">
              <div class="atm-core-txt">ATM&trade;<br/><span style="font-size:0.7em;opacity:0.65;">CORE</span></div>
            </div>
            <div class="orb" style="top:-1%;left:50%;transform:translate(-50%,-50%);"></div>
            <div class="orb" style="top:50%;right:-1%;transform:translate(50%,-50%);animation-delay:.6s;"></div>
            <div class="orb" style="bottom:-1%;left:50%;transform:translate(-50%,50%);animation-delay:1.2s;"></div>
            <div class="orb" style="top:50%;left:-1%;transform:translate(-50%,-50%);animation-delay:1.8s;"></div>
          </div>
          <div class="radar">
            <div class="radar-c"></div><div class="radar-c"></div><div class="radar-c"></div>
            <div class="radar-sweep"></div>
            <div class="radar-blip" style="top:28%;left:64%;animation-delay:.4s;"></div>
            <div class="radar-blip" style="top:62%;left:22%;animation-delay:1.4s;"></div>
          </div>
        </div>
        <div>
          <div class="sec-label">Flagship Product</div>
          <h2 class="sec-title" style="margin-bottom:8px;">Agent Task<br/><span class="hl">Manager&trade;</span></h2>
          <p class="label-sm" style="margin-bottom:20px;">ATM &mdash; ORCHESTRATION LAYER v3.5</p>
          <p style="font-size:0.88rem;line-height:1.75;color:var(--text-muted);margin-bottom:24px;">Spin up, monitor, and retire AI agents across any infrastructure &mdash; from local LLMs to cloud scale.</p>
          <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:28px;">
            <div class="panel" style="padding:11px 16px;display:flex;align-items:center;gap:12px;"><span class="text-accent font-mono" style="font-size:10px;min-width:22px;">01</span><span style="font-size:0.82rem;color:var(--text-muted);">Real-time agent fleet monitoring &amp; orchestration</span></div>
            <div class="panel" style="padding:11px 16px;display:flex;align-items:center;gap:12px;"><span class="text-accent font-mono" style="font-size:10px;min-width:22px;">02</span><span style="font-size:0.82rem;color:var(--text-muted);">Task routing, priority queuing &amp; failure recovery</span></div>
            <div class="panel" style="padding:11px 16px;display:flex;align-items:center;gap:12px;"><span class="text-accent font-mono" style="font-size:10px;min-width:22px;">03</span><span style="font-size:0.82rem;color:var(--text-muted);">Multi-model: Claude, GPT-4, Gemini, local LLMs</span></div>
            <div class="panel" style="padding:11px 16px;display:flex;align-items:center;gap:12px;"><span class="text-accent font-mono" style="font-size:10px;min-width:22px;">04</span><span style="font-size:0.82rem;color:var(--text-muted);">Cost telemetry, audit logs &amp; compliance reporting</span></div>
          </div>
          <div style="display:flex;gap:12px;flex-wrap:wrap;">
            <a href="./contact.html" class="btn btn-solid">Request Beta Access</a>
            <a href="./atm.html"     class="btn">Full ATM&trade; Details</a>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- HOW IT WORKS -->
  <section class="sec" id="how-it-works" style="background:var(--bg-alt);">
    <div class="inner">
      <div style="max-width:580px;">
        <div class="sec-label">Process</div>
        <h2 class="sec-title h-icon"><span class="sec-icon"><svg class="icon icon-lg" aria-hidden="true"><use href="#icon-agent"/></svg></span>How ATM&trade; <span class="hl">Works</span></h2>
        <p style="font-size:.88rem;line-height:1.75;color:var(--text-muted);margin-top:14px;">From zero to autonomous fleet in three steps. No infrastructure expertise required.</p>
      </div>

      <div class="hiw-flow">

        <!-- Step 1 -->
        <div class="hiw-step">
          <div class="hiw-icon-wrap">
            <div class="hiw-icon-bg"></div>
            <div class="hiw-ring"></div>
            <div class="hiw-ring-2"></div>
            <div class="hiw-icon-inner">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
              </svg>
            </div>
          </div>
          <div class="hiw-num">Step 01</div>
          <div class="hiw-step-title">Define Your Fleet</div>
          <p class="hiw-step-desc">Pick pre-built Blueprints or define custom roles. Set triggers and LLM preferences in minutes.</p>
        </div>

        <!-- Arrow -->
        <div class="hiw-arrow" aria-hidden="true">
          <svg class="hiw-arr-svg" viewBox="0 0 48 14">
            <line class="hiw-arr-line" x1="0" y1="7" x2="40" y2="7" stroke="var(--accent)" stroke-width="1.5"/>
            <polyline points="36,2 44,7 36,12" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linejoin="round"/>
          </svg>
        </div>

        <!-- Step 2 -->
        <div class="hiw-step">
          <div class="hiw-icon-wrap">
            <div class="hiw-icon-bg"></div>
            <div class="hiw-ring"></div>
            <div class="hiw-ring-2"></div>
            <div class="hiw-icon-inner">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="2" y="3" width="20" height="14" rx="1"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><polyline points="7 8 10 11 7 14"/>
              </svg>
            </div>
          </div>
          <div class="hiw-num">Step 02</div>
          <div class="hiw-step-title">Deploy &amp; Monitor</div>
          <p class="hiw-step-desc">Monitor task queues, resources, and output quality from one dashboard. Real-time, always-on.</p>
        </div>

        <!-- Arrow -->
        <div class="hiw-arrow" aria-hidden="true">
          <svg class="hiw-arr-svg" viewBox="0 0 48 14">
            <line class="hiw-arr-line" x1="0" y1="7" x2="40" y2="7" stroke="var(--accent)" stroke-width="1.5"/>
            <polyline points="36,2 44,7 36,12" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linejoin="round"/>
          </svg>
        </div>

        <!-- Step 3 -->
        <div class="hiw-step">
          <div class="hiw-icon-wrap">
            <div class="hiw-icon-bg"></div>
            <div class="hiw-ring"></div>
            <div class="hiw-ring-2"></div>
            <div class="hiw-icon-inner">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            </div>
          </div>
          <div class="hiw-num">Step 03</div>
          <div class="hiw-step-title">Scale Automatically</div>
          <p class="hiw-step-desc">Agents self-heal and scale with demand. Full cost telemetry and audit logs at every step.</p>
        </div>

      </div>
    </div>
  </section>

  <!-- PILLARS (condensed) -->
  <section class="sec" id="solutions">'''

PILLARS_CLOSE = '''      <div style="margin-top:36px;">
        <a href="./solutions.html" class="btn btn-solid">View All Solutions</a>
      </div>
    </div>
  </section>

  <!-- INDUSTRY BLUEPRINTS -->'''

NEW_FLEET_SECTION = '''
  <!-- WHAT IS A FLEET -->
  <section class="sec" id="what-is-fleet">
    <div class="inner">
      <div style="max-width:680px;margin-bottom:0;">
        <div class="sec-label">Fleet Explained</div>
        <h2 class="sec-title h-icon"><span class="sec-icon"><svg class="icon icon-lg" aria-hidden="true"><use href="#icon-fleet"/></svg></span>What Is an <span class="hl">Agent Fleet?</span></h2>
        <p style="font-size:0.88rem;line-height:1.75;color:var(--text-muted);margin-top:14px;">A fleet is a group of AI agents working together on a shared mission. Each agent has one job &mdash; one researches, one writes, one monitors, one handles customers. Together they handle more than any single person could, running 24/7 without a break.</p>
        <p style="font-size:0.88rem;line-height:1.75;color:var(--text-muted);margin-top:12px;">Every fleet is managed through ATM&trade; &mdash; one dashboard, real-time visibility, total control.</p>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:16px;margin-top:40px;">
        <div class="panel hud" style="padding:24px 20px;text-align:center;">
          <div style="font-family:var(--font-m);font-size:0.55rem;letter-spacing:.14em;color:var(--accent);margin-bottom:10px;">STEP 01</div>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 10px;display:block;color:var(--accent)"><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18" stroke-opacity="0.5"/><rect x="9" y="9" width="6" height="6" stroke-opacity="0.9"/></svg>
          <div style="font-size:0.85rem;font-weight:600;margin-bottom:6px;">Pick a Template</div>
          <p style="font-size:0.78rem;color:var(--text-muted);line-height:1.6;">Choose a pre-built fleet template matched to your industry and goals.</p>
        </div>
        <div class="panel hud" style="padding:24px 20px;text-align:center;">
          <div style="font-family:var(--font-m);font-size:0.55rem;letter-spacing:.14em;color:var(--accent);margin-bottom:10px;">STEP 02</div>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 10px;display:block;color:var(--accent)"><rect x="3" y="3" width="5" height="5" rx="1"/><rect x="10" y="3" width="5" height="5" rx="1"/><rect x="17" y="3" width="4" height="5" rx="1"/><rect x="3" y="16" width="5" height="5" rx="1"/><rect x="10" y="16" width="5" height="5" rx="1"/><rect x="17" y="16" width="4" height="5" rx="1"/><path d="M5.5 8v4M12 8v4M19 8v4M5.5 16v-4M12 16v-4M19 16v-4M5.5 12h13.5"/></svg>
          <div style="font-size:0.85rem;font-weight:600;margin-bottom:6px;">Deploy Your Fleet</div>
          <p style="font-size:0.78rem;color:var(--text-muted);line-height:1.6;">Agents go live in minutes via ATM&trade;. No infrastructure setup required.</p>
        </div>
        <div class="panel hud" style="padding:24px 20px;text-align:center;">
          <div style="font-family:var(--font-m);font-size:0.55rem;letter-spacing:.14em;color:var(--accent);margin-bottom:10px;">STEP 03</div>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 10px;display:block;color:var(--accent)"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><polyline points="6,8 10,12 14,9 18,13"/></svg>
          <div style="font-size:0.85rem;font-weight:600;margin-bottom:6px;">Watch It Work</div>
          <p style="font-size:0.78rem;color:var(--text-muted);line-height:1.6;">Agents run tasks around the clock. Track every action from one dashboard.</p>
        </div>
        <div class="panel hud" style="padding:24px 20px;text-align:center;">
          <div style="font-family:var(--font-m);font-size:0.55rem;letter-spacing:.14em;color:var(--accent);margin-bottom:10px;">STEP 04</div>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 10px;display:block;color:var(--accent)"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          <div style="font-size:0.85rem;font-weight:600;margin-bottom:6px;">Scale as You Grow</div>
          <p style="font-size:0.78rem;color:var(--text-muted);line-height:1.6;">Add agents, swap roles, or expand capacity — without changing a line of code.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- FLEET TEMPLATES -->
  <section class="sec" id="fleet-templates" style="background:var(--bg-alt);">
    <div class="inner">
      <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:32px;">
        <div>
          <div class="sec-label">Fleet Templates</div>
          <h2 class="sec-title h-icon" style="margin-bottom:0;"><span class="sec-icon"><svg class="icon icon-lg" aria-hidden="true"><use href="#icon-fleet"/></svg></span>Ready-Made <span class="hl">Agent Teams</span></h2>
          <p style="font-size:0.85rem;color:var(--text-muted);margin-top:10px;max-width:520px;">Pre-configured fleets of specialist agents. Pick one, deploy via ATM&trade;, and your team is running in minutes.</p>
        </div>
        <a href="./blueprints.html#fleet" class="btn btn-outline" style="flex-shrink:0;">Browse All 15 Templates &rarr;</a>
      </div>
      <div class="tcg-grid" id="fleet-templates-grid">
        <!-- Fleet templates rendered by BP.renderFeatured() -->
      </div>
    </div>
  </section>

  <!-- INDUSTRY BLUEPRINTS -->'''

# Read index.html
idx = read(WDIR + 'index.html')

# Remove the three ATM sections + replace pillars with fleet content
# The block to remove starts at DEMO CTA STRIP and ends before INDUSTRY BLUEPRINTS
old_block = DEMO_STRIP + '\n' + PILLARS_CLOSE

if old_block not in idx:
    # try finding individual markers
    print("ERROR: Combined block not found in index.html")
    print("Checking individual pieces...")
    if '<!-- DEMO CTA STRIP -->' in idx: print("  - DEMO CTA STRIP found")
    if '<!-- ATM SUMMARY -->' in idx: print("  - ATM SUMMARY found")
    if '<!-- HOW IT WORKS -->' in idx: print("  - HOW IT WORKS found")
    if '<!-- PILLARS (condensed) -->' in idx: print("  - PILLARS found")
else:
    idx = idx.replace(old_block, NEW_FLEET_SECTION, 1)
    print("index.html: Replaced ATM sections + Pillars with Fleet content")

# Add Fleet Templates init script before </body>
if 'fleet-templates-grid' in idx and 'BP.renderFeatured(\'fleet-templates-grid' not in idx:
    FLEET_INIT = '''<script>
document.addEventListener('DOMContentLoaded', function() {
  if (typeof BP !== 'undefined') { BP.renderFeatured('fleet-templates-grid', 'fleet', 6); }
});
</script>
'''
    idx = idx.replace('<script src="./public/js/app.js"></script>\n</body>', 
                      '<script src="./public/js/app.js"></script>\n' + FLEET_INIT + '</body>')
    print("index.html: Added fleet templates init script")

write(WDIR + 'index.html', idx)
print("index.html saved.")

