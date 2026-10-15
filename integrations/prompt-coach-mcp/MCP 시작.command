#!/bin/zsh
set -eu
cd -- "$(dirname -- "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
# PROMPT_COACH_SITE_DIR가 지정된 경우에만 홈페이지 소스의 연결 설정도 갱신합니다.
# 설정 파일은 자동 배포하지 않습니다. 미지정 시 기존처럼 연결 서버만 실행합니다.
if ! command -v node >/dev/null; then
  print "Node.js 22 이상이 필요해요. https://nodejs.org/ 에서 설치 후 다시 열어 주세요."
  read -k 1
  exit 1
fi
if [[ ! -d node_modules/@modelcontextprotocol/sdk ]]; then
  npm ci --ignore-scripts
fi
npm run build:ui
print "개발용 임시 공유 서버를 켭니다. 이 창과 Mac을 열어 두고 인터넷 연결을 유지해 주세요."
if [[ -n "${PROMPT_COACH_SITE_DIR:-}" ]]; then
  print "홈페이지 소스의 연결 주소도 갱신합니다. 공개 홈페이지 반영에는 별도 배포가 필요합니다."
fi
node start-public.mjs
