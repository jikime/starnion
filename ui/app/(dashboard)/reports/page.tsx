"use client"

import { useState, useEffect, useCallback } from "react"
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

const REPORT_TYPES = [
  { id: "daily",   title: "일간 요약",   description: "매일 저녁 9시", icon: Calendar },
  { id: "weekly",  title: "주간 리포트", description: "매주 월요일",   icon: CalendarDays },
  { id: "monthly", title: "월간 마감",   description: "매월 말일",     icon: BarChart3 },
  { id: "anomaly", title: "소비 이상",   description: "실시간 감지",   icon: AlertTriangle },
]

const TYPE_LABEL: Record<string, string> = {
  daily:   "일간",
  weekly:  "주간",
  monthly: "월간",
  anomaly: "소비이상",
  pattern: "패턴",
  goal:    "목표",
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ReportsPage() {
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
          <h1 className="text-2xl font-semibold">리포트 센터</h1>
          <p className="text-muted-foreground">자동 생성 리포트 및 인사이트</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchReports} className="gap-2">
          <RefreshCw className="size-4" />
          새로고침
        </Button>
      </div>

      {/* Report type cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {REPORT_TYPES.map((rt) => {
          const isGenerating = generatingType === rt.id
          return (
            <Card key={rt.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <rt.icon className="size-5 text-primary" />
                      <h3 className="font-semibold">{rt.title}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">{rt.description}</p>
                  </div>
                  <Badge className="text-xs">활성</Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 w-full gap-2"
                  disabled={isGenerating}
                  onClick={() => handleGenerate(rt.id)}
                >
                  {isGenerating && <Loader2 className="size-3.5 animate-spin" />}
                  {isGenerating ? "생성 중..." : "바로 생성"}
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
            <CardTitle>최근 리포트</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : reports.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <FileText className="size-10" />
                <p className="text-sm">생성된 리포트가 없습니다.</p>
                <p className="text-xs">위의 &apos;바로 생성&apos; 버튼을 눌러 첫 리포트를 만들어보세요.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>리포트</TableHead>
                    <TableHead className="w-24 text-right">보기</TableHead>
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
                                {TYPE_LABEL[report.report_type] ?? report.report_type}
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
              {selectedReport ? selectedReport.title : "리포트 뷰어"}
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
                <p className="text-sm">리포트를 선택하면 내용이 표시됩니다.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
