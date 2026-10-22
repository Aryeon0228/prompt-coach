import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

type Element = { type: unknown; props: Record<string, any> }
function render() {
  const code = ts.transpileModule(readFileSync(new URL('../src/components/ImageChatGuide.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports: { ImageChatGuide?: () => Element } = {}
  const jsx = (type: unknown, props: Element['props']) => ({ type, props })
  vm.runInNewContext(code, { exports, require(name: string) {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (name === '../image-chat-guide.css') return {}
    throw new Error(`Unexpected dependency: ${name}`)
  } })
  return exports.ImageChatGuide!()
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

test('image coaching starts with direct attachment and stays in the connected AI conversation', () => {
  const tree = render()
  const direct = nodes(tree).find(node => node.type === 'ol' && node.props['aria-label'] === '채팅에 직접 요청하는 순서')!
  const steps = nodes(direct).filter(node => node.type === 'li')
  assert.equal(steps.length, 2)
  assert.match(text(steps[0]), /Prompt Coach를 켠 ChatGPT·Claude 대화에 참고 이미지 파일을 첨부/)
  assert.match(text(steps[1]), /이 이미지로 프롬프트 코칭 시작해줘/)
  assert.match(text(tree), /질문·답변부터 완성까지 그 대화에서/)
  assert.match(text(tree), /웹으로 돌아와 질문·답변을 복사할 필요 없어요/)
  assert.match(text(tree), /자동 전송·동기화되지는 않습니다/)
  assert.equal(nodes(tree).filter(node => node.type === 'button').length, 0, 'No copy or site-upload action is required to start connected coaching')
})

test('the exact image menu is a subordinate alternative to the natural-language request', () => {
  const tree = render()
  const menu = nodes(tree).find(node => node.type === 'details')!
  assert.notEqual(menu.props.open, true)
  assert.match(text(menu), /이미지로 시작하기 — 원본 읽기·유지·변경/)
  const urls = nodes(tree).filter(node => node.type === 'a').map(node => node.props.href)
  assert.deepEqual(urls, ['https://chatgpt.com/', 'https://claude.ai/new'])
})
