import { useEffect, useMemo, useRef, useState } from 'react'
import { assembleFix } from '../lib/assemble'
import { uid } from '../lib/db'
import { loadImage } from '../lib/image'
import { useStore } from '../store'
import type { Region, Symptom } from '../types'
import { PromptBox, useToast } from './ui'

type Step = 'shot' | 'where' | 'what' | 'how' | 'compare' | 'result'
const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'shot', label: '결과 화면' },
  { id: 'where', label: '어디가' },
  { id: 'what', label: '무엇이' },
  { id: 'how', label: '어떻게' },
  { id: 'compare', label: '참고와 비교' },
  { id: 'result', label: '수정 프롬프트' },
]

/**
 * The coach turns "something looks off" into a precise fix request: point at it, pick the
 * category, pick the symptom, say how it differs from the reference. The user never has to
 * find the technical word — the template carries it.
 */
export function Coach({ onSaved }: { onSaved: () => void }) {
  const { project, template, updateProject } = useStore()
  const toast = useToast()
  const [step, setStep] = useState<Step>('shot')
  const [shot, setShot] = useState<string | undefined>()
  const [region, setRegion] = useState<Region | undefined>()
  const [target, setTarget] = useState('')
  const [customTarget, setCustomTarget] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [symptomId, setSymptomId] = useState('')
  const [compareId, setCompareId] = useState('')
  const [referenceId, setReferenceId] = useState('')
  const [note, setNote] = useState('')
  const [query, setQuery] = useState('')
  const [dictionaryChoice, setDictionaryChoice] = useState(false)

  // The feel dictionary turns familiar words into more specific symptoms.
  const hits = useMemo(() => {
    const q = query.trim()
    if (!q || !template) return []
    return template.feelDictionary.filter((f) => f.phrase.includes(q) || q.includes(f.phrase) || f.term.includes(q)).slice(0, 6)
  }, [query, template])

  if (!project || !template) return null
  const isFreeScene = template.id === 'free-scene'
  const isVideo = isFreeScene && project.freeform?.mode === 'video'
  const isImage = isFreeScene && project.freeform?.mode === 'image'
  const category = template.diagnosis.find((c) => c.id === categoryId)
  const symptom = category?.symptoms.find((s) => s.id === symptomId)
  const finalTarget = target === '__custom' ? customTarget.trim() : target
  const finalTargetEn = target === '__custom' ? customTarget.trim() : (template.targets.find((t) => t.ko === target)?.en ?? target)
  const draft = { target: finalTarget, targetEn: finalTargetEn, categoryId, symptomId, compareId: compareId || undefined, referenceId: referenceId || undefined, note, region }
  const en = symptom ? assembleFix(template, project, draft, 'en') : ''
  const ko = symptom ? assembleFix(template, project, draft, 'ko') : ''

  const pickSymptom = (sid: string) => {
    const cat = template.diagnosis.find((c) => c.symptoms.some((s) => s.id === sid))
    if (!cat) return
    setCategoryId(cat.id)
    setSymptomId(sid)
    setDictionaryChoice(!finalTarget)
    setStep(finalTarget ? 'compare' : 'where')
  }

  const save = () => {
    if (!symptom) return
    updateProject((p) => ({
      ...p,
      iterations: [
        ...p.iterations,
        { id: uid(), createdAt: Date.now(), screenshot: shot, region, target: finalTarget, targetEn: finalTargetEn, categoryId, symptomId, compareId: compareId || undefined, referenceId: referenceId || undefined, note: note.trim() || undefined, promptEn: en, promptKo: ko },
      ],
    }))
    toast('기록에 저장했어요. 결과가 나오면 별점을 남겨 주세요.')
    setStep('shot')
    setShot(undefined)
    setRegion(undefined)
    setTarget('')
    setCategoryId('')
    setSymptomId('')
    setCompareId('')
    setNote('')
    onSaved()
  }

  const stepIndex = STEPS.findIndex((s) => s.id === step)

  return (
    <div className="stack">
      <ol className="steps" aria-label="수정 프롬프트 만들기 단계">
        {STEPS.map((s, i) => (
          <li key={s.id} className={s.id === step ? 'on' : i < stepIndex ? 'done' : ''} aria-current={s.id === step ? 'step' : undefined}>
            <span className="step-number" aria-hidden="true">{i + 1}</span>
            <span className="step-label">{s.label}</span>
            {i < stepIndex && <span className="sr-only"> · 지난 단계</span>}
          </li>
        ))}
      </ol>

      {step === 'shot' && (
        <section className="card stack">
          <h2>{isVideo ? '영상의 대표 프레임을 올려 주세요' : isImage ? '결과 이미지를 올려 주세요' : '결과 화면을 올려 주세요'}</h2>
          <p className="small muted">{isVideo ? '고칠 순간을 캡처한 이미지 한 장을 올려 주세요. 움직임은 이 이미지로 알 수 없으니, 뒤의 메모에 시간대와 달라져야 할 동작을 적어 주세요. 이미지 없이도 시작할 수 있어요.' : '이미지를 올리면 고칠 부분을 직접 표시할 수 있어요. 이미지 없이도 시작할 수 있습니다.'}</p>
          <label className="upload">
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (!f) return
                try {
                  setShot(await loadImage(f, 1600))
                  setRegion(undefined)
                  setStep('where')
                } catch (err) {
                  toast((err as Error).message)
                }
                e.target.value = ''
              }}
            />
            <span>{isVideo ? '+ 대표 프레임 이미지 선택' : isImage ? '+ 결과 이미지 선택' : '+ 스크린샷 선택'}</span>
          </label>
          <div className="row step-actions">
            <button className="secondary" onClick={() => setStep('where')}>
              이미지 없이 시작하기
            </button>
          </div>
          <details className="feel-dictionary">
            <summary>무엇이 어색한지 말로 찾고 싶다면</summary>
            <div className="stack">
              <label className="stack">
                <span className="small muted">느낌 사전</span>
                <input type="search" placeholder={isFreeScene ? '예: 복잡해요 / 분위기가 달라요' : '예: 플라스틱 같아요 / 밋밋해요'} value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
              {hits.length > 0 && (
                <div className="stack" aria-live="polite">
                  {hits.map((h) => (
                    <div key={h.phrase} className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="small">
                        "{h.phrase}" → <b>{h.term}</b>
                      </span>
                      <div className="row">
                        {h.symptoms.map((sid) => {
                          const s = template.diagnosis.flatMap((c) => c.symptoms).find((x) => x.id === sid)
                          return s ? (
                            <button key={sid} className="secondary" onClick={() => pickSymptom(sid)}>
                              {s.label}
                            </button>
                          ) : null
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {query.trim() && hits.length === 0 && <p className="small muted" role="status">맞는 표현이 없어요. 다른 말로 검색하거나, 이미지 없이 시작해 하나씩 골라 보세요.</p>}
            </div>
          </details>
        </section>
      )}

      {step === 'where' && (
        <section className="card stack">
          <h2>어디가 어색한가요?</h2>
          {shot ? (
            <>
              <p className="small muted">사진 위에 손가락이나 마우스로 네모를 그려 주세요. 화면 전체가 문제라면 그리지 않고 넘어가도 돼요.</p>
              <RegionPicker src={shot} region={region} onChange={setRegion} />
            </>
          ) : null}
          <p className="small muted" id="coach-target-label">고칠 대상을 하나 골라 주세요.</p>
          <div className="choices" role="group" aria-labelledby="coach-target-label">
            {template.targets.map((t) => (
              <button key={t.ko} className={`choice ${target === t.ko ? 'on' : ''}`} aria-pressed={target === t.ko} onClick={() => setTarget(t.ko)}>
                {t.ko}
              </button>
            ))}
            <button className={`choice ${target === '__custom' ? 'on' : ''}`} aria-pressed={target === '__custom'} onClick={() => setTarget('__custom')}>
              직접 쓰기
            </button>
          </div>
          {target === '__custom' && (
            <label className="stack">
              <span className="small muted">고칠 대상</span>
              <input type="text" placeholder={isVideo ? '예: 00:03에 등장하는 인물의 손' : isFreeScene ? '예: 화면 오른쪽의 주요 대상' : '예: 왼쪽 위 바위'} value={customTarget} onChange={(e) => setCustomTarget(e.target.value)} />
            </label>
          )}
          <div className="row step-actions">
            <button className="secondary" onClick={() => setStep('shot')}>
              뒤로
            </button>
            <button
              className="primary"
              disabled={!finalTarget}
              onClick={() => {
                setStep(dictionaryChoice ? 'compare' : 'what')
                setDictionaryChoice(false)
              }}
            >
              다음
            </button>
          </div>
        </section>
      )}

      {step === 'what' && (
        <section className="card stack">
          <h2>무엇이 문제인가요?</h2>
          <p className="small muted">먼저 고칠 문제를 하나 골라 주세요. 한 번에 하나씩 요청하면 바뀐 결과를 비교하기 쉬워요.</p>
          <div className="symptom-list category-grid">
            {template.diagnosis.map((c) => (
              <button
                key={c.id}
                className={`choice big ${categoryId === c.id ? 'on' : ''}`}
                aria-pressed={categoryId === c.id}
                onClick={() => {
                  setCategoryId(c.id)
                  setSymptomId('')
                  setStep('how')
                }}
              >
                {c.label}
                {c.hint ? <span className="hint">{c.hint}</span> : null}
              </button>
            ))}
          </div>
          <div className="row step-actions">
            <button className="secondary" onClick={() => setStep('where')}>
              뒤로
            </button>
          </div>
        </section>
      )}

      {step === 'how' && category && (
        <section className="card stack">
          <h2>{category.label}: 어떻게 이상한가요?</h2>
          <div className="symptom-list">
            {category.symptoms.map((s) => (
              <SymptomButton key={s.id} s={s} on={symptomId === s.id} onPick={() => setSymptomId(s.id)} />
            ))}
          </div>
          <div className="row step-actions">
            <button className="secondary" onClick={() => setStep('what')}>
              뒤로
            </button>
            <button className="primary" disabled={!symptomId} onClick={() => setStep('compare')}>
              다음
            </button>
          </div>
        </section>
      )}

      {step === 'compare' && (
        <section className="card stack">
          <h2>참고 이미지와 비교하면 어떤가요?</h2>
          <p className="small muted">{isVideo ? '참고 이미지로 비교할 수 있는 구도·색·형태를 고르세요. 움직임이나 타이밍의 차이는 아래 메모에 적어 주세요.' : '참고 이미지와 다른 점을 더할 수 있어요. 선택하지 않아도 다음으로 넘어갈 수 있습니다.'}</p>
          {project.references.length > 0 ? (
            <>
              <div className="choices">
                {project.references.map((r, i) => (
                  <button key={r.id} className={`choice ${referenceId === r.id ? 'on' : ''}`} aria-label={`참고 이미지 ${i + 1}`} aria-pressed={referenceId === r.id} onClick={() => setReferenceId(referenceId === r.id ? '' : r.id)} style={{ padding: 4 }}>
                    <img src={r.dataUrl} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, display: 'block' }} />
                    <span className="small">#{i + 1}</span>
                  </button>
                ))}
              </div>
              <p className="small muted">참고와 가장 다른 점을 하나만 고르면:</p>
              <div className="choices">
                {template.compareAxes.map((a) => (
                  <button key={a.id} className={`choice ${compareId === a.id ? 'on' : ''}`} aria-pressed={compareId === a.id} onClick={() => setCompareId(compareId === a.id ? '' : a.id)}>
                    {a.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="small muted">참고 이미지가 없어요. "참고 이미지"에서 추가하면 여기서 비교할 수 있어요.</p>
          )}
          <label className="stack" style={{ gap: 6 }}>
            <span className="small muted">{isVideo ? '시간대와 바꿀 동작 (선택). 언제 어떤 모습이 되는지 적어 주세요.' : '덧붙일 말 (선택). 구체적인 수치나 예시가 있으면 적어 주세요.'}</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={isVideo ? '예: 00:03~00:05에 손이 갑자기 튀어요. 같은 경로를 따라 서서히 올라가게 해 주세요.' : isFreeScene ? '예: 주요 대상은 유지하고, 오른쪽 여백을 화면 너비의 1/3 정도로 늘려 주세요.' : '예: 바위 높이는 지금의 절반 정도면 좋겠어'} />
          </label>
          <div className="row step-actions">
            <button className="secondary" onClick={() => setStep('how')}>
              뒤로
            </button>
            <button className="primary" onClick={() => setStep('result')}>프롬프트 만들기</button>
          </div>
        </section>
      )}

      {step === 'result' && symptom && (
        <section className="stack">
          <div className="note">
            "{finalTarget} 쪽이 이상해요"라는 한마디가 아래 문장으로 바뀌었어요. <b>어디가 · 무엇이 · 어떻게 바꿀지 · 바꾸지 말 것 · 확인 방법</b>, 이 다섯 가지가 다 들어 있는 게 핵심이에요.
          </div>
          {symptom.why ? (
            <div className="why">
              <b>왜 이렇게 되는 걸까요?</b> {symptom.why}
            </div>
          ) : null}
          {isFreeScene && <p className="small muted">{isVideo ? '대표 프레임과 참고 이미지는 복사한 글에 포함되지 않아요. 사용할 AI에 함께 첨부하고, 영상 업로드를 지원하면 문제가 있는 원본 영상도 전달해 주세요.' : '결과 이미지와 참고 이미지는 복사한 글에 포함되지 않아요. 사용할 AI에 함께 첨부해 주세요.'}</p>}
          <PromptBox en={en} ko={ko} filename={`${project.name}-fix-${project.iterations.length + 1}.txt`} initialLang={isFreeScene ? 'ko' : 'en'} />
          <div className="row step-actions">
            <button className="secondary" onClick={() => setStep('compare')}>
              뒤로
            </button>
            <button className="primary" onClick={save}>기록에 저장</button>
          </div>
        </section>
      )}
    </div>
  )
}

function SymptomButton({ s, on, onPick }: { s: Symptom; on: boolean; onPick: () => void }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <button className={`choice big ${on ? 'on' : ''}`} aria-pressed={on} onClick={onPick}>
        {s.label}
        {s.hint ? <span className="hint">{s.hint}</span> : null}
      </button>
      {on && s.examples?.length ? (
        <div className="examples">
          {s.examples.map((e, i) => (
            <figure key={i} style={{ margin: 0 }}>
              <img src={`${import.meta.env.BASE_URL}${e.src.replace(/^\//, '')}`} alt={e.caption} />
              <figcaption className="small muted">{e.caption}</figcaption>
            </figure>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Draw a rectangle on the screenshot with mouse or finger; the region is stored normalised 0..1. */
function RegionPicker({ src, region, onChange }: { src: string; region?: Region; onChange: (r: Region | undefined) => void }) {
  const wrap = useRef<HTMLDivElement>(null)
  const img = useRef<HTMLImageElement>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const [box, setBox] = useState<Region | undefined>(region)
  useEffect(() => {
    setBox(region)
  }, [region])

  // normalise against the image's drawn rectangle (object-fit: contain leaves bars)
  const toImage = (clientX: number, clientY: number) => {
    const el = img.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    const ratio = el.naturalWidth / el.naturalHeight
    const boxRatio = r.width / r.height
    let w = r.width
    let h = r.height
    let ox = r.left
    let oy = r.top
    if (ratio > boxRatio) {
      h = r.width / ratio
      oy = r.top + (r.height - h) / 2
    } else {
      w = r.height * ratio
      ox = r.left + (r.width - w) / 2
    }
    return { x: Math.min(1, Math.max(0, (clientX - ox) / w)), y: Math.min(1, Math.max(0, (clientY - oy) / h)), ox: ox - r.left, oy: oy - r.top, w, h }
  }
  const [frame, setFrame] = useState<{ ox: number; oy: number; w: number; h: number } | null>(null)
  const onDown = (e: React.PointerEvent) => {
    const p = toImage(e.clientX, e.clientY)
    if (!p) return
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    start.current = { x: p.x, y: p.y }
    setFrame({ ox: p.ox, oy: p.oy, w: p.w, h: p.h })
    setBox({ x: p.x, y: p.y, w: 0, h: 0 })
  }
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return
    const p = toImage(e.clientX, e.clientY)
    if (!p) return
    setBox({ x: Math.min(start.current.x, p.x), y: Math.min(start.current.y, p.y), w: Math.abs(p.x - start.current.x), h: Math.abs(p.y - start.current.y) })
  }
  const onUp = () => {
    if (!start.current) return
    start.current = null
    if (box && box.w > 0.02 && box.h > 0.02) onChange(box)
    else {
      setBox(undefined)
      onChange(undefined)
    }
  }
  const f = frame
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div ref={wrap} className="region-wrap" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <img ref={img} src={src} alt="결과 스크린샷" draggable={false} onLoad={(e) => {
          const p = toImage(0, 0)
          if (p) setFrame({ ox: p.ox, oy: p.oy, w: p.w, h: p.h })
          void e
        }} />
        {box && f ? <div className="region-box" style={{ left: f.ox + box.x * f.w, top: f.oy + box.y * f.h, width: box.w * f.w, height: box.h * f.h }} /> : null}
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="small muted">{box && box.w > 0.02 ? '표시했어요. 다시 그리면 바뀌어요.' : '표시 안 함 (화면 전체)'}</span>
        {box ? (
          <button className="ghost" onClick={() => { setBox(undefined); onChange(undefined) }}>
            표시 지우기
          </button>
        ) : null}
      </div>
    </div>
  )
}
