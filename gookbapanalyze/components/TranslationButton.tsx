'use client'

import { useState } from 'react'
import { useTranslator } from '@/hooks/useTranslator'
import { Languages, Loader2, CheckCircle2 } from 'lucide-react'

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
  const { isTranslating, currentUsage, translate } = useTranslator()
  const [translatingLang, setTranslatingLang] = useState<string | null>(null)
  const [translationProgress, setTranslationProgress] = useState<{current: number, total: number} | null>(null)
  const [showCompletionInfo, setShowCompletionInfo] = useState(false)

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

    setShowCompletionInfo(false); // 기존 알림 숨기기
    const totalTasks = targetLanguages.length * validEntries.length;
    let completedTasks = 0;
    setTranslationProgress({ current: 0, total: totalTasks });

    const results: Record<string, Record<string, string>> = {};
    for (const lang of targetLanguages) {
      setTranslatingLang(lang);
      results[lang] = {};
      try {
        for (const [key, text] of validEntries) {
          const translated = await translate(text, lang);
          results[lang][key] = translated;
          completedTasks++;
          setTranslationProgress({ current: completedTasks, total: totalTasks });
        }
      } catch (err) {
        console.error(`[Auto Translate] [${lang}] 번역 중 오류 발생:`, err);
      }
    }
    
    setTranslatingLang(null);
    setTranslationProgress(null);
    onTranslationComplete(results);
    
    // 번역 완료 후 3초간 잔여 횟수 정보 표시
    setShowCompletionInfo(true);
    setTimeout(() => {
      setShowCompletionInfo(false);
    }, 3000);
  }

  const handleTranslateClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    executeTranslation()
  }

  return (
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
      {translationProgress && translationProgress.total > 0 && (
        <div className="absolute top-full right-0 mt-1 min-w-[120px] w-max flex flex-col gap-1.5 text-[10px] text-blue-600 dark:text-blue-400 font-bold bg-blue-50 dark:bg-blue-900/30 px-2 py-1.5 rounded-md border border-blue-100 dark:border-blue-800 z-[100] shadow-md">
          {compact && translatingLang && (
            <div className="text-center w-full whitespace-nowrap">
              {translatingLang} 번역 중...
            </div>
          )}
          <div className="flex items-center gap-2 w-full">
            <div className="flex-1 bg-blue-200 dark:bg-blue-800/50 rounded-full h-1.5 overflow-hidden relative">
              <div 
                className="bg-blue-500 dark:bg-blue-400 h-full rounded-full transition-all duration-300 ease-out" 
                style={{ width: `${(translationProgress.current / translationProgress.total) * 100}%` }} 
              />
            </div>
            <span className="min-w-[24px] text-right whitespace-nowrap">
              {Math.round((translationProgress.current / translationProgress.total) * 100)}%
            </span>
          </div>
        </div>
      )}

      {/* 완료 알림 및 남은 횟수 표시 (Fade out) */}
      {showCompletionInfo && (
        <div className="absolute top-full right-0 mt-1 min-w-[150px] w-max flex flex-col items-center justify-center gap-1 text-[10px] bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 px-3 py-2 rounded-md z-[100] shadow-md animate-in fade-in duration-300">
          <div className="flex items-center gap-1 font-bold whitespace-nowrap">
            <CheckCircle2 className="w-3 h-3" />
            <span>번역 완료</span>
          </div>
          <div className="opacity-80 whitespace-nowrap">
            남은 일일 번역량: {currentUsage !== null ? Math.max(0, 5000 - currentUsage).toLocaleString() : '5,000'} / 5,000
          </div>
        </div>
      )}
    </div>
  )
}



