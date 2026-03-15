"use client"

import { useState, useEffect, useCallback } from "react"
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
  Calendar,
  CalendarDays,
  BarChart3,
  AlertTriangle,
  FileBarChart,
  FileText,
  Eye,
  Loader2,
  RefreshCw,
} from "lucide-react"
import { cn } from "@/lib/utils"

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
    id: "daily",
    icon: Calendar,

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
    icon: BarChart3,
    iconBg:    "bg-emerald-100 dark:bg-emerald-950/50",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    badge:     "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  },
  {
    id: "anomaly",
    icon: AlertTriangle,
    iconBg:    "bg-amber-100 dark:bg-amber-950/50",
    iconColor: "text-amber-600 dark:text-amber-400",
    badge:     "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  },
]

const TYPE_CONFIG_MAP = Object.fromEntries(REPORT_TYPES.map((r) => [r.id, r]))

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const t  = useTranslations("reports")
  const tc = useTranslations("common")

  const [reports, setReports]               = useState<Report[]>([])
  const [loading, setLoading]               = useState(true)
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [loadingContent, setLoadingContent] = useState(false)
  const [generatingType, setGeneratingType] = useState<string | null>(null)
  const [generateError, setGenerateError]   = useState<string | null>(null)

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
      return
    }
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

  async function handleGenerate(reportType: string) {
    setGeneratingType(reportType)
    setGenerateError(null)
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
      } else {
        setGenerateError(t("generateError"))
      }
    } catch {
      setGenerateError(t("generateError"))
    } finally {
      setGeneratingType(null)
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <FileBarChart className="size-6 text-primary" />
            {t("title")}
          </h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchReports} className="gap-2">
          <RefreshCw className="size-4" />
          {tc("refresh")}
        </Button>
      </div>

      {/* Report type cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {REPORT_TYPES.map((rt) => {
          const isGenerating = generatingType === rt.id
          const Icon = rt.icon
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
                  <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", rt.badge)}>
                    {t("active")}
                  </span>
                </div>
                <h3 className="font-semibold text-sm mb-0.5">{t(`types.${rt.id}`)}</h3>
                <p className="text-xs text-muted-foreground mb-4">{t(`types.${rt.id}Sub`)}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  disabled={isGenerating}
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

      {generateError && (
        <div className="rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0" />
          {generateError}
        </div>
      )}

      {/* List + Viewer */}
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">

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

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3 border-0">
              <FileText className="size-10 opacity-30" />
              <p className="text-sm">{t("noReports")}</p>
              <p className="text-xs opacity-70">{t("noReportsHint")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">{t("reportColumn")}</TableHead>
                  <TableHead className="w-16 text-right pr-5">{t("viewColumn")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report) => {
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
                              <span className="text-xs text-muted-foreground">{report.created_at}</span>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right pr-5">
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
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Report viewer */}
        <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
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
                    <span className="text-xs text-muted-foreground">{selectedReport.created_at}</span>
                  </div>
                </div>
              </>
            ) : (
              <p className="font-semibold text-sm text-muted-foreground">{t("viewer")}</p>
            )}
          </div>

          {/* Viewer body */}
          <div className="flex-1">
            {loadingContent ? (
              <div className="flex justify-center py-16">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : selectedReport?.content ? (
              <ScrollArea className="h-[420px]">
                <div className="px-5 py-4">
                  <article className="prose prose-sm max-w-none dark:prose-invert">
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                      {selectedReport.content}
                    </div>
                  </article>
                </div>
              </ScrollArea>
            ) : (
              <div className="flex flex-col items-center justify-center h-[420px] text-muted-foreground gap-3">
                <FileText className="size-10 opacity-30" />
                <p className="text-sm">{t("viewerEmpty")}</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
