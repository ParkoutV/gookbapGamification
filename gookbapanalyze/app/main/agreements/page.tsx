'use client'

import { useState, useEffect, useRef } from 'react'
import { FileText, Save } from 'lucide-react'
import { getAgreements, getSupportedLanguages, updateAgreement, Agreement, SupportedLanguage } from './actions'
import TranslationButton from '@/components/TranslationButton'

export default function AgreementsPage() {
  const [agreements, setAgreements] = useState<Agreement[]>([])
  const [languages, setLanguages] = useState<SupportedLanguage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // UI State
  const [selectedDocId, setSelectedDocId] = useState<string>('terms')
  const [selectedLang, setSelectedLang] = useState<string>('ko')
  
  // doc_id -> { lang_code -> text }
  const [formData, setFormData] = useState<Record<string, Record<string, string>>>({})
  const [submitting, setSubmitting] = useState<string | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const docTypes = [
    { id: 'terms', label: '이용 약관 (Terms)' },
    { id: 'privacy', label: '개인정보처리방침 (Privacy)' },
    { id: 'coupon', label: '쿠폰 이용 안내 (Coupon)' }
  ]

  const fetchInitialData = async () => {
    setLoading(true)
    const [agreementsRes, langsRes] = await Promise.all([
      getAgreements(),
      getSupportedLanguages()
    ])

    if (agreementsRes.error) setError(agreementsRes.error)
    else if (agreementsRes.agreements) {
      setAgreements(agreementsRes.agreements)
    }
    
    if (langsRes.error) setError(langsRes.error)
    else if (langsRes.languages) {
      setLanguages(langsRes.languages)
      // Set default lang to 'ko' or first available
      if (!langsRes.languages.find(l => l.lang_code === 'ko') && langsRes.languages.length > 0) {
        setSelectedLang(langsRes.languages[0].lang_code)
      }
    }
    
    if (agreementsRes.agreements && langsRes.languages) {
      const initialForm: Record<string, Record<string, string>> = {}
      agreementsRes.agreements.forEach(doc => {
        initialForm[doc.doc_id] = {}
        langsRes.languages.forEach(lang => {
          initialForm[doc.doc_id][lang.lang_code] = doc.body?.[lang.lang_code] || ''
        })
      })
      
      // Ensure all docTypes have at least an empty record if missing from DB
      docTypes.forEach(type => {
        if (!initialForm[type.id]) {
          initialForm[type.id] = {}
          langsRes.languages.forEach(lang => {
            initialForm[type.id][lang.lang_code] = ''
          })
        }
      })
      
      setFormData(initialForm)
    }
    
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchInitialData()
  }, [])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.max(textareaRef.current.scrollHeight, 300)}px`
    }
  }, [selectedDocId, selectedLang, formData])

  const handleUpdate = async (doc_id: string) => {
    setSubmitting(doc_id)
    
    // Get existing doc to preserve non-active languages
    const existingDoc = agreements.find(d => d.doc_id === doc_id)
    const finalData = { ...(existingDoc?.body || {}) }
    
    languages.forEach(lang => {
      const code = lang.lang_code
      const val = formData[doc_id]?.[code]
      if (val && val.trim() !== '') {
        finalData[code] = val.trim()
      } else {
        delete finalData[code]
      }
    })

    const res = await updateAgreement(doc_id, finalData)
    if (res.error) {
      alert(res.error)
    } else {
      alert('저장되었습니다.')
      fetchInitialData()
    }
    setSubmitting(null)
  }

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
          <FileText className="w-6 h-6 mr-3 text-blue-600" />
          약관 관리
        </h1>
        <p className="text-sm text-gray-500 dark:text-zinc-400 mt-2">
          서비스 이용 약관, 개인정보처리방침 및 쿠폰 이용 안내를 다국어로 관리합니다.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 text-sm font-medium border border-red-100 dark:border-red-900/50">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500 dark:text-zinc-400">
          로딩 중...
        </div>
      ) : (
        <div className="space-y-6">
          {/* First Level: Document Type Tabs */}
          <div className="flex space-x-2 border-b border-gray-200 dark:border-zinc-800">
            {docTypes.map(type => (
              <button 
                key={type.id}
                onClick={() => setSelectedDocId(type.id)}
                className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 mb-[-1px] ${
                  selectedDocId === type.id 
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-zinc-400 dark:hover:text-zinc-200'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm ring-1 ring-gray-200 dark:ring-zinc-800 p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
              {/* Second Level: Language Tabs */}
              <div className="flex flex-wrap gap-2">
                {languages.map(lang => (
                  <button
                    key={lang.lang_code}
                    onClick={() => setSelectedLang(lang.lang_code)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedLang === lang.lang_code 
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' 
                        : 'text-gray-600 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {lang.lang_name} ({lang.lang_code.toUpperCase()})
                  </button>
                ))}
              </div>
              
              <div className="flex items-center gap-3 ml-auto">
                <TranslationButton
                  sourceTexts={{ text: formData[selectedDocId]?.['ko'] || '' }}
                  targetLanguages={languages.map(l => l.lang_code).filter(c => c !== 'ko' && !formData[selectedDocId]?.[c])}
                  existingTranslations={languages.reduce((acc, l) => {
                    if (l.lang_code === 'ko') return acc;
                    acc[l.lang_code] = {
                      text: formData[selectedDocId]?.[l.lang_code] || ''
                    };
                    return acc;
                  }, {} as Record<string, Record<string, string>>)}
                  onTranslationComplete={(results) => {
                    setFormData(prev => {
                      const next = { ...prev }
                      next[selectedDocId] = { ...next[selectedDocId] }
                      for (const [lang, translations] of Object.entries(results)) {
                        if (translations.text && !next[selectedDocId][lang]) {
                          next[selectedDocId][lang] = translations.text
                        }
                      }
                      return next
                    })
                  }}
                  compact={false}
                />
                <button
                  onClick={() => handleUpdate(selectedDocId)}
                  disabled={submitting === selectedDocId}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center shadow-sm disabled:opacity-50"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {submitting === selectedDocId ? '저장 중...' : '저장하기'}
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="font-medium text-gray-700 dark:text-zinc-300">
                  {languages.find(l => l.lang_code === selectedLang)?.lang_name} 내용
                </span>
                <span className="text-xs text-gray-500">
                  마지막 수정: {
                    agreements.find(d => d.doc_id === selectedDocId)?.updated_at 
                      ? new Date(agreements.find(d => d.doc_id === selectedDocId)!.updated_at).toLocaleString() 
                      : '없음'
                  }
                </span>
              </div>
              <textarea
                ref={textareaRef}
                placeholder={`${languages.find(l => l.lang_code === selectedLang)?.lang_name} 내용을 입력해주세요.`}
                value={formData[selectedDocId]?.[selectedLang] || ''}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  [selectedDocId]: {
                    ...prev[selectedDocId],
                    [selectedLang]: e.target.value
                  }
                }))}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-zinc-900 focus:border-transparent outline-none transition-all resize-none overflow-hidden min-h-[300px]"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
