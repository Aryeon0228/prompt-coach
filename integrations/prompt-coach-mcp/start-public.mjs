#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { access, mkdir, writeFile, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { createHttpServer } from './server.mjs'
import { buildOnboarding } from './onboarding.mjs'
import { publishTemporaryConnection, retireTemporaryConnection } from './site-connection.mjs'

const root = dirname(fileURLToPath(import.meta.url))
const toolsDir = join(root, '.tools')
const binary = process.env.CLOUDFLARED_PATH || join(toolsDir, 'cloudflared')
const runtimePath = join(root, '현재-연결주소.txt')
const onboardingPath = join(root, 'AI에 붙여넣기.txt')
// Optional: never infer a repository path or publish changes automatically.
const siteDir = process.env.PROMPT_COACH_SITE_DIR || null
await mkdir(toolsDir, { recursive: true })

try { await access(binary, constants.X_OK) } catch {
  if (process.env.CLOUDFLARED_PATH || process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error('Cloudflare 공식 cloudflared를 설치하고 CLOUDFLARED_PATH에 실행 파일 경로를 지정해 주세요. CONNECTION-GUIDE.ko.txt 참고.')
  }
  console.log('첫 실행: Cloudflare 공식 연결 도구를 이 폴더에 준비합니다…')
  const response = await fetch('https://github.com/cloudflare/cloudflared/releases/download/2026.10.0/cloudflared-darwin-arm64.tgz')
  if (!response.ok) throw new Error('Cloudflare 연결 도구 다운로드에 실패했습니다.')
  const archive = Buffer.from(await response.arrayBuffer())
  if (createHash('sha256').update(archive).digest('hex') !== 'a2f79ff7b9420aa537d74af239f376da170bbabeb529aec416002adac6a72e70') {
    throw new Error('다운로드 검증에 실패했습니다. 실행하지 않습니다.')
  }
  const archivePath = join(toolsDir, 'cloudflared-darwin-arm64.tgz')
  await writeFile(archivePath, archive)
  await new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/tar', ['-xzf', archivePath, '-C', toolsDir, 'cloudflared'], { stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve() : reject(new Error('연결 도구 압축 해제 실패')))
  })
}

// An empty explicit config avoids using unrelated account/tunnel configuration.
const configPath = join(toolsDir, 'quick-tunnel.yml')
await writeFile(configPath, '{}\n')
const server = createHttpServer()
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
const port = server.address().port
console.log('프롬프트 코치 연결 주소를 준비합니다…')
console.log('이 창과 컴퓨터가 켜져 있는 동안에만 연결됩니다. 종료: Ctrl+C\n')
const child = spawn(binary, ['tunnel', '--config', configPath, '--no-autoupdate', '--no-prechecks', '--url', `http://127.0.0.1:${port}`, '--http-host-header', `127.0.0.1:${port}`, '--metrics', '127.0.0.1:0'], { stdio: ['ignore', 'pipe', 'pipe'] })
let publicUrl
let stopped = false
let logTail = ''
let ready = false
const lifecycle = new AbortController()
let statusWrite = Promise.resolve()
async function stop(code = 0) {
  if (stopped) return
  stopped = true
  process.exitCode = code
  clearTimeout(startupTimeout)
  lifecycle.abort()
  child.kill('SIGTERM')
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  await statusWrite
  if (publicUrl) {
    try {
      const existing = await readFile(runtimePath, 'utf8')
      if (existing.includes(publicUrl)) await writeFile(runtimePath, `종료됨 — 이 주소는 더 이상 사용하지 마세요.\n이전 주소: ${publicUrl}/mcp\n\n다시 사용하려면 MCP 시작.command를 실행하고 새 주소를 등록하세요.\n`)
    } catch { /* No user content is stored in this status file. */ }
    if (siteDir) {
      try {
        if (await retireTemporaryConnection(siteDir, `${publicUrl}/mcp`)) {
          console.log('홈페이지 소스의 연결 상태를 사용 불가로 바꿨습니다. 공개 홈페이지 반영에는 별도 배포가 필요합니다.')
        }
      } catch (error) {
        console.error(`홈페이지 연결 상태를 저장하지 못했습니다: ${error.message}`)
      }
    }
  }
  setTimeout(() => process.exit(code), 200).unref()
}
const startupTimeout = setTimeout(() => { console.error('주소 준비가 지연됩니다. 인터넷 연결을 확인한 뒤 다시 실행해 주세요.'); void stop(1) }, 90_000)

async function announce(url) {
  publicUrl = url
  console.log(`발급 주소 확인 중: ${url}/mcp`)
  while (!stopped) {
    try {
      const response = await fetch(`${url}/health`, { signal: AbortSignal.any([lifecycle.signal, AbortSignal.timeout(4000)]) })
      const data = await response.json()
      if (response.ok && data.service === 'Studio Penumbra Prompt Coach MCP') {
        if (stopped) return
        ready = true
        clearTimeout(startupTimeout)
        const text = `Prompt Coach MCP — 임시 연결 주소\n\n${url}/mcp\n\n인증: 없음 (No authentication / No sign in)\n시작: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} (한국 시간)\n\n이 창·컴퓨터·인터넷 연결이 유지되는 동안 사용합니다.\n재실행하면 주소가 바뀝니다. 고정 배포 주소가 아닙니다.\n설정: CONNECTION-GUIDE.ko.txt\n`
        statusWrite = Promise.allSettled([
          writeFile(runtimePath, text),
          writeFile(onboardingPath, buildOnboarding(`${url}/mcp`)),
          ...(siteDir ? [publishTemporaryConnection(siteDir, `${url}/mcp`).then(() => {
            console.log('홈페이지 소스의 연결 주소를 갱신했습니다. 공개 홈페이지 반영에는 별도 배포가 필요합니다.')
          }).catch(error => {
            console.error(`홈페이지 연결 주소를 저장하지 못했습니다: ${error.message}`)
          })] : []),
        ]).then(results => { if (results.some(item => item.status === 'rejected')) console.error('안내 파일 일부를 저장하지 못했어요. 아래 화면의 주소를 복사해 주세요.') })
        await statusWrite
        if (stopped) return
        console.log(text)
        console.log('Claude Code·Codex 자동 연결: 같은 폴더의 “AI에 붙여넣기.txt” 내용을 복사해 대화에 보내세요.\n')
        console.log('시작 문장: Prompt Coach 도구로 내 이미지 프롬프트를 코칭해 줘. 장면은 [내 아이디어]. 한 번에 하나씩 질문하고 왜 필요한지도 알려 줘.')
        return
      }
    } catch { /* DNS and tunnel registration can take a moment. */ }
    await new Promise(resolve => setTimeout(resolve, 1500))
  }
}
function onLog(chunk) {
  logTail = (logTail + chunk.toString('utf8')).slice(-12000)
  const match = logTail.match(/https:\/\/([a-z0-9]+(?:-[a-z0-9]+)+)\.trycloudflare\.com\b/)
  if (match && !publicUrl) void announce(match[0])
}
child.stdout.on('data', onLog)
child.stderr.on('data', onLog)
child.on('error', error => { console.error(`연결 도구를 실행하지 못했습니다: ${error.message}`); void stop(1) })
child.on('exit', code => {
  if (!stopped) {
    console.error(ready ? '연결이 종료되었습니다. 다시 실행하면 새 주소를 받을 수 있어요.' : '연결 도구가 종료되었습니다. 인터넷 연결과 Cloudflare 상태를 확인해 주세요.')
    void stop(code || 1)
  }
})
process.on('SIGINT', () => { clearTimeout(startupTimeout); void stop() })
process.on('SIGTERM', () => { clearTimeout(startupTimeout); void stop() })
