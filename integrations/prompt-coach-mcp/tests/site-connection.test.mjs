import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { publishTemporaryConnection, retireTemporaryConnection } from '../site-connection.mjs'

const FIRST = 'https://first-coach.trycloudflare.com/mcp'
const SECOND = 'https://second-coach.trycloudflare.com/mcp'
const NOW = new Date('2026-10-15T08:00:00.000Z')

async function fixture(t, withPublic = true) {
  const directory = await mkdtemp(join(tmpdir(), 'prompt-coach-site-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  if (withPublic) await mkdir(join(directory, 'public'))
  return { directory, path: join(directory, 'public', 'coach-connection.json') }
}

test('publishes a complete connection file and leaves no temporary artifacts', async t => {
  const { directory, path } = await fixture(t)
  await writeFile(path, '{old incomplete data')
  assert.equal(await publishTemporaryConnection(directory, FIRST, NOW), path)
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), {
    endpoint: FIRST, availability: 'temporary', updatedAt: NOW.toISOString(),
  })
  assert.deepEqual(await readdir(join(directory, 'public')), ['coach-connection.json'])
})

test('requires an explicit existing website public directory', async t => {
  const { directory } = await fixture(t, false)
  await assert.rejects(publishTemporaryConnection(directory, FIRST, NOW), { code: 'ENOENT' })
  assert.deepEqual(await readdir(directory), [])
  await assert.rejects(publishTemporaryConnection('.', FIRST, NOW), TypeError)
  await assert.rejects(publishTemporaryConnection(undefined, FIRST, NOW), TypeError)
})

test('an old launcher cannot retire a newer endpoint or a hosted connection', async t => {
  const { directory, path } = await fixture(t)
  await publishTemporaryConnection(directory, SECOND, NOW)
  const original = await readFile(path, 'utf8')
  assert.equal(await retireTemporaryConnection(directory, FIRST, NOW), false)
  assert.equal(await readFile(path, 'utf8'), original)
  const hosted = { endpoint: FIRST, availability: 'hosted', updatedAt: NOW.toISOString() }
  await writeFile(path, JSON.stringify(hosted))
  assert.equal(await retireTemporaryConnection(directory, FIRST, NOW), false)
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), hosted)
})

test('retiring the current temporary endpoint clears only its connection and is repeatable', async t => {
  const { directory, path } = await fixture(t)
  await publishTemporaryConnection(directory, FIRST, NOW)
  assert.equal(await retireTemporaryConnection(directory, FIRST, NOW), true)
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), {
    endpoint: null, availability: 'unavailable', updatedAt: NOW.toISOString(),
  })
  assert.equal(await retireTemporaryConnection(directory, FIRST, NOW), false)
})
