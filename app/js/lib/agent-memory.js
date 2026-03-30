/* ═══════════════════════════════════════════════════════════════════
   NICE — Agent Memory
   Persistent per-agent memory: learned facts, preferences, success/
   failure patterns, and business context. Stored in localStorage and
   injected into agent system prompts via buildPromptContext().
═══════════════════════════════════════════════════════════════════ */

const AgentMemory = (() => {
  const STORAGE_KEY = Utils.KEYS.agentMemories;
  const MAX_FACTS = 50;
  const MAX_SUCCESS = 20;
  const MAX_FAILURE = 20;

  /* ── Internal helpers ── */

  function _load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function _save(all) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch (e) {
      console.warn('[AgentMemory] localStorage write failed:', e.message);
    }
  }

  function _ensure(agentId) {
    const all = _load();
    if (!all[agentId]) {
      all[agentId] = {
        facts: [],
        preferences: {},
        successPatterns: [],
        failurePatterns: [],
        context: {},
      };
      _save(all);
    }
    return all;
  }

  /** FIFO trim — keeps the last `max` entries */
  function _trim(arr, max) {
    if (arr.length > max) arr.splice(0, arr.length - max);
  }

  /* ── Public API ── */

  /** Returns the full memory object for an agent (or a fresh default). */
  function getMemory(agentId) {
    if (!agentId) return null;
    const all = _ensure(agentId);
    return JSON.parse(JSON.stringify(all[agentId]));
  }

  /** Adds a learned fact (deduplicates by exact string match). */
  function addFact(agentId, fact) {
    if (!agentId || !fact) return;
    const all = _ensure(agentId);
    const mem = all[agentId];
    if (mem.facts.indexOf(fact) !== -1) return; // deduplicate
    mem.facts.push(fact);
    _trim(mem.facts, MAX_FACTS);
    _save(all);
    _notify(agentId);
  }

  /** Records a successful approach: { task, approach, result }. */
  function addSuccess(agentId, entry) {
    if (!agentId || !entry) return;
    const all = _ensure(agentId);
    const mem = all[agentId];
    mem.successPatterns.push({
      task:      entry.task || '',
      approach:  entry.approach || '',
      result:    entry.result || '',
      timestamp: new Date().toISOString(),
    });
    _trim(mem.successPatterns, MAX_SUCCESS);
    _save(all);
    _notify(agentId);
  }

  /** Records a failed approach: { task, approach, reason }. */
  function addFailure(agentId, entry) {
    if (!agentId || !entry) return;
    const all = _ensure(agentId);
    const mem = all[agentId];
    mem.failurePatterns.push({
      task:      entry.task || '',
      approach:  entry.approach || '',
      reason:    entry.reason || '',
      timestamp: new Date().toISOString(),
    });
    _trim(mem.failurePatterns, MAX_FAILURE);
    _save(all);
    _notify(agentId);
  }

  /** Sets a persistent context key-value pair. */
  function setContext(agentId, key, value) {
    if (!agentId || !key) return;
    const all = _ensure(agentId);
    all[agentId].context[key] = value;
    _save(all);
    _notify(agentId);
  }

  /**
   * Builds a formatted prompt string summarising the agent's memories.
   * Targets roughly 500 tokens (~2000 chars) max.
   */
  function buildPromptContext(agentId) {
    if (!agentId) return '';
    const mem = getMemory(agentId);
    if (!mem) return '';

    const sections = [];
    const CHAR_BUDGET = 2000; // ~500 tokens
    let chars = 0;

    // 1. Context (highest priority — business facts)
    const ctxKeys = Object.keys(mem.context);
    if (ctxKeys.length) {
      const lines = ctxKeys.map(k => '- ' + k + ': ' + mem.context[k]);
      const block = '## Business Context\n' + lines.join('\n');
      if (chars + block.length < CHAR_BUDGET) {
        sections.push(block);
        chars += block.length;
      }
    }

    // 2. Preferences
    const prefKeys = Object.keys(mem.preferences);
    if (prefKeys.length) {
      const lines = prefKeys.map(k => '- ' + k + ': ' + mem.preferences[k]);
      const block = '## User Preferences\n' + lines.join('\n');
      if (chars + block.length < CHAR_BUDGET) {
        sections.push(block);
        chars += block.length;
      }
    }

    // 3. Facts (most recent first, cap at remaining budget)
    if (mem.facts.length) {
      const recent = mem.facts.slice(-10).reverse();
      const lines = [];
      for (var i = 0; i < recent.length; i++) {
        var line = '- ' + recent[i];
        if (chars + line.length + 20 > CHAR_BUDGET) break;
        lines.push(line);
        chars += line.length;
      }
      if (lines.length) {
        sections.push('## Learned Facts\n' + lines.join('\n'));
      }
    }

    // 4. Success patterns (most recent, abbreviated)
    if (mem.successPatterns.length) {
      const recent = mem.successPatterns.slice(-5).reverse();
      const lines = [];
      for (var j = 0; j < recent.length; j++) {
        var sLine = '- OK: "' + recent[j].task + '" via ' + recent[j].approach;
        if (chars + sLine.length + 30 > CHAR_BUDGET) break;
        lines.push(sLine);
        chars += sLine.length;
      }
      if (lines.length) {
        sections.push('## What Worked\n' + lines.join('\n'));
      }
    }

    // 5. Failure patterns (most recent, abbreviated)
    if (mem.failurePatterns.length) {
      const recent = mem.failurePatterns.slice(-5).reverse();
      const lines = [];
      for (var k = 0; k < recent.length; k++) {
        var fLine = '- AVOID: "' + recent[k].task + '" — ' + recent[k].reason;
        if (chars + fLine.length + 30 > CHAR_BUDGET) break;
        lines.push(fLine);
        chars += fLine.length;
      }
      if (lines.length) {
        sections.push('## What to Avoid\n' + lines.join('\n'));
      }
    }

    if (!sections.length) return '';
    return '# Agent Memory\n' + sections.join('\n\n');
  }

  /**
   * Auto-extract learnings from a completed mission.
   * Called when the user approves or rejects a mission result.
   *
   * @param {string} agentId
   * @param {Object} missionResult - { task, content, metadata }
   * @param {'approved'|'rejected'} approvalStatus
   */
  function learn(agentId, missionResult, approvalStatus) {
    if (!agentId || !missionResult) return;

    const task = missionResult.task || missionResult.metadata?.task || 'unknown task';
    const content = missionResult.content || '';

    // Derive a short approach summary from the content (first 120 chars)
    const approach = content.length > 120 ? content.substring(0, 120) + '...' : content;

    if (approvalStatus === 'approved') {
      addSuccess(agentId, {
        task:     task,
        approach: approach,
        result:   'Approved by user',
      });

      // Try to extract factual statements from the result
      // Look for key-value patterns like "Name: X" or "X is Y"
      const kvMatches = content.match(/(?:^|\n)\s*[-•]?\s*([A-Z][^:]{2,30}):\s*(.{3,80})/gm);
      if (kvMatches) {
        kvMatches.slice(0, 3).forEach(function(match) {
          var cleaned = match.replace(/^[\s\-•]+/, '').trim();
          if (cleaned.length > 10 && cleaned.length < 120) {
            addFact(agentId, cleaned);
          }
        });
      }
    } else if (approvalStatus === 'rejected') {
      addFailure(agentId, {
        task:     task,
        approach: approach,
        reason:   'Rejected by user',
      });
    }
  }

  /** Resets all memory for an agent. */
  function clear(agentId) {
    if (!agentId) return;
    const all = _load();
    delete all[agentId];
    _save(all);
    _notify(agentId);
  }

  /* ── State integration ── */

  function _notify(agentId) {
    if (typeof State !== 'undefined') {
      State.set('agent_memory_' + agentId, Date.now());
    }
  }

  return {
    getMemory,
    addFact,
    addSuccess,
    addFailure,
    setContext,
    buildPromptContext,
    learn,
    clear,
  };
})();
