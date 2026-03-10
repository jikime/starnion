"use client"

import { Bell, Moon, RefreshCw, Search, Sun, Loader2, ArrowRight, BookOpen, StickyNote, FileText, Globe, Wallet, MessageCircle, Brain, Check, AlertTriangle, TrendingUp, Clock, Activity, Target } from "lucide-react"
import { signOut, useSession } from "next-auth/react"
import { useTheme } from "next-themes"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { useTranslations, useLocale } from "next-intl"
import { setLocale } from "@/app/actions/locale"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const LOCALES = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "English" },
  { code: "zh", label: "中文" },
  { code: "ja", label: "日本語" },
] as const

// ── Search types & config ─────────────────────────────────────────────────────

interface SearchResult {
  id: number
  source: string
  content: string
  similarity: number
  entry_date?: string
  created_at?: string
}

const SOURCE_ICON_MAP: Record<string, {
  href: string | null
  Icon: React.ComponentType<{ className?: string }>
}> = {
  diary:      { href: "/diary",      Icon: BookOpen },
  memo:       { href: "/memo",       Icon: StickyNote },
  document:   { href: "/documents",  Icon: FileText },
  web_search: { href: "/search",     Icon: Globe },
  finance:    { href: "/finance",    Icon: Wallet },
  daily_log:  { href: null,          Icon: MessageCircle },
  knowledge:  { href: null,          Icon: Brain },
}

// ── Notification types ─────────────────────────────────────────────────────

interface Notification {
  id: number
  type: string
  message: string
  read: boolean
  created_at: string
}

const NOTIF_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  budget_warning:    AlertTriangle,
  spending_anomaly:  TrendingUp,
  inactive_reminder: Activity,
  dday:              Clock,
  daily_summary:     FileText,
  monthly_closing:   FileText,
  pattern_insight:   Brain,
  goal_status:       Target,
  weekly:            FileText,
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "방금"
  if (mins < 60) return `${mins}분 전`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  return `${days}일 전`
}

export function AppHeader() {
  const { data: session } = useSession()
  const router = useRouter()
  const t = useTranslations()
  const locale = useLocale()
  const [, startTransition] = useTransition()
  const { resolvedTheme, setTheme } = useTheme()

  const [mounted, setMounted] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // ── Notifications state ────────────────────────────────────────────────
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifOpen, setNotifOpen] = useState(false)

  const userName = session?.user?.name ?? "사용자"
  const userEmail = session?.user?.email ?? ""
  const initials = userName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase()

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=20")
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications ?? [])
        setUnreadCount(data.unread_count ?? 0)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 60_000) // poll every 60s
    return () => clearInterval(interval)
  }, [fetchNotifications])

  const handleMarkAllRead = async () => {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    })
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)
  }

  const handleMarkOneRead = async (id: number) => {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    )
    setUnreadCount((c) => Math.max(0, c - 1))
  }

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); setOpen(false); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/search/hybrid?q=${encodeURIComponent(q)}&limit=7`)
      if (res.ok) {
        const data: SearchResult[] = await res.json()
        setResults(data)
        setOpen(data.length > 0)
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(val), 400)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    router.push(`/search/local?q=${encodeURIComponent(query.trim())}`)
    setOpen(false)
  }

  const handleResultClick = (result: SearchResult) => {
    const href = SOURCE_ICON_MAP[result.source]?.href
    if (href) router.push(href)
    setOpen(false)
    setQuery("")
    setResults([])
  }

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [])

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-4 border-b border-border bg-background px-4 lg:px-6">
      <SidebarTrigger className="-ml-2" />

      {/* Search with dropdown */}
      <div ref={containerRef} className="relative flex-1 max-w-md">
        <form onSubmit={handleSubmit}>
          <div className="relative">
            {loading
              ? <Loader2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground animate-spin" />
              : <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            }
            <Input
              type="search"
              placeholder={t("search.placeholder")}
              value={query}
              onChange={handleChange}
              className="pl-9 bg-muted/50 border-0 focus-visible:ring-1"
            />
          </div>
        </form>

        {/* Dropdown results */}
        {open && (
          <div className="absolute top-full mt-1 w-full z-50 rounded-lg border border-border bg-background shadow-lg overflow-hidden">
            <div className="max-h-72 overflow-y-auto divide-y divide-border/50">
              {results.map((result, i) => {
                const cfg = SOURCE_ICON_MAP[result.source]
                const Icon = cfg?.Icon ?? Search
                const label = t(`sources.${result.source}` as Parameters<typeof t>[0], { defaultValue: result.source })
                const href = cfg?.href ?? null
                const date = result.entry_date ?? result.created_at?.slice(0, 10)
                return (
                  <button
                    key={`${result.source}-${result.id}-${i}`}
                    className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                    onClick={() => handleResultClick(result)}
                  >
                    <Icon className="size-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
                        {date && <span className="text-[10px] text-muted-foreground/60">{date}</span>}
                      </div>
                      <p className="text-xs text-foreground/90 line-clamp-2 leading-relaxed">
                        {result.content}
                      </p>
                    </div>
                    {href && <ArrowRight className="size-3 mt-1 shrink-0 text-muted-foreground/50" />}
                  </button>
                )
              })}
            </div>
            <div className="border-t border-border bg-muted/30 px-3 py-1.5">
              <Link
                href={`/search/local?q=${encodeURIComponent(query)}`}
                className="text-xs text-primary hover:underline flex items-center gap-1"
                onClick={() => setOpen(false)}
              >
                {t("search.viewAll", { count: results.length })}
                <ArrowRight className="size-3" />
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Right-side actions */}
      <div className="ml-auto flex items-center gap-1">
        {/* Refresh */}
        <Button
          variant="ghost"
          size="icon"
          aria-label="새로고침"
          disabled={refreshing}
          onClick={() => {
            setRefreshing(true)
            router.refresh()
            setTimeout(() => {
              window.location.reload()
            }, 100)
          }}
        >
          <RefreshCw className={cn("size-5", refreshing && "animate-spin")} />
        </Button>

        {/* Language switcher — mounted 이후에만 렌더링해 Radix UI ID hydration 불일치 방지 */}
        {mounted && <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5 px-2 text-muted-foreground hover:text-foreground">
              <Globe className="size-4" />
              <span className="text-xs font-medium uppercase">{locale}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            {LOCALES.map(({ code, label }) => (
              <DropdownMenuItem
                key={code}
                className="gap-2 cursor-pointer"
                onClick={() =>
                  startTransition(async () => {
                    await setLocale(code)
                    window.location.reload()
                  })
                }
              >
                {locale === code && <Check className="size-3.5 shrink-0" />}
                <span className={locale === code ? "ml-0" : "ml-[19px]"}>{label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>}

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          aria-label="테마 전환"
          className="relative"
        >
          <Sun className="size-5 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute size-5 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
        </Button>

        {/* Notifications */}
        {mounted && <DropdownMenu open={notifOpen} onOpenChange={(o) => { setNotifOpen(o); if (o) fetchNotifications() }}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="size-5" />
              {unreadCount > 0 && (
                <Badge
                  variant="destructive"
                  className="absolute -right-1 -top-1 flex size-4 items-center justify-center p-0 text-[10px]"
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </Badge>
              )}
              <span className="sr-only">{t("notifications.title")}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <div className="flex items-center justify-between px-2 py-1.5">
              <DropdownMenuLabel className="p-0">{t("notifications.title")}</DropdownMenuLabel>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-primary hover:underline"
                >
                  모두 읽음
                </button>
              )}
            </div>
            <DropdownMenuSeparator />
            {notifications.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                알림이 없어요
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                {notifications.map((n) => {
                  const Icon = NOTIF_ICON_MAP[n.type] ?? Bell
                  const firstLine = n.message.split("\n")[0]
                  return (
                    <DropdownMenuItem
                      key={n.id}
                      className={cn(
                        "flex items-start gap-2.5 py-2.5 px-3 cursor-pointer",
                        !n.read && "bg-muted/40"
                      )}
                      onClick={() => { if (!n.read) handleMarkOneRead(n.id) }}
                    >
                      <Icon className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-snug line-clamp-1">{firstLine}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(n.created_at)}</p>
                      </div>
                      {!n.read && (
                        <span className="size-2 rounded-full bg-primary mt-1.5 shrink-0" />
                      )}
                    </DropdownMenuItem>
                  )
                })}
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>}

        {/* User avatar with session info */}
        {mounted && <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <Avatar className="size-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="sr-only">{t("user.menu")}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium truncate">{userName}</span>
                {userEmail && (
                  <span className="text-xs text-muted-foreground truncate">
                    {userEmail}
                  </span>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings?tab=account">{t("user.settings")}</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive cursor-pointer"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              {t("user.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>}

      </div>
    </header>
  )
}
