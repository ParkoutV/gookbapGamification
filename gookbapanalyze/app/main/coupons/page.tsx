'use client'

import { useState, useEffect, useRef } from 'react'
import { Gift, Plus, Trash2, AlertCircle, Save, Settings, Info, Columns, Globe, X, HelpCircle } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { SupportedLanguage } from '../tracks/actions'

interface GatchaSetting {
  id: number
  cooldown_hours: number
  cooldown_minutes: number
  aggregation_hours: number
  aggregation_minutes: number
}

interface GatchaCase {
  gatcha_case_id: string
  gatcha_case_name: string
  min_score: number
  max_score: number
}

interface CouponEffect {
  coupon_effect_id: string
  coupon_type: string // JSON string
  description: string // JSON string
  probability: any // JSON object { [case_id]: number }
  expire_days?: number | null
}

const SplitInput = ({ 
  value, 
  minAllowed, 
  maxAllowed, 
  onUpdate 
}: { 
  value: number, 
  minAllowed: number, 
  maxAllowed: number, 
  onUpdate: (val: number) => void 
}) => {
  const [localVal, setLocalVal] = useState(value.toString())
  
  useEffect(() => {
    setLocalVal(value.toString())
  }, [value])

  const handleBlur = () => {
    let num = parseInt(localVal, 10)
    if (isNaN(num)) num = value
    if (num < minAllowed) num = minAllowed
    if (num > maxAllowed) num = maxAllowed
    setLocalVal(num.toString())
    onUpdate(num)
  }

  return (
    <input
      type="number"
      value={localVal}
      onChange={e => setLocalVal(e.target.value)}
      onBlur={handleBlur}
      className="w-24 text-center text-2xl font-black text-gray-800 dark:text-gray-100 bg-transparent border-b-2 border-gray-300 dark:border-zinc-700 outline-none focus:border-blue-500 transition-colors"
    />
  )
}

export default function CouponsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  const [settings, setSettings] = useState<GatchaSetting | null>(null)
  const [gatchaCases, setGatchaCases] = useState<GatchaCase[]>([])
  const [coupons, setCoupons] = useState<CouponEffect[]>([])
  const [activeLanguages, setActiveLanguages] = useState<SupportedLanguage[]>([])
  
  // Modal State for Multilingual text
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCouponIndex, setEditingCouponIndex] = useState<number | null>(null)
  const [modalNameData, setModalNameData] = useState<Record<string, string>>({})
  const [modalDescData, setModalDescData] = useState<Record<string, string>>({})
  
  // Delete Modal State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [couponToDelete, setCouponToDelete] = useState<number | null>(null)

  const fetchAll = async () => {
    setLoading(true)
    const supabase = createClient()
    
    // Fetch Settings
    const { data: setts } = await supabase.from('gatcha_settings').select('*').eq('id', 1).single()
    if (setts) setSettings(setts)

    // Fetch Cases
    const { data: cases } = await supabase.from('gatcha_cases').select('*').order('min_score', { ascending: true })
    if (cases) setGatchaCases(cases)

    // Fetch Coupons
    const { data: coups } = await supabase.from('coupon_effects').select('*').order('created_at', { ascending: true })
    if (coups) setCoupons(coups)

    // Fetch Languages
    const { data: langs } = await supabase.from('supported_languages').select('*').eq('is_active', true).order('order_index')
    if (langs) setActiveLanguages(langs)

    setLoading(false)
  }

  useEffect(() => {
    fetchAll()
  }, [])

  // --- Settings Logic ---
  const handleSettingsChange = (field: keyof GatchaSetting, value: string) => {
    if (!settings) return
    let num = parseInt(value, 10)
    if (isNaN(num)) num = 0
    if (field.includes('hours') && num > 99) num = 99
    if (field.includes('minutes') && num > 59) num = 59
    if (num < 0) num = 0
    
    setSettings({ ...settings, [field]: num })
  }

  const saveSettings = async () => {
    if (!settings) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('gatcha_settings').update(settings).eq('id', 1)
    setSaving(false)
    alert('설정이 저장되었습니다.')
  }

  // --- Gatcha Cases Logic ---
  const handleAddCase = () => {
    if (gatchaCases.length === 0) return
    const newCases = [...gatchaCases]
    const lastCase = newCases[newCases.length - 1]
    
    if (lastCase.max_score - lastCase.min_score < 2) {
      alert('더 이상 분할할 수 없습니다.')
      return
    }

    const mid = Math.floor((lastCase.min_score + lastCase.max_score) / 2)
    const oldMax = lastCase.max_score
    lastCase.max_score = mid

    newCases.push({
      gatcha_case_id: 'new-' + Date.now(), // Temp ID
      gatcha_case_name: '새로운 구간',
      min_score: mid + 1,
      max_score: oldMax
    })
    setGatchaCases(newCases)
  }

  const handleDeleteCase = (index: number) => {
    if (index === 0) return
    const newCases = [...gatchaCases]
    // Merge with previous case
    newCases[index - 1].max_score = newCases[index].max_score
    newCases.splice(index, 1)
    setGatchaCases(newCases)
  }

  const handleCaseSplitUpdate = (index: number, finalVal: number) => {
    // index is the current case, so we are updating gatchaCases[index+1].min_score
    const newCases = [...gatchaCases]
    
    newCases[index + 1].min_score = finalVal
    newCases[index].max_score = finalVal - 1
    
    setGatchaCases(newCases)
  }

  const handleCaseNameChange = (index: number, val: string) => {
    const newCases = [...gatchaCases]
    newCases[index].gatcha_case_name = val
    setGatchaCases(newCases)
  }



  // --- Excel-like Logic ---
  const safeParseJSON = (val: string) => {
    try {
      return JSON.parse(val) || {}
    } catch {
      return {}
    }
  }

  const getKoText = (val: string) => safeParseJSON(val)?.ko || '(입력 필요)'

  // Handle Probability Change
  const handleProbChange = (couponIndex: number, caseId: string, val: string) => {
    const newCoupons = [...coupons]
    let num = parseFloat(val)
    if (isNaN(num) || num < 0) num = 0
    if (num > 100) num = 100
    
    if (!newCoupons[couponIndex].probability) newCoupons[couponIndex].probability = {}
    newCoupons[couponIndex].probability[caseId] = num / 100
    setCoupons(newCoupons)
  }

  // Handle Expire Days Change
  const handleExpireDaysChange = (couponIndex: number, val: string) => {
    const newCoupons = [...coupons]
    if (val === '') {
      newCoupons[couponIndex].expire_days = null
    } else {
      let num = parseInt(val, 10)
      if (isNaN(num)) num = 0
      if (num < 0) num = 0
      if (num > 365) num = 365
      newCoupons[couponIndex].expire_days = num
    }
    setCoupons(newCoupons)
  }

  // Excel Navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) => {
    const numCols = 2 + gatchaCases.length
    const numRows = coupons.length

    if (e.key === 'ArrowUp' && rowIdx > 0) {
      e.preventDefault()
      document.getElementById(`cell-${rowIdx - 1}-${colIdx}`)?.focus()
    } else if (e.key === 'ArrowDown' && rowIdx < numRows - 1) {
      e.preventDefault()
      document.getElementById(`cell-${rowIdx + 1}-${colIdx}`)?.focus()
    } else if (e.key === 'ArrowLeft' && colIdx > 0) {
      // Input cursor movement vs Cell movement
      const target = e.target as HTMLInputElement
      if (target.selectionStart === 0 && target.selectionEnd === 0) {
        e.preventDefault()
        document.getElementById(`cell-${rowIdx}-${colIdx - 1}`)?.focus()
      }
    } else if (e.key === 'ArrowRight' && colIdx < numCols - 1) {
      const target = e.target as HTMLInputElement
      if (target.selectionStart === target.value.length && target.selectionEnd === target.value.length) {
        e.preventDefault()
        document.getElementById(`cell-${rowIdx}-${colIdx + 1}`)?.focus()
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (colIdx === 0) {
        openModal(rowIdx)
      } else {
        if (rowIdx < numRows - 1) {
          document.getElementById(`cell-${rowIdx + 1}-${colIdx}`)?.focus()
        }
      }
    }
  }

  const addCouponRow = () => {
    const newId = 'new-' + Date.now()
    setCoupons([...coupons, {
      coupon_effect_id: newId,
      coupon_type: '{}',
      description: '{}',
      probability: {},
      expire_days: null
    }])
  }

  const confirmRemoveCoupon = (index: number) => {
    setCouponToDelete(index)
    setDeleteModalOpen(true)
  }

  const executeRemoveCoupon = async () => {
    if (couponToDelete === null) return
    const index = couponToDelete
    const c = coupons[index]
    if (!c.coupon_effect_id.startsWith('new-')) {
      const supabase = createClient()
      await supabase.from('coupon_effects').delete().eq('coupon_effect_id', c.coupon_effect_id)
    }
    const newCoupons = [...coupons]
    newCoupons.splice(index, 1)
    setCoupons(newCoupons)
    setDeleteModalOpen(false)
    setCouponToDelete(null)
  }

  const saveAllData = async () => {
    // 1. Verify coverage for Cases
    let currentMin = 0
    let valid = true
    for (const c of gatchaCases) {
      if (c.min_score !== currentMin) valid = false
      currentMin = c.max_score + 1
    }
    if (!valid || currentMin !== 1954) {
      alert('점수 구간이 0부터 1953까지 빈틈없이 설정되어야 합니다.')
      return
    }

    // 2. Validate probabilities sum <= 100% per case
    for (const c of gatchaCases) {
      let sum = 0
      for (const coup of coupons) {
        sum += Number(coup.probability?.[c.gatcha_case_id] || 0)
      }
      if (sum > 1.0001) {
        alert(`"${c.gatcha_case_name}" 구간의 확률 총합이 100%를 초과했습니다. (${(sum*100).toFixed(2)}%)`)
        return
      }
    }

    setSaving(true)
    const supabase = createClient()

    // 3. Delete removed cases from DB
    const { data: dbCases } = await supabase.from('gatcha_cases').select('gatcha_case_id')
    const currentIds = gatchaCases.map(c => c.gatcha_case_id).filter(id => !id.startsWith('new-'))
    const toDelete = dbCases?.filter(dbC => !currentIds.includes(dbC.gatcha_case_id)).map(c => c.gatcha_case_id) || []
    
    if (toDelete.length > 0) {
      await supabase.from('gatcha_cases').delete().in('gatcha_case_id', toDelete)
    }

    // 4. Upsert cases and map new IDs
    const idMap: Record<string, string> = {}
    for (const c of gatchaCases) {
      if (c.gatcha_case_id.startsWith('new-')) {
        const { data: inserted } = await supabase.from('gatcha_cases').insert([{
          gatcha_case_name: c.gatcha_case_name,
          min_score: c.min_score,
          max_score: c.max_score
        }]).select('gatcha_case_id').single()
        
        if (inserted) {
          idMap[c.gatcha_case_id] = inserted.gatcha_case_id
        }
      } else {
        await supabase.from('gatcha_cases').update({
          gatcha_case_name: c.gatcha_case_name,
          min_score: c.min_score,
          max_score: c.max_score
        }).eq('gatcha_case_id', c.gatcha_case_id)
        idMap[c.gatcha_case_id] = c.gatcha_case_id
      }
    }

    // 5. Upsert coupons with mapped probabilities
    for (const coup of coupons) {
      const newProbability: any = {}
      if (coup.probability) {
        for (const oldKey in coup.probability) {
          const newKey = idMap[oldKey]
          if (newKey) {
             newProbability[newKey] = coup.probability[oldKey]
          }
        }
      }

      const payload = {
        coupon_type: coup.coupon_type,
        description: coup.description,
        probability: newProbability,
        expire_days: coup.expire_days || null
      }
      
      if (coup.coupon_effect_id.startsWith('new-')) {
        await supabase.from('coupon_effects').insert([payload])
      } else {
        await supabase.from('coupon_effects').update(payload).eq('coupon_effect_id', coup.coupon_effect_id)
      }
    }

    await fetchAll()
    setSaving(false)
    alert('구간 및 확률표가 성공적으로 저장되었습니다.')
  }

  // --- Multi-lang Modal Logic ---
  const openModal = (index: number) => {
    const existingName = safeParseJSON(coupons[index].coupon_type)
    const existingDesc = safeParseJSON(coupons[index].description)
    
    const initName: Record<string, string> = { ...existingName }
    const initDesc: Record<string, string> = { ...existingDesc }
    
    activeLanguages.forEach(lang => {
      if (!initName[lang.lang_code]) initName[lang.lang_code] = ''
      if (!initDesc[lang.lang_code]) initDesc[lang.lang_code] = ''
    })
    
    setModalNameData(initName)
    setModalDescData(initDesc)
    setEditingCouponIndex(index)
    setIsModalOpen(true)
  }

  const saveModal = () => {
    if (editingCouponIndex === null) return
    const newCoupons = [...coupons]
    
    const existingNameObj = safeParseJSON(newCoupons[editingCouponIndex].coupon_type)
    newCoupons[editingCouponIndex].coupon_type = JSON.stringify({ ...existingNameObj, ...modalNameData })
    
    const existingDescObj = safeParseJSON(newCoupons[editingCouponIndex].description)
    newCoupons[editingCouponIndex].description = JSON.stringify({ ...existingDescObj, ...modalDescData })
    
    setCoupons(newCoupons)
    setIsModalOpen(false)
  }

  if (loading) return <div className="p-12 text-center text-gray-500">로딩 중...</div>

  return (
    <div className="max-w-[90rem] mx-auto pb-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
            <Gift className="w-6 h-6 mr-3 text-purple-600" />
            가챠 시스템 관리
          </h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-2">
            게임 점수 기반 룰렛 규칙과 보상 확률을 종합적으로 관리합니다.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-6 mb-8">
        {/* Settings Box */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm ring-1 ring-gray-200 dark:ring-zinc-800 p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
              <Settings className="w-5 h-5 mr-2 text-gray-500" />
              글로벌 설정
            </h2>
            <button onClick={saveSettings} disabled={saving} className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors">
              설정 저장
            </button>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
                룰렛 쿨타임 (재참여 대기 시간)
              </label>
              <div className="flex items-center gap-2">
                <input type="number" min="0" max="99" value={settings?.cooldown_hours || 0} onChange={e => handleSettingsChange('cooldown_hours', e.target.value)} className="w-20 px-3 py-2 border rounded-lg dark:bg-zinc-950 dark:border-zinc-700 dark:text-white text-center" />
                <span className="text-sm text-gray-600 dark:text-gray-400">시간</span>
                <input type="number" min="0" max="59" value={settings?.cooldown_minutes || 0} onChange={e => handleSettingsChange('cooldown_minutes', e.target.value)} className="w-20 px-3 py-2 border rounded-lg dark:bg-zinc-950 dark:border-zinc-700 dark:text-white text-center" />
                <span className="text-sm text-gray-600 dark:text-gray-400">분</span>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
                최고 점수 집계 기준 시간
              </label>
              <div className="flex items-center gap-2">
                <input type="number" min="0" max="99" value={settings?.aggregation_hours || 0} onChange={e => handleSettingsChange('aggregation_hours', e.target.value)} className="w-20 px-3 py-2 border rounded-lg dark:bg-zinc-950 dark:border-zinc-700 dark:text-white text-center" />
                <span className="text-sm text-gray-600 dark:text-gray-400">시간</span>
                <input type="number" min="0" max="59" value={settings?.aggregation_minutes || 0} onChange={e => handleSettingsChange('aggregation_minutes', e.target.value)} className="w-20 px-3 py-2 border rounded-lg dark:bg-zinc-950 dark:border-zinc-700 dark:text-white text-center" />
                <span className="text-sm text-gray-600 dark:text-gray-400">분</span>
              </div>
              <p className="text-xs text-gray-500 mt-2 flex items-center">
                <Info className="w-3.5 h-3.5 mr-1" />
                위 설정된 최근 시간 이내의 플레이 중 가장 높은 점수를 가져옵니다.
              </p>
            </div>
          </div>
        </div>

        {/* Gatcha Cases Box */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm ring-1 ring-gray-200 dark:ring-zinc-800 p-6 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
              <Columns className="w-5 h-5 mr-2 text-gray-500" />
              구간 (가챠 케이스) 설정
            </h2>
            <div className="flex gap-2">
              <button onClick={handleAddCase} className="text-sm bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-800 dark:text-white px-3 py-1.5 rounded-lg font-medium transition-colors">
                구간 분할
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto flex flex-col items-center py-4 space-y-4">
            <div className="text-xl font-black text-gray-400 dark:text-zinc-600">0</div>
            
            {gatchaCases.map((c, i) => (
              <div key={c.gatcha_case_id} className="flex flex-col items-center w-full space-y-4">
                {/* Case Name Box */}
                <div className="relative w-full max-w-xs group flex items-center justify-center">
                  <input
                    type="text"
                    value={c.gatcha_case_name}
                    onChange={e => handleCaseNameChange(i, e.target.value)}
                    className="w-full text-center text-lg font-bold py-3 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-xl border border-blue-200 dark:border-blue-800/50 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    placeholder="구간명"
                  />
                  {i > 0 && (
                    <button
                      onClick={() => handleDeleteCase(i)}
                      className="absolute right-[-40px] text-red-400 hover:text-red-600 p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="위 구간과 병합 (삭제)"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>

                {/* Score Divider */}
                {i < gatchaCases.length - 1 ? (
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-3">
                      <SplitInput
                        value={gatchaCases[i + 1].min_score}
                        minAllowed={c.min_score + 1}
                        maxAllowed={i === gatchaCases.length - 2 ? 1953 : gatchaCases[i + 2].min_score - 1}
                        onUpdate={(val) => handleCaseSplitUpdate(i, val)}
                      />
                      <span className="text-base font-mono font-medium text-gray-500 dark:text-zinc-400 w-16">
                        {((gatchaCases[i + 1].min_score / 1953) * 100).toFixed(2)}%
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-xl font-black text-gray-400 dark:text-zinc-600">1953</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Excel-like Editor */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm ring-1 ring-gray-200 dark:ring-zinc-800 p-6 overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-6 shrink-0">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
            확률 편집기
          </h2>
          <div className="flex gap-2">
            <button onClick={addCouponRow} className="text-sm bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-800 dark:text-white px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center">
              <Plus className="w-4 h-4 mr-1" />
              쿠폰 추가
            </button>
            <button onClick={saveAllData} disabled={saving} className="text-sm bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded-lg font-bold transition-colors flex items-center shadow-sm">
              <Save className="w-4 h-4 mr-1.5" />
              구간 및 확률 모두 저장
            </button>
          </div>
        </div>

        <div className="w-full overflow-x-auto pb-4">
          <table className="w-full min-w-max border-collapse border border-gray-300 dark:border-zinc-700 rounded-lg overflow-hidden">
            <thead className="bg-gray-100 dark:bg-zinc-800">
              <tr>
                <th className="border-b border-r border-gray-300 dark:border-zinc-700 px-3 py-3 text-xs font-semibold text-gray-700 dark:text-zinc-300 w-12 text-center"></th>
                <th className="border-b border-r border-gray-300 dark:border-zinc-700 px-3 py-3 text-xs font-semibold text-gray-700 dark:text-zinc-300 w-64 text-left">쿠폰 이름</th>
                <th className="border-b border-r border-gray-300 dark:border-zinc-700 px-3 py-3 text-xs font-semibold text-gray-700 dark:text-zinc-300 w-24 text-center align-middle">
                  <div className="flex items-center justify-center gap-1">
                    <span>만료일(일)</span>
                    <div className="relative group flex items-center cursor-help">
                      <HelpCircle className="w-3.5 h-3.5 text-gray-400 hover:text-blue-500 transition-colors" />
                      
                      {/* Tooltip Balloon */}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-56 p-3 bg-gray-900 dark:bg-zinc-100 text-white dark:text-gray-900 text-left text-xs leading-relaxed rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none font-normal font-sans">
                        <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 border-4 border-transparent border-b-gray-900 dark:border-b-zinc-100"></div>
                        <strong className="block mb-0.5 text-blue-300 dark:text-blue-600">0일 입력:</strong> 당일 23:59:59 만료<br/>
                        <strong className="block mt-2 mb-0.5 text-blue-300 dark:text-blue-600">1 이상 입력:</strong> 입력한 N일 뒤의 23:59:59 만료<br/><span className="text-[11px] text-gray-400 dark:text-gray-600">(예: 1일 = 내일 자정 직전 만료)</span><br/>
                        <strong className="block mt-2 mb-0.5 text-blue-300 dark:text-blue-600">빈칸:</strong> 무제한 (기한 없음)
                      </div>
                    </div>
                  </div>
                </th>
                {gatchaCases.map(c => (
                  <th key={c.gatcha_case_id} className="border-b border-gray-300 dark:border-zinc-700 bg-purple-50 dark:bg-purple-900/20 px-4 py-3 text-sm font-bold text-purple-800 dark:text-purple-300 text-right w-40">
                    {c.gatcha_case_name}<br/>
                    <span className="text-[11px] font-normal opacity-75">({c.min_score} ~ {c.max_score})</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coupons.map((coupon, rowIdx) => (
                <tr key={coupon.coupon_effect_id} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors">
                  <td className="border-b border-r border-gray-300 dark:border-zinc-700 p-0">
                    <button onClick={() => confirmRemoveCoupon(rowIdx)} className="w-full h-12 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                  <td className="border-b border-r border-gray-300 dark:border-zinc-700 p-0 relative group">
                    <input
                      id={`cell-${rowIdx}-0`}
                      type="text"
                      readOnly
                      value={getKoText(coupon.coupon_type)}
                      onKeyDown={(e) => handleKeyDown(e, rowIdx, 0)}
                      onClick={() => openModal(rowIdx)}
                      className="w-full h-12 px-3 outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 bg-transparent text-sm font-medium dark:text-white cursor-pointer"
                      placeholder="Enter로 다국어 편집..."
                    />
                  </td>
                  <td className="border-b border-r border-gray-300 dark:border-zinc-700 p-0 relative bg-white dark:bg-zinc-950">
                    <input
                      id={`cell-${rowIdx}-1`}
                      type="number"
                      min="0"
                      max="365"
                      value={coupon.expire_days === null || coupon.expire_days === undefined ? '' : coupon.expire_days}
                      onChange={(e) => handleExpireDaysChange(rowIdx, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, rowIdx, 1)}
                      placeholder="무제한"
                      className="w-full h-12 px-2 text-center outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 bg-transparent text-sm font-bold dark:text-white"
                    />
                  </td>
                  {gatchaCases.map((c, idx) => (
                    <td key={c.gatcha_case_id} className="border-b border-gray-300 dark:border-zinc-700 p-0 relative bg-white dark:bg-zinc-950">
                      <input
                        id={`cell-${rowIdx}-${idx + 2}`}
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={((coupon.probability?.[c.gatcha_case_id] || 0) * 100).toFixed(2).replace(/\.00$/, '')}
                        onChange={(e) => handleProbChange(rowIdx, c.gatcha_case_id, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, rowIdx, idx + 2)}
                        className="w-full h-12 px-8 text-right outline-none focus:ring-2 focus:ring-inset focus:ring-purple-500 bg-transparent text-base font-bold dark:text-white font-mono"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400 pointer-events-none opacity-50">%</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="border-r border-gray-300 dark:border-zinc-700 bg-gray-100 dark:bg-zinc-800 px-4 py-3 text-sm font-bold text-gray-700 dark:text-zinc-300 text-right">
                  확률 총합 검증 (100% 이하여야 함)
                </td>
                {gatchaCases.map(c => {
                  let sum = 0
                  coupons.forEach(coup => {
                    sum += Number(coup.probability?.[c.gatcha_case_id] || 0)
                  })
                  const sumPercent = (sum * 100).toFixed(2)
                  const isOver = sum > 1.0001
                  return (
                    <td key={`sum-${c.gatcha_case_id}`} className={`px-4 py-3 text-base font-black text-right font-mono ${isOver ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400' : 'bg-gray-50 text-green-600 dark:bg-zinc-800/80 dark:text-green-400'}`}>
                      {sumPercent}%
                    </td>
                  )
                })}
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-xs text-gray-500 mt-2 flex items-center">
          <Info className="w-3.5 h-3.5 mr-1" />
          방향키(상하좌우)를 이용해 엑셀처럼 자유롭게 이동할 수 있습니다. 텍스트 칸에서 Enter를 누르면 다국어 편집창이 열립니다. 변경 후 반드시 '모두 저장'을 눌러주세요.
        </p>
      </div>

      {/* Multilingual Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="relative bg-white dark:bg-zinc-900 rounded-xl shadow-xl w-full max-w-lg ring-1 ring-gray-200 dark:ring-zinc-800 flex flex-col">
            <div className="p-5 border-b border-gray-100 dark:border-zinc-800 flex justify-between items-center shrink-0">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
                <Globe className="w-5 h-5 mr-2 text-blue-500" />
                다국어 텍스트 편집
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 overflow-y-auto max-h-[60vh] space-y-4">
              {activeLanguages.map(lang => (
                <div key={lang.lang_code} className="p-4 bg-gray-50 dark:bg-zinc-800/50 rounded-lg">
                  <div className="mb-2">
                    <span className="text-xs font-bold px-2 py-1 bg-gray-200 dark:bg-zinc-700 rounded text-gray-700 dark:text-zinc-300 uppercase">
                      {lang.lang_code} - {lang.lang_name}
                    </span>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">쿠폰 이름</label>
                      <input
                        type="text"
                        value={modalNameData[lang.lang_code] || ''}
                        onChange={(e) => setModalNameData({ ...modalNameData, [lang.lang_code]: e.target.value })}
                        className="w-full px-3 py-2 text-sm rounded border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">쿠폰 설명</label>
                      <textarea
                        rows={2}
                        value={modalDescData[lang.lang_code] || ''}
                        onChange={(e) => setModalDescData({ ...modalDescData, [lang.lang_code]: e.target.value })}
                        className="w-full px-3 py-2 text-sm rounded border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="p-5 border-t border-gray-100 dark:border-zinc-800 flex justify-end gap-3 shrink-0">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors">
                취소
              </button>
              <button onClick={saveModal} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                적용하기
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteModalOpen(false)} />
          <div className="relative bg-white dark:bg-zinc-900 rounded-xl shadow-xl w-full max-w-sm ring-1 ring-gray-200 dark:ring-zinc-800 flex flex-col p-6">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <AlertCircle className="w-6 h-6" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">쿠폰 삭제 경고</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
              이 쿠폰을 정말 삭제하시겠습니까?<br/><br/>
              <strong className="text-red-500 font-bold">경고:</strong> 쿠폰을 삭제하면 기존 유저가 이미 발급받은 쿠폰 데이터도 삭제되거나 시스템 오류가 발생할 수 있습니다. 가급적 확률을 0%로 조정하는 것을 권장합니다.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors">
                취소
              </button>
              <button onClick={executeRemoveCoupon} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors shadow-sm">
                강제 삭제하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
