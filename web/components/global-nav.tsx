"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useLocale } from "next-intl"
import { useTheme } from "next-themes"
import NextImage from "next/image"
import { cn } from "@/lib/utils"
import {
  MessageSquare,
  FolderOpen,
  CalendarDays,
  BarChart3,
  TrendingUp,
  Globe,
  Sun,
  Moon,
  Settings,
  UserCircle2,
  Search,
  Wrench,
  ScrollText,
  Activity,
  Bell,
  Cpu,
  UserSquare2,
} from "lucide-react"

const NAV_ITEMS = [
  { href: "/chat",      label: "채팅",       icon: MessageSquare, activeClass: "bg-emerald-600 text-white" },
  { href: "/files",     label: "내 파일",    icon: FolderOpen,    activeClass: "bg-amber-600 text-white" },
  { href: "/planners",  label: "플래너",     icon: CalendarDays,  activeClass: "bg-violet-600 text-white" },
  { href: "/assets",    label: "자산",       icon: BarChart3,     activeClass: "bg-rose-600 text-white" },
  { href: "/analytics", label: "통계/분석",  icon: TrendingUp,    activeClass: "bg-cyan-600 text-white" },
] as const

const SETTINGS_GROUPS = [
  {
    label: "TOOLS",
    items: [
      { icon: Search,     label: "웹검색",    href: "/search" },
      { icon: Wrench,     label: "스킬",      href: "/skills" },
    ],
  },
  {
    label: "MONITORING",
    items: [
      { icon: ScrollText, label: "로그",      href: "/logs" },
      { icon: Activity,   label: "사용량",    href: "/usage" },
    ],
  },
  {
    label: "SETTINGS",
    items: [
      { icon: Settings,    label: "설정",      href: "/settings" },
      { icon: Bell,        label: "알림 센터", href: "/cron" },
      { icon: Cpu,         label: "모델",      href: "/models" },
      { icon: UserSquare2, label: "페르소나",  href: "/personas" },
    ],
  },
]

export function GlobalNav() {
  const pathname = usePathname()
  const router = useRouter()
  const currentLocale = useLocale()
  const { theme, setTheme } = useTheme()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)

  const toggleLocale = () => {
    const next = currentLocale === "ko" ? "en" : currentLocale === "en" ? "ja" : currentLocale === "ja" ? "zh" : "ko"
    document.cookie = `NEXT_LOCALE=${next};path=/;max-age=${365 * 24 * 60 * 60}`
    router.refresh()
  }

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark")

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false)
      }
    }
    if (settingsOpen) document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [settingsOpen])

  return (
    <header className="flex items-center h-11 px-4 border-b border-border bg-header shrink-0 z-10">
      {/* Logo */}
      <div className="flex items-center h-full w-44 shrink-0 py-1">
        <NextImage
          src="/brand_text_logo.png"
          alt="StarNion"
          width={160}
          height={44}
          className="object-contain h-full w-auto"
          priority
        />
      </div>

      {/* Centre nav */}
      <nav className="flex items-center gap-0.5 mx-auto" aria-label="주 메뉴">
        {NAV_ITEMS.map(({ href, label, icon: Icon, activeClass }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/")
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium transition-colors",
                isActive
                  ? `${activeClass} shadow-sm`
                  : "text-header-foreground hover:text-white hover:bg-white/10"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Right controls */}
      <div className="flex items-center gap-1 w-44 justify-end shrink-0">
        <button
          onClick={toggleLocale}
          className="flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium text-header-foreground hover:text-white hover:bg-white/10 transition-colors"
          title="언어 변경 (KO → EN → JA → ZH)"
        >
          <Globe className="w-3.5 h-3.5" />
          {currentLocale.toUpperCase()}
        </button>
        <button
          onClick={toggleTheme}
          className="w-7 h-7 flex items-center justify-center rounded-md text-header-foreground hover:text-white hover:bg-white/10 transition-colors"
          title={theme === "dark" ? "라이트 모드" : "다크 모드"}
        >
          {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>

        {/* Settings button + popover */}
        <div ref={settingsRef} className="relative">
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            className={cn(
              "w-7 h-7 flex items-center justify-center rounded-md transition-colors",
              settingsOpen
                ? "bg-accent text-foreground"
                : "text-header-foreground hover:text-white hover:bg-white/10"
            )}
            title="설정"
            aria-expanded={settingsOpen}
            aria-haspopup="true"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>

          {settingsOpen && (
            <div
              className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-border bg-card shadow-xl z-50 overflow-hidden py-2"
              role="menu"
            >
              {SETTINGS_GROUPS.map((group, gi) => (
                <div key={group.label} className={cn(gi > 0 && "mt-1")}>
                  <p className="px-4 pt-3 pb-1.5 text-xs font-semibold tracking-widest text-muted-foreground">
                    {group.label}
                  </p>
                  {group.items.map(({ icon: Icon, label, href }) =>
                    href ? (
                      <Link
                        key={label}
                        href={href}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-foreground hover:bg-accent/50 transition-colors"
                        role="menuitem"
                        onClick={() => setSettingsOpen(false)}
                      >
                        <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                        {label}
                      </Link>
                    ) : (
                      <button
                        key={label}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-foreground hover:bg-accent/50 transition-colors"
                        role="menuitem"
                        onClick={() => setSettingsOpen(false)}
                      >
                        <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                        {label}
                      </button>
                    )
                  )}
                  {gi < SETTINGS_GROUPS.length - 1 && (
                    <div className="mt-1 border-b border-border" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          className="w-7 h-7 flex items-center justify-center rounded-md text-header-foreground hover:text-white hover:bg-white/10 transition-colors"
          title="프로필"
        >
          <UserCircle2 className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}
