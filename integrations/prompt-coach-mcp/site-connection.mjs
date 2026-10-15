import { readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'

async function connectionPath(siteDir) {
  if (typeof siteDir !== 'string' || !isAbsolute(siteDir)) {
    throw new TypeError('PROMPT_COACH_SITE_DIR에는 홈페이지 소스 폴더의 절대 경로가 필요합니다.')
  }
  const publicDir = join(siteDir, 'public')
  if (!(await stat(publicDir)).isDirectory()) {
    throw new TypeError('홈페이지 소스 폴더의 public 폴더를 찾을 수 없습니다.')
  }
  return join(publicDir, 'coach-connection.json')
}

function validatedEndpoint(endpoint) {
  const url = new URL(endpoint)
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      url.search || url.hash || url.pathname !== '/mcp' || url.href !== endpoint) {
    throw new TypeError('공개 HTTPS MCP 주소를 /mcp까지 정확히 입력해 주세요.')
  }
  return endpoint
}

async function writeAtomically(path, value) {
  const temporaryPath = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o644 })
    await rename(temporaryPath, path)
  } finally {
    await rm(temporaryPath, { force: true })
  }
}

/** Changes only local website source. Publishing is a separate, explicit action. */
export async function publishTemporaryConnection(siteDir, endpoint, now = new Date()) {
  const path = await connectionPath(siteDir)
  await writeAtomically(path, {
    endpoint: validatedEndpoint(endpoint),
    availability: 'temporary',
    updatedAt: now.toISOString(),
  })
  return path
}

/** An older launcher must not erase another server's newer connection. */
export async function retireTemporaryConnection(siteDir, endpoint, now = new Date()) {
  const path = await connectionPath(siteDir)
  let current
  try {
    current = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
  if (current.endpoint !== endpoint || current.availability !== 'temporary') return false
  await writeAtomically(path, {
    endpoint: null,
    availability: 'unavailable',
    updatedAt: now.toISOString(),
  })
  return true
}
