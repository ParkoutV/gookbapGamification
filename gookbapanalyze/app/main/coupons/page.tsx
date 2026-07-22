'use client'

import { useState, useEffect } from 'react'
import { Gift, Plus, MoreVertical, Edit2, X, AlertCircle } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { SupportedLanguage } from '../tracks/actions'

interface CouponEffect {
  coupon_effect_id: string
  coupon_type: string
  description: string
  probability: number
  high_rank_probability: number
  created_at?: string
}

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<CouponEffect[]>([])
  const [activeLanguages, setActiveLanguages] = useState<SupportedLanguage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modals state
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCoupon, setEditingCoupon] = useState<CouponEffect | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Form state
  // We store languages as a mapping: { ko: '...', en: '...' }
  const [formData, setFormData] = useState<{
    coupon_type: Record<string, string>,
    description: Record<string, string>,
    probability: string,
    high_rank_probability: string
  }>({
    coupon_type: {},
    description: {},
    probability: '0',
    high_rank_probability: '0'
  })

  const fetchData = async () => {
    setLoading(true)
    const supabase = createClient()
    
    // Fetch languages
    const { data: langData, error: langError } = await supabase
      .from('supported_languages')
      .select('*')
      .eq('is_active', true)
      .order('order_index')
      
    if (langError) {
      setError(langError.message)
      setLoading(false)
      return
    }
    const langs = langData as SupportedLanguage[]
    setActiveLanguages(langs)

    // Fetch coupons
    const { data: couponData, error: couponError } = await supabase
      .from('coupon_effects')
      .select('*')
      .order('created_at', { ascending: false })
      
    if (couponError) {
      setError(couponError.message)
    } else if (couponData) {
      setCoupons(couponData as CouponEffect[])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  const safeParseJSON = (val: string) => {
    try {
      return JSON.parse(val) || {}
    } catch {
      return {}
    }
  }

  const handleOpenCreate = () => {
    const initType: Record<string, string> = {}
    const initDesc: Record<string, string> = {}
    activeLanguages.forEach(lang => {
      initType[lang.lang_code] = ''
      initDesc[lang.lang_code] = ''
    })

    setFormData({
      coupon_type: initType,
      description: initDesc,
      probability: '0',
      high_rank_probability: '0'
    })
    setEditingCoupon(null)
    setIsModalOpen(true)
  }

  const handleOpenEdit = (coupon: CouponEffect) => {
    const parsedType = safeParseJSON(coupon.coupon_type)
    const parsedDesc = safeParseJSON(coupon.description || '{}')
    
    // Ensure all active languages have at least an empty string if not present
    const initType = { ...parsedType }
    const initDesc = { ...parsedDesc }
    activeLanguages.forEach(lang => {
      if (!initType[lang.lang_code]) initType[lang.lang_code] = ''
      if (!initDesc[lang.lang_code]) initDesc[lang.lang_code] = ''
    })

    setFormData({
      coupon_type: initType,
      description: initDesc,
      probability: (coupon.probability * 100).toString(),
      high_rank_probability: (coupon.high_rank_probability * 100).toString()
    })
    setEditingCoupon(coupon)
    setActiveDropdown(null)
    setIsModalOpen(true)
  }

  const handleTextChange = (field: 'coupon_type' | 'description', langCode: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: {
        ...prev[field],
        [langCode]: value
      }
    }))
  }

  const calculateTotals = () => {
    let totalProb = 0
    let totalHighProb = 0
    coupons.forEach(c => {
      if (editingCoupon && c.coupon_effect_id === editingCoupon.coupon_effect_id) return
      totalProb += Number(c.probability)
      totalHighProb += Number(c.high_rank_probability)
    })
    
    const formProb = Number(formData.probability) / 100
    const formHighProb = Number(formData.high_rank_probability) / 100
    
    return {
      probability: totalProb + (isNaN(formProb) ? 0 : formProb),
      high_rank_probability: totalHighProb + (isNaN(formHighProb) ? 0 : formHighProb)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const prob = Number(formData.probability) / 100
    const highProb = Number(formData.high_rank_probability) / 100

    if (isNaN(prob) || isNaN(highProb) || prob < 0 || highProb < 0) {
      alert('올바른 확률 값을 입력해주세요.')
      return
    }

    const totals = calculateTotals()
    if (totals.probability > 1.0001) {
      alert('일반 유저 확률의 총합이 100%를 초과할 수 없습니다.')
      return
    }
    if (totals.high_rank_probability > 1.0001) {
      alert('상위 랭커 확률의 총합이 100%를 초과할 수 없습니다.')
      return
    }

    setSubmitting(true)
    const supabase = createClient()
    
    // Merge logic: preserve existing JSON data for inactive languages
    let finalTypeObj = { ...formData.coupon_type }
    let finalDescObj = { ...formData.description }

    if (editingCoupon) {
      const existingType = safeParseJSON(editingCoupon.coupon_type)
      const existingDesc = safeParseJSON(editingCoupon.description || '{}')
      finalTypeObj = { ...existingType, ...formData.coupon_type }
      finalDescObj = { ...existingDesc, ...formData.description }
    }
    
    const payload = {
      coupon_type: JSON.stringify(finalTypeObj),
      description: JSON.stringify(finalDescObj),
      probability: prob,
      high_rank_probability: highProb
    }

    if (editingCoupon) {
      const { error } = await supabase
        .from('coupon_effects')
        .update(payload)
        .eq('coupon_effect_id', editingCoupon.coupon_effect_id)
      
      if (error) {
        alert(error.message)
      } else {
        setIsModalOpen(false)
        fetchData()
      }
    } else {
      const { error } = await supabase
        .from('coupon_effects')
        .insert([payload])
        
      if (error) {
        alert(error.message)
      } else {
        setIsModalOpen(false)
        fetchData()
      }
    }
    setSubmitting(false)
  }

  const totalProb = coupons.reduce((sum, c) => sum + Number(c.probability), 0) * 100
  const totalHighProb = coupons.reduce((sum, c) => sum + Number(c.high_rank_probability), 0) * 100

  const getKoText = (val: string) => safeParseJSON(val)?.ko || '이름 없음'

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
            <Gift className="w-6 h-6 mr-3 text-purple-600" />
            쿠폰 관리
          </h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-2">
            게임 보상으로 지급될 쿠폰 종류와 당첨 확률을 설정합니다.
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" />
          쿠폰 추가
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 text-sm font-medium border border-red-100 dark:border-red-900/50">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className={`p-4 rounded-xl border ${totalProb > 100 ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800' : 'bg-white border-gray-200 dark:bg-zinc-900 dark:border-zinc-800'}`}>
          <div className="text-sm text-gray-500 dark:text-zinc-400 mb-1">일반 확률 총합</div>
          <div className={`text-2xl font-bold ${totalProb > 100 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
            {totalProb.toFixed(2)}%
          </div>
          {totalProb > 100 && (
            <div className="flex items-center mt-2 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="w-3 h-3 mr-1" />
              확률 총합이 100%를 초과했습니다.
            </div>
          )}
        </div>
        <div className={`p-4 rounded-xl border ${totalHighProb > 100 ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800' : 'bg-white border-gray-200 dark:bg-zinc-900 dark:border-zinc-800'}`}>
          <div className="text-sm text-gray-500 dark:text-zinc-400 mb-1">상위 랭커 확률 총합</div>
          <div className={`text-2xl font-bold ${totalHighProb > 100 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
            {totalHighProb.toFixed(2)}%
          </div>
          {totalHighProb > 100 && (
            <div className="flex items-center mt-2 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="w-3 h-3 mr-1" />
              확률 총합이 100%를 초과했습니다.
            </div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-gray-200 dark:ring-zinc-800 rounded-xl overflow-visible relative pb-16">
        <div className="w-full overflow-visible">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 dark:text-zinc-400 bg-gray-50 dark:bg-zinc-800/50 border-b border-gray-200 dark:border-zinc-800 uppercase">
              <tr>
                <th className="px-6 py-4 font-semibold">쿠폰 이름 (한국어 기준)</th>
                <th className="px-6 py-4 font-semibold">설명 (한국어 기준)</th>
                <th className="px-6 py-4 font-semibold">일반 확률</th>
                <th className="px-6 py-4 font-semibold">상위 랭커 확률</th>
                <th className="px-6 py-4 font-semibold text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-zinc-800">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500 dark:text-zinc-400">
                    로딩 중...
                  </td>
                </tr>
              ) : coupons.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500 dark:text-zinc-400">
                    등록된 쿠폰이 없습니다.
                  </td>
                </tr>
              ) : (
                coupons.map((coupon) => (
                  <tr key={coupon.coupon_effect_id} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {getKoText(coupon.coupon_type)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600 dark:text-gray-300">
                      {getKoText(coupon.description || '{}')}
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                      {(Number(coupon.probability) * 100).toFixed(2)}%
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                      {(Number(coupon.high_rank_probability) * 100).toFixed(2)}%
                    </td>
                    <td className="px-6 py-4 text-right relative">
                      <div className="relative inline-block text-left">
                        <button 
                          onClick={() => setActiveDropdown(activeDropdown === coupon.coupon_effect_id ? null : coupon.coupon_effect_id)}
                          className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        
                        {activeDropdown === coupon.coupon_effect_id && (
                          <>
                            <div 
                              className="fixed inset-0 z-10" 
                              onClick={() => setActiveDropdown(null)}
                            />
                            <div className="absolute right-0 mt-2 w-32 rounded-md shadow-lg bg-white dark:bg-zinc-900 ring-1 ring-black ring-opacity-5 dark:ring-zinc-700 z-20 overflow-hidden">
                              <div className="py-1">
                                <button
                                  onClick={() => handleOpenEdit(coupon)}
                                  className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 flex items-center"
                                >
                                  <Edit2 className="w-4 h-4 mr-2" />
                                  수정하기
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="relative bg-white dark:bg-zinc-900 rounded-xl shadow-xl w-full max-w-2xl ring-1 ring-gray-200 dark:ring-zinc-800 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 dark:border-zinc-800 flex justify-between items-center shrink-0">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {editingCoupon ? '쿠폰 수정' : '새 쿠폰 등록'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-500 dark:hover:text-zinc-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <form id="coupon-form" onSubmit={handleSubmit} className="space-y-6">
                
                {/* 다국어 입력 폼 */}
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-zinc-700 pb-2">쿠폰 이름 및 설명 (다국어)</h4>
                  {activeLanguages.map(lang => (
                    <div key={lang.lang_code} className="p-4 bg-gray-50 dark:bg-zinc-800/50 rounded-lg space-y-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold px-2 py-1 bg-gray-200 dark:bg-zinc-700 rounded text-gray-700 dark:text-zinc-300 uppercase">
                          {lang.lang_code} - {lang.lang_name}
                        </span>
                      </div>
                      
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-zinc-400 mb-1">
                          쿠폰 이름
                        </label>
                        <input
                          type="text"
                          required={lang.lang_code === 'ko'}
                          value={formData.coupon_type[lang.lang_code] || ''}
                          onChange={(e) => handleTextChange('coupon_type', lang.lang_code, e.target.value)}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                          placeholder={`${lang.lang_name} 이름`}
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-zinc-400 mb-1">
                          쿠폰 설명
                        </label>
                        <textarea
                          rows={2}
                          value={formData.description[lang.lang_code] || ''}
                          onChange={(e) => handleTextChange('description', lang.lang_code, e.target.value)}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none"
                          placeholder={`${lang.lang_name} 설명`}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
                      일반 확률 (%) <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        required
                        step="0.01"
                        min="0"
                        max="100"
                        value={formData.probability}
                        onChange={(e) => setFormData(prev => ({ ...prev, probability: e.target.value }))}
                        className="w-full pl-4 pr-8 py-2.5 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
                      상위 랭커 확률 (%) <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        required
                        step="0.01"
                        min="0"
                        max="100"
                        value={formData.high_rank_probability}
                        onChange={(e) => setFormData(prev => ({ ...prev, high_rank_probability: e.target.value }))}
                        className="w-full pl-4 pr-8 py-2.5 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
                    </div>
                  </div>
                </div>
              </form>
            </div>
              
            <div className="p-6 border-t border-gray-100 dark:border-zinc-800 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
              >
                취소
              </button>
              <button
                type="submit"
                form="coupon-form"
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center"
              >
                {submitting ? '저장 중...' : '저장하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
