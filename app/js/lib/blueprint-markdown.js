/* ═══════════════════════════════════════════════════════════════════
   NICE — Blueprint Markdown
   Parse, serialize, and validate blueprints as markdown with frontmatter.
   Enables human-readable blueprint editing, sharing, and import/export.
═══════════════════════════════════════════════════════════════════ */

const BlueprintMarkdown = (() => {

  /* ── Frontmatter field ordering for clean serialization ── */
  const AGENT_FIELDS = [
    'type','name','serial_key','category','rarity','tags',
    'role','agent_type','llm_engine','temperature','memory',
    'tools','stats','persona'
  ];
  const SHIP_FIELDS = [
    'type','name','serial_key','category','rarity','tags',
    'recommended_class','stats'
  ];
  const WORKFLOW_FIELDS = ['type','name','trigger'];

  /* ── Config keys that live in frontmatter root (not nested under config) ── */
  const CONFIG_KEYS = ['role','agent_type','llm_engine','temperature','memory','tools'];

  // ═══════════════════════════════════════════════════════════════
  //  PARSE
  // ═══════════════════════════════════════════════════════════════

  /**
   * Parse a markdown blueprint string into a blueprint object.
   * @param {string} md - Markdown string with --- frontmatter ---
   * @returns {Object} Blueprint object compatible with BlueprintStore
   */
  function parse(md) {
    if (!md || typeof md !== 'string') return null;

    const { frontmatter, body } = _splitDocument(md);
    const fm = _parseFrontmatter(frontmatter);
    const type = fm.type || 'agent';

    const bp = {
      type: type,
      name: fm.name || '',
      serial_key: fm.serial_key || '',
      category: fm.category || '',
      rarity: fm.rarity || '',
      tags: fm.tags || [],
      config: {},
      stats: fm.stats || {},
      metadata: {},
      flavor: ''
    };

    // ── Assemble config from flat frontmatter keys ──
    CONFIG_KEYS.forEach(function(k) {
      if (fm[k] !== undefined) bp.config[k] = fm[k];
    });
    if (fm.persona) bp.config.persona = fm.persona;

    // ── Spaceship-specific ──
    if (type === 'spaceship') {
      if (fm.recommended_class) bp.metadata.recommended_class = fm.recommended_class;
    }

    // ── Parse body sections ──
    const sections = _parseBody(body);

    bp.description = sections.description || '';
    bp.flavor = sections.flavor || '';
    if (sections.capabilities && sections.capabilities.length) {
      bp.metadata.caps = sections.capabilities;
    }

    // ── Spaceship crew manifest ──
    if (type === 'spaceship' && sections.crew && sections.crew.length) {
      var assignments = {};
      sections.crew.forEach(function(row) {
        assignments[String(row.slot)] = row.agent;
      });
      bp.config.slot_assignments = assignments;
      bp.metadata.crew = sections.crew;
    }

    // ── Workflow steps ──
    if (type === 'workflow' && sections.steps && sections.steps.length) {
      bp.trigger = fm.trigger || 'manual';
      var nodes = [];
      var connections = [];
      sections.steps.forEach(function(step, i) {
        nodes.push({
          id: 'step-' + i,
          label: step.label,
          type: step.type || 'agent',
          config: {
            agent: step.agent || null,
            prompt: step.prompt || '',
            format: step.format || null
          }
        });
        if (i > 0) {
          connections.push({ from: 'step-' + (i - 1), to: 'step-' + i });
        }
      });
      bp.nodes = nodes;
      bp.connections = connections;
    }

    return bp;
  }

  /**
   * Split markdown into frontmatter and body.
   */
  function _splitDocument(md) {
    var trimmed = md.trim();
    if (!trimmed.startsWith('---')) return { frontmatter: '', body: trimmed };

    var end = trimmed.indexOf('---', 3);
    if (end === -1) return { frontmatter: '', body: trimmed };

    return {
      frontmatter: trimmed.substring(3, end).trim(),
      body: trimmed.substring(end + 3).trim()
    };
  }

  /**
   * Parse YAML-subset frontmatter into a flat/shallow-nested object.
   * Handles: key: value, key: [a, b], key: true/false, nested via 2-space indent.
   */
  function _parseFrontmatter(text) {
    if (!text) return {};
    var result = {};
    var lines = text.split('\n');
    var currentParent = null;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line.trim() || line.trim().startsWith('#')) continue;

      var indent = line.length - line.trimStart().length;
      var trimLine = line.trim();

      // Nested child (2+ spaces indent)
      if (indent >= 2 && currentParent) {
        var childMatch = trimLine.match(/^([^:]+):\s*(.*)/);
        if (childMatch) {
          var childKey = childMatch[1].trim();
          var childVal = childMatch[2].trim();
          if (typeof result[currentParent] !== 'object' || Array.isArray(result[currentParent])) {
            result[currentParent] = {};
          }
          result[currentParent][childKey] = _parseValue(childVal);
        }
        continue;
      }

      // Top-level key: value
      var match = trimLine.match(/^([^:]+):\s*(.*)/);
      if (!match) continue;

      var key = match[1].trim();
      var rawVal = match[2].trim();

      if (rawVal === '' || rawVal === undefined) {
        // Empty value = start of nested object
        currentParent = key;
        result[key] = {};
      } else {
        currentParent = null;
        result[key] = _parseValue(rawVal);
      }
    }

    return result;
  }

  /**
   * Parse a single YAML value: arrays, booleans, numbers, quoted strings.
   */
  function _parseValue(raw) {
    if (!raw && raw !== 0 && raw !== false) return '';

    var s = String(raw).trim();

    // Inline array: [a, b, c]
    if (s.startsWith('[') && s.endsWith(']')) {
      var inner = s.slice(1, -1);
      if (!inner.trim()) return [];
      return inner.split(',').map(function(item) {
        return _unquote(item.trim());
      });
    }

    // Boolean
    if (s === 'true') return true;
    if (s === 'false') return false;

    // Number (only pure numeric, not "94%" or "4.2s")
    if (/^-?\d+(\.\d+)?$/.test(s)) {
      var num = parseFloat(s);
      if (!isNaN(num)) return num;
    }

    return _unquote(s);
  }

  /** Strip matching quotes */
  function _unquote(s) {
    if (s.length >= 2) {
      if ((s[0] === '"' && s[s.length - 1] === '"') ||
          (s[0] === "'" && s[s.length - 1] === "'")) {
        return s.slice(1, -1);
      }
    }
    return s;
  }

  /**
   * Parse body markdown into sections: description, capabilities, flavor, crew, steps.
   */
  function _parseBody(body) {
    if (!body) return {};
    var result = { description: '', capabilities: [], flavor: '', crew: [], steps: [] };

    var lines = body.split('\n');
    var currentSection = 'description';
    var buffer = [];

    function flushBuffer() {
      var text = buffer.join('\n').trim();
      if (currentSection === 'description') {
        result.description = text;
      } else if (currentSection === 'capabilities') {
        result.capabilities = _parseBullets(text);
      } else if (currentSection === 'flavor') {
        result.flavor = text;
      } else if (currentSection === 'crew') {
        result.crew = _parseCrewTable(text);
      } else if (currentSection === 'steps') {
        result.steps = _parseSteps(text);
      }
      buffer = [];
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var heading = line.match(/^##\s+(.+)/);
      if (heading) {
        flushBuffer();
        var h = heading[1].trim().toLowerCase();
        if (h === 'capabilities') currentSection = 'capabilities';
        else if (h === 'flavor') currentSection = 'flavor';
        else if (h.startsWith('crew')) currentSection = 'crew';
        else if (h === 'steps') currentSection = 'steps';
        else currentSection = '_unknown';
        continue;
      }
      buffer.push(line);
    }
    flushBuffer();

    return result;
  }

  /** Extract bullet items from markdown list */
  function _parseBullets(text) {
    if (!text) return [];
    return text.split('\n')
      .filter(function(l) { return /^\s*[-*]\s+/.test(l); })
      .map(function(l) { return l.replace(/^\s*[-*]\s+/, '').trim(); });
  }

  /** Parse crew manifest markdown table */
  function _parseCrewTable(text) {
    if (!text) return [];
    var rows = text.split('\n').filter(function(l) {
      return l.includes('|') && !l.match(/^\s*\|?\s*[-:]+/);
    });
    // Skip header row
    var dataRows = rows.slice(1);
    return dataRows.map(function(row) {
      var cells = row.split('|').map(function(c) { return c.trim(); }).filter(Boolean);
      return {
        slot: parseInt(cells[0], 10) || 0,
        role: cells[1] || '',
        agent: cells[2] || ''
      };
    });
  }

  /** Parse numbered workflow steps */
  function _parseSteps(text) {
    if (!text) return [];
    var steps = [];
    // Split on numbered list items: 1. **Label** (meta)\n   body
    var parts = text.split(/(?=^\d+\.\s)/m).filter(Boolean);
    parts.forEach(function(part) {
      var firstLine = part.split('\n')[0];
      var bodyLines = part.split('\n').slice(1);

      // Parse: 1. **Label** (type: value, agent: id)
      var labelMatch = firstLine.match(/\d+\.\s+\*\*([^*]+)\*\*\s*(?:\(([^)]*)\))?/);
      if (!labelMatch) return;

      var label = labelMatch[1].trim();
      var meta = labelMatch[2] || '';

      var step = { label: label, type: 'agent', agent: null, prompt: '', format: null };

      // Parse parenthetical metadata
      meta.split(',').forEach(function(pair) {
        var kv = pair.split(':').map(function(s) { return s.trim(); });
        if (kv.length === 2) {
          if (kv[0] === 'agent') step.agent = kv[1];
          else if (kv[0] === 'format') step.format = kv[1];
          else step.type = kv[0];
        } else if (kv.length === 1 && kv[0]) {
          // Bare keyword = type (e.g., "output")
          step.type = kv[0];
        }
      });

      step.prompt = bodyLines.map(function(l) { return l.trim(); }).join('\n').trim();
      steps.push(step);
    });
    return steps;
  }


  // ═══════════════════════════════════════════════════════════════
  //  SERIALIZE
  // ═══════════════════════════════════════════════════════════════

  /**
   * Serialize a blueprint object to markdown string.
   * @param {Object} bp - Blueprint object (agent, spaceship, or workflow)
   * @returns {string} Markdown with frontmatter
   */
  function serialize(bp) {
    if (!bp) return '';
    var type = bp.type || 'agent';
    if (type === 'workflow') return _serializeWorkflow(bp);
    if (type === 'spaceship') return _serializeSpaceship(bp);
    return _serializeAgent(bp);
  }

  function _serializeAgent(bp) {
    var fm = {};
    fm.type = 'agent';
    fm.name = bp.name || '';
    if (bp.serial_key) fm.serial_key = bp.serial_key;
    if (bp.category) fm.category = bp.category;
    if (bp.rarity) fm.rarity = bp.rarity;
    if (bp.tags && bp.tags.length) fm.tags = bp.tags;

    // Flatten config into frontmatter
    var cfg = bp.config || {};
    CONFIG_KEYS.forEach(function(k) {
      if (cfg[k] !== undefined && cfg[k] !== null && cfg[k] !== '') fm[k] = cfg[k];
    });

    // Stats
    if (bp.stats && Object.keys(bp.stats).length) fm.stats = bp.stats;

    // Persona
    if (cfg.persona && Object.keys(cfg.persona).length) fm.persona = cfg.persona;

    // Agent type from metadata
    if (bp.metadata && bp.metadata.agentType) fm.agent_type = bp.metadata.agentType;

    var body = _buildBody(bp);
    return _buildDocument(fm, body, AGENT_FIELDS);
  }

  function _serializeSpaceship(bp) {
    var fm = {};
    fm.type = 'spaceship';
    fm.name = bp.name || '';
    if (bp.serial_key) fm.serial_key = bp.serial_key;
    if (bp.category) fm.category = bp.category;
    if (bp.rarity) fm.rarity = bp.rarity;
    if (bp.tags && bp.tags.length) fm.tags = bp.tags;
    if (bp.metadata && bp.metadata.recommended_class) fm.recommended_class = bp.metadata.recommended_class;
    if (bp.stats && Object.keys(bp.stats).length) fm.stats = bp.stats;

    var body = _buildBody(bp);

    // Crew manifest table
    var crew = (bp.metadata && bp.metadata.crew) || [];
    var assignments = (bp.config && bp.config.slot_assignments) || {};

    if (crew.length || Object.keys(assignments).length) {
      body += '\n\n## Crew Manifest\n\n';
      body += '| Slot | Role | Agent |\n';
      body += '|------|------|-------|\n';

      if (crew.length) {
        crew.forEach(function(c) {
          body += '| ' + c.slot + ' | ' + (c.role || '') + ' | ' + (c.agent || '') + ' |\n';
        });
      } else {
        Object.keys(assignments).sort().forEach(function(slot) {
          body += '| ' + slot + ' | Crew ' + slot + ' | ' + assignments[slot] + ' |\n';
        });
      }
    }

    return _buildDocument(fm, body, SHIP_FIELDS);
  }

  function _serializeWorkflow(wf) {
    var fm = {};
    fm.type = 'workflow';
    fm.name = wf.name || '';
    if (wf.trigger) fm.trigger = wf.trigger;

    var body = '';
    if (wf.description) body += wf.description;

    var nodes = wf.nodes || [];
    if (nodes.length) {
      body += '\n\n## Steps\n';
      nodes.forEach(function(node, i) {
        var meta = '';
        if (node.type && node.type !== 'agent') {
          meta = node.type;
          if (node.config && node.config.format) meta += ', format: ' + node.config.format;
        } else if (node.config && node.config.agent) {
          meta = 'agent: ' + node.config.agent;
        }
        body += '\n' + (i + 1) + '. **' + (node.label || 'Step ' + (i + 1)) + '**';
        if (meta) body += ' (' + meta + ')';
        body += '\n';
        if (node.config && node.config.prompt) {
          body += '   ' + node.config.prompt + '\n';
        }
      });
    }

    return _buildDocument(fm, body.trim(), WORKFLOW_FIELDS);
  }

  /** Build description + capabilities + flavor body */
  function _buildBody(bp) {
    var parts = [];
    if (bp.description) parts.push(bp.description);

    var caps = (bp.metadata && bp.metadata.caps) || bp.caps || [];
    if (caps.length) {
      parts.push('## Capabilities\n\n' + caps.map(function(c) { return '- ' + c; }).join('\n'));
    }

    if (bp.flavor) parts.push('## Flavor\n\n' + bp.flavor);

    return parts.join('\n\n');
  }

  /** Build full document from frontmatter object and body string */
  function _buildDocument(fm, body, fieldOrder) {
    var fmLines = [];

    // Ordered fields first
    (fieldOrder || []).forEach(function(key) {
      if (fm[key] === undefined || fm[key] === null || fm[key] === '') return;
      _serializeField(fmLines, key, fm[key]);
    });

    // Any remaining fields not in the order list
    Object.keys(fm).forEach(function(key) {
      if ((fieldOrder || []).indexOf(key) !== -1) return;
      if (fm[key] === undefined || fm[key] === null || fm[key] === '') return;
      _serializeField(fmLines, key, fm[key]);
    });

    var doc = '---\n' + fmLines.join('\n') + '\n---\n';
    if (body) doc += '\n' + body + '\n';
    return doc;
  }

  /** Serialize a single frontmatter field */
  function _serializeField(lines, key, value) {
    if (Array.isArray(value)) {
      lines.push(key + ': [' + value.join(', ') + ']');
    } else if (typeof value === 'object' && value !== null) {
      lines.push(key + ':');
      Object.keys(value).forEach(function(ck) {
        var v = value[ck];
        if (Array.isArray(v)) {
          lines.push('  ' + ck + ': [' + v.join(', ') + ']');
        } else {
          lines.push('  ' + ck + ': ' + _quoteIfNeeded(v));
        }
      });
    } else {
      lines.push(key + ': ' + _quoteIfNeeded(value));
    }
  }

  /** Quote strings that contain colons or could be misread */
  function _quoteIfNeeded(v) {
    if (typeof v === 'boolean' || typeof v === 'number') return String(v);
    var s = String(v);
    if (s.includes(':') || s.includes('#') || s.startsWith('[') || s.startsWith('{')) {
      return '"' + s.replace(/"/g, '\\"') + '"';
    }
    return s;
  }


  // ═══════════════════════════════════════════════════════════════
  //  VALIDATE
  // ═══════════════════════════════════════════════════════════════

  /**
   * Validate a markdown blueprint string.
   * @param {string} md - Markdown string
   * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
   */
  function validate(md) {
    var errors = [];
    var warnings = [];

    if (!md || typeof md !== 'string') {
      return { valid: false, errors: ['Empty or invalid input'], warnings: [] };
    }

    if (!md.trim().startsWith('---')) {
      errors.push('Missing frontmatter (must start with ---)');
      return { valid: false, errors: errors, warnings: warnings };
    }

    var bp;
    try {
      bp = parse(md);
    } catch (e) {
      errors.push('Parse error: ' + e.message);
      return { valid: false, errors: errors, warnings: warnings };
    }

    if (!bp) {
      errors.push('Failed to parse markdown');
      return { valid: false, errors: errors, warnings: warnings };
    }

    // Required fields
    if (!bp.name) errors.push('Missing required field: name');
    if (!bp.type) errors.push('Missing required field: type');
    if (bp.type && ['agent', 'spaceship', 'workflow'].indexOf(bp.type) === -1) {
      errors.push('Invalid type: "' + bp.type + '" (must be agent, spaceship, or workflow)');
    }

    // Type-specific warnings
    if (bp.type === 'agent') {
      if (!bp.config.role) warnings.push('No role specified');
      if (!bp.config.tools || !bp.config.tools.length) warnings.push('No tools specified');
      if (!bp.description) warnings.push('No description');
    } else if (bp.type === 'spaceship') {
      var hasCrew = bp.metadata.crew && bp.metadata.crew.length;
      var hasAssignments = bp.config.slot_assignments && Object.keys(bp.config.slot_assignments).length;
      if (!hasCrew && !hasAssignments) warnings.push('No crew manifest');
      if (!bp.description) warnings.push('No description');
    } else if (bp.type === 'workflow') {
      if (!bp.nodes || !bp.nodes.length) warnings.push('No steps defined');
    }

    return {
      valid: errors.length === 0,
      errors: errors,
      warnings: warnings
    };
  }

  return { parse, serialize, validate };
})();
