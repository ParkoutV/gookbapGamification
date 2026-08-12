'use client'

import { useEffect } from 'react'

export function useUnsavedChanges(isDirty: boolean) {
  useEffect(() => {
    // 1. 브라우저 기본 새로고침, 탭 닫기, 외부 링크 이동 방어
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault()
        e.returnValue = '' // Chrome 등 모던 브라우저 요구사항
      }
    }

    // 2. 내부 Next.js 클라이언트 라우팅(a 태그 클릭) 방어
    const handleClick = (e: MouseEvent) => {
      if (!isDirty) return

      // 클릭된 요소가 a 태그인지 확인 (내부 혹은 자식 요소에서부터 closest로 탐색)
      const target = (e.target as Element).closest('a')
      if (!target) return

      const href = target.getAttribute('href')
      
      // href가 없거나, 현재 페이지의 앵커 이동(#)이거나, 새 창 열기(target="_blank")인 경우는 제외
      if (!href || href.startsWith('#') || target.getAttribute('target') === '_blank') return

      if (!window.confirm('저장하지 않은 변경사항이 있습니다. 정말 나가시겠습니까?')) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    // capture phase(true)로 등록하여 Next.js 라우터보다 먼저 클릭 이벤트를 가로챔
    document.addEventListener('click', handleClick, { capture: true })

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('click', handleClick, { capture: true })
    }
  }, [isDirty])
}
