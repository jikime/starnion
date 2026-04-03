"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  CalendarDays,
  BarChart3,
  Calendar,
  BookOpen,
  Target,
  Wallet,
  FileBarChart,
  FileText,
  Eye,
  Loader2,
  RefreshCw,
  Trash2,
  Copy,
  Check,
  Clock,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

// ── Types ─────────────────────────────────────────────────────────────────────

interface Report {
  id: number
  report_type: string
  title: string
  content?: string
  created_at: string
}

// ── Static config ─────────────────────────────────────────────────────────────

const REPORT_TYPES = [
  {
    id: "summary",
    icon: BarChart3,
    iconBg:    "bg-blue-100 dark:bg-blue-950/50",
    iconColor: "text-blue-600 dark:text-blue-400",
    badge:     "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
  },
  {
    id: "weekly",
    icon: CalendarDays,
    iconBg:    "bg-violet-100 dark:bg-violet-950/50",
    iconColor: "text-violet-600 dark:text-violet-400",
    badge:     "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800",
  },
  {
    id: "monthly",
    icon: Calendar,
    iconBg:    "bg-emerald-100 dark:bg-emerald-950/50",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    badge:     "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  },
  {
    id: "diary",
    icon: BookOpen,
    iconBg:    "bg-rose-100 dark:bg-rose-950/50",
    iconColor: "text-rose-600 dark:text-rose-400",
    badge:     "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
  },
  {
    id: "goals",
    icon: Target,
    iconBg:    "bg-amber-100 dark:bg-amber-950/50",
    iconColor: "text-amber-600 dark:text-amber-400",
    badge:     "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  },
  {
    id: "finance",
    icon: Wallet,
    iconBg:    "bg-teal-100 dark:bg-teal-950/50",
    iconColor: "text-teal-600 dark:text-teal-400",
    badge:     "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800",
  },
]

const TYPE_CONFIG_MAP = Object.fromEntries(REPORT_TYPES.map((r) => [r.id, r]))

// ── Helpers ───────────────────────────────────────────────────────────────────

// #6: 날짜 포맷
function formatKoreanDate(raw: string, labels: { today: string; yesterday: string; daysAgo: (n: number) => string }): string {
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return labels.today
  if (diffDays === 1) return labels.yesterday
  if (diffDays < 7) return labels.daysAgo(diffDays)
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
}

function formatFullDate(raw: string): string {
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const t  = useTranslations("reports")
  const tc = useTranslations("common")

  const [reports, setReports]               = useState<Report[]>([])
  const [loading, setLoading]               = useState(true)
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [loadingContent, setLoadingContent] = useState(false)
  const [generatingType, setGeneratingType] = useState<string | null>(null)
  const [deletingId, setDeletingId]         = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget]     = useState<Report | null>(null)
  const [copied, setCopied]                 = useState(false)
  // #7: 타입 필터
  const [filterType, setFilterType]         = useState<string>("all")

  // #9: 모바일 뷰어 스크롤
  const viewerRef = useRef<HTMLDivElement>(null)

  // Date label helper
  const dateLabels = {
    today: t("today"),
    yesterday: t("yesterday"),
    daysAgo: (n: number) => t("daysAgo", { n }),
  }

  const fetchReports = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch("/api/reports")
      if (!res.ok) throw new Error("fetch failed")
      const data = await res.json()
      const list = Array.isArray(data) ? data : []
      setReports(list)
      if (list.length > 0 && !selectedReport) {
        setSelectedReport(list[0])
      }
    } catch {
      setReports([])
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchReports() }, [fetchReports])

  async function handleSelect(report: Report) {
    if (report.content) {
      setSelectedReport(report)
    } else {
      setLoadingContent(true)
      try {
        const res = await fetch(`/api/reports/${report.id}`)
        if (!res.ok) throw new Error()
        const data: Report = await res.json()
        setSelectedReport(data)
        setReports((prev) => prev.map((r) => r.id === data.id ? data : r))
      } catch {
        setSelectedReport(report)
      } finally {
        setLoadingContent(false)
      }
    }
    // #9: 모바일에서 뷰어로 자동 스크롤
    setTimeout(() => {
      if (window.innerWidth < 1024) {
        viewerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      }
    }, 100)
  }

  // #1: 삭제 확인 후 실행
  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    const id = deleteTarget.id
    setDeletingId(id)
    setDeleteTarget(null)
    try {
      const res = await fetch(`/api/reports/${id}`, { method: "DELETE" })
      if (res.ok) {
        setReports((prev) => prev.filter((r) => r.id !== id))
        if (selectedReport?.id === id) setSelectedReport(null)
        toast.success(t("deleteSuccess"))
      }
    } finally {
      setDeletingId(null)
    }
  }

  async function handleGenerate(reportType: string) {
    setGeneratingType(reportType)
    try {
      const res  = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_type: reportType }),
      })
      const data = await res.json()
      if (res.ok && data.id) {
        await fetchReports()
        setSelectedReport(data)
        // #3: 생성 완료 토스트
        toast.success(t("generateSuccess", { type: t(`types.${reportType}`) }))
        // #9: 뷰어로 스크롤
        setTimeout(() => {
          if (window.innerWidth < 1024) {
            viewerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
        }, 200)
      } else {
        toast.error(t("generateError"))
      }
    } catch {
      toast.error(t("generateError"))
    } finally {
      setGeneratingType(null)
    }
  }

  // #4: 타입별 마지막 생성일 계산
  const lastGeneratedMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const r of reports) {
      if (!map[r.report_type] || r.created_at > map[r.report_type]) {
        map[r.report_type] = r.created_at
      }
    }
    return map
  }, [reports])

  // #7: 필터 적용
  const filteredReports = useMemo(() => {
    if (filterType === "all") return reports
    return reports.filter((r) => r.report_type === filterType)
  }, [reports, filterType])

  // 타입별 보고서 수
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: reports.length }
    for (const rt of REPORT_TYPES) {
      counts[rt.id] = reports.filter((r) => r.report_type === rt.id).length
    }
    return counts
  }, [reports])

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <FileBarChart className="size-6 text-primary" />
            {t("title")}
          </h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchReports}
          disabled={loading}
          className="gap-2 self-start"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {tc("refresh")}
        </Button>
      </div>

      {/* Report type cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORT_TYPES.map((rt) => {
          const isGenerating = generatingType === rt.id
          // #8: 다른 타입 생성 중이면 전체 비활성
          const isDisabled   = generatingType !== null
          const Icon         = rt.icon
          // #4: 마지막 생성일
          const lastDate     = lastGeneratedMap[rt.id]
          // #5: "active" 배지 → 마지막 생성일 또는 "생성 가능"
          return (
            <div
              key={rt.id}
              className="rounded-xl border border-border bg-card overflow-hidden"
            >
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className={cn("rounded-lg p-2.5", rt.iconBg)}>
                    <Icon className={cn("size-5", rt.iconColor)} />
                  </div>
                  {/* #5: 배지 개선 — 마지막 생성일 */}
                  {lastDate ? (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="size-3" />
                      {formatKoreanDate(lastDate, dateLabels)}
                    </span>
                  ) : (
                    <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", rt.badge)}>
                      {t("canGenerate")}
                    </span>
                  )}
                </div>
                <h3 className="font-semibold text-sm mb-0.5">{t(`types.${rt.id}`)}</h3>
                <p className="text-xs text-muted-foreground mb-4">{t(`types.${rt.id}Sub`)}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  disabled={isDisabled}
                  onClick={() => handleGenerate(rt.id)}
                >
                  {isGenerating
                    ? <Loader2 className="size-3.5 animate-spin" />
                    : <Icon className="size-3.5" />
                  }
                  {isGenerating ? t("generating") : t("generate")}
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      {/* List + Viewer */}
      <div className="grid gap-6 lg:grid-cols-[1fr_460px]">

        {/* Report list */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
            <p className="font-semibold text-sm">{t("recentReports")}</p>
            {reports.length > 0 && (
              <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                {reports.length}
              </span>
            )}
          </div>

          {/* #7: 타입 필터 탭 */}
          {reports.length > 0 && (
            <div className="px-5 py-2.5 border-b border-border/40 flex gap-1.5 flex-wrap">
              <button
                onClick={() => setFilterType("all")}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full border transition-colors",
                  filterType === "all"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary/50"
                )}
              >
                {t("filterAll", { count: typeCounts.all })}
              </button>
              {REPORT_TYPES.filter((rt) => typeCounts[rt.id] > 0).map((rt) => (
                <button
                  key={rt.id}
                  onClick={() => setFilterType(rt.id)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-full border transition-colors",
                    filterType === rt.id
                      ? cn("border-transparent", rt.badge)
                      : "border-border text-muted-foreground hover:border-primary/50"
                  )}
                >
                  {t(`typeLabels.${rt.id}`)} {typeCounts[rt.id]}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="py-2">
              <table className="w-full">
                <tbody>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="py-3 pl-5">
                        <div className="flex items-center gap-3">
                          <Skeleton className="size-7 rounded-lg shrink-0" />
                          <div className="space-y-1">
                            <Skeleton className="h-4 w-40" />
                            <Skeleton className="h-3 w-24" />
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-5 text-right">
                        <Skeleton className="h-7 w-12 rounded ml-auto" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <FileText className="size-10 opacity-30" />
              <p className="text-sm">
                {reports.length === 0 ? t("noReports") : t("noTypeReports")}
              </p>
              <p className="text-xs opacity-70">
                {reports.length === 0 ? t("noReportsHint") : t("noTypeReportsHint")}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">{t("reportColumn")}</TableHead>
                  <TableHead className="w-24 text-right pr-5">{t("viewColumn")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReports.map((report) => {
                  const cfg = TYPE_CONFIG_MAP[report.report_type]
                  const isSelected = selectedReport?.id === report.id
                  return (
                    <TableRow
                      key={report.id}
                      className={cn(
                        "cursor-pointer transition-colors",
                        isSelected && "bg-primary/5 hover:bg-primary/5"
                      )}
                      onClick={() => handleSelect(report)}
                    >
                      <TableCell className="pl-5">
                        <div className="flex items-center gap-3">
                          <div className={cn("rounded-lg p-1.5 shrink-0", cfg?.iconBg ?? "bg-muted")}>
                            <FileText className={cn("size-3.5", cfg?.iconColor ?? "text-muted-foreground")} />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{report.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={cn("text-xs px-1.5 py-0 rounded-full border font-medium", cfg?.badge ?? "bg-muted text-muted-foreground border-border")}>
                                {t(`typeLabels.${report.report_type}`) ?? report.report_type}
                              </span>
                              {/* #6: 날짜 한국어 포맷 */}
                              <span className="text-xs text-muted-foreground">{formatKoreanDate(report.created_at, dateLabels)}</span>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right pr-5">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant={isSelected ? "secondary" : "ghost"}
                            size="icon"
                            className="size-8"
                            onClick={(e) => { e.stopPropagation(); handleSelect(report) }}
                            disabled={loadingContent && selectedReport?.id === report.id}
                          >
                            {loadingContent && selectedReport?.id === report.id
                              ? <Loader2 className="size-4 animate-spin" />
                              : <Eye className="size-4" />
                            }
                          </Button>
                          {/* #1: 삭제 확인 팝업 트리거 */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(report) }}
                            disabled={deletingId === report.id}
                          >
                            {deletingId === report.id
                              ? <Loader2 className="size-4 animate-spin" />
                              : <Trash2 className="size-4" />
                            }
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Report viewer */}
        {/* #9: viewerRef for mobile scroll */}
        <div ref={viewerRef} className="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
          {/* Viewer header */}
          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border/60 min-h-[57px]">
            {selectedReport ? (
              <>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{selectedReport.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {TYPE_CONFIG_MAP[selectedReport.report_type] && (
                      <span className={cn(
                        "text-xs px-1.5 py-0 rounded-full border font-medium",
                        TYPE_CONFIG_MAP[selectedReport.report_type].badge
                      )}>
                        {t(`typeLabels.${selectedReport.report_type}`)}
                      </span>
                    )}
                    {/* #6: 날짜 전체 포맷 */}
                    <span className="text-xs text-muted-foreground">{formatFullDate(selectedReport.created_at)}</span>
                  </div>
                </div>
                {selectedReport.content && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 shrink-0 text-xs"
                    onClick={() => {
                      navigator.clipboard.writeText(selectedReport.content ?? "")
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    }}
                  >
                    {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    {copied ? tc("copied") : tc("copy")}
                  </Button>
                )}
              </>
            ) : (
              <p className="font-semibold text-sm text-muted-foreground">{t("viewer")}</p>
            )}
          </div>

          {/* Viewer body */}
          {/* #10: max-h 유연 높이 (최소 420, 최대 640) */}
          <div className="flex-1">
            {loadingContent ? (
              <div className="px-5 py-4 space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            ) : selectedReport?.content ? (
              // #2: 마크다운 렌더링
              <ScrollArea className="min-h-[420px] max-h-[640px]">
                <div className="px-5 py-4">
                  <article className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-h1:text-lg prose-h2:text-base prose-h3:text-sm prose-p:leading-relaxed prose-li:leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {selectedReport.content}
                    </ReactMarkdown>
                  </article>
                </div>
              </ScrollArea>
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[420px] text-muted-foreground gap-3">
                <FileText className="size-10 opacity-30" />
                <p className="text-sm">{t("viewerEmpty")}</p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* #1: 삭제 확인 AlertDialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">"{deleteTarget?.title}"</span> {t("deleteConfirmDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
