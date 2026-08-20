/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getAccountsList, deleteAccount, updatePermission, getBranches, deleteAllGameData } from './actions'
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
  
  // 전체 삭제 모달 상태
  const [deleteAllModalOpen, setDeleteAllModalOpen] = useState(false)
  const [deleteAllStep, setDeleteAllStep] = useState<1 | 2>(1)
  const [deleteAllInput, setDeleteAllInput] = useState("")

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

  const handleDeleteAllConfirm = async () => {
    if (deleteAllInput !== "데이터 전부 삭제") return
    setUpdating(true)
    const result = await deleteAllGameData()
    if (result.error) {
      alert(result.error)
    } else {
      alert('데이터가 성공적으로 삭제되었습니다.')
      setDeleteAllModalOpen(false)
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

      {/* 위험 구역 (Danger Zone) */}
      {accounts.find(a => a.is_current_user)?.permission === 0 && (
        <div className="mt-8 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-red-700 dark:text-red-500 flex items-center">
                <Trash2 className="w-5 h-5 mr-2" />
                위험 구역 (Danger Zone)
              </h3>
              <p className="text-sm text-red-600/80 dark:text-red-400/80 mt-1">
                게임과 관련된 모든 참여자 데이터 및 로그를 영구적으로 삭제합니다. 이 작업은 되돌릴 수 없습니다.
              </p>
            </div>
            <button
              onClick={() => {
                setDeleteAllModalOpen(true)
                setDeleteAllStep(1)
                setDeleteAllInput("")
              }}
              className="bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 px-5 rounded-lg transition-colors flex items-center shrink-0 shadow-sm"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              게임 데이터 전체 삭제
            </button>
          </div>
        </div>
      )}

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

      {/* 데이터 전체 삭제 모달 */}
      {deleteAllModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteAllModalOpen(false)} />
          <div className="relative bg-white dark:bg-zinc-900 rounded-xl shadow-xl w-full max-w-md ring-1 ring-gray-200 dark:ring-zinc-800">
            <div className="p-6 border-b border-gray-100 dark:border-zinc-800">
              <h3 className="text-lg font-bold text-red-600 dark:text-red-500 flex items-center">
                <Trash2 className="w-5 h-5 mr-2" />
                게임 데이터 전체 삭제
              </h3>
              <p className="text-sm text-gray-500 dark:text-zinc-400 mt-2">
                다음 데이터가 완전히 삭제되며, <strong>절대 되돌릴 수 없습니다.</strong>
              </p>
              <ul className="list-disc text-sm text-gray-600 dark:text-zinc-400 mt-3 pl-5 space-y-1">
                <li>모든 게임 점수 기록</li>
                <li><strong>오프라인 매장용 발급 쿠폰 전체 내역</strong></li>
                <li>가챠(룰렛) 참여 및 보상 획득 이력</li>
                <li>모든 설문조사(필수/선택) 응답 결과</li>
                <li>참여자 접속 세션 및 방문 기록</li>
                <li>참여자 익명 식별 정보</li>
                <li>접속 링크(트랙) 유입 및 행동 로그</li>
                <li>유저에게 이미 배정된 웹 이벤트 쿠폰 사용 내역</li>
              </ul>
            </div>
            
            <div className="p-6">
              {deleteAllStep === 1 ? (
                <>
                  <p className="text-sm text-gray-700 dark:text-zinc-300 mb-6 font-medium text-center">
                    정말로 모든 데이터를 삭제하시겠습니까?
                  </p>
                  {/* 취소/확인 버튼 뒤바뀜 */}
                  <div className="flex gap-3 justify-center flex-row-reverse">
                    <button
                      onClick={() => setDeleteAllModalOpen(false)}
                      className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors flex-1"
                    >
                      취소
                    </button>
                    <button
                      onClick={() => setDeleteAllStep(2)}
                      className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors flex-1"
                    >
                      확인
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-700 dark:text-zinc-300 mb-4 font-medium">
                    아래 입력창에 <strong>"데이터 전부 삭제"</strong> 라고 입력해 주세요.
                  </p>
                  <input
                    type="text"
                    value={deleteAllInput}
                    onChange={(e) => setDeleteAllInput(e.target.value)}
                    placeholder="데이터 전부 삭제"
                    className="w-full px-4 py-2.5 mb-6 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition-all"
                  />
                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => setDeleteAllModalOpen(false)}
                      className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                      취소
                    </button>
                    <button
                      onClick={handleDeleteAllConfirm}
                      disabled={deleteAllInput !== "데이터 전부 삭제" || updating}
                      className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                    >
                      {updating ? '삭제 중...' : '완전히 삭제하기'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
