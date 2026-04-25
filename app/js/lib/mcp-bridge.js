/* ═══════════════════════════════════════════════════════════════════
   NICE — MCP Bridge
   Bridges MCP server connections to the ToolRegistry so agents can
   use MCP tools transparently during execution.

   MCP tools are registered with 'mcp:' prefix:
     mcp:google:gmail, mcp:github:pull_requests, etc.
═══════════════════════════════════════════════════════════════════ */

const McpBridge = (() => {

  const _registeredToolIds = [];

  /**
   * Load all MCP tools for the current user's connections
   * and register them in ToolRegistry.
   * Call before agent execution to make MCP tools available.
   *
   * @returns {string[]} Array of registered MCP tool IDs
   */
  // Track which connections we've already kicked an async discovery for
  // in this session so we don't spam mcp-gateway with /tools/list each
  // time loadTools() runs (it runs at the top of every agent execution).
  const _discoveryFired = new Set();

  function loadTools() {
    // Clean up any previously registered MCP tools
    unloadTools();

    const connections = State.get('mcp_connections') || [];
    const connectedMcps = connections.filter(c => c.status === 'connected');

    for (const conn of connectedMcps) {
      const tools = conn.available_tools || [];
      const toolDefs = conn.tool_definitions || {}; // Rich schemas from discovery
      const prefix = conn.catalog_id || conn.id;

      // Auto-discover rich schemas when the connection row was written
      // by an OAuth callback (which only knows the tool *names*) but has
      // no `tool_definitions`. Without real schemas every tool registers
      // with the {input:{...}} fallback and the LLM fills it with garbage.
      // Fire-and-forget — the next loadTools() call (next agent run) will
      // pick up the cached schemas via State.
      const hasDefs = toolDefs && Object.keys(toolDefs).length > 0;
      if (tools.length > 0 && !hasDefs && !_discoveryFired.has(conn.id)) {
        _discoveryFired.add(conn.id);
        if (typeof discoverTools === 'function') {
          discoverTools(conn.id).catch(err => {
            console.warn('[McpBridge] auto-discovery failed for', conn.id, err.message);
            _discoveryFired.delete(conn.id); // allow a retry on the next run
          });
        }
      }

      for (const toolName of tools) {
        const toolId = `mcp:${prefix}:${toolName}`;
        const def = toolDefs[toolName] || {};

        if (typeof ToolRegistry !== 'undefined') {
          // Display name is always the bare toolName so the auto-alias
          // in ToolRegistry indexes it. Agents reference tools by the
          // bare name (e.g. config.tools=['gmail_create_draft']) and
          // LLMs invoke them by that same short form — normalizing
          // "Gmail — gmail_create_draft" produced a key that never
          // matched 'gmail_create_draft', so the ReAct loop couldn't
          // find the tool and the LLM fell back to role-playing.
          ToolRegistry.register({
            id: toolId,
            name: toolName,
            description: def.description || `MCP tool "${toolName}" from ${conn.name}. Invoked via MCP gateway.`,
            schema: def.inputSchema || {
              type: 'object',
              properties: {
                input: { type: 'object', description: 'Tool-specific input parameters' },
              },
            },
            execute: _createExecutor(conn.id, toolName),
          });

          // Belt-and-suspenders: register an explicit alias so the
          // short name always resolves, even if the auto-alias is
          // already claimed by another tool that registered first.
          if (typeof ToolRegistry.registerAlias === 'function') {
            ToolRegistry.registerAlias(toolName, toolId);
          }

          _registeredToolIds.push(toolId);
        }
      }
    }

    return [..._registeredToolIds];
  }

  /**
   * Remove all MCP tools from ToolRegistry.
   * Call after agent execution to clean up.
   */
  function unloadTools() {
    if (typeof ToolRegistry !== 'undefined' && typeof ToolRegistry.deregister === 'function') {
      for (const id of _registeredToolIds) {
        ToolRegistry.deregister(id);
      }
    }
    _registeredToolIds.length = 0;
  }

  /**
   * Get list of currently registered MCP tool IDs.
   * @returns {string[]}
   */
  function getToolIds() {
    return [..._registeredToolIds];
  }

  /**
   * Discover tools from an MCP server via the gateway edge function.
   * Updates the connection's available_tools in both State and DB.
   *
   * @param {string} connectionId - ID of the mcp_connections row
   * @returns {Promise<Array>} Discovered tools
   */
  async function discoverTools(connectionId) {
    if (typeof SB === 'undefined' || !SB.functions) {
      throw new Error('Supabase functions not available');
    }

    const { data, error } = await SB.functions.invoke('mcp-gateway', {
      body: {
        action: 'discover',
        connectionId,
      },
    });

    if (error) {
      throw new Error(typeof error === 'string' ? error : error.message || 'Discovery failed');
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    // Update connection in State with discovered tools + rich schemas
    const connections = State.get('mcp_connections') || [];
    if (data?.tools) {
      const toolDefs = {};
      data.tools.forEach(t => {
        toolDefs[t.name] = { description: t.description || '', inputSchema: t.inputSchema || {} };
      });
      const updated = connections.map(c => c.id === connectionId
        ? { ...c, available_tools: data.tools.map(t => t.name), tool_definitions: toolDefs, status: 'connected' }
        : c
      );
      State.set('mcp_connections', updated);
    }

    return data?.tools || [];
  }

  /**
   * Create an executor function for an MCP tool.
   * Returns a function that invokes the tool via the gateway.
   */
  function _createExecutor(connectionId, toolName) {
    return async (input) => {
      if (typeof SB === 'undefined' || !SB.functions) {
        throw new Error('Supabase functions not available');
      }

      const { data, error } = await SB.functions.invoke('mcp-gateway', {
        body: {
          action: 'invoke',
          connectionId,
          tool: toolName,
          input: input?.input || input || {},
        },
      });

      if (error) {
        let bodyDetail = '';
        const ctx = error.context;
        if (ctx && typeof ctx.json === 'function') {
          try {
            const body = await ctx.json();
            if (body?.error) bodyDetail = body.error;
            else if (body?.detail) bodyDetail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
          } catch {}
        }
        const base = typeof error === 'string' ? error : error.message || 'MCP tool invocation failed';
        throw new Error(bodyDetail ? `${base}: ${bodyDetail}` : base);
      }

      if (data?.error) {
        throw new Error(data.error + (data.detail ? ': ' + JSON.stringify(data.detail) : ''));
      }

      return data?.result || data;
    };
  }

  return { loadTools, unloadTools, getToolIds, discoverTools };
})();
