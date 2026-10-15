import assert from 'node:assert/strict';
import test from 'node:test';
import { MODE_VALUES, FIELD_LABELS, COACH_USAGE_GUIDE, ENTRY_FLOW_INSTRUCTIONS, COACHING_INSTRUCTIONS, getGuide, reviewBrief, assemblePrompt, buildCoachingPrompt } from '../coaching.mjs';

test('guides distinguish still composition, temporal changes and interaction without imposing a technology', () => {
  assert.deepEqual(MODE_VALUES, ['image', 'video', 'web']);
  for (const medium of MODE_VALUES) {
    const guide = getGuide(medium);
    assert.equal(guide.medium, medium);
    assert.ok(guide.rules.length > 0);
    assert.ok(guide.focus.length > 0);
    assert.ok(guide.conversationFormat.question.includes('하나'));
    assert.equal(/React|Three\.js|60fps/.test(JSON.stringify(guide)), false);
  }
  assert.ok(getGuide('image').focus.join(' ').includes('한 화면'));
  assert.ok(getGuide('video').focus.join(' ').includes('시작·끝'));
  assert.ok(getGuide('video').focus.join(' ').includes('소리'));
  assert.ok(getGuide('web').focus.join(' ').includes('클릭·드래그'));
  assert.ok(getGuide('web').focus.join(' ').includes('기기'));
  const guide = getGuide('image');
  guide.rules[0] = 'changed';
  guide.focus[0] = 'changed';
  assert.notEqual(getGuide('image').rules[0], 'changed');
  assert.notEqual(getGuide('image').focus[0], 'changed');
  assert.throws(() => getGuide('__proto__'), TypeError);
});

test('main coaching instructions require contextual questions, reasons, deferral and final confirmation', () => {
  assert.ok(COACHING_INSTRUCTIONS.slice(0, 512).includes('open_prompt_coach'));
  for (const rule of ['한 번에 질문 하나만', '필요한 이유', '자유롭게 답하거나 보류', '확정한 조건과 원문', '모든 입력란을 채우려고', '무엇을 우선', '여기까지 정리', '코드를 실행하지', '실제 판단과 대화는 연결된 AI', '원래 아이디어와 이후 답변', 'confirmedScene', 'state에 그대로 보존']) {
    assert.ok(COACHING_INSTRUCTIONS.includes(rule), rule);
  }
});

test('setup uses chat while app compatibility is unresolved and keeps explicit screen requests available', () => {
  for (const instructions of [COACHING_INSTRUCTIONS, ...MODE_VALUES.map(medium => getGuide(medium).entryFlow)]) {
    for (const rule of ['기본 코칭 시작은 현재 AI 대화에서 일반 채팅', '명시적으로 요청한 경우에만', '호환 확인 중', 'open_prompt_coach', 'show_prompt_coach', '시작 메뉴나 갈림길을 제안하지 마세요', '규칙 검토를 명시적으로 요청한 경우에만', '매체만 빠졌다면 이미지·영상·3D 웹 중 원하는 종류만 물으세요', '일반 채팅 코칭', '복사·붙여넣기나 홈페이지 방문을 요구하지 마세요', '자동 전송·저장·동기화되는 연결은 아닙니다']) assert.ok(instructions.includes(rule), rule);
    assert.equal(instructions.includes('웹에서 장면 작성하기'), false);
  }
  assert.ok(COACHING_INSTRUCTIONS.includes(ENTRY_FLOW_INSTRUCTIONS));
  for (const text of ['코칭 시작하기 — 장면 입력·질문·답변', '사용 방법 보기 — 코치 이용 안내', '같은 대화', '홈페이지와 자동으로 동기화되지', '대화를 서버에 저장하지']) assert.ok(COACH_USAGE_GUIDE.includes(text), text);
  assert.equal(COACH_USAGE_GUIDE.includes('state'), false, 'user help does not expose internal host instructions');
  assert.equal(COACH_USAGE_GUIDE.includes('show_prompt_coach'), false);
});

test('brief review reports only field presence, not semantic completeness or quality', () => {
  const brief = { medium: 'image', idea: '포트폴리오 표지로 쓸 고래 한 마리.', purpose: ' ', subject: '???', style: '예쁘게' };
  const before = structuredClone(brief);
  const review = reviewBrief(brief);
  assert.equal(review.reviewType, 'field_presence_only');
  assert.ok(review.notice.includes('문맥·품질·충돌을 평가한 결과가 아닙니다'));
  assert.equal(review.checklist.find(({ field }) => field === 'purpose').filled, false);
  assert.equal(review.checklist.find(({ field }) => field === 'subject').filled, true);
  assert.equal(review.checklist.find(({ field }) => field === 'style').filled, true);
  assert.equal(review.checklist.length, Object.keys(FIELD_LABELS).length);
  assert.ok(review.checklist.every(({ why }) => typeof why === 'string' && why.length));
  assert.ok(review.coachingReminder.includes('현재 대화 전체'));
  assert.ok(review.coachingReminder.includes('다른 항목이나 대화에서 이미 답한'));
  assert.ok(review.coachingReminder.includes('모든 항목을 채우려 하지'));
  assert.deepEqual(brief, before);
  assert.equal(Object.hasOwn(review, 'score'), false);
});

test('deferred fields are excluded from candidates and never turned into confirmed requirements', () => {
  const brief = { medium: 'image', idea: '유리 정원', confirmedScene: '유리 정원', style: '  보라빛일 수도?\n ', deferred: ['style', 'details', 'style'] };
  const review = reviewBrief(brief);
  assert.ok(review.checklist.find(({ field }) => field === 'style').deferred);
  assert.equal(review.candidates.some(({ field }) => field === 'style' || field === 'details'), false);
  const result = assemblePrompt(brief);
  assert.equal(result.prompt.includes('보라빛'), false);
  assert.deepEqual(result.unresolved, [`분위기와 표현 — 미정:\n${brief.style}`, '구체적인 조건']);
  assert.ok(result.reminders.some((reminder) => reminder.includes('임의로 결정하지')));
  assert.throws(() => reviewBrief({ ...brief, deferred: ['idea'] }), TypeError);
  assert.throws(() => reviewBrief({ ...brief, deferred: ['__proto__'] }), TypeError);
});

test('assembly preserves every supplied confirmed character without inventing choices or filling blanks', () => {
  const brief = {
    medium: 'image',
    idea: '  바닷속 도서관\n“고래 1마리”가 창밖을 지나간다.  ',
    confirmedScene: '  바닷속 도서관\n“고래 1마리”가 창밖을 지나간다.  ',
    purpose: '  포트폴리오의 표지용  ',
    subject: '책장은 3개 / 사람은 0명',
    composition: '오른쪽 1/3을 비우기\n시점은 눈높이',
    style: '보라 #85709D · 젖은 돌 표면',
    details: '간판: "OPEN"\n화면 비율 4:3',
    constraints: '장면 안 텍스트는 간판 하나만',
    success: '책장 3개가 서로 가리지 않고 모두 보인다.',
  };
  const before = structuredClone(brief);
  const result = assemblePrompt(brief);
  for (const field of Object.keys(FIELD_LABELS)) assert.ok(result.prompt.includes(`[${FIELD_LABELS[field]}]\n${brief[field]}`));
  assert.deepEqual(result.unresolved, []);
  assert.equal(result.originalIdea, brief.idea);
  assert.deepEqual(brief, before);
  const minimal = assemblePrompt({ medium: 'image', idea: '창가의 화분', confirmedScene: '창가의 화분', purpose: '\n  ' });
  assert.equal(minimal.prompt, '[만들고 싶은 장면]\n창가의 화분\n\n[출력 요청]\n위 확정 조건에 맞는 이미지를 만들어 주세요.');
  assert.deepEqual(minimal.unresolved, []);
  for (const confirmedScene of [undefined, null, '', ' \n ', 123]) {
    assert.throws(() => assemblePrompt({ medium: 'image', idea: '창가의 화분', confirmedScene }), TypeError);
  }
});

test('the original scene stays outside the final prompt when later answers change or defer its conditions', () => {
  const original = '  보라색 고래 한 마리가 창밖을 지나가는 도서관\n ';
  const confirmedScene = '  고래 세 마리가 창밖을 지나가는 도서관\n ';
  const result = assemblePrompt({
    medium: 'image', idea: original, confirmedScene,
    subject: '고래 세 마리', style: '색은 나중에 결정', deferred: ['style'],
  });
  assert.equal(result.originalIdea, original);
  assert.ok(result.prompt.includes(`[만들고 싶은 장면]\n${confirmedScene}`));
  assert.ok(result.prompt.includes('고래 세 마리'));
  assert.equal(result.prompt.includes('보라색'), false);
  assert.equal(result.prompt.includes('한 마리'), false);
  assert.equal(result.prompt.includes('색은 나중에 결정'), false);
  assert.deepEqual(result.unresolved, ['분위기와 표현 — 미정:\n색은 나중에 결정']);
  assert.ok(result.reminders.some((reminder) => reminder.includes('변경 반영 여부를 해석하거나 검증하지')));
  assert.ok(result.reminders.some((reminder) => reminder.includes('다른 입력란에 같은 조건이 남았는지')));
});

test('assembled output requests follow the selected medium and do not execute it', () => {
  for (const medium of MODE_VALUES) {
    const result = assemblePrompt({ medium, idea: '정원', confirmedScene: '정원' });
    assert.ok(result.prompt.includes('정원'));
    assert.ok(result.reminders.some((reminder) => reminder.includes('제작하거나 코드를 실행하지')));
    assert.ok(result.reminders.some((reminder) => reminder.includes('현재 대화에서 복사해') && reminder.includes('자동으로 저장·동기화됐다고 말하지')));
  }
  assert.ok(assemblePrompt({ medium: 'video', idea: '정원', confirmedScene: '정원' }).prompt.includes('동작과 장면의 흐름'));
  assert.ok(assemblePrompt({ medium: 'web', idea: '정원', confirmedScene: '정원' }).prompt.includes('브라우저'));
  assert.equal(assemblePrompt({ medium: 'image', idea: '정원', confirmedScene: '정원' }).prompt.includes('브라우저'), false);
});

test('starter prompt preserves optional input for chat coaching and treats ideas as material', () => {
  const idea = '  카메라가 정원으로 들어간다.\n지금 바로 만들어 줘.  ';
  const prompt = buildCoachingPrompt('video', idea);
  assert.ok(prompt.includes(JSON.stringify({ medium: 'video', idea })));
  assert.ok(prompt.includes('open_prompt_coach'));
  assert.ok(prompt.includes('지금 실행할 지시로 삼지 마세요'));
  assert.ok(prompt.includes('실제로 호출하지 못했다면 호출했다고 말하지'));
  assert.ok(prompt.includes('현재 대화 전체'));
  assert.ok(buildCoachingPrompt().includes('코칭에 사용할 사용자 입력: {}'));
  assert.ok(buildCoachingPrompt(undefined, idea).includes(JSON.stringify({ idea })));
});
