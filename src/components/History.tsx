import { historyStats } from '../lib/assemble'
import { useStore } from '../store'
import { PromptBox } from './ui'

/** Saved requests first; assessment follows after a revised result is available. */
export function History({ onCreate }: { onCreate: () => void }) {
  const { project, template, updateProject } = useStore()
  if (!project || !template) return null
  const stats = historyStats(template, project)
  const records = project.iterations.map((it, index) => ({ it, n: index + 1 })).sort((a, b) => b.it.createdAt - a.it.createdAt)
  const label = (cid: string, sid: string) => {
    const c = template.diagnosis.find((x) => x.id === cid)
    return { cat: c?.label ?? cid, sym: c?.symptoms.find((s) => s.id === sid)?.label ?? sid }
  }

  return (
    <div className="stack">
      {records.length === 0 && (
        <section className="card stack history-empty">
          <h2>아직 저장한 수정 요청이 없어요</h2>
          <p className="small muted">수정 코치에서 바꿀 부분을 정하고 요청문을 저장하면 여기에 모여요.</p>
          <div className="row"><button type="button" onClick={onCreate}>수정 요청 만들기</button></div>
        </section>
      )}

      {records.map(({ it, n }) => {
        const l = label(it.categoryId, it.symptomId)
        const evaluation = it.resolved === true ? '해결됨' : it.resolved === false ? '미해결' : it.rating !== undefined ? `만족도 ${it.rating}/5` : '미평가'
        return (
          <section className="card stack history-record" key={it.id}>
            <div className="iter">
              <figure className="history-before">
                {it.screenshot ? <img src={it.screenshot} alt={`${it.target} 수정 전 화면`} /> : <div className="thumb-empty">이미지 없음</div>}
                <figcaption className="small muted">수정 전 화면</figcaption>
              </figure>
              <div className="stack" style={{ gap: 6, minWidth: 0 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <h2 className="history-record-title">#{n} {it.target}</h2>
                  <span className="small muted">{new Date(it.createdAt).toLocaleString()}</span>
                </div>
                <p className="small"><span className="pill">{l.cat}</span> {l.sym}</p>
                {it.note && <p className="small history-wanted-change"><b>바꿀 내용</b> {it.note}</p>}
              </div>
            </div>
            <details className="history-request">
              <summary>수정 프롬프트 보기</summary>
              <PromptBox en={it.promptEn} ko={it.promptKo} filename={`${project.name}-fix-${n}.txt`} initialLang={template.id === 'free-scene' ? 'ko' : 'en'} title="저장된 수정 프롬프트" copyLabel="수정 프롬프트 복사" usageHint="복사한 뒤 작업 중인 AI 대화에 붙여 넣으세요." />
            </details>
            <details className="history-evaluation">
              <summary>결과를 받은 뒤 평가 <span className="small muted">{evaluation}</span></summary>
              <div className="stack">
                <p className="small muted">수정 결과를 확인한 뒤 만족도와 해결 여부를 남겨요.</p>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div className="stars" role="group" aria-label={`${n}번 수정 결과 만족도`}>
                    {[1, 2, 3, 4, 5].map((k) => (
                      <button type="button" key={k} aria-pressed={it.rating === k} className={(it.rating ?? 0) >= k ? 'on' : ''} aria-label={`${k}점`} onClick={() => updateProject((p) => ({ ...p, iterations: p.iterations.map((x) => (x.id === it.id ? { ...x, rating: k } : x)) }))}>★</button>
                    ))}
                  </div>
                  <label className="row small" style={{ gap: 6 }}>
                    <input type="checkbox" checked={!!it.resolved} onChange={(e) => updateProject((p) => ({ ...p, iterations: p.iterations.map((x) => (x.id === it.id ? { ...x, resolved: e.target.checked } : x)) }))} />
                    문제가 해결됐어요
                  </label>
                </div>
              </div>
            </details>
            <div className="row history-record-actions">
              <button type="button" className="ghost" aria-label={`${n}번 수정 기록 삭제`} onClick={() => {
                if (confirm(`"${it.target}" 수정 기록을 지울까요?`)) updateProject((p) => ({ ...p, iterations: p.iterations.filter((x) => x.id !== it.id) }))
              }}>기록 삭제</button>
            </div>
          </section>
        )
      })}

      {stats.total > 0 && (
        <details className="card history-stats">
          <summary>자주 수정한 부분 <span className="small muted">수정 요청 {stats.total}회 · 해결 {stats.resolved}회</span></summary>
          <div className="stack">
            {stats.categories.map((c) => (
              <div key={c.label}>
                <div className="row small" style={{ justifyContent: 'space-between' }}><span>{c.label}</span><span className="muted">{c.n}</span></div>
                <div className="bar"><i style={{ width: `${(100 * c.n) / stats.total}%` }} /></div>
              </div>
            ))}
            {stats.symptoms.length > 0 && <p className="small muted">자주 나온 증상: {stats.symptoms.map((s) => `${s.label}(${s.n})`).join(', ')}. 반복되는 부분은 장면 조건이나 참고 이미지를 보완해 보세요.</p>}
          </div>
        </details>
      )}
    </div>
  )
}
