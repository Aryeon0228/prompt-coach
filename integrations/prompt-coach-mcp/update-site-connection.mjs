#!/usr/bin/env node
import { publishTemporaryConnection, retireTemporaryConnection } from './site-connection.mjs'

// This helper never starts a server or deploys the website.
const [action, endpoint] = process.argv.slice(2)
const siteDir = process.env.PROMPT_COACH_SITE_DIR
if (!siteDir || !endpoint || !['--temporary', '--unavailable'].includes(action) || process.argv.length !== 4) {
  console.error('PROMPT_COACH_SITE_DIR를 지정한 뒤 다음 중 하나를 실행해 주세요.\nnode update-site-connection.mjs --temporary https://실제-공개-주소/mcp\nnode update-site-connection.mjs --unavailable https://종료한-주소/mcp')
  process.exitCode = 1
} else {
  try {
    if (action === '--temporary') {
      const path = await publishTemporaryConnection(siteDir, endpoint)
      console.log(`홈페이지 소스의 연결 주소를 갱신했습니다: ${path}`)
      console.log('접속 확인은 별도로 필요합니다. 실제 홈페이지에 반영하려면 검토 후 배포해 주세요.')
    } else {
      const changed = await retireTemporaryConnection(siteDir, endpoint)
      console.log(changed ? '홈페이지 소스의 연결 상태를 사용 불가로 바꿨습니다. 실제 홈페이지에도 반영하려면 배포해 주세요.' : '해당 주소가 현재 임시 연결과 일치하지 않아 홈페이지 설정을 바꾸지 않았습니다.')
    }
  } catch (error) {
    console.error(`홈페이지 연결 설정을 저장하지 못했습니다: ${error.message}`)
    process.exitCode = 1
  }
}
