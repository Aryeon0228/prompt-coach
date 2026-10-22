import '../image-chat-guide.css'

/** The connected AI owns the image conversation; the website remains a separate notebook. */
export function ImageChatGuide() {
  return <section className="image-chat-guide" aria-label="연결한 AI에서 이미지 코칭 시작">
    <div><span className="eyebrow">MCP를 연결했다면</span><h3>이미지를 첨부하고, 같은 AI 대화에서 끝까지</h3></div>
    <p>아래 두 단계로 시작하세요. AI별로 Prompt Coach를 선택하는 방법은 아래 안내를 펼쳐 확인할 수 있어요.</p>
    <div className="image-chat-direct">
    <h4>채팅에 직접 요청하기</h4>
    <ol aria-label="채팅에 직접 요청하는 순서">
      <li>Prompt Coach를 켠 ChatGPT·Claude 대화에 <strong>참고 이미지 파일을 첨부</strong>하세요.</li>
      <li><strong>“이 이미지로 프롬프트 코칭 시작해줘”</strong>라고 보내세요.</li>
    </ol>
    </div>
    <p>AI가 원본을 프롬프트로 읽고, 유지할 특징과 바꿀 부분을 하나씩 물어봐요. 질문·답변부터 완성까지 그 대화에서 이어가면 됩니다.</p>
    <div className="image-chat-links"><a href="https://chatgpt.com/" target="_blank" rel="noreferrer">ChatGPT 열기 ↗</a><a href="https://claude.ai/new" target="_blank" rel="noreferrer">Claude 열기 ↗</a></div>
    <details aria-label="ChatGPT 이미지 코칭 안내">
      <summary><span className="image-chat-provider-heading"><strong>ChatGPT · 플러그인 선택 후 시작</strong><span>새 대화에서 Prompt Coach를 선택하고 이미지와 요청문을 보내요.</span></span></summary>
      <div className="image-chat-provider-body">
        <ol aria-label="ChatGPT에서 이미지 코칭을 시작하는 순서">
          <li>새 대화의 입력칸에 <strong>@</strong>를 입력하고, 설치한 <strong>Prompt Coach</strong>를 선택하세요.</li>
          <li>입력칸의 <strong>+ → 사진 및 파일 추가</strong>에서 <strong>참고 이미지 파일을 첨부</strong>하세요.</li>
          <li><strong>“이 이미지로 프롬프트 코칭 시작해줘”</strong>라고 적고 이미지와 함께 보내세요.</li>
        </ol>
        <p>그 대화에서 원본 읽기 → 유지·변경 질문 → 프롬프트 완성으로 이어가면 됩니다. 선택지가 나오면 고르거나, 평소 쓰는 채팅 입력칸에 답하세요.</p>
        <p className="image-chat-note">목록에 Prompt Coach가 없다면 위의 ‘AI 연결 방법 및 도움말’에서 ChatGPT 연결을 먼저 완료하세요. 연결 직후에는 플러그인 상세의 ‘채팅에서 사용해 보기’로도 시작할 수 있어요. 계정에 따라 메뉴 이름이나 위치는 다를 수 있습니다.</p>
      </div>
    </details>
    <details aria-label="Claude 이미지 코칭 메뉴 안내">
      <summary><span className="image-chat-provider-heading"><strong>Claude · 메뉴로 같은 코칭 시작하기</strong><span>위 요청 문장을 직접 쓰는 대신, 준비된 시작 요청문을 추가해요. 두 방법 중 하나만 사용하면 돼요.</span></span></summary>
      <div className="image-chat-provider-body">
        <ol aria-label="Claude 메뉴로 시작하는 순서">
          <li>대화 입력칸의 <strong>+ → 커넥터 → Prompt Coach에서 추가</strong>를 열어요.</li>
          <li><strong>‘이미지로 시작하기 — 원본 읽기·유지·변경’</strong>을 선택하세요.</li>
          <li>입력칸에 시작 요청문 카드가 붙으면 <strong>참고 이미지 파일도 첨부</strong>하세요. 이 카드는 AI에게 코칭 순서를 알려주는 글이에요.</li>
          <li><strong>요청문 카드와 이미지를 함께 보내세요.</strong> 위의 요청 문장을 다시 적을 필요는 없어요.</li>
        </ol>
        <p>메뉴를 선택해도 별도 화면으로 이동하지 않아요. 메시지를 보내면 같은 AI 대화에서 원본을 읽고, 유지할 특징과 바꿀 부분을 물어봐요.</p>
        <p className="image-chat-note">Claude에서 이 메뉴가 보이지 않으면 위의 ‘채팅에 직접 요청하기’로 시작하세요.</p>
      </div>
    </details>
    <p className="image-chat-note">웹으로 돌아와 질문·답변을 복사할 필요 없어요. 웹에 올린 이미지나 프로젝트가 AI 대화로 자동 전송·동기화되지는 않습니다.</p>
  </section>
}
