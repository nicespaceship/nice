# Contributing to NICE™

Thank you for your interest in contributing to NICE — the Neural Intelligence Command Engine!

## Getting Started

### Prerequisites
- Node.js 20+
- A Supabase project (free tier works)
- A Google AI API key (free from [aistudio.google.com](https://aistudio.google.com/apikey))

### Setup

1. **Clone the repo**
   ```bash
   git clone https://github.com/nicespaceship/nice.git
   cd nice
   npm install
   ```

2. **Configure Supabase**
   - Create a project at [supabase.com](https://supabase.com)
   - Copy your project URL and anon key
   - Update `app/js/lib/supabase.js` with your credentials

3. **Deploy edge functions**
   ```bash
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase functions deploy
   ```

4. **Set Supabase secrets**
   ```bash
   npx supabase secrets set GOOGLE_AI_API_KEY=your_key
   ```

5. **Run locally**
   ```bash
   npx serve .
   # Open http://localhost:3000/app/
   ```

### Running Tests
```bash
npm test          # Unit tests (Vitest, 343 tests)
npm run test:e2e  # E2E tests (Playwright, 14 tests)
```

## How to Contribute

### Reporting Bugs
- Open a GitHub issue with a clear description
- Include steps to reproduce, expected behavior, and actual behavior
- Screenshots or screen recordings are helpful

### Suggesting Features
- Open a GitHub issue with the `enhancement` label
- Describe the use case and why it would be valuable
- If possible, include a rough design or mockup

### Submitting Code

1. Fork the repo and create a branch from `main`
2. Follow the existing code patterns (IIFE modules, no build step)
3. Add tests if applicable
4. Ensure all tests pass: `npm test && npm run test:e2e`
5. Submit a pull request

### Code Style

NICE uses vanilla JavaScript with IIFE modules — no build step, no bundler, no framework.

```javascript
const MyModule = (() => {
  // Private state
  let _count = 0;

  // Private functions
  function _helper() { /* ... */ }

  // Public API
  return {
    doThing() { _count++; _helper(); },
    getCount() { return _count; },
  };
})();
```

**Key conventions:**
- All modules are IIFEs loaded via `<script>` tags in dependency order
- Use `State.get()` / `State.set()` for shared state (pub/sub)
- Use `SB.db()` for Supabase operations
- Escape user content with `Utils.esc()` before inserting into DOM
- CSS custom properties for theming (`var(--accent)`, etc.)
- No `innerHTML` with unsanitized user input

### Architecture

See [CLAUDE.md](./CLAUDE.md) for the full architecture reference including:
- Module dependency map
- Route definitions
- Database schema
- Edge function inventory
- Skin/theme system

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
