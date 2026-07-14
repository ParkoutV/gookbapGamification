'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { verifySetupLink, setupPassword } from '../actions'
import { Key, Lock, AlertCircle, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'

export default function SetupPasswordPage() {
  const params = useParams()
  const router = useRouter()
  const uuid = params.uuid as string

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [accountInfo, setAccountInfo] = useState<{ email: string, accountId: string } | null>(null)

  useEffect(() => {
    async function checkLink() {
      if (!uuid) return
      
      const result = await verifySetupLink(uuid)
      if (result.error) {
        setError(result.error)
      } else if (result.success) {
        setAccountInfo({ email: result.email!, accountId: result.accountId! })
      }
      setLoading(false)
    }
    
    checkLink()
  }, [uuid])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const formData = new FormData(e.currentTarget)
    formData.append('uuid', uuid)

    const result = await setupPassword(formData)

    if (result.error) {
      setError(result.error)
      setSubmitting(false)
      return
    }

    if (result.success) {
      setSuccess(true)
      setTimeout(() => {
        router.push('/login')
      }, 3000)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-zinc-950 p-4">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  if (error && !success && !accountInfo) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-zinc-950 p-4">
        <div className="w-full max-w-md rounded-xl bg-white dark:bg-zinc-900 shadow-lg p-8 ring-1 ring-gray-200 dark:ring-zinc-800 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">접근 오류</h1>
          <p className="text-gray-600 dark:text-zinc-400 mb-6">{error}</p>
          <Link href="/login" className="text-blue-600 hover:underline text-sm font-medium">
            로그인 화면으로 돌아가기
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-zinc-950 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white dark:bg-zinc-900 shadow-lg p-8 ring-1 ring-gray-200 dark:ring-zinc-800">
        
        {success ? (
          <div className="text-center animate-in fade-in slide-in-from-bottom-4">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">설정 완료!</h1>
            <p className="text-gray-600 dark:text-zinc-400 mb-6">
              비밀번호가 성공적으로 설정되었습니다.<br/>
              잠시 후 로그인 화면으로 이동합니다.
            </p>
          </div>
        ) : (
          <>
            <div className="text-center mb-8">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Key className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">비밀번호 설정</h1>
              <p className="text-sm text-gray-500 dark:text-zinc-400 mt-2">
                새로운 계정의 비밀번호를 입력해주세요.
              </p>
            </div>

            <div className="bg-gray-50 dark:bg-zinc-800/50 rounded-lg p-4 mb-6">
              <p className="text-xs text-gray-500 dark:text-zinc-400 mb-1">아이디</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{accountInfo?.accountId}</p>
              <div className="h-px bg-gray-200 dark:bg-zinc-700 my-2"></div>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mb-1">이메일</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{accountInfo?.email}</p>
            </div>

            {error && (
              <div className="mb-6 p-3 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 text-sm font-medium border border-red-100 dark:border-red-900/50">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1" htmlFor="password">
                  새 비밀번호
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="w-4 h-4 text-gray-400" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    minLength={6}
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    placeholder="최소 6자리 이상 입력"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1" htmlFor="confirmPassword">
                  비밀번호 확인
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="w-4 h-4 text-gray-400" />
                  </div>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    required
                    minLength={6}
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    placeholder="비밀번호를 다시 입력"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-4"
              >
                {submitting ? '설정 중...' : '비밀번호 저장'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
