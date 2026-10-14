import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { assembleFix } from '../src/lib/assemble.ts'
import { createFreeBrief } from '../src/lib/free-prompt.ts'
import type { FreePromptMode } from '../src/lib/free-prompt.ts'
import type { Project, Template } from '../src/types.ts'

const template: Template = JSON.parse(readFileSync(new URL('../public/templates/free-scene.json', import.meta.url), 'utf8'))
const draft = { target: '주요 대상', targetEn: 'the main subject', categoryId: 'clarity', symptomId: 'clarity-focus', note: '대상의 위치는 그대로 두세요.' }

function project(mode: FreePromptMode): Project {
  return {
    id: 'free-project',
    name: '자유 장면',
    templateId: template.id,
    createdAt: 1,
    updatedAt: 1,
    freeform: { ...createFreeBrief('창가의 화분', mode), success: '작은 잎 세 장이 모두 보인다.' },
    decisions: {},
    references: [],
    locks: ['화분의 붉은 색 유지'],
    iterations: [],
  }
}

test('free image fixes compare changed and preserved features without demanding camera screenshots', () => {
  const prompt = assembleFix(template, project('image'), draft, 'ko')
  assert.ok(prompt.includes('수정한 이미지와 이전 결과를 비교'))
  assert.ok(prompt.includes('유지할 부분이 그대로인지'))
  assert.ok(prompt.includes('실제로 확인하지 못한 기준'))
  assert.ok(prompt.includes('결과 확인 기준:\n작은 잎 세 장이 모두 보인다.'))
  assert.ok(prompt.includes('화분의 붉은 색 유지'))
  assert.equal(/카메라 각도|전후 스크린샷|구현|실행/.test(prompt), false)
})

test('free video fixes request time and motion checks and describe marked images as representative frames', () => {
  const prompt = assembleFix(template, project('video'), {
    ...draft,
    note: '00:03~00:05의 잎 흔들림이 뚝 끊겨요.',
    region: { x: 0.2, y: 0.1, w: 0.4, h: 0.5 },
  }, 'ko')
  assert.ok(prompt.includes('첨부한 대표 프레임에 표시한 부분'))
  assert.ok(prompt.includes('00:03~00:05의 잎 흔들림이 뚝 끊겨요.'))
  assert.ok(prompt.includes('시간대와 그 앞뒤의 동작'))
  assert.ok(prompt.includes('움직임, 타이밍과 이어짐'))
  assert.ok(prompt.includes('영상을 재생할 수 없거나 원본 영상이 없어'))
  assert.equal(prompt.includes('같은 카메라 각도'), false)
})

test('free web fixes require interaction checks and honest reporting of untested behaviour', () => {
  const prompt = assembleFix(template, project('web'), draft, 'ko')
  assert.ok(prompt.includes('3D 웹 장면을 실행'))
  assert.ok(prompt.includes('요청한 조작과 그 뒤의 상태'))
  assert.ok(prompt.includes('시험하지 못한 동작을 확인한 것처럼 말하지 마세요'))
  assert.equal(prompt.includes('내 스크린샷과 같은 카메라 각도'), false)
})

test('English fix format retains the original custom input without pretending to translate it', () => {
  const prompt = assembleFix(template, project('video'), { ...draft, target: '오른쪽 새싹', targetEn: '오른쪽 새싹' }, 'en')
  assert.ok(prompt.includes('Problem: 오른쪽 새싹'))
  assert.ok(prompt.includes(draft.note))
  assert.ok(prompt.includes('화분의 붉은 색 유지'))
  assert.ok(prompt.includes('Result criteria:\n작은 잎 세 장이 모두 보인다.'))
  assert.ok(prompt.includes('motion, timing and continuity'))
  assert.equal(prompt.includes('same camera angle'), false)
})

test('free-scene comparisons do not invent a reference image when none was selected', () => {
  const p = project('image')
  const noReference = assembleFix(template, p, { ...draft, compareId: 'composition' }, 'ko')
  assert.equal(noReference.includes('참고 이미지 1'), false)
  p.references = [{ id: 'r1', role: 'composition', name: '구도.jpg', dataUrl: '' }]
  const selectedReference = assembleFix(template, p, { ...draft, compareId: 'composition', referenceId: 'r1' }, 'ko')
  assert.ok(selectedReference.includes('참고 이미지 1'))
})

test('existing template fixes retain their previous verification request', () => {
  const existingTemplate: Template = JSON.parse(readFileSync(new URL('../public/templates/product-shot.json', import.meta.url), 'utf8'))
  const p = { ...project('web'), templateId: existingTemplate.id, freeform: undefined }
  const existingDraft = { target: '제품', targetEn: 'the product', categoryId: 'shape', symptomId: 'shape-blobby' }
  const ko = assembleFix(existingTemplate, p, existingDraft, 'ko')
  const en = assembleFix(existingTemplate, p, existingDraft, 'en')
  assert.ok(ko.endsWith('다 되면 내 스크린샷과 같은 카메라 각도로 전후 스크린샷을 보여주고, 검수 기준도 다시 확인해줘.'))
  assert.ok(en.endsWith('When done, show a before/after screenshot from the same camera angle as my screenshot and re-check the acceptance checklist.'))
  assert.equal(ko.includes('결과 확인 기준:'), false)
})
