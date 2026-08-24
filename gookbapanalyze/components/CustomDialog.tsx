'use client'

import React from 'react'

export interface CustomDialogProps {
  type: 'alert' | 'confirm';
  message: string;
  onClose: () => void;
  onConfirm: () => void;
}

export default function CustomDialog({ type, message, onClose, onConfirm }: CustomDialogProps) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-200 border border-zinc-200 dark:border-zinc-800">
        <h3 className="text-lg font-bold mb-3 text-gray-900 dark:text-white">
          {type === 'confirm' ? '확인' : '알림'}
        </h3>
        <p className="text-gray-700 dark:text-zinc-300 mb-6 whitespace-pre-wrap break-words text-sm leading-relaxed">
          {message}
        </p>
        <div className="flex justify-end gap-3">
          {type === 'confirm' && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 dark:text-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-xl transition-colors"
            >
              취소
            </button>
          )}
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  )
}
