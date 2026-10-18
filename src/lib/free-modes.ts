import type { FreePromptMode } from './free-prompt'

export const FREE_MODES: Array<{ id: FreePromptMode; label: string; hint: string }> = [
  { id: 'image', label: '2D Image', hint: '참고 이미지·일러스트 등 한 장의 이미지' },
  { id: 'web', label: '3D Web', hint: '브라우저에서 회전·클릭하는 3D 장면' },
  { id: 'video', label: 'Video', hint: '시간에 따라 움직이는 영상' },
]
