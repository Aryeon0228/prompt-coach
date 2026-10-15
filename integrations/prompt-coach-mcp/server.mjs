#!/usr/bin/env node
import { createServer as createNodeServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createCoachServer, VERSION, MAX_BODY_BYTES } from './mcp-core.mjs'
export { createCoachServer, VERSION, MAX_BODY_BYTES } from './mcp-core.mjs'

function sendJson(res, status, data, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extraHeaders })
  res.end(JSON.stringify(data))
}
function rpcError(res, status, message, code = -32600) {
  sendJson(res, status, { jsonrpc: '2.0', error: { code, message }, id: null })
}

/** Stateless: every request gets a fresh MCP server; no user text is saved or logged. */
export function createHttpServer({ allowedHosts = ['127.0.0.1', 'localhost', '[::1]'] } = {}) {
  const httpServer = createNodeServer(async (req, res) => {
    let hostname
    try { hostname = new URL(`http://${req.headers.host ?? ''}`).hostname } catch { return rpcError(res, 400, 'Invalid Host') }
    if (!allowedHosts.includes(hostname)) return rpcError(res, 403, 'Host not allowed')
    // MCP clients contact this server directly. No cross-origin browser access is exposed.
    if (req.headers.origin) return rpcError(res, 403, 'Browser origins are not enabled')
    const pathname = new URL(req.url, 'http://localhost').pathname
    if (pathname === '/health' && req.method === 'GET') return sendJson(res, 200, { service: 'Studio Penumbra Prompt Coach MCP', version: VERSION, status: 'ok', modelApiCalls: false, storesConversations: false })
    if (pathname !== '/mcp') return rpcError(res, 404, 'Use /mcp for MCP requests')
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use Streamable HTTP POST. This stateless server has no SSE subscription.' }, { Allow: 'POST' })
    if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') return rpcError(res, 415, 'Content-Type must be application/json')
    if (Number(req.headers['content-length'] ?? 0) > MAX_BODY_BYTES) return rpcError(res, 413, 'Request body too large')
    const chunks = []
    let size = 0
    try {
      for await (const chunk of req) {
        size += chunk.length
        if (size > MAX_BODY_BYTES) { rpcError(res, 413, 'Request body too large'); return }
        chunks.push(chunk)
      }
    } catch { if (!res.headersSent) rpcError(res, 400, 'Could not read request'); return }
    let message
    try { message = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return rpcError(res, 400, 'Invalid JSON', -32700) }
    const server = createCoachServer()
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.on('close', () => { void transport.close(); void server.close() })
    try {
      await server.connect(transport)
      await transport.handleRequest(req, res, message)
    } catch {
      if (!res.headersSent) rpcError(res, 500, 'MCP request failed', -32603)
      else res.end()
    }
  })
  httpServer.requestTimeout = 15_000
  httpServer.headersTimeout = 10_000
  return httpServer
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2] ?? '--stdio'
  if (mode === '--stdio') {
    const server = createCoachServer()
    await server.connect(new StdioServerTransport())
  } else if (mode === '--http') {
    const port = Number(process.env.PORT ?? 8808)
    const host = process.env.BIND_HOST ?? '127.0.0.1'
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535')
    const allowedHosts = ['127.0.0.1', 'localhost', '[::1]', ...(process.env.MCP_ALLOWED_HOSTS ?? '').split(',').map(value => value.trim()).filter(Boolean)]
    const server = createHttpServer({ allowedHosts })
    server.listen(port, host, () => process.stderr.write(`Prompt Coach MCP ready: http://${host}:${port}/mcp\n`))
    const close = () => { server.closeAllConnections(); server.close(() => process.exit(0)) }
    process.on('SIGINT', close)
    process.on('SIGTERM', close)
  } else {
    process.stderr.write('Usage: node server.mjs [--stdio | --http]\n')
    process.exitCode = 1
  }
}
