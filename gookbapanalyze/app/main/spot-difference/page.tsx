'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { getBaseImages, uploadBaseImage, deleteBaseImage, getSupportedLanguages, updateBaseImageLevel } from './actions'
import { Image as ImageIcon, Plus, MoreVertical, Edit, Trash2, X, Upload } from 'lucide-react'
import Cropper, { ReactCropperElement } from 'react-cropper'
import 'cropperjs/dist/cropper.css'

type BaseImage = {
  id: number
  title: Record<string, string> | string
  image_url: string
  level: number
  created_at: string
}

export default function SpotDifferenceListPage() {
  const router = useRouter()
  const [images, setImages] = useState<BaseImage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Sorting state
  const [sortOrder, setSortOrder] = useState<'newest' | 'ko_asc' | 'level_asc' | 'level_desc'>('newest')
  
  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [supportedLanguages, setSupportedLanguages] = useState<any[]>([])
  const [uploadTitle, setUploadTitle] = useState<Record<string, string>>({})
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadFileUrl, setUploadFileUrl] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  
  const [uploadLevel, setUploadLevel] = useState<number>(1)
  const [isDragOver, setIsDragOver] = useState(false)
  
  // Dropdown states
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null)
  
  // Level Modal states
  const [isLevelModalOpen, setIsLevelModalOpen] = useState(false)
  const [levelModalTargetId, setLevelModalTargetId] = useState<number | null>(null)
  const [levelModalLevel, setLevelModalLevel] = useState<number>(1)

  const cropperRef = useRef<ReactCropperElement>(null)

  const fetchImages = async () => {
    setLoading(true)
    const result = await getBaseImages()
    if (result.error) {
      setError(result.error)
    } else if (result.baseImages) {
      setImages(result.baseImages)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchImages()
    const loadLanguages = async () => {
      const result = await getSupportedLanguages()
      if (result.success) {
        setSupportedLanguages(result.languages || [])
      }
    }
    loadLanguages()
  }, [])

  const handleDelete = async (id: number) => {
    if (!confirm('정말로 이 이미지를 삭제하시겠습니까? 관련된 모든 파츠 설정도 함께 삭제됩니다.')) return

    const result = await deleteBaseImage(id)
    if (result.error) {
      alert(result.error)
    } else {
      fetchImages()
    }
    setActiveDropdown(null)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0]
      setUploadFile(file)
      setUploadFileUrl(URL.createObjectURL(file))
      if (Object.keys(uploadTitle).length === 0) {
        setUploadTitle({ ko: file.name.split('.')[0] })
      }
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0]
      if (file.type.startsWith('image/')) {
        setUploadFile(file)
        setUploadFileUrl(URL.createObjectURL(file))
        if (Object.keys(uploadTitle).length === 0) {
          setUploadTitle({ ko: file.name.split('.')[0] })
        }
      } else {
        alert('이미지 파일만 업로드 가능합니다.')
      }
    }
  }

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!uploadFile || !uploadTitle.ko) {
      alert('한국어 이름과 파일을 반드시 입력해주세요.')
      return
    }

    setIsUploading(true)

    try {
      const cropper = cropperRef.current?.cropper
      if (!cropper) throw new Error("Cropper not ready")
      
      // Get cropped image as blob
      cropper.getCroppedCanvas().toBlob(async (blob) => {
        try {
          if (!blob) {
            alert('이미지 크롭에 실패했습니다.')
            setIsUploading(false)
            return
          }

          const formData = new FormData()
          // Convert blob back to file with a safe ASCII name and convert to webp
          const safeName = `upload.webp`
          const croppedFile = new File([blob], safeName, { type: 'image/webp' })
          formData.append('file', croppedFile)
          formData.append('title', JSON.stringify(uploadTitle))
          formData.append('level', String(uploadLevel))

          const result = await uploadBaseImage(formData)
          
          if (result.error) {
            alert(result.error)
            setIsUploading(false)
          } else if (result.baseImage) {
            setIsAddModalOpen(false)
            setIsUploading(false)
            setUploadFile(null)
            setUploadFileUrl(null)
            setUploadTitle({})
            setUploadLevel(1)
            
            // 바로 에디터 화면으로 이동
            router.push(`/main/spot-difference/edit/${result.baseImage.id}`)
          }
        } catch (innerErr) {
          console.error('Inner upload error:', innerErr)
          alert('업로드 처리 중 오류가 발생했습니다.')
          setIsUploading(false)
        }
      }, 'image/webp', 0.9)

    } catch (err) {
      console.error(err)
      alert('업로드 준비 중 오류가 발생했습니다.')
      setIsUploading(false)
    }
  }

  const handleUpdateLevel = async () => {
    if (levelModalTargetId === null) return
    const result = await updateBaseImageLevel(levelModalTargetId, levelModalLevel)
    if (result.error) {
      alert(result.error)
    } else {
      setImages(images.map(img => img.id === levelModalTargetId ? { ...img, level: levelModalLevel } : img))
      setIsLevelModalOpen(false)
    }
  }

  const sortedImages = useMemo(() => {
    const list = [...images]
    list.sort((a, b) => {
      if (sortOrder === 'ko_asc') {
        const titleA = typeof a.title === 'string' ? a.title : (a.title?.ko || '')
        const titleB = typeof b.title === 'string' ? b.title : (b.title?.ko || '')
        return titleA.localeCompare(titleB, 'ko-KR')
      } else if (sortOrder === 'level_asc') {
        return (a.level || 0) - (b.level || 0)
      } else if (sortOrder === 'level_desc') {
        return (b.level || 0) - (a.level || 0)
      } else { // 'newest'
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
    })
    return list
  }, [images, sortOrder])

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
            <ImageIcon className="w-6 h-6 mr-3 text-blue-600" />
            다른그림찾기 관리
          </h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-2">
            게임에 사용될 대표 그림을 업로드하고 편집합니다.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <select 
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as any)}
            className="bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-zinc-300 font-medium py-2 px-3 rounded-lg text-sm shadow-sm outline-none hover:border-blue-400 focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
          >
            <option value="newest">최신등록순</option>
            <option value="ko_asc">가나다순</option>
            <option value="level_asc">레벨 오름차순</option>
            <option value="level_desc">레벨 내림차순</option>
          </select>
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center shadow-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            이미지 추가
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 text-sm font-medium border border-red-100 dark:border-red-900/50">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : sortedImages.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-zinc-900 rounded-xl border border-dashed border-gray-300 dark:border-zinc-700">
          <ImageIcon className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">등록된 이미지가 없습니다</h3>
          <p className="text-gray-500 dark:text-zinc-400">우측 상단의 추가 버튼을 눌러 첫 대표 그림을 등록해보세요.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedImages.map((image) => (
            <div key={image.id} className="bg-white dark:bg-zinc-900 rounded-xl overflow-hidden shadow-sm ring-1 ring-gray-200 dark:ring-zinc-800 transition-all hover:shadow-md relative group">
              <div className="aspect-video relative overflow-hidden bg-gray-100 dark:bg-zinc-800">
                <Image 
                  src={image.image_url} 
                  alt={typeof image.title === 'string' ? image.title : (image.title?.ko || '이름 없음')} 
                  fill
                  className="object-cover transition-transform group-hover:scale-105"
                />
                {image.level && (
                  <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white text-xs font-bold px-2 py-1 rounded">
                    Level {image.level}
                  </div>
                )}
              </div>
              <div className="p-4">
                <h3 className="font-bold text-gray-900 dark:text-white text-lg truncate pr-8">
                  {typeof image.title === 'string' ? image.title : (image.title?.ko || '이름 없음')}
                </h3>
                <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">
                  등록일: {new Date(image.created_at).toLocaleDateString()}
                </p>
              </div>

              {/* Options Dropdown */}
              <div className="absolute top-2 right-2">
                <div className="relative inline-block text-left">
                  <button 
                    onClick={() => setActiveDropdown(activeDropdown === image.id ? null : image.id)}
                    className="p-1.5 bg-white/90 dark:bg-zinc-900/90 hover:bg-white dark:hover:bg-zinc-800 backdrop-blur shadow-sm rounded-lg transition-colors text-gray-700 dark:text-gray-300"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>
                  
                  {activeDropdown === image.id && (
                    <>
                      <div 
                        className="fixed inset-0 z-10" 
                        onClick={() => setActiveDropdown(null)}
                      />
                      <div className="absolute right-0 mt-2 w-32 rounded-md shadow-lg bg-white dark:bg-zinc-900 ring-1 ring-black ring-opacity-5 dark:ring-zinc-700 z-20 overflow-hidden">
                        <div className="py-1">
                          <Link
                            href={`/main/spot-difference/edit/${image.id}`}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 flex items-center"
                          >
                            <Edit className="w-4 h-4 mr-2" />
                            수정
                          </Link>
                          <button
                            onClick={() => {
                              setLevelModalTargetId(image.id)
                              setLevelModalLevel(image.level || 1)
                              setIsLevelModalOpen(true)
                              setActiveDropdown(null)
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 flex items-center"
                          >
                            <Edit className="w-4 h-4 mr-2" />
                            레벨 수정
                          </button>
                          <button
                            onClick={() => handleDelete(image.id)}
                            className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            삭제
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isUploading && setIsAddModalOpen(false)} />
          <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden ring-1 ring-white/10">
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-100 dark:border-zinc-800">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">대표 그림 업로드</h3>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                disabled={isUploading}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleUploadSubmit} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-4 sm:p-6 overflow-y-auto">
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="md:col-span-3">
                      <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
                        그림 이름 (설명)
                      </label>
                      <div className="space-y-3">
                        {supportedLanguages.map(lang => (
                          <div key={lang.lang_code} className="flex items-center">
                            <span className="w-20 text-xs font-semibold text-gray-500 uppercase">{lang.lang_name}</span>
                            <input
                              type="text"
                              value={uploadTitle[lang.lang_code] || ''}
                              onChange={(e) => setUploadTitle({ ...uploadTitle, [lang.lang_code]: e.target.value })}
                              required={lang.lang_code === 'ko'}
                              placeholder={lang.lang_code === 'ko' ? "예: 카페 전경 (낮)" : `${lang.lang_name} 이름`}
                              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                            />
                          </div>
                        ))}
                        {supportedLanguages.length === 0 && (
                          <div className="flex items-center">
                            <span className="w-20 text-xs font-semibold text-gray-500 uppercase">한국어</span>
                            <input
                              type="text"
                              value={uploadTitle['ko'] || ''}
                              onChange={(e) => setUploadTitle({ ...uploadTitle, ko: e.target.value })}
                              required
                              placeholder="예: 카페 전경 (낮)"
                              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
                        난이도 (레벨 1~9)
                      </label>
                      <select
                        value={uploadLevel}
                        onChange={(e) => setUploadLevel(Number(e.target.value))}
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(lv => (
                          <option key={lv} value={lv}>Level {lv}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
                      원본 이미지 선택
                    </label>
                    {!uploadFileUrl ? (
                      <div 
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`flex justify-center px-6 pt-10 pb-10 border-2 border-dashed rounded-xl transition-colors bg-gray-50 dark:bg-zinc-950/50 ${
                          isDragOver 
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                            : 'border-gray-300 dark:border-zinc-700 hover:border-blue-500 dark:hover:border-blue-500'
                        }`}
                      >
                        <div className="space-y-1 text-center">
                          <Upload className={`mx-auto h-12 w-12 ${isDragOver ? 'text-blue-500' : 'text-gray-400'}`} />
                          <div className="flex flex-col text-sm text-gray-600 dark:text-gray-400 mt-4 justify-center items-center">
                            <span className="mb-2 font-medium">여기로 이미지를 드래그하여 드롭하거나</span>
                            <label className="relative cursor-pointer bg-white dark:bg-zinc-800 px-4 py-2 border border-gray-300 dark:border-zinc-700 rounded-md font-medium text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors focus-within:outline-none">
                              <span>컴퓨터에서 파일 선택</span>
                              <input type="file" className="sr-only" accept="image/*" onChange={handleFileSelect} />
                            </label>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-zinc-500 mt-4">PNG, JPG, WEBP 최대 10MB</p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex justify-end">
                          <label className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-500">
                            다른 파일 선택
                            <input type="file" className="sr-only" accept="image/*" onChange={handleFileSelect} />
                          </label>
                        </div>
                        <div className="bg-gray-100 dark:bg-zinc-950 rounded-xl overflow-hidden border border-gray-200 dark:border-zinc-800">
                          <Cropper
                            ref={cropperRef}
                            src={uploadFileUrl}
                            style={{ height: 400, width: "100%" }}
                            guides={true}
                            viewMode={1}
                            minCropBoxHeight={50}
                            minCropBoxWidth={50}
                            background={false}
                            responsive={true}
                            autoCropArea={1}
                            checkOrientation={false}
                          />
                        </div>
                        <p className="text-xs text-gray-500 dark:text-zinc-400 text-center">
                          마우스로 드래그하여 원하는 영역을 자를 수 있습니다.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-6 border-t border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900/50 flex justify-end gap-3 mt-auto">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={isUploading}
                  className="px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-xl hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isUploading || !uploadFile}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center"
                >
                  {isUploading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      업로드 중...
                    </>
                  ) : (
                    '저장 및 편집 시작'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Level Edit Modal */}
      {isLevelModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsLevelModalOpen(false)} />
          <div className="relative bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-sm p-6 overflow-hidden border border-gray-100 dark:border-zinc-800">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">레벨 수정</h3>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
                난이도 (레벨 1~9)
              </label>
              <select
                value={levelModalLevel}
                onChange={(e) => setLevelModalLevel(Number(e.target.value))}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(lv => (
                  <option key={lv} value={lv}>Level {lv}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsLevelModalOpen(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-zinc-700 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800"
              >
                취소
              </button>
              <button
                onClick={handleUpdateLevel}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
