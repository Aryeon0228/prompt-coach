import { answerFor, groupDecisions, undecided } from '../lib/assemble'
import { useStore } from '../store'
import { CUSTOM, type Decision, type DecisionAnswer, type DecisionState } from '../types'
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
      <div className={`note ${missing.length ? 'warn' : ''}`}>
        {missing.length ? (
          <>
            <b>아직 정하지 않은 항목 {missing.length}개</b>: {missing.map((d) => d.label).join(', ')}. 이대로 두면 프롬프트에 "두 가지 안을 내고 나한테 물어봐 줘"라는 요청이 들어가요. 모르는 건 모른다고 두는 편이 아무 말도 안 하는 것보다 나아요.
          </>
        ) : (
          <>
            모든 항목을 정했어요. <b>내가 정함</b>은 그대로 프롬프트에 들어가고, <b>AI에게</b>로 둔 항목은 "나머지와 어울리게 네가 정해 줘"로 들어가요.
          </>
        )}
      </div>

      {groups.map((g) => (
        <section className="card" key={g.name}>
          <div className="section-title">
            <h2>{g.name}</h2>
          </div>
          {g.decisions.map((d) => {
            const a = answerFor(d, project)
            return (
              <div className="decision" key={d.id} id={`decision-${d.id}`}>
                <header>
                  <div>
                    <div className="label">
                      {d.label} {d.importance === 'core' ? <span className="pill">핵심</span> : null}
                    </div>
                    {d.help ? <div className="help">{d.help}</div> : null}
                  </div>
                  <Segmented<DecisionState>
                    value={a.state}
                    onChange={(state) => set(d, { ...a, state })}
                    options={[
                      { value: 'set', label: '내가 정함' },
                      { value: 'delegate', label: 'AI에게', className: 'delegate' },
                      { value: 'unknown', label: '모름', className: 'unknown' },
                    ]}
                  />
                </header>
                {a.state === 'set' && d.kind === 'choice' && (
                  <div className="choices">
                    {d.options!.map((o) => (
                      <button key={o.value} className={`choice ${a.value === o.value ? 'on' : ''}`} onClick={() => set(d, { state: 'set', value: o.value, custom: a.custom })} title={o.text.ko}>
                        {o.label}
                      </button>
                    ))}
                    <button className={`choice ${a.value === CUSTOM ? 'on' : ''}`} onClick={() => set(d, { state: 'set', value: CUSTOM, custom: a.custom ?? '' })}>
                      직접 쓰기
                    </button>
                  </div>
                )}
                {a.state === 'set' && d.kind === 'choice' && a.value === CUSTOM && (
                  <CustomBox d={d} value={a.custom ?? ''} onChange={(custom) => set(d, { ...a, custom })} />
                )}
                {a.state === 'set' && d.kind === 'multi' && (
                  <div className="choices">
                    {d.options!.map((o) => {
                      const vals = Array.isArray(a.value) ? a.value : []
                      const on = vals.includes(o.value)
                      return (
                        <button key={o.value} className={`choice ${on ? 'on' : ''}`} onClick={() => set(d, { state: 'set', value: on ? vals.filter((v) => v !== o.value) : [...vals, o.value] })} title={o.text.ko}>
                          {on ? '✓ ' : ''}
                          {o.label}
                        </button>
                      )
                    })}
                    <button className={`choice ${a.custom !== undefined ? 'on' : ''}`} onClick={() => set(d, { ...a, state: 'set', custom: a.custom === undefined ? '' : undefined })}>
                      {a.custom !== undefined ? '✓ ' : ''}직접 덧붙이기
                    </button>
                  </div>
                )}
                {a.state === 'set' && d.kind === 'multi' && a.custom !== undefined && (
                  <CustomBox d={d} value={a.custom} onChange={(custom) => set(d, { ...a, custom })} />
                )}
                {a.state === 'set' && d.kind === 'text' && (
                  <textarea value={typeof a.value === 'string' ? a.value : ''} placeholder={d.placeholder} onChange={(e) => set(d, { state: 'set', value: e.target.value })} />
                )}
                {a.state === 'delegate' && <p className="small muted">→ "{(d.delegateText ?? { ko: '이건 나머지 내용과 어울리게 네가 정해줘.' }).ko}"</p>}
                {a.state === 'unknown' && <p className="small" style={{ color: 'var(--amber)' }}>→ 프롬프트에 "두 가지 안을 내고 물어봐 줘"가 들어가요.</p>}
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}

/** The student's own words for a decision; they go into the prompt as "<decision>: <text>". */
function CustomBox({ d, value, onChange }: { d: Decision; value: string; onChange: (v: string) => void }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <textarea value={value} placeholder="원하는 걸 자유롭게 적어 주세요. 쓴 그대로 프롬프트에 들어가요." onChange={(e) => onChange(e.target.value)} />
      <span className="small muted">프롬프트에는 "{d.label}: (적은 내용)"으로 들어가요. 한국어로 써도 괜찮아요.</span>
    </div>
  )
}
