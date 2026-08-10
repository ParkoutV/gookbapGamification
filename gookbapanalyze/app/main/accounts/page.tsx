/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getAccountsList, deleteAccount, updatePermission, getBranches } from './actions'
import { Users, Plus, MoreVertical, Shield, Trash2, CheckCircle2, XCircle, MapPin } from 'lucide-react'

type Account = {
  user_id: string
  account_id: string
  email: string
  permission: number
  is_setup_completed: boolean
  created_at: string
  is_current_user: boolean
  assigned_branch_id?: string | null
}

export default function AccountsListPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // 모달 상태
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [updating, setUpdating] = useState(false)
  const [branches, setBranches] = useState<{branch_id: string, branch_name_ko: string}[]>([])
  const [editPermission, setEditPermission] = useState<string>("1")

  const fetchAccounts = async () => {
    setLoading(true)
    const result = await getAccountsList()
    if (result.error) {
      setError(result.error)
    } else if (result.accounts) {
      setAccounts(result.accounts)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchAccounts()
    async function loadBranches() {
      const result = await getBranches()
      if (result.success && result.branches) {
        setBranches(result.branches)
      }
    }
    loadBranches()
  }, [])

  const handleDelete = async (userId: string) => {
    if (!confirm('정말로 이 계정을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return

    const result = await deleteAccount(userId)
    if (result.error) {
      alert(result.error)
    } else {
      fetchAccounts()
    }
    setActiveDropdown(null)
  }

  const handleUpdatePermission = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editingAccount) return

    setUpdating(true)
    const formData = new FormData(e.currentTarget)
    const newPermission = parseInt(formData.get('permission') as string, 10)
    let assignedBranchId = formData.get('assignedBranchId') as string | null
    if (assignedBranchId === '') assignedBranchId = null

    const result = await updatePermission(editingAccount.user_id, newPermission, assignedBranchId)
    if (result.error) {
      alert(result.error)
    } else {
      fetchAccounts()
      setEditingAccount(null)
    }
    setUpdating(false)
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
            <Users className="w-6 h-6 mr-3 text-blue-600" />
            계정 관리
          </h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-2">
            대시보드에 접근할 수 있는 관리자 계정 목록을 관리합니다.
          </p>
        </div>
        <Link 
          href="/main/accounts/create"
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center shadow-sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          계정 추가
        </Link>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 text-sm font-medium border border-red-100 dark:border-red-900/50">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-gray-200 dark:ring-zinc-800 rounded-xl overflow-visible relative min-h-[300px] pb-32">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-sm text-left min-w-max whitespace-nowrap">
            <thead className="text-xs text-gray-500 dark:text-zinc-400 bg-gray-50 dark:bg-zinc-800/50 border-b border-gray-200 dark:border-zinc-800 uppercase">
              <tr>
                <th className="px-6 py-4 font-semibold">아이디</th>
                <th className="px-6 py-4 font-semibold">이메일</th>
                <th className="px-6 py-4 font-semibold">권한</th>
                <th className="px-6 py-4 font-semibold">소속 지점</th>
                <th className="px-6 py-4 font-semibold text-center">회원가입 상태</th>
                <th className="px-6 py-4 font-semibold text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-zinc-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500 dark:text-zinc-400">
                    로딩 중...
                  </td>
                </tr>
              ) : accounts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500 dark:text-zinc-400">
                    등록된 계정이 없습니다.
                  </td>
                </tr>
              ) : (
                accounts.map((acc) => (
                  <tr key={acc.user_id} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                      {acc.account_id}
                      {acc.is_current_user && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                          내 계정
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-600 dark:text-zinc-300">
                      {acc.email}
                    </td>
                    <td className="px-6 py-4">
                      {acc.permission === 0 ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                          <Shield className="w-3 h-3 mr-1" />
                          최고 관리자
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-zinc-800 dark:text-zinc-300 border border-gray-200 dark:border-zinc-700">
                          일반 관리자
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {acc.permission === 1 ? (
                        <span className="text-gray-600 dark:text-zinc-300">
                          {acc.assigned_branch_id 
                            ? branches.find(b => b.branch_id === acc.assigned_branch_id)?.branch_name_ko || '알 수 없음'
                            : '선택안함'}
                        </span>
                      ) : (
                        <span className="text-gray-400 dark:text-zinc-500">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {acc.is_setup_completed ? (
                        <span className="inline-flex items-center text-green-600 dark:text-green-400 text-xs font-medium">
                          <CheckCircle2 className="w-4 h-4 mr-1" /> 완료됨
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-amber-600 dark:text-amber-400 text-xs font-medium">
                          <XCircle className="w-4 h-4 mr-1" /> 미설정
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right relative">
                      {!acc.is_current_user && (
                        <div className="relative inline-block text-left">
                          <button 
                            onClick={() => setActiveDropdown(activeDropdown === acc.user_id ? null : acc.user_id)}
                            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                          
                          {activeDropdown === acc.user_id && (
                            <>
                              <div 
                                className="fixed inset-0 z-10" 
                                onClick={() => setActiveDropdown(null)}
                              />
                              <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white dark:bg-zinc-900 ring-1 ring-black ring-opacity-5 dark:ring-zinc-700 z-20 overflow-hidden">
                                <div className="py-1">
                                  <button
                                    onClick={() => {
                                      setEditingAccount(acc)
                                      setEditPermission(acc.permission.toString())
                                      setActiveDropdown(null)
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 flex items-center"
                                  >
                                    <Shield className="w-4 h-4 mr-2" />
                                    권한 수정
                                  </button>
                                  <button
                                    onClick={() => handleDelete(acc.user_id)}
                                    className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center"
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    계정 삭제
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 권한 수정 모달 */}
      {editingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditingAccount(null)} />
          <div className="relative bg-white dark:bg-zinc-900 rounded-xl shadow-xl w-full max-w-md ring-1 ring-gray-200 dark:ring-zinc-800">
            <div className="p-6 border-b border-gray-100 dark:border-zinc-800">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">권한 수정</h3>
              <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
                <span className="font-semibold text-gray-700 dark:text-zinc-300">{editingAccount.account_id}</span> 계정의 권한을 변경합니다.
              </p>
            </div>
            
            <form onSubmit={handleUpdatePermission} className="p-6">
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
                  새 권한 수준
                </label>
                <select
                  name="permission"
                  value={editPermission}
                  onChange={(e) => setEditPermission(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                >
                  <option value="1">일반 관리자 (대시보드 조회만)</option>
                  <option value="0">최고 관리자 (모든 권한 허용)</option>
                </select>
              </div>

              {editPermission === "1" && (
                <div className="mb-6 animate-in fade-in slide-in-from-top-2">
                  <label className="flex items-center text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2" htmlFor="assignedBranchId">
                    <MapPin className="w-4 h-4 mr-2 text-gray-400" />
                    소속 지점 (선택사항)
                  </label>
                  <select
                    id="assignedBranchId"
                    name="assignedBranchId"
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    defaultValue={editingAccount.assigned_branch_id || ""}
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
              
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setEditingAccount(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {updating ? '저장 중...' : '저장하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
