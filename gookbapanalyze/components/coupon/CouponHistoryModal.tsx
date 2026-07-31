'use client'

import { useState, useEffect } from 'react'
import { X, Gift, Clock, User } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ko } from 'date-fns/locale'

export interface CouponHistoryItem {
  id: string
  nickname: string
  couponName: string
  usedAt: string
}

export default function CouponHistoryModal({ onClose }: { onClose: () => void }) {
  const [history, setHistory] = useState<CouponHistoryItem[]>([])

  useEffect(() => {
    const historyStr = localStorage.getItem('coupon_history')
    if (historyStr) {
      try {
        const parsed: CouponHistoryItem[] = JSON.parse(historyStr)
        // filter last 2 hours again just in case
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
        const valid = parsed.filter(h => new Date(h.usedAt) >= twoHoursAgo)
        setHistory(valid)
      } catch (e) {
        console.error(e)
      }
    }
  }, [])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
          <h2 className="text-2xl font-bold text-white flex items-center">
            <Clock className="w-6 h-6 mr-3 text-blue-400" />
            최근 2시간 사용 기록
          </h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1">
          {history.length === 0 ? (
            <div className="text-center py-12">
              <Gift className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
              <p className="text-zinc-400 text-lg">최근에 사용된 쿠폰이 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {history.map((item, i) => (
                <div key={`${item.id}-${i}`} className="bg-zinc-800/50 p-5 rounded-2xl flex items-start justify-between border border-zinc-700/50 hover:bg-zinc-800 transition-colors">
                  <div>
                    <div className="flex items-center text-zinc-300 mb-1">
                      <User className="w-4 h-4 mr-1.5" />
                      <span className="font-medium">{item.nickname}</span>
                    </div>
                    <div className="flex items-center text-white font-bold text-lg">
                      <Gift className="w-5 h-5 mr-2 text-blue-400" />
                      {item.couponName}
                    </div>
                  </div>
                  <div className="text-sm text-zinc-500 font-medium whitespace-nowrap ml-4">
                    {formatDistanceToNow(new Date(item.usedAt), { addSuffix: true, locale: ko })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
