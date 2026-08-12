'use client'

import React, { useState, useEffect } from 'react'
import { X, Calendar, Filter } from 'lucide-react'

export interface SurveyFilterState {
  startDate: string | null
  endDate: string | null
  // question_id -> array of selected option indices (converted to string for easy comparison)
  answers: Record<string, string[]>
  condition: 'AND' | 'OR'
  deduplicate: boolean
}

interface Question {
  question_id: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  question_text: any
  question_type: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any[]
}

interface Props {
  isOpen: boolean
  onClose: () => void
  questions: Question[]
  initialFilters: SurveyFilterState
  onApply: (filters: SurveyFilterState) => void
}

export default function SurveyFilterModal({ isOpen, onClose, questions, initialFilters, onApply }: Props) {
  const [filters, setFilters] = useState<SurveyFilterState>(initialFilters)

  // Only use questions that are choice-based (0 or 1) for filtering
  const filterableQuestions = questions.filter(q => q.question_type === 0 || q.question_type === 1)

  useEffect(() => {
    if (isOpen) {
      setFilters(initialFilters)
    }
  }, [isOpen, initialFilters])

  if (!isOpen) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getKoText = (val: any) => {
    if (typeof val === 'string') {
      try { return JSON.parse(val).ko || '' } catch { return val }
    }
    return val?.ko || ''
  }

  const handleAnswerToggle = (qId: string, optIndex: string, type: number) => {
    setFilters(prev => {
      const current = prev.answers[qId] || []
      const isSelected = current.includes(optIndex)
      
      let newAnswers: string[] = []
      
      if (type === 0) {
        newAnswers = isSelected ? [] : [optIndex]
      } else {
        newAnswers = isSelected 
          ? current.filter(id => id !== optIndex)
          : [...current, optIndex]
      }

      const updated = { ...prev.answers }
      if (newAnswers.length === 0) {
        delete updated[qId]
      } else {
        updated[qId] = newAnswers
      }

      return { ...prev, answers: updated }
    })
  }

  const handleDatePreset = (preset: 'today' | '24h' | '1w' | '2w') => {
    const now = new Date()
    const start = new Date(now)
    
    if (preset === 'today') {
      start.setHours(0, 0, 0, 0)
    } else if (preset === '24h') {
      start.setHours(start.getHours() - 24)
    } else if (preset === '1w') {
      start.setDate(start.getDate() - 7)
    } else if (preset === '2w') {
      start.setDate(start.getDate() - 14)
    }

    const formatLocal = (d: Date) => {
      const pad = (n: number) => n.toString().padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    }

    setFilters(p => ({
      ...p,
      startDate: formatLocal(start),
      endDate: null
    }))
  }

  const clearFilters = () => {
    setFilters({ startDate: null, endDate: null, answers: {}, condition: 'AND', deduplicate: true })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3 text-zinc-900 dark:text-white">
            <Filter className="w-6 h-6" />
            <h2 className="text-xl font-bold">고급 필터링</h2>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-8">
          
          {/* Date Filter */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                <Calendar className="w-4 h-4" /> 응답 기간 설정
              </h3>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => handleDatePreset('today')} className="px-2.5 py-1 text-xs font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors text-zinc-700 dark:text-zinc-300">오늘</button>
                <button onClick={() => handleDatePreset('24h')} className="px-2.5 py-1 text-xs font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors text-zinc-700 dark:text-zinc-300">최근 24시간</button>
                <button onClick={() => handleDatePreset('1w')} className="px-2.5 py-1 text-xs font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors text-zinc-700 dark:text-zinc-300">최근 1주일</button>
                <button onClick={() => handleDatePreset('2w')} className="px-2.5 py-1 text-xs font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors text-zinc-700 dark:text-zinc-300">최근 2주일</button>
                <button onClick={() => setFilters(p => ({...p, startDate: null, endDate: null}))} className="px-2.5 py-1 text-xs font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors text-zinc-700 dark:text-zinc-300">전체 기간</button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm text-zinc-600 dark:text-zinc-400">시작 일시</label>
                  <label className="flex items-center gap-1.5 text-xs text-zinc-500 cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">
                    <input 
                      type="checkbox" 
                      checked={filters.startDate === null}
                      onChange={e => {
                        if (e.target.checked) setFilters(p => ({ ...p, startDate: null }))
                        else setFilters(p => ({ ...p, startDate: '' }))
                      }}
                      className="rounded text-blue-600 focus:ring-blue-500 w-3 h-3 cursor-pointer"
                    />
                    지정하지 않음
                  </label>
                </div>
                <input 
                  type="datetime-local" 
                  value={filters.startDate || ''}
                  onChange={e => setFilters(p => ({ ...p, startDate: e.target.value || null }))}
                  disabled={filters.startDate === null}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm text-zinc-600 dark:text-zinc-400">종료 일시</label>
                  <label className="flex items-center gap-1.5 text-xs text-zinc-500 cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">
                    <input 
                      type="checkbox" 
                      checked={filters.endDate === null}
                      onChange={e => {
                        if (e.target.checked) setFilters(p => ({ ...p, endDate: null }))
                        else setFilters(p => ({ ...p, endDate: '' }))
                      }}
                      className="rounded text-blue-600 focus:ring-blue-500 w-3 h-3 cursor-pointer"
                    />
                    지정하지 않음
                  </label>
                </div>
                <input 
                  type="datetime-local" 
                  value={filters.endDate || ''}
                  onChange={e => setFilters(p => ({ ...p, endDate: e.target.value || null }))}
                  disabled={filters.endDate === null}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          </section>

          <hr className="border-zinc-200 dark:border-zinc-800" />

          {/* Deduplicate Filter */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
              <Filter className="w-4 h-4" /> 중복 응답 처리
            </h3>
            <div className="bg-zinc-50 dark:bg-zinc-950/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-white">최신 응답만 반영</p>
                <p className="text-xs text-zinc-500 mt-1">한 유저가 같은 문항에 여러 번 응답한 경우 가장 최근 답변만 집계합니다.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={filters.deduplicate}
                  onChange={(e) => setFilters(p => ({ ...p, deduplicate: e.target.checked }))}
                />
                <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-zinc-600 peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </section>

          <hr className="border-zinc-200 dark:border-zinc-800" />

          {/* Answer Filters */}
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                <Filter className="w-4 h-4" /> 특정 응답 조건
              </h3>
              
              <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
                <button 
                  onClick={() => setFilters(p => ({ ...p, condition: 'AND' }))}
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${filters.condition === 'AND' ? 'bg-white dark:bg-zinc-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                >
                  AND (모두 만족)
                </button>
                <button 
                  onClick={() => setFilters(p => ({ ...p, condition: 'OR' }))}
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${filters.condition === 'OR' ? 'bg-white dark:bg-zinc-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                >
                  OR (하나라도 만족)
                </button>
              </div>
            </div>

            <p className="text-sm text-zinc-500">선택한 항목에 응답한 유저들의 데이터만 모아서 통계를 재계산합니다.</p>

            <div className="space-y-6">
              {filterableQuestions.map(q => (
                <div key={q.question_id} className="bg-zinc-50 dark:bg-zinc-950/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                  <p className="font-medium text-zinc-900 dark:text-zinc-100 mb-3">{getKoText(q.question_text)}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {Array.isArray(q.options) && q.options.map((opt, idx) => (
                      <label key={idx} className="flex items-start gap-3 p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer transition-colors group">
                        <input 
                          type={q.question_type === 0 ? "radio" : "checkbox"}
                          name={q.question_type === 0 ? `filter-${q.question_id}` : undefined}
                          checked={(filters.answers[q.question_id] || []).includes(String(idx))}
                          onClick={(e) => {
                            if (q.question_type === 0 && (filters.answers[q.question_id] || []).includes(String(idx))) {
                              e.preventDefault()
                              handleAnswerToggle(q.question_id, String(idx), q.question_type)
                            }
                          }}
                          onChange={() => {
                            if (q.question_type !== 0 || !(filters.answers[q.question_id] || []).includes(String(idx))) {
                              handleAnswerToggle(q.question_id, String(idx), q.question_type)
                            }
                          }}
                          className={`mt-1 text-blue-600 focus:ring-blue-500 border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 ${q.question_type === 0 ? 'rounded-full' : 'rounded'}`}
                        />
                        <span className="text-sm text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white line-clamp-2">
                          {getKoText(opt)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              
              {filterableQuestions.length === 0 && (
                <div className="text-center py-8 text-zinc-500">필터링 가능한 객관식 문항이 없습니다.</div>
              )}
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 flex items-center justify-between">
          <button 
            onClick={clearFilters}
            className="text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            필터 초기화
          </button>
          <div className="flex gap-3">
            <button 
              onClick={onClose}
              className="px-5 py-2 text-sm font-medium rounded-lg text-zinc-600 bg-white border border-zinc-200 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-700 transition-colors"
            >
              취소
            </button>
            <button 
              onClick={() => { onApply(filters); onClose(); }}
              className="px-5 py-2 text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all"
            >
              필터 적용
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
