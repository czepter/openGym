/* The MCP server with every tool registered, transport-free. index.js connects it to stdio,
   http.js builds one per request for the self-hosted container. `write` adds log_workout, which
   only the stdio server offers: it writes with the paired session in OPENGYM_TOKEN, and the
   container's OAuth tokens are good for reading only. */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { TOOLS } from './tools.js'
import { WRITE_TOOLS } from './write-tools.js'

export function buildServer({ write = false } = {}) {
  const server = new McpServer({
    name: 'opengym',
    version: '0.1.0'
  })
  for (const t of write ? [...TOOLS, ...WRITE_TOOLS] : TOOLS) {
    server.tool(
      t.name,
      t.description,
      t.schema,
      async (params) => {
        try {
          // log_workout talks to the server, so a handler may answer with a promise.
          const result = await t.handler(params || {})
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
        } catch (err) {
          const code = err.code || 'ERROR'
          return {
            isError: true,
            content: [{ type: 'text', text: `${code}: ${err.message}` }]
          }
        }
      }
    )
  }
  return server
}
