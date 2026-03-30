/* ═══════════════════════════════════════════════════════════════════
   NICE — Spaceship Templates
   Pre-built spaceship configurations by industry.
   Used by CrewDesigner and Onboarding Wizard.
═══════════════════════════════════════════════════════════════════ */

const ShipTemplates = (() => {

  const TEMPLATES = [
    {
      id: 'restaurant',
      name: 'Restaurant Ops',
      icon: '🍽️',
      description: 'Full restaurant operations — social media, reviews, menu planning, customer outreach.',
      agents: [
        { name: 'Social Chef', role: 'Social Media Manager', persona: { personality: 'enthusiastic, visual-first', tone: 'casual but appetizing', expertise: ['food photography', 'instagram', 'tiktok'] }, tools: ['generate-image', 'generate-video', 'generate-social-post'] },
        { name: 'Review Monitor', role: 'Customer Feedback Analyst', persona: { personality: 'empathetic, detail-oriented', tone: 'professional', expertise: ['sentiment analysis', 'review response', 'trend detection'] }, tools: ['web-search', 'summarize'] },
        { name: 'Menu Strategist', role: 'Menu & Pricing Analyst', persona: { personality: 'data-driven, creative', tone: 'strategic', expertise: ['food costing', 'menu engineering', 'seasonal planning'] }, tools: ['summarize'] },
        { name: 'Guest Concierge', role: 'Customer Communications', persona: { personality: 'warm, professional', tone: 'welcoming', expertise: ['email marketing', 'reservation management', 'loyalty programs'] }, tools: ['summarize'] },
      ],
      flow: 'router',
      integrations: ['gmail', 'drive'],
    },
    {
      id: 'ecommerce',
      name: 'E-Commerce Hub',
      icon: '🛒',
      description: 'Online store operations — product listings, customer support, marketing, inventory.',
      agents: [
        { name: 'Product Writer', role: 'Product Content Creator', persona: { personality: 'persuasive, detail-oriented', tone: 'professional yet engaging', expertise: ['copywriting', 'SEO', 'product photography'] }, tools: ['generate-image', 'generate-social-post', 'web-search'] },
        { name: 'Support Bot', role: 'Customer Support Agent', persona: { personality: 'patient, helpful', tone: 'friendly and efficient', expertise: ['FAQ handling', 'order tracking', 'returns'] }, tools: ['summarize'] },
        { name: 'Growth Hacker', role: 'Marketing & Growth', persona: { personality: 'analytical, creative', tone: 'data-informed', expertise: ['email campaigns', 'social ads', 'conversion optimization'] }, tools: ['generate-image', 'generate-social-post', 'web-search'] },
        { name: 'Inventory Analyst', role: 'Inventory & Operations', persona: { personality: 'precise, proactive', tone: 'factual', expertise: ['demand forecasting', 'supplier management', 'cost analysis'] }, tools: ['summarize'] },
      ],
      flow: 'router',
      integrations: ['gmail', 'drive'],
    },
    {
      id: 'freelancer',
      name: 'Freelancer Suite',
      icon: '💼',
      description: 'Solo professional — proposals, client comms, social presence, invoicing.',
      agents: [
        { name: 'Pitch Master', role: 'Proposal & Sales Writer', persona: { personality: 'confident, articulate', tone: 'professional, value-focused', expertise: ['proposal writing', 'pricing strategy', 'cold outreach'] }, tools: ['summarize', 'web-search'] },
        { name: 'Client Manager', role: 'Client Communications', persona: { personality: 'organized, responsive', tone: 'warm but businesslike', expertise: ['email management', 'follow-ups', 'meeting prep'] }, tools: ['summarize'] },
        { name: 'Brand Builder', role: 'Personal Brand & Social', persona: { personality: 'authentic, strategic', tone: 'thought-leader', expertise: ['linkedin', 'twitter', 'portfolio content'] }, tools: ['generate-image', 'generate-social-post'] },
      ],
      flow: 'router',
      integrations: ['gmail', 'calendar', 'drive'],
    },
    {
      id: 'realestate',
      name: 'Real Estate Command',
      icon: '🏠',
      description: 'Real estate operations — listings, lead nurturing, open house marketing, market analysis.',
      agents: [
        { name: 'Listing Agent', role: 'Property Listing Creator', persona: { personality: 'descriptive, enthusiastic', tone: 'aspirational, warm', expertise: ['property descriptions', 'virtual tours', 'MLS optimization'] }, tools: ['generate-image', 'generate-social-post', 'web-search'] },
        { name: 'Lead Nurture', role: 'Lead Management', persona: { personality: 'persistent, personal', tone: 'conversational', expertise: ['email drips', 'follow-up sequences', 'CRM management'] }, tools: ['summarize'] },
        { name: 'Market Analyst', role: 'Market Intelligence', persona: { personality: 'analytical, thorough', tone: 'data-driven', expertise: ['comparable sales', 'market trends', 'pricing strategy'] }, tools: ['web-search', 'summarize'] },
        { name: 'Open House Pro', role: 'Event Marketing', persona: { personality: 'creative, organized', tone: 'inviting', expertise: ['event planning', 'social promotion', 'neighborhood guides'] }, tools: ['generate-image', 'generate-social-post'] },
      ],
      flow: 'router',
      integrations: ['gmail', 'calendar', 'drive'],
    },
    {
      id: 'agency',
      name: 'Creative Agency',
      icon: '🎨',
      description: 'Creative agency operations — content creation, client work, project management.',
      agents: [
        { name: 'Creative Director', role: 'Creative Strategy', persona: { personality: 'visionary, decisive', tone: 'inspiring', expertise: ['brand strategy', 'campaign concepts', 'creative briefs'] }, tools: ['generate-image', 'summarize'] },
        { name: 'Copywriter', role: 'Content Writer', persona: { personality: 'witty, versatile', tone: 'adapts to brand voice', expertise: ['headlines', 'long-form', 'social copy', 'scripts'] }, tools: ['generate-social-post', 'summarize'] },
        { name: 'Social Strategist', role: 'Social Media Strategy', persona: { personality: 'trend-aware, analytical', tone: 'platform-native', expertise: ['content calendars', 'engagement', 'analytics'] }, tools: ['generate-image', 'generate-video', 'generate-social-post', 'web-search'] },
        { name: 'Account Manager', role: 'Client Relations', persona: { personality: 'organized, diplomatic', tone: 'professional, reassuring', expertise: ['status reports', 'timeline management', 'client presentations'] }, tools: ['summarize'] },
      ],
      flow: 'hierarchical',
      integrations: ['gmail', 'calendar', 'drive'],
    },
    {
      id: 'fitness',
      name: 'Fitness Studio',
      icon: '💪',
      description: 'Gym/studio operations — class scheduling, member engagement, social content, wellness tips.',
      agents: [
        { name: 'Content Coach', role: 'Fitness Content Creator', persona: { personality: 'motivating, energetic', tone: 'encouraging, upbeat', expertise: ['workout videos', 'transformation stories', 'wellness tips'] }, tools: ['generate-image', 'generate-video', 'generate-social-post'] },
        { name: 'Member Manager', role: 'Member Engagement', persona: { personality: 'friendly, attentive', tone: 'warm, personal', expertise: ['retention emails', 'milestone celebrations', 'referral programs'] }, tools: ['summarize'] },
        { name: 'Class Scheduler', role: 'Schedule & Operations', persona: { personality: 'organized, efficient', tone: 'clear, informative', expertise: ['class scheduling', 'instructor coordination', 'capacity planning'] }, tools: ['summarize'] },
      ],
      flow: 'router',
      integrations: ['gmail', 'calendar'],
    },
  ];

  function list() { return TEMPLATES.map(t => ({ id: t.id, name: t.name, icon: t.icon, description: t.description, agentCount: t.agents.length })); }
  function get(id) { return TEMPLATES.find(t => t.id === id) || null; }
  function getByKeyword(keyword) {
    const kw = keyword.toLowerCase();
    return TEMPLATES.find(t =>
      t.id.includes(kw) || t.name.toLowerCase().includes(kw) || t.description.toLowerCase().includes(kw)
    ) || null;
  }

  return { list, get, getByKeyword, TEMPLATES };
})();
