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
  function loadTools() {
    // Clean up any previously registered MCP tools
    unloadTools();

    const connections = State.get('mcp_connections') || [];
    const connectedMcps = connections.filter(c => c.status === 'connected');

    for (const conn of connectedMcps) {
      const tools = conn.available_tools || [];
      const prefix = conn.catalog_id || conn.id;

      for (const toolName of tools) {
        const toolId = `mcp:${prefix}:${toolName}`;

        if (typeof ToolRegistry !== 'undefined') {
          ToolRegistry.register({
            id: toolId,
            name: `${conn.name} — ${toolName}`,
            description: `MCP tool "${toolName}" from ${conn.name}. Invoked via MCP gateway.`,
            schema: {
              type: 'object',
              properties: {
                input: { type: 'object', description: 'Tool-specific input parameters' },
              },
            },
            execute: _createExecutor(conn.id, toolName),
          });

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
    if (typeof ToolRegistry !== 'undefined') {
      // ToolRegistry doesn't have a deregister method,
      // but we track IDs so callers know which are MCP tools
      // Tools will be overwritten on next loadTools() call
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

    // Update connection in State with discovered tools
    const connections = State.get('mcp_connections') || [];
    const conn = connections.find(c => c.id === connectionId);
    if (conn && data?.tools) {
      conn.available_tools = data.tools.map(t => t.name);
      conn.status = 'connected';
      State.set('mcp_connections', connections);
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
        throw new Error(typeof error === 'string' ? error : error.message || 'MCP tool invocation failed');
      }

      if (data?.error) {
        throw new Error(data.error + (data.detail ? ': ' + JSON.stringify(data.detail) : ''));
      }

      return data?.result || data;
    };
  }

  return { loadTools, unloadTools, getToolIds, discoverTools };
})();
