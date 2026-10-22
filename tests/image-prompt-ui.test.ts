import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { coachingContext } from '../src/lib/coaching-context.ts'
import { createFreeBrief } from '../src/lib/free-prompt.ts'
import { FREE_MODES } from '../src/lib/free-modes.ts'
import * as imagePrompt from '../src/lib/image-prompt.ts'
import type { Project, Template } from '../src/types.ts'

type Element = { type: unknown; props: Record<string, any> }
const template: Template = JSON.parse(readFileSync(new URL('../public/templates/free-scene.json', import.meta.url), 'utf8'))
const compiled = ts.transpileModule(readFileSync(new URL('../src/components/ImagePrompt.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText

function project(): Project {
  return {
    id: 'image-project', name: '참고 이미지 장면', templateId: 'free-scene', createdAt: 1, updatedAt: 1,
    freeform: createFreeBrief('작은 정원을 드래그해서 둘러보고 싶어요.', 'web'), decisions: {}, locks: ['둥근 형태'], iterations: [],
    references: [{ id: 'source', role: 'composition', name: 'garden.jpg', dataUrl: 'data:image/jpeg;base64,PRIVATE_IMAGE' }],
    imagePrompt: { ...imagePrompt.createImagePrompt('source'), description: '  높은 시점의 작은 정원.\n낮의 푸른 하늘.  ', preserve: '  나무의 배치  ', changes: '  시간을 밤으로 바꾸기  ' },
  }
}

function harness(initial = project()) {
  let saved = structuredClone(initial)
  let cursor = 0
  const states: unknown[] = []
  const toasts: string[] = []
  const navigations: string[] = []
  const copied: string[] = []
  const loaded: File[] = []
  let loading: (file: File) => Promise<string> = async () => 'data:image/jpeg;base64,RESTORED'
  let copying: (value: string) => Promise<boolean> = async () => true
  const exports: { ImagePrompt?: (props: unknown) => Element } = {}
  const jsx = (type: unknown, props: Element['props']) => ({ type, props })
  vm.runInNewContext(compiled, { exports, URL, requestAnimationFrame: (callback: () => void) => callback(), require(name: string) {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (name === 'react') return {
      useState(value: unknown) { const index = cursor++; if (!(index in states)) states[index] = typeof value === 'function' ? value() : value; return [states[index], (next: unknown) => { states[index] = typeof next === 'function' ? next(states[index]) : next }] },
      useRef(value: unknown) { return states[cursor++] ??= { current: value } },
    }
    if (name === '../store') return { useStore: () => ({ project: saved, template, updateProject: (patch: (p: Project) => Project) => { saved = patch(saved) } }) }
    if (name === '../lib/coaching-context') return { coachingContext }
    if (name === '../lib/image-prompt') return imagePrompt
    if (name === '../lib/image') return { loadImage(file: File) { loaded.push(file); return loading(file) } }
    if (name === '../lib/free-modes') return { FREE_MODES }
    if (name === './ui') return { copyText(value: string) { copied.push(value); return copying(value) }, useToast: () => (value: string) => toasts.push(value) }
    if (name === '../image-prompt.css') return {}
    throw new Error(`Unexpected dependency: ${name}`)
  } })
  return {
    project: () => structuredClone(saved),
    setProject(next: Project) { saved = structuredClone(next) },
    loadWith(next: typeof loading) { loading = next },
    copyWith(next: typeof copying) { copying = next },
    loaded, copied, toasts, navigations,
    render() { cursor = 0; return exports.ImagePrompt!({ onPreview() { navigations.push('preview') }, onRefine() { navigations.push('refine') }, onReferences() { navigations.push('references') } }) },
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
  return value && typeof value === 'object' && 'props' in value ? text((value as Element).props.children) : ''
}
function find(tree: Element, predicate: (node: Element) => boolean): Element {
  const match = nodes(tree).find(predicate)
  assert.ok(match, 'Expected control exists')
  return match
}
const button = (tree: Element, label: string) => find(tree, node => node.type === 'button' && text(node).includes(label))
const field = (tree: Element, id: string) => find(tree, node => node.type === 'textarea' && node.props.id === id)
const upload = (tree: Element) => find(tree, node => node.type === 'input' && node.props.type === 'file')
const finishAsync = () => new Promise(resolve => setImmediate(resolve))

test('editing adaptation fields preserves the original observation, source image and earlier work', () => {
  const original = project()
  const ui = harness(original)
  field(ui.render(), 'image-preserve').props.onChange({ target: { value: '  카메라 각도와 나무 수\n외곽 실루엣  ' } })
  field(ui.render(), 'image-changes').props.onChange({ target: { value: '  낮을 밤으로 바꾸고 창에 불 켜기  ' } })
  const next = ui.project()
  assert.equal(next.imagePrompt!.description, original.imagePrompt!.description)
  assert.equal(next.imagePrompt!.preserve, '  카메라 각도와 나무 수\n외곽 실루엣  ')
  assert.equal(next.imagePrompt!.changes, '  낮을 밤으로 바꾸고 창에 불 켜기  ')
  assert.deepEqual(next.references, original.references)
  assert.deepEqual(next.freeform, original.freeform)
  assert.deepEqual(next.locks, original.locks)
  button(ui.render(), '원본 설명 수정하기').props.onClick()
  assert.equal(field(ui.render(), 'image-description').props.value, original.imagePrompt!.description)
  button(ui.render(), '유지할 부분과 바꿀 부분 정하기').props.onClick()
  assert.equal(field(ui.render(), 'image-changes').props.value, next.imagePrompt!.changes)
})

test('empty observations and missing source images cannot advance to adaptation or copy an image request', () => {
  for (const missingImage of [false, true]) {
    const original = project()
    if (missingImage) original.references = []
    else original.imagePrompt!.description = ' \n '
    const ui = harness(original)
    const tree = ui.render()
    assert.equal(button(tree, '내 장면으로 바꾸기').props.disabled, true)
    assert.equal(button(tree, '유지할 부분과 바꿀 부분 정하기').props.disabled, true)
    assert.equal(nodes(tree).some(node => node.props.id === 'image-preserve'), false)
    button(tree, '내 장면으로 바꾸기').props.onClick()
    assert.ok(field(ui.render(), 'image-description'))
    assert.equal(button(tree, '이미지 읽기 요청 복사').props.disabled, missingImage)
    assert.deepEqual(ui.project(), original)
  }
})

test('restoring a missing source retains the baseline and adaptations and prevents duplicate uploads', async () => {
  const original = project()
  original.references = []
  const ui = harness(original)
  let complete!: (data: string) => void
  ui.loadWith(() => new Promise(resolve => { complete = resolve }))
  const file = { name: 'restored.png', type: 'image/png', size: 1024 } as File
  const event = { target: { files: [file], value: 'selected-file' } }
  upload(ui.render()).props.onChange(event)
  assert.equal(event.target.value, '', 'The same file can be picked again later')
  assert.equal(upload(ui.render()).props.disabled, true)
  upload(ui.render()).props.onChange({ target: { files: [file], value: '' } })
  assert.equal(ui.loaded.length, 1)
  complete('data:image/jpeg;base64,RESTORED')
  await finishAsync()
  assert.deepEqual(ui.project().imagePrompt, original.imagePrompt)
  assert.equal(ui.project().references[0].id, original.imagePrompt!.referenceId)
  assert.equal(ui.project().references[0].dataUrl, 'data:image/jpeg;base64,RESTORED')
  assert.equal(nodes(ui.render()).some(node => node.type === 'input' && node.props.type === 'file'), false)
  assert.ok(field(ui.render(), 'image-preserve'))
})

test('a restore finishing after changing project or source cannot write into the newer project', async () => {
  for (const change of ['project', 'reference', 'already-restored']) {
    const original = project()
    original.references = []
    const ui = harness(original)
    let complete!: (value: string) => void
    ui.loadWith(() => new Promise(resolve => { complete = resolve }))
    upload(ui.render()).props.onChange({ target: { files: [{ name: 'old.jpg', type: 'image/jpeg', size: 10 }], value: '' } })
    const next = project()
    if (change === 'project') next.id = 'another-project'
    if (change === 'reference') { next.imagePrompt!.referenceId = 'new-source'; next.references = [] }
    if (change === 'already-restored') next.references[0].dataUrl = 'data:image/jpeg;base64,NEWER_RESTORE'
    ui.setProject(next)
    ui.render()
    complete('data:image/jpeg;base64,OLD_RESTORE')
    await finishAsync()
    assert.deepEqual(ui.project(), next, change)
  }
})

test('failed or invalid image restores keep saved text and allow a later retry', async () => {
  const original = project()
  original.references = []
  const ui = harness(original)
  for (const file of [{ type: 'image/svg+xml', size: 1 }, { type: 'image/png', size: 21 * 1024 * 1024 }]) {
    upload(ui.render()).props.onChange({ target: { files: [file], value: '' } })
  }
  assert.equal(ui.loaded.length, 0)
  assert.ok(ui.toasts.every(message => message.includes('20MB 이하')))
  ui.loadWith(async () => { throw new Error('이미지 읽기 실패') })
  const file = { name: 'again.jpg', type: 'image/jpeg', size: 100 }
  upload(ui.render()).props.onChange({ target: { files: [file], value: '' } })
  await finishAsync()
  assert.equal(upload(ui.render()).props.disabled, false)
  assert.deepEqual(ui.project(), original)
  assert.ok(ui.toasts.includes('이미지 읽기 실패'))
  ui.loadWith(async () => 'data:image/jpeg;base64,SUCCESS')
  upload(ui.render()).props.onChange({ target: { files: [file], value: '' } })
  await finishAsync()
  assert.equal(ui.project().references.length, 1)
})

test('composition prevents a step change while text remains saved until the next committed character', () => {
  const ui = harness()
  button(ui.render(), '원본 설명 수정하기').props.onClick()
  const description = field(ui.render(), 'image-description')
  description.props.onCompositionStart()
  description.props.onChange({ target: { value: '푸른 정ㅇ' } })
  button(ui.render(), '유지할 부분과 바꿀 부분 정하기').props.onClick()
  assert.equal(field(ui.render(), 'image-description').props.value, '푸른 정ㅇ')
  field(ui.render(), 'image-description').props.onCompositionEnd()
  field(ui.render(), 'image-description').props.onChange({ target: { value: '푸른 정원' } })
  button(ui.render(), '유지할 부분과 바꿀 부분 정하기').props.onClick()
  assert.ok(field(ui.render(), 'image-preserve'))
  assert.equal(ui.project().imagePrompt!.description, '푸른 정원')
})

test('stale field handlers cannot replace the description of a newly opened project or source', () => {
  for (const change of ['project', 'reference']) {
    const ui = harness()
    const oldChange = field(ui.render(), 'image-changes').props.onChange
    const next = project()
    if (change === 'project') next.id = 'new-project'
    else next.imagePrompt!.referenceId = 'new-reference'
    ui.setProject(next)
    ui.render()
    oldChange({ target: { value: '이전 프로젝트에서 늦게 도착한 수정' } })
    assert.deepEqual(ui.project(), next)
  }
})

test('copying sends the image-reading instructions but never image bytes and does not alter the project', async () => {
  const original = project()
  const ui = harness(original)
  button(ui.render(), '원본 설명 수정하기').props.onClick()
  await button(ui.render(), '이미지 읽기 요청 복사').props.onClick()
  assert.equal(ui.copied[0], imagePrompt.buildImageAnalysisRequest('web', `${original.freeform!.idea}\n\n원하는 변경:\n${original.imagePrompt!.changes}`))
  assert.equal(ui.copied[0].includes(original.references[0].dataUrl), false)
  assert.deepEqual(ui.project(), original)
  assert.ok(ui.toasts[0].includes('같은 이미지도 첨부'))
  ui.copyWith(async () => false)
  await button(ui.render(), '이미지 읽기 요청 복사').props.onClick()
  assert.ok(ui.toasts.at(-1)!.includes('직접 복사'))
})

test('preview and AI refinement wait until active Korean composition finishes', () => {
  const ui = harness()
  field(ui.render(), 'image-changes').props.onCompositionStart()
  button(ui.render(), '이 조건으로 프롬프트 보기').props.onClick()
  button(ui.render(), '내 AI로 더 구체화하기').props.onClick()
  assert.deepEqual(ui.navigations, [])
  field(ui.render(), 'image-changes').props.onCompositionEnd()
  button(ui.render(), '이 조건으로 프롬프트 보기').props.onClick()
  button(ui.render(), '내 AI로 더 구체화하기').props.onClick()
  assert.deepEqual(ui.navigations, ['preview', 'refine'])
})
