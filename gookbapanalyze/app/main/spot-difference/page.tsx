/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-hooks/set-state-in-effect */
'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { getBaseImages, uploadBaseImage, deleteBaseImage } from './actions'
import { Image as ImageIcon, Plus, MoreVertical, Edit, Trash2, X, Upload } from 'lucide-react'
import Cropper, { ReactCropperElement } from 'react-cropper'
import 'cropperjs/dist/cropper.css'

type BaseImage = {
  id: number
  title: string
  image_url: string
  created_at: string
}

export default function SpotDifferenceListPage() {
  const router = useRouter()
  const [images, setImages] = useState<BaseImage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadFileUrl, setUploadFileUrl] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  
  // Dropdown states
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null)

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
      if (!uploadTitle) {
        setUploadTitle(file.name.split('.')[0])
      }
    }
  }

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!uploadFile || !uploadTitle) return

    setIsUploading(true)

    try {
      const cropper = cropperRef.current?.cropper
      if (!cropper) throw new Error("Cropper not ready")
      
      // Get cropped image as blob
      cropper.getCroppedCanvas().toBlob(async (blob) => {
        if (!blob) {
          alert('이미지 크롭에 실패했습니다.')
          setIsUploading(false)
          return
        }

        const formData = new FormData()
        // Convert blob back to file
        const croppedFile = new File([blob], uploadFile.name, { type: uploadFile.type })
        formData.append('file', croppedFile)
        formData.append('title', uploadTitle)

        const result = await uploadBaseImage(formData)
        
        if (result.error) {
          alert(result.error)
          setIsUploading(false)
        } else if (result.baseImage) {
          setIsAddModalOpen(false)
          setIsUploading(false)
          setUploadFile(null)
          setUploadFileUrl(null)
          setUploadTitle('')
          
          // 바로 에디터 화면으로 이동
          router.push(`/main/spot-difference/edit/${result.baseImage.id}`)
        }
      }, uploadFile.type)

    } catch (err) {
      console.error(err)
      alert('업로드 중 오류가 발생했습니다.')
      setIsUploading(false)
    }
  }

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
        <button 
          onClick={() => setIsAddModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center shadow-sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          이미지 추가
        </button>
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
      ) : images.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-zinc-900 rounded-xl border border-dashed border-gray-300 dark:border-zinc-700">
          <ImageIcon className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">등록된 이미지가 없습니다</h3>
          <p className="text-gray-500 dark:text-zinc-400">우측 상단의 추가 버튼을 눌러 첫 대표 그림을 등록해보세요.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {images.map((image) => (
            <div key={image.id} className="bg-white dark:bg-zinc-900 rounded-xl overflow-hidden shadow-sm ring-1 ring-gray-200 dark:ring-zinc-800 transition-all hover:shadow-md relative group">
              <div className="aspect-video relative overflow-hidden bg-gray-100 dark:bg-zinc-800">
                <Image 
                  src={image.image_url} 
                  alt={image.title} 
                  fill
                  className="object-cover transition-transform group-hover:scale-105"
                />
              </div>
              <div className="p-4">
                <h3 className="font-bold text-gray-900 dark:text-white text-lg truncate pr-8">{image.title}</h3>
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
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
                      그림 이름 (설명)
                    </label>
                    <input
                      type="text"
                      value={uploadTitle}
                      onChange={(e) => setUploadTitle(e.target.value)}
                      required
                      placeholder="예: 카페 전경 (낮)"
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
                      원본 이미지 선택
                    </label>
                    {!uploadFileUrl ? (
                      <div className="flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 dark:border-zinc-700 border-dashed rounded-xl hover:border-blue-500 dark:hover:border-blue-500 transition-colors bg-gray-50 dark:bg-zinc-950/50">
                        <div className="space-y-1 text-center">
                          <Upload className="mx-auto h-12 w-12 text-gray-400" />
                          <div className="flex text-sm text-gray-600 dark:text-gray-400 mt-4 justify-center">
                            <label className="relative cursor-pointer bg-transparent rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none">
                              <span>파일 업로드</span>
                              <input type="file" className="sr-only" accept="image/*" onChange={handleFileSelect} />
                            </label>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-zinc-500 mt-2">PNG, JPG, GIF 최대 10MB</p>
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
    </div>
  )
}
