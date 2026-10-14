import { answerFor, groupDecisions, undecided } from '../lib/assemble'
import { useStore } from '../store'
import type { Decision, DecisionAnswer, DecisionState } from '../types'
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
            <b>아직 말하지 않은 것 {missing.length}개</b> — {missing.map((d) => d.label).join(', ')}. 이대로 두면 프롬프트가 "AI가 2안을 제시하고 물어보게" 요청해요. 모르는 건 모른다고 두는 게, 아무 말 안 하는 것보다 나아요.
          </>
        ) : (
          <>
            모든 결정이 내려졌어요. <b>내가 정함</b>은 그대로 전달되고, <b>AI에게</b>는 "네가 어울리게 정해" 로 전달돼요.
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
                      <button key={o.value} className={`choice ${a.value === o.value ? 'on' : ''}`} onClick={() => set(d, { state: 'set', value: o.value })} title={o.text.ko}>
                        {o.label}
                      </button>
                    ))}
                  </div>
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
                  </div>
                )}
                {a.state === 'set' && d.kind === 'text' && (
                  <textarea value={typeof a.value === 'string' ? a.value : ''} placeholder={d.placeholder} onChange={(e) => set(d, { state: 'set', value: e.target.value })} />
                )}
                {a.state === 'delegate' && <p className="small muted">→ "{(d.delegateText ?? { ko: '이 부분은 나머지 요구사항에 어울리게 네가 정해줘.' }).ko}"</p>}
                {a.state === 'unknown' && <p className="small" style={{ color: 'var(--amber)' }}>→ 프롬프트가 AI에게 2안을 내고 물어보라고 해요.</p>}
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}
