'use client'

import { useState } from 'react'
import { X, Save, MonitorPlay } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

interface LanguageSetting {
  lang_code: string
  coupon_use_text: {
    use_coupon_question: string
    yes: string
    no: string
    used_successfully: string
    expired_coupon?: string
    not_yet_valid_coupon?: string
    already_used_coupon?: string
    load_error?: string
  }
}

interface CouponSettingsModalProps {
  isAdmin: boolean
  languages: LanguageSetting[]
  keepScreenOn: boolean
  onKeepScreenOnChange: (val: boolean) => void
  videoFit: 'width' | 'height' | 'fill'
  onVideoFitChange: (val: 'width' | 'height' | 'fill') => void
  isFlipped: boolean
  onIsFlippedChange: (val: boolean) => void
  onClose: () => void
}

export default function CouponSettingsModal({ isAdmin, languages, keepScreenOn, onKeepScreenOnChange, videoFit, onVideoFitChange, isFlipped, onIsFlippedChange, onClose }: CouponSettingsModalProps) {
  const [activeTab, setActiveTab] = useState(languages.length > 0 ? languages[0].lang_code : 'ko')
  
  // Clone language config into state for editing
  const [editableLangs, setEditableLangs] = useState<Record<string, any>>(() => {
    const acc: Record<string, any> = {}
    languages.forEach(l => {
      acc[l.lang_code] = l.coupon_use_text || {
        use_coupon_question: '{{user_nickname}}님의 {{coupon_effects}}을(를) 사용하시겠습니까?',
        yes: '네',
        no: '아니오',
        used_successfully: '쿠폰이 성공적으로 사용되었습니다.',
        expired_coupon: '만료된 쿠폰입니다. (만료일: {{expired_date}})',
        not_yet_valid_coupon: '아직 사용 기간이 아닙니다. (시작일: {{valid_date}})',
        already_used_coupon: '이미 사용된 쿠폰입니다.',
        load_error: '쿠폰 정보를 불러오지 못했습니다.'
      }
    })
    return acc
  })

  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  const handleUpdate = (field: string, val: string) => {
    setEditableLangs(prev => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        [field]: val
      }
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Save all modified languages
      for (const lang of languages) {
        const textObj = editableLangs[lang.lang_code]
        if (textObj) {
          await supabase.from('supported_languages')
            .update({ coupon_use_text: textObj })
            .eq('lang_code', lang.lang_code)
        }
      }
      onClose()
    } catch (err) {
      console.error(err)
      alert("저장에 실패했습니다.")
    } finally {
      setSaving(false)
    }
  }

  const activeConfig = editableLangs[activeTab] || {}

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 text-left">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
          <h2 className="text-2xl font-bold text-white flex items-center">
            쿠폰 스캐너 설정
          </h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {/* Keep screen on toggle */}
          <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-2xl mb-4 border border-zinc-700/50">
            <div className="flex items-center">
              <MonitorPlay className="w-6 h-6 text-blue-400 mr-3" />
              <div>
                <h3 className="text-white font-medium text-lg">화면 자동 꺼짐 방지</h3>
                <p className="text-sm text-zinc-400">화면이 계속 켜져 있도록 유지합니다. (지원하는 브라우저에 한함)</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" checked={keepScreenOn} onChange={(e) => onKeepScreenOnChange(e.target.checked)} />
              <div className="w-14 h-7 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-blue-500"></div>
            </label>
          </div>

          {/* Flip Screen toggle */}
          <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-2xl mb-4 border border-zinc-700/50">
            <div className="flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-green-400 mr-3"><path d="M12 20v-8"/><path d="M16 16l-4 4-4-4"/><path d="M12 4v8"/><path d="M8 8l4-4 4 4"/><path d="M20 12h-8"/><path d="M16 8l4 4-4 4"/><path d="M4 12h8"/><path d="M8 16l-4-4 4-4"/></svg>
              <div>
                <h3 className="text-white font-medium text-lg">카메라 좌우 반전</h3>
                <p className="text-sm text-zinc-400">카메라 화면을 거울처럼 좌우 반전하여 표시합니다.</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" checked={isFlipped} onChange={(e) => onIsFlippedChange(e.target.checked)} />
              <div className="w-14 h-7 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-green-500"></div>
            </label>
          </div>

          {/* Video Fit Settings */}
          <div className="p-4 bg-zinc-800/50 rounded-2xl mb-8 border border-zinc-700/50">
            <h3 className="text-white font-medium text-lg mb-3">화면 표시 방식</h3>
            <div className="flex flex-col space-y-3">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input type="radio" name="videoFit" value="width" checked={videoFit === 'width'} onChange={(e) => onVideoFitChange('width')} className="text-blue-500 focus:ring-blue-500 w-4 h-4" />
                <span className="text-zinc-300">
                  <span className="font-bold text-white block">폭 맞춤</span>
                  <span className="text-xs text-zinc-400">화면 양옆 사이즈를 기준으로 맞춤, 화면의 위아래가 잘릴 수 있음</span>
                </span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer">
                <input type="radio" name="videoFit" value="height" checked={videoFit === 'height'} onChange={(e) => onVideoFitChange('height')} className="text-blue-500 focus:ring-blue-500 w-4 h-4" />
                <span className="text-zinc-300">
                  <span className="font-bold text-white block">길이 맞춤</span>
                  <span className="text-xs text-zinc-400">화면 위아래 사이즈를 기준으로 맞춤, 화면의 양 옆이 잘릴 수 있음</span>
                </span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer">
                <input type="radio" name="videoFit" value="fill" checked={videoFit === 'fill'} onChange={(e) => onVideoFitChange('fill')} className="text-blue-500 focus:ring-blue-500 w-4 h-4" />
                <span className="text-zinc-300">
                  <span className="font-bold text-white block">전체 늘리기</span>
                  <span className="text-xs text-zinc-400">화면의 전체가 보이나, 화면 비율을 크게에 맞춰 강제로 늘리거나 줄임</span>
                </span>
              </label>
            </div>
          </div>

          {isAdmin && (
            <>
              <h3 className="text-lg font-bold text-white mb-4 mt-6">다국어 텍스트 설정</h3>
              <p className="text-sm text-zinc-400 mb-4">사용할 수 있는 변수: {'{{user_nickname}}'}, {'{{coupon_effects}}'}, {'{{expired_date}}'}, {'{{valid_date}}'}</p>
          
          <div className="flex space-x-2 border-b border-zinc-700 mb-6 overflow-x-auto">
            {languages.map(lang => (
              <button
                key={lang.lang_code}
                onClick={() => setActiveTab(lang.lang_code)}
                className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 whitespace-nowrap ${
                  activeTab === lang.lang_code
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-zinc-400 hover:text-zinc-300 hover:border-zinc-500'
                }`}
              >
                {lang.lang_code.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">사용 확인 질문</label>
              <textarea 
                rows={2}
                value={activeConfig.use_coupon_question || ''}
                onChange={(e) => handleUpdate('use_coupon_question', e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">예 버튼 텍스트</label>
                <input 
                  type="text"
                  value={activeConfig.yes || ''}
                  onChange={(e) => handleUpdate('yes', e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">아니오 버튼 텍스트</label>
                <input 
                  type="text"
                  value={activeConfig.no || ''}
                  onChange={(e) => handleUpdate('no', e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">사용 완료 메시지</label>
              <textarea 
                rows={2}
                value={activeConfig.used_successfully || ''}
                onChange={(e) => handleUpdate('used_successfully', e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">만료된 쿠폰 메시지</label>
              <textarea 
                rows={2}
                value={activeConfig.expired_coupon || ''}
                onChange={(e) => handleUpdate('expired_coupon', e.target.value)}
                placeholder="예: 만료된 쿠폰입니다. (만료일: {{expired_date}})"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">사용 기간 전 쿠폰 메시지</label>
              <textarea 
                rows={2}
                value={activeConfig.not_yet_valid_coupon || ''}
                onChange={(e) => handleUpdate('not_yet_valid_coupon', e.target.value)}
                placeholder="예: 아직 사용 기간이 아닙니다. (시작일: {{valid_date}})"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">이미 사용된 쿠폰 메시지</label>
              <textarea 
                rows={2}
                value={activeConfig.already_used_coupon || ''}
                onChange={(e) => handleUpdate('already_used_coupon', e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">정보 로딩 실패 메시지</label>
              <textarea 
                rows={2}
                value={activeConfig.load_error || ''}
                onChange={(e) => handleUpdate('load_error', e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          </div>
            </>
          )}
        </div>

        <div className="p-4 border-t border-zinc-800 bg-zinc-900/80 flex justify-end">
          {isAdmin ? (
            <>
              <button 
                onClick={onClose}
                className="px-6 py-2.5 text-zinc-300 font-medium hover:text-white mr-3 transition-colors"
                disabled={saving}
              >
                취소
              </button>
              <button 
                onClick={handleSave}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-2.5 rounded-xl font-bold transition-colors flex items-center shadow-lg shadow-blue-500/20 disabled:opacity-50"
              >
                {saving ? '저장 중...' : <><Save className="w-5 h-5 mr-2" /> 저장</>}
              </button>
            </>
          ) : (
            <button 
              onClick={onClose}
              className="bg-zinc-700 hover:bg-zinc-600 text-white px-8 py-2.5 rounded-xl font-bold transition-colors"
            >
              닫기
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
