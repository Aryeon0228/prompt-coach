import type { FreePromptMode } from './free-prompt'

export const FREE_MODES: Array<{ id: FreePromptMode; label: string; hint: string }> = [
  { id: 'image', label: '이미지', hint: '한 장의 구도와 표현' },
  { id: 'video', label: '영상', hint: '시간에 따른 장면과 움직임' },
  { id: 'web', label: '3D 웹', hint: '공간을 탐색하고 조작하는 경험' },
]
