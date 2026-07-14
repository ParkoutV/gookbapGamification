/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client'

import { useState, useEffect, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { getGameData, saveGameData, uploadPartImage } from '../../actions'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import { Rnd } from 'react-rnd'
import Cropper, { ReactCropperElement } from 'react-cropper'
import 'cropperjs/dist/cropper.css'
import { Save, ArrowLeft, Plus, Image as ImageIcon, Trash2, X, Move, Maximize, Target, Upload } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'

export default function SpotDifferenceEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const unwrappedParams = use(params)
  const baseImageId = parseInt(unwrappedParams.id, 10)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [baseImage, setBaseImage] = useState<any>(null)
  
  // States for slots and parts
  const [slots, setSlots] = useState<any[]>([])
  const [parts, setParts] = useState<any[]>([])
  const [deletedSlotIds, setDeletedSlotIds] = useState<number[]>([])
  const [deletedPartIds, setDeletedPartIds] = useState<number[]>([])

  const [activeSlotId, setActiveSlotId] = useState<string | null>(null)
  const [activePartId, setActivePartId] = useState<string | null>(null)

  // Cropper Modal States
  const [isCropModalOpen, setIsCropModalOpen] = useState(false)
  const [uploadFileUrl, setUploadFileUrl] = useState<string | null>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [targetSlotId, setTargetSlotId] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const cropperRef = useRef<ReactCropperElement>(null)

  useEffect(() => {
    const fetchGameData = async () => {
      const result = await getGameData(baseImageId)
      if (result.error) {
        alert(result.error)
        router.push('/main/spot-difference')
        return
      }
      
      setBaseImage(result.baseImage)
      
      // Ensure we have unique string IDs for frontend tracking
      const mappedSlots = (result.slots || []).map((s: any) => ({ ...s, tempId: s.id.toString() }))
      setSlots(mappedSlots)
      
      const mappedParts = (result.parts || []).map((p: any) => ({ 
        ...p, 
        tempId: p.id.toString(),
        slotTempId: mappedSlots.find((s: any) => s.category_id === p.category_id)?.tempId 
      }))
      setParts(mappedParts)
      
      setLoading(false)
    }
    
    fetchGameData()
  }, [baseImageId, router])

  const handleSave = async () => {
    setSaving(true)
    const result = await saveGameData(baseImageId, slots, parts, deletedSlotIds, deletedPartIds)
    if (result.error) {
      alert(result.error)
    } else {
      alert('저장되었습니다.')
      // Reset deleted trackers
      setDeletedSlotIds([])
      setDeletedPartIds([])
    }
    setSaving(false)
  }

  const addSlot = () => {
    const newSlot = {
      tempId: uuidv4(),
      base_image_id: baseImageId,
      category_id: 0, // Will be assigned on server
      x_coordinate: 100,
      y_coordinate: 100,
      z_index: 1,
      scale: 1.0,
      isNew: true,
      name: '새 파츠' // Virtual field for UI
    }
    setSlots([...slots, newSlot])
    setActiveSlotId(newSlot.tempId)
  }

  const deleteSlot = (tempId: string) => {
    if (!confirm('파츠 영역과 업로드된 모든 이미지를 삭제하시겠습니까?')) return
    
    const slot = slots.find(s => s.tempId === tempId)
    if (!slot.isNew) setDeletedSlotIds([...deletedSlotIds, slot.id])
    
    // Track parts to delete
    const partsToDelete = parts.filter(p => p.slotTempId === tempId)
    const newDeletedPartIds = partsToDelete.filter(p => !p.isNew).map(p => p.id)
    setDeletedPartIds([...deletedPartIds, ...newDeletedPartIds])

    setSlots(slots.filter(s => s.tempId !== tempId))
    setParts(parts.filter(p => p.slotTempId !== tempId))
    if (activeSlotId === tempId) setActiveSlotId(null)
  }

  const deletePart = (tempId: string) => {
    const part = parts.find(p => p.tempId === tempId)
    if (!part.isNew) setDeletedPartIds([...deletedPartIds, part.id])
    setParts(parts.filter(p => p.tempId !== tempId))
  }

  const updateSlot = (tempId: string, updates: any) => {
    setSlots(slots.map(s => s.tempId === tempId ? { ...s, ...updates } : s))
  }

  const updatePart = (tempId: string, updates: any) => {
    setParts(parts.map(p => p.tempId === tempId ? { ...p, ...updates } : p))
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, slotTempId: string) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0]
      setUploadFile(file)
      setUploadFileUrl(URL.createObjectURL(file))
      setTargetSlotId(slotTempId)
      setIsCropModalOpen(true)
    }
    e.target.value = ''
  }

  const handleUploadPart = async () => {
    if (!uploadFile || !targetSlotId) return

    setIsUploading(true)
    try {
      const cropper = cropperRef.current?.cropper
      if (!cropper) throw new Error("Cropper not ready")
      
      cropper.getCroppedCanvas().toBlob(async (blob) => {
        if (!blob) throw new Error("Cropping failed")
        
        const croppedFile = new File([blob], uploadFile.name, { type: uploadFile.type })
        const formData = new FormData()
        formData.append('file', croppedFile)

        const result = await uploadPartImage(formData)
        
        if (result.error) {
          alert(result.error)
        } else {
          const slot = slots.find(s => s.tempId === targetSlotId)
          const newPart = {
            tempId: uuidv4(),
            slotTempId: targetSlotId,
            category_id: slot?.category_id || 0,
            name: `이미지 ${parts.filter(p => p.slotTempId === targetSlotId).length + 1}`,
            image_url: result.url,
            offset_x: 0,
            offset_y: 0,
            scale: 1.0,
            isNew: true
          }
          setParts([...parts, newPart])
          setIsCropModalOpen(false)
        }
        setIsUploading(false)
      }, uploadFile.type)
    } catch (err) {
      console.error(err)
      alert('업로드 실패')
      setIsUploading(false)
    }
  }

  if (loading) return <div className="flex justify-center py-20">Loading...</div>

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] -m-6">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 shrink-0">
        <div className="flex items-center">
          <button onClick={() => router.push('/main/spot-difference')} className="mr-4 text-gray-500 hover:text-gray-900 dark:hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            에디터: {baseImage?.title}
          </h1>
        </div>
        <button 
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-5 rounded-lg flex items-center shadow-sm disabled:opacity-50"
        >
          {saving ? '저장 중...' : <><Save className="w-4 h-4 mr-2" />저장하기</>}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Canvas Area (Left) */}
        <div className="flex-1 bg-gray-100 dark:bg-zinc-950 relative overflow-hidden flex items-center justify-center">
          <TransformWrapper
            initialScale={1}
            minScale={0.1}
            maxScale={5}
            centerOnInit
            wheel={{ smoothStep: 0.005 }}
            panning={{ excluded: ['rnd'] }} // Rnd 드래그 시 패닝 방지
          >
            {({ state }) => (
              <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
                <div className="relative border border-gray-300 dark:border-zinc-800 shadow-2xl" style={{ width: 1200, height: 800 }}>
                {baseImage && (
                  <Image
                    src={baseImage.image_url}
                    alt="Base"
                    fill
                    className="object-contain pointer-events-none"
                    unoptimized
                  />
                )}
                
                {/* Render Slots (Draggable/Resizable Overlays) */}
                {slots.map(slot => {
                  const slotParts = parts.filter(p => p.slotTempId === slot.tempId)
                  const activePart = slotParts.find(p => p.tempId === activePartId)
                  const displayPart = activePart || slotParts[0]
                  const isActive = activeSlotId === slot.tempId
                  
                  return (
                    <Rnd
                      key={slot.tempId}
                      scale={state.scale}
                      className={`rnd ${isActive ? 'ring-2 ring-blue-500 z-50' : 'ring-1 ring-white/50 hover:ring-blue-300 z-10'}`}
                      size={{ width: 100 * slot.scale, height: 100 * slot.scale }}
                      position={{ x: slot.x_coordinate, y: slot.y_coordinate }}
                      onDragStart={() => setActiveSlotId(slot.tempId)}
                      onDragStop={(e, d) => {
                        updateSlot(slot.tempId, { x_coordinate: Math.round(d.x), y_coordinate: Math.round(d.y) })
                      }}
                      onResizeStop={(e, direction, ref, delta, position) => {
                        // 리사이즈 시 배율 변경 (가로 폭 기준)
                        const newScale = parseFloat(ref.style.width) / 100
                        updateSlot(slot.tempId, { 
                          scale: newScale,
                          x_coordinate: Math.round(position.x),
                          y_coordinate: Math.round(position.y)
                        })
                      }}
                      bounds="parent"
                      lockAspectRatio
                    >
                      <div className="w-full h-full relative flex items-center justify-center overflow-hidden bg-black/10 backdrop-blur-[2px]">
                        {displayPart ? (
                          <Image src={displayPart.image_url} alt="Part" fill className="object-contain pointer-events-none" unoptimized />
                        ) : (
                          <Target className="w-8 h-8 text-white/50" />
                        )}
                        {isActive && (
                          <div className="absolute top-1 left-1 bg-blue-600 text-white text-[10px] px-1.5 rounded">
                            {slot.name || `파츠 ${slot.category_id}`}
                          </div>
                        )}
                      </div>
                    </Rnd>
                  )
                })}
                </div>
              </TransformComponent>
            )}
          </TransformWrapper>
          
          <div className="absolute bottom-4 left-4 bg-black/60 text-white px-3 py-1.5 rounded text-xs backdrop-blur">
            휠 또는 터치 제스처로 캔버스 확대/축소
          </div>
        </div>

        {/* Sidebar (Right) */}
        <div className="w-96 bg-white dark:bg-zinc-900 border-l border-gray-200 dark:border-zinc-800 flex flex-col overflow-hidden shrink-0 shadow-[-10px_0_30px_-15px_rgba(0,0,0,0.1)]">
          <div className="p-4 border-b border-gray-100 dark:border-zinc-800 flex justify-between items-center bg-gray-50 dark:bg-zinc-900">
            <h2 className="font-bold text-gray-900 dark:text-white flex items-center">
              <Move className="w-4 h-4 mr-2 text-blue-500" /> 파츠 관리
            </h2>
            <button
              onClick={addSlot}
              className="p-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 rounded transition-colors text-xs font-medium flex items-center"
            >
              <Plus className="w-3 h-3 mr-1" /> 슬롯 추가
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {slots.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-zinc-400 text-sm">
                상단의 &apos;슬롯 추가&apos; 버튼을 눌러 파츠를 배치할 영역을 생성하세요.
              </div>
            ) : (
              slots.map((slot, index) => {
                const slotParts = parts.filter(p => p.slotTempId === slot.tempId)
                const isActive = activeSlotId === slot.tempId

                return (
                  <div 
                    key={slot.tempId} 
                    className={`border rounded-xl overflow-hidden transition-all duration-200 ${isActive ? 'border-blue-500 shadow-md ring-1 ring-blue-500' : 'border-gray-200 dark:border-zinc-700'}`}
                    onClick={() => setActiveSlotId(slot.tempId)}
                  >
                    {/* Slot Header */}
                    <div className={`p-3 border-b flex items-center justify-between ${isActive ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-900/30' : 'bg-gray-50 dark:bg-zinc-800/50 border-gray-200 dark:border-zinc-700'}`}>
                      <input 
                        type="text"
                        value={slot.name || `파츠 그룹 ${index + 1}`}
                        onChange={(e) => updateSlot(slot.tempId, { name: e.target.value })}
                        className="bg-transparent font-bold text-sm text-gray-900 dark:text-white outline-none w-1/2"
                      />
                      <button onClick={(e) => { e.stopPropagation(); deleteSlot(slot.tempId) }} className="text-red-500 hover:text-red-700 p-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    
                    {/* Slot Settings */}
                    <div className="p-3 bg-white dark:bg-zinc-900 space-y-3">
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] font-medium text-gray-500 dark:text-zinc-400 uppercase">X 좌표</label>
                          <div className="flex items-center mt-1 border border-gray-200 dark:border-zinc-700 rounded overflow-hidden">
                            <button onClick={() => updateSlot(slot.tempId, { x_coordinate: slot.x_coordinate - 1 })} className="px-1.5 bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300">-</button>
                            <input 
                              type="number" 
                              value={slot.x_coordinate} 
                              onChange={(e) => updateSlot(slot.tempId, { x_coordinate: parseInt(e.target.value) || 0 })}
                              className="w-full text-center text-xs py-1 bg-transparent dark:text-white outline-none" 
                            />
                            <button onClick={() => updateSlot(slot.tempId, { x_coordinate: slot.x_coordinate + 1 })} className="px-1.5 bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300">+</button>
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-medium text-gray-500 dark:text-zinc-400 uppercase">Y 좌표</label>
                          <div className="flex items-center mt-1 border border-gray-200 dark:border-zinc-700 rounded overflow-hidden">
                            <button onClick={() => updateSlot(slot.tempId, { y_coordinate: slot.y_coordinate - 1 })} className="px-1.5 bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300">-</button>
                            <input 
                              type="number" 
                              value={slot.y_coordinate} 
                              onChange={(e) => updateSlot(slot.tempId, { y_coordinate: parseInt(e.target.value) || 0 })}
                              className="w-full text-center text-xs py-1 bg-transparent dark:text-white outline-none" 
                            />
                            <button onClick={() => updateSlot(slot.tempId, { y_coordinate: slot.y_coordinate + 1 })} className="px-1.5 bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300">+</button>
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-medium text-gray-500 dark:text-zinc-400 uppercase">배율</label>
                          <div className="flex items-center mt-1 border border-gray-200 dark:border-zinc-700 rounded overflow-hidden">
                            <button onClick={() => updateSlot(slot.tempId, { scale: Math.max(0.1, slot.scale - 0.1) })} className="px-1.5 bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300">-</button>
                            <input 
                              type="number" 
                              step="0.1"
                              value={slot.scale.toFixed(1)} 
                              onChange={(e) => updateSlot(slot.tempId, { scale: parseFloat(e.target.value) || 1 })}
                              className="w-full text-center text-xs py-1 bg-transparent dark:text-white outline-none" 
                            />
                            <button onClick={() => updateSlot(slot.tempId, { scale: slot.scale + 0.1 })} className="px-1.5 bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300">+</button>
                          </div>
                        </div>
                      </div>

                      {/* Part Images List */}
                      <div className="pt-3 border-t border-gray-100 dark:border-zinc-800">
                        <div className="flex justify-between items-center mb-2">
                          <label className="text-xs font-bold text-gray-700 dark:text-zinc-300 flex items-center">
                            <ImageIcon className="w-3 h-3 mr-1" /> 개별 이미지 ({slotParts.length})
                          </label>
                          <label className="cursor-pointer text-[10px] bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-1 rounded font-medium hover:bg-blue-100 transition-colors">
                            + 이미지 업로드
                            <input type="file" className="sr-only" accept="image/*" onChange={(e) => handleFileSelect(e, slot.tempId)} />
                          </label>
                        </div>

                        <div className="space-y-2">
                          {slotParts.map((part, pIdx) => (
                            <div 
                              key={part.tempId} 
                              className={`p-2 rounded border relative group cursor-pointer transition-colors ${activePartId === part.tempId ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-400 ring-1 ring-blue-400' : 'bg-gray-50 dark:bg-zinc-950 border-gray-100 dark:border-zinc-800'}`}
                              onClick={() => setActivePartId(part.tempId)}
                            >
                              <div className="flex gap-2 mb-2">
                                <div className="w-10 h-10 relative bg-gray-200 dark:bg-zinc-800 rounded shrink-0 overflow-hidden">
                                  <Image src={part.image_url} alt="part" fill className="object-cover" unoptimized />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <input 
                                    type="text" 
                                    value={part.name}
                                    onChange={(e) => updatePart(part.tempId, { name: e.target.value })}
                                    className="w-full text-xs font-medium bg-transparent outline-none dark:text-white mb-1"
                                    placeholder="이미지 이름"
                                  />
                                  <div className="text-[10px] text-gray-500">
                                    {pIdx === 0 ? '기준 이미지' : '상대 좌표/크기 적용 중'}
                                  </div>
                                </div>
                                <button onClick={() => deletePart(part.tempId)} className="text-gray-400 hover:text-red-500 p-1 self-start">
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                              
                              {/* Relative Adjustments (Only for parts after the 1st, or for all if user wants) */}
                              <div className="grid grid-cols-3 gap-1 mt-2">
                                <div className="flex items-center border border-gray-200 dark:border-zinc-700 rounded overflow-hidden">
                                  <span className="bg-gray-100 dark:bg-zinc-800 text-[9px] px-1 text-gray-500 border-r border-gray-200 dark:border-zinc-700">X</span>
                                  <button onClick={() => updatePart(part.tempId, { offset_x: part.offset_x - 1 })} className="px-1 text-[10px] hover:bg-gray-100 dark:hover:bg-zinc-800 dark:text-white">-</button>
                                  <span className="flex-1 text-center text-[10px] dark:text-white">{part.offset_x}</span>
                                  <button onClick={() => updatePart(part.tempId, { offset_x: part.offset_x + 1 })} className="px-1 text-[10px] hover:bg-gray-100 dark:hover:bg-zinc-800 dark:text-white">+</button>
                                </div>
                                <div className="flex items-center border border-gray-200 dark:border-zinc-700 rounded overflow-hidden">
                                  <span className="bg-gray-100 dark:bg-zinc-800 text-[9px] px-1 text-gray-500 border-r border-gray-200 dark:border-zinc-700">Y</span>
                                  <button onClick={() => updatePart(part.tempId, { offset_y: part.offset_y - 1 })} className="px-1 text-[10px] hover:bg-gray-100 dark:hover:bg-zinc-800 dark:text-white">-</button>
                                  <span className="flex-1 text-center text-[10px] dark:text-white">{part.offset_y}</span>
                                  <button onClick={() => updatePart(part.tempId, { offset_y: part.offset_y + 1 })} className="px-1 text-[10px] hover:bg-gray-100 dark:hover:bg-zinc-800 dark:text-white">+</button>
                                </div>
                                <div className="flex items-center border border-gray-200 dark:border-zinc-700 rounded overflow-hidden">
                                  <span className="bg-gray-100 dark:bg-zinc-800 text-[9px] px-1 text-gray-500 border-r border-gray-200 dark:border-zinc-700">%</span>
                                  <button onClick={() => updatePart(part.tempId, { scale: Math.max(0.1, part.scale - 0.1) })} className="px-1 text-[10px] hover:bg-gray-100 dark:hover:bg-zinc-800 dark:text-white">-</button>
                                  <span className="flex-1 text-center text-[10px] dark:text-white">{part.scale.toFixed(1)}</span>
                                  <button onClick={() => updatePart(part.tempId, { scale: part.scale + 0.1 })} className="px-1 text-[10px] hover:bg-gray-100 dark:hover:bg-zinc-800 dark:text-white">+</button>
                                </div>
                              </div>
                            </div>
                          ))}
                          {slotParts.length === 0 && (
                            <div className="text-[10px] text-gray-400 text-center py-2">등록된 이미지가 없습니다.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Part Image Crop Modal */}
      {isCropModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isUploading && setIsCropModalOpen(false)} />
          <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-zinc-800 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">파츠 이미지 크롭</h3>
            </div>
            <div className="p-4 bg-gray-100 dark:bg-zinc-950">
              <Cropper
                ref={cropperRef}
                src={uploadFileUrl!}
                style={{ height: 400, width: "100%" }}
                guides={true}
                viewMode={1}
                minCropBoxHeight={20}
                minCropBoxWidth={20}
                background={false}
                responsive={true}
                autoCropArea={1}
                checkOrientation={false}
              />
            </div>
            <div className="p-4 border-t border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900 flex justify-end gap-2">
              <button
                onClick={() => setIsCropModalOpen(false)}
                disabled={isUploading}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 bg-white dark:bg-zinc-800 border rounded-lg"
              >
                취소
              </button>
              <button
                onClick={handleUploadPart}
                disabled={isUploading}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg flex items-center"
              >
                {isUploading ? '업로드 중...' : '크롭 완료 및 업로드'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
