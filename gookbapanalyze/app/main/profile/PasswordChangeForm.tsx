'use client'

import { useState } from 'react'
import { changePassword } from './actions'
import { KeyRound, AlertCircle, CheckCircle2 } from 'lucide-react'

export default function PasswordChangeForm() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)

    const formData = new FormData(e.currentTarget)
    
    const result = await changePassword(formData)
    
    if (result.error) {
      setError(result.error)
    } else if (result.success) {
      setSuccess(true)
      // form 초기화
      e.currentTarget.reset()
    }
    
    setLoading(false)
  }

  return (
    <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
      <div className="p-6 border-b border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-800/50">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
          <KeyRound className="w-5 h-5 mr-2 text-blue-600" />
          비밀번호 변경
        </h2>
        <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
          보안을 위해 비밀번호를 주기적으로 변경해주세요.
        </p>
      </div>
      
      <div className="p-6">
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 text-sm font-medium border border-red-100 dark:border-red-900/50 flex items-center">
            <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0" />
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 rounded-lg bg-green-50 dark:bg-green-950/50 text-green-700 dark:text-green-400 text-sm font-medium border border-green-200 dark:border-green-900/50 flex items-center">
            <CheckCircle2 className="w-5 h-5 mr-2 flex-shrink-0" />
            비밀번호가 성공적으로 변경되었습니다.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
              기존 비밀번호
            </label>
            <input
              type="password"
              name="currentPassword"
              required
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              placeholder="현재 사용 중인 비밀번호"
            />
          </div>

          <div className="pt-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
              신규 비밀번호
            </label>
            <input
              type="password"
              name="newPassword"
              required
              minLength={4}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              placeholder="새로운 비밀번호"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
              신규 비밀번호 확인
            </label>
            <input
              type="password"
              name="confirmPassword"
              required
              minLength={4}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              placeholder="새로운 비밀번호를 다시 입력해주세요"
            />
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '변경 중...' : '비밀번호 변경'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
