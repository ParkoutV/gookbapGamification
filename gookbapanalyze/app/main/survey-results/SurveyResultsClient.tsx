'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Filter, ChevronDown, ChevronUp, Loader2, Inbox, CalendarX2 } from 'lucide-react'
import { fetchSurveyData } from './actions'
import SurveyFilterModal, { SurveyFilterState } from '@/components/SurveyFilterModal'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'

interface Branch {
  branch_id: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  branch_name: any
}

interface Question {
  question_id: string
  survey_phase: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  question_text: any
  question_type: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any[]
  order_index: number
  branch_id: string | null
}

interface ResponseRow {
  response_id: string
  question_id: string
  participant_id: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  answer_data: any
  created_at: string
}

interface Props {
  permission: number
  assignedBranchId: string | null
  branches: Branch[]
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1']

export default function SurveyResultsClient({ permission, assignedBranchId, branches }: Props) {
  const [questions, setQuestions] = useState<Question[]>([])
  const [responses, setResponses] = useState<ResponseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    permission === 1 ? (assignedBranchId || '') : '' // '' means all branches for Admin
  )

  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [filters, setFilters] = useState<SurveyFilterState>({
    startDate: null,
    endDate: null,
    answers: {},
    condition: 'AND'
  })

  const [expandedPhases, setExpandedPhases] = useState<Record<number, boolean>>({
    0: true, 1: true, 2: true
  })

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const data = await fetchSurveyData()
      setQuestions(data.questions)
      setResponses(data.responses)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || '데이터를 불러오는 데 실패했습니다.')
      } else {
        setError('데이터를 불러오는 데 실패했습니다.')
      }
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getKoText = (val: any) => {
    if (typeof val === 'string') {
      try { return JSON.parse(val).ko || val } catch { return val }
    }
    return val?.ko || ''
  }

  // --- Filtering Logic ---
  const filteredParticipants = useMemo(() => {
    if (!responses.length) return new Set<string>()

    // 1. Filter responses by date first to get valid pool
    let validResponses = responses
    if (filters.startDate) {
      const start = new Date(filters.startDate).getTime()
      validResponses = validResponses.filter(r => new Date(r.created_at).getTime() >= start)
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate).getTime()
      validResponses = validResponses.filter(r => new Date(r.created_at).getTime() <= end)
    }

    // All participants in the valid date range
    const participantIds = new Set(validResponses.map(r => r.participant_id))

    // 2. Filter by specific answers if any are set
    const filterQIds = Object.keys(filters.answers)
    if (filterQIds.length > 0) {
      const condition = filters.condition
      
      const filteredSet = new Set<string>()
      
      for (const pId of Array.from(participantIds)) {
        const pResponses = validResponses.filter(r => r.participant_id === pId)
        
        // Check condition for this participant
        let passes = condition === 'AND' ? true : false

        for (const qId of filterQIds) {
          const requiredOptIndices = filters.answers[qId] // array of strings
          const rRow = pResponses.find(r => r.question_id === qId)
          
          let hasMatched = false
          if (rRow && rRow.answer_data != null) {
            let userAns: string[] = []
            // Parse user answer
            if (typeof rRow.answer_data === 'string') {
              try {
                const parsed = JSON.parse(rRow.answer_data)
                if (Array.isArray(parsed)) userAns = parsed.map(String)
                else userAns = [String(rRow.answer_data)]
              } catch {
                userAns = [String(rRow.answer_data)]
              }
            } else if (Array.isArray(rRow.answer_data)) {
              userAns = rRow.answer_data.map(String)
            } else {
              userAns = [String(rRow.answer_data)]
            }

            // Check if userAns contains ANY of the required options
            // (If they checked "A" and "B" for a single question filter, usually means they answered A OR B)
            // Or it could mean they selected BOTH if it's a multi-choice question.
            // We'll treat multiple checkboxes on the *same* question as an OR condition for that specific question,
            // because you usually can't be "Male" AND "Female" at the same time. But for multi-choice, you can.
            // Let's check if the user's answer array intersects with the required array.
            hasMatched = requiredOptIndices.some(opt => userAns.includes(opt))
          }

          if (condition === 'AND') {
            if (!hasMatched) {
              passes = false
              break
            }
          } else { // OR
            if (hasMatched) {
              passes = true
              break
            }
          }
        }

        if (passes) {
          filteredSet.add(pId)
        }
      }
      return filteredSet
    }

    return participantIds
  }, [responses, filters])

  const filteredResponses = useMemo(() => {
    return responses.filter(r => filteredParticipants.has(r.participant_id))
  }, [responses, filteredParticipants])

  // --- Render Helpers ---

  const renderType0 = (q: Question, qResponses: ResponseRow[]) => {
    const counts: Record<string, number> = {}
    q.options.forEach((_, idx) => counts[idx] = 0)
    
    qResponses.forEach(r => {
      let idx = String(r.answer_data)
      try { const p = JSON.parse(idx); if(typeof p === 'number') idx = String(p) } catch {}
      if (counts[idx] !== undefined) counts[idx]++
    })

    const data = q.options.map((opt, idx) => ({
      name: getKoText(opt),
      value: counts[idx],
    })).filter(d => d.value > 0) // only show answered options

    if (data.length === 0) return <div className="text-zinc-400 text-sm py-4">응답 데이터가 없습니다.</div>

    return (
      <div className="h-80 w-full relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="40%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none">
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <RechartsTooltip 
              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}
              itemStyle={{ fontWeight: 600 }}
            />
            <Legend verticalAlign="bottom" align="center" layout="horizontal" iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    )
  }

  const renderType1 = (q: Question, qResponses: ResponseRow[]) => {
    const counts: Record<string, number> = {}
    q.options.forEach((_, idx) => counts[idx] = 0)
    
    qResponses.forEach(r => {
      let arr: string[] = []
      if (typeof r.answer_data === 'string') {
        try {
          const parsed = JSON.parse(r.answer_data)
          if (Array.isArray(parsed)) arr = parsed.map(String)
          else arr = [String(r.answer_data)]
        } catch { arr = [String(r.answer_data)] }
      } else if (Array.isArray(r.answer_data)) {
        arr = r.answer_data.map(String)
      } else {
        arr = [String(r.answer_data)]
      }
      
      arr.forEach(idx => {
        if (counts[idx] !== undefined) counts[idx]++
      })
    })

    const data = q.options.map((opt, idx) => ({
      name: getKoText(opt),
      count: counts[idx],
    }))

    if (data.every(d => d.count === 0)) return <div className="text-zinc-400 text-sm py-4">응답 데이터가 없습니다.</div>

    return (
      <div className="h-64 w-full relative">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e4e4e7" />
            <XAxis type="number" hide />
            <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12, fill: '#71717a' }} axisLine={false} tickLine={false} />
            <RechartsTooltip 
              cursor={{ fill: 'rgba(0,0,0,0.04)' }}
              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}
            />
            <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }

  const renderType2 = (q: Question, qResponses: ResponseRow[]) => {
    const validAns = qResponses.map(r => {
      if (typeof r.answer_data === 'string') return r.answer_data
      if (r.answer_data && typeof r.answer_data === 'object' && r.answer_data.text) return r.answer_data.text
      return JSON.stringify(r.answer_data)
    }).filter(a => a && a.trim() !== '' && a !== 'null')

    if (validAns.length === 0) return <div className="text-zinc-400 text-sm py-4">응답 데이터가 없습니다.</div>

    return (
      <div className="max-h-64 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
        {validAns.map((ans, idx) => (
          <div key={idx} className="bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded-lg text-sm text-zinc-700 dark:text-zinc-300 border border-zinc-100 dark:border-zinc-800/50">
            {ans}
          </div>
        ))}
      </div>
    )
  }

  const togglePhase = (phase: number) => {
    setExpandedPhases(prev => ({ ...prev, [phase]: !prev[phase] }))
  }

  const getBranchName = (bId: string) => {
    if (!bId) return '전체 지점'
    const b = branches.find(x => x.branch_id === bId)
    return b ? getKoText(b.branch_name) : bId
  }

  const renderPhaseBlock = (phase: number, title: string, description: string) => {
    if (permission === 1 && phase === 2 && !selectedBranchId) {
      // User must have assignedBranchId, if missing, don't show Phase 2 or show error
    }

    let phaseQuestions = questions.filter(q => q.survey_phase === phase)
    
    // For Phase 2, filter questions by selectedBranchId
    if (phase === 2) {
      if (selectedBranchId !== '') {
        phaseQuestions = phaseQuestions.filter(q => q.branch_id === selectedBranchId)
      } else {
        // If Admin selects "All Branches", we group questions by branch or just show them all
        // It's usually better to just show all phase 2 questions across all branches if selectedBranchId === ''
      }
    }

    if (phaseQuestions.length === 0) return null

    return (
      <div key={phase} className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl rounded-2xl shadow-sm border border-zinc-200/60 dark:border-zinc-800/60 overflow-hidden mb-8 transition-all hover:shadow-md">
        <div 
          className="px-6 py-5 flex items-center justify-between cursor-pointer group"
          onClick={() => togglePhase(phase)}
        >
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold bg-gradient-to-r from-zinc-800 to-zinc-500 dark:from-white dark:to-zinc-400 bg-clip-text text-transparent">{title}</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                {phaseQuestions.length}문항
              </span>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{description}</p>
          </div>
          <div className="flex items-center gap-4">
            {phase === 2 && permission === 0 && (
              <select
                className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm shadow-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              >
                <option value="">전체 지점</option>
                {branches.map(b => (
                  <option key={b.branch_id} value={b.branch_id}>
                    {getKoText(b.branch_name)}
                  </option>
                ))}
              </select>
            )}
            {phase === 2 && permission === 1 && (
              <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 px-3 py-1 rounded-lg">
                내 지점: {getBranchName(selectedBranchId)}
              </span>
            )}
            <div className="p-2 rounded-full bg-zinc-100 dark:bg-zinc-800 group-hover:bg-zinc-200 dark:group-hover:bg-zinc-700 transition-colors">
              {expandedPhases[phase] ? <ChevronUp className="w-5 h-5 text-zinc-600 dark:text-zinc-300" /> : <ChevronDown className="w-5 h-5 text-zinc-600 dark:text-zinc-300" />}
            </div>
          </div>
        </div>
        
        <div className={`transition-all duration-300 ease-in-out ${expandedPhases[phase] ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
          <div className="p-6 bg-zinc-50/50 dark:bg-zinc-950/50 border-t border-zinc-100 dark:border-zinc-800/60">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {phaseQuestions.map((q) => {
                const qRes = filteredResponses.filter(r => r.question_id === q.question_id)
                return (
                  <div key={q.question_id} className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-100 dark:border-zinc-800 shadow-sm hover:shadow-md transition-shadow">
                    <div className="mb-6 flex justify-between items-start gap-4">
                      <h3 className="font-semibold text-lg text-zinc-900 dark:text-white leading-snug">
                        {getKoText(q.question_text)}
                      </h3>
                      <span className="shrink-0 px-2 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 text-xs font-semibold rounded-md">
                        {qRes.length}명 응답
                      </span>
                    </div>
                    
                    <div className="mt-4">
                      {q.question_type === 0 && renderType0(q, qRes)}
                      {q.question_type === 1 && renderType1(q, qRes)}
                      {q.question_type === 2 && renderType2(q, qRes)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
        <p className="text-zinc-500 font-medium">데이터를 분석하고 있습니다...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 p-6 rounded-xl text-center font-medium border border-red-100 dark:border-red-900/50">
        {error}
      </div>
    )
  }

  const activeFilterCount = (filters.startDate || filters.endDate ? 1 : 0) + Object.keys(filters.answers).length
  const totalParticipants = new Set(responses.map(r => r.participant_id)).size
  const currentParticipantsCount = filteredParticipants.size

  return (
    <div className="space-y-6">
      {/* Top Filter Bar */}
      <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-zinc-200/60 dark:border-zinc-800/60 p-4 rounded-2xl shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">총 응답자 수</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-zinc-900 dark:text-white">{currentParticipantsCount.toLocaleString()}</span>
              {activeFilterCount > 0 && (
                <span className="text-sm text-zinc-500 font-medium">/ {totalParticipants.toLocaleString()}명</span>
              )}
            </div>
          </div>
        </div>

        <button 
          onClick={() => setIsFilterModalOpen(true)}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all ${
            activeFilterCount > 0 
              ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 border border-blue-200 dark:border-blue-800' 
              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
          }`}
        >
          <Filter className="w-5 h-5" />
          <span>필터 적용</span>
          {activeFilterCount > 0 && (
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-xs">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {activeFilterCount > 0 && currentParticipantsCount === 0 && (
        <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-900/30">
          <div className="flex items-center gap-3">
            <CalendarX2 className="w-5 h-5 text-red-500" />
            <p className="text-sm font-medium text-red-600 dark:text-red-400">필터 조건에 맞는 응답자가 없습니다. 전체 문항이 '응답 데이터 없음'으로 표시됩니다.</p>
          </div>
          <button 
            onClick={() => setFilters({ startDate: null, endDate: null, answers: {}, condition: 'AND' })}
            className="text-sm text-red-600 dark:text-red-400 font-bold hover:underline"
          >
            필터 초기화
          </button>
        </div>
      )}

      <div className="space-y-4 pb-24">
        {permission === 0 && renderPhaseBlock(0, "힌트 질문 (Phase 0)", "게임을 시작하거나 힌트를 얻기 전에 묻는 질문의 결과입니다.")}
        {permission === 0 && renderPhaseBlock(1, "쿠폰 받기 전 질문 (Phase 1)", "게임을 클리어하고 쿠폰을 발급받기 전에 묻는 질문의 결과입니다.")}
        {renderPhaseBlock(2, "지점 특화 질문 (Phase 2)", "특정 지점에서만 물어보는 특화 질문의 결과입니다.")}
      </div>

      <SurveyFilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        questions={questions}
        initialFilters={filters}
        onApply={setFilters}
      />
    </div>
  )
}
