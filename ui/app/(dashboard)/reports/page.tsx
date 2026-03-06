"use client"

import { useState, useEffect, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
  FileText,
  Eye,
  Loader2,
  RefreshCw,
} from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

interface Report {
  id: number
  report_type: string
  title: string
  content?: string
  created_at: string
}

// ── Static config ─────────────────────────────────────────────────────────────

const REPORT_TYPE_IDS = [
  { id: "daily",   icon: Calendar },
  { id: "weekly",  icon: CalendarDays },
  { id: "monthly", icon: BarChart3 },
  { id: "anomaly", icon: AlertTriangle },
]

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const t = useTranslations("reports")
  const tc = useTranslations("common")

  const [reports, setReports]           = useState<Report[]>([])
  const [loading, setLoading]           = useState(true)
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [loadingContent, setLoadingContent] = useState(false)
  const [generatingType, setGeneratingType] = useState<string | null>(null)

  const fetchReports = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/reports")
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
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_type: reportType }),
      })
      const data = await res.json()
      if (res.ok && data.id) {
        await fetchReports()
        setSelectedReport(data)
      }
    } finally {
      setGeneratingType(null)
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchReports} className="gap-2">
          <RefreshCw className="size-4" />
          {tc("refresh")}
        </Button>
      </div>

      {/* Report type cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {REPORT_TYPE_IDS.map((rt) => {
          const isGenerating = generatingType === rt.id
          return (
            <Card key={rt.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <rt.icon className="size-5 text-primary" />
                      <h3 className="font-semibold">{t(`types.${rt.id}`)}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">{t(`types.${rt.id}Sub`)}</p>
                  </div>
                  <Badge className="text-xs">{t("active")}</Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 w-full gap-2"
                  disabled={isGenerating}
                  onClick={() => handleGenerate(rt.id)}
                >
                  {isGenerating && <Loader2 className="size-3.5 animate-spin" />}
                  {isGenerating ? t("generating") : t("generate")}
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* List + Viewer */}
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        {/* List */}
        <Card>
          <CardHeader>
            <CardTitle>{t("recentReports")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : reports.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <FileText className="size-10" />
                <p className="text-sm">{t("noReports")}</p>
                <p className="text-xs">{t("noReportsHint")}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("reportColumn")}</TableHead>
                    <TableHead className="w-24 text-right">{t("viewColumn")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((report) => (
                    <TableRow
                      key={report.id}
                      className={selectedReport?.id === report.id ? "bg-muted/50" : ""}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <FileText className="size-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="font-medium truncate">{report.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant="secondary" className="text-xs px-1.5 py-0">
                                {t(`typeLabels.${report.report_type}`) ?? report.report_type}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{report.created_at}</span>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => handleSelect(report)}
                          disabled={loadingContent && selectedReport?.id === report.id}
                        >
                          {loadingContent && selectedReport?.id === report.id
                            ? <Loader2 className="size-4 animate-spin" />
                            : <Eye className="size-4" />
                          }
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Viewer */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {selectedReport ? selectedReport.title : t("viewer")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingContent ? (
              <div className="flex justify-center py-16">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : selectedReport?.content ? (
              <ScrollArea className="h-[420px] pr-4">
                <article className="prose prose-sm max-w-none dark:prose-invert">
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                    {selectedReport.content}
                  </div>
                </article>
              </ScrollArea>
            ) : (
              <div className="flex flex-col items-center justify-center h-[420px] text-muted-foreground gap-2">
                <FileText className="size-10" />
                <p className="text-sm">{t("viewerEmpty")}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
