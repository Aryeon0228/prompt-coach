import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createCoachServer, MAX_BODY_BYTES, VERSION } from './mcp-core.mjs'

const responseHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}

function json(status, data, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...responseHeaders, ...extraHeaders } })
}

function rpcError(status, message, code = -32600) {
  return json(status, { jsonrpc: '2.0', error: { code, message }, id: null })
}

/** Count incoming bytes before decoding so split UTF-8 characters remain intact. */
async function readMessage(request) {
  const reader = request.body?.getReader()
  if (!reader) return { error: rpcError(400, 'Invalid JSON', -32700) }
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {})
        return { error: rpcError(413, 'Request body too large') }
      }
      chunks.push(value)
    }
  } catch {
    return { error: rpcError(400, 'Could not read request') }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return { message: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
  } catch {
    return { error: rpcError(400, 'Invalid JSON', -32700) }
  }
}

/** Each HTTP request owns its server and transport. No account data or conversations persist. */
export async function handleRequest(request) {
  // Remote MCP calls arrive from the host AI's server, without a browser Origin.
  if (request.headers.has('Origin')) return rpcError(403, 'Browser origins are not enabled')
  const pathname = new URL(request.url).pathname
  if (pathname === '/' && request.method === 'GET') {
    return json(200, {
      service: 'Studio Penumbra Prompt Coach MCP',
      description: 'Prompt coaching tools for your own ChatGPT or Claude. Connect to /mcp using Streamable HTTP.',
      endpoint: '/mcp',
      authentication: 'none',
      modelApiCalls: false,
      storesConversations: false,
    })
  }
  if (pathname === '/health' && request.method === 'GET') {
    return json(200, { service: 'Studio Penumbra Prompt Coach MCP', version: VERSION, status: 'ok', modelApiCalls: false, storesConversations: false })
  }
  if (pathname !== '/mcp') return rpcError(404, 'Use /mcp for MCP requests')
  if (request.method !== 'POST') return json(405, { error: 'Use Streamable HTTP POST. This stateless server has no SSE subscription.' }, { Allow: 'POST' })
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return rpcError(415, 'Content-Type must be application/json')
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY_BYTES) return rpcError(413, 'Request body too large')
  const { message, error } = await readMessage(request)
  if (error) return error

  const server = createCoachServer()
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  try {
    await server.connect(transport)
    const response = await transport.handleRequest(request, { parsedBody: message })
    // Fully materialize the JSON response before closing the request-owned transport.
    const body = response.body === null ? null : await response.arrayBuffer()
    const headers = new Headers(response.headers)
    headers.set('Cache-Control', 'no-store')
    headers.set('X-Content-Type-Options', 'nosniff')
    return new Response(body, { status: response.status, statusText: response.statusText, headers })
  } catch {
    return rpcError(500, 'MCP request failed', -32603)
  } finally {
    await server.close().catch(() => {})
    await transport.close().catch(() => {})
  }
}

export default { fetch: handleRequest }
