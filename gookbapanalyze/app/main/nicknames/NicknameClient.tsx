'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Plus, Trash2, Save, X } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import TranslationButton from '@/components/TranslationButton'

interface Language {
  lang_code: string
  lang_name: string
}

interface Preset {
  id: string
  type: 'first_word' | 'last_word'
  text: Record<string, string | null>
  is_active: boolean
}

interface Exclusion {
  id: string
  first_word_id: string
  last_word_id: string
}

interface NicknameClientProps {
  initialLanguages: Language[]
  initialPresets: Preset[]
  initialExclusions: Exclusion[]
  initialDigitLength: number
}

export default function NicknameClient({
  initialLanguages,
  initialPresets,
  initialExclusions,
  initialDigitLength
}: NicknameClientProps) {
  const supabase = createClient()
  const [presets, setPresets] = useState<Preset[]>(initialPresets)
  const [exclusions, setExclusions] = useState<Exclusion[]>(initialExclusions)
  const [digitLength, setDigitLength] = useState<number>(initialDigitLength)
  const [isSaving, setIsSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'first_word' | 'last_word'>('first_word')

  const isDirty = 
    JSON.stringify(presets) !== JSON.stringify(initialPresets) ||
    JSON.stringify(exclusions) !== JSON.stringify(initialExclusions) ||
    digitLength !== initialDigitLength

  useUnsavedChanges(isDirty)

  // Modals state
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showErrorModal, setShowErrorModal] = useState(false)
  const [pendingDigitLength, setPendingDigitLength] = useState<number | null>(null)
  const [isCheckingCapacity, setIsCheckingCapacity] = useState(false)

  // Refs for arrow key navigation
  const inputRefs = useRef<{ [key: string]: HTMLElement | null }>({})

  const handleDigitLengthChange = async (val: number) => {
    if (val >= digitLength) {
      setDigitLength(val)
      return
    }

    // val < digitLength, need to check capacity
    setIsCheckingCapacity(true)
    try {
      const activeFirst = presets.filter(p => p.type === 'first_word' && p.is_active).length
      const activeLast = presets.filter(p => p.type === 'last_word' && p.is_active).length
      const exclusionsCount = exclusions.length
      
      const capacity = (activeFirst * activeLast - exclusionsCount) * Math.pow(10, val)
      
      // Get current users count
      const { count, error } = await supabase
        .from('participants')
        .select('*', { count: 'exact', head: true })
        .not('nickname_first_id', 'is', null)
        .not('nickname_last_id', 'is', null)
        
      if (error) throw error
      
      const currentUsers = count || 0
      
      if (capacity < currentUsers) {
        setShowErrorModal(true)
      } else {
        setPendingDigitLength(val)
        setShowConfirmModal(true)
      }
    } catch (err) {
      console.error(err)
      alert('유저 수 확인 중 오류가 발생했습니다.')
    } finally {
      setIsCheckingCapacity(false)
    }
  }

  const handleAddRow = (type: 'first_word' | 'last_word') => {
    const newId = uuidv4()
    const newText: Record<string, string | null> = {}
    initialLanguages.forEach(l => {
      newText[l.lang_code] = ''
    })
    
    setPresets([...presets, {
      id: newId,
      type,
      text: newText,
      is_active: true
    }])
  }

  const handleDeleteRow = (id: string) => {
    setPresets(presets.filter(p => p.id !== id))
    // Also remove any exclusions that rely on this id
    setExclusions(exclusions.filter(e => e.first_word_id !== id && e.last_word_id !== id))
  }

  const handleChange = (id: string, langCode: string, value: string) => {
    setPresets(presets.map(p => {
      if (p.id === id) {
        return {
          ...p,
          text: {
            ...p.text,
            [langCode]: value
          }
        }
      }
      return p
    }))
  }

  const handleToggleActive = (id: string) => {
    setPresets(presets.map(p => {
      if (p.id === id) {
        return { ...p, is_active: !p.is_active }
      }
      return p
    }))
  }

  const handleAddExclusion = () => {
    const firstActive = presets.find(p => p.type === 'first_word')
    const lastActive = presets.find(p => p.type === 'last_word')
    if (!firstActive || !lastActive) return

    setExclusions([...exclusions, {
      id: uuidv4(),
      first_word_id: firstActive.id,
      last_word_id: lastActive.id
    }])
  }

  const handleUpdateExclusion = (id: string, field: 'first_word_id' | 'last_word_id', value: string) => {
    setExclusions(exclusions.map(e => {
      if (e.id === id) {
        return { ...e, [field]: value }
      }
      return e
    }))
  }

  const handleDeleteExclusion = (id: string) => {
    setExclusions(exclusions.filter(e => e.id !== id))
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      // Convert empty strings to null for DB consistency
      const cleanedPresets = presets.map(p => {
        const cleanedText = { ...p.text }
        Object.keys(cleanedText).forEach(k => {
          if (!cleanedText[k] || cleanedText[k]!.trim() === '') {
            cleanedText[k] = null
          }
        })
        return { ...p, text: cleanedText }
      })

      // Update Presets
      // Simplest way is to upsert and delete removed ones.
      // 1. Delete removed presets
      const currentIds = cleanedPresets.map(p => p.id)
      const toDelete = initialPresets.filter(p => !currentIds.includes(p.id)).map(p => p.id)
      
      if (toDelete.length > 0) {
        await supabase.from('nickname_presets').delete().in('id', toDelete)
      }

      // 2. Upsert current presets
      if (cleanedPresets.length > 0) {
        await supabase.from('nickname_presets').upsert(cleanedPresets.map(p => ({
          id: p.id,
          type: p.type,
          text: p.text,
          is_active: p.is_active
        })))
      }

      // Update Exclusions
      const currentExcIds = exclusions.map(e => e.id)
      const excToDelete = initialExclusions.filter(e => !currentExcIds.includes(e.id)).map(e => e.id)

      if (excToDelete.length > 0) {
        await supabase.from('nickname_exclusions').delete().in('id', excToDelete)
      }

      if (exclusions.length > 0) {
        // Ensure no duplicates exist in state
        const uniqueExclusions = exclusions.filter((v, i, a) => a.findIndex(t => (t.first_word_id === v.first_word_id && t.last_word_id === v.last_word_id)) === i)
        await supabase.from('nickname_exclusions').upsert(uniqueExclusions.map(e => ({
          id: e.id,
          first_word_id: e.first_word_id,
          last_word_id: e.last_word_id
        })))
      }

      // Update Digit Length
      if (digitLength !== initialDigitLength) {
        const { data, error: digitError } = await supabase.rpc('update_nickname_digit_length', { p_new_length: digitLength })
        if (digitError) {
          throw new Error('숫자 자릿수 업데이트 중 오류가 발생했습니다: ' + digitError.message)
        }
        if (!data.success) {
          throw new Error('숫자 자릿수 변경 실패: ' + data.error)
        }
      }

      // Finally, call RPC to reassign invalid nicknames
      await supabase.rpc('reassign_invalid_nicknames')

      alert('저장되었습니다.')
      window.location.reload()
    } catch (error) {
      console.error(error)
      alert('저장 중 오류가 발생했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  // Arrow key navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>, rowIndex: number, colIndex: number, type: 'first_word' | 'last_word') => {
    const list = presets.filter(p => p.type === type)
    const maxRow = list.length - 1
    const maxCol = initialLanguages.length - 1

    let targetRow = rowIndex
    let targetCol = colIndex

    if (e.key === 'ArrowUp') targetRow = Math.max(0, rowIndex - 1)
    else if (e.key === 'ArrowDown') {
      if (rowIndex === maxRow) {
        handleAddRow(type)
        setTimeout(() => {
          inputRefs.current[`${type}-${rowIndex + 1}-${colIndex}`]?.focus()
        }, 50)
        return
      }
      targetRow = Math.min(maxRow, rowIndex + 1)
    }
    else if (e.key === 'ArrowLeft') {
      if (colIndex === -1) targetCol = maxCol
      else targetCol = Math.max(0, colIndex - 1)
    }
    else if (e.key === 'ArrowRight') {
      if (colIndex === maxCol) targetCol = -1
      else targetCol = Math.min(maxCol, colIndex + 1)
    }
    else return

    e.preventDefault()
    const targetKey = targetCol === -1 ? `${type}-${targetRow}-delete` : `${type}-${targetRow}-${targetCol}`
    inputRefs.current[targetKey]?.focus()
  }

  const renderTable = (type: 'first_word' | 'last_word') => {
    const filteredPresets = presets.filter(p => p.type === type)

    return (
      <div className="overflow-x-auto bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg shadow-sm">
        <table className="w-full text-sm text-left min-w-max whitespace-nowrap">
          <thead className="bg-gray-50 dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-700">
            <tr>
              <th className="px-4 py-3 font-semibold w-16">상태</th>
              {initialLanguages.map(lang => (
                <th key={lang.lang_code} className="px-4 py-3 font-semibold">
                  {lang.lang_name} ({lang.lang_code})
                </th>
              ))}
              <th className="px-4 py-3 font-semibold w-20 text-center">삭제</th>
            </tr>
          </thead>
          <tbody>
            {filteredPresets.map((preset, rowIndex) => (
              <tr key={preset.id} className="border-b border-gray-100 dark:border-zinc-800/50 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors">
                <td className="px-4 py-2 text-center">
                  <input 
                    type="checkbox"
                    checked={preset.is_active}
                    onChange={() => handleToggleActive(preset.id)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                  />
                </td>
                {initialLanguages.map((lang, colIndex) => (
                  <td key={lang.lang_code} className="px-4 py-2 relative group">
                    <input
                      ref={el => { inputRefs.current[`${type}-${rowIndex}-${colIndex}`] = el }}
                      type="text"
                      value={preset.text[lang.lang_code] || ''}
                      onChange={(e) => handleChange(preset.id, lang.lang_code, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, rowIndex, colIndex, type)}
                      placeholder={lang.lang_code === 'ko' ? (type === 'first_word' ? '예: 든든한' : '예: 국밥') : ''}
                      className="w-full bg-transparent border-none p-2 focus:ring-2 focus:ring-blue-500 rounded outline-none dark:text-white"
                    />
                    {lang.lang_code === 'ko' && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <TranslationButton
                          compact
                          sourceTexts={{ text: preset.text['ko'] || '' }}
                          targetLanguages={initialLanguages
                            .map(l => l.lang_code)
                            .filter(c => c !== 'ko' && !preset.text[c])}
                          onTranslationComplete={(results) => {
                            let updatedText = { ...preset.text }
                            for (const [resLang, resObj] of Object.entries(results)) {
                              if (resObj.text) updatedText[resLang] = resObj.text
                            }
                            setPresets(prev => prev.map(p => p.id === preset.id ? { ...p, text: updatedText } : p))
                          }}
                        />
                      </div>
                    )}
                  </td>
                ))}
                <td className="px-4 py-2 text-center">
                  <button 
                    ref={el => { inputRefs.current[`${type}-${rowIndex}-delete`] = el }}
                    onClick={() => handleDeleteRow(preset.id)} 
                    onKeyDown={(e) => handleKeyDown(e, rowIndex, -1, type)}
                    className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 focus:ring-2 focus:ring-red-500 focus:outline-none"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            <tr 
                onClick={() => {
                  handleAddRow(type)
                  setTimeout(() => {
                    inputRefs.current[`${type}-${filteredPresets.length}-0`]?.focus()
                  }, 50)
                }}
                className="cursor-pointer group"
              >
                <td colSpan={initialLanguages.length + 2} className="relative h-12 p-0">
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent to-gray-50 dark:to-zinc-800/80 flex items-center justify-center opacity-70 group-hover:opacity-100 transition-opacity">
                    <span className="text-gray-500 dark:text-gray-400 font-medium flex items-center text-sm">
                      <Plus className="w-4 h-4 mr-1" />
                      {type === 'first_word' ? '앞글자 추가 (마지막 줄에서 ⬇️ 또는 클릭)' : '뒷글자 추가 (마지막 줄에서 ⬇️ 또는 클릭)'}
                    </span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* 탭 버튼 */}
      <div className="flex justify-between items-center border-b border-gray-200 dark:border-zinc-800 pb-2">
        <div className="flex space-x-2">
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'first_word' ? 'border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-zinc-400 dark:hover:text-zinc-300'}`}
            onClick={() => setActiveTab('first_word')}
          >
            앞글자 (First Word)
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'last_word' ? 'border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-zinc-400 dark:hover:text-zinc-300'}`}
            onClick={() => setActiveTab('last_word')}
          >
            뒷글자 (Last Word)
          </button>
        </div>
        
        <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 px-4 py-2 rounded-lg shadow-sm border border-gray-200 dark:border-zinc-800">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            숫자 자릿수:
          </label>
          <input 
            type="number" 
            min={1} 
            max={10} 
            value={digitLength}
            disabled={isCheckingCapacity}
            onChange={(e) => {
              const val = parseInt(e.target.value)
              if (!isNaN(val) && val >= 1 && val <= 10) {
                if (val < digitLength) {
                  handleDigitLengthChange(val)
                } else {
                  setDigitLength(val)
                }
              }
            }}
            className="w-16 rounded-md border border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-2 py-1 dark:bg-zinc-950 dark:border-zinc-700 dark:text-white"
          />
        </div>
      </div>

      {/* 프리셋 테이블 영역 */}
      <div>
        {renderTable(activeTab)}
      </div>

      {/* 조합 제외 리스트 (Exclusions) */}
      <div className="mt-12 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-bold dark:text-white mb-4">조합 제외 리스트</h2>
        <p className="text-sm text-gray-500 dark:text-zinc-400 mb-6">
          선택된 앞글자와 뒷글자의 조합은 무작위 닉네임 할당 시 등장하지 않습니다.
        </p>

        <div className="space-y-3">
          {exclusions.map((exclusion, index) => (
            <div key={exclusion.id} className="flex items-center space-x-4 bg-gray-50 dark:bg-zinc-800/50 p-3 rounded-lg border border-gray-100 dark:border-zinc-800">
              <span className="text-sm font-medium text-gray-400 w-6">{index + 1}.</span>
              <select
                value={exclusion.first_word_id}
                onChange={(e) => handleUpdateExclusion(exclusion.id, 'first_word_id', e.target.value)}
                className="flex-1 bg-white dark:bg-zinc-950 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
              >
                {presets.filter(p => p.type === 'first_word').map(p => (
                  <option key={p.id} value={p.id}>
                    {p.text['ko'] || '(빈 값)'}
                  </option>
                ))}
              </select>
              <span className="text-gray-400">+</span>
              <select
                value={exclusion.last_word_id}
                onChange={(e) => handleUpdateExclusion(exclusion.id, 'last_word_id', e.target.value)}
                className="flex-1 bg-white dark:bg-zinc-950 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
              >
                {presets.filter(p => p.type === 'last_word').map(p => (
                  <option key={p.id} value={p.id}>
                    {p.text['ko'] || '(빈 값)'}
                  </option>
                ))}
              </select>
              <button 
                onClick={() => handleDeleteExclusion(exclusion.id)}
                className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>

        <button 
          onClick={handleAddExclusion}
          className="mt-4 flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 dark:text-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" />
          제외 조합 추가
        </button>
      </div>

      {/* 저장 플로팅 버튼 */}
      <div className="fixed bottom-8 right-8 z-50">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full shadow-lg transition-transform transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-5 h-5 mr-2" />
          {isSaving ? '저장 중...' : '전체 저장 반영'}
        </button>
      </div>

      {/* Confirm Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl max-w-md w-full overflow-hidden border border-gray-200 dark:border-zinc-800">
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                자릿수 변경 경고
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                자릿수를 줄이면 기존 유저의 닉네임 번호가 전부 새로 랜덤하게 재배정됩니다.<br/><br/>
                저장 후에는 되돌릴 수 없습니다. 정말로 변경하시겠습니까?
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-zinc-950 px-6 py-4 flex justify-end gap-3 border-t border-gray-200 dark:border-zinc-800">
              <button
                onClick={() => {
                  setShowConfirmModal(false)
                  setPendingDigitLength(null)
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-zinc-900 dark:text-gray-300 dark:border-zinc-700 dark:hover:bg-zinc-800 transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => {
                  if (pendingDigitLength) setDigitLength(pendingDigitLength)
                  setShowConfirmModal(false)
                  setPendingDigitLength(null)
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {showErrorModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl max-w-md w-full overflow-hidden border border-gray-200 dark:border-zinc-800">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-2 text-red-600 dark:text-red-500">
                <X className="w-6 h-6" />
                <h3 className="text-lg font-bold">
                  변경 불가
                </h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                현재 조합 수와 자릿수로는 기존에 닉네임을 발급받은 유저들을 모두 수용할 수 없어 자릿수를 줄일 수 없습니다.<br/><br/>
                앞/뒷글자 프리셋을 더 추가하거나 제외 조합을 삭제한 뒤 다시 시도해주세요.
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-zinc-950 px-6 py-4 flex justify-end border-t border-gray-200 dark:border-zinc-800">
              <button
                onClick={() => setShowErrorModal(false)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
