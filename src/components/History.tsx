import { useState } from 'react'
import { historyStats } from '../lib/assemble'
import { useStore } from '../store'
import { copyText, useToast } from './ui'

/** Every round so far, and what they add up to: the lesson is in the pattern. */
export function History() {
  const { project, template, updateProject } = useStore()
  const toast = useToast()
  const [open, setOpen] = useState<string | null>(null)
  if (!project || !template) return null
  const stats = historyStats(template, project)
  const label = (cid: string, sid: string) => {
    const c = template.diagnosis.find((x) => x.id === cid)
    return { cat: c?.label ?? cid, sym: c?.symptoms.find((s) => s.id === sid)?.label ?? sid }
  }

  return (
    <div className="stack">
      {stats.total > 0 && (
        <section className="card stack">
          <div className="section-title">
            <h2>자주 틀리는 패턴</h2>
            <span className="small muted">
              수정 요청 {stats.total}회 · 해결 {stats.resolved}회
            </span>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            {stats.categories.map((c) => (
              <div key={c.label}>
                <div className="row small" style={{ justifyContent: 'space-between' }}>
                  <span>{c.label}</span>
                  <span className="muted">{c.n}</span>
                </div>
                <div className="bar">
                  <i style={{ width: `${(100 * c.n) / stats.total}%` }} />
                </div>
              </div>
            ))}
          </div>
          {stats.symptoms.length > 0 && (
            <p className="small muted">
              자주 나온 증상: {stats.symptoms.map((s) => `${s.label}(${s.n})`).join(', ')}. 같은 증상이 계속 나오면 첫 프롬프트에서 그 부분의 결정을 더 구체적으로 적거나 참고 이미지를 한 장 더 넣는 게 빨라요.
            </p>
          )}
        </section>
      )}

      {project.iterations.length === 0 && (
        <div className="note">아직 기록이 없어요. "코치" 탭에서 수정 프롬프트를 만들면 여기에 쌓이고, 몇 번 쌓이면 자주 틀리는 패턴을 보여 줘요.</div>
      )}

      {[...project.iterations].reverse().map((it, idx) => {
        const n = project.iterations.length - idx
        const l = label(it.categoryId, it.symptomId)
        return (
          <section className="card stack" key={it.id}>
            <div className="iter">
              {it.screenshot ? <img src={it.screenshot} alt="" /> : <div className="thumb-empty">사진 없음</div>}
              <div className="stack" style={{ gap: 6, minWidth: 0 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <b>
                    #{n} {it.target}
                  </b>
                  <span className="small muted">{new Date(it.createdAt).toLocaleString()}</span>
                </div>
                <div className="small">
                  <span className="pill">{l.cat}</span> {l.sym}
                  {it.note ? <span className="muted"> · {it.note}</span> : null}
                </div>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div className="stars" aria-label="결과 만족도">
                    {[1, 2, 3, 4, 5].map((k) => (
                      <button key={k} className={(it.rating ?? 0) >= k ? 'on' : ''} aria-label={`${k}점`} onClick={() => updateProject((p) => ({ ...p, iterations: p.iterations.map((x) => (x.id === it.id ? { ...x, rating: k } : x)) }))}>
                        ★
                      </button>
                    ))}
                  </div>
                  <label className="row small" style={{ gap: 6 }}>
                    <input type="checkbox" checked={!!it.resolved} onChange={(e) => updateProject((p) => ({ ...p, iterations: p.iterations.map((x) => (x.id === it.id ? { ...x, resolved: e.target.checked } : x)) }))} />
                    해결됨
                  </label>
                </div>
                <div className="row">
                  <button className="ghost" onClick={() => setOpen(open === it.id ? null : it.id)}>
                    {open === it.id ? '프롬프트 접기' : '프롬프트 보기'}
                  </button>
                  <button className="ghost" onClick={async () => toast((await copyText(it.promptEn)) ? '영어 프롬프트를 복사했어요.' : '복사할 수 없어요. 글을 직접 선택해서 복사해 주세요.')}>
                    영어 복사
                  </button>
                  <button
                    className="ghost"
                    onClick={() => {
                      if (confirm('이 기록을 지울까요?')) updateProject((p) => ({ ...p, iterations: p.iterations.filter((x) => x.id !== it.id) }))
                    }}
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
            {open === it.id && (
              <div className="stack">
                <div className="mono card" lang="en">
                  {it.promptEn}
                </div>
                <div className="mono card">{it.promptKo}</div>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
