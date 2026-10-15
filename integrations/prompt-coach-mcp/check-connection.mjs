#!/usr/bin/env node
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const address = process.argv[2] ?? 'http://127.0.0.1:8808/mcp'
const url = new URL(address)
if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
  throw new Error('공개 주소는 HTTPS를 사용해 주세요.')
}
const client = new Client({ name: 'prompt-coach-connection-check', version: '0.2.0' })
try {
  await client.connect(new StreamableHTTPClientTransport(url))
  const { tools } = await client.listTools()
  const expected = ['open_prompt_coach', 'submit_prompt_coach_input', 'show_prompt_coach', 'get_prompt_coaching_guide', 'review_prompt_brief', 'assemble_prompt']
  if (expected.some(name => !tools.some(tool => tool.name === name))) throw new Error('필요한 코칭 도구를 모두 확인하지 못했습니다.')
  const response = await client.callTool({ name: 'open_prompt_coach', arguments: {} })
  if (response.isError || response.structuredContent?.coach?.phase !== 'scene' || response.structuredContent?.coach?.medium !== null) throw new Error('코치 시작 상태 확인 실패')
  const uri = tools.find(tool => tool.name === 'open_prompt_coach')?._meta?.ui?.resourceUri
  if (typeof uri !== 'string') throw new Error('코치 화면 리소스 연결 확인 실패')
  const resource = await client.readResource({ uri })
  if (!resource.contents.some(item => item.uri === uri && item.mimeType?.startsWith('text/html') && typeof item.text === 'string' && item.text.includes('<!doctype html>'))) throw new Error('코치 화면 리소스 응답 확인 실패')
  console.log(`MCP 연결·필수 도구 6개 조회·빈 코칭 시작 상태·화면 리소스 응답 확인 성공: ${url}`)
  console.log('이 검사는 MCP 통신만 확인하며 ChatGPT·Claude 계정 등록, 실제 화면 렌더링이나 AI 질문·답변 성공을 검증하지 않습니다.')
} finally { await client.close() }
