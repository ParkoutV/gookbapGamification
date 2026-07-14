'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, LayoutDashboard, Image as ImageIcon, LogOut, Users } from 'lucide-react'
import { logoutUser } from '@/app/login/actions'

interface SidebarProps {
  permission: number
  email: string
}

export default function Sidebar({ permission, email }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()

  const links = [
    { href: '/main', label: '대시보드', icon: LayoutDashboard },
  ]

  if (permission === 0) {
    links.push({ href: '/main/spot-difference', label: '다른그림찾기 수정', icon: ImageIcon })
    links.push({ href: '/main/accounts', label: '계정 관리', icon: Users })
  }

  const toggleSidebar = () => setIsOpen(!isOpen)

  return (
    <>
      {/* Mobile Top Bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 flex items-center px-4 z-20">
        <button onClick={toggleSidebar} className="p-2 -ml-2 text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg">
          <Menu className="w-6 h-6" />
        </button>
        <span className="ml-4 font-bold text-lg dark:text-white">Admin Dashboard</span>
      </div>

      {/* Backdrop */}
      {isOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 bottom-0 left-0 z-40 w-64 bg-zinc-50 dark:bg-zinc-950 border-r border-gray-200 dark:border-zinc-800
        transition-transform duration-300 ease-in-out flex flex-col
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-200 dark:border-zinc-800">
          <span className="font-bold text-xl dark:text-white">Dashboard</span>
          <button onClick={toggleSidebar} className="md:hidden p-1 text-gray-500 hover:bg-gray-200 dark:hover:bg-zinc-800 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 flex-1 overflow-y-auto">
          <div className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider mb-4 px-2">
            기능 메뉴
          </div>
          <nav className="space-y-1">
            {links.map((link) => {
              const Icon = link.icon
              const isActive = pathname === link.href
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className={`
                    flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors
                    ${isActive 
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' 
                      : 'text-gray-700 hover:bg-gray-200 dark:text-zinc-300 dark:hover:bg-zinc-800'}
                  `}
                >
                  <Icon className="w-5 h-5 mr-3" />
                  {link.label}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-zinc-800">
          <div className="px-2 mb-4">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{email}</p>
            <p className="text-xs text-gray-500 dark:text-zinc-400">{permission === 0 ? '최고 관리자' : '일반 관리자'}</p>
          </div>
          <form action={logoutUser}>
            <button
              type="submit"
              className="w-full flex items-center px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 transition-colors"
            >
              <LogOut className="w-5 h-5 mr-3" />
              로그아웃
            </button>
          </form>
        </div>
      </aside>
    </>
  )
}
