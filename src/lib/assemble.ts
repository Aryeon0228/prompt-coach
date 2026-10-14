import type { Decision, DecisionAnswer, Iteration, Localized, Project, Template } from '../types'

type Lang = 'en' | 'ko'

const DELEGATE: Localized = {
  en: 'Decide this yourself in a way that fits the rest of the brief.',
  ko: '이 부분은 나머지 요구사항에 어울리게 네가 정해줘.',
}

/** The decisions grouped, in template order. */
export function groupDecisions(t: Template) {
  const groups: Array<{ name: string; decisions: Decision[] }> = []
  for (const d of t.decisions) {
    let g = groups.find((x) => x.name === d.group)
    if (!g) groups.push((g = { name: d.group, decisions: [] }))
    g.decisions.push(d)
  }
  return groups
}

export function answerFor(d: Decision, p: Project): DecisionAnswer {
  return p.decisions[d.id] ?? { state: 'set', value: d.default ?? (d.kind === 'multi' ? [] : d.kind === 'text' ? '' : d.options?.[0]?.value) }
}

/** What one decision says to the AI (null when it says nothing yet). */
export function decisionText(d: Decision, a: DecisionAnswer, lang: Lang): string | null {
  if (a.state === 'delegate') return (d.delegateText ?? DELEGATE)[lang]
  if (a.state === 'unknown') return null
  if (d.kind === 'text') {
    const v = typeof a.value === 'string' ? a.value.trim() : ''
    if (!v) return null
    return d.text ? d.text[lang].replace('{value}', v) : v
  }
  if (d.kind === 'multi') {
    const vals = Array.isArray(a.value) ? a.value : []
    const texts = vals.map((v) => d.options?.find((o) => o.value === v)?.text[lang]).filter(Boolean)
    return texts.length ? texts.join(' ') : null
  }
  const o = d.options?.find((x) => x.value === a.value)
  return o ? o.text[lang] : null
}

/** Decisions the student has not made (state unknown, or an empty answer). */
export function undecided(t: Template, p: Project) {
  return t.decisions.filter((d) => {
    const a = answerFor(d, p)
    if (a.state === 'unknown') return true
    // an empty optional free-text field is not a missing decision
    if (a.state === 'set' && d.kind === 'text') return d.importance !== 'nice' && !(typeof a.value === 'string' && a.value.trim())
    if (a.state === 'set' && d.kind === 'multi') return !(Array.isArray(a.value) && a.value.length)
    return false
  })
}

/** Acceptance criteria: the template's base list plus whatever the chosen options add. */
export function checklist(t: Template, p: Project, lang: Lang): string[] {
  const out = t.checklistBase.map((c) => c[lang])
  for (const d of t.decisions) {
    const a = answerFor(d, p)
    if (a.state !== 'set') continue
    const vals = d.kind === 'multi' ? (Array.isArray(a.value) ? a.value : []) : [a.value]
    for (const v of vals) for (const c of d.options?.find((o) => o.value === v)?.checklist ?? []) out.push(c[lang])
  }
  return out
}

function numbered(lines: string[]) {
  return lines.map((l, i) => `${i + 1}. ${l}`).join('\n')
}

/** The first prompt: every section of the template, in order. */
export function assembleBrief(t: Template, p: Project, lang: Lang): string {
  const parts: string[] = []
  let n = 0
  for (const s of t.sections) {
    let body = ''
    if (s.auto === 'references') {
      if (!p.references.length) {
        body = lang === 'en' ? 'No reference images are attached; work from the written brief.' : '참고 이미지는 첨부하지 않았으니 글로 된 요구사항으로 작업해줘.'
      } else {
        body = p.references
          .map((r, i) => {
            const role = t.referenceRoles.find((x) => x.id === r.role)
            const line = (role?.text[lang] ?? (lang === 'en' ? 'Image {n}: reference.' : '이미지 {n}: 참고용.')).replace('{n}', String(i + 1))
            return r.note ? `${line} ${r.note}` : line
          })
          .join('\n')
        body += lang === 'en' ? '\n(Attach the images in this order.)' : '\n(이미지를 이 순서대로 첨부하세요.)'
      }
    } else if (s.auto === 'undecided') {
      const list = undecided(t, p)
      if (!list.length) continue
      body =
        (lang === 'en'
          ? 'I have not decided the following. For each one, propose two concrete options with a one-line reason each, pick one provisionally so work can continue, and ask me before polishing it:\n'
          : '다음은 아직 정하지 못했어. 각 항목마다 구체적인 안 두 개를 한 줄 이유와 함께 제시하고, 작업이 멈추지 않게 하나를 임시로 고르되 다듬기 전에 나에게 물어봐줘:\n') +
        list.map((d) => `- ${lang === 'en' ? d.labelEn ?? d.id : d.label}`).join('\n')
    } else if (s.auto === 'checklist') {
      body = (lang === 'en' ? 'Treat each of these as a bug if it is not true:\n' : '다음이 지켜지지 않으면 버그로 보고 고쳐줘:\n') + numbered(checklist(t, p, lang))
    } else if (s.auto === 'locks') {
      if (!p.locks.length) continue
      body = (lang === 'en' ? 'Do not change these; they are already right:\n' : '다음은 이미 마음에 드니 바꾸지 마:\n') + p.locks.map((l) => `- ${l}`).join('\n')
    } else if (s.auto === 'process') {
      body = numbered(t.process.map((x) => x[lang]))
    } else {
      const lines: string[] = []
      if (s.intro) lines.push(s.intro[lang])
      for (const id of s.decisions ?? []) {
        const d = t.decisions.find((x) => x.id === id)
        if (!d) continue
        const text = decisionText(d, answerFor(d, p), lang)
        if (text) lines.push(text)
      }
      body = lines.join(' ')
    }
    if (!body.trim()) continue
    n++
    parts.push(`${n}. ${s.title[lang]}\n${body}`)
  }
  return parts.join('\n\n')
}

/** A follow-up prompt built from one diagnosis. */
export function assembleFix(
  t: Template,
  p: Project,
  it: Pick<Iteration, 'target' | 'targetEn' | 'categoryId' | 'symptomId' | 'compareId' | 'referenceId' | 'note' | 'region'>,
  lang: Lang,
): string {
  const cat = t.diagnosis.find((c) => c.id === it.categoryId)
  const sym = cat?.symptoms.find((s) => s.id === it.symptomId)
  if (!cat || !sym) return ''
  const target = (lang === 'en' ? it.targetEn || it.target : it.target) || (lang === 'en' ? 'the marked area' : '표시한 부분')
  const lines: string[] = []
  const where = it.region
    ? lang === 'en'
      ? ` (marked in the attached screenshot, roughly ${Math.round(it.region.x * 100)}–${Math.round((it.region.x + it.region.w) * 100)}% from the left, ${Math.round(it.region.y * 100)}–${Math.round((it.region.y + it.region.h) * 100)}% from the top)`
      : ` (첨부한 스크린샷에 표시, 왼쪽에서 약 ${Math.round(it.region.x * 100)}~${Math.round((it.region.x + it.region.w) * 100)}%, 위에서 ${Math.round(it.region.y * 100)}~${Math.round((it.region.y + it.region.h) * 100)}%)`
    : ''
  lines.push(lang === 'en' ? `Problem: ${target}${where} — ${sym.labelEn || sym.label}.` : `문제: ${target}${where} — ${sym.label}.`)
  const fix = sym.fix[lang].replace(/\{target\}/g, target)
  // a target like "the cliffs" can start the sentence: capitalise it
  lines.push(lang === 'en' ? fix.charAt(0).toUpperCase() + fix.slice(1) : fix)
  if (it.compareId) {
    const axis = t.compareAxes.find((a) => a.id === it.compareId)
    const refIndex = p.references.findIndex((r) => r.id === it.referenceId)
    if (axis) lines.push(axis.text[lang].replace('{n}', refIndex >= 0 ? String(refIndex + 1) : '1'))
  }
  if (it.note?.trim()) lines.push(it.note.trim())
  lines.push(lang === 'en' ? 'Change only this; leave everything else as it is.' : '이것만 바꾸고 나머지는 그대로 둬.')
  if (p.locks.length) lines.push((lang === 'en' ? 'In particular, do not touch: ' : '특히 다음은 건드리지 마: ') + p.locks.join('; ') + '.')
  lines.push(
    lang === 'en'
      ? 'When done, show a before/after screenshot from the same camera angle as my screenshot and re-check the acceptance checklist.'
      : '끝나면 내 스크린샷과 같은 카메라 각도로 전후 스크린샷을 보여 주고, 검수 기준을 다시 확인해줘.',
  )
  return lines.join('\n')
}

/** Patterns over a project's history: what keeps going wrong. */
export function historyStats(t: Template, p: Project) {
  const byCategory = new Map<string, number>()
  const bySymptom = new Map<string, number>()
  for (const it of p.iterations) {
    byCategory.set(it.categoryId, (byCategory.get(it.categoryId) ?? 0) + 1)
    bySymptom.set(it.symptomId, (bySymptom.get(it.symptomId) ?? 0) + 1)
  }
  const label = (cid: string, sid?: string) => {
    const c = t.diagnosis.find((x) => x.id === cid)
    if (!sid) return c?.label ?? cid
    return c?.symptoms.find((s) => s.id === sid)?.label ?? sid
  }
  return {
    total: p.iterations.length,
    resolved: p.iterations.filter((i) => i.resolved).length,
    categories: [...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ label: label(id), n })),
    symptoms: [...bySymptom.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, n]) => {
        const cat = t.diagnosis.find((c) => c.symptoms.some((s) => s.id === id))
        return { label: label(cat?.id ?? '', id), n }
      }),
  }
}
