# NICE™

**Neural Intelligence Command Engine** — AI agents that run your business.

NICE is an open-source platform for building, deploying, and managing AI agent workflows. Browse 800+ pre-built blueprints, activate a team of AI agents, and let them handle your marketing, content, analytics, scheduling, and operations. One platform replaces the 5-15 SaaS tools you're paying for today.

**[Try it free](https://nicespaceship.ai)** | **[Academy](https://nicespaceship.com/academy)** | **[Community (Reddit)](https://reddit.com/r/nicespaceship)**

---

## How It Works

1. **Browse** — Find a blueprint for your business (Restaurant, Real Estate, Marketing Agency, YouTube Creator, and 800+ more)
2. **Activate** — Deploy it as your Spaceship. A team of AI agents is auto-created with the right skills and tools.
3. **Customize** — Drag and drop agents into slots. Connect Gmail, Calendar, Drive. Adjust settings.
4. **Run** — Your agents execute real work. NICE routes each task to the best LLM automatically.

## Features

- **800+ Blueprints** — Pre-built AI workflow templates for every type of business
- **Multi-LLM Routing** — 10 models from 6 providers (Gemini, Claude, GPT-5, Mistral, DeepSeek, Grok). NICE picks the best model for each task.
- **Multi-Agent Orchestration** — Pipeline, Parallel, Hierarchical, and Quality Loop patterns
- **Drag-and-Drop Slots** — Visual agent assignment, no coding required
- **Google Workspace Integration** — Gmail, Calendar, Drive connected via MCP protocol
- **Real-Time Streaming** — Watch agent responses as they generate (SSE)
- **XP Progression** — 12 ranks, 22 achievements, streak multipliers. Gamified but functional.
- **Blueprint Sharing** — Share agent configs via Soul Keys or links
- **11 Themes** — Including The Office (corporate), Navigator (TRON), and more
- **PWA** — Install on any device, works offline
- **Free Tier** — Unlimited Gemini Flash, 100K tokens, no credit card required

## Quick Start

```bash
git clone https://github.com/nicespaceship/nice.git
cd nice
npm install
npx serve .
# Open http://localhost:3000/app/
```

For full setup (Supabase, edge functions, API keys), see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Architecture

Vanilla JavaScript SPA. No framework, no build step for development. 73 IIFE modules loaded via `<script>` tags in dependency order.

```
app/
├── index.html          # SPA shell
├── css/app.css         # Component styles (8000+ lines)
├── js/
│   ├── nice.js         # Main orchestrator
│   ├── lib/            # 36 shared modules (State, Router, Supabase, etc.)
│   └── views/          # 24 view modules
├── sw.js               # Service Worker (offline, push, sync)
└── manifest.json       # PWA manifest

supabase/functions/     # 8 Deno edge functions
├── nice-ai/            # Multi-provider LLM proxy
├── mcp-gateway/        # MCP tool router
├── gmail-mcp/          # Gmail integration
├── calendar-mcp/       # Google Calendar
├── drive-mcp/          # Google Drive
├── google-oauth/       # OAuth 2.0 flow
├── stripe-webhook/     # Token purchases
└── blueprint-search/   # Full-text search
```

See [CLAUDE.md](./CLAUDE.md) for the full architecture reference.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JS, CSS custom properties, PWA |
| Backend | Supabase (Postgres, Auth, Realtime, Edge Functions) |
| AI | 6 LLM providers via nice-ai proxy with SSE streaming |
| Integrations | MCP protocol (Gmail, Calendar, Drive) |
| Payments | Stripe (token packages) |
| Deployment | Vercel (auto-deploy from GitHub) |
| Testing | Vitest (343 unit) + Playwright (14 E2E) |

## Testing

```bash
npm test              # Unit tests (Vitest)
npm run test:e2e      # E2E tests (Playwright)
```

CI runs on every push via GitHub Actions. Both test suites must pass to merge.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup instructions, coding conventions, and how to submit pull requests.

## License

MIT License. See [LICENSE](./LICENSE).

## Links

- **App:** [nicespaceship.ai](https://nicespaceship.ai)
- **Company:** [nicespaceship.com](https://nicespaceship.com)
- **GitHub:** [nicespaceship/nice](https://github.com/nicespaceship/nice)

Built by [Benjamin Duffey](https://benduffey.com) at NICE SPACESHIP, Las Vegas, NV.
