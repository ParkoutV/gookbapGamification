'use client'

import { useState, useEffect } from 'react'
import { Globe, MoreVertical, Edit2, CheckCircle2, XCircle, X } from 'lucide-react'
import { SupportedLanguage } from '../tracks/actions'
import { createClient } from '@/utils/supabase/client'

export default function LanguagesPage() {
  const [languages, setLanguages] = useState<SupportedLanguage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modals state
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)
  const [editingLang, setEditingLang] = useState<SupportedLanguage | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Form state for editing
  const [formData, setFormData] = useState<{ lang_name: string, order_index: number }>({ lang_name: '', order_index: 0 })

  const fetchLanguages = async () => {
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('supported_languages')
      .select('*')
      .order('order_index')
      
    if (error) {
      setError(error.message)
    } else if (data) {
      setLanguages(data as SupportedLanguage[])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchLanguages()
  }, [])

  const handleToggleActive = async (lang: SupportedLanguage) => {
    setActiveDropdown(null)
    const newStatus = !lang.is_active
    if (!newStatus && lang.lang_code === 'ko') {
      alert('한국어(ko)는 비활성화할 수 없습니다.')
      return
    }
    
    setSubmitting(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('supported_languages')
      .update({ is_active: newStatus })
      .eq('lang_code', lang.lang_code)
      
    if (error) {
      alert(error.message)
    } else {
      fetchLanguages()
    }
    setSubmitting(false)
  }

  const handleOpenEdit = (lang: SupportedLanguage) => {
    setFormData({
      lang_name: lang.lang_name,
      order_index: lang.order_index
    })
    setEditingLang(lang)
    setActiveDropdown(null)
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingLang) return

    setSubmitting(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('supported_languages')
      .update({
        lang_name: formData.lang_name,
        order_index: Number(formData.order_index)
      })
      .eq('lang_code', editingLang.lang_code)
    
    if (error) {
      alert(error.message)
    } else {
      setEditingLang(null)
      fetchLanguages()
    }
    setSubmitting(false)
  }

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
            <Globe className="w-6 h-6 mr-3 text-blue-600" />
            언어 관리
          </h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-2">
            게임 및 플랫폼에서 지원하는 언어를 관리합니다.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 text-sm font-medium border border-red-100 dark:border-red-900/50">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-gray-200 dark:ring-zinc-800 rounded-xl overflow-visible relative pb-16">
        <div className="w-full overflow-visible">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 dark:text-zinc-400 bg-gray-50 dark:bg-zinc-800/50 border-b border-gray-200 dark:border-zinc-800 uppercase">
              <tr>
                <th className="px-6 py-4 font-semibold">언어 코드</th>
                <th className="px-6 py-4 font-semibold">언어명</th>
                <th className="px-6 py-4 font-semibold">순서</th>
                <th className="px-6 py-4 font-semibold">상태</th>
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
              ) : languages.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500 dark:text-zinc-400">
                    등록된 언어가 없습니다.
                  </td>
                </tr>
              ) : (
                languages.map((lang, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors">
                    <td className="px-6 py-4">
                      <code className="text-xs font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-zinc-800 px-2 py-1 rounded block w-max uppercase">
                        {lang.lang_code}
                      </code>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {lang.lang_name}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-gray-600 dark:text-gray-400">
                        {lang.order_index}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {lang.is_active ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800/50">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          활성
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-gray-400 border border-gray-200 dark:border-zinc-700">
                          <XCircle className="w-3.5 h-3.5" />
                          비활성
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right relative">
                      <div className="relative inline-block text-left">
                        <button 
                          onClick={() => setActiveDropdown(activeDropdown === lang.lang_code ? null : lang.lang_code)}
                          className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        
                        {activeDropdown === lang.lang_code && (
                          <>
                            <div 
                              className="fixed inset-0 z-10" 
                              onClick={() => setActiveDropdown(null)}
                            />
                            <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white dark:bg-zinc-900 ring-1 ring-black ring-opacity-5 dark:ring-zinc-700 z-20 overflow-hidden">
                              <div className="py-1">
                                <button
                                  onClick={() => handleOpenEdit(lang)}
                                  className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 flex items-center"
                                >
                                  <Edit2 className="w-4 h-4 mr-2" />
                                  수정하기
                                </button>
                                <button
                                  onClick={() => handleToggleActive(lang)}
                                  disabled={submitting || (lang.lang_code === 'ko' && lang.is_active)}
                                  className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {lang.is_active ? (
                                    <>
                                      <XCircle className="w-4 h-4 mr-2" />
                                      비활성화
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 className="w-4 h-4 mr-2" />
                                      활성화
                                    </>
                                  )}
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

      {/* Edit Modal */}
      {editingLang && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditingLang(null)} />
          <div className="relative bg-white dark:bg-zinc-900 rounded-xl shadow-xl w-full max-w-sm ring-1 ring-gray-200 dark:ring-zinc-800">
            <div className="p-6 border-b border-gray-100 dark:border-zinc-800 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                언어 설정 수정
              </h3>
              <button 
                onClick={() => setEditingLang(null)}
                className="text-gray-400 hover:text-gray-500 dark:hover:text-zinc-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleEditSubmit} className="p-6">
              <div className="space-y-4 mb-8">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
                    언어명
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.lang_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, lang_name: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
                    노출 순서 (숫자)
                  </label>
                  <input
                    type="number"
                    required
                    value={formData.order_index}
                    onChange={(e) => setFormData(prev => ({ ...prev, order_index: Number(e.target.value) }))}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  />
                </div>
              </div>
              
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setEditingLang(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center"
                >
                  {submitting ? '저장 중...' : '저장하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
