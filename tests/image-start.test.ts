import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { createFreeBrief } from '../src/lib/free-prompt.ts'
import { FREE_MODES } from '../src/lib/free-modes.ts'
import { createImagePrompt, IMAGE_PROMPT_LIMITS } from '../src/lib/image-prompt.ts'
import type { Reference } from '../src/types.ts'

type Element = { type: unknown; props: Record<string, any> }
const compiled = ts.transpileModule(readFileSync(new URL('../src/components/ImageStart.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText

function harness() {
  const states: unknown[] = []
  const created: any[][] = []
  const navigations: string[] = []
  const toasts: string[] = []
  const loads: Array<{ file: File; resolve: (url: string) => void; reject: (error: Error) => void }> = []
  let cursor = 0
  let active = true
  let disabled = false
  let nextId = 0
  let cleanup: (() => void) | undefined
  let create: () => Promise<void> = async () => {}
  const exports: Record<string, (props: unknown) => Element> = {}
  const jsx = (type: unknown, props: Element['props']) => ({ type, props })
  vm.runInNewContext(compiled, {
    exports, URL,
    require(name: string) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
      if (name === 'react') return {
        useRef(value: unknown) { const index = cursor++; if (!(index in states)) states[index] = { current: value }; return states[index] },
        useState(value: unknown) { const index = cursor++; if (!(index in states)) states[index] = value; return [states[index], (next: unknown) => { states[index] = typeof next === 'function' ? next(states[index]) : next }] },
        useEffect(effect: () => (() => void)) { const index = cursor++; if (!(index in states)) { cleanup = effect(); states[index] = true } },
      }
      if (name === '../store') return { useStore: () => ({ createProject: async (...args: any[]) => { created.push(args); await create() } }) }
      if (name === '../lib/free-prompt') return { createFreeBrief }
      if (name === '../lib/free-modes') return { FREE_MODES }
      if (name === '../lib/image-prompt') return { createImagePrompt, IMAGE_PROMPT_LIMITS }
      if (name === '../lib/image') return { loadImage: (file: File) => new Promise<string>((resolve, reject) => loads.push({ file, resolve, reject })) }
      if (name === '../lib/db') return { uid: () => `reference-${++nextId}` }
      if (name === './ui') return { useToast: () => (message: string) => toasts.push(message) }
      if (name === '../image-start.css') return {}
      throw new Error(`Unexpected dependency: ${name}`)
    },
  })
  return {
    created, navigations, toasts, loads,
    hide: () => { active = false },
    show: () => { active = true },
    unmount: () => cleanup?.(),
    createWith: (fn: () => Promise<void>) => { create = fn },
    render() {
      cursor = 0
      return exports.ImageStart({ entry: { id: 'free-scene', name: '자유 장면', file: 'free-scene.json' }, active, disabled, onBusyChange: (value: boolean) => { disabled = value }, onCreated: (destination: string) => navigations.push(destination) })
    },
  }
}

function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes)
  if (!value || typeof value !== 'object' || !('props' in value)) return []
  const node = value as Element
  return [node, ...nodes(node.props.children)]
}
function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join('')
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (value && typeof value === 'object' && 'props' in value) return text((value as Element).props.children)
  return ''
}
function find(tree: Element, predicate: (node: Element) => boolean): Element {
  const node = nodes(tree).find(predicate)
  assert.ok(node, 'The requested control is present')
  return node
}
function pick(ui: ReturnType<typeof harness>, name = 'Pinterest-library.png', type = 'image/png', size = 2000) {
  const event = { target: { files: [{ name, type, size }], value: name } }
  find(ui.render(), node => node.type === 'input' && node.props.type === 'file').props.onChange(event)
  assert.equal(event.target.value, '', 'The same file can be chosen again')
}
async function settleImage(ui: ReturnType<typeof harness>, index = 0, value = 'data:image/jpeg;base64,dGVzdA==') {
  ui.loads[index].resolve(value)
  await new Promise<void>(resolve => setImmediate(resolve))
}
const submit = (ui: ReturnType<typeof harness>) => ui.render().props.onSubmit({ preventDefault() {} })
const web = (ui: ReturnType<typeof harness>) => find(ui.render(), node => node.type === 'button' && text(node).startsWith('3D Web')).props.onClick()

test('an image project starts atomically with its reference and an honest brief without invented observations', async () => {
  const ui = harness()
  web(ui)
  pick(ui)
  await settleImage(ui)
  find(ui.render(), node => node.type === 'input' && node.props.type === 'url').props.onChange({ target: { value: 'https://www.pinterest.com/pin/123/' } })
  await submit(ui)
  assert.equal(ui.created.length, 1)
  const [, name, brief, seed] = ui.created[0]
  assert.equal(name, 'Pinterest-library')
  assert.equal(brief.mode, 'web')
  assert.equal(brief.idea, '첨부한 참고 이미지에서 출발하는 장면')
  assert.equal(seed.references.length, 1)
  assert.equal(seed.imagePrompt.referenceId, seed.references[0].id)
  assert.equal(seed.imagePrompt.description, '')
  assert.equal(seed.imagePrompt.sourceUrl, 'https://www.pinterest.com/pin/123/')
  assert.deepEqual(ui.navigations, ['image'])
})

test('invalid files are rejected and a slow previous image cannot overwrite the newest choice', async () => {
  const ui = harness()
  pick(ui, 'page.html', 'text/html')
  pick(ui, 'too-large.png', 'image/png', 21 * 1024 * 1024)
  assert.equal(ui.loads.length, 0)
  assert.equal(ui.toasts.length, 2)
  pick(ui, 'old.png')
  pick(ui, 'new.png')
  await settleImage(ui, 1, 'data:image/jpeg;base64,bmV3')
  await settleImage(ui, 0, 'data:image/jpeg;base64,b2xk')
  const preview = find(ui.render(), node => node.type === 'img')
  assert.equal(preview.props.src, 'data:image/jpeg;base64,bmV3')
  assert.match(preview.props.alt, /new.png/)
})

test('entry switching preserves the image draft, while hidden or pending forms cannot create duplicate projects', async () => {
  const ui = harness()
  web(ui)
  pick(ui)
  await settleImage(ui)
  find(ui.render(), node => node.type === 'textarea').props.onChange({ target: { value: '보라색 밤의 도서관' } })
  ui.hide()
  await submit(ui)
  assert.equal(ui.created.length, 0)
  ui.show()
  assert.equal(find(ui.render(), node => node.type === 'textarea').props.value, '보라색 밤의 도서관')
  let finish!: () => void
  ui.createWith(() => new Promise<void>(resolve => { finish = resolve }))
  const handler = ui.render().props.onSubmit
  const pending = handler({ preventDefault() {} })
  await handler({ preventDefault() {} })
  assert.equal(ui.created.length, 1)
  assert.equal(ui.created[0][2].idea, '첨부한 참고 이미지에서 출발하는 장면', 'The change intent is not duplicated in the scene brief')
  assert.equal(ui.created[0][1], '보라색 밤의 도서관')
  assert.equal(ui.created[0][3].imagePrompt.changes, '보라색 밤의 도서관')
  finish()
  await pending
  assert.deepEqual(ui.navigations, ['image'])
})

test('failed image replacement and project creation keep the selected image and allow retry', async () => {
  const ui = harness()
  web(ui)
  pick(ui)
  await settleImage(ui)
  pick(ui, 'broken.png')
  ui.loads[1].reject(new Error('파일을 읽을 수 없음'))
  await new Promise<void>(resolve => setImmediate(resolve))
  assert.match(find(ui.render(), node => node.type === 'img').props.alt, /Pinterest-library/)
  ui.createWith(async () => { throw new Error('저장 공간 부족') })
  await submit(ui)
  assert.equal(ui.navigations.length, 0)
  assert.match(text(find(ui.render(), node => node.props.role === 'alert')), /저장 공간 부족/)
  assert.equal((ui.created[0][3].references[0] as Reference).name, 'Pinterest-library.png')
  ui.createWith(async () => {})
  await submit(ui)
  assert.deepEqual(ui.navigations, ['image'])
})

test('source links are attribution only and unsupported protocols do not create a project', async () => {
  const ui = harness()
  web(ui)
  pick(ui)
  await settleImage(ui)
  find(ui.render(), node => node.type === 'input' && node.props.type === 'url').props.onChange({ target: { value: 'javascript:alert(1)' } })
  await submit(ui)
  assert.equal(ui.created.length, 0)
  assert.match(text(ui.render()), /링크는 출처 기록용/)
  assert.match(text(ui.render()), /같은 이미지를 첨부/)
})
