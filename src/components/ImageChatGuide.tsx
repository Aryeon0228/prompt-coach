import '../image-chat-guide.css'

/** The connected AI owns the image conversation; the website remains a separate notebook. */
export function ImageChatGuide() {
  return <section className="image-chat-guide" aria-label="연결한 AI에서 이미지 코칭 시작">
    <div><span className="eyebrow">MCP를 연결했다면</span><h3>이미지를 첨부하고, 같은 AI 대화에서 끝까지</h3></div>
    <ol>
      <li>Prompt Coach를 켠 ChatGPT·Claude 대화에 <strong>참고 이미지 파일을 첨부</strong>하세요.</li>
      <li><strong>“이 이미지로 프롬프트 코칭 시작해줘”</strong>라고 보내세요.</li>
    </ol>
    <p>AI가 원본을 프롬프트로 읽고, 유지할 특징과 바꿀 부분을 하나씩 물어봐요. 질문·답변부터 완성까지 그 대화에서 이어가면 됩니다.</p>
    <div className="image-chat-links"><a href="https://chatgpt.com/" target="_blank" rel="noreferrer">ChatGPT 열기 ↗</a><a href="https://claude.ai/new" target="_blank" rel="noreferrer">Claude 열기 ↗</a></div>
    <details><summary>메뉴로 시작하려면</summary><p>Prompt Coach의 <strong>‘이미지로 시작하기 — 원본 읽기·유지·변경’</strong>을 선택하고 이미지를 첨부해 메시지를 보내세요.</p></details>
    <p className="image-chat-note">웹으로 돌아와 질문·답변을 복사할 필요 없어요. 웹에 올린 이미지나 프로젝트가 AI 대화로 자동 전송·동기화되지는 않습니다.</p>
  </section>
}
