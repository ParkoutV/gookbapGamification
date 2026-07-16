'use client'

import { useState, useEffect } from 'react'
import { createAccount, getBranches } from '../actions'
import { Copy, CheckCircle2, UserPlus, Shield, Mail, Key, MapPin } from 'lucide-react'

export default function CreateAccountPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [setupLink, setSetupLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  
  const [permission, setPermission] = useState<string>("1")
  const [branches, setBranches] = useState<{branch_id: string, branch_name_ko: string}[]>([])

  useEffect(() => {
    async function loadBranches() {
      const result = await getBranches()
      if (result.success && result.branches) {
        setBranches(result.branches)
      }
    }
    loadBranches()
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSetupLink(null)
    setCopied(false)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const result = await createAccount(formData)

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    if (result.success && result.setupUuid) {
      // 생성된 설정 링크 조합
      const link = `${window.location.origin}/setup/${result.setupUuid}`
      setSetupLink(link)
      e.currentTarget.reset()
    }
    
    setLoading(false)
  }

  const copyToClipboard = async () => {
    if (setupLink) {
      try {
        await navigator.clipboard.writeText(setupLink)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch (err) {
        console.error('Failed to copy text: ', err)
      }
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
          <UserPlus className="w-6 h-6 mr-3 text-blue-600" />
          신규 계정 생성
        </h1>
        <p className="text-sm text-gray-500 dark:text-zinc-400 mt-2">
          새로운 관리자 계정을 생성하고 접속 링크를 발급할 수 있습니다.
        </p>
      </div>

      <div className="bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-gray-200 dark:ring-zinc-800 rounded-xl p-6 mb-8">
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 text-sm font-medium border border-red-100 dark:border-red-900/50">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1" htmlFor="accountId">
                <Key className="w-4 h-4 mr-2 text-gray-400" />
                아이디 (Account ID)
              </label>
              <input
                id="accountId"
                name="accountId"
                type="text"
                required
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="ex) manager_1"
              />
            </div>

            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1" htmlFor="email">
                <Mail className="w-4 h-4 mr-2 text-gray-400" />
                이메일 주소
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="manager@example.com"
              />
            </div>

            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1" htmlFor="permission">
                <Shield className="w-4 h-4 mr-2 text-gray-400" />
                권한 수준
              </label>
              <select
                id="permission"
                name="permission"
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                value={permission}
                onChange={(e) => setPermission(e.target.value)}
              >
                <option value="1">일반 관리자 (대시보드 조회만 가능)</option>
                <option value="0">최고 관리자 (모든 권한 및 설정 수정 가능)</option>
              </select>
            </div>

            {permission === "1" && (
              <div className="animate-in fade-in slide-in-from-top-2">
                <label className="flex items-center text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1" htmlFor="assignedBranchId">
                  <MapPin className="w-4 h-4 mr-2 text-gray-400" />
                  소속 지점 (선택사항)
                </label>
                <select
                  id="assignedBranchId"
                  name="assignedBranchId"
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  defaultValue=""
                >
                  <option value="">선택안함</option>
                  {branches.map(branch => (
                    <option key={branch.branch_id} value={branch.branch_id}>
                      {branch.branch_name_ko}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {loading ? '계정 생성 중...' : '계정 생성 및 링크 발급'}
          </button>
        </form>
      </div>

      {setupLink && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-6 transition-all animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-start">
            <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-500 mt-0.5 mr-3 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-lg font-medium text-green-900 dark:text-green-400 mb-2">
                계정이 성공적으로 생성되었습니다!
              </h3>
              <p className="text-sm text-green-800 dark:text-green-500/80 mb-4">
                아래의 링크를 복사하여 대상자에게 전달해 주세요.<br/>
                접속자는 해당 링크를 통해 최초 1회 자신의 비밀번호를 직접 설정할 수 있습니다.
              </p>
              
              <div className="flex items-center mt-2 bg-white dark:bg-black/40 rounded-lg border border-green-200 dark:border-green-800/50 p-1">
                <input 
                  type="text" 
                  readOnly 
                  value={setupLink} 
                  className="flex-1 bg-transparent px-3 py-2 text-sm text-gray-700 dark:text-gray-300 outline-none w-full"
                />
                <button
                  onClick={copyToClipboard}
                  className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    copied 
                      ? 'bg-green-600 text-white' 
                      : 'bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-100 hover:bg-green-200 dark:hover:bg-green-700'
                  }`}
                >
                  {copied ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-1.5" />
                      복사됨
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-1.5" />
                      링크 복사
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
