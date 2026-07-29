'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, LayoutDashboard, Image as ImageIcon, LogOut, Users, Settings, MapPin, Globe, ClipboardList, Gift, BarChart3 } from 'lucide-react'
import { logoutUser } from '@/app/login/actions'

interface SidebarProps {
  permission: number
  email: string
}

export default function Sidebar({ permission, email }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(true)
  const pathname = usePathname()

  const links = [
    { href: '/main', label: '대시보드', icon: LayoutDashboard },
    { href: '/main/surveys', label: '설문 관리', icon: ClipboardList },
    { href: '/main/survey-results', label: '설문 통계', icon: BarChart3 },
  ]

  if (permission === 0) {
    links.push({ href: '/main/tracks', label: '지점 관리', icon: MapPin })
    links.push({ href: '/main/languages', label: '언어 관리', icon: Globe })
    links.push({ href: '/main/spot-difference', label: '다른그림찾기 수정', icon: ImageIcon })
    links.push({ href: '/main/nicknames', label: '닉네임 관리', icon: ClipboardList }) // Using an existing icon or can use another like Users/Type
    links.push({ href: '/main/coupons', label: '쿠폰 관리', icon: Gift })
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
      <aside 
        data-collapsed={!isExpanded ? 'true' : 'false'}
        className={`
          peer
          fixed top-0 bottom-0 left-0 z-40 bg-zinc-50 dark:bg-zinc-950 border-r border-gray-200 dark:border-zinc-800
          transition-all duration-300 ease-in-out flex flex-col
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          ${!isExpanded ? 'w-64 md:w-20' : 'w-64'}
        `}
      >
        <div className={`h-16 flex items-center border-b border-gray-200 dark:border-zinc-800 transition-all duration-300 ${!isExpanded ? 'px-6 justify-between md:px-4 md:justify-center' : 'px-6 justify-between'}`}>
          <div className="flex items-center overflow-hidden">
            <button onClick={() => setIsExpanded(!isExpanded)} className={`hidden md:flex p-2 text-gray-500 hover:bg-gray-200 dark:hover:bg-zinc-800 rounded flex-shrink-0 ${isExpanded ? 'mr-2 -ml-2' : ''}`}>
              <Menu className="w-5 h-5" />
            </button>
            <span className={`font-bold text-xl dark:text-white whitespace-nowrap ${!isExpanded ? 'md:hidden' : ''}`}>
              Dashboard
            </span>
          </div>
          <button onClick={toggleSidebar} className="md:hidden p-1 text-gray-500 hover:bg-gray-200 dark:hover:bg-zinc-800 rounded flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 flex-1 overflow-y-auto overflow-x-hidden">
          <div className={`text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider mb-4 px-2 whitespace-nowrap ${!isExpanded ? 'md:hidden' : ''}`}>
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
                    flex items-center py-2 rounded-lg text-sm font-medium transition-colors
                    ${!isExpanded ? 'px-3 md:px-0 md:justify-center' : 'px-3'}
                    ${isActive 
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' 
                      : 'text-gray-700 hover:bg-gray-200 dark:text-zinc-300 dark:hover:bg-zinc-800'}
                  `}
                  title={!isExpanded ? link.label : undefined}
                >
                  <Icon className={`w-5 h-5 flex-shrink-0 ${!isExpanded ? 'mr-3 md:mr-0' : 'mr-3'}`} />
                  <span className={`${!isExpanded ? 'md:hidden' : ''} whitespace-nowrap`}>
                    {link.label}
                  </span>
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-zinc-800">
          <Link 
            href="/main/profile" 
            className={`flex items-center py-2 rounded-lg text-sm font-medium transition-colors mb-2 text-gray-700 hover:bg-gray-200 dark:text-zinc-300 dark:hover:bg-zinc-800 ${!isExpanded ? 'px-3 md:px-0 md:justify-center' : 'px-3'}`}
            title={!isExpanded ? '프로필 설정' : undefined}
          >
            <Settings className={`w-5 h-5 flex-shrink-0 ${!isExpanded ? 'md:mr-0 mr-3' : 'mr-3'}`} />
            <div className={`overflow-hidden ${!isExpanded ? 'md:hidden' : ''}`}>
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{email}</p>
              <p className="text-xs text-gray-500 dark:text-zinc-400 whitespace-nowrap">{permission === 0 ? '최고 관리자' : '일반 관리자'}</p>
            </div>
          </Link>
          <form action={logoutUser}>
            <button
              type="submit"
              className={`w-full flex items-center py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 transition-colors
                ${!isExpanded ? 'px-3 md:px-0 md:justify-center' : 'px-3'}
              `}
              title={!isExpanded ? '로그아웃' : undefined}
            >
              <LogOut className={`w-5 h-5 flex-shrink-0 ${!isExpanded ? 'mr-3 md:mr-0' : 'mr-3'}`} />
              <span className={`${!isExpanded ? 'md:hidden' : ''} whitespace-nowrap`}>
                로그아웃
              </span>
            </button>
          </form>
        </div>
      </aside>
    </>
  )
}
