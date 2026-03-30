/* ═══════════════════════════════════════════════════════════════════
   NICE — Quality Gate
   Auto-reviews agent output before surfacing to user.
   Uses Gemini Flash (free) to score quality, relevance, and tone.
   Can be inserted into any mission pipeline.
═══════════════════════════════════════════════════════════════════ */

const QualityGate = (() => {

  const DEFAULT_THRESHOLD = 7; // out of 10
  const MAX_RETRIES = 2;

  /**
   * Review agent output and return a quality assessment.
   * @param {string} task — the original task/mission title
   * @param {string} output — the agent's response
   * @param {Object} [opts]
   *   - threshold: number (1-10, default 7)
   *   - criteria: string[] (custom criteria to evaluate)
   * @returns {{ score: number, pass: boolean, feedback: string, criteria: Object }}
   */
  async function review(task, output, opts) {
    opts = opts || {};
    var threshold = opts.threshold || DEFAULT_THRESHOLD;

    if (!output || output.length < 20) {
      return { score: 1, pass: false, feedback: 'Output is too short or empty.', criteria: {} };
    }

    var criteria = opts.criteria || ['relevance', 'quality', 'completeness', 'tone'];

    var systemPrompt = 'You are a quality reviewer for AI-generated content.\n' +
      'Score the output on a scale of 1-10 for each criterion.\n' +
      'Be strict but fair. A score of 7+ means production-ready.\n\n' +
      'Criteria: ' + criteria.join(', ') + '\n\n' +
      'Respond ONLY with JSON:\n' +
      '{"scores":{"relevance":N,"quality":N,...},"overall":N,"feedback":"one sentence of constructive feedback","pass":true/false}\n' +
      'Where pass = overall >= ' + threshold;

    var userPrompt = 'TASK: ' + task + '\n\nOUTPUT TO REVIEW:\n' + output.substring(0, 2000);

    try {
      if (typeof SB === 'undefined' || !SB.functions) {
        return _offlineReview(output, threshold);
      }

      var response = await SB.functions.invoke('nice-ai', {
        body: {
          model: 'gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.2,
          max_tokens: 256,
        },
      });

      if (response.error) {
        console.warn('[QualityGate] LLM review failed:', response.error);
        return _offlineReview(output, threshold);
      }

      var content = response.data?.content;
      if (typeof content !== 'string') {
        content = Array.isArray(content) ? content.map(function(c) { return c.text || ''; }).join('') : String(content);
      }

      return _parseReview(content, threshold);
    } catch (err) {
      console.warn('[QualityGate] Review error:', err.message);
      return _offlineReview(output, threshold);
    }
  }

  /**
   * Run a mission with quality gate — retry if below threshold.
   * @param {Function} executeFn — async function that produces output
   * @param {string} task — the task description
   * @param {Object} [opts] — { threshold, maxRetries, onRetry }
   * @returns {{ output: string, review: Object, attempts: number }}
   */
  async function gatedRun(executeFn, task, opts) {
    opts = opts || {};
    var maxRetries = opts.maxRetries || MAX_RETRIES;
    var attempts = 0;
    var lastOutput = '';
    var lastReview = null;

    for (var i = 0; i <= maxRetries; i++) {
      attempts++;

      // Build retry context if not first attempt
      var retryPrompt = i === 0 ? null :
        'PREVIOUS ATTEMPT FEEDBACK: ' + (lastReview ? lastReview.feedback : 'Below quality threshold') +
        '\nPlease improve your response based on this feedback.';

      try {
        lastOutput = await executeFn(retryPrompt);
      } catch (err) {
        lastOutput = 'Error: ' + (err.message || err);
      }

      lastReview = await review(task, lastOutput, opts);

      if (lastReview.pass) {
        break;
      }

      if (i < maxRetries && opts.onRetry) {
        opts.onRetry({ attempt: attempts, review: lastReview, output: lastOutput });
      }
    }

    return {
      output: lastOutput,
      review: lastReview,
      attempts: attempts,
    };
  }

  /* ── Parse review JSON from LLM ── */
  function _parseReview(text, threshold) {
    try {
      var jsonMatch = text.match(/\{[\s\S]*?"overall"[\s\S]*?\}/);
      if (jsonMatch) {
        var parsed = JSON.parse(jsonMatch[0]);
        return {
          score: parsed.overall || 5,
          pass: parsed.pass !== undefined ? parsed.pass : (parsed.overall || 0) >= threshold,
          feedback: parsed.feedback || '',
          criteria: parsed.scores || {},
        };
      }
    } catch (e) { /* fall through */ }

    // Fallback: try to extract score
    var scoreMatch = text.match(/overall["\s:]+(\d+)/i);
    var score = scoreMatch ? parseInt(scoreMatch[1]) : 5;
    return {
      score: score,
      pass: score >= threshold,
      feedback: text.substring(0, 200),
      criteria: {},
    };
  }

  /* ── Offline heuristic review (no LLM available) ── */
  function _offlineReview(output, threshold) {
    var score = 5;
    // Length check
    if (output.length > 500) score++;
    if (output.length > 1000) score++;
    // Structure check (has headings, lists, etc.)
    if (/\*\*|##|•|-\s/.test(output)) score++;
    // Has actionable content
    if (/\d/.test(output)) score++;
    // Not just an error or apology
    if (/apologize|error|unable|cannot/i.test(output)) score -= 2;

    score = Math.max(1, Math.min(10, score));

    return {
      score: score,
      pass: score >= threshold,
      feedback: score >= threshold ? 'Looks good (offline review).' : 'Output may need improvement (offline review).',
      criteria: { length: output.length > 500 ? 8 : 4, structure: /\*\*|##/.test(output) ? 8 : 4 },
    };
  }

  return { review, gatedRun };
})();
