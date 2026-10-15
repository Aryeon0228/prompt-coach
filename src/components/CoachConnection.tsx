import { useEffect, useId, useRef, useState } from 'react'
import { buildMcpSetup, loadCoachConnection, type CoachConnectionConfig } from '../lib/mcp-connection'
import { copyText, useToast } from './ui'
import '../coach-connection.css'

const UNAVAILABLE: CoachConnectionConfig = { endpoint: null, availability: 'unavailable', updatedAt: null }

export function CoachConnection({ collapsed = false, hasScene = false }: { collapsed?: boolean; hasScene?: boolean }) {
  const id = useId()
  const toast = useToast()
  const [open, setOpen] = useState(!collapsed)
  const [provider, setProvider] = useState<'claude' | 'chatgpt'>('claude')
  const [config, setConfig] = useState<CoachConnectionConfig>(UNAVAILABLE)
  const [loading, setLoading] = useState(true)
  const [setupOpen, setSetupOpen] = useState(false)
  const [copying, setCopying] = useState<'address' | 'setup' | null>(null)
  const address = useRef<HTMLInputElement>(null)
  const setupBox = useRef<HTMLTextAreaElement>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    loadCoachConnection().then((next) => {
      if (alive.current) setConfig(next)
    }).catch(() => {
      if (alive.current) setConfig(UNAVAILABLE)
    }).finally(() => {
      if (alive.current) setLoading(false)
    })
    return () => { alive.current = false }
  }, [])

  const endpoint = config.availability === 'unavailable' ? null : config.endpoint
  const setupText = endpoint ? buildMcpSetup(endpoint) : ''
  const copy = async (kind: 'address' | 'setup') => {
    if (!endpoint || copying) return
    setCopying(kind)
    let copied = false
    try { copied = await copyText(kind === 'address' ? endpoint : setupText) } catch { /* Select the text below instead. */ }
    if (!alive.current) return
    setCopying(null)
    if (copied) {
      toast(kind === 'address' ? '연결 주소를 복사했어요. 선택한 AI의 서버 주소에 붙여 넣어 주세요.' : '연결 설정문을 복사했어요. Claude Code나 Codex 대화에 붙여 넣어 주세요.')
    } else {
      if (kind === 'setup') setSetupOpen(true)
      toast('자동 복사가 안 됐어요. 선택된 글을 직접 복사해 주세요.')
      requestAnimationFrame(() => {
        const field = kind === 'address' ? address.current : setupBox.current
        field?.focus()
        field?.select()
      })
    }
  }

  return (
    <details className="card coach-connection" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary><span className="coach-connection-heading"><span>내 AI에 프롬프트 코치 연결하기</span><span className="small muted">처음 한 번 · MCP 연결 안내</span></span></summary>
      <div className="stack coach-connection-body">
        <p className="muted">내 ChatGPT나 Claude에 코칭 도구를 추가해요. 장면은 이 웹에서 작성하고, 질문·답변은 내 AI에서 나눈 뒤 완성본을 웹으로 가져옵니다.</p>
        <div className="coach-connection-providers" role="group" aria-label="연결할 AI">
          <button type="button" className={provider === 'claude' ? 'on' : ''} aria-pressed={provider === 'claude'} onClick={() => setProvider('claude')}>Claude</button>
          <button type="button" className={provider === 'chatgpt' ? 'on' : ''} aria-pressed={provider === 'chatgpt'} onClick={() => setProvider('chatgpt')}>ChatGPT</button>
        </div>

        <div className="coach-connection-address">
          {endpoint ? <label htmlFor={`${id}-endpoint`}>프롬프트 코치 서버 주소</label> : <p className="coach-connection-address-label">프롬프트 코치 서버 주소</p>}
          {endpoint ? <>
            <div className="coach-connection-copy-row"><input ref={address} id={`${id}-endpoint`} type="text" readOnly value={endpoint} spellCheck={false} autoComplete="off" aria-describedby={`${id}-availability`} onFocus={(event) => event.currentTarget.select()} /><button type="button" className="secondary" onClick={() => copy('address')} disabled={copying !== null}>{copying === 'address' ? '복사 중…' : '주소 복사'}</button></div>
            <p className="small muted" id={`${id}-availability`}>{config.availability === 'temporary' ? '임시 연결 주소예요. 운영 중인 Mac과 서버가 켜져 있어야 하며, 다시 시작하면 주소가 바뀔 수 있어요.' : '연결 주소가 등록되어 있어요.'} 이 화면에서 서버 가동 여부나 내 계정의 연결 상태를 확인하지는 않아요.</p>
          </> : <p className="small muted" id={`${id}-availability`} role="status">{loading ? '연결 주소를 불러오는 중이에요…' : '지금은 공유 연결 주소를 제공할 수 없어요. 코칭 요청문을 내 AI에 붙여 넣으면 연결 없이도 대화를 이어갈 수 있어요.'}</p>}
        </div>

        <ol className="coach-connection-steps" aria-label={`${provider === 'claude' ? 'Claude' : 'ChatGPT'} 연결 순서`}>
          <li><strong>내 계정으로 로그인하기</strong><p>{provider === 'claude' ? 'Claude의 커넥터 설정을 열어요.' : 'ChatGPT의 플러그인 페이지를 열어요.'}</p><a href={provider === 'claude' ? 'https://claude.ai/customize/connectors' : 'https://chatgpt.com/plugins'} target="_blank" rel="noopener noreferrer" className="coach-connection-link" aria-label={`${provider === 'claude' ? 'Claude 커넥터' : 'ChatGPT 플러그인'} 열기 (새 탭)`}>{provider === 'claude' ? 'Claude 커넥터 열기' : 'ChatGPT 플러그인 열기'} <span aria-hidden="true">↗</span></a></li>
          <li><strong>프롬프트 코치 추가하기</strong><p>{provider === 'claude' ? '추가(+) → 사용자 지정 커넥터 추가를 눌러요. 이름은 “Prompt Coach”, 서버 URL은 복사한 주소로 입력하세요. “No sign in”을 선택한 뒤 추가하세요.' : '추가(+) → 사용자 지정 MCP 서버 추가를 눌러요. 이름은 “Prompt Coach”, 서버 URL은 복사한 주소로 입력하고, 인증은 “No authentication”을 선택하세요. 플러그인으로 만든 뒤 설치하세요.'}</p><p>프롬프트 코치용 계정이나 API 키는 필요 없어요.</p></li>
          <li><strong>대화에서 도구 켜기</strong><p>{provider === 'claude' ? '대화의 커넥터 목록에서 Prompt Coach를 켜세요.' : '새 대화에서 @로 Prompt Coach를 선택하세요.'} 도구 실행 허용이 표시되면 내용을 확인해 주세요.</p></li>
          <li><strong>{hasScene ? '아래 코칭 요청문 보내기' : '웹에서 장면 작성하기'}</strong><p>{hasScene ? '장면이 준비되어 있어요. 아래 “코칭 요청문 복사”를 누르고 내 AI 대화에 붙여 넣으면 바로 질문을 받을 수 있어요.' : '연결 설정을 마치면 이 웹으로 돌아와 만들 장면과 결과물을 적으세요. 작성한 코칭 요청문을 내 AI 대화에 붙여 넣으면 질문을 받을 수 있어요.'}</p>{!hasScene && <a className="coach-connection-link" href="#scene">장면 작성하기 <span aria-hidden="true">→</span></a>}</li>
        </ol>
        <p className="small muted coach-connection-account-note">본인 AI 계정의 이용 한도가 적용돼요. 계정이나 조직 설정에 따라 연결 메뉴가 없을 수 있어요. 그때도 코칭 요청문을 붙여 넣어 사용할 수 있습니다.</p>

        <details className="coach-connection-desktop" open={setupOpen} onToggle={(event) => setSetupOpen(event.currentTarget.open)}>
          <summary>Claude Code · Codex에서 자동 연결하기</summary>
          <div className="stack">
            <p className="small muted">아래 설정문을 이미 사용 중인 앱에 붙여 넣으면 AI가 연결을 진행해요. 장면을 전달하는 코칭 요청문은 웹에서 따로 복사합니다. 브라우저용 ChatGPT·Claude에서는 위의 연결 순서를 따라 주세요.</p>
            <div><button type="button" className="secondary" disabled={!endpoint || copying !== null} onClick={() => copy('setup')}>{copying === 'setup' ? '복사 중…' : '연결 설정문 복사'}</button></div>
            {endpoint && <label className="stack" htmlFor={`${id}-setup`}><span className="small muted">복사할 연결 설정문</span><textarea id={`${id}-setup`} ref={setupBox} readOnly value={setupText} rows={6} /></label>}
          </div>
        </details>
        <p className="small muted coach-connection-privacy">사이트의 프로젝트가 자동 전송되지는 않아요. AI 대화에 붙여 넣은 내용과, AI가 코칭 도구에 전달한 조건만 사용됩니다. 보내고 싶은 내용만 골라 전달하세요.</p>
      </div>
    </details>
  )
}
