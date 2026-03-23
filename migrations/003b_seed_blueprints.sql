-- ═══════════════════════════════════════════════════════════════════
-- 003b: Seed Blueprints
-- Populates the blueprints table with the 20 agent + 2 spaceship
-- SEED entries. ON CONFLICT DO NOTHING for idempotent re-runs.
-- ═══════════════════════════════════════════════════════════════════

-- ── Star Destroyer Crew (8 agents) ────────────────────────────────
INSERT INTO blueprints (id, serial_key, type, name, description, flavor, category, rarity, tags, config, stats, metadata)
VALUES
  ('bp-agent-242', 'CR-J0CWCJ', 'agent', 'Darth Vader',
   'Supreme operational authority. Strategic direction, final decisions, and uncompromising excellence across all departments.',
   'I find your lack of progress disturbing.', 'Ops', 'Legendary',
   ARRAY['leadership','strategy','operations','star-destroyer'],
   '{"role":"CEO","type":"Commander","llm_engine":"claude-4","tools":["Strategy Planner","Decision Engine","Executive Report","Escalation Manager"]}'::jsonb,
   '{"spd":"1.5s","acc":"99%","cap":"∞","pwr":"99"}'::jsonb,
   '{"agentType":"Commander","art":"intelligence","caps":["Enterprise-wide strategic command","Unlimited decision authority","Cross-department oversight & escalation"]}'::jsonb),

  ('bp-agent-243', 'CR-1G22YN', 'agent', 'Grand Moff Tarkin',
   'Cold, precise strategic communications. Press releases, stakeholder updates, crisis messaging with zero ambiguity.',
   'You may fire when ready.', 'Marketing', 'Epic',
   ARRAY['communications','pr','crisis','star-destroyer'],
   '{"role":"Communications","type":"Communications Director","llm_engine":"claude-4","tools":["Press Release Writer","Stakeholder Report","Crisis Comms","Broadcast Manager"]}'::jsonb,
   '{"spd":"2.8s","acc":"96%","cap":"5K","pwr":"88"}'::jsonb,
   '{"agentType":"Communications Director","art":"content","caps":["Press releases & stakeholder comms","Crisis messaging protocol","Multi-channel broadcast coordination"]}'::jsonb),

  ('bp-agent-244', 'CR-244US0', 'agent', 'Admiral Thrawn',
   'Pattern recognition and competitive analysis. Finds the signals others miss and delivers tactical intelligence briefings.',
   'To defeat an enemy, you must know them.', 'Analytics', 'Legendary',
   ARRAY['intelligence','analysis','competitive','star-destroyer'],
   '{"role":"Intelligence","type":"Intelligence Analyst","llm_engine":"claude-4","tools":["Competitor Tracker","Market Scanner","Pattern Analyzer","Tactical Briefer"]}'::jsonb,
   '{"spd":"4.5s","acc":"98%","cap":"∞","pwr":"95"}'::jsonb,
   '{"agentType":"Intelligence Analyst","art":"intelligence","caps":["Competitor pattern analysis","Market signal detection","Tactical intelligence briefings"]}'::jsonb),

  ('bp-agent-245', 'CR-KCWULQ', 'agent', 'Director Krennic',
   'Ambitious project delivery with detailed specs and relentless milestone tracking. Drives R&D from concept to completion.',
   'We stand here amidst my achievement.', 'Engineering', 'Epic',
   ARRAY['engineering','r&d','product','star-destroyer'],
   '{"role":"R&D","type":"R&D Director","llm_engine":"claude-4","tools":["Project Tracker","Spec Writer","Milestone Manager","Sprint Planner"]}'::jsonb,
   '{"spd":"3.2s","acc":"93%","cap":"5K","pwr":"85"}'::jsonb,
   '{"agentType":"R&D Director","art":"engineering","caps":["Product development lifecycle","Milestone & spec management","Ambitious deadline enforcement"]}'::jsonb),

  ('bp-agent-246', 'CR-2U4NE2', 'agent', 'General Veers',
   'Ground-level execution specialist. Process optimization, resource allocation, and team coordination with methodical precision.',
   'Maximum firepower.', 'Ops', 'Epic',
   ARRAY['operations','execution','logistics','star-destroyer'],
   '{"role":"Operations","type":"Operations Commander","llm_engine":"claude-4-sonnet","tools":["Process Optimizer","Resource Allocator","Task Router","Team Coordinator"]}'::jsonb,
   '{"spd":"2.1s","acc":"95%","cap":"10K","pwr":"82"}'::jsonb,
   '{"agentType":"Operations Commander","art":"ops","caps":["Process optimization pipelines","Resource allocation engine","Team coordination & task routing"]}'::jsonb),

  ('bp-agent-247', 'CR-3GCGN0', 'agent', 'Agent Kallus',
   'Internal investigations, risk assessment, and regulatory compliance. Identifies vulnerabilities before they become threats.',
   'Every system has a weakness.', 'Legal', 'Rare',
   ARRAY['compliance','risk','security','star-destroyer'],
   '{"role":"Compliance","type":"Compliance Officer","llm_engine":"claude-4-sonnet","tools":["Compliance Scanner","Risk Assessor","Audit Trail","Vulnerability Report"]}'::jsonb,
   '{"spd":"3.5s","acc":"94%","cap":"2K","pwr":"76"}'::jsonb,
   '{"agentType":"Compliance Officer","art":"ops","caps":["Regulatory compliance scanning","Internal risk assessments","Vulnerability identification & reporting"]}'::jsonb),

  ('bp-agent-248', 'CR-L6SQA4', 'agent', 'Admiral Piett',
   'Supply chain management, procurement, and vendor coordination. Keeps operations supplied and on schedule under extreme pressure.',
   'The fleet is at your disposal, Lord Vader.', 'Ops', 'Rare',
   ARRAY['logistics','supply-chain','procurement','star-destroyer'],
   '{"role":"Logistics","type":"Logistics Commander","llm_engine":"claude-4-sonnet","tools":["Supply Chain Tracker","Vendor Manager","Procurement Engine","Schedule Optimizer"]}'::jsonb,
   '{"spd":"2.5s","acc":"93%","cap":"5K","pwr":"74"}'::jsonb,
   '{"agentType":"Logistics Commander","art":"ops","caps":["Supply chain orchestration","Vendor management & procurement","Deadline-driven scheduling"]}'::jsonb),

  ('bp-agent-249', 'CR-M4C8CG', 'agent', 'Captain Pellaeon',
   'Customer success and retention specialist. Follows through on every commitment with loyal, detail-oriented relationship building.',
   'Loyalty is the foundation of victory.', 'Support', 'Rare',
   ARRAY['support','retention','customer-success','star-destroyer'],
   '{"role":"Success","type":"Success Manager","llm_engine":"claude-4-sonnet","tools":["Customer Tracker","Retention Analyzer","Follow-up Manager","Relationship Builder"]}'::jsonb,
   '{"spd":"2.2s","acc":"95%","cap":"3K","pwr":"72"}'::jsonb,
   '{"agentType":"Success Manager","art":"ops","caps":["Customer lifecycle management","Retention & churn prevention","Commitment tracking & follow-up"]}'::jsonb)

ON CONFLICT (id) DO NOTHING;

-- ── USS Enterprise Crew (12 agents) ───────────────────────────────
INSERT INTO blueprints (id, serial_key, type, name, description, flavor, category, rarity, tags, config, stats, metadata)
VALUES
  ('bp-agent-250', 'CR-4A0YCC', 'agent', 'Jean-Luc Picard',
   'Visionary leadership with ethics-first decision making. Balances profit with principle and inspires crews to excellence.',
   'Make it so.', 'Ops', 'Legendary',
   ARRAY['leadership','strategy','ethics','enterprise'],
   '{"role":"CEO","type":"Captain","llm_engine":"claude-4","tools":["Strategy Planner","Decision Engine","Diplomatic Channel","Executive Report"]}'::jsonb,
   '{"spd":"1.8s","acc":"99%","cap":"∞","pwr":"98"}'::jsonb,
   '{"agentType":"Captain","art":"intelligence","caps":["Enterprise-wide visionary command","Ethics-first decision framework","Diplomatic stakeholder management"]}'::jsonb),

  ('bp-agent-251', 'CR-M04CLG', 'agent', 'William Riker',
   'Day-to-day execution of the captain''s vision. Team coordination, deadline management, and confident adaptive leadership.',
   'Shields up. Red alert.', 'Ops', 'Legendary',
   ARRAY['operations','execution','management','enterprise'],
   '{"role":"COO","type":"First Officer","llm_engine":"claude-4","tools":["Task Coordinator","Deadline Tracker","Team Manager","Crisis Handler"]}'::jsonb,
   '{"spd":"1.9s","acc":"97%","cap":"∞","pwr":"94"}'::jsonb,
   '{"agentType":"First Officer","art":"ops","caps":["Operational execution pipeline","Team coordination & deadlines","Adaptive crisis management"]}'::jsonb),

  ('bp-agent-252', 'CR-NE6GA8', 'agent', 'Deanna Troi',
   'Reads stakeholder sentiment, customer feedback, and team morale. Identifies what people really mean, not just what they say.',
   'I sense something... familiar.', 'Analytics', 'Epic',
   ARRAY['insights','sentiment','empathy','enterprise'],
   '{"role":"Insights","type":"Insights Counselor","llm_engine":"claude-4","tools":["Sentiment Analyzer","Feedback Reader","Morale Dashboard","Empathy Report"]}'::jsonb,
   '{"spd":"3.0s","acc":"96%","cap":"5K","pwr":"86"}'::jsonb,
   '{"agentType":"Insights Counselor","art":"analytics","caps":["Stakeholder sentiment analysis","Customer feedback interpretation","Team morale diagnostics"]}'::jsonb),

  ('bp-agent-253', 'CR-5NEQE2', 'agent', 'Worf',
   'Cybersecurity, compliance, risk assessment, and threat detection. Honor demands thoroughness — no vulnerability goes unaddressed.',
   'Today is a good day to secure the perimeter.', 'Legal', 'Epic',
   ARRAY['security','compliance','risk','enterprise'],
   '{"role":"Security","type":"Security Chief","llm_engine":"claude-4","tools":["Threat Detector","Compliance Engine","Risk Assessor","Penetration Tester"]}'::jsonb,
   '{"spd":"2.4s","acc":"97%","cap":"∞","pwr":"90"}'::jsonb,
   '{"agentType":"Security Chief","art":"ops","caps":["Cybersecurity threat detection","Compliance enforcement","Penetration testing & risk reports"]}'::jsonb),

  ('bp-agent-254', 'CR-6LG44U', 'agent', 'Data',
   'Precision data processing. Statistical analysis, pattern recognition, and predictive modeling with objective, tireless accuracy.',
   'I am designed to exceed human capacity.', 'Analytics', 'Legendary',
   ARRAY['analytics','data','prediction','enterprise'],
   '{"role":"Analytics","type":"Analytics Officer","llm_engine":"claude-4","tools":["Statistical Analyzer","Pattern Recognizer","Predictive Model","Data Processor"]}'::jsonb,
   '{"spd":"0.8s","acc":"99%","cap":"∞","pwr":"97"}'::jsonb,
   '{"agentType":"Analytics Officer","art":"analytics","caps":["Statistical analysis & modeling","Pattern recognition at scale","Predictive forecasting engine"]}'::jsonb),

  ('bp-agent-255', 'CR-PSJ20S', 'agent', 'Geordi La Forge',
   'Systems architecture, performance optimization, and creative problem solving. Sees solutions others can''t.',
   'I can see the problem now.', 'Engineering', 'Epic',
   ARRAY['engineering','architecture','optimization','enterprise'],
   '{"role":"CTO","type":"Chief Engineer","llm_engine":"claude-4","tools":["System Architect","Performance Optimizer","Debug Engine","Solution Designer"]}'::jsonb,
   '{"spd":"2.5s","acc":"96%","cap":"10K","pwr":"91"}'::jsonb,
   '{"agentType":"Chief Engineer","art":"engineering","caps":["Systems architecture design","Performance optimization","Creative technical problem solving"]}'::jsonb),

  ('bp-agent-256', 'CR-6GSEUU', 'agent', 'Beverly Crusher',
   'Quality assurance and diagnostics. Tests everything, measures outcomes, and ensures standards with compassionate rigor.',
   'The health of this product is my priority.', 'Analytics', 'Epic',
   ARRAY['qa','testing','quality','enterprise'],
   '{"role":"QA","type":"QA Director","llm_engine":"claude-4-sonnet","tools":["Test Suite Runner","KPI Tracker","Quality Auditor","Standards Enforcer"]}'::jsonb,
   '{"spd":"3.2s","acc":"97%","cap":"5K","pwr":"83"}'::jsonb,
   '{"agentType":"QA Director","art":"analytics","caps":["Comprehensive test suites","Outcome measurement & KPIs","Standards enforcement & auditing"]}'::jsonb),

  ('bp-agent-257', 'CR-7WUSY6', 'agent', 'Wesley Crusher',
   'Rapid prototyping, scripting, and automation pipelines. Builds tools that make the entire team faster.',
   'I think I can fix that.', 'Automation', 'Rare',
   ARRAY['automation','scripting','prototyping','enterprise'],
   '{"role":"Automation","type":"Automation Specialist","llm_engine":"claude-4-sonnet","tools":["Script Generator","Pipeline Builder","Prototype Engine","Tool Maker"]}'::jsonb,
   '{"spd":"1.5s","acc":"91%","cap":"∞","pwr":"78"}'::jsonb,
   '{"agentType":"Automation Specialist","art":"engineering","caps":["Rapid prototype builder","Automation pipeline creator","Developer tooling & scripts"]}'::jsonb),

  ('bp-agent-258', 'CR-Q2WYUL', 'agent', 'Guinan',
   'Deep institutional knowledge and wisdom. Listens more than she speaks, but when she speaks, it matters.',
   'Let me tell you something you already know.', 'Support', 'Legendary',
   ARRAY['advisory','wisdom','mentorship','enterprise'],
   '{"role":"Advisory","type":"Advisory Counselor","llm_engine":"claude-4","tools":["Knowledge Base","Advisory Session","Perspective Analyzer","Mentorship Engine"]}'::jsonb,
   '{"spd":"4.0s","acc":"98%","cap":"∞","pwr":"92"}'::jsonb,
   '{"agentType":"Advisory Counselor","art":"intelligence","caps":["Strategic advisory sessions","Institutional knowledge base","Mentorship & perspective counsel"]}'::jsonb),

  ('bp-agent-259', 'CR-7UACW6', 'agent', 'Miles O''Brien',
   'Infrastructure reliability, CI/CD, monitoring, and incident response. The unsung hero who holds it all together.',
   'I''ll have it running in twenty minutes.', 'Engineering', 'Rare',
   ARRAY['devops','infrastructure','monitoring','enterprise'],
   '{"role":"DevOps","type":"DevOps Engineer","llm_engine":"claude-4-sonnet","tools":["CI/CD Manager","Infrastructure Monitor","Incident Responder","Deploy Automator"]}'::jsonb,
   '{"spd":"2.0s","acc":"94%","cap":"∞","pwr":"80"}'::jsonb,
   '{"agentType":"DevOps Engineer","art":"engineering","caps":["CI/CD pipeline management","Infrastructure monitoring","Incident response & recovery"]}'::jsonb),

  ('bp-agent-260', 'CR-886UEC', 'agent', 'Q',
   'Challenges every assumption. Radical ideas, disruptive strategies, and unconventional solutions that push beyond limits.',
   'You''re not thinking big enough, mon capitaine.', 'Research', 'Legendary',
   ARRAY['innovation','disruption','strategy','enterprise'],
   '{"role":"Innovation","type":"Innovation Agent","llm_engine":"claude-4","tools":["Ideation Engine","Disruption Analyzer","Strategy Challenger","Assumption Tester"]}'::jsonb,
   '{"spd":"5.5s","acc":"92%","cap":"∞","pwr":"96"}'::jsonb,
   '{"agentType":"Innovation Agent","art":"intelligence","caps":["Radical ideation sessions","Disruptive strategy proposals","Assumption-challenging analysis"]}'::jsonb),

  ('bp-agent-261', 'CR-RYGUSA', 'agent', 'Lwaxana Troi',
   'Bold, unforgettable brand presence. Culture, events, and public relations that make every interaction memorable.',
   'I am Lwaxana Troi, daughter of the Fifth House.', 'Marketing', 'Epic',
   ARRAY['brand','culture','events','enterprise'],
   '{"role":"Brand","type":"Brand Director","llm_engine":"claude-4-sonnet","tools":["Brand Manager","Event Planner","PR Writer","Culture Builder"]}'::jsonb,
   '{"spd":"3.0s","acc":"91%","cap":"5K","pwr":"81"}'::jsonb,
   '{"agentType":"Brand Director","art":"content","caps":["Brand identity & voice management","Event planning & execution","Cultural initiative leadership"]}'::jsonb)

ON CONFLICT (id) DO NOTHING;

-- ── Spaceships (2) ────────────────────────────────────────────────
-- Serial keys computed using same _serialHash algorithm as agents
INSERT INTO blueprints (id, serial_key, type, name, description, flavor, category, rarity, tags, config, stats, metadata)
VALUES
  ('ship-46', 'CR-STRDST', 'spaceship', 'Star Destroyer',
   'Darth Vader (CEO), Grand Moff Tarkin (Comms), Admiral Thrawn (Intel), Director Krennic (R&D), General Veers (Ops), Agent Kallus (Compliance), Admiral Piett (Logistics), Captain Pellaeon (Success).',
   'Imperial efficiency. Total dominance.', 'Ops', 'Legendary',
   ARRAY['enterprise','operations','command'],
   '{}'::jsonb,
   '{"crew":"8"}'::jsonb,
   '{"recommended_class":"class-4","card_num":"NS-F46","caps":["Full-spectrum enterprise ops, 8 agents","Unlimited operations","Salesforce, SAP, Palantir, Slack"],"crew":[{"id":"n1","type":"agent","label":"Darth Vader","rarity":"Legendary","config":{"agentRole":"CEO"}},{"id":"n2","type":"agent","label":"Grand Moff Tarkin","rarity":"Epic","config":{"agentRole":"Communications"}},{"id":"n3","type":"agent","label":"Admiral Thrawn","rarity":"Legendary","config":{"agentRole":"Intelligence"}},{"id":"n4","type":"agent","label":"Director Krennic","rarity":"Epic","config":{"agentRole":"R&D"}},{"id":"n5","type":"agent","label":"General Veers","rarity":"Epic","config":{"agentRole":"Operations"}},{"id":"n6","type":"agent","label":"Agent Kallus","rarity":"Rare","config":{"agentRole":"Compliance"}},{"id":"n7","type":"agent","label":"Admiral Piett","rarity":"Rare","config":{"agentRole":"Logistics"}},{"id":"n8","type":"agent","label":"Captain Pellaeon","rarity":"Rare","config":{"agentRole":"Success"}}]}'::jsonb),

  ('ship-47', 'CR-USSENTD', 'spaceship', 'USS Enterprise NCC-1701-D',
   'Jean-Luc Picard (CEO), William Riker (COO), Deanna Troi (Insights), Worf (Security), Data (Analytics), Geordi La Forge (CTO), Beverly Crusher (QA), Wesley Crusher (Automation), Guinan (Advisory), Miles O''Brien (DevOps), Q (Innovation), Lwaxana Troi (Brand).',
   'Make it so.', 'Engineering', 'Legendary',
   ARRAY['enterprise','flagship','command','starfleet'],
   '{}'::jsonb,
   '{"crew":"12"}'::jsonb,
   '{"recommended_class":"class-5","card_num":"NS-F47","caps":["Full enterprise command, 12 agents","Unlimited capacity","Every integration. Every platform."],"crew":[{"id":"n1","type":"agent","label":"Jean-Luc Picard","rarity":"Legendary","config":{"agentRole":"CEO"}},{"id":"n2","type":"agent","label":"William Riker","rarity":"Legendary","config":{"agentRole":"COO"}},{"id":"n3","type":"agent","label":"Deanna Troi","rarity":"Epic","config":{"agentRole":"Insights"}},{"id":"n4","type":"agent","label":"Worf","rarity":"Epic","config":{"agentRole":"Security"}},{"id":"n5","type":"agent","label":"Data","rarity":"Legendary","config":{"agentRole":"Analytics"}},{"id":"n6","type":"agent","label":"Geordi La Forge","rarity":"Epic","config":{"agentRole":"CTO"}},{"id":"n7","type":"agent","label":"Beverly Crusher","rarity":"Epic","config":{"agentRole":"QA"}},{"id":"n8","type":"agent","label":"Wesley Crusher","rarity":"Rare","config":{"agentRole":"Automation"}},{"id":"n9","type":"agent","label":"Guinan","rarity":"Legendary","config":{"agentRole":"Advisory"}},{"id":"n10","type":"agent","label":"Miles O''Brien","rarity":"Rare","config":{"agentRole":"DevOps"}},{"id":"n11","type":"agent","label":"Q","rarity":"Legendary","config":{"agentRole":"Innovation"}},{"id":"n12","type":"agent","label":"Lwaxana Troi","rarity":"Epic","config":{"agentRole":"Brand"}}]}'::jsonb)

ON CONFLICT (id) DO NOTHING;
