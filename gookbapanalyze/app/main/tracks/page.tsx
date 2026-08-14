'use client'

import { useState, useEffect } from 'react'
import { MapPin, Plus, MoreVertical, Edit2, Link as LinkIcon, QrCode, X } from 'lucide-react'
import { getTracksGrouped, getSupportedLanguages, createTrack, updateTrack, TrackGroup, SupportedLanguage } from './actions'
import { QRCodeCanvas } from 'qrcode.react'
import TranslationButton from '@/components/TranslationButton'

export default function TracksListPage() {
  const [tracks, setTracks] = useState<TrackGroup[]>([])
  const [languages, setLanguages] = useState<SupportedLanguage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modals state
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingTrack, setEditingTrack] = useState<TrackGroup | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [qrModalData, setQrModalData] = useState<{ id: string, name: string } | null>(null)
  const [qrImageUrl, setQrImageUrl] = useState<string>('')

  // Form state for creating/editing
  const [formData, setFormData] = useState<Record<string, string>>({})

  const fetchInitialData = async () => {
    setLoading(true)
    const [tracksRes, langsRes] = await Promise.all([
      getTracksGrouped(),
      getSupportedLanguages()
    ])

    if (tracksRes.error) setError(tracksRes.error)
    else if (tracksRes.tracks) {
      const sortedTracks = [...tracksRes.tracks].sort((a, b) => {
        const aName = typeof a.branch_name === 'string' && a.branch_name.includes('온라인') ? 1 : 0;
        const bName = typeof b.branch_name === 'string' && b.branch_name.includes('온라인') ? 1 : 0;
        return bName - aName;
      });
      setTracks(sortedTracks);
    }
    if (langsRes.error) setError(langsRes.error)
    else if (langsRes.languages) {
      setLanguages(langsRes.languages)
      // Initialize form data with empty strings for all active languages
      const initialForm: Record<string, string> = {}
      langsRes.languages.forEach(lang => {
        initialForm[lang.lang_code] = ''
      })
      setFormData(initialForm)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchInitialData()
  }, [])

  useEffect(() => {
    if (qrModalData) {
      // Allow canvas to render first
      const timer = setTimeout(() => {
        const canvas = document.getElementById('qr-canvas') as HTMLCanvasElement
        if (canvas) {
          setQrImageUrl(canvas.toDataURL('image/png'))
        }
      }, 50)
      return () => clearTimeout(timer)
    } else {
      setQrImageUrl('')
    }
  }, [qrModalData])

  const parseTrackType = (jsonStr: string) => {
    try {
      return JSON.parse(jsonStr)
    } catch {
      return { ko: jsonStr } // fallback for plain strings
    }
  }

  const handleOpenCreate = () => {
    const initialForm: Record<string, string> = {}
    languages.forEach(lang => {
      initialForm[lang.lang_code] = ''
    })
    setFormData(initialForm)
    setIsCreateModalOpen(true)
  }

  const handleOpenEdit = (track: TrackGroup) => {
    const parsed = parseTrackType(track.branch_name)
    const initialForm: Record<string, string> = {}
    languages.forEach(lang => {
      initialForm[lang.lang_code] = parsed[lang.lang_code] || ''
    })
    setFormData(initialForm)
    setEditingTrack(track)
    setActiveDropdown(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    
    let finalData: Record<string, string> = {}
    
    if (editingTrack) {
      // 기존 데이터 불러오기 (비활성화된 언어 포함)
      finalData = parseTrackType(editingTrack.branch_name)
    }

    // 현재 폼에 있는(활성화된) 언어 값으로 덮어쓰거나 빈 값이면 삭제
    languages.forEach(lang => {
      const code = lang.lang_code
      const val = formData[code]
      if (val && val.trim() !== '') {
        finalData[code] = val.trim()
      } else {
        delete finalData[code]
      }
    })

    if (Object.keys(finalData).length === 0) {
      alert('최소 하나 이상의 언어로 지점명을 입력해주세요.')
      setSubmitting(false)
      return
    }

    const jsonStr = JSON.stringify(finalData)

    if (editingTrack) {
      const res = await updateTrack(editingTrack.branch_id, jsonStr)
      if (res.error) alert(res.error)
      else {
        setEditingTrack(null)
        fetchInitialData()
      }
    } else {
      const res = await createTrack(jsonStr)
      if (res.error) alert(res.error)
      else {
        setIsCreateModalOpen(false)
        fetchInitialData()
      }
    }
    
    setSubmitting(false)
  }

  const copyToClipboard = (id: string) => {
    const url = `https://1953-brother-gookbap.vercel.app/?q=${id}`
    navigator.clipboard.writeText(url)
    alert('링크가 클립보드에 복사되었습니다.')
  }

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
            <MapPin className="w-6 h-6 mr-3 text-blue-600" />
            지점(Tracks) 관리
          </h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-2">
            게임에 접근할 수 있는 각 지점의 링크와 QR 코드를 관리합니다.
          </p>
        </div>
        <button 
          onClick={handleOpenCreate}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center shadow-sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          지점 추가
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 text-sm font-medium border border-red-100 dark:border-red-900/50">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-gray-200 dark:ring-zinc-800 rounded-xl overflow-visible relative pb-32">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-sm text-left min-w-max whitespace-nowrap">
            <thead className="text-xs text-gray-500 dark:text-zinc-400 bg-gray-50 dark:bg-zinc-800/50 border-b border-gray-200 dark:border-zinc-800 uppercase">
              <tr>
                <th className="px-6 py-4 font-semibold">지점명</th>
                <th className="px-6 py-4 font-semibold">가게 링크</th>
                <th className="px-6 py-4 font-semibold">공유 링크</th>
                <th className="px-6 py-4 font-semibold text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-zinc-800">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-500 dark:text-zinc-400">
                    로딩 중...
                  </td>
                </tr>
              ) : tracks.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-500 dark:text-zinc-400">
                    등록된 지점이 없습니다.
                  </td>
                </tr>
              ) : (
                tracks.map((track, idx) => {
                  const parsed = parseTrackType(track.branch_name)
                  const displayName = parsed['ko'] || Object.values(parsed)[0] || '이름 없음'
                  
                  return (
                    <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900 dark:text-white mb-1">
                          {displayName as string}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(parsed).map(([lang, val]) => (
                            <span key={lang} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400 border border-gray-200 dark:border-zinc-700">
                              {lang.toUpperCase()}: {val as string}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {track.private_id ? (
                          <div className="space-y-2">
                            <code className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded block w-max max-w-[200px] truncate">
                              {track.private_id}
                            </code>
                            <div className="flex gap-2">
                              <button onClick={() => copyToClipboard(track.private_id!)} className="text-gray-500 hover:text-blue-600 transition-colors p-1" title="링크 공유">
                                <LinkIcon className="w-4 h-4" />
                              </button>
                              <button onClick={() => setQrModalData({ id: track.private_id!, name: `${displayName} (가게 링크)` })} className="text-gray-500 hover:text-blue-600 transition-colors p-1" title="QR 코드">
                                <QrCode className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">없음</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {track.shared_id ? (
                          <div className="space-y-2">
                            <code className="text-xs text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-2 py-1 rounded block w-max max-w-[200px] truncate">
                              {track.shared_id}
                            </code>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">없음</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right relative">
                        <div className="relative inline-block text-left">
                          <button 
                            onClick={() => setActiveDropdown(activeDropdown === track.branch_id ? null : track.branch_id)}
                            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                          
                          {activeDropdown === track.branch_id && (
                            <>
                              <div 
                                className="fixed inset-0 z-10" 
                                onClick={() => setActiveDropdown(null)}
                              />
                              <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white dark:bg-zinc-900 ring-1 ring-black ring-opacity-5 dark:ring-zinc-700 z-20 overflow-hidden">
                                <div className="py-1">
                                  <button
                                    onClick={() => handleOpenEdit(track)}
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
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {(isCreateModalOpen || editingTrack) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setIsCreateModalOpen(false); setEditingTrack(null) }} />
          <div className="relative bg-white dark:bg-zinc-900 rounded-xl shadow-xl w-full max-w-lg ring-1 ring-gray-200 dark:ring-zinc-800">
            <div className="p-6 border-b border-gray-100 dark:border-zinc-800 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  {editingTrack ? '지점 수정' : '새 지점 추가'}
                </h3>
                <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
                  각 언어별 지점 이름을 입력해주세요.
                </p>
              </div>
              <div className="flex items-center gap-3 relative">
                <TranslationButton
                  sourceTexts={{ text: formData['ko'] || '' }}
                  targetLanguages={languages.map(l => l.lang_code).filter(c => c !== 'ko' && !formData[c])}
                  existingTranslations={languages.reduce((acc, l) => {
                    if (l.lang_code === 'ko') return acc;
                    acc[l.lang_code] = {
                      text: formData[l.lang_code] || ''
                    };
                    return acc;
                  }, {} as Record<string, Record<string, string>>)}
                  onTranslationComplete={(results) => {
                    setFormData(prev => {
                      const next = { ...prev }
                      for (const [lang, translations] of Object.entries(results)) {
                        if (translations.text && !next[lang]) {
                          next[lang] = translations.text
                        }
                      }
                      return next
                    })
                  }}
                />
                <button 
                  onClick={() => { setIsCreateModalOpen(false); setEditingTrack(null) }}
                  className="text-gray-400 hover:text-gray-500 dark:hover:text-zinc-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6">
              <div className="space-y-4 mb-8">
                {languages.map((lang) => (
                  <div key={lang.lang_code}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1 flex justify-between">
                      <span>{lang.lang_name}</span>
                      <span className="text-gray-400 text-xs font-normal uppercase">{lang.lang_code}</span>
                    </label>
                    <input
                      type="text"
                      required={lang.lang_code === 'ko'} // Require at least Korean (or the default)
                      placeholder={`${lang.lang_name} 이름 입력`}
                      value={formData[lang.lang_code] || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, [lang.lang_code]: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    />
                  </div>
                ))}
              </div>
              
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => { setIsCreateModalOpen(false); setEditingTrack(null) }}
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

      {/* QR Code Modal */}
      {qrModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setQrModalData(null)} />
          <div className="relative bg-white dark:bg-zinc-900 rounded-xl shadow-xl w-full max-w-sm ring-1 ring-gray-200 dark:ring-zinc-800 p-8 text-center flex flex-col items-center">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">QR 코드</h3>
            <p className="text-sm text-gray-500 dark:text-zinc-400 mb-8">{qrModalData.name}</p>
            
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-center min-h-[232px]">
              <div style={{ display: qrImageUrl ? 'none' : 'block' }}>
                <QRCodeCanvas 
                  id="qr-canvas"
                  value={`https://1953-brother-gookbap.vercel.app/?q=${qrModalData.id}`} 
                  size={200}
                  level="H"
                  includeMargin={false}
                />
              </div>
              {qrImageUrl && (
                <img src={qrImageUrl} alt="QR Code" width={200} height={200} className="w-[200px] h-[200px]" />
              )}
            </div>
            
            <p className="mt-6 text-xs text-gray-400 break-all w-full bg-gray-50 dark:bg-zinc-950 p-3 rounded-lg border border-gray-100 dark:border-zinc-800">
              https://1953-brother-gookbap.vercel.app/?q={qrModalData.id}
            </p>

            <button
              onClick={() => setQrModalData(null)}
              className="mt-6 w-full px-4 py-2.5 text-sm font-medium text-white bg-gray-900 dark:bg-zinc-800 rounded-lg hover:bg-gray-800 dark:hover:bg-zinc-700 transition-colors"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
