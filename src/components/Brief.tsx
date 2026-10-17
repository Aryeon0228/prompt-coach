import { answerFor, decisionText, groupDecisions, undecided } from '../lib/assemble'
import { useStore } from '../store'
import { CUSTOM, type Decision, type DecisionAnswer, type DecisionState, type Project } from '../types'
import { Segmented } from './ui'

/**
 * The decisions. Each one is decided, delegated to the AI, or admitted unknown — the point is
 * that "I didn't say" becomes visible instead of being silently filled in by the AI.
 */
export function Brief() {
  const { project, template, updateProject } = useStore()
  if (!project || !template) return null
  const groups = groupDecisions(template)
  const missing = undecided(template, project)

  const set = (d: Decision, a: DecisionAnswer) => updateProject((p) => ({ ...p, decisions: { ...p.decisions, [d.id]: a } }))

  return (
    <div className="stack">
      <div className="brief-overview">
        <p>기본값에서 시작해 필요한 항목만 바꾸세요. 제목을 눌러 펼칠 수 있고, 변경 내용은 자동 저장돼요.</p>
        {missing.length > 0 && <p className="small muted">미정 {missing.length}개 · AI가 두 가지 안을 제안하고 다시 물어보도록 요청해요.</p>}
        <details className="brief-guide">
          <summary>선택 상태 안내</summary>
          <p className="small muted"><b>내가 정함</b>은 선택한 내용을, <b>AI에게</b>는 나머지 조건에 맞춰 정해 달라는 요청을 프롬프트에 넣어요. <b>모름</b>으로 두면 두 가지 안을 제안하도록 요청해요.</p>
          {missing.length > 0 && <p className="small muted"><b>아직 미정:</b> {missing.map((d) => d.label).join(', ')}</p>}
        </details>
      </div>

      {groups.map((g, index) => (
        <details className="card brief-group" name={`brief-groups-${project.id}`} open={index === 0} key={`${project.id}-${g.name}`}>
          <summary className="brief-group-summary">
            <span className="brief-group-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <h2 className="brief-group-heading">
              <span className="brief-group-title">{g.name}</span>
              <span className="brief-group-preview">{g.decisions.slice(0, 2).map((d) => `${d.label}: ${answerSummary(d, answerFor(d, project))}`).join(' · ')}{g.decisions.length > 2 ? ` · 외 ${g.decisions.length - 2}개 항목` : ''}</span>
            </h2>
            <span className="brief-group-status">{groupStatus(g.decisions, project, missing)}</span>
          </summary>
          <div className="brief-group-body">
            {g.decisions.map((d) => {
              const a = answerFor(d, project)
              return (
                <div className="decision" key={d.id} id={`decision-${d.id}`}>
                  <header className="question-copy">
                    <h3 className="label question-title" id={`decision-label-${d.id}`}>
                      {d.label} {d.importance === 'core' ? <span className="pill">핵심</span> : null}
                    </h3>
                    {d.help ? <p className="help question-help" id={`decision-help-${d.id}`}>{d.help}</p> : null}
                  </header>
                  <div className="question-response decision-response">
                    <div className="decision-response-heading">
                      <span className="question-answer-label">답변</span>
                      <Segmented<DecisionState>
                        label={`${d.label} 결정 방식`}
                        value={a.state}
                        onChange={(state) => set(d, { ...a, state })}
                        options={[
                          { value: 'set', label: '내가 정함' },
                          { value: 'delegate', label: 'AI에게', className: 'delegate' },
                          { value: 'unknown', label: '모름', className: 'unknown' },
                        ]}
                      />
                    </div>
                    {a.state === 'set' && d.kind !== 'text' && <p className="small muted answer-instruction">{d.kind === 'choice' ? '하나를 고르거나 직접 적어 주세요.' : '여러 개를 고르거나 직접 덧붙일 수 있어요.'}</p>}
                    {a.state === 'set' && d.kind === 'choice' && (
                      <div className="choices question-choices" role="group" aria-labelledby={`decision-label-${d.id}`} aria-describedby={d.help ? `decision-help-${d.id}` : undefined}>
                        {d.options!.map((o) => (
                          <button key={o.value} type="button" aria-pressed={a.value === o.value} className={`choice ${a.value === o.value ? 'on' : ''}`} onClick={() => set(d, { state: 'set', value: o.value, custom: a.custom })} title={o.text.ko}>
                            {o.label}
                          </button>
                        ))}
                        <button type="button" aria-pressed={a.value === CUSTOM} className={`choice ${a.value === CUSTOM ? 'on' : ''}`} onClick={() => set(d, { state: 'set', value: CUSTOM, custom: a.custom ?? '' })}>
                          직접 쓰기
                        </button>
                      </div>
                    )}
                    {a.state === 'set' && d.kind === 'choice' && a.value === CUSTOM && (
                      <CustomBox d={d} value={a.custom ?? ''} onChange={(custom) => set(d, { ...a, custom })} />
                    )}
                    {a.state === 'set' && d.kind === 'multi' && (
                      <div className="choices question-choices" role="group" aria-labelledby={`decision-label-${d.id}`} aria-describedby={d.help ? `decision-help-${d.id}` : undefined}>
                        {d.options!.map((o) => {
                          const vals = Array.isArray(a.value) ? a.value : []
                          const on = vals.includes(o.value)
                          return (
                            <button key={o.value} type="button" aria-pressed={on} className={`choice ${on ? 'on' : ''}`} onClick={() => set(d, { state: 'set', value: on ? vals.filter((v) => v !== o.value) : [...vals, o.value] })} title={o.text.ko}>
                              {on ? '✓ ' : ''}
                              {o.label}
                            </button>
                          )
                        })}
                        <button type="button" aria-pressed={a.custom !== undefined} className={`choice ${a.custom !== undefined ? 'on' : ''}`} onClick={() => set(d, { ...a, state: 'set', custom: a.custom === undefined ? '' : undefined })}>
                          {a.custom !== undefined ? '✓ ' : ''}직접 덧붙이기
                        </button>
                      </div>
                    )}
                    {a.state === 'set' && d.kind === 'multi' && a.custom !== undefined && (
                      <CustomBox d={d} value={a.custom} onChange={(custom) => set(d, { ...a, custom })} />
                    )}
                    {a.state === 'set' && d.kind === 'text' && (
                      <textarea aria-labelledby={`decision-label-${d.id}`} aria-describedby={d.help ? `decision-help-${d.id}` : undefined} value={typeof a.value === 'string' ? a.value : ''} placeholder={d.placeholder} onChange={(e) => set(d, { state: 'set', value: e.target.value })} />
                    )}
                    {a.state === 'delegate' && <p className="small muted">→ "{(d.delegateText ?? { ko: '이건 나머지 내용과 어울리게 네가 정해줘.' }).ko}"</p>}
                    {a.state === 'unknown' && <p className="small" style={{ color: 'var(--amber)' }}>→ 프롬프트에 "두 가지 안을 내고 물어봐 줘"가 들어가요.</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </details>
      ))}
    </div>
  )
}

/** The user's own words for a decision; they go into the prompt as "<decision>: <text>". */
function CustomBox({ d, value, onChange }: { d: Decision; value: string; onChange: (v: string) => void }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <textarea aria-label={`${d.label} 직접 입력`} aria-describedby={d.help ? `decision-help-${d.id}` : undefined} value={value} placeholder="원하는 걸 자유롭게 적어 주세요. 쓴 그대로 프롬프트에 들어가요." onChange={(e) => onChange(e.target.value)} />
      <span className="small muted">프롬프트에는 "{d.label}: (적은 내용)"으로 들어가요. 한국어로 써도 괜찮아요.</span>
    </div>
  )
}

/** A compact preview: entered prose stays inside its group, while presets remain recognisable. */
function answerSummary(d: Decision, a: DecisionAnswer): string {
  if (a.state === 'delegate') return 'AI에게 맡김'
  if (a.state === 'unknown') return '미정'
  if (d.kind === 'text') return typeof a.value === 'string' && a.value.trim() ? '직접 입력' : d.importance === 'nice' ? '선택 입력' : '입력 대기'
  if (a.value === CUSTOM) return a.custom?.trim() ? '직접 입력' : '입력 대기'
  const values = Array.isArray(a.value) ? a.value : [a.value]
  const labels = values.map((value) => d.options?.find((option) => option.value === value)?.label).filter(Boolean)
  if (a.custom?.trim()) labels.push('직접 입력')
  return labels.join(', ') || '미정'
}

/** Defaults are usable starting points, not proof that the user has reviewed a decision. */
function groupStatus(decisions: Decision[], project: Project, missing: Decision[]): string {
  const counts = { defaults: 0, set: 0, delegate: 0, missing: 0 }
  for (const d of decisions) {
    const a = answerFor(d, project)
    if (missing.some((item) => item.id === d.id)) counts.missing++
    else if (a.state === 'delegate') counts.delegate++
    else if (decisionText(d, a, 'ko')) {
      if (Object.prototype.hasOwnProperty.call(project.decisions, d.id)) counts.set++
      else counts.defaults++
    }
  }
  return [
    counts.defaults ? `기본값 ${counts.defaults}` : '',
    counts.set ? `직접 설정 ${counts.set}` : '',
    counts.delegate ? `AI에게 ${counts.delegate}` : '',
    counts.missing ? `미정 ${counts.missing}` : '',
  ].filter(Boolean).join(' · ') || '선택 입력'
}
