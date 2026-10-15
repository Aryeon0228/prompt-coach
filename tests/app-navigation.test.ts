import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

type Element = { type: string; props: Record<string, any> }
const compiled = ts.transpileModule(readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText

/** Exercise App's route handlers while leaving child screens unmounted. */
function harness() {
  let projectId: string | null = 'scene'
  const states: any[] = [], refs: any[] = [], dependencies: unknown[][] = []
  let stateCursor = 0, refCursor = 0, effectCursor = 0, dirty = false
  let pending: Array<() => void> = []
  const exports: { App?: () => Element } = {}
  const jsx = (type: string, props: Element['props']) => ({ type, props })
  vm.runInNewContext(compiled, {
    exports,
    localStorage: { getItem: () => null, setItem() {} },
    window: { location: { hash: '' }, scrollTo() {}, addEventListener() {}, removeEventListener() {} },
    requestAnimationFrame: (callback: () => void) => { callback(); return 1 },
    require(name: string) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
      if (name === 'react') return {
        useState(initial: any) {
          const index = stateCursor++
          if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
          return [states[index], (next: any) => {
            const value = typeof next === 'function' ? next(states[index]) : next
            if (!Object.is(states[index], value)) { states[index] = value; dirty = true }
          }]
        },
        useRef(initial: unknown) { const index = refCursor++; return refs[index] ?? (refs[index] = { current: initial }) },
        useEffect(callback: () => void, deps: unknown[]) {
          const index = effectCursor++
          if (!dependencies[index] || deps.some((value, i) => !Object.is(value, dependencies[index][i]))) pending.push(callback)
          dependencies[index] = deps
        },
      }
      if (name === './store') return { useStore: () => ({
        ready: true, error: null,
        project: projectId ? { id: projectId, name: '장면', templateId: 'free-scene' } : null,
        template: projectId ? { name: '자유 장면' } : null,
        openProject: (id: string | null) => { projectId = id },
      }) }
      if (name.endsWith('.css')) return {}
      const component = name.split('/').at(-1)!
      return { [component]: component, ToastProvider: 'ToastProvider' }
    },
  })
  return {
    openProject(id: string) { projectId = id },
    render(): Element {
      let tree: Element
      do {
        dirty = false; stateCursor = 0; refCursor = 0; effectCursor = 0; pending = []
        tree = exports.App!()
        for (const effect of pending) effect()
      } while (dirty)
      return tree!
    },
  }
}
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes)
  if (!value || typeof value !== 'object' || !('props' in value)) return []
  const node = value as Element
  return [node, ...nodes(node.props.children)]
}
const child = (tree: Element, type: string) => nodes(tree).find(node => node.type === type)!
const leave = (tree: Element) => nodes(tree).find(node => node.props.className === 'secondary project-list-button')!.props.onClick()

test('leaving and reopening a project clears import and coaching-entry intents', () => {
  const ui = harness()
  child(ui.render(), 'FreeBrief').props.onRefine('chatgpt')
  assert.equal(child(ui.render(), 'PromptCoaching').props.initialMethod, 'chatgpt')
  leave(ui.render())
  child(ui.render(), 'Start').props.onOpening()
  ui.openProject('scene')
  assert.equal(child(ui.render(), 'PromptCoaching').props.initialMethod, undefined)
  child(ui.render(), 'PromptCoaching').props.onImport()
  assert.equal(typeof child(ui.render(), 'FreePromptView').props.importRequestKey, 'number')
  leave(ui.render())
  child(ui.render(), 'Start').props.onOpening()
  ui.openProject('scene')
  assert.equal(child(ui.render(), 'FreePromptView').props.importRequestKey, undefined)
  child(ui.render(), 'FreePromptView').props.onRefine({ type: 'click' })
  assert.equal(child(ui.render(), 'PromptCoaching').props.initialMethod, undefined, 'a click event must never become a method')
})

test('exact condition focus survives normal rendering but does not replay on reopening', () => {
  const ui = harness()
  child(ui.render(), 'FreeBrief').props.onRefine('guide')
  child(ui.render(), 'PromptCoaching').props.onEdit('style')
  const focused = child(ui.render(), 'FreeBrief').props
  assert.equal(focused.focusField, 'style')
  assert.equal(typeof focused.focusKey, 'number')
  assert.equal(child(ui.render(), 'FreeBrief').props.focusKey, focused.focusKey)
  leave(ui.render())
  const start = child(ui.render(), 'Start')
  ui.openProject('scene')
  start.props.onCreated()
  assert.equal(child(ui.render(), 'FreeBrief').props.focusField, undefined)
})
