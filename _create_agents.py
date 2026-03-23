#!/usr/bin/env python3
"""Create agents.html based on blueprints.html shell + new content."""

with open('blueprints.html', 'r') as f:
    bp = f.read()

# Extract: everything up to and including </nav>\n
nav_end = bp.index('</nav>\n') + len('</nav>\n')
shell_top = bp[:nav_end]

# Update title
shell_top = shell_top.replace(
    '<title>Nice Spaceship — Agentic Intelligence &amp; Engineering</title>',
    '<title>Nice Spaceship — Agents</title>'
)

# Extract: footer through end of file
footer_start = bp.index('\n<footer>')
shell_bottom = bp[footer_start:]

# Build page content
page_content = '''
<!-- PAGE -->
<div class="page">

  <!-- HERO -->
  <section class="hero sec" id="agents-hero">
    <div class="inner">
      <div class="sec-label">AGENT INTELLIGENCE</div>
      <h1 class="hero-title" style="font-size:clamp(2rem,6vw,4rem);max-width:700px;line-height:1.1;">
        Meet Your <span class="hl">Agents.</span>
      </h1>
      <p style="font-size:clamp(0.9rem,2vw,1.1rem);color:var(--text-muted);max-width:560px;line-height:1.75;margin-top:16px;">
        AI agents work for you around the clock. They handle tasks, make decisions, and report back &mdash; no micromanaging required.
      </p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:28px;">
        <a href="./blueprints.html" class="btn btn-solid">Browse All Agents &rarr;</a>
        <a href="./atm.html" class="btn btn-outline">Open ATM&trade; Dashboard</a>
      </div>
      <div style="display:flex;gap:20px;flex-wrap:wrap;margin-top:40px;">
        <span class="hud-stat" style="border:1px solid var(--border);padding:10px 20px;font-size:0.82rem;">20 Agent Blueprints</span>
        <span class="hud-stat" style="border:1px solid var(--border);padding:10px 20px;font-size:0.82rem;">15 Fleet Templates</span>
        <span class="hud-stat" style="border:1px solid var(--border);padding:10px 20px;font-size:0.82rem;">10+ Community Blueprints</span>
        <span class="hud-stat" style="border:1px solid var(--border);padding:10px 20px;font-size:0.82rem;">5 Agent Types</span>
      </div>
    </div>
  </section>

  <!-- WHAT IS AN AGENT? -->
  <section class="sec" id="what-is-agent" style="background:var(--bg-alt);">
    <div class="inner">
      <div class="sec-label">THE BASICS</div>
      <h2 class="sec-title">What is an AI agent?</h2>
      <p style="color:var(--text-muted);max-width:600px;line-height:1.8;margin-top:12px;font-size:0.9rem;">
        An AI agent is software that gets a goal, makes a plan, uses tools to carry it out, and reports when done. Think of it as a very capable employee who works instantly, never sleeps, and costs a fraction of a full-time hire.
      </p>

      <!-- Simple flow diagram -->
      <div style="display:flex;align-items:center;gap:0;flex-wrap:wrap;margin-top:40px;overflow:hidden;border:1px solid var(--border);">
        <div style="flex:1;min-width:140px;padding:28px 20px;text-align:center;border-right:1px solid var(--border);">
          <div style="font-size:1.5rem;margin-bottom:8px;">&#127919;</div>
          <div style="font-family:var(--font-m);font-size:0.62rem;letter-spacing:.1em;color:var(--accent);margin-bottom:6px;">STEP 1</div>
          <div style="font-size:0.85rem;font-weight:600;">You set the goal</div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;line-height:1.5;">"Respond to support emails"</div>
        </div>
        <div style="flex:1;min-width:140px;padding:28px 20px;text-align:center;border-right:1px solid var(--border);background:color-mix(in srgb,var(--accent) 5%,transparent);">
          <div style="font-size:1.5rem;margin-bottom:8px;">&#129504;</div>
          <div style="font-family:var(--font-m);font-size:0.62rem;letter-spacing:.1em;color:var(--accent);margin-bottom:6px;">STEP 2</div>
          <div style="font-size:0.85rem;font-weight:600;">Agent makes a plan</div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;line-height:1.5;">Reads inbox, classifies, drafts replies</div>
        </div>
        <div style="flex:1;min-width:140px;padding:28px 20px;text-align:center;border-right:1px solid var(--border);">
          <div style="font-size:1.5rem;margin-bottom:8px;">&#128295;</div>
          <div style="font-family:var(--font-m);font-size:0.62rem;letter-spacing:.1em;color:var(--accent);margin-bottom:6px;">STEP 3</div>
          <div style="font-size:0.85rem;font-weight:600;">Uses tools to act</div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;line-height:1.5;">Gmail, Slack, helpdesk integrations</div>
        </div>
        <div style="flex:1;min-width:140px;padding:28px 20px;text-align:center;">
          <div style="font-size:1.5rem;margin-bottom:8px;">&#9989;</div>
          <div style="font-family:var(--font-m);font-size:0.62rem;letter-spacing:.1em;color:var(--accent);margin-bottom:6px;">STEP 4</div>
          <div style="font-size:0.85rem;font-weight:600;">Reports back to you</div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;line-height:1.5;">Summary, stats, anything that needs review</div>
        </div>
      </div>
    </div>
  </section>

  <!-- 5 AGENT TYPES -->
  <section class="sec" id="agent-types">
    <div class="inner">
      <div class="sec-label">AGENT CATEGORIES</div>
      <h2 class="sec-title">5 types of agents</h2>
      <p style="color:var(--text-muted);max-width:560px;line-height:1.8;margin-top:12px;font-size:0.9rem;">
        Every agent in our library fits into one of five categories. Each is built for a different kind of work.
      </p>

      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin-top:36px;">
        <div class="panel hud" style="padding:24px 20px;">
          <div style="font-family:var(--font-m);font-size:0.6rem;letter-spacing:.12em;color:var(--accent);margin-bottom:10px;">TYPE 01</div>
          <div style="font-size:0.95rem;font-weight:700;margin-bottom:8px;">Automation</div>
          <p style="font-size:0.8rem;color:var(--text-muted);line-height:1.6;">Takes repetitive tasks and handles them end-to-end. No manual steps. No waiting.</p>
          <div style="margin-top:14px;font-size:0.72rem;color:var(--text-muted);">Code Reviewer &bull; SEO Optimizer &bull; Supply Chain Monitor</div>
        </div>
        <div class="panel hud" style="padding:24px 20px;">
          <div style="font-family:var(--font-m);font-size:0.6rem;letter-spacing:.12em;color:var(--accent);margin-bottom:10px;">TYPE 02</div>
          <div style="font-size:0.95rem;font-weight:700;margin-bottom:8px;">Intelligence</div>
          <p style="font-size:0.8rem;color:var(--text-muted);line-height:1.6;">Searches, analyzes, and surfaces insights from any data source you point it at.</p>
          <div style="margin-top:14px;font-size:0.72rem;color:var(--text-muted);">Research Navigator &bull; Lead Scout &bull; Knowledge Curator</div>
        </div>
        <div class="panel hud" style="padding:24px 20px;">
          <div style="font-family:var(--font-m);font-size:0.6rem;letter-spacing:.12em;color:var(--accent);margin-bottom:10px;">TYPE 03</div>
          <div style="font-size:0.95rem;font-weight:700;margin-bottom:8px;">Content</div>
          <p style="font-size:0.8rem;color:var(--text-muted);line-height:1.6;">Writes, edits, and publishes. Blog posts to legal contracts &mdash; all on-brand.</p>
          <div style="margin-top:14px;font-size:0.72rem;color:var(--text-muted);">Content Broadcaster &bull; Document Scribe &bull; Sales Enabler</div>
        </div>
        <div class="panel hud" style="padding:24px 20px;">
          <div style="font-family:var(--font-m);font-size:0.6rem;letter-spacing:.12em;color:var(--accent);margin-bottom:10px;">TYPE 04</div>
          <div style="font-size:0.95rem;font-weight:700;margin-bottom:8px;">Operations</div>
          <p style="font-size:0.8rem;color:var(--text-muted);line-height:1.6;">Keeps your business running. Tickets, scheduling, HR, comms &mdash; handled.</p>
          <div style="margin-top:14px;font-size:0.72rem;color:var(--text-muted);">Customer Comms &bull; Mission Planner &bull; Support Specialist</div>
        </div>
        <div class="panel hud" style="padding:24px 20px;border-color:var(--accent);box-shadow:var(--glow);">
          <div style="font-family:var(--font-m);font-size:0.6rem;letter-spacing:.12em;color:var(--accent);margin-bottom:10px;">TYPE 05</div>
          <div style="font-size:0.95rem;font-weight:700;margin-bottom:8px;">Fleet</div>
          <p style="font-size:0.8rem;color:var(--text-muted);line-height:1.6;">Multiple agents working together as a coordinated team for your entire business.</p>
          <div style="margin-top:14px;font-size:0.72rem;color:var(--text-muted);">SaaS Startup &bull; Marketing Agency &bull; Software Studio</div>
        </div>
      </div>
    </div>
  </section>

  <!-- FEATURED AGENT MARKETPLACE -->
  <section class="sec" id="agents-marketplace" style="background:var(--bg-alt);">
    <div class="inner">
      <div style="display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:16px;margin-bottom:32px;">
        <div>
          <div class="sec-label">AGENT MARKETPLACE</div>
          <h2 class="sec-title" style="margin-bottom:0;">Top-rated agent blueprints</h2>
        </div>
        <a href="./blueprints.html" class="btn btn-outline" style="flex-shrink:0;">Browse All 20 Agents &rarr;</a>
      </div>
      <div class="tcg-grid" id="bp-agents-grid">
        <!-- Populated by BP.renderFeatured() -->
      </div>
    </div>
  </section>

  <!-- FLEET PREVIEW -->
  <section class="sec" id="agents-fleets">
    <div class="inner">
      <div style="display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:16px;margin-bottom:32px;">
        <div>
          <div class="sec-label">FLEET BLUEPRINTS</div>
          <h2 class="sec-title" style="margin-bottom:0;">Pre-built fleets by industry</h2>
        </div>
        <a href="./blueprints.html#fleet" class="btn btn-outline" style="flex-shrink:0;">All 15 Fleets &rarr;</a>
      </div>
      <div class="tcg-grid" id="bp-fleets-grid">
        <!-- Populated by BP.renderFeatured() -->
      </div>
    </div>
  </section>

  <!-- BUILD FOR MARKETPLACE -->
  <section class="sec" id="agents-build" style="background:var(--bg-alt);">
    <div class="inner">
      <div class="sec-label">FOR DEVELOPERS</div>
      <h2 class="sec-title">Build an agent. Publish it. Earn.</h2>
      <p style="color:var(--text-muted);max-width:580px;line-height:1.8;margin-top:12px;font-size:0.9rem;">
        Got a great agent idea? Build it on ATM&trade;, submit it to the marketplace, and share it with thousands of businesses. Top agents are featured, credited, and earn royalties.
      </p>

      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:24px;margin-top:40px;">
        <div style="display:flex;gap:16px;">
          <div style="width:40px;height:40px;flex-shrink:0;border:1px solid var(--accent);display:flex;align-items:center;justify-content:center;font-family:var(--font-m);font-size:0.8rem;color:var(--accent);">01</div>
          <div>
            <div style="font-size:0.9rem;font-weight:600;margin-bottom:6px;">Design your blueprint</div>
            <p style="font-size:0.8rem;color:var(--text-muted);line-height:1.6;">Define your agent&rsquo;s role, tools, workflow steps, and target use case. Use the Blueprint Editor in ATM&trade;.</p>
          </div>
        </div>
        <div style="display:flex;gap:16px;">
          <div style="width:40px;height:40px;flex-shrink:0;border:1px solid var(--accent);display:flex;align-items:center;justify-content:center;font-family:var(--font-m);font-size:0.8rem;color:var(--accent);">02</div>
          <div>
            <div style="font-size:0.9rem;font-weight:600;margin-bottom:6px;">Test and submit</div>
            <p style="font-size:0.8rem;color:var(--text-muted);line-height:1.6;">Run your agent in the ATM&trade; sandbox, fix any issues, then submit for review. We review within 3 business days.</p>
          </div>
        </div>
        <div style="display:flex;gap:16px;">
          <div style="width:40px;height:40px;flex-shrink:0;border:1px solid var(--accent);display:flex;align-items:center;justify-content:center;font-family:var(--font-m);font-size:0.8rem;color:var(--accent);">03</div>
          <div>
            <div style="font-size:0.9rem;font-weight:600;margin-bottom:6px;">Go live and earn</div>
            <p style="font-size:0.8rem;color:var(--text-muted);line-height:1.6;">Your blueprint goes live in the marketplace. You get credit, exposure, and royalties for every deploy.</p>
          </div>
        </div>
      </div>

      <div style="margin-top:36px;display:flex;gap:12px;flex-wrap:wrap;">
        <a href="./academy.html" class="btn btn-solid">Start Learning to Build &rarr;</a>
        <a href="./atm.html" class="btn btn-outline">Open Blueprint Editor</a>
      </div>
    </div>
  </section>

  <!-- SUBMIT CTA -->
  <section class="sec" id="agents-submit">
    <div class="inner">
      <div class="panel hud contact-box" style="padding:56px 40px;text-align:center;">
        <div class="sec-label" style="display:block;border-left:none;border-bottom:2px solid var(--accent);padding-left:0;padding-bottom:6px;margin-bottom:20px;">Submit Your Blueprint</div>
        <h2 class="sec-title" style="font-size:clamp(1.6rem,4vw,2.6rem);">Ready to <span class="hl">share your agent?</span></h2>
        <p style="font-size:0.85rem;line-height:1.75;color:var(--text-muted);margin-top:14px;max-width:520px;margin-left:auto;margin-right:auto;">Built something great? Submit it for marketplace review. Accepted blueprints are featured, credited to you, and available to every Nice Spaceship customer.</p>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:28px;">
          <a href="./blueprints.html#community" class="btn btn-solid">Submit to Community &rarr;</a>
          <a href="./contact.html" class="btn btn-outline">Talk to Our Team</a>
        </div>
      </div>
    </div>
  </section>

</div><!-- /page -->

<script>
// Render featured agent + fleet cards on this page
document.addEventListener('DOMContentLoaded', function() {
  if (typeof BP !== 'undefined') {
    BP.renderFeatured('bp-agents-grid', 'agent', 10);
    BP.renderFeatured('bp-fleets-grid', 'fleet', 5);
  }
});
</script>
'''

agents_html = shell_top + page_content + shell_bottom

with open('agents.html', 'w') as f:
    f.write(agents_html)
print('agents.html created.')
