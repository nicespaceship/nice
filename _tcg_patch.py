#!/usr/bin/env python3
"""Patches app.js: extends BP data with TCG fields and adds _tcgCardHTML render function."""

import sys

JS = 'public/js/app.js'

with open(JS, 'r') as f:
    content = f.read()

# ─── 1. AGENT_BPS replacement ──────────────────────────────────────────────

OLD_AGENT_START = "  const AGENT_BPS = ["
OLD_AGENT_END   = "  ];\n\n  const FLEET_BPS"

NEW_AGENT_BPS = """\
  const AGENT_BPS = [
    { id:'agent-01', icon:'icon-search',    name:'Research Navigator',    role:'Research · Analysis',         tags:['research','analysis'],          art:'intelligence', rarity:'rare',      card_num:'NS-001', agentType:'Intelligence Agent', flavor:'The first question is never the last.',      caps:['Web, paper & database search','2,000 briefings/month','Synthesises multi-source findings'],    stats:{spd:'4.2s',acc:'94%',cap:'2K',pwr:'82'}, desc:'Autonomous web research, source synthesis, and executive briefing generation.', tasks:['Research topic X','Synthesize findings','Generate executive summary'] },
    { id:'agent-02', icon:'icon-comms',     name:'Content Broadcaster',   role:'Content · Social',            tags:['content','social','writing'],    art:'content',      rarity:'common',    card_num:'NS-002', agentType:'Content Agent',      flavor:'Every channel. One voice.',                  caps:['Blog, social & newsletter output','500 pieces/month','Schedules posts automatically'],          stats:{spd:'3.8s',acc:'91%',cap:'500',pwr:'71'}, desc:'Multi-channel content creation across blogs, social media, and newsletters.', tasks:['Outline content calendar','Draft blog post','Schedule social posts'] },
    { id:'agent-03', icon:'icon-analytics', name:'Data Analyst',          role:'Analytics · Reporting',       tags:['analytics','data','reporting'],  art:'analytics',    rarity:'rare',      card_num:'NS-003', agentType:'Analytics Agent',    flavor:'Patterns hidden in plain data.',              caps:['CSV, API & database inputs','10,000 rows per run','Auto-generates charts & summaries'],       stats:{spd:'5.1s',acc:'97%',cap:'10K',pwr:'88'}, desc:'CSV and API data analysis with automated chart generation and insight summaries.', tasks:['Import data source','Analyze trends','Generate insights report'] },
    { id:'agent-04', icon:'icon-comms',     name:'Customer Comms',        role:'Support · Communications',    tags:['support','comms'],               art:'ops',          rarity:'common',    card_num:'NS-004', agentType:'Operations Agent',   flavor:'No inbox too full.',                          caps:['Triages & drafts replies','1,000 messages/month','Gmail, Outlook, Help Scout'],                stats:{spd:'2.3s',acc:'96%',cap:'1K',pwr:'74'}, desc:'Inbox management, response drafting, and customer communication workflows.', tasks:['Triage inbox','Draft responses','Follow up on pending tickets'] },
    { id:'agent-05', icon:'icon-task',      name:'Mission Planner',       role:'Planning · Operations',       tags:['planning','ops','management'],   art:'ops',          rarity:'common',    card_num:'NS-005', agentType:'Operations Agent',   flavor:'Every deadline. Every sprint.',               caps:['OKR & sprint tracking','Syncs with Jira, Linear, Notion','Weekly status reports auto-sent'],    stats:{spd:'2.0s',acc:'93%',cap:'200',pwr:'68'}, desc:'OKR tracking, sprint planning, and milestone management for ongoing projects.', tasks:['Define sprint goals','Assign tasks to team','Track milestone progress'] },
    { id:'agent-06', icon:'icon-save',      name:'Document Scribe',       role:'Documentation · Writing',     tags:['docs','writing','reporting'],    art:'content',      rarity:'common',    card_num:'NS-006', agentType:'Content Agent',      flavor:'First draft in seconds.',                     caps:['Reports, memos & proposals','300 documents/month','Structured input to polished output'],      stats:{spd:'5.5s',acc:'95%',cap:'300',pwr:'72'}, desc:'Automated report, memo, and proposal generation from structured inputs.', tasks:['Gather requirements','Draft document structure','Write and format document'] },
    { id:'agent-07', icon:'icon-analytics', name:'Finance Officer',       role:'Finance · Reporting',         tags:['finance','analytics'],           art:'analytics',    rarity:'rare',      card_num:'NS-007', agentType:'Analytics Agent',    flavor:'Profit hiding in the variance.',              caps:['Expense tracking & budget reports','5,000 line items/month','QuickBooks, Stripe, CSV import'],  stats:{spd:'4.0s',acc:'98%',cap:'5K',pwr:'87'}, desc:'Expense tracking, budget reporting, and financial summary generation.', tasks:['Compile expense data','Analyze budget variance','Generate financial report'] },
    { id:'agent-08', icon:'icon-tag',       name:'Marketing Agent',       role:'Marketing · Growth',          tags:['marketing','content','growth'],  art:'content',      rarity:'common',    card_num:'NS-008', agentType:'Content Agent',      flavor:'Great campaigns start here.',                 caps:['Campaign copy & briefs','400 assets/month','Performance tracking included'],                    stats:{spd:'3.2s',acc:'89%',cap:'400',pwr:'70'}, desc:'Campaign planning, ad copy generation, and marketing performance tracking.', tasks:['Research target audience','Draft campaign brief','Monitor performance metrics'] },
    { id:'agent-09', icon:'icon-check',     name:'Code Reviewer',         role:'Engineering · QA',            tags:['engineering','qa','code'],       art:'automation',   rarity:'epic',      card_num:'NS-009', agentType:'Automation Agent',   flavor:'Zero bugs slip through.',                     caps:['PR review & security audit','Unlimited reviews/month','GitHub, GitLab, Bitbucket'],             stats:{spd:'1.4s',acc:'99%',cap:'&#8734;',pwr:'95'}, desc:'Automated PR review, security audit flagging, and code quality assessment.', tasks:['Review open PRs','Flag security vulnerabilities','Generate review summary'] },
    { id:'agent-10', icon:'icon-search',    name:'SEO Optimizer',         role:'SEO · Content',               tags:['seo','content','research'],      art:'automation',   rarity:'rare',      card_num:'NS-010', agentType:'Automation Agent',   flavor:'Page one or bust.',                           caps:['Keyword & gap analysis','10,000 pages audited/month','Meta, links & schema auto-fixed'],        stats:{spd:'3.1s',acc:'96%',cap:'10K',pwr:'84'}, desc:'Keyword research, meta optimization, and content gap analysis automation.', tasks:['Keyword gap analysis','Optimize meta tags','Audit internal linking'] },
    { id:'agent-11', icon:'icon-network',   name:'Lead Scout',            role:'Sales · Research',            tags:['sales','research','leads'],      art:'intelligence', rarity:'common',    card_num:'NS-011', agentType:'Intelligence Agent', flavor:'Every lead, pre-qualified.',                  caps:['Prospect research & scoring','500 leads enriched/month','LinkedIn, Apollo, HubSpot'],           stats:{spd:'3.8s',acc:'92%',cap:'500',pwr:'76'}, desc:'Prospect research, qualification scoring, and lead enrichment automation.', tasks:['Source qualified leads','Score and rank prospects','Enrich contact data'] },
    { id:'agent-12', icon:'icon-info',      name:'Support Specialist',    role:'Support · Operations',        tags:['support','ops'],                 art:'ops',          rarity:'common',    card_num:'NS-012', agentType:'Operations Agent',   flavor:'No ticket left behind.',                      caps:['Ticket triage & FAQ responses','2,000 tickets/month','Zendesk, Intercom, Freshdesk'],           stats:{spd:'1.8s',acc:'97%',cap:'2K',pwr:'73'}, desc:'Ticket triage, FAQ response generation, and escalation routing logic.', tasks:['Triage support tickets','Draft FAQ responses','Escalate critical issues'] },
    { id:'agent-13', icon:'icon-key',       name:'Legal Drafter',         role:'Legal · Compliance',          tags:['legal','compliance','docs'],     art:'content',      rarity:'rare',      card_num:'NS-013', agentType:'Content Agent',      flavor:'Contracts closed. Risk minimized.',           caps:['Templates, clauses & checklists','50 documents/month','NDA, SaaS & employment contracts'],      stats:{spd:'7.0s',acc:'98%',cap:'50',pwr:'90'}, desc:'Contract template generation, clause suggestions, and compliance checklist automation.', tasks:['Draft contract template','Review compliance checklist','Flag risk clauses'] },
    { id:'agent-14', icon:'icon-profile',   name:'HR Coordinator',        role:'HR · Operations',             tags:['hr','ops','onboarding'],         art:'ops',          rarity:'common',    card_num:'NS-014', agentType:'Operations Agent',   flavor:'Happy teams start on day one.',               caps:['Onboarding, policy Q&A & reports','500 tasks/month','BambooHR, Rippling, Workday'],             stats:{spd:'2.6s',acc:'95%',cap:'500',pwr:'71'}, desc:'Employee onboarding workflows, policy Q&A, and HR documentation generation.', tasks:['Onboarding checklist','Answer policy questions','Generate HR report'] },
    { id:'agent-15', icon:'icon-comms',     name:'Social Listener',       role:'Social · Analytics',          tags:['social','analytics','monitoring'],art:'intelligence', rarity:'common',   card_num:'NS-015', agentType:'Intelligence Agent', flavor:'What they say. What they mean.',              caps:['Brand mentions & sentiment','Unlimited monitoring','X, Reddit, TikTok & news'],                 stats:{spd:'5.0s',acc:'90%',cap:'&#8734;',pwr:'69'}, desc:'Brand mention monitoring, sentiment analysis, and social trend reporting.', tasks:['Monitor brand mentions','Analyze sentiment','Weekly social report'] },
    { id:'agent-16', icon:'icon-monitor',   name:'Supply Chain Monitor',  role:'Ops · Logistics',             tags:['ops','logistics','monitoring'],  art:'automation',   rarity:'common',    card_num:'NS-016', agentType:'Automation Agent',   flavor:'Stock low. Alert sent. Done.',                caps:['Inventory alerts & vendor tracking','Unlimited monitors','ERPs, Shopify & spreadsheets'],        stats:{spd:'1.2s',acc:'99%',cap:'&#8734;',pwr:'77'}, desc:'Inventory alert automation, vendor tracking, and supply chain status reporting.', tasks:['Monitor inventory levels','Track vendor delivery','Alert on anomalies'] },
    { id:'agent-17', icon:'icon-search',    name:'Product Researcher',    role:'Research · Strategy',         tags:['research','strategy','product'], art:'intelligence', rarity:'common',    card_num:'NS-017', agentType:'Intelligence Agent', flavor:"Know your rivals' next move.",                caps:['Competitor & feature analysis','100 reports/month','G2, Capterra & product sites'],              stats:{spd:'5.8s',acc:'93%',cap:'100',pwr:'79'}, desc:'Competitor analysis, feature gap mapping, and product positioning research.', tasks:['Competitor audit','Feature gap analysis','Positioning report'] },
    { id:'agent-18', icon:'icon-monitor',   name:'UX Tester',             role:'Design · QA',                 tags:['design','qa','testing'],         art:'intelligence', rarity:'rare',      card_num:'NS-018', agentType:'Intelligence Agent', flavor:'UX bugs found before users do.',              caps:['Heuristic & usability testing','200 sessions/month','Figma, web & mobile apps'],                stats:{spd:'8.0s',acc:'96%',cap:'200',pwr:'83'}, desc:'Usability feedback collection, heuristic evaluation reports, and UX issue prioritization.', tasks:['Conduct usability tests','Heuristic evaluation','Prioritize UX fixes'] },
    { id:'agent-19', icon:'icon-build',     name:'Sales Enabler',         role:'Sales · Content',             tags:['sales','content','proposals'],   art:'content',      rarity:'common',    card_num:'NS-019', agentType:'Content Agent',      flavor:'Every pitch, crafted to close.',              caps:['Proposals & objection scripts','300 assets/month','Salesforce, HubSpot, Pipedrive'],            stats:{spd:'3.3s',acc:'94%',cap:'300',pwr:'75'}, desc:'Proposal generation, objection handling scripts, and sales collateral automation.', tasks:['Draft sales proposal','Objection handling scripts','Collateral update'] },
    { id:'agent-20', icon:'icon-learning',  name:'Knowledge Curator',     role:'Documentation · Learning',    tags:['docs','learning','knowledge'],   art:'intelligence', rarity:'legendary', card_num:'NS-020', agentType:'Intelligence Agent', flavor:'The agent that teaches all the others.',      caps:['Wiki, docs & knowledge base','Unlimited indexing','Confluence, Notion, GitHub Wiki'],           stats:{spd:'9.5s',acc:'99%',cap:'&#8734;',pwr:'98'}, desc:'Wiki building, documentation indexing, and knowledge base maintenance automation.', tasks:['Audit knowledge base','Update documentation','Index new content'] },
  ];

  const FLEET_BPS = [\
"""

NEW_FLEET_BPS = """\
  const FLEET_BPS = [
    { id:'fleet-01', icon:'icon-fleet',     name:'SaaS Startup',          role:'Technology · Software',       tags:['saas','startup','tech'],         art:'fleet', rarity:'rare',      card_num:'NS-F01', flavor:'Ship faster. Scale smarter.',            caps:['4 synced specialist agents','5,000 tasks/month','Slack, GitHub, Stripe, Notion'],              stats:{agents:'4',cap:'5K',up:'99.9%',cost:'$149'}, desc:'CTO Agent, Product Manager, Marketing Lead, Customer Support — complete startup team ready to ship.' },
    { id:'fleet-02', icon:'icon-tag',       name:'E-Commerce Store',      role:'Retail · Commerce',           tags:['ecommerce','retail'],             art:'fleet', rarity:'common',    card_num:'NS-F02', flavor:'Zero cart abandoned.',                   caps:['End-to-end store automation','8,000 tasks/month','Shopify, WooCommerce, Meta Ads'],             stats:{agents:'4',cap:'8K',up:'99.8%',cost:'$149'}, desc:'Catalog Manager, Order Processor, Customer Comms, Marketing Agent — full store automation.' },
    { id:'fleet-03', icon:'icon-key',       name:'Law Firm',              role:'Legal · Professional',        tags:['legal','professional'],           art:'fleet', rarity:'rare',      card_num:'NS-F03', flavor:'Precision. Every billable hour.',         caps:['Legal research to client billing','500 documents/month','Clio, NetDocuments, Outlook'],          stats:{agents:'4',cap:'500',up:'99.9%',cost:'$149'}, desc:'Research Navigator, Document Scribe, Client Communications, Billing Coordinator.' },
    { id:'fleet-04', icon:'icon-tag',       name:'Restaurant Group',      role:'Food & Beverage',             tags:['restaurant','hospitality'],       art:'fleet', rarity:'common',    card_num:'NS-F04', flavor:'Tables full. Staff focused.',            caps:['Ops from menu to reviews','2,000 tasks/month','Toast, Yelp, Google, OpenTable'],                stats:{agents:'4',cap:'2K',up:'99.7%',cost:'$149'}, desc:'Menu Optimizer, Review Manager, Staff Coordinator, Marketing Agent.' },
    { id:'fleet-05', icon:'icon-analytics', name:'Marketing Agency',      role:'Marketing · Creative',        tags:['marketing','agency','creative'],  art:'fleet', rarity:'epic',      card_num:'NS-F05', flavor:'One team. Every channel.',               caps:['Full-funnel coverage, 4 agents','15,000 assets/month','HubSpot, Meta, Google, Klaviyo'],         stats:{agents:'4',cap:'15K',up:'99.9%',cost:'$149'}, desc:'Content Broadcaster, SEO Optimizer, Social Listener, Analytics Reporter.' },
    { id:'fleet-06', icon:'icon-build',     name:'Consulting Firm',       role:'Consulting · Professional',   tags:['consulting','professional'],      art:'fleet', rarity:'common',    card_num:'NS-F06', flavor:'High-value work. Zero overhead.',         caps:['Research to delivery, automated','1,000 deliverables/month','Salesforce, Notion, Calendly'],    stats:{agents:'4',cap:'1K',up:'99.8%',cost:'$149'}, desc:'Research Navigator, Proposal Writer, Project Delivery Agent, Billing Coordinator.' },
    { id:'fleet-07', icon:'icon-network',   name:'Real Estate Team',      role:'Real Estate · Property',      tags:['realestate','property','sales'],  art:'fleet', rarity:'common',    card_num:'NS-F07', flavor:'More listings. More closings.',          caps:['Listings to contracts, automated','3,000 tasks/month','Zillow, MLS, DocuSign, CRMs'],            stats:{agents:'4',cap:'3K',up:'99.8%',cost:'$149'}, desc:'Listings Manager, Lead Scout, Contract Drafter, Marketing Agent.' },
    { id:'fleet-08', icon:'icon-profile',   name:'Healthcare Practice',   role:'Healthcare · Medical',        tags:['healthcare','medical'],           art:'fleet', rarity:'rare',      card_num:'NS-F08', flavor:'Compliance first. Always.',              caps:['HIPAA-aware workflows, 4 agents','2,000 records/month','Epic, Athena, DrChrono'],                stats:{agents:'4',cap:'2K',up:'99.99%',cost:'$149'}, desc:'Records Manager, Scheduling Agent, Patient Comms, Billing Coordinator.' },
    { id:'fleet-09', icon:'icon-comms',     name:'Media Publisher',       role:'Media · Content',             tags:['media','content','publishing'],   art:'fleet', rarity:'common',    card_num:'NS-F09', flavor:'Content that never stops.',             caps:['24/7 publishing pipeline','20,000 pieces/month','WordPress, Ghost, Substack'],                  stats:{agents:'4',cap:'20K',up:'99.8%',cost:'$149'}, desc:'Editorial Agent, SEO Optimizer, Social Broadcaster, Newsletter Manager.' },
    { id:'fleet-10', icon:'icon-check',     name:'Software Studio',       role:'Engineering · Technology',    tags:['engineering','software','dev'],   art:'fleet', rarity:'epic',      card_num:'NS-F10', flavor:'Ship code. Not meetings.',               caps:['Full dev lifecycle, automated','Unlimited code reviews','GitHub, Jira, Confluence, Slack'],       stats:{agents:'4',cap:'&#8734;',up:'99.9%',cost:'$149'}, desc:'Code Reviewer, QA Tester, DevOps Monitor, Documentation Scribe.' },
    { id:'fleet-11', icon:'icon-info',      name:'Nonprofit Organization',role:'Nonprofit · Social Impact',   tags:['nonprofit','social'],             art:'fleet', rarity:'common',    card_num:'NS-F11', flavor:'Mission first. Always.',                 caps:['Grants to impact reporting','1,000 tasks/month','Mailchimp, Salesforce NPSP, Google Workspace'], stats:{agents:'4',cap:'1K',up:'99.7%',cost:'$149'}, desc:'Grants Researcher, Donor Communications, Events Coordinator, Impact Reporter.' },
    { id:'fleet-12', icon:'icon-analytics', name:'Wealth Management Firm', role:'Finance · Wealth Management', tags:['finance','wealth','advisory'],    art:'fleet', rarity:'rare',      card_num:'NS-F12', flavor:'Compliance and insight. Together.',      caps:['Audit-ready outputs, 4 agents','3,000 reports/month','Salesforce, Redtail, Orion'],              stats:{agents:'4',cap:'3K',up:'99.99%',cost:'$499'}, desc:'Financial Advisor, Market Researcher, Compliance Monitor, Client Comms.' },
    { id:'fleet-13', icon:'icon-learning',  name:'Education Platform',    role:'Education · EdTech',          tags:['education','edtech','learning'],  art:'fleet', rarity:'common',    card_num:'NS-F13', flavor:'Every student, always supported.',       caps:['Full learning journey, automated','10,000 interactions/month','Canvas, Google Classroom, Zoom'],  stats:{agents:'4',cap:'10K',up:'99.8%',cost:'$149'}, desc:'Curriculum Builder, Student Support Agent, Analytics Reporter, Content Creator.' },
    { id:'fleet-14', icon:'icon-monitor',   name:'Logistics Company',     role:'Logistics · Supply Chain',    tags:['logistics','supply','ops'],       art:'fleet', rarity:'legendary', card_num:'NS-F14', flavor:'Everything, everywhere, on time.',       caps:['Real-time supply chain ops','Unlimited tracking events','SAP, Oracle, ShipStation'],             stats:{agents:'4',cap:'&#8734;',up:'99.99%',cost:'$499'}, desc:'Tracking Monitor, Schedule Optimizer, Compliance Agent, Customer Comms.' },
    { id:'fleet-15', icon:'icon-build',     name:'Creative Agency',       role:'Creative · Design',           tags:['creative','design','agency'],     art:'fleet', rarity:'common',    card_num:'NS-F15', flavor:'Ideas executed at machine speed.',       caps:['Concept to delivery, 4 agents','5,000 assets/month','Figma, Adobe CC, Asana'],                  stats:{agents:'4',cap:'5K',up:'99.8%',cost:'$149'}, desc:'Ideation Agent, Production Coordinator, Client Communications, Analytics Reporter.' },
  ];\
"""

NEW_TCG_FUNCTIONS = '''
  // ── TCG Art Illustrations ──────────────────────────────────────────────
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
      fleet: `<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
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
    const favs    = _getFavs();
    const custom  = _getCustom(bp.id);
    const data    = custom ? {...bp, ...custom} : bp;
    const isFav   = favs.has(bp.id);
    const rarity  = data.rarity || 'common';
    const rarityLabel = { common:'', rare:'&#9670; RARE', epic:'&#9670;&#9670; EPIC', legendary:'&#9670;&#9670;&#9670; LEGENDARY' }[rarity] || '';
    const buildLbl = type === 'fleet' ? 'Deploy' : 'Build';
    const isFleet  = type === 'fleet';
    const statKeys = isFleet ? ['agents','cap','up','cost']   : ['spd','acc','cap','pwr'];
    const statLbls = isFleet ? ['AGENTS','CAP','UP','COST']   : ['SPD','ACC','CAP','PWR'];
    const statVals = statKeys.map(k => data.stats?.[k] || '&#8212;');
    const typeLine = isFleet
      ? 'FLEET BLUEPRINT &bull; ATM&trade; v3.5'
      : `${(data.agentType || 'AUTOMATION AGENT').toUpperCase()} &bull; ATM&trade; v3.5`;
    const caps = data.caps || [];
    return `<div class="tcg-card" data-id="${bp.id}" data-type="${type}" data-tags="${data.tags.join(',')}" data-rarity="${rarity}">
      <div class="tcg-name-bar">
        <span class="tcg-name">${data.name}</span>
        <span class="tcg-rarity">${rarityLabel}</span>
      </div>
      <div class="tcg-art">${_tcgArt(data.art || 'automation')}</div>
      <div class="tcg-type-line">${typeLine}</div>
      <div class="tcg-text-box">
        <p class="tcg-flavor">"${data.flavor || data.desc}"</p>
        ${caps.slice(0,3).map(c => `<p class="tcg-cap">${c}</p>`).join('')}
      </div>
      <div class="tcg-stats">
        ${statLbls.map((l,i) => `<div class="tcg-stat"><span class="tcg-stat-val">${statVals[i]}</span><span class="tcg-stat-lbl">${l}</span></div>`).join('')}
      </div>
      <div class="tcg-footer">
        <span>${data.card_num || bp.id.toUpperCase()}</span>
        <span>2026 &bull; NICE SPACESHIP &#9670;</span>
      </div>
      <div class="tcg-actions">
        <button class="c-btn${isFav?' active':''}" data-fav="${bp.id}" aria-label="${isFav?'Unfavorite':'Favorite'}">&#9733;</button>
        <button class="c-btn" data-action="savebp" data-id="${bp.id}">Save</button>
        <button class="c-btn bp-build-btn" data-action="build" data-id="${bp.id}">${buildLbl}</button>
      </div>
    </div>`;
  }

'''

NEW_RENDER_FUNCTION = '''\
  function render() {
    const grid = document.getElementById('bp-lib-grid');
    if (!grid) return;
    const all = _activeTab === 'agent' ? AGENT_BPS : FLEET_BPS;
    grid.innerHTML = all.map(bp => _tcgCardHTML(bp, _activeTab)).join('');
    _attachEvents();
    filter();
  }\
'''

NEW_FILTER_FUNCTION = '''\
  function filter() {
    const q   = (document.getElementById('bp-search')?.value||'').toLowerCase();
    document.querySelectorAll('.tcg-card').forEach(c => {
      const tags = (c.dataset.tags||'').toLowerCase();
      const name = c.querySelector('.tcg-name')?.textContent.toLowerCase()||'';
      const desc = c.querySelector('.tcg-text-box')?.textContent.toLowerCase()||'';
      const tagMatch = _activeTag==='all' || tags.includes(_activeTag);
      const txtMatch = !q || name.includes(q) || desc.includes(q) || tags.includes(q);
      c.style.display = (tagMatch && txtMatch) ? '' : 'none';
    });
    const visible = [...document.querySelectorAll('.tcg-card')].filter(c=>c.style.display!=='none').length;
    const noRes = document.getElementById('bp-no-results');
    if (noRes) noRes.style.display = visible ? 'none' : 'block';
  }\
'''

# ─── Apply replacements ────────────────────────────────────────────────────

# 1. Replace AGENT_BPS array
a_start = content.index(OLD_AGENT_START)
a_end   = content.index(OLD_AGENT_END)
content = content[:a_start] + NEW_AGENT_BPS + '\n' + content[a_end:]

# 2. Replace FLEET_BPS array
f_start = content.index('  const FLEET_BPS = [')
# Find the end of the FLEET_BPS array (closing ];)
# It ends just before '  // ── Helpers'
f_end   = content.index('  // ── Helpers ──')
content = content[:f_start] + NEW_FLEET_BPS + '\n\n' + content[f_end:]

# 3. Insert TCG functions before '  // ── Render ──'
render_marker = '  // ── Render ────────────────────────────────────────────────────\n  function _cardHtml'
render_idx = content.index(render_marker)
# Find end of _cardHtml function (the closing '}')  — it ends at the newline before '\n\n  function render()'
render_fn_end = content.index('\n\n  function render()', render_idx)
# Replace the old render marker + _cardHtml with TCG functions
content = content[:render_idx] + '  // ── Render ────────────────────────────────────────────────────' + NEW_TCG_FUNCTIONS + content[render_fn_end+1:]

# 4. Replace render() function body
old_render = '''\
  function render() {
    const grid = document.getElementById('bp-lib-grid');
    if (!grid) return;
    const all = _activeTab === 'agent' ? AGENT_BPS : FLEET_BPS;
    grid.innerHTML = all.map(bp => _cardHtml(bp, _activeTab)).join('');
    _attachEvents();
    filter();
  }'''
content = content.replace(old_render, NEW_RENDER_FUNCTION, 1)

# 5. Replace filter() function body
old_filter = '''\
  function filter() {
    const q   = (document.getElementById('bp-search')?.value||'').toLowerCase();
    document.querySelectorAll('.bp-lib-card').forEach(c => {
      const tags = (c.dataset.tags||'').toLowerCase();
      const name = c.querySelector('.bp-lib-name')?.textContent.toLowerCase()||'';
      const desc = c.querySelector('.bp-lib-desc')?.textContent.toLowerCase()||'';
      const tagMatch = _activeTag==='all' || tags.includes(_activeTag);
      const txtMatch = !q || name.includes(q) || desc.includes(q) || tags.includes(q);
      c.style.display = (tagMatch && txtMatch) ? '' : 'none';
    });
    const visible = [...document.querySelectorAll('.bp-lib-card')].filter(c=>c.style.display!=='none').length;
    const noRes = document.getElementById('bp-no-results');
    if (noRes) noRes.style.display = visible ? 'none' : 'block';
  }'''
content = content.replace(old_filter, NEW_FILTER_FUNCTION, 1)

with open(JS, 'w') as f:
    f.write(content)

print('app.js patched successfully.')
