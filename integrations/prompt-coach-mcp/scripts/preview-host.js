import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge'

const status = document.querySelector('#status')
const cards = document.querySelector('#cards')
const tool = async (name, args = {}) => {
  const response = await fetch('/tool', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, arguments: args }) })
  if (!response.ok) throw new Error('로컬 도구 테스트 실패')
  return response.json()
}
async function mount(result) {
  const frame = document.createElement('iframe')
  frame.title = '프롬프트 코치 테스트 화면'
  frame.setAttribute('sandbox', 'allow-scripts allow-downloads')
  frame.style.cssText = 'display:block;width:100%;height:720px;border:1px solid #444;border-radius:18px;background:#111;margin:20px 0;'
  cards.append(frame)
  const bridge = new AppBridge(null, { name: 'Prompt Coach local test host', version: '1.0.0' }, { serverTools: {}, message: { text: {} }, updateModelContext: { text: {} }, downloadFile: {} }, { hostContext: { theme: 'dark', displayMode: 'inline', containerDimensions: { maxHeight: 900 } } })
  bridge.oncalltool = ({ name, arguments: args }) => tool(name, args)
  let latestContext = ''
  bridge.onupdatemodelcontext = async ({ content }) => {
    latestContext = (content ?? []).filter(x => x.type === 'text').map(x => x.text).join('\n')
    return {}
  }
  bridge.onmessage = async ({ content }) => {
    if (document.querySelector('#reject').checked) return { isError: true }
    const text = content.filter(x => x.type === 'text').map(x => x.text).join('\n') + '\n' + latestContext
    const state = text.match(/pc1\.[A-Za-z0-9_-]+/)?.[0]
    if (!state) throw new Error('이어갈 상태가 메시지에 없어요.')
    // Fixed fixtures verify the UI/transport only. No AI is called by this test host.
    setTimeout(async () => {
      try {
        const response = await fetch('/simulate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state }) })
        const next = await response.json()
        if (next.isError) throw new Error(next.content?.[0]?.text ?? 'Test response rejected')
        await mount(next)
        status.textContent = '고정 테스트 응답을 새 카드로 표시했어요. 실제 AI 답변이 아닙니다.'
      } catch (error) { status.textContent = error.message }
    }, 120)
    return {}
  }
  bridge.ondownloadfile = async ({ contents }) => {
    for (let item of contents) {
      item = item.resource ?? item
      const bytes = item.blob ? Uint8Array.from(atob(item.blob), c => c.charCodeAt(0)) : new TextEncoder().encode(item.text ?? '')
      const url = URL.createObjectURL(new Blob([bytes], { type: item.mimeType ?? 'text/plain' }))
      const a = document.createElement('a'); a.href = url; a.download = item.name ?? 'prompt-coach-export.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000)
    }
    return {}
  }
  bridge.onsizechange = ({ height }) => { if (height) frame.style.height = `${Math.min(Math.max(height, 300), 1100)}px` }
  bridge.oninitialized = async () => { await bridge.sendToolInput({ arguments: {} }); await bridge.sendToolResult(result) }
  await bridge.connect(new PostMessageTransport(frame.contentWindow, frame.contentWindow))
  frame.src = '/widget.html'
  frame.scrollIntoView({ block: 'start', behavior: 'smooth' })
}
document.querySelector('#new').addEventListener('click', async () => { await mount(await tool('open_prompt_coach')) })
await mount(await tool('open_prompt_coach'))
