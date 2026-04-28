# Persona Tier 3 — `nice-ai` deploy notes (PR 2)

This is the runbook for deploying the Tier 3 judge wire-up to the proprietary
`nice-ai` edge function. The reference module + schema shipped in
[PR #311](https://github.com/nicespaceship/nice/pull/311); this is the next step.

`nice-ai` source is **not in this repo** (proprietary). These notes describe
the changes you'll make to the version you pull via `supabase functions
download nice-ai`.

## What ships

Two files inside the `nice-ai` function directory:

1. **`persona-judge.js`** — direct copy of `tools/persona-judge-ref/judge.js`
   (no fork; same pattern as `persona-compiler.js`).
2. **`index.ts`** — four additions:
   - Import block from `./persona-judge.js`
   - Lift `personaRow` AND `resolvedCallsign` to outer scope (`personaRowForJudge`,
     `callsignForJudge`) — the judge needs both to evaluate against the rendered
     hard_rules the model actually saw, not raw `{callsign}` placeholders.
   - Wrap successful response with `wrapResponseForJudging` before return
   - Add `wrapResponseForJudging` + `triggerJudge` helpers near `debitPool`

A reference staging snapshot of the changes is built on demand:

```bash
npx supabase functions download nice-ai --project-ref zacllshbgmnwsmliteqx
cp tools/persona-judge-ref/judge.js supabase/functions/nice-ai/persona-judge.js
# Apply the index.ts edits — see the diff at the bottom of this doc.
```

## Pre-deploy

- [ ] Confirm `personas.use_structured` is gone (it is; dropped in #291).
- [ ] Confirm `public.persona_judgments` exists with RLS on, zero policies (it does; PR #311).
- [ ] Confirm the function dir contains both `index.ts` and `persona-judge.js`.
- [ ] Sanity-test the file lands on Deno: `deno check supabase/functions/nice-ai/index.ts`
      (any local install of Deno; this catches a busted import path before deploy).

## Deploy

```bash
cd /path/to/nice
npx supabase functions deploy nice-ai \
  --project-ref zacllshbgmnwsmliteqx \
  --no-verify-jwt
```

The `--no-verify-jwt` flag is **required** — see CLAUDE.md "Edge Function JWT
Verification". The function still validates the user internally via
`supabase.auth.getUser()`.

The deploy takes ~30s. The CLI prints the new function version when it lands.

## Post-deploy smoke

In one terminal, tail the function logs:

```bash
npx supabase functions logs nice-ai --project-ref zacllshbgmnwsmliteqx --tail
```

In a browser, sign into nicespaceship.ai, switch to a vivid theme (HAL or
JARVIS), and send three short chats. You should see for each:

```
[nice-ai] persona compiled { theme_id: "hal-9000", ... }
[nice-ai] judgment { theme_id: "hal-9000", provider: "...", model: "...", score: <num>, passed: <bool>, judge_latency_ms: <ms> }
```

Then verify in SQL:

```sql
SELECT theme_id, score, passed, voice_drift, judge_latency_ms, created_at
FROM persona_judgments
ORDER BY created_at DESC
LIMIT 10;
```

You should see one row per chat reply you sent. `judge_latency_ms` should be
roughly 400–900ms (Flash is fast, but cold starts vary).

If the count is half what you expected: the streaming wrapper might be
swallowing chunks. Check function logs for `judge failed:` lines.

## Cost estimate

Per chat reply, judge call uses roughly:

- 700 tokens system prompt (cached after first call) + 500 tokens user prompt + 100 tokens output = ~1,300 tokens
- Gemini Flash 2.5: ~$0.075/1M input, ~$0.30/1M output
- Per call ≈ $0.0001 (¹⁄₁₀,₀₀₀ of a dollar)
- 10,000 chat replies/day ≈ $1/day
- Insert latency to Supabase: ~50–150ms inside the fire-and-forget context — invisible to user

Sampling can be added later if cost becomes meaningful. Not in MVP.

## Rollback

The judge wrapper is **fail-open** (any judge or insert error is swallowed
and the response is returned unchanged). So deploy itself doesn't put user
chat at risk.

If you do need to back out:

```bash
# Pull the previous version, redeploy
npx supabase functions download nice-ai --project-ref zacllshbgmnwsmliteqx --version <previous>
npx supabase functions deploy nice-ai --project-ref zacllshbgmnwsmliteqx --no-verify-jwt
```

Or just remove the judge wiring (revert the import + remove the wrap call +
remove the two new functions) and redeploy. The schema can stay —
`persona_judgments` becomes a no-write table until the next deploy.

## Soak window for PR 3

Two weeks of judgment data is a reasonable starting point. Daily query:

```bash
node tools/persona-judge-ref/analyze.mjs --since "$(date -u -v-7d '+%Y-%m-%d')"
```

Decision criteria for whether to add sync regen are documented at the top of
`analyze.mjs`.

## The diff (for reference)

The `index.ts` changes are at most three localized edits. Pull the current
file and apply:

1. **Import block** (top of file, after the existing `persona-compiler` import):
   ```ts
   import {
     buildJudgePrompt,
     parseJudgeResponse,
     truncateExcerpt,
     JUDGE_SYSTEM_PROMPT,
     DEFAULT_JUDGE_MODEL,
   } from "./persona-judge.js";
   ```

2. **Lift `personaRow` and `resolvedCallsign`** (in `Deno.serve` handler, just
   before the `if (typeof theme_id === "string"…)` block):
   ```ts
   let personaRowForJudge: Record<string, unknown> | null = null;
   let callsignForJudge: string | null = null;
   ```
   And inside that block, after the fallback assignment and right after the
   `compilePersonaPrompt(persona, provider, appContext, callsign)` call (the
   sanitized callsign is the same one the compiler interpolates into the
   system prompt — capture it so the judge sees the same rendered text):
   ```ts
   personaRowForJudge = personaRow;
   callsignForJudge = sanitizeCallsign(callsign) ?? personaRow?.data?.defaultCallsign ?? null;
   ```

3. **Wrap response before return** (replace the existing `return response;` after
   the `debitPool` block):
   ```ts
   if (theme_id && personaRowForJudge && response.ok) {
     return wrapResponseForJudging(
       response,
       theme_id as string,
       provider,
       model,
       personaRowForJudge,
       callsignForJudge,
     );
   }
   return response;
   ```

4. **Add helpers** (after `debitPool`):
   - `wrapResponseForJudging(response, theme_id, provider, model, personaRow, callsign)`
     — handles non-streaming JSON and SSE; the new `callsign` arg is threaded
     through to `triggerJudge`.
   - `triggerJudge(theme_id, provider, model, personaRow, callsign, replyText)` —
     builds prompt, calls Flash, INSERTs. Pass `callsign` via `judgePersona(
     persona, replyText, callJudge, { callsign })` so the judge sees the rendered
     hard_rules the model saw — without this, the judge reads literal
     `{callsign}` and flags any reply that uses the actual name.

The full body of (4) is staged at `/tmp/nice-ai-tier3-staging/index.ts` after
running the prep commands above. Verify the diff with:

```bash
diff -u /tmp/nice-ai-tier3-staging/index.ts.original /tmp/nice-ai-tier3-staging/index.ts
```
