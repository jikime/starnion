"use client"

import { Bell, Search, Loader2, ArrowRight, BookOpen, StickyNote, FileText, Globe, Wallet, MessageCircle, Brain } from "lucide-react"
import { signOut, useSession } from "next-auth/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
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

// ── Search types & config ─────────────────────────────────────────────────────

interface SearchResult {
  id: number
  source: string
  content: string
  similarity: number
  entry_date?: string
  created_at?: string
}

const SOURCE_CONFIG: Record<string, {
  label: string
  href: string | null
  Icon: React.ComponentType<{ className?: string }>
}> = {
  diary:      { label: "일기",   href: "/diary",      Icon: BookOpen },
  memo:       { label: "메모",   href: "/memo",       Icon: StickyNote },
  document:   { label: "문서",   href: "/documents",  Icon: FileText },
  web_search: { label: "웹검색", href: "/search",     Icon: Globe },
  finance:    { label: "가계부", href: "/finance",    Icon: Wallet },
  daily_log:  { label: "대화",   href: null,          Icon: MessageCircle },
  knowledge:  { label: "지식",   href: null,          Icon: Brain },
}

export function AppHeader() {
  const { data: session } = useSession()
  const router = useRouter()

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const userName = session?.user?.name ?? "사용자"
  const userEmail = session?.user?.email ?? ""
  const initials = userName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase()

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
    const href = SOURCE_CONFIG[result.source]?.href
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
              placeholder="내 데이터 검색..."
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
                const cfg = SOURCE_CONFIG[result.source]
                const Icon = cfg?.Icon ?? Search
                const label = cfg?.label ?? result.source
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
                전체 결과 보기 ({results.length}개)
                <ArrowRight className="size-3" />
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Right-side actions */}
      <div className="ml-auto flex items-center gap-1">
        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="size-5" />
              <Badge
                variant="destructive"
                className="absolute -right-1 -top-1 flex size-4 items-center justify-center p-0 text-[10px]"
              >
                3
              </Badge>
              <span className="sr-only">알림</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>알림</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="flex flex-col items-start gap-1 py-3">
              <span className="font-medium">예산 72% 도달</span>
              <span className="text-xs text-muted-foreground">2시간 전</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="flex flex-col items-start gap-1 py-3">
              <span className="font-medium">주간 리포트 생성됨</span>
              <span className="text-xs text-muted-foreground">4시간 전</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="flex flex-col items-start gap-1 py-3">
              <span className="font-medium">목표 &quot;운동&quot; 7일 달성</span>
              <span className="text-xs text-muted-foreground">어제</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User avatar with session info */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <Avatar className="size-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="sr-only">사용자 메뉴</span>
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
              <Link href="/settings?tab=account">설정</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive cursor-pointer"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              로그아웃
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

      </div>
    </header>
  )
}
