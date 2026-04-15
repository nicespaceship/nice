# NICE™ — Open Source & Hosted

NICE is MIT-licensed. The frontend, database schema, 924 blueprints, and
self-hosting docs are all in this repo. Anyone can fork, run, modify, and
redistribute the app under the terms of the [LICENSE](./LICENSE).

This document explains the line between the open-source code you get from
this repo and the hosted product at **https://nicespaceship.ai**. If you're
planning to self-host, read this first so you know what you're working with.

---

## What's in this repo (free, MIT)

Everything you need to run a working NICE SPA on your own infrastructure:

- **Frontend SPA** — `app/` (49 lib modules, 25 views, skin system, gamification, tests)
- **Database schema** — `migrations/` (Postgres / Supabase migrations)
- **Blueprints catalog** — 924 pre-built agents + spaceships seeded via migrations
- **Self-hosting guide** — [`SELF_HOSTING.md`](./SELF_HOSTING.md) + `docker-compose.yml`
- **Landing site** — `www/`
- **Tests** — 437 unit tests (Vitest) + 22 E2E tests (Playwright)
- **Build tooling** — `scripts/build.js`, CI workflow, type generator

You can clone this repo, run `docker compose up`, point it at your own
Supabase project, and have a running NICE instance in minutes. You'll need
to bring your own LLM provider API keys (Google AI, Anthropic, OpenAI, etc.).

## What's NOT in this repo (proprietary, hosted-only)

The parts of NICE that are only available at **https://nicespaceship.ai**:

- **Supabase edge functions** (`supabase/functions/` is intentionally empty):
  - `nice-ai` — multi-provider LLM proxy with weighted token accounting
  - `nice-media` — image / video generation
  - `stripe-webhook` — credits tokens on Stripe purchase
  - `mcp-gateway`, `gmail-mcp`, `calendar-mcp`, `drive-mcp`, `social-mcp`
  - `google-oauth`, `blueprint-search`, `browser-proxy`
- **NICE SPACESHIP's Stripe products** (payment links, price IDs, webhook secrets)
- **NICE SPACESHIP's provider API keys** (Anthropic, OpenAI, Google AI, Mistral, etc.)
- **Hosted infrastructure** (the actual Supabase project, Cloudflare Pages deployment, domain)

These are the parts NICE SPACESHIP operates as a managed service. They're
not open source, and they're not required to run NICE yourself — you can
write your own or skip them.

## Running NICE for free (self-hosted)

**You don't need any of the proprietary pieces to run NICE.** The OSS code
covers the entire app surface. For a fully self-hosted deployment:

1. Clone this repo and follow [`SELF_HOSTING.md`](./SELF_HOSTING.md)
2. Bring your own Supabase project (free tier works)
3. Bring your own LLM provider keys (any combination of Google / Anthropic / OpenAI)
4. Either:
   - **Disable the paywall entirely** by setting `window.NICE_CONFIG = { paywallEnabled: false }` in your HTML — every user is treated as a full Pro subscriber, no billing code runs
   - **OR** wire up your own Stripe account and write your own webhook handler if you want to charge users yourself

You get the full app — bridge, blueprints, missions, MCPs, spaceships, skins,
all of it. The only thing you don't get is NICE SPACESHIP's hosted backend
(and you're not missing anything that isn't reproducible).

## Using NICE SPACESHIP's hosted version

The hosted SaaS at **https://nicespaceship.ai** is how NICE SPACESHIP pays
the bills:

| Tier | Price | What you get |
|---|---|---|
| **Free** | $0 | 6 slots, XP progression to Legendary, Gemini 2.5 Flash (unlimited) |
| **Pro** | $9.99/month | 12 slots, Legendary instantly, 1,000 Standard tokens/month, all non-flagship models |
| **Pro + Claude add-on** | +$10/month | Adds Claude Haiku / Sonnet 4 / Opus 4, 500 Claude tokens/month |
| **Top-up packs** | $29.99 / $49.99 | Extra tokens that never expire (Pro subscribers only) |

Hosted users don't manage infrastructure, don't need LLM provider accounts,
and get automatic blueprint updates (924 and growing). Everything the
self-hosted version offers, plus the proprietary backend.

## Contributing

Contributions to the OSS code are welcome. See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

The proprietary edge functions are **not** open for external contributions —
they're operated by NICE SPACESHIP and the source isn't public. If you find
a bug in the frontend that stems from edge function behavior, file an issue
and NICE SPACESHIP will investigate.

## Why open source at all?

Because the value of NICE is the frontend, the blueprint catalog, and the
architecture — not the LLM proxy code. Anyone can write a multi-provider
proxy; only NICE has the 924 agent blueprints, the spaceship system, the
gamified XP ladder, and the integrated toolchain around them. Open-sourcing
the SPA lets developers self-host, fork, and build on top of NICE without
forcing anyone into a SaaS contract.

If you're building an agentic app and you want to use any piece of this
code — the blueprint system, the card renderer, the mission runner, the
skin engine — take it. That's what the MIT license is for.
