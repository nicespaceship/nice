# Self-Hosting NICE™

NICE is a static SPA — no build step, no Node.js runtime needed. Just serve the files.

## Quick Start (Docker)

```bash
git clone https://github.com/nicespaceship/nice.git
cd nice
docker compose up -d
# Open http://localhost:3000/app/
```

## Quick Start (No Docker)

```bash
git clone https://github.com/nicespaceship/nice.git
cd nice
npx serve . -l 3000
# Open http://localhost:3000/app/
```

## Full Setup (Your Own Backend)

### 1. Supabase Project

1. Create a free project at [supabase.com](https://supabase.com)
2. Update `app/js/lib/supabase.js` with your project URL and anon key
3. Run the database migrations (see `supabase/migrations/`)
4. Deploy edge functions:
   ```bash
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase functions deploy
   ```

### 2. Required Secrets

Set these in your Supabase project (Dashboard → Edge Functions → Secrets):

| Secret | Required | Description |
|--------|:---:|---|
| `GOOGLE_AI_API_KEY` | ✅ | Free from [aistudio.google.com](https://aistudio.google.com/apikey) |
| `ANTHROPIC_API_KEY` | Optional | For Claude models |
| `OPENAI_API_KEY` | Optional | For GPT-5 models |
| `GOOGLE_CLIENT_ID` | Optional | For Google Workspace OAuth |
| `GOOGLE_CLIENT_SECRET` | Optional | For Google Workspace OAuth |
| `STRIPE_SECRET_KEY` | Optional | For token purchases |
| `STRIPE_WEBHOOK_SECRET` | Optional | For payment verification |

### 3. Seed Blueprints

The 308 blueprints are seeded automatically on first load from `BlueprintStore`. If you want to customize:

```bash
npx supabase db seed
```

### 4. Google Workspace (Optional)

To enable Gmail, Calendar, and Drive access for agents:

1. Create a GCP project and OAuth consent screen
2. Create OAuth 2.0 credentials
3. Add `https://YOUR_SUPABASE_URL/auth/v1/callback` as redirect URI
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Supabase secrets
5. Enable Google as an auth provider in Supabase Dashboard

### 5. Stripe Payments (Optional)

1. Create products and prices in Stripe
2. Add payment links to `app/js/views/wallet.js`
3. Create a webhook endpoint pointing to your `stripe-webhook` edge function
4. Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in Supabase secrets

## Deployment Options

| Platform | How |
|----------|-----|
| **Cloudflare Pages** | Connect GitHub repo, auto-deploys on push |
| **Netlify** | Same as Cloudflare Pages — connect and deploy |
| **Docker** | `docker compose up -d` |
| **Any static host** | Upload `index.html`, `app/`, `assets/`, `public/` |
| **GitHub Pages** | Enable in repo settings |

## Architecture

NICE is a static SPA with no build step. All JS modules are IIFEs loaded via `<script>` tags. The backend is Supabase (auth, database, realtime, edge functions).

See [CLAUDE.md](./CLAUDE.md) for the full architecture reference.
