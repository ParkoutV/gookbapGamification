'use client'

import { useState, useEffect } from 'react'
import { Database, Trash2, Download, Upload, FileSpreadsheet } from 'lucide-react'
import { deleteAllGameData, getTemplateUrl, uploadTemplate } from './actions'

import { createArchive, listArchives, deleteArchive, getArchiveUrl } from './archiveActions'
import Link from 'next/link'
import { useCustomDialog } from '@/hooks/useCustomDialog'

export default function GameManagementPage() {
  const { alert, confirm, DialogComponent } = useCustomDialog()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [deleteAllModalOpen, setDeleteAllModalOpen] = useState(false)
  const [deleteAllStep, setDeleteAllStep] = useState<1 | 2>(1)
  const [deleteAllInput, setDeleteAllInput] = useState("")
  const [updating, setUpdating] = useState(false)

  // Filters
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')

  // Archive
  const [archives, setArchives] = useState<any[]>([])
  const [archiveCreating, setArchiveCreating] = useState(false)

  const fetchArchives = async () => {
    const res = await listArchives()
    if (res.data) {
      setArchives(res.data.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()))
    }
  }

  useEffect(() => {
    fetchArchives()
  }, [])

  const handleCreateArchive = async () => {
    let start = null
    let end = null
    if (startDate) start = new Date(startDate).toISOString()
    if (endDate) {
      const e = new Date(endDate)
      e.setHours(23, 59, 59, 999)
      end = e.toISOString()
    }

    setArchiveCreating(true)
    const res = await createArchive(start, end)
    if (res.error) {
      await alert(res.error)
    } else {
      await alert('아카이브가 성공적으로 생성되었습니다.')
      fetchArchives()
    }
    setArchiveCreating(false)
  }

  const handleDeleteArchive = async (fileName: string) => {
    if (!await confirm('정말로 이 아카이브를 삭제하시겠습니까?')) return
    const res = await deleteArchive(fileName.replace('archives/', ''))
    if (res.error) await alert(res.error)
    else fetchArchives()
  }

  const handleExportArchive = (fileName: string) => {
    window.location.href = `/api/export-archive?file=${encodeURIComponent(fileName)}`
  }

  const handleDeleteAllConfirm = async () => {
    if (deleteAllInput !== "데이터 전부 삭제") return
    setUpdating(true)
    const result = await deleteAllGameData()
    if (result.error) {
      await alert(result.error)
    } else {
      await alert('데이터가 성공적으로 삭제되었습니다.')
      setDeleteAllModalOpen(false)
    }
    setUpdating(false)
  }

  const handleDownloadTemplate = async () => {
    setLoading(true)
    const result = await getTemplateUrl()
    if (result.url) {
      window.open(result.url, '_blank')
    } else {
      await alert('등록된 템플릿 파일이 없거나 오류가 발생했습니다.')
    }
    setLoading(false)
  }

  const handleUploadTemplate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return
    const file = e.target.files[0]
    
    setLoading(true)
    const formData = new FormData()
    formData.append('file', file)
    
    const result = await uploadTemplate(formData)
    if (result.error) {
      await alert(result.error)
    } else {
      await alert('템플릿이 성공적으로 업로드 되었습니다.')
    }
    setLoading(false)
    e.target.value = '' // reset
  }

  const handleExportData = () => {
    // Generate URL with params
    const params = new URLSearchParams()
    if (startDate) params.append('startDate', new Date(startDate).toISOString())
    if (endDate) {
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)
      params.append('endDate', end.toISOString())
    }
    window.location.href = `/api/export-excel?${params.toString()}`
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
            <Database className="w-6 h-6 mr-3 text-blue-600" />
            게임 관리
          </h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-2">
            게임 데이터 통계 추출 및 시스템 전체 초기화 등을 관리합니다.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 text-sm font-medium border border-red-100 dark:border-red-900/50">
          {error}
        </div>
      )}

      {/* 엑셀 데이터 추출 섹션 */}
      <div className="bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-gray-200 dark:ring-zinc-800 rounded-xl p-6 mb-8">
        <div className="flex items-center mb-6">
          <FileSpreadsheet className="w-5 h-5 mr-2 text-green-600" />
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">KPI 및 설문 데이터 추출</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
              시작 날짜
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
              종료 날짜
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mt-6">
          <button
            onClick={handleCreateArchive}
            disabled={archiveCreating}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 px-5 rounded-lg transition-colors flex items-center justify-center shadow-sm"
          >
            <Database className="w-5 h-5 mr-2" />
            {archiveCreating ? '아카이브 생성 중...' : '현재 조건으로 데이터 아카이브 (스냅샷)'}
          </button>
        </div>

        {/* 아카이브 목록 표 */}
        <div className="mt-8 pt-6 border-t border-gray-100 dark:border-zinc-800">
          <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-4">과거 데이터 아카이브 목록</h4>
          {archives.length === 0 ? (
            <p className="text-sm text-gray-500">생성된 아카이브가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-zinc-800">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-zinc-800 text-sm">
                <thead className="bg-gray-50 dark:bg-zinc-800/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-zinc-300">생성 일시 / 파일명</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-700 dark:text-zinc-300">관리</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-zinc-900 divide-y divide-gray-200 dark:divide-zinc-800">
                  {archives.map((a) => (
                    <tr key={a.id}>
                      <td className="px-4 py-3 text-gray-900 dark:text-zinc-200">
                        {new Date(a.created_at).toLocaleString('ko-KR')}
                        <br/>
                        <span className="text-xs text-gray-500">{a.name}</span>
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <Link href={`/main/game-management/archive/${encodeURIComponent(a.name)}`}>
                          <button className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors">
                            대시보드 보기
                          </button>
                        </Link>
                        <button
                          onClick={() => handleExportArchive(a.name)}
                          className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded hover:bg-green-100 transition-colors"
                        >
                          엑셀 Export
                        </button>
                        <button
                          onClick={() => handleDeleteArchive(a.name)}
                          className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 transition-colors"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-8 pt-6 border-t border-gray-100 dark:border-zinc-800">
          <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-4">도표 템플릿 관리</h4>
          <p className="text-xs text-gray-500 dark:text-zinc-400 mb-4">
            위 버튼 클릭 시 다운로드되는 엑셀 파일의 기본 레이아웃과 도표(차트) 양식을 수정하려면 아래에서 템플릿을 관리하세요.
          </p>
          <div className="flex gap-4">
            <button
              onClick={handleDownloadTemplate}
              disabled={loading}
              className="bg-white dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 border border-gray-300 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-700 font-medium py-2 px-4 rounded-lg transition-colors flex items-center text-sm disabled:opacity-50"
            >
              <Download className="w-4 h-4 mr-2" />
              현재 템플릿 파일 받기
            </button>
            <label className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40 font-medium py-2 px-4 rounded-lg transition-colors flex items-center text-sm cursor-pointer">
              <Upload className="w-4 h-4 mr-2" />
              새 템플릿 업로드 (.xlsx)
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={handleUploadTemplate}
                disabled={loading}
              />
            </label>
          </div>
        </div>
      </div>

      {/* 위험 구역 (Danger Zone) */}
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
              <h4 className="text-sm font-bold text-blue-600 dark:text-blue-500 mt-4">
                ※ 다음 정보는 삭제되지 않고 보존됩니다.
              </h4>
              <ul className="list-disc text-sm text-gray-600 dark:text-zinc-400 mt-2 pl-5 space-y-1">
                <li>데이터 아카이브 (스냅샷 .json 파일)</li>
                <li>쿠폰 마스터 데이터 (종류, 확률, 설정)</li>
                <li>다른그림찾기 원본 이미지 및 파츠 데이터</li>
                <li>설문조사 질문 리스트 및 항목 템플릿</li>
                <li>대시보드 관리자 계정 및 지점 설정</li>
                <li>닉네임 조합 프리셋 및 할당 대기중인 웹 쿠폰</li>
              </ul>
            </div>
            
            <div className="p-6">
              {deleteAllStep === 1 ? (
                <>
                  <p className="text-sm text-gray-700 dark:text-zinc-300 mb-6 font-medium text-center">
                    정말로 모든 데이터를 삭제하시겠습니까?
                  </p>
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
      <DialogComponent />
    </div>
  )
}
