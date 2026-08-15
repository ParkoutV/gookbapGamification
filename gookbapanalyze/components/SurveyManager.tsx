'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { v4 as uuidv4 } from 'uuid'
import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2, Save, Eye, EyeOff, Image as ImageIcon, X } from 'lucide-react'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import TranslationButton from '@/components/TranslationButton'

interface Language {
  lang_code: string
  lang_name: string
  is_active: boolean
}

interface Branch {
  branch_id: string
  branch_name: any
}

interface Question {
  question_id: string
  survey_phase: number
  question_text: any // JSONB
  question_type: number // 0: single, 1: multi, 2: short answer
  options: any[] // Array of JSONB
  image_url: string | null
  is_required: boolean
  order_index: number
  is_active: boolean
  branch_id: string | null
}

export default function SurveyManager({
  permission,
  assignedBranchId,
  activeLanguages,
  branches
}: {
  permission: number
  assignedBranchId: string | null
  activeLanguages: Language[]
  branches: Branch[]
}) {
  const supabase = createClient()
  const [questions, setQuestions] = useState<Question[]>([])
  const [originalQuestions, setOriginalQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    permission === 1 ? (assignedBranchId || '') : (branches[0]?.branch_id || '')
  )

  const [expandedPhases, setExpandedPhases] = useState<Record<number, boolean>>({
    0: permission === 0,
    1: permission === 0,
    2: permission === 1 || false,
  })

  useEffect(() => {
    fetchQuestions()
  }, [])

  const isDirty = JSON.stringify(questions) !== JSON.stringify(originalQuestions)
  useUnsavedChanges(isDirty)

  const safeJSONParse = (val: any, defaultVal: any = {}) => {
    if (typeof val === 'string') {
      try { return JSON.parse(val) } catch(e) { return { ko: val } }
    }
    return val || defaultVal
  }

  const parsedBranches = branches.map(b => ({
    ...b,
    branch_name: safeJSONParse(b.branch_name)
  }))

  const fetchQuestions = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('survey_questions')
      .select('*')
      .order('order_index', { ascending: true })

    if (error) {
      console.error('Error fetching questions:', error)
    } else {
      const formattedData = data.map((q: any) => ({
        ...q,
        question_text: safeJSONParse(q.question_text),
        options: Array.isArray(q.options) ? q.options : (safeJSONParse(q.options, []) || [])
      }))
      setQuestions(formattedData)
      setOriginalQuestions(formattedData)
    }
    setLoading(false)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      for (const q of questions) {
        // Upsert
        const { error } = await supabase
          .from('survey_questions')
          .upsert({
            question_id: q.question_id,
            survey_phase: q.survey_phase,
            question_text: typeof q.question_text === 'object' ? JSON.stringify(q.question_text) : q.question_text,
            question_type: q.question_type,
            options: q.options,
            image_url: q.image_url,
            is_required: q.is_required,
            order_index: q.order_index,
            is_active: q.is_active,
            branch_id: q.branch_id
          })
        if (error) throw error
      }
      setOriginalQuestions(questions)
      alert('성공적으로 저장되었습니다.')
    } catch (error) {
      console.error('Error saving:', error)
      alert('저장 중 오류가 발생했습니다.')
    }
    setSaving(false)
  }

  const handleImageUpload = async (qId: string, file: File) => {
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `surveys/${uuidv4()}.${fileExt}`
      
      const { data, error } = await supabase.storage
        .from('game_assets')
        .upload(fileName, file)

      if (error) throw error

      const { data: publicUrlData } = supabase.storage
        .from('game_assets')
        .getPublicUrl(fileName)

      updateQuestion(qId, { image_url: publicUrlData.publicUrl })
    } catch (error) {
      console.error('Upload error:', error)
      alert('이미지 업로드 중 오류가 발생했습니다.')
    }
  }

  const addQuestion = (phase: number) => {
    const phaseQuestions = questions.filter(q => q.survey_phase === phase && (phase !== 2 || q.branch_id === selectedBranchId))
    const maxOrder = phaseQuestions.reduce((max, q) => Math.max(max, q.order_index), 0)
    
    const newQuestion: Question = {
      question_id: uuidv4(),
      survey_phase: phase,
      question_text: { ko: '' },
      question_type: 0,
      options: [{ ko: '' }],
      image_url: null,
      is_required: true,
      order_index: maxOrder + 1,
      is_active: true,
      branch_id: phase === 2 ? selectedBranchId : null
    }
    setQuestions([...questions, newQuestion])
  }

  const deleteQuestion = async (id: string) => {
    if (confirm('정말로 삭제하시겠습니까? (저장 시 반영됩니다)')) {
      // In a real app, you might want to delete directly from DB if it exists, or just filter it out and handle on save
      const { error } = await supabase.from('survey_questions').delete().eq('question_id', id)
      if (error) {
        alert('삭제 중 오류가 발생했습니다.')
      } else {
        setQuestions(questions.filter(q => q.question_id !== id))
      }
    }
  }

  // We are keeping deleteQuestion in code, but removing the button in UI as requested.

  const updateQuestion = (id: string, updates: Partial<Question>) => {
    setQuestions(questions.map(q => q.question_id === id ? { ...q, ...updates } : q))
  }

  const updateQuestionText = (id: string, lang: string, text: string) => {
    setQuestions(questions.map(q => {
      if (q.question_id === id) {
        return { ...q, question_text: { ...(q.question_text || {}), [lang]: text } }
      }
      return q
    }))
  }

  const addOption = (qId: string) => {
    setQuestions(questions.map(q => {
      if (q.question_id === qId) {
        return { ...q, options: [...(q.options || []), {}] }
      }
      return q
    }))
  }

  const removeOption = (qId: string, index: number) => {
    setQuestions(questions.map(q => {
      if (q.question_id === qId) {
        const newOptions = [...q.options]
        newOptions.splice(index, 1)
        return { ...q, options: newOptions }
      }
      return q
    }))
  }

  const updateOptionText = (qId: string, index: number, lang: string, text: string) => {
    setQuestions(questions.map(q => {
      if (q.question_id === qId) {
        const newOptions = [...(q.options || [])]
        newOptions[index] = { ...(newOptions[index] || {}), [lang]: text }
        return { ...q, options: newOptions }
      }
      return q
    }))
  }

  // Basic Drag and Drop
  const handleDragStart = (e: React.DragEvent, id: string, phase: number) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ id, phase }))
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent, targetId: string, targetPhase: number) => {
    e.preventDefault()
    const data = JSON.parse(e.dataTransfer.getData('text/plain'))
    if (data.phase !== targetPhase) return // Prevent cross-phase drag for now
    
    const sourceIndex = questions.findIndex(q => q.question_id === data.id)
    const targetIndex = questions.findIndex(q => q.question_id === targetId)
    
    if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return

    const newQuestions = [...questions]
    const [removed] = newQuestions.splice(sourceIndex, 1)
    newQuestions.splice(targetIndex, 0, removed)
    
    // Update order_index for this phase
    let currentOrder = 1
    newQuestions.forEach(q => {
      if (q.survey_phase === targetPhase && (targetPhase !== 2 || q.branch_id === selectedBranchId)) {
        q.order_index = currentOrder++
      }
    })
    
    setQuestions(newQuestions)
  }

  const togglePhase = (phase: number) => {
    setExpandedPhases(prev => ({ ...prev, [phase]: !prev[phase] }))
  }

  const renderPhaseBlock = (phase: number, title: string, description: string) => {
    if (permission === 1 && phase !== 2) return null

    const phaseQuestions = questions
      .filter(q => q.survey_phase === phase && (phase !== 2 || q.branch_id === selectedBranchId))
      .sort((a, b) => a.order_index - b.order_index)

    return (
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden mb-6">
        <div 
          className="px-6 py-4 flex items-center justify-between bg-zinc-50 dark:bg-zinc-800/50 cursor-pointer"
          onClick={() => togglePhase(phase)}
        >
          <div>
            <h2 className="text-lg font-bold">{title}</h2>
            <p className="text-sm text-zinc-500">{description}</p>
          </div>
          <div className="flex items-center gap-4">
            {phase === 2 && (
              <select
                className="bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-1.5 text-sm"
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                disabled={permission === 1}
              >
                {parsedBranches.map(b => (
                  <option key={b.branch_id} value={b.branch_id}>
                    {b.branch_name?.ko || b.branch_id}
                  </option>
                ))}
              </select>
            )}
            {expandedPhases[phase] ? <ChevronUp className="w-5 h-5 text-zinc-400" /> : <ChevronDown className="w-5 h-5 text-zinc-400" />}
          </div>
        </div>
        
        {expandedPhases[phase] && (
          <div className="p-6 space-y-6 bg-zinc-50/30 dark:bg-zinc-950/30">
            {phase === 2 && !selectedBranchId ? (
              <p className="text-center text-zinc-500 py-4">지점을 먼저 선택해주세요.</p>
            ) : (
              <>
                {phaseQuestions.map((q) => (
                  <div 
                    key={q.question_id}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, q.question_id, phase)}
                    className="flex gap-4 bg-white dark:bg-zinc-900 p-6 rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-sm relative group"
                  >
                    <div 
                      draggable
                      onDragStart={(e) => handleDragStart(e, q.question_id, phase)}
                      className="flex items-center text-zinc-400 cursor-grab active:cursor-grabbing hover:text-zinc-600 dark:hover:text-zinc-300 mt-2 self-start"
                    >
                      <GripVertical className="w-5 h-5" />
                    </div>
                    
                    <div className="flex-1 space-y-4 min-w-0">
                      <div className="flex flex-col gap-3 border-b border-zinc-200 dark:border-zinc-700 pb-4">
                        {activeLanguages.map(lang => (
                          <div key={lang.lang_code} className="flex items-center gap-3">
                            <span className="text-xs font-bold uppercase w-8 text-zinc-400 shrink-0">{lang.lang_code}</span>
                            <input
                              type="text"
                              value={q.question_text?.[lang.lang_code] || ''}
                              onChange={(e) => updateQuestionText(q.question_id, lang.lang_code, e.target.value)}
                              placeholder={`질문 제목 (${lang.lang_name})`}
                              className="flex-1 min-w-0 text-lg font-medium bg-transparent border-b border-transparent hover:border-zinc-200 focus:outline-none focus:border-blue-500 transition-colors"
                            />
                          </div>
                        ))}
                        <div className="flex items-center justify-end flex-wrap gap-2 shrink-0 mt-2">
                          <label className="cursor-pointer p-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-500 hover:text-blue-500">
                            <input 
                              type="file" 
                              accept="image/*" 
                              className="hidden" 
                              onChange={(e) => {
                                if (e.target.files?.[0]) handleImageUpload(q.question_id, e.target.files[0])
                              }}
                            />
                            <ImageIcon className="w-5 h-5" />
                          </label>
                          <select
                            className="max-w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 text-sm"
                            value={q.question_type}
                            onChange={(e) => updateQuestion(q.question_id, { question_type: Number(e.target.value) })}
                          >
                            <option value={0}>객관식 질문</option>
                            <option value={1}>체크박스</option>
                            <option value={2}>주관식 질문</option>
                          </select>
                        </div>
                      </div>

                      {q.image_url && (
                        <div className="relative inline-block mt-4 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700">
                          <img src={q.image_url} alt="Question attachment" className="max-h-64 object-contain" />
                          <button 
                            onClick={() => updateQuestion(q.question_id, { image_url: null })}
                            className="absolute top-2 right-2 p-1 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}

                      {q.question_type !== 2 && (
                        <div className="space-y-4 pl-2 mt-4">
                          {q.options?.map((opt, idx) => (
                            <div key={idx} className="flex gap-3 group/opt items-start">
                              <div className={`w-4 h-4 mt-2 border border-zinc-400 flex-shrink-0 ${q.question_type === 1 ? 'rounded-sm' : 'rounded-full'}`} />
                              <div className="flex-1 space-y-2 min-w-0">
                                {activeLanguages.map(lang => (
                                  <div key={lang.lang_code} className="flex items-center gap-2">
                                    <span className="text-xs font-bold uppercase w-8 text-zinc-400 shrink-0">{lang.lang_code}</span>
                                    <input
                                      type="text"
                                      value={opt[lang.lang_code] || ''}
                                      onChange={(e) => updateOptionText(q.question_id, idx, lang.lang_code, e.target.value)}
                                      placeholder={`옵션 ${idx + 1} (${lang.lang_name})`}
                                      className="flex-1 min-w-0 bg-transparent border-b border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 focus:border-blue-500 focus:outline-none transition-colors"
                                    />
                                  </div>
                                ))}
                              </div>
                              <button 
                                onClick={() => removeOption(q.question_id, idx)}
                                className="text-zinc-400 hover:text-red-500 opacity-0 group-hover/opt:opacity-100 transition-opacity mt-1"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                          <div className="flex items-center gap-3 text-zinc-500 pl-1 pt-2">
                            <Plus className="w-4 h-4" />
                            <button 
                              onClick={() => addOption(q.question_id)}
                              className="text-sm hover:text-blue-500 hover:underline"
                            >
                              옵션 추가
                            </button>
                          </div>
                        </div>
                      )}
                      {q.question_type === 2 && (
                        <div className="space-y-4 pl-2 mt-4 border-t border-dashed border-zinc-200 dark:border-zinc-800 pt-4">
                          <div className="flex-1 space-y-2">
                            {activeLanguages.map(lang => (
                              <div key={lang.lang_code} className="flex items-center gap-2">
                                <span className="text-xs font-bold uppercase w-8 text-zinc-400 shrink-0">{lang.lang_code}</span>
                                <input
                                  type="text"
                                  value={q.options?.[0]?.[lang.lang_code] || ''}
                                  onChange={(e) => updateOptionText(q.question_id, 0, lang.lang_code, e.target.value)}
                                  placeholder={`단답형 부가설명/안내문 (${lang.lang_name})`}
                                  className="flex-1 min-w-0 bg-transparent border-b border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 focus:border-blue-500 focus:outline-none transition-colors text-sm text-zinc-500 focus:text-zinc-900 dark:focus:text-zinc-100"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-zinc-500 border-t border-zinc-100 dark:border-zinc-800 pt-4 mt-6">
                        <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">
                          <input
                            type="checkbox"
                            checked={q.is_required}
                            onChange={(e) => updateQuestion(q.question_id, { is_required: e.target.checked })}
                            className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          필수 응답
                        </label>

                        <div className="flex items-center gap-2 relative">
                          <TranslationButton
                            compact
                            sourceTexts={{
                              questionText: q.question_text?.['ko'] || '',
                              ...((q.options || []).reduce((acc, opt, idx) => {
                                if (q.question_type !== 2 || idx === 0) {
                                  acc[`option_${idx}`] = opt['ko'] || ''
                                }
                                return acc
                              }, {} as Record<string, string>))
                            }}
                            targetLanguages={activeLanguages
                              .map(l => l.lang_code)
                              .filter(c => c !== 'ko' && (
                                !q.question_text?.[c] ||
                                (q.question_type !== 2 ? (q.options || []).some(o => !o[c]) : !(q.options || [])[0]?.[c])
                              ))
                            }
                            existingTranslations={activeLanguages.reduce((acc, l) => {
                              if (l.lang_code === 'ko') return acc;
                              acc[l.lang_code] = {
                                questionText: q.question_text?.[l.lang_code] || '',
                                ...((q.options || []).reduce((oAcc, opt, idx) => {
                                  if (q.question_type !== 2 || idx === 0) {
                                    oAcc[`option_${idx}`] = opt[l.lang_code] || '';
                                  }
                                  return oAcc;
                                }, {} as Record<string, string>))
                              };
                              return acc;
                            }, {} as Record<string, Record<string, string>>)}
                            onTranslationComplete={(results) => {
                              let newQText = { ...(q.question_text || {}) }
                              let newOptions = [...(q.options || [])].map(o => ({ ...o }))
                              
                              for (const [lang, translations] of Object.entries(results)) {
                                if (translations.questionText && !newQText[lang]) {
                                  newQText[lang] = translations.questionText
                                }
                                if (q.question_type !== 2) {
                                  newOptions.forEach((opt, idx) => {
                                    if (translations[`option_${idx}`] && !opt[lang]) {
                                      opt[lang] = translations[`option_${idx}`]
                                    }
                                  })
                                } else {
                                  if (translations['option_0']) {
                                    if (!newOptions[0]) newOptions[0] = {}
                                    if (!newOptions[0][lang]) newOptions[0][lang] = translations['option_0']
                                  }
                                }
                              }
                              updateQuestion(q.question_id, { question_text: newQText, options: newOptions })
                            }}
                          />
                          <button 
                            onClick={() => updateQuestion(q.question_id, { is_active: !q.is_active })}
                            className={`p-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors ${!q.is_active ? 'text-red-500' : ''}`}
                            title={q.is_active ? '활성화됨 (클릭하여 숨김)' : '숨겨짐 (클릭하여 활성화)'}
                          >
                            {q.is_active ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  onClick={() => addQuestion(phase)}
                  className="w-full flex items-center justify-center gap-2 py-4 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-500 hover:text-blue-600 hover:border-blue-300 dark:hover:border-blue-800 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  <span>질문 추가</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return <div className="text-center py-20 text-zinc-500">설문 데이터를 불러오는 중...</div>
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4 pb-24">
        {renderPhaseBlock(0, "힌트 질문 (Phase 0)", "게임을 시작하거나 힌트를 얻기 전에 묻는 질문입니다.")}
        {renderPhaseBlock(1, "쿠폰 받기 전 질문 (Phase 1)", "게임을 클리어하고 쿠폰을 발급받기 전에 묻는 질문입니다.")}
        {renderPhaseBlock(2, "지점 특화 질문 (Phase 2)", "특정 지점에서만 물어보는 특화 질문입니다.")}
      </div>

      {/* Floating Save Button */}
      <div className="fixed bottom-8 right-8 z-50">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
        >
          <Save className="w-5 h-5" />
          <span className="font-medium">{saving ? '저장 중...' : '변경사항 저장'}</span>
        </button>
      </div>
    </div>
  )
}
