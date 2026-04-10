"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useTheme } from "next-themes"
import { signOut } from "next-auth/react"
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
  Menu,
  X,
  LogOut,
} from "lucide-react"

const NAV_ITEMS = [
  { href: "/chat",      tKey: "chat",      icon: MessageSquare, activeClass: "bg-emerald-600 text-white" },
  { href: "/files",     tKey: "files",     icon: FolderOpen,    activeClass: "bg-amber-600 text-white" },
  { href: "/planners",  tKey: "planners",  icon: CalendarDays,  activeClass: "bg-violet-600 text-white" },
  { href: "/assets",    tKey: "assets",    icon: BarChart3,     activeClass: "bg-rose-600 text-white" },
  { href: "/analytics", tKey: "analytics", icon: TrendingUp,    activeClass: "bg-cyan-600 text-white" },
] as const

const SETTINGS_GROUPS = [
  {
    label: "TOOLS",
    items: [
      { icon: Search,     tKey: "webSearch",     href: "/search" },
      { icon: Wrench,     tKey: "skills",        href: "/skills" },
    ],
  },
  {
    label: "MONITORING",
    items: [
      { icon: ScrollText, tKey: "logs",          href: "/logs" },
      { icon: Activity,   tKey: "usage",         href: "/usage" },
    ],
  },
  {
    label: "SETTINGS",
    items: [
      { icon: Settings,    tKey: "settings",      href: "/settings" },
      { icon: Bell,        tKey: "notifications", href: "/cron" },
      { icon: Cpu,         tKey: "models",        href: "/models" },
      { icon: UserSquare2, tKey: "personas",      href: "/personas" },
    ],
  },
]

export function GlobalNav() {
  const pathname = usePathname()
  const currentLocale = useLocale()
  const t = useTranslations("globalNav")
  const { theme, setTheme } = useTheme()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)
  const langRef = useRef<HTMLDivElement>(null)

  const LOCALES = [
    { code: "ko", label: "한국어" },
    { code: "en", label: "English" },
    { code: "ja", label: "日本語" },
    { code: "zh", label: "中文" },
  ]

  const changeLocale = useCallback(async (next: string) => {
    setLangOpen(false)
    if (next === currentLocale) return
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=${365 * 24 * 60 * 60}; SameSite=Lax`
    await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: next }),
    }).catch(() => {})
    window.location.href = window.location.pathname + window.location.search
  }, [currentLocale])

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark")

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setSettingsOpen(false)
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false)
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false)
    }
    if (settingsOpen || profileOpen || langOpen) document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [settingsOpen, profileOpen, langOpen])

  // Close mobile menu on route change
  useEffect(() => { setMobileMenuOpen(false) }, [pathname])

  return (
    <>
      <header className="sticky top-0 flex items-center h-11 px-2 sm:px-4 border-b border-border bg-header shrink-0 z-20">
        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileMenuOpen(v => !v)}
          className="sm:hidden w-8 h-8 flex items-center justify-center rounded-md text-header-foreground hover:text-white hover:bg-white/10 transition-colors mr-1"
        >
          {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>

        {/* Logo — hidden on mobile */}
        <Link href="/chat" className="hidden sm:flex items-center h-full shrink-0 py-1 sm:w-44">
          <NextImage
            src="/brand_text_logo.png"
            alt="StarNion"
            width={160}
            height={44}
            className="object-contain h-full w-auto"
            priority
          />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-0.5 mx-auto">
          {NAV_ITEMS.map(({ href, tKey, icon: Icon, activeClass }) => {
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
                {t(tKey)}
              </Link>
            )
          })}
        </nav>

        {/* Mobile center — logo */}
        <div className="flex sm:hidden items-center justify-center flex-1">
          <Link href="/chat">
            <NextImage
              src="/brand_text_logo.png"
              alt="StarNion"
              width={120}
              height={34}
              className="object-contain h-7 w-auto"
              priority
            />
          </Link>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-0.5 sm:gap-1 sm:w-44 justify-end shrink-0">
          {/* Language dropdown */}
          <div ref={langRef} className="relative hidden sm:block">
            <button
              onClick={() => setLangOpen(v => !v)}
              className={cn(
                "flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium transition-colors",
                langOpen
                  ? "bg-accent text-foreground"
                  : "text-header-foreground hover:text-white hover:bg-white/10"
              )}
              title={t("changeLanguage")}
              aria-expanded={langOpen}
              aria-haspopup="true"
            >
              <Globe className="w-3.5 h-3.5" />
              {currentLocale.toUpperCase()}
            </button>
            {langOpen && (
              <div className="absolute right-0 top-full mt-2 w-32 rounded-xl border border-border bg-card shadow-xl z-50 overflow-hidden py-1" role="menu">
                {LOCALES.map(({ code, label }) => (
                  <button
                    key={code}
                    role="menuitem"
                    onClick={() => changeLocale(code)}
                    className={cn(
                      "w-full flex items-center justify-between px-4 py-2 text-sm transition-colors",
                      code === currentLocale
                        ? "text-foreground font-medium bg-accent/50"
                        : "text-foreground hover:bg-accent/50"
                    )}
                  >
                    <span>{label}</span>
                    {code === currentLocale && <span className="size-1.5 rounded-full bg-emerald-400 shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={toggleTheme}
            className="w-7 h-7 flex items-center justify-center rounded-md text-header-foreground hover:text-white hover:bg-white/10 transition-colors"
            title={theme === "dark" ? t("lightMode") : t("darkMode")}
          >
            {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>

          {/* Settings */}
          <div ref={settingsRef} className="relative">
            <button
              onClick={() => setSettingsOpen((v) => !v)}
              className={cn(
                "w-7 h-7 flex items-center justify-center rounded-md transition-colors",
                settingsOpen
                  ? "bg-accent text-foreground"
                  : "text-header-foreground hover:text-white hover:bg-white/10"
              )}
              title={t("settings")}
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
                    {group.items.map(({ icon: Icon, tKey, href }) => (
                      <Link
                        key={tKey}
                        href={href}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-foreground hover:bg-accent/50 transition-colors"
                        role="menuitem"
                        onClick={() => setSettingsOpen(false)}
                      >
                        <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                        {t(tKey)}
                      </Link>
                    ))}
                    {gi < SETTINGS_GROUPS.length - 1 && (
                      <div className="mt-1 border-b border-border" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Profile */}
          <div ref={profileRef} className="relative hidden sm:block">
            <button
              onClick={() => setProfileOpen(v => !v)}
              className={cn(
                "w-7 h-7 flex items-center justify-center rounded-md transition-colors",
                profileOpen
                  ? "bg-accent text-foreground"
                  : "text-header-foreground hover:text-white hover:bg-white/10"
              )}
              title={t("profile")}
              aria-expanded={profileOpen}
              aria-haspopup="true"
            >
              <UserCircle2 className="w-4 h-4" />
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-full mt-2 w-40 rounded-xl border border-border bg-card shadow-xl z-50 overflow-hidden py-1" role="menu">
                <Link
                  href="/profile"
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-accent/50 transition-colors"
                  role="menuitem"
                  onClick={() => setProfileOpen(false)}
                >
                  <UserCircle2 className="w-4 h-4 text-muted-foreground shrink-0" />
                  {t("profile")}
                </Link>
                <div className="border-t border-border" />
                <button
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-accent/50 transition-colors"
                  role="menuitem"
                  onClick={() => { setProfileOpen(false); signOut({ callbackUrl: "/login" }) }}
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  {t("logout")}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile slide-down menu */}
      {mobileMenuOpen && (
        <div className="sm:hidden border-b border-border bg-header z-10">
          <div className="px-3 py-2 space-y-1">
            {NAV_ITEMS.map(({ href, tKey, icon: Icon, activeClass }) => {
              const isActive = pathname === href || pathname.startsWith(href + "/")
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isActive ? `${activeClass}` : "text-header-foreground hover:bg-white/10"
                  )}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Icon className="w-4 h-4" />
                  {t(tKey)}
                </Link>
              )
            })}
            <div className="border-t border-white/10 my-2" />
            {/* Mobile language selector */}
            <div className="px-3 pb-1">
              <div className="flex items-center gap-1 mb-1.5">
                <Globe className="w-3.5 h-3.5 text-header-foreground/60" />
                <span className="text-xs text-header-foreground/60 font-medium uppercase tracking-wider">Language</span>
              </div>
              <div className="flex gap-1 flex-wrap">
                {LOCALES.map(({ code, label }) => (
                  <button
                    key={code}
                    onClick={() => { setMobileMenuOpen(false); changeLocale(code) }}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                      code === currentLocale
                        ? "bg-white/20 text-white"
                        : "text-header-foreground hover:bg-white/10 hover:text-white"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-1">
              <Link href="/profile" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-1.5 text-xs text-header-foreground hover:text-white">
                <UserCircle2 className="w-3.5 h-3.5" />{t("profile")}
              </Link>
              <button onClick={() => { setMobileMenuOpen(false); signOut({ callbackUrl: "/login" }) }} className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 ml-auto">
                <LogOut className="w-3.5 h-3.5" />{t("logout")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
