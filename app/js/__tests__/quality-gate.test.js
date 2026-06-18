import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

function loadModule(rel) {
  let code = readFileSync(resolve(__dir, '..', rel), 'utf-8');
  code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(code);
}

// Drives QualityGate.review's single SB.functions.invoke('nice-ai', …) call.
// `setLLM` queues responses in `invokeQueue` (consumed FIFO); `lastBody`
// captures the request so prompt-construction can be asserted.
let invokeQueue;
let lastBody;
function setLLM(...responses) {
  invokeQueue = [...responses];
  globalThis.SB = {
    functions: {
      invoke: async (_fn, opts) => {
        lastBody = opts.body;
        if (!invokeQueue.length) throw new Error('no scripted LLM response left');
        const next = invokeQueue.shift();
        if (typeof next === 'function') return next(opts);
        return next;
      },
    },
  };
}
// Wraps a review verdict as the JSON the gate expects back from the model.
function llmReview({ overall, pass, feedback = 'ok', scores = {} }) {
  const body = { scores, overall, feedback };
  if (pass !== undefined) body.pass = pass;
  return { data: { content: JSON.stringify(body) }, error: null };
}

loadModule('lib/quality-gate.js');

beforeEach(() => {
  invokeQueue = [];
  lastBody = null;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('QualityGate.review', () => {
  describe('short-circuit guard', () => {
    it('rejects empty output with score 1 and never calls the LLM', async () => {
      let called = false;
      globalThis.SB = { functions: { invoke: async () => { called = true; } } };
      const r = await QualityGate.review('task', '');
      expect(r).toEqual({ score: 1, pass: false, feedback: expect.any(String), criteria: {} });
      expect(called).toBe(false);
    });

    it('rejects output shorter than 20 chars', async () => {
      const r = await QualityGate.review('task', 'too short');
      expect(r.pass).toBe(false);
      expect(r.score).toBe(1);
    });

    it('treats null output as a rejection', async () => {
      const r = await QualityGate.review('task', null);
      expect(r.pass).toBe(false);
    });
  });

  describe('LLM path', () => {
    const LONG = 'This is a sufficiently long agent output to clear the 20-char guard.';

    it('returns the parsed score, pass, feedback, and criteria from valid JSON', async () => {
      setLLM(llmReview({ overall: 8, pass: true, feedback: 'Strong answer.', scores: { quality: 9 } }));
      const r = await QualityGate.review('Summarize Q3', LONG);
      expect(r).toEqual({ score: 8, pass: true, feedback: 'Strong answer.', criteria: { quality: 9 } });
    });

    it('derives pass from overall vs threshold when the model omits pass', async () => {
      setLLM(llmReview({ overall: 6 })); // no explicit pass
      const r = await QualityGate.review('t', LONG); // default threshold 7
      expect(r.pass).toBe(false);
      expect(r.score).toBe(6);
    });

    it('honors a custom threshold passed through opts', async () => {
      setLLM(llmReview({ overall: 6 }));
      const r = await QualityGate.review('t', LONG, { threshold: 5 });
      expect(r.pass).toBe(true);
    });

    it('forwards the criteria list and truncates the reviewed output to 2000 chars', async () => {
      setLLM(llmReview({ overall: 9, pass: true }));
      const huge = 'x'.repeat(5000);
      await QualityGate.review('My Task', huge, { criteria: ['accuracy', 'safety'] });
      const sys = lastBody.messages[0].content;
      const user = lastBody.messages[1].content;
      expect(sys).toContain('accuracy, safety');
      expect(user).toContain('My Task');
      // 'OUTPUT TO REVIEW:\n' + first 2000 chars of x's — the body must not carry all 5000.
      expect((user.match(/x/g) || []).length).toBe(2000);
    });

    it('reviews on the free Gemini Flash model at low temperature', async () => {
      setLLM(llmReview({ overall: 8, pass: true }));
      await QualityGate.review('t', LONG);
      expect(lastBody.model).toBe('gemini-2.5-flash');
      expect(lastBody.temperature).toBeLessThanOrEqual(0.3);
    });

    it('normalizes an Anthropic-style content array before parsing', async () => {
      setLLM({
        data: { content: [{ text: '{"overall":7,"pass":true,"feedback":"good","scores":{}}' }] },
        error: null,
      });
      const r = await QualityGate.review('t', LONG);
      expect(r.score).toBe(7);
      expect(r.pass).toBe(true);
    });
  });

  describe('LLM failure → offline fallback', () => {
    const LONG = 'A reasonably long output string that comfortably exceeds twenty characters.';

    it('falls back to the offline heuristic when the LLM returns an error', async () => {
      setLLM({ data: null, error: { message: 'upstream 503' } });
      const r = await QualityGate.review('t', LONG);
      // Offline review always emits its sentinel feedback strings.
      expect(r.feedback).toMatch(/offline review/i);
      expect(console.warn).toHaveBeenCalled();
    });

    it('falls back to offline when the invoke call throws', async () => {
      globalThis.SB = { functions: { invoke: async () => { throw new Error('network down'); } } };
      const r = await QualityGate.review('t', LONG);
      expect(r.feedback).toMatch(/offline review/i);
    });

    it('falls back to offline when SB has no functions client', async () => {
      globalThis.SB = {};
      const r = await QualityGate.review('t', LONG);
      expect(r.feedback).toMatch(/offline review/i);
    });

    it('falls back to offline when SB is undefined entirely', async () => {
      globalThis.SB = undefined;
      const r = await QualityGate.review('t', LONG);
      expect(r.feedback).toMatch(/offline review/i);
    });
  });

  describe('review JSON parsing (via the LLM path)', () => {
    const LONG = 'Long enough output to pass the length guard for parsing tests here.';

    it('extracts score from loose "overall: N" text when there is no JSON object', async () => {
      setLLM({ data: { content: 'I think the overall: 9 here, great work.' }, error: null });
      const r = await QualityGate.review('t', LONG, { threshold: 7 });
      expect(r.score).toBe(9);
      expect(r.pass).toBe(true);
      expect(r.criteria).toEqual({});
    });

    it('defaults to score 5 when neither JSON nor an overall number is present', async () => {
      setLLM({ data: { content: 'No structured verdict at all.' }, error: null });
      const r = await QualityGate.review('t', LONG, { threshold: 7 });
      expect(r.score).toBe(5);
      expect(r.pass).toBe(false); // 5 < 7
    });

    it('recovers via the regex fallback when the JSON block is malformed', async () => {
      // Matches the {…"overall"…} regex but is not valid JSON → JSON.parse throws,
      // the catch falls through to the "overall: N" scan.
      setLLM({ data: { content: '{ "overall": 8, bad json,, }' }, error: null });
      const r = await QualityGate.review('t', LONG, { threshold: 7 });
      expect(r.score).toBe(8);
      expect(r.pass).toBe(true);
    });
  });

  describe('offline heuristic scoring', () => {
    // SB without a functions client routes straight to _offlineReview, so the
    // score is a deterministic function of the output's shape.
    beforeEach(() => { globalThis.SB = {}; });

    it('passes a long, structured, numeric output', async () => {
      // base 5 +1(>500) +1(>1000) +1(structure '##') +1(digit) = 9
      const out = '## Plan\n' + 'word 1 '.repeat(200); // > 1000 chars, has ## and digits
      const r = await QualityGate.review('t', out, { threshold: 7 });
      expect(r.score).toBe(9);
      expect(r.pass).toBe(true);
      expect(r.criteria).toEqual({ length: 8, structure: 8 });
    });

    it('reports criteria.structure via a narrower regex than the score bonus uses', async () => {
      // The score's structure bonus matches '- ' bullets (/\*\*|##|•|-\s/), but
      // the returned criteria.structure only checks /\*\*|##/ — so a dash-bulleted
      // output earns the +1 yet still reports structure: 4. Pin that divergence.
      const out = '- one\n- two\n- three ' + 'x'.repeat(520); // >500, '- ' bullets, no ##/**
      const r = await QualityGate.review('t', out, { threshold: 7 });
      expect(r.score).toBe(7); // base 5 +1(>500) +1('- ' structure); no >1000, no digit
      expect(r.criteria.length).toBe(8);
      expect(r.criteria.structure).toBe(4); // narrower regex misses '- '
    });

    it('scores a short, plain, number-free output at the neutral baseline', async () => {
      const out = 'just enough words here to clear the twenty character guard cleanly';
      const r = await QualityGate.review('t', out, { threshold: 7 });
      expect(r.score).toBe(5);
      expect(r.pass).toBe(false);
    });

    it('penalizes apologetic / error output by two points', async () => {
      const out = 'I apologize, but I am unable to help with that request right now.';
      const r = await QualityGate.review('t', out, { threshold: 7 });
      expect(r.score).toBe(3); // 5 - 2
      expect(r.pass).toBe(false);
    });

    it('passes a borderline output once the threshold is lowered', async () => {
      const out = 'just enough words here to clear the twenty character guard cleanly';
      const r = await QualityGate.review('t', out, { threshold: 5 });
      expect(r.pass).toBe(true); // score 5 >= 5
    });
  });
});

describe('QualityGate.gatedRun', () => {
  const LONG_OUT = 'A long-enough produced output that clears the review length guard.';

  it('returns after one attempt when the first output passes', async () => {
    setLLM(llmReview({ overall: 9, pass: true }));
    const execute = vi.fn(async () => LONG_OUT);
    const res = await QualityGate.gatedRun(execute, 'task');
    expect(res.attempts).toBe(1);
    expect(res.output).toBe(LONG_OUT);
    expect(res.review.pass).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('retries until an attempt passes and reports the attempt count', async () => {
    setLLM(llmReview({ overall: 3, pass: false }), llmReview({ overall: 8, pass: true }));
    const execute = vi.fn(async () => LONG_OUT);
    const res = await QualityGate.gatedRun(execute, 'task');
    expect(res.attempts).toBe(2);
    expect(res.review.pass).toBe(true);
  });

  it('stops at maxRetries + 1 attempts when every attempt fails', async () => {
    setLLM(
      llmReview({ overall: 2, pass: false }),
      llmReview({ overall: 2, pass: false }),
      llmReview({ overall: 2, pass: false }),
    );
    const execute = vi.fn(async () => LONG_OUT);
    const res = await QualityGate.gatedRun(execute, 'task'); // default maxRetries 2
    expect(res.attempts).toBe(3);
    expect(res.review.pass).toBe(false);
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it('respects a custom maxRetries', async () => {
    setLLM(
      llmReview({ overall: 1, pass: false }),
      llmReview({ overall: 1, pass: false }),
    );
    const execute = vi.fn(async () => LONG_OUT);
    const res = await QualityGate.gatedRun(execute, 'task', { maxRetries: 1 });
    expect(res.attempts).toBe(2);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('feeds the prior feedback back into the executor on retry, but not on the first call', async () => {
    setLLM(llmReview({ overall: 3, pass: false, feedback: 'Add specifics.' }), llmReview({ overall: 9, pass: true }));
    const prompts = [];
    const execute = vi.fn(async (retryPrompt) => { prompts.push(retryPrompt); return LONG_OUT; });
    await QualityGate.gatedRun(execute, 'task');
    expect(prompts[0]).toBeNull();
    expect(prompts[1]).toContain('Add specifics.');
  });

  it('invokes onRetry between failed attempts', async () => {
    setLLM(
      llmReview({ overall: 2, pass: false }),
      llmReview({ overall: 2, pass: false }),
      llmReview({ overall: 2, pass: false }),
    );
    const onRetry = vi.fn();
    await QualityGate.gatedRun(async () => LONG_OUT, 'task', { onRetry });
    // Called only when i < maxRetries (i=0 and i=1) — not after the final attempt.
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0][0]).toMatchObject({ attempt: 1 });
  });

  it('captures a thrown executor error as the output and still reviews it', async () => {
    globalThis.SB = {}; // 'Error: boom' (11 chars) hits the <20 length guard on every attempt
    const execute = vi.fn(async () => { throw new Error('boom'); });
    const res = await QualityGate.gatedRun(execute, 'task');
    expect(res.output).toContain('Error: boom');
    expect(res.review).toBeTruthy();
    // The error string never passes review, so it runs the full default cap.
    expect(res.attempts).toBe(3);
  });

  it('treats maxRetries: 0 as the default cap — a known || footgun', async () => {
    // `var maxRetries = opts.maxRetries || MAX_RETRIES` reads 0 as falsy, so a
    // caller asking for "no retries" silently gets the default 2. Pinned so the
    // behavior can't drift unnoticed; a real fix (`!= null ? … : …`) would be a
    // separate, intentional change.
    setLLM(
      llmReview({ overall: 2, pass: false }),
      llmReview({ overall: 2, pass: false }),
      llmReview({ overall: 2, pass: false }),
    );
    const execute = vi.fn(async () => LONG_OUT);
    const res = await QualityGate.gatedRun(execute, 'task', { maxRetries: 0 });
    expect(res.attempts).toBe(3);
    expect(execute).toHaveBeenCalledTimes(3);
  });
});
