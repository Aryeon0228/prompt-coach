import type { Template, TemplateIndexEntry } from '../types'

const base = import.meta.env.BASE_URL

const cache = new Map<string, Promise<Template>>()

export async function loadIndex(): Promise<TemplateIndexEntry[]> {
  const res = await fetch(`${base}templates/index.json`)
  if (!res.ok) throw new Error('템플릿 목록을 불러오지 못했어요')
  return res.json()
}

export function loadTemplate(entry: TemplateIndexEntry): Promise<Template> {
  let p = cache.get(entry.id)
  if (!p) {
    p = fetch(`${base}templates/${entry.file}`).then((r) => {
      if (!r.ok) throw new Error(`템플릿 파일이 없어요: ${entry.file}`)
      return r.json() as Promise<Template>
    })
    cache.set(entry.id, p)
  }
  return p
}

/** Minimal sanity check so a mistyped template fails loudly instead of rendering blanks. */
export function validateTemplate(t: Template): string[] {
  const problems: string[] = []
  const ids = new Set<string>()
  for (const d of t.decisions ?? []) {
    if (ids.has(d.id)) problems.push(`decision id 중복: ${d.id}`)
    ids.add(d.id)
    if ((d.kind === 'choice' || d.kind === 'multi') && !d.options?.length) problems.push(`선택지가 없음: ${d.id}`)
  }
  for (const s of t.sections ?? []) for (const id of s.decisions ?? []) if (!ids.has(id)) problems.push(`섹션 ${s.id}이 모르는 결정을 참조: ${id}`)
  const symptoms = new Set(t.diagnosis?.flatMap((c) => c.symptoms.map((s) => s.id)) ?? [])
  for (const f of t.feelDictionary ?? []) for (const s of f.symptoms) if (!symptoms.has(s)) problems.push(`느낌 사전이 모르는 증상을 참조: ${s}`)
  return problems
}
