import { useEffect, useId, useRef, useState } from 'react'
import { buildCoachingRequest, createPromptCoaching } from '../lib/coach-handoff'
import { coachingContext } from '../lib/coaching-context'
import { buildMcpStarter } from '../lib/mcp-connection'
import { useStore } from '../store'
import { useToast } from './ui'

const MAX_DRAFT = 100000
const MAX_NOTES = 10000

/** Drafts are saved as work in progress; applying is an explicit, separate action. */
export function ImportedPromptEditor({ open, onOpenChange, onApplied, onEdit, focusRequestKey }: {
  open: boolean
  focusRequestKey?: number
  onOpenChange: (open: boolean) => void
  onApplied: () => void
  onEdit: () => void
}) {
  const { project, updateProject } = useStore()
  const toast = useToast()
  const id = useId()
  const draftField = useRef<HTMLTextAreaElement>(null)
  const [confirmedSource, setConfirmedSource] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => draftField.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open, focusRequestKey])

  if (!project) return null
  const { brief, source, session } = coachingContext(project)
  const coaching = project.promptCoaching ?? createPromptCoaching()
  const requestText = buildMcpStarter({ medium: brief.mode, idea: brief.idea, requestText: buildCoachingRequest(brief, project.references, project.locks, session) })
  const sourceFits = source.length <= MAX_DRAFT
  const requestFits = requestText.length <= MAX_DRAFT
  const hasIdea = Boolean(brief.idea.trim())
  const hasDraft = Boolean(coaching.draft.trim())
  const draftStale = hasDraft && coaching.draftSource !== source
  const acceptedStale = Boolean(coaching.accepted && coaching.accepted.source !== source)
  const draftMatchesAccepted = Boolean(coaching.accepted && coaching.draft === coaching.accepted.text && coaching.draftSource === coaching.accepted.source)
  const hasPendingChanges = hasDraft && (!draftMatchesAccepted || acceptedStale)
  const canUse = hasIdea && hasDraft && sourceFits && requestFits && hasPendingChanges && (!draftStale || confirmedSource === source)

  const updateDraft = (draft: string) => {
    setConfirmedSource(null)
    updateProject((p) => {
      if (p.id !== project.id) return p
      const current = p.promptCoaching ?? createPromptCoaching()
      return {
        ...p,
        promptCoaching: {
          ...current,
          draft: draft.slice(0, MAX_DRAFT),
          draftSource: current.draft.trim() ? current.draftSource : current.request?.source ?? (sourceFits ? source : ''),
        },
      }
    })
  }

  const updateNotes = (notes: string) => updateProject((p) => p.id !== project.id ? p : {
    ...p,
    promptCoaching: { ...(p.promptCoaching ?? createPromptCoaching()), notes: notes.slice(0, MAX_NOTES) },
  })

  const useDraft = () => {
    if (!canUse) return
    updateProject((p) => p.id !== project.id ? p : {
      ...p,
      promptCoaching: {
        ...(p.promptCoaching ?? createPromptCoaching()),
        draftSource: source,
        accepted: { text: coaching.draft, source, acceptedAt: Date.now() },
      },
    })
    setConfirmedSource(null)
    toast(coaching.accepted ? '프롬프트를 업데이트했어요. 복사해서 제작을 시작하세요.' : '프롬프트를 준비했어요. 복사해서 제작을 시작하세요.')
    onApplied()
  }

  return <details className="card coaching-optional imported-prompt-editor" hidden={!open} open={open} onToggle={(event) => onOpenChange(event.currentTarget.open)}>
    <summary>{coaching.accepted ? '가져온 프롬프트 편집' : '완성한 프롬프트 가져오기'} <span className="small muted">{hasPendingChanges ? '아직 적용하지 않은 초안' : '직접 붙여 넣고 편집'}</span></summary>
    <section className="stack coaching-step" aria-labelledby={`${id}-title`}>
      <div><h2 id={`${id}-title`}>{coaching.accepted ? '가져온 프롬프트 다듬기' : '내 AI의 완성본 보관하기'}</h2><p className="muted">ChatGPT나 Claude에서 완성한 문장을 붙여 넣거나 직접 고치세요. 적용하면 이 화면에서 비교하고 복사할 수 있어요.</p></div>
      <label className="stack coaching-draft-label" htmlFor={`${id}-draft`}><span>편집 중인 초안</span><textarea ref={draftField} id={`${id}-draft`} value={coaching.draft} onChange={(event) => updateDraft(event.target.value)} maxLength={MAX_DRAFT} rows={9} aria-describedby={`${id}-draft-help`} placeholder="ChatGPT나 Claude에서 다듬은 프롬프트를 여기에 붙여 넣으세요." /></label>
      <p className="small muted" id={`${id}-draft-help`} role="status">{hasPendingChanges ? '초안은 자동 보관 중이에요. ‘프롬프트에 적용하기’를 눌러야 복사할 내용에 반영됩니다.' : draftMatchesAccepted ? '현재 적용된 프롬프트와 같아요. 수정 내용은 다시 적용하기 전까지 초안으로 보관됩니다.' : '초안은 자동 보관돼요. 적용하기 전에는 현재 프롬프트를 바꾸지 않아요.'}</p>
      <details className="coaching-notes"><summary>대화에서 배운 점 남기기 <span className="small muted">선택</span></summary><label className="stack" htmlFor={`${id}-notes`}><span className="sr-only">대화에서 배운 점 메모</span><textarea id={`${id}-notes`} aria-describedby={`${id}-notes-help`} value={coaching.notes} maxLength={MAX_NOTES} rows={4} placeholder="예: ‘분위기 있게’ 대신 빛이 들어오는 방향과 색을 정하니 장면이 분명해졌어요." onChange={(event) => updateNotes(event.target.value)} /><span className="small muted" id={`${id}-notes-help`}>내가 참고할 메모예요. 최종 프롬프트에는 들어가지 않아요.</span></label></details>
      {draftStale && <div className="coaching-compare-check">
        <p className="small muted">{coaching.draftSource ? '이 초안은 이전 장면의 코칭 요청과 연결되어 있어요.' : '이 초안의 기준이 된 장면 설정을 확인할 수 없어요.'} 현재 조건이 반영됐는지 확인한 뒤 적용하세요.</p>
        <button type="button" className="ghost" onClick={onEdit}>현재 장면 설정 보기 →</button>
        <label><input type="checkbox" checked={confirmedSource === source} onChange={(event) => setConfirmedSource(event.target.checked ? source : null)} /><span>현재 장면 설정과 비교했어요</span></label>
      </div>}
      {(!sourceFits || !requestFits) && <div className="note warn" role="status"><p>장면 설명과 참고 메모가 길어 이 프롬프트를 적용할 수 없어요. 장면 설정에서 필요한 조건만 남겨 주세요.</p><button type="button" className="ghost" onClick={onEdit}>장면 설정 줄이기 →</button></div>}
      {!hasIdea && <p className="small muted">프롬프트를 적용하려면 장면 설정에서 만들고 싶은 장면을 먼저 적어 주세요. <button type="button" className="ghost" onClick={onEdit}>장면 적기 →</button></p>}
      {acceptedStale && <p className="small muted">이전에 적용한 프롬프트도 보관 중이에요. 현재 조건을 확인하고 적용하면 업데이트됩니다.</p>}
      <div className="coaching-use-row"><p className="small muted">처음 작성한 장면 설정은 그대로 보관돼요.</p><button type="button" disabled={!canUse} onClick={useDraft}>프롬프트에 적용하기 <span aria-hidden="true">→</span></button></div>
    </section>
  </details>
}
