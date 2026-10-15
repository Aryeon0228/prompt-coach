import { createServer } from 'node:http'
import { build } from 'esbuild'
import { COACH_UI_HTML } from '../generated/coach-ui.mjs'
import { handleRequest } from '../worker.mjs'

const hostBundle = await build({ entryPoints: [new URL('./preview-host.js', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' })
const port = Number(process.env.COACH_PREVIEW_PORT ?? 8809)
let sequence = 0
async function callTool(name, args) {
  const response = await handleRequest(new Request('https://local-test.invalid/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++sequence, method: 'tools/call', params: { name, arguments: args } }) }))
  const body = await response.json()
  return body.result ?? { isError: true, content: [{ type: 'text', text: body.error?.message ?? 'Test call failed' }] }
}
const hostHtml = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prompt Coach — local protocol test</title><style>body{margin:0;background:#080808;color:#eee;font:15px system-ui}header,main{max-width:800px;margin:24px auto;padding:0 18px}header{border-bottom:1px solid #444;padding-bottom:16px}button{padding:8px 15px}label{margin-left:12px}#status{color:#b7b1d6}</style><header><h1>코치 화면 연동 테스트</h1><p>아래 질문은 고정 예시입니다. 실제 AI를 호출하지 않는 로컬 개발 화면입니다.</p><button id="new">새 테스트 시작</button><label><input id="reject" type="checkbox">전송 거부 테스트</label><p id="status" role="status">표준 MCP Apps 연결을 확인합니다.</p></header><main id="cards"></main><script type="module" src="/host.js"></script></html>`
const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET') {
      const path = new URL(req.url, 'http://localhost').pathname
      const asset = path === '/' ? ['text/html', hostHtml] : path === '/widget.html' ? ['text/html', COACH_UI_HTML] : path === '/host.js' ? ['text/javascript', hostBundle.outputFiles[0].text] : null
      if (!asset) { res.writeHead(404); res.end(); return }
      res.writeHead(200, { 'Content-Type': `${asset[0]};charset=utf-8`, 'Cache-Control': 'no-store' }); res.end(asset[1]); return
    }
    if (req.method !== 'POST' || !['/tool', '/simulate'].includes(req.url)) { res.writeHead(405); res.end(); return }
    if (req.headers.origin && req.headers.origin !== `http://127.0.0.1:${port}`) { res.writeHead(403); res.end(); return }
    let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 98304) throw new Error('Request too large') }
    const data = JSON.parse(body)
    let result
    if (req.url === '/tool') {
      if (!['open_prompt_coach', 'submit_prompt_coach_input'].includes(data.name)) throw new Error('Unsupported preview tool')
      result = await callTool(data.name, data.arguments)
    } else {
      const coach = JSON.parse(Buffer.from(data.state.slice(4), 'base64url').toString('utf8'))
      const finished = new Set(coach.turns.filter(x => x.kind !== 'revise').map(x => x.question.topic))
      if (coach.awaiting === 'review' || finished.size >= 2) {
        result = await callTool('show_prompt_coach', { state: data.state, kind: 'review', summary: '로컬 연동 테스트의 고정 요약입니다.', prompt: `${coach.idea}\n\n${coach.turns.filter(x => x.kind === 'answer').map(x => x.text).join('\n')}`, unresolved: coach.turns.filter(x => x.kind === 'defer').map(x => x.question.text) })
      } else {
        const topic = finished.has('purpose') ? 'composition' : 'purpose'
        result = await callTool('show_prompt_coach', { state: data.state, kind: 'question', topic, question: topic === 'purpose' ? '이 장면을 어디에 사용할 예정인가요?' : '가장 먼저 눈에 들어왔으면 하는 대상은 무엇인가요?', why: '사용처와 시선의 중심을 정하면 장면에서 강조할 부분을 고를 수 있어요. (연동 테스트용 고정 예시)', examples: ['포트폴리오 첫 화면', '작품 분위기를 소개하는 장면'] })
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(result))
  } catch (error) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message })) }
})
server.listen(port, '127.0.0.1', () => console.log(`Local protocol test only: http://127.0.0.1:${port}`))
