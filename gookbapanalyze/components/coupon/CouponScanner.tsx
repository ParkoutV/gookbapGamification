'use client'

import { useState, useEffect, useRef } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { Settings, History, Camera, Video, MonitorPlay, X, Gift } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import CouponSettingsModal from './CouponSettingsModal'
import CouponHistoryModal, { CouponHistoryItem } from './CouponHistoryModal'

interface CouponScannerProps {
  isAdmin: boolean
}

interface LanguageSetting {
  lang_code: string
  coupon_use_text: {
    use_coupon_question: string
    yes: string
    no: string
    used_successfully: string
  }
}

export default function CouponScanner({ isAdmin }: CouponScannerProps) {
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([])
  const [selectedCameraId, setSelectedCameraId] = useState<string>('')
  const [isScanning, setIsScanning] = useState(false)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  
  const [languages, setLanguages] = useState<LanguageSetting[]>([])
  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null)
  const [keepScreenOn, setKeepScreenOn] = useState(false)
  
  // Modal states
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  
  // Video Fit state
  const [videoFit, setVideoFit] = useState<'width' | 'height' | 'fill'>('width')
  const [isFlipped, setIsFlipped] = useState(false)
  
  // Track the shutdown promise to prevent race conditions when switching cameras rapidly
  const stopPromiseRef = useRef<Promise<void> | null>(null)
  
  // Load settings from local storage on mount
  useEffect(() => {
    const storedKeepScreenOn = localStorage.getItem('coupon_keepScreenOn')
    if (storedKeepScreenOn !== null) setKeepScreenOn(storedKeepScreenOn === 'true')
      
    const storedFlipped = localStorage.getItem('coupon_isFlipped')
    if (storedFlipped !== null) setIsFlipped(storedFlipped === 'true')

    const storedVideoFit = localStorage.getItem('coupon_videoFit') as 'width' | 'height' | 'fill' | null
    if (storedVideoFit) setVideoFit(storedVideoFit)
      
    const storedCameraId = localStorage.getItem('coupon_selectedCameraId')
    if (storedCameraId) setSelectedCameraId(storedCameraId)
  }, [])
  
  // Save settings to local storage when they change
  useEffect(() => {
    localStorage.setItem('coupon_keepScreenOn', String(keepScreenOn))
  }, [keepScreenOn])
  
  useEffect(() => {
    localStorage.setItem('coupon_isFlipped', String(isFlipped))
  }, [isFlipped])

  useEffect(() => {
    localStorage.setItem('coupon_videoFit', videoFit)
  }, [videoFit])
  
  useEffect(() => {
    if (selectedCameraId) {
      localStorage.setItem('coupon_selectedCameraId', selectedCameraId)
    }
  }, [selectedCameraId])

  // Toast overlay states
  const [toastStatus, setToastStatus] = useState<'idle' | 'loading' | 'confirm' | 'success' | 'error'>('idle')
  const [scannedData, setScannedData] = useState<{ couponId: string; langCode: string } | null>(null)
  const [couponInfo, setCouponInfo] = useState<any>(null)
  const [toastMessage, setToastMessage] = useState<string>('')
  
  const supabase = createClient()

  // Initialize Wake Lock API if supported
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator && keepScreenOn) {
          const lock = await navigator.wakeLock.request('screen')
          setWakeLock(lock)
        } else if (wakeLock) {
          await wakeLock.release()
          setWakeLock(null)
        }
      } catch (err) {
        console.error('Wake Lock error:', err)
      }
    }
    requestWakeLock()
    
    return () => {
      if (wakeLock) wakeLock.release()
    }
  }, [keepScreenOn])

  // Fetch languages
  const fetchLanguages = async () => {
    const { data, error } = await supabase.from('supported_languages').select('lang_code, coupon_use_text').order('order_index')
    if (data && !error) {
      setLanguages(data as LanguageSetting[])
    }
  }

  useEffect(() => {
    fetchLanguages()
    
    // Get cameras
    Html5Qrcode.getCameras().then(devices => {
      if (devices && devices.length) {
        setCameras(devices)
        // Only set default if not already loaded from local storage
        setSelectedCameraId(prev => {
          if (prev && devices.find(d => d.id === prev)) return prev
          return devices[0].id
        })
      }
    }).catch(err => {
      console.error("Error getting cameras", err)
    })
  }, [])
  
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const handleVis = () => setIsVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', handleVis)
    return () => document.removeEventListener('visibilitychange', handleVis)
  }, [])

  // Force video distortion for 'fill' mode if browser ignores object-fit
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null
    
    if (videoFit === 'fill') {
      interval = setInterval(() => {
        const video = document.querySelector('#reader video') as HTMLVideoElement | null
        const container = document.getElementById('reader')
        
        if (video && container && video.videoWidth > 0 && video.videoHeight > 0) {
          // Calculate scale ratios to stretch the video to the exact container size
          const scaleX = container.clientWidth / video.videoWidth
          const scaleY = container.clientHeight / video.videoHeight
          
          // Apply flip multiplier if active
          const flipMlt = isFlipped ? -1 : 1
          
          // Force internal size to intrinsic size, then scale it up forcefully
          video.style.setProperty('width', `${video.videoWidth}px`, 'important')
          video.style.setProperty('height', `${video.videoHeight}px`, 'important')
          video.style.setProperty('transform', `scale(${scaleX * flipMlt}, ${scaleY})`, 'important')
          // If flipped, the transform origin needs to be adjusted so it stays in the top-left visual box
          video.style.setProperty('transform-origin', isFlipped ? 'top right' : 'top left', 'important')
          video.style.setProperty('position', 'absolute', 'important')
          video.style.setProperty('top', '0', 'important')
          // If flipped, we anchor it differently to keep it in view
          video.style.setProperty('left', isFlipped ? `-${container.clientWidth}px` : '0', 'important')
        }
      }, 200)
    } else {
      // Clean up forced inline styles when not in fill mode
      const video = document.querySelector('#reader video') as HTMLVideoElement | null
      if (video) {
        video.style.removeProperty('width')
        video.style.removeProperty('height')
        video.style.removeProperty('transform')
        video.style.removeProperty('transform-origin')
        video.style.removeProperty('position')
        video.style.removeProperty('top')
        video.style.removeProperty('left')
      }
    }
    
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [videoFit, isFlipped, isScanning])

  // Unified scanner effect to handle StrictMode and async safely
  useEffect(() => {
    let active = true
    let startPromise: Promise<any> | null = null

    const initScanner = async () => {
      // 이전 카메라가 꺼지는 중이라면 완전히 꺼질 때까지 대기 (레이스 컨디션 방지)
      if (stopPromiseRef.current) {
        await stopPromiseRef.current
        stopPromiseRef.current = null
      }
      if (!active) return

      // 모달창이 열려있어도 카메라는 계속 켜두어 실시간 프리뷰를 제공하되, 스캔 결과만 무시하도록 설정
      if (isVisible && selectedCameraId && toastStatus === 'idle') {
        
        // Debounce slightly for smooth transitions
        await new Promise(r => setTimeout(r, 100))
        if (!active) return

        if (!scannerRef.current) {
          const scanner = new Html5Qrcode("reader", {
            formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
            verbose: false
          })
          // 꿀팁: html5-qrcode 라이브러리의 자체 일시정지 기능을 무력화하여 'Scanner paused' 화면을 원천 차단
          scanner.pause = () => {
            console.log("html5-qrcode internal pause blocked")
          }
          scanner.resume = () => {
            console.log("html5-qrcode internal resume blocked")
          }
          scannerRef.current = scanner
        }

        try {
          setIsScanning(true)
          startPromise = scannerRef.current.start(
            selectedCameraId,
            {
              fps: 10,
              videoConstraints: {
                deviceId: { exact: selectedCameraId },
                width: { ideal: 1920 },
                height: { ideal: 1080 }
              }
            },
            (decodedText) => {
              handleScan(decodedText)
            },
            (errorMessage) => {
              // ignore background errors
            }
          )
          await startPromise
        } catch (err) {
          console.error("Scanner start error", err)
          if (active) setIsScanning(false)
        }
      }
    }

    initScanner()

    return () => {
      active = false
      const stopAndClear = async () => {
        if (startPromise) {
          try {
            await startPromise // wait for it to finish starting before stopping
          } catch (e) {
            // ignore start error
          }
        }
        if (scannerRef.current) {
          try {
            if (scannerRef.current.isScanning) {
              await scannerRef.current.stop()
            }
            scannerRef.current.clear()
          } catch (err) {
            console.error("Stop error", err)
          } finally {
            scannerRef.current = null
          }
        }
        setIsScanning(false)
      }
      stopPromiseRef.current = stopAndClear()
    }
  }, [isVisible, selectedCameraId, toastStatus])

  // Visibility effect is handled separately to update the state


  const isValidUUID = (str: string) => {
    const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    return regex.test(str)
  }

  const handleScan = async (text: string) => {
    // Prevent multiple scans
    if (toastStatus !== 'idle') return
    // Ignore scans if a modal is open
    if (isSettingsOpen || isHistoryOpen) return
    
    const parts = text.split('?')
    if (parts.length < 1 || !isValidUUID(parts[0])) {
      return // 조용히 무시 (다른 바코드/QR코드일 경우)
    }

    // 유효한 쿠폰 QR일 때만 처리 시작
    // The useEffect will handle stopping it because toastStatus will change to 'loading'
    const couponId = parts[0]
    const langCode = parts.length > 1 ? parts[1] : 'ko'
    
    setScannedData({ couponId, langCode })
    setToastStatus('loading')

    try {
      const { data, error } = await supabase.rpc('get_coupon_info_for_scan', { p_coupon_id: couponId })
      
      if (error) throw error
      
      if (data.is_used) {
        setToastStatus('error')
        setToastMessage('이미 사용된 쿠폰입니다.')
        setTimeout(() => setToastStatus('idle'), 3000)
        return
      }

      setCouponInfo(data)
      setToastStatus('confirm')
    } catch (err) {
      console.error(err)
      setToastStatus('error')
      setToastMessage('쿠폰 정보를 불러오지 못했습니다.')
      setTimeout(() => setToastStatus('idle'), 3000)
    }
  }

  const parseText = (template: string, info: any, targetLang: string) => {
    let text = template || ''
    
    // 닉네임 다국어 파싱
    let nickname = ''
    if (info.nickname_first && info.nickname_last) {
      nickname = (info.nickname_first[targetLang] || info.nickname_first['ko'] || '') + ' ' +
                 (info.nickname_last[targetLang] || info.nickname_last['ko'] || '')
    }
    
    // 쿠폰 이름 다국어 파싱 + 원문 괄호(ko 아닌 경우)
    let couponName = ''
    try {
      const parsedTypes = JSON.parse(info.coupon_type)
      couponName = parsedTypes[targetLang] || parsedTypes['ko'] || ''
      if (targetLang !== 'ko' && parsedTypes['ko']) {
        couponName += ` (${parsedTypes['ko']})`
      }
    } catch (e) {
      couponName = info.coupon_type
    }

    return text.replace('{{user_nickname}}', nickname.trim()).replace('{{coupon_effects}}', couponName)
  }

  const handleConfirmUse = async () => {
    if (!scannedData || !couponInfo) return
    
    setToastStatus('loading')
    try {
      const { error } = await supabase.rpc('use_coupon', { p_coupon_id: scannedData.couponId })
      if (error) throw error
      
      // Save to local storage for history
      const historyStr = localStorage.getItem('coupon_history')
      const history: CouponHistoryItem[] = historyStr ? JSON.parse(historyStr) : []
      
      let nickname = ''
      if (couponInfo.nickname_first && couponInfo.nickname_last) {
        nickname = (couponInfo.nickname_first['ko'] || '') + ' ' + (couponInfo.nickname_last['ko'] || '')
      }
      
      let couponNameKo = ''
      try {
        const parsedTypes = JSON.parse(couponInfo.coupon_type)
        couponNameKo = parsedTypes['ko'] || ''
      } catch (e) {
        couponNameKo = couponInfo.coupon_type
      }

      history.unshift({
        id: scannedData.couponId,
        nickname: nickname.trim(),
        couponName: couponNameKo,
        usedAt: new Date().toISOString()
      })
      
      // Keep only last 2 hours
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
      const filtered = history.filter(h => new Date(h.usedAt) >= twoHoursAgo)
      localStorage.setItem('coupon_history', JSON.stringify(filtered))

      setToastStatus('success')
      
      // Show for 3s, then switch language to KO if needed, then close
      setTimeout(() => {
        setScannedData(prev => prev ? { ...prev, langCode: 'ko' } : null)
        setTimeout(() => {
          setToastStatus('idle')
          setScannedData(null)
          setCouponInfo(null)
        }, 1500)
      }, 3000)
      
    } catch (err) {
      console.error(err)
      setToastStatus('error')
      setToastMessage('쿠폰 사용 처리에 실패했습니다.')
      setTimeout(() => setToastStatus('idle'), 3000)
    }
  }

  const handleCancelUse = () => {
    setToastStatus('idle')
    setScannedData(null)
    setCouponInfo(null)
  }

  // Find texts for target lang
  const targetLang = scannedData?.langCode || 'ko'
  const langConfig = languages.find(l => l.lang_code === targetLang)?.coupon_use_text || 
    { use_coupon_question: '{{user_nickname}}님의 {{coupon_effects}}을(를) 사용하시겠습니까?', yes: '예', no: '아니오', used_successfully: '쿠폰이 사용되었습니다.' }
  
  const displayQuestion = couponInfo ? parseText(langConfig.use_coupon_question, couponInfo, targetLang) : ''
  const displaySuccess = couponInfo ? parseText(langConfig.used_successfully, couponInfo, targetLang) : ''

  return (
    <div className="flex-1 relative bg-black flex flex-col overflow-hidden w-full">
      
      {/* Top Left: Settings */}
      {isAdmin && (
        <button 
          onClick={() => setIsSettingsOpen(true)}
          className="absolute top-4 left-4 z-10 p-3 bg-zinc-900/80 backdrop-blur rounded-full text-white hover:bg-zinc-800 transition-colors"
        >
          <Settings className="w-6 h-6" />
        </button>
      )}

      {/* Top Right: Camera Selector */}
      <div className="absolute top-4 right-4 z-50 flex items-center bg-zinc-900/80 backdrop-blur rounded-full px-2 py-1 shadow-lg">
        <Camera className="w-5 h-5 text-gray-400 mr-2 ml-2" />
        <select 
          className="bg-transparent text-white outline-none py-2 pr-4 text-sm"
          value={selectedCameraId}
          onChange={(e) => setSelectedCameraId(e.target.value)}
        >
          {cameras.map(cam => (
            <option key={cam.id} value={cam.id} className="text-black">{cam.label || `Camera ${cam.id}`}</option>
          ))}
        </select>
      </div>

      {/* Bottom Left: History */}
      <button 
        onClick={() => setIsHistoryOpen(true)}
        className="absolute bottom-8 left-4 z-50 p-4 bg-zinc-900/90 backdrop-blur rounded-2xl shadow-xl flex items-center text-white hover:bg-zinc-800 transition-colors"
      >
        <History className="w-6 h-6 mr-3 text-blue-400" />
        <span className="font-semibold text-lg">최근 사용</span>
      </button>

      {/* Scanner Viewport */}
      <div className="flex-1 min-h-0 w-full flex flex-col justify-center items-center bg-black relative overflow-hidden">
        <div id="reader" data-fit={videoFit} data-flipped={isFlipped} className="w-full h-full flex items-center justify-center border-none"></div>
      </div>

      {/* Large Toast / Overlay UI */}
      {toastStatus !== 'idle' && (
        <div className="absolute inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 w-full max-w-md shadow-2xl flex flex-col items-center text-center transform scale-100 animate-in zoom-in-95 duration-200">
            
            {toastStatus === 'loading' && (
              <div className="py-12">
                <div className="animate-spin w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-6"></div>
                <h2 className="text-2xl font-bold text-white">조회중...</h2>
              </div>
            )}

            {toastStatus === 'error' && (
              <div className="py-10">
                <div className="w-20 h-20 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                  <X className="w-10 h-10" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">오류 발생</h2>
                <p className="text-xl text-gray-400">{toastMessage}</p>
              </div>
            )}

            {toastStatus === 'confirm' && (
              <div className="w-full py-4">
                <div className="w-20 h-20 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Gift className="w-10 h-10" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-8 leading-relaxed break-keep">
                  {displayQuestion}
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={handleCancelUse}
                    className="py-5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl text-xl font-bold transition-colors"
                  >
                    {langConfig.no}
                  </button>
                  <button 
                    onClick={handleConfirmUse}
                    className="py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-xl font-bold shadow-lg shadow-blue-500/30 transition-colors"
                  >
                    {langConfig.yes}
                  </button>
                </div>
              </div>
            )}

            {toastStatus === 'success' && (
              <div className="py-10">
                <div className="w-20 h-20 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Check className="w-10 h-10" />
                </div>
                <h2 className="text-3xl font-bold text-green-400 mb-4">완료!</h2>
                <p className="text-2xl text-white font-medium leading-relaxed break-keep">{displaySuccess}</p>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Modals */}
      {isSettingsOpen && (
        <CouponSettingsModal 
          languages={languages} 
          keepScreenOn={keepScreenOn}
          onKeepScreenOnChange={setKeepScreenOn}
          videoFit={videoFit}
          onVideoFitChange={setVideoFit}
          isFlipped={isFlipped}
          onIsFlippedChange={setIsFlipped}
          onClose={() => { setIsSettingsOpen(false); fetchLanguages(); }} 
        />
      )}
      {isHistoryOpen && <CouponHistoryModal onClose={() => setIsHistoryOpen(false)} />}
    </div>
  )
}

function Check(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}
