'use client'

import { useState, useTransition } from 'react'
import { toggleOptionalSurveyOnce } from './actions'
import { ToggleLeft, ToggleRight, AlertTriangle } from 'lucide-react'

export default function SurveySettingsToggle({ initialValue }: { initialValue: boolean }) {
  const [isOnceEnabled, setIsOnceEnabled] = useState(initialValue)
  const [isPending, startTransition] = useTransition()
  const [showModal, setShowModal] = useState(false)

  const handleToggleClick = () => {
    setShowModal(true)
  }

  const confirmToggle = () => {
    setShowModal(false)
    startTransition(async () => {
      try {
        const result = await toggleOptionalSurveyOnce(isOnceEnabled)
        if (result.success) {
          setIsOnceEnabled(result.newValue)
        }
      } catch (err) {
        alert('설정 변경에 실패했습니다.')
      }
    })
  }

  const cancelToggle = () => {
    setShowModal(false)
  }

  return (
    <>
      <div className="flex items-center gap-3 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 p-4 rounded-xl shadow-sm">
        <div className="flex-1">
          <h3 className="font-bold text-sm text-gray-900 dark:text-white">선택 질문 1회 노출</h3>
          <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">
            켜져 있으면 한 번 노출된 선택 질문은 유저에게 다시 나타나지 않습니다. 끄면 매번 무조건 노출됩니다.
          </p>
        </div>
        <button
          onClick={handleToggleClick}
          disabled={isPending}
          className={`text-4xl transition-colors focus:outline-none ${isOnceEnabled ? 'text-blue-500' : 'text-gray-300 dark:text-zinc-600'} ${isPending ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 active:scale-95'}`}
        >
          {isOnceEnabled ? <ToggleRight size={36} /> : <ToggleLeft size={36} />}
        </button>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex items-center gap-3 text-amber-500 mb-4">
                <AlertTriangle size={24} />
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">기능 설정 변경 확인</h2>
              </div>
              
              <div className="space-y-4 text-sm text-gray-600 dark:text-zinc-400">
                <p>
                  선택 질문 1회 노출 기능을 <strong>{isOnceEnabled ? '비활성화(끄기)' : '활성화(켜기)'}</strong> 하시겠습니까?
                </p>
                
                <div className="bg-gray-50 dark:bg-zinc-800 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-900 dark:text-zinc-200 mb-2">변경 시 부수 효과 (Side Effect)</h4>
                  {isOnceEnabled ? (
                    <ul className="list-disc pl-5 space-y-1 text-xs">
                      <li>과거에 이미 이 질문을 보고 스킵했던 유저들에게도 <strong>조건 없이 매번 모든 선택 질문이 노출</strong>됩니다. (소급 적용)</li>
                      <li>유저의 피로도가 증가할 수 있으나, 답변 수집 기회는 늘어납니다.</li>
                    </ul>
                  ) : (
                    <ul className="list-disc pl-5 space-y-1 text-xs">
                      <li>선택 질문이 <strong>유저당 단 1회만 노출</strong>되고, 이후에는 자동으로 스킵(패스)됩니다.</li>
                      <li>이전에 한 번이라도 노출되었던 질문은 즉시 유저의 화면에서 사라집니다.</li>
                    </ul>
                  )}
                </div>
              </div>
            </div>
            
            <div className="bg-gray-50 dark:bg-zinc-800/50 px-6 py-4 flex justify-end gap-3 border-t border-gray-100 dark:border-zinc-800">
              <button
                onClick={cancelToggle}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
              >
                취소
              </button>
              <button
                onClick={confirmToggle}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition-colors"
              >
                변경 확인
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
