import '../image-chat-guide.css'

/** The connected AI owns the image conversation; the website remains a separate notebook. */
export function ImageChatGuide() {
  return <section className="image-chat-guide" aria-label="연결한 AI에서 이미지 코칭 시작">
    <div><span className="eyebrow">MCP를 연결했다면</span><h3>이미지를 첨부하고, 같은 AI 대화에서 끝까지</h3></div>
    <p>직접 요청하거나 메뉴를 선택하는 방법 중 <strong>하나만 사용하면 돼요.</strong> 두 방법 모두 원본 읽기 → 유지·변경 질문 → 프롬프트 완성으로 이어집니다.</p>
    <div className="image-chat-direct">
    <h4>채팅에 직접 요청하기</h4>
    <ol aria-label="채팅에 직접 요청하는 순서">
      <li>Prompt Coach를 켠 ChatGPT·Claude 대화에 <strong>참고 이미지 파일을 첨부</strong>하세요.</li>
      <li><strong>“이 이미지로 프롬프트 코칭 시작해줘”</strong>라고 보내세요.</li>
    </ol>
    </div>
    <p>AI가 원본을 프롬프트로 읽고, 유지할 특징과 바꿀 부분을 하나씩 물어봐요. 질문·답변부터 완성까지 그 대화에서 이어가면 됩니다.</p>
    <div className="image-chat-links"><a href="https://chatgpt.com/" target="_blank" rel="noreferrer">ChatGPT 열기 ↗</a><a href="https://claude.ai/new" target="_blank" rel="noreferrer">Claude 열기 ↗</a></div>
    <details>
      <summary><span className="image-chat-menu-heading"><strong>메뉴로 같은 코칭 시작하기</strong><span>위 요청 문장을 직접 쓰는 대신, 준비된 시작 요청문을 추가해요.</span></span></summary>
      <div className="image-chat-menu-body">
        <p><strong>Claude에서 메뉴로 시작하는 순서</strong></p>
        <ol aria-label="Claude 메뉴로 시작하는 순서">
          <li>대화 입력칸의 <strong>+ → 커넥터 → Prompt Coach에서 추가</strong>를 열어요.</li>
          <li><strong>‘이미지로 시작하기 — 원본 읽기·유지·변경’</strong>을 선택하세요.</li>
          <li>입력칸에 시작 요청문 카드가 붙으면 <strong>참고 이미지 파일도 첨부</strong>하세요. 이 카드는 AI에게 코칭 순서를 알려주는 글이에요.</li>
          <li><strong>요청문 카드와 이미지를 함께 보내세요.</strong> 위의 요청 문장을 다시 적을 필요는 없어요.</li>
        </ol>
        <p>메뉴를 선택해도 별도 화면으로 이동하지 않아요. 메시지를 보내면 같은 AI 대화에서 원본을 읽고, 유지할 특징과 바꿀 부분을 물어봐요.</p>
        <p className="image-chat-note">위 메뉴 경로는 Claude 기준이에요. 사용하는 AI에서 이 메뉴가 보이지 않으면 위의 ‘채팅에 직접 요청하기’로 시작하세요.</p>
      </div>
    </details>
    <p className="image-chat-note">웹으로 돌아와 질문·답변을 복사할 필요 없어요. 웹에 올린 이미지나 프로젝트가 AI 대화로 자동 전송·동기화되지는 않습니다.</p>
  </section>
}
