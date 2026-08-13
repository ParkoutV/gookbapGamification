'use client'

import { useState, useEffect } from 'react'
import { useTranslator } from '@/hooks/useTranslator'
import { Languages, Loader2, AlertTriangle, X } from 'lucide-react'

interface TranslationButtonProps {
  // 번역할 텍스트 맵. 예: { name: '이름', desc: '설명' }
  sourceTexts: Record<string, string>
  // 번역해야 할 언어 코드 목록
  targetLanguages: string[]
  // 번역 완료 후 콜백. { [langCode]: { name: 'Name', desc: 'Desc' } } 반환
  onTranslationComplete: (translations: Record<string, Record<string, string>>) => void
  compact?: boolean
  className?: string
}

export default function TranslationButton({ 
  sourceTexts, 
  targetLanguages, 
  onTranslationComplete,
  compact = false,
  className = ""
}: TranslationButtonProps) {
  const { isTranslating, progressItems, translate } = useTranslator()
  const [translatingLang, setTranslatingLang] = useState<string | null>(null)
  const [translationProgress, setTranslationProgress] = useState<{current: number, total: number} | null>(null)
  const [showWarningModal, setShowWarningModal] = useState(false)
  const [hasAcceptedWarning, setHasAcceptedWarning] = useState(true) // 기본값 true로 두고 useEffect에서 클라이언트 사이드 체크

  useEffect(() => {
    // 클라이언트 사이드에서만 localStorage 확인
    const accepted = localStorage.getItem('translation_warning_accepted') === 'true'
    setHasAcceptedWarning(accepted)
  }, [])

  const executeTranslation = async () => {
    const validEntries = Object.entries(sourceTexts).filter(([_, text]) => text && text.trim() !== '')
    if (validEntries.length === 0) {
      alert('한국어(ko) 텍스트를 먼저 하나 이상 입력해주세요.');
      return;
    }
    
    if (targetLanguages.length === 0) {
      alert('번역 대상 언어가 없습니다. (이미 값이 채워져 있을 수 있습니다.)');
      return;
    }

    console.log(`[Auto Translate] 시작 - 대상 언어: ${targetLanguages.join(', ')}`);
    console.log(`[Auto Translate] 원본 텍스트:`, sourceTexts);

    const totalTasks = targetLanguages.length * validEntries.length;
    let completedTasks = 0;
    setTranslationProgress({ current: 0, total: totalTasks });

    const results: Record<string, Record<string, string>> = {};
    for (const lang of targetLanguages) {
      setTranslatingLang(lang);
      results[lang] = {};
      try {
        console.log(`[Auto Translate] [${lang}] 언어로 번역 진행 중...`);
        for (const [key, text] of validEntries) {
          const translated = await translate(text, lang);
          results[lang][key] = translated;
          console.log(`  └ [${key}] "${text}" -> "${translated}"`);
          
          completedTasks++;
          setTranslationProgress({ current: completedTasks, total: totalTasks });
        }
        console.log(`[Auto Translate] [${lang}] 번역 완료.`);
      } catch (err) {
        console.error(`[Auto Translate] [${lang}] 번역 중 오류 발생:`, err);
      }
    }
    
    setTranslatingLang(null);
    setTimeout(() => setTranslationProgress(null), 500); // 번역 완료 후 0.5초 뒤 프로그레스바 숨김
    console.log(`[Auto Translate] 모든 번역 작업 완료. 최종 결과:`, results);
    onTranslationComplete(results);
  }

  const handleTranslateClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation() // 폼 제출 등 방지

    if (!hasAcceptedWarning) {
      setShowWarningModal(true)
      return
    }

    executeTranslation()
  }

  const handleAcceptWarning = () => {
    localStorage.setItem('translation_warning_accepted', 'true')
    setHasAcceptedWarning(true)
    setShowWarningModal(false)
    executeTranslation()
  }

  return (
    <>
      <div className={`flex flex-col gap-2 relative ${className}`}>
        <button
          onClick={handleTranslateClick}
          disabled={isTranslating || translatingLang !== null}
          type="button"
          title="빈칸 자동 번역"
          className={`flex items-center justify-center font-medium transition-colors border disabled:opacity-50
            ${compact 
              ? 'w-7 h-7 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-900/50' 
              : 'px-3 py-1.5 text-xs rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-900/50'
            }
          `}
        >
          {(isTranslating || translatingLang !== null) ? (
            <Loader2 className={`${compact ? 'w-4 h-4' : 'w-3 h-3 mr-1.5'} animate-spin`} />
          ) : (
            <Languages className={`${compact ? 'w-4 h-4' : 'w-3 h-3 mr-1.5'}`} />
          )}
          {!compact && ((isTranslating || translatingLang !== null) ? `${translatingLang} 번역 중...` : '빈칸 자동 번역')}
        </button>

        {/* 실제 텍스트 번역 진행률 표시 */}
        {translationProgress && translationProgress.total > 0 && progressItems.length === 0 && (
          <div className="absolute top-full left-0 mt-1 w-full flex items-center gap-2 text-[10px] text-blue-600 dark:text-blue-400 font-bold bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-md border border-blue-100 dark:border-blue-800 z-40 shadow-sm">
            <div className="flex-1 bg-blue-200 dark:bg-blue-800/50 rounded-full h-1.5 overflow-hidden relative">
              <div 
                className="bg-blue-500 dark:bg-blue-400 h-full rounded-full transition-all duration-300 ease-out" 
                style={{ width: `${(translationProgress.current / translationProgress.total) * 100}%` }} 
              />
            </div>
            <span className="min-w-[24px] text-right">
              {Math.round((translationProgress.current / translationProgress.total) * 100)}%
            </span>
          </div>
        )}
        
        {/* AI 모델 최초 다운로드(로딩) 진행률 팝업 */}
        {progressItems.length > 0 && (
          <div className="space-y-1 mt-1 w-full min-w-[150px] absolute top-full left-0 bg-white dark:bg-zinc-900 p-2 border border-gray-200 dark:border-zinc-800 rounded-lg shadow-lg z-50">
            <div className="text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1 flex items-center justify-between">
              <span>AI 모델 준비 중</span>
              <span className="text-[10px] font-normal text-gray-500">(최초 1회)</span>
            </div>
            {progressItems.map((item, idx) => (
              <div key={idx} className="text-[10px] text-gray-500 flex flex-col gap-0.5">
                <div className="flex justify-between">
                  <span className="truncate max-w-[120px]" title={item.file}>{item.file}</span>
                  <span>{Math.round(item.progress)}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-zinc-800 rounded-full h-1">
                  <div 
                    className="bg-blue-500 h-1 rounded-full transition-all duration-300" 
                    style={{ width: `${item.progress}%` }} 
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 최초 1회 경고 모달창 */}
      {showWarningModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl max-w-md w-full overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-zinc-800">
              <div className="flex items-center gap-2 text-amber-500">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="font-bold text-gray-900 dark:text-zinc-100 text-lg">AI 자동 번역 주의사항</h3>
              </div>
              <button 
                onClick={() => setShowWarningModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 text-sm text-gray-600 dark:text-zinc-400 space-y-4">
              <p>
                본 기능은 외부 서버를 거치지 않고 사용자님의 **현재 기기(브라우저)에서 직접 AI 번역 모델을 구동**하여 작동합니다.
              </p>
              
              <ul className="list-disc pl-5 space-y-2 text-gray-700 dark:text-zinc-300 bg-amber-50 dark:bg-amber-950/20 p-4 rounded-lg">
                <li>
                  <strong className="text-gray-900 dark:text-zinc-100">초기 로딩 지연:</strong> 최초 1회에 한하여 약 600MB 상당의 AI 모델 파일을 다운로드하므로 시간이 다소 소요됩니다.
                </li>
                <li>
                  <strong className="text-gray-900 dark:text-zinc-100">기기 성능 제약:</strong> 고성능의 연산력이 필요하므로, 스마트폰이나 태블릿 등 모바일 기기에서는 구동이 어려울 수 있으며 앱이 멈추거나 종료될 위험이 있습니다. 가급적 **데스크탑(PC) 환경에서 사용**해주세요.
                </li>
              </ul>
              
              <p className="text-xs text-gray-500">
                이 경고문은 기기당 최초 1회만 표시됩니다. 동의하시고 진행하시겠습니까?
              </p>
            </div>
            
            <div className="flex items-center justify-end gap-3 px-5 py-4 bg-gray-50 dark:bg-zinc-900/50 border-t border-gray-100 dark:border-zinc-800">
              <button
                onClick={() => setShowWarningModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleAcceptWarning}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
              >
                동의 및 번역 시작
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

