"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  BookOpen,
  StickyNote,
  FileText,
  Search,
  Wallet,
  MessageCircle,
  Brain,
  Globe,
  ArrowRight,
  Loader2,
  RefreshCw,
} from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

interface SearchResult {
  id: number
  source: string
  content: string
  similarity: number
  title?: string
  query?: string
  entry_date?: string
  created_at?: string
  mood?: string
  tag?: string
  category?: string
  amount?: number
}

// ── Source config ─────────────────────────────────────────────────────────────

const SOURCE_CONFIG: Record<string, {
  label: string
  href: string | null
  Icon: React.ComponentType<{ className?: string }>
  badge: string
}> = {
  diary:      { label: "일기",    href: "/diary",      Icon: BookOpen,      badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  memo:       { label: "메모",    href: "/memo",       Icon: StickyNote,    badge: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300" },
  document:   { label: "문서",    href: "/documents",  Icon: FileText,      badge: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  web_search: { label: "웹검색",  href: "/search",     Icon: Globe,         badge: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
  finance:    { label: "가계부",  href: "/finance",    Icon: Wallet,        badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  daily_log:  { label: "대화",    href: null,          Icon: MessageCircle, badge: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300" },
  knowledge:  { label: "지식",    href: null,          Icon: Brain,         badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
}

const DEFAULT_SOURCE = {
  label: "기타", href: null, Icon: Search,
  badge: "bg-muted text-muted-foreground",
}

// ── Result card ───────────────────────────────────────────────────────────────

function ResultCard({ result }: { result: SearchResult }) {
  const router = useRouter()
  const cfg = SOURCE_CONFIG[result.source] ?? DEFAULT_SOURCE
  const { label, href, Icon, badge } = cfg
  const pct = Math.round(result.similarity * 100)

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-4 pb-4 space-y-3">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon className="size-4 text-muted-foreground shrink-0" />
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge}`}>
              {label}
            </span>
            {result.entry_date && (
              <span className="text-xs text-muted-foreground">{result.entry_date}</span>
            )}
            {result.created_at && !result.entry_date && (
              <span className="text-xs text-muted-foreground">
                {result.created_at.slice(0, 10)}
              </span>
            )}
            {result.tag && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{result.tag}</Badge>
            )}
            {result.mood && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{result.mood}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-muted-foreground">{pct}%</span>
            {href && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs gap-1 px-2"
                onClick={() => router.push(href)}
              >
                이동
                <ArrowRight className="size-3" />
              </Button>
            )}
          </div>
        </div>

        <Separator />

        {/* Content */}
        <div className="text-sm text-foreground/90 leading-relaxed">
          {result.source === "web_search" ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {result.content}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="whitespace-pre-wrap">{result.content}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LocalSearchPage() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const initialQ = searchParams.get("q") ?? ""
  const [inputVal, setInputVal] = useState(initialQ)
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [lastQ, setLastQ] = useState("")

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) return
    setLoading(true)
    setSearched(false)
    try {
      const res = await fetch(`/api/search/hybrid?q=${encodeURIComponent(q)}&limit=20`)
      if (res.ok) setResults(await res.json())
    } finally {
      setLoading(false)
      setSearched(true)
      setLastQ(q)
    }
  }, [])

  // Auto-search on mount if q provided
  useEffect(() => {
    if (initialQ) doSearch(initialQ)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const q = inputVal.trim()
    if (!q) return
    router.replace(`/search/local?q=${encodeURIComponent(q)}`)
    doSearch(q)
  }

  // Group results by source for summary
  const sourceCounts = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.source] = (acc[r.source] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">통합 검색</h1>
        <p className="text-muted-foreground text-sm">일기, 메모, 문서 등 내 모든 데이터를 AI로 검색합니다</p>
      </div>

      {/* Search input */}
      <form onSubmit={handleSubmit} className="flex gap-2 max-w-xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="검색어를 입력하세요..."
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            className="pl-9"
            disabled={loading}
          />
        </div>
        <Button type="submit" disabled={loading || !inputVal.trim()} className="gap-2 shrink-0">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          검색
        </Button>
      </form>

      {/* Results */}
      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground py-8">
          <RefreshCw className="size-4 animate-spin" />
          <span className="text-sm">검색 중...</span>
        </div>
      )}

      {searched && !loading && (
        <>
          {/* Summary */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-muted-foreground">
              &quot;{lastQ}&quot; 검색 결과 {results.length}개
            </span>
            {Object.entries(sourceCounts).map(([src, cnt]) => {
              const cfg = SOURCE_CONFIG[src] ?? DEFAULT_SOURCE
              return (
                <span
                  key={src}
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badge}`}
                >
                  {cfg.label} {cnt}
                </span>
              )
            })}
          </div>

          {results.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground gap-3">
              <Search className="size-12 opacity-20" />
              <p className="text-sm">검색 결과가 없어요</p>
              <p className="text-xs">다른 검색어로 시도해보세요</p>
            </div>
          ) : (
            <div className="space-y-3">
              {results.map((r, i) => (
                <ResultCard key={`${r.source}-${r.id}-${i}`} result={r} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!loading && !searched && (
        <div className="flex flex-col items-center py-16 text-muted-foreground gap-3">
          <Search className="size-12 opacity-20" />
          <p className="text-sm">검색어를 입력해 내 데이터를 검색하세요</p>
        </div>
      )}
    </div>
  )
}
