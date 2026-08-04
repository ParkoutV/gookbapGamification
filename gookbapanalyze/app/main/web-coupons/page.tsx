'use client'

import { useState, useEffect, useRef } from 'react'
import { Ticket, Plus, Trash2, Save, Globe, X, Upload, FileSpreadsheet, RefreshCw, AlertCircle, MessageSquare } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { SupportedLanguage } from '../tracks/actions'
import * as XLSX from 'xlsx'

interface WebCoupon {
  id: string
  coupon_code: string
  participant_id: string | null
  assigned_at: string | null
  created_at: string
}

interface WebCouponSettings {
  id: number
  title: any
  description: any
}

const safeParseJSON = (val: any) => {
  if (typeof val === 'object') return val || {}
  try { return JSON.parse(val) || {} } catch { return {} }
}

export default function WebCouponsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [coupons, setCoupons] = useState<WebCoupon[]>([])
  const [settings, setSettings] = useState<WebCouponSettings | null>(null)
  const [activeLanguages, setActiveLanguages] = useState<SupportedLanguage[]>([])
  
  // Stats
  const [stats, setStats] = useState({ total: 0, last24h: 0, last1w: 0, remaining: 0 })

  // Pagination
  const [page, setPage] = useState(0)
  const pageSize = 50

  // Checkbox selection
  const [selectedCoupons, setSelectedCoupons] = useState<Set<string>>(new Set())

  // Multi-lang Modal
  const [isLangModalOpen, setIsLangModalOpen] = useState(false)
  const [modalNameData, setModalNameData] = useState<Record<string, string>>({})
  const [modalDescData, setModalDescData] = useState<Record<string, string>>({})

  // Text Upload
  const [textUpload, setTextUpload] = useState('')

  // Excel Modal
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false)
  const [excelData, setExcelData] = useState<string[][]>([])
  const [headerRowIdx, setHeaderRowIdx] = useState<number>(0)
  const [recommendedCol, setRecommendedCol] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchAll = async () => {
    setLoading(true)
    const supabase = createClient()
    
    const { data: langs } = await supabase.from('supported_languages').select('*').eq('is_active', true).order('order_index')
    if (langs) setActiveLanguages(langs)

    const { data: setts } = await supabase.from('web_coupon_settings').select('*').eq('id', 1).single()
    if (setts) setSettings(setts)

    const { count: totalCount } = await supabase.from('web_coupons').select('id', { count: 'exact', head: true })
    const { count: remainingCount } = await supabase.from('web_coupons').select('id', { count: 'exact', head: true }).is('participant_id', null)
    
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    
    const { count: count24h } = await supabase.from('web_coupons').select('id', { count: 'exact', head: true }).not('participant_id', 'is', null).gte('assigned_at', oneDayAgo)
    const { count: count1w } = await supabase.from('web_coupons').select('id', { count: 'exact', head: true }).not('participant_id', 'is', null).gte('assigned_at', oneWeekAgo)
    
    setStats({
      total: totalCount || 0,
      last24h: count24h || 0,
      last1w: count1w || 0,
      remaining: remainingCount || 0
    })

    fetchPage(0)
    setLoading(false)
  }

  const fetchPage = async (pageIdx: number) => {
    const supabase = createClient()
    const { data } = await supabase.from('web_coupons')
      .select('*')
      .order('created_at', { ascending: false })
      .range(pageIdx * pageSize, (pageIdx + 1) * pageSize - 1)
    
    if (data) {
      setCoupons(data)
      setPage(pageIdx)
      setSelectedCoupons(new Set())
    }
  }

  useEffect(() => {
    fetchAll()
  }, [])

  const openLangModal = () => {
    if (!settings) return
    const initName: Record<string, string> = { ...safeParseJSON(settings.title) }
    const initDesc: Record<string, string> = { ...safeParseJSON(settings.description) }
    
    activeLanguages.forEach(lang => {
      if (!initName[lang.lang_code]) initName[lang.lang_code] = ''
      if (!initDesc[lang.lang_code]) initDesc[lang.lang_code] = ''
    })
    
    setModalNameData(initName)
    setModalDescData(initDesc)
    setIsLangModalOpen(true)
  }

  const saveLangModal = async () => {
    setSaving(true)
    const supabase = createClient()
    const payload = { title: modalNameData, description: modalDescData }
    await supabase.from('web_coupon_settings').update(payload).eq('id', 1)
    setSettings({ id: 1, ...payload })
    setIsLangModalOpen(false)
    setSaving(false)
    alert('다국어 설정이 저장되었습니다.')
  }

  // --- Upsert Logic ---
  const bulkInsertCoupons = async (codes: string[]) => {
    if (codes.length === 0) return
    setSaving(true)
    const supabase = createClient()
    const uniqueCodes = Array.from(new Set(codes)).filter(c => c.trim().length > 0)
    
    const batchSize = 1000
    let inserted = 0
    let duplicates = 0
    
    for (let i = 0; i < uniqueCodes.length; i += batchSize) {
      const batch = uniqueCodes.slice(i, i + batchSize).map(code => ({ coupon_code: code }))
      
      const { data, error } = await supabase.from('web_coupons').upsert(batch, { 
        onConflict: 'coupon_code', 
        ignoreDuplicates: true 
      }).select('id')
      
      if (!error && data) {
        inserted += data.length
        duplicates += (batch.length - data.length)
      } else if (error) {
        console.error(error)
      }
    }
    
    setSaving(false)
    alert(`업로드 완료!\n성공: ${inserted}개 등록됨\n중복 무시: ${duplicates}개`)
    setTextUpload('')
    setIsExcelModalOpen(false)
    setExcelData([])
    fetchAll()
  }

  const handleTextUpload = () => {
    const codes = textUpload.split(/[\n\s,]+/).map(c => c.trim()).filter(c => c)
    if (codes.length === 0) {
      alert('입력된 쿠폰이 없습니다.')
      return
    }
    bulkInsertCoupons(codes)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (evt) => {
      const bstr = evt.target?.result
      const wb = XLSX.read(bstr, { type: 'binary' })
      const wsname = wb.SheetNames[0]
      const ws = wb.Sheets[wsname]
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as string[][]
      
      const filtered = data.filter(row => row.length > 0)
      if (filtered.length === 0) {
        alert('엑셀에 데이터가 없습니다.')
        return
      }

      setExcelData(filtered)
      
      // Auto-detect header row (first row with >= 2 columns)
      let detectedHeaderIdx = 0
      for (let i = 0; i < Math.min(10, filtered.length); i++) {
        const nonEmptyCols = filtered[i].filter(cell => cell !== undefined && cell !== null && String(cell).trim() !== '').length
        if (nonEmptyCols >= 2) {
           detectedHeaderIdx = i
           break
        }
      }
      
      setHeaderRowIdx(detectedHeaderIdx)
      checkRecommendation(filtered, detectedHeaderIdx)
      
      setIsExcelModalOpen(true)
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  const checkRecommendation = (data: string[][], headerIdx: number) => {
    try {
      const saved = localStorage.getItem('webCouponExcelStructure')
      if (saved) {
        const parsed = JSON.parse(saved)
        const currentHeaderHash = data[headerIdx].map(String).join(',')
        if (parsed.headerHash === currentHeaderHash) {
          setRecommendedCol(parsed.selectedCol)
        } else {
          setRecommendedCol(null)
        }
      }
    } catch { setRecommendedCol(null) }
  }

  const handleSetHeader = (idx: number) => {
    setHeaderRowIdx(idx)
    checkRecommendation(excelData, idx)
  }

  const handleColumnSelect = (colIndex: number) => {
    // Save to local storage for future recommendations
    const currentHeaderHash = excelData[headerRowIdx].map(String).join(',')
    localStorage.setItem('webCouponExcelStructure', JSON.stringify({
      headerHash: currentHeaderHash,
      selectedCol: colIndex
    }))

    const codes = excelData.slice(headerRowIdx + 1).map(row => (row[colIndex] || '').toString().trim()).filter(c => c)
    if (codes.length === 0) {
      alert('해당 열에 쿠폰 데이터가 없습니다.')
      return
    }
    bulkInsertCoupons(codes)
  }

  // --- Multi-select Actions Logic ---
  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedCoupons)
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
    setSelectedCoupons(newSet)
  }
  
  const toggleSelectAll = () => {
    if (selectedCoupons.size === coupons.length && coupons.length > 0) {
      setSelectedCoupons(new Set())
    } else {
      setSelectedCoupons(new Set(coupons.map(c => c.id)))
    }
  }

  const handleBulkProcess = async (overrideSelected?: Set<string>) => {
    const couponsToProcess = overrideSelected || selectedCoupons;
    const targetIdsToDelete = Array.from(couponsToProcess).filter(id => !coupons.find(c => c.id === id)?.participant_id)
    const assignedCouponsToReplace = coupons.filter(c => couponsToProcess.has(c.id) && c.participant_id)
    
    if (targetIdsToDelete.length === 0 && assignedCouponsToReplace.length === 0) {
      alert('선택된 쿠폰이 없습니다.')
      return
    }

    if (!confirm(`총 ${couponsToProcess.size}개의 쿠폰을 처리하시겠습니까?\n- 미배정 쿠폰 삭제: ${targetIdsToDelete.length}개\n- 기배정 쿠폰 재배정(기존 삭제): ${assignedCouponsToReplace.length}개\n\n(안전한 충돌 방지를 위해 '삭제' 로직이 우선적으로 수행됩니다)`)) return
    
    setSaving(true)
    const supabase = createClient()
    
    if (assignedCouponsToReplace.length > 0) {
      // Fetch all unassigned coupons to check if we have enough AFTER deletion
      const { data: availableUnassigned } = await supabase.from('web_coupons')
        .select('id, coupon_code')
        .is('participant_id', null)
        .order('created_at', { ascending: false })
      
      // Filter out the ones that are about to be deleted
      const trulyAvailable = availableUnassigned?.filter(c => !targetIdsToDelete.includes(c.id)) || []

      if (trulyAvailable.length < assignedCouponsToReplace.length) {
        alert(`삭제 후 재배정할 미배정 쿠폰이 부족합니다!\n필요: ${assignedCouponsToReplace.length}개, 남은 쿠폰: ${trulyAvailable.length}개\n\n먼저 새로운 쿠폰을 추가로 등록해 주세요.`)
        setSaving(false)
        return
      }

      // Priority 1: Deletion
      if (targetIdsToDelete.length > 0) {
        await supabase.from('web_coupons').delete().in('id', targetIdsToDelete)
      }

      // Priority 2: Reassignment
      for (let i = 0; i < assignedCouponsToReplace.length; i++) {
        const oldCoupon = assignedCouponsToReplace[i]
        const newCoupon = trulyAvailable[i]
        await supabase.from('web_coupons').update({ participant_id: oldCoupon.participant_id, assigned_at: new Date().toISOString() }).eq('id', newCoupon.id)
        await supabase.from('web_coupons').delete().eq('id', oldCoupon.id)
      }
    } else {
      // Only deletion is required
      await supabase.from('web_coupons').delete().in('id', targetIdsToDelete)
    }

    alert(`처리가 완료되었습니다!\n- 삭제: ${targetIdsToDelete.length}개\n- 재배정: ${assignedCouponsToReplace.length}개`)
    setSaving(false)
    setSelectedCoupons(new Set())
    fetchAll()
  }

  if (loading && stats.total === 0) return <div className="p-12 text-center text-gray-500">로딩 중...</div>

  return (
    <div className="max-w-[90rem] mx-auto pb-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
            <Ticket className="w-6 h-6 mr-3 text-blue-600" />
            웹페이지 할인 쿠폰 관리
          </h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-2">
            외부 엑셀/텍스트를 통해 쿠폰 번호를 대량 등록하고, 100% 확정 지급용 쿠폰으로 사용할 수 있습니다. 중복 쿠폰은 등록 시 자동 무시됩니다.
          </p>
        </div>
        <button onClick={openLangModal} className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center">
          <Globe className="w-4 h-4 mr-2" />
          쿠폰 제목/설명 다국어 설정
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl shadow-sm ring-1 ring-gray-200 dark:ring-zinc-800">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">총 등록된 쿠폰</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total.toLocaleString()}개</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl shadow-sm ring-1 ring-gray-200 dark:ring-zinc-800">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">최근 24시간 배정</p>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.last24h.toLocaleString()}개</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl shadow-sm ring-1 ring-gray-200 dark:ring-zinc-800">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">최근 1주일 배정</p>
          <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.last1w.toLocaleString()}개</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl shadow-sm ring-1 ring-gray-200 dark:ring-zinc-800 border-l-4 border-l-red-500">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">남은(미배정) 쿠폰</p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.remaining.toLocaleString()}개</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8 mb-8">
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm ring-1 ring-gray-200 dark:ring-zinc-800 p-6">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center mb-4">
            <Upload className="w-5 h-5 mr-2 text-gray-500" />
            텍스트 기반 쿠폰 등록
          </h2>
          <textarea
            value={textUpload}
            onChange={e => setTextUpload(e.target.value)}
            placeholder="엔터 또는 띄어쓰기로 여러 개의 쿠폰 번호를 구분해 붙여넣으세요..."
            className="w-full h-32 p-3 bg-gray-50 dark:bg-zinc-950 border border-gray-300 dark:border-zinc-700 rounded-lg text-sm mb-4 outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button onClick={handleTextUpload} disabled={saving} className="w-full bg-gray-800 hover:bg-gray-900 dark:bg-white dark:hover:bg-gray-100 dark:text-gray-900 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center">
            <Plus className="w-4 h-4 mr-2" />
            텍스트 쿠폰 일괄 등록 (중복 무시)
          </button>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm ring-1 ring-gray-200 dark:ring-zinc-800 p-6 flex flex-col justify-center items-center">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center mb-6 w-full justify-start">
            <FileSpreadsheet className="w-5 h-5 mr-2 text-green-600" />
            엑셀/CSV 쿠폰 업로드
          </h2>
          <p className="text-sm text-gray-500 dark:text-zinc-400 text-center mb-6">
            이전 업로드 구조를 자동으로 기억합니다.<br/>헤더를 자동 감지하고 동일한 구조일 시 추출 열을 추천합니다.
          </p>
          <input
            type="file"
            accept=".xlsx, .xls, .csv"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
          />
          <button onClick={() => fileInputRef.current?.click()} disabled={saving} className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-colors flex items-center shadow-sm">
            <FileSpreadsheet className="w-5 h-5 mr-2" />
            파일 선택하여 스마트 업로드
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm ring-1 ring-gray-200 dark:ring-zinc-800 overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-zinc-800 flex justify-between items-center bg-gray-50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mr-4">데이터 관리</h2>
            {selectedCoupons.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-1 rounded-full border border-blue-200 dark:border-blue-800">
                  {selectedCoupons.size}개 선택됨
                </span>
                <button onClick={() => handleBulkProcess()} disabled={saving} className="text-sm bg-white dark:bg-zinc-800 border border-indigo-200 dark:border-indigo-900/50 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 px-3 py-1.5 rounded-lg font-medium transition-colors">
                  선택 일괄 처리 (삭제/재배정)
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => fetchPage(page > 0 ? page - 1 : 0)} disabled={page === 0} className="text-sm text-gray-600 hover:text-black dark:text-gray-400 dark:hover:text-white disabled:opacity-50">이전</button>
            <span className="text-sm text-gray-500">{page + 1} 페이지</span>
            <button onClick={() => fetchPage(page + 1)} disabled={coupons.length < pageSize} className="text-sm text-gray-600 hover:text-black dark:text-gray-400 dark:hover:text-white disabled:opacity-50">다음</button>
            <button onClick={() => { fetchAll() }} className="ml-4 p-2 bg-gray-100 dark:bg-zinc-800 rounded-lg hover:bg-gray-200 dark:hover:bg-zinc-700"><RefreshCw className="w-4 h-4 text-gray-600 dark:text-gray-300" /></button>
          </div>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 dark:bg-zinc-900/50">
              <th className="px-6 py-3 w-12 border-b border-gray-200 dark:border-zinc-800 text-center">
                <input 
                  type="checkbox" 
                  checked={selectedCoupons.size === coupons.length && coupons.length > 0} 
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 bg-white"
                />
              </th>
              <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-zinc-400 border-b border-gray-200 dark:border-zinc-800">쿠폰 번호</th>
              <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-zinc-400 border-b border-gray-200 dark:border-zinc-800">상태</th>
              <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-zinc-400 border-b border-gray-200 dark:border-zinc-800">배정 일시</th>
              <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-zinc-400 border-b border-gray-200 dark:border-zinc-800 text-right">개별 관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/50">
            {coupons.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-zinc-800/20">
                <td className="px-6 py-3 text-center">
                  <input 
                    type="checkbox" 
                    checked={selectedCoupons.has(c.id)}
                    onChange={() => toggleSelect(c.id)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 bg-white"
                  />
                </td>
                <td className="px-6 py-3 text-sm font-medium text-gray-900 dark:text-white font-mono">{c.coupon_code}</td>
                <td className="px-6 py-3">
                  {c.participant_id ? (
                    <span className="px-2 py-1 text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                      배정 완료
                    </span>
                  ) : (
                    <span className="px-2 py-1 text-xs font-semibold bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-gray-400 rounded-full">
                      미배정
                    </span>
                  )}
                </td>
                <td className="px-6 py-3 text-sm text-gray-500 dark:text-zinc-400">
                  {c.assigned_at ? new Date(c.assigned_at).toLocaleString() : '-'}
                </td>
                <td className="px-6 py-3 text-right flex justify-end gap-2">
                  {c.participant_id ? (
                    <button onClick={() => { const s = new Set([c.id]); setSelectedCoupons(s); handleBulkProcess(s); }} disabled={saving} className="text-xs bg-orange-100 text-orange-600 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400 px-3 py-1.5 rounded-lg font-medium transition-colors">
                      재배정
                    </button>
                  ) : (
                    <button onClick={() => { const s = new Set([c.id]); setSelectedCoupons(s); handleBulkProcess(s); }} disabled={saving} className="text-gray-400 hover:text-red-600 p-1.5 rounded transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {coupons.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">데이터가 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Excel Select Modal */}
      {isExcelModalOpen && excelData.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsExcelModalOpen(false)} />
          <div className="relative bg-white dark:bg-zinc-900 rounded-xl shadow-xl w-full max-w-6xl ring-1 ring-gray-200 dark:ring-zinc-800 flex flex-col">
            <div className="p-5 border-b border-gray-100 dark:border-zinc-800 flex justify-between items-center shrink-0">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
                <FileSpreadsheet className="w-5 h-5 mr-2 text-green-500" />
                추출할 쿠폰 열(Column) 및 표 시작점 선택
              </h3>
              <button onClick={() => setIsExcelModalOpen(false)} className="text-gray-400 hover:text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 overflow-x-auto">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg flex items-start gap-3 mb-6 border border-blue-100 dark:border-blue-900/50">
                <AlertCircle className="w-5 h-5 mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
                <div className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
                  <p className="mb-1">1. 표의 가장 첫 줄(제목 줄)이 올바르지 않다면, 왼쪽의 <strong>"이 행을 헤더로 설정"</strong> 버튼을 눌러 보정해주세요.</p>
                  <p>2. 맞게 설정되었다면 쿠폰 번호가 들어있는 <strong>열(컬럼)의 헤더(추출하기 버튼)를 클릭</strong>해주세요. 해당 열의 데이터만 쭉 파싱하여 등록합니다.</p>
                </div>
              </div>
              <table className="w-full text-left border-collapse border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950">
                <tbody>
                  {excelData.slice(0, 5).map((row, rowIdx) => {
                    const isHeader = rowIdx === headerRowIdx
                    return (
                      <tr key={rowIdx} className={isHeader ? "bg-gray-100 dark:bg-zinc-800 border-2 border-blue-500" : "opacity-75"}>
                        <td className={`p-2 border border-gray-300 dark:border-zinc-700 text-center w-32 ${isHeader ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                          {isHeader ? (
                            <span className="text-xs font-bold text-blue-600 dark:text-blue-400">현재 헤더</span>
                          ) : (
                            <button onClick={() => handleSetHeader(rowIdx)} className="text-xs px-2 py-1 bg-white border border-gray-300 hover:bg-gray-50 rounded shadow-sm text-gray-700">
                              이 행을 헤더로
                            </button>
                          )}
                        </td>
                        {excelData[headerRowIdx]?.map((_, colIdx) => (
                          <td key={colIdx} className={`border border-gray-300 dark:border-zinc-700 p-2 text-sm max-w-[150px] truncate ${isHeader ? 'font-bold text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                            {isHeader ? (
                              <div className="relative">
                                {recommendedCol === colIdx && (
                                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap animate-bounce flex items-center before:content-[''] before:absolute before:top-full before:left-1/2 before:-translate-x-1/2 before:border-4 before:border-transparent before:border-t-blue-600">
                                    <MessageSquare className="w-3 h-3 mr-1" /> 전에 선택했던 옵션
                                  </div>
                                )}
                                <button
                                  onClick={() => handleColumnSelect(colIdx)}
                                  className={`w-full mb-2 text-white text-xs font-bold py-2 px-2 rounded transition-colors shadow-sm ${recommendedCol === colIdx ? 'bg-blue-600 hover:bg-blue-700 ring-2 ring-blue-300 ring-offset-1' : 'bg-gray-600 hover:bg-gray-700'}`}
                                >
                                  {recommendedCol === colIdx ? '★ 추천 열 추출' : '추출하기'}
                                </button>
                                <div className="text-center truncate">{row[colIdx] || `(빈 칸)`}</div>
                              </div>
                            ) : (
                              row[colIdx]
                            )}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                  {excelData.length > 5 && (
                    <tr>
                      <td colSpan={(excelData[headerRowIdx]?.length || 0) + 1} className="border border-gray-300 dark:border-zinc-700 p-3 text-sm text-center text-gray-400 italic bg-gray-50 dark:bg-zinc-900">
                        ... 이하 {excelData.length - Math.max(5, headerRowIdx + 1)}개 데이터 행 생략됨 ...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Multilingual Modal... */}
      {isLangModalOpen && (
        // ... (unchanged modal) ...
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsLangModalOpen(false)} />
          <div className="relative bg-white dark:bg-zinc-900 rounded-xl shadow-xl w-full max-w-lg ring-1 ring-gray-200 dark:ring-zinc-800 flex flex-col">
            <div className="p-5 border-b border-gray-100 dark:border-zinc-800 flex justify-between items-center shrink-0">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
                <Globe className="w-5 h-5 mr-2 text-blue-500" />
                웹 쿠폰 기본 제목/설명 설정
              </h3>
              <button onClick={() => setIsLangModalOpen(false)} className="text-gray-400 hover:text-gray-500">
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
                      <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">쿠폰 조건/설명</label>
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
              <button onClick={() => setIsLangModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors">
                취소
              </button>
              <button onClick={saveLangModal} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                저장하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
