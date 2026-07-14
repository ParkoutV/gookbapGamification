'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { loginUser, verifyOTP } from './actions'

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [mfaRequired, setMfaRequired] = useState(false)
  const [userEmail, setUserEmail] = useState('')

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const result = await loginUser(formData)

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    if (result.mfaRequired) {
      setMfaRequired(true)
      setUserEmail(result.email!)
      setLoading(false)
      return
    }

    if (result.success) {
      router.push('/main')
    }
  }

  async function handleOTP(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    formData.append('email', userEmail)
    const result = await verifyOTP(formData)

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    if (result.success) {
      router.push('/main')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-zinc-950 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white dark:bg-zinc-900 shadow-lg p-8 ring-1 ring-gray-200 dark:ring-zinc-800">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">대시보드 로그인</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-2">관리자 계정으로 로그인해주세요</p>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 text-sm font-medium border border-red-100 dark:border-red-900/50">
            {error}
          </div>
        )}

        {!mfaRequired ? (
          <form key="login-form" onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1" htmlFor="credential">
                아이디 또는 이메일
              </label>
              <input
                id="credential"
                name="credential"
                type="text"
                required
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="아이디 입력"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1" htmlFor="password">
                비밀번호
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-4"
            >
              {loading ? '로그인 중...' : '로그인'}
            </button>
          </form>
        ) : (
          <form key="otp-form" onSubmit={handleOTP} className="space-y-4">
            <div className="text-sm text-gray-600 dark:text-zinc-400 mb-4 bg-gray-50 dark:bg-zinc-800 p-3 rounded-lg">
              기기 최초 로그인입니다.<br/>
              <span className="font-semibold text-gray-900 dark:text-white">{userEmail}</span>로 발송된 인증 코드를 입력해주세요.
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1" htmlFor="token">
                인증 코드
              </label>
              <input
                id="token"
                name="token"
                type="text"
                required
                autoComplete="one-time-code"
                inputMode="numeric"
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-center tracking-widest font-mono text-lg"
                placeholder="000000"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-4"
            >
              {loading ? '인증 중...' : '인증하기'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
