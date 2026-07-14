export default function MainPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">대시보드 메인</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="p-6 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-100 dark:border-zinc-800">
          <h3 className="text-lg font-medium mb-2">환영합니다!</h3>
          <p className="text-gray-500 dark:text-zinc-400 text-sm">
            좌측 메뉴에서 원하는 기능을 선택하여 관리할 수 있습니다.
          </p>
        </div>
      </div>
    </div>
  )
}
