"use client"

import { useState } from "react"
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
  Download,
  Eye,
  Plus,
} from "lucide-react"

const reportTypes = [
  {
    id: "daily",
    title: "일간 요약",
    description: "매일 저녁 8시",
    icon: Calendar,
    active: true,
  },
  {
    id: "weekly",
    title: "주간 리포트",
    description: "매주 일요일",
    icon: CalendarDays,
    active: true,
  },
  {
    id: "monthly",
    title: "월간 마감",
    description: "매월 말일",
    icon: BarChart3,
    active: true,
  },
  {
    id: "anomaly",
    title: "소비 이상",
    description: "실시간",
    icon: AlertTriangle,
    active: true,
  },
]

const recentReports = [
  {
    id: 1,
    title: "2026-03-02 주간 리포트",
    date: "2026-03-02",
    type: "weekly",
    hasPdf: true,
  },
  {
    id: 2,
    title: "2026-03-01 일간 요약",
    date: "2026-03-01",
    type: "daily",
    hasPdf: true,
  },
  {
    id: 3,
    title: "2026-02-28 월간 마감 리포트",
    date: "2026-02-28",
    type: "monthly",
    hasPdf: true,
  },
  {
    id: 4,
    title: "2026-02-25 패턴 인사이트",
    date: "2026-02-25",
    type: "pattern",
    hasPdf: false,
  },
  {
    id: 5,
    title: "2026-02-22 목표 달성 현황",
    date: "2026-02-22",
    type: "goal",
    hasPdf: false,
  },
]

const sampleReportContent = `
## 2026년 3월 1주차 지출 리포트

**총 지출**: ₩234,500
**전주 대비**: +12%
**예산 대비**: 46.9%

### 카테고리별 지출
- 식비: ₩105,525 (45%)
- 교통: ₩42,210 (18%)
- 쇼핑: ₩51,590 (22%)
- 기타: ₩35,175 (15%)

### AI 인사이트
- 금요일 외식 지출이 평균보다 2.3배 높습니다
- 커피 지출이 전주 대비 25% 증가했습니다
- 교통비가 평소보다 낮아 절약이 잘 되고 있습니다
`

export default function ReportsPage() {
  const [selectedReport, setSelectedReport] = useState(recentReports[0])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">리포트 센터</h1>
          <p className="text-muted-foreground">
            자동 생성 리포트 및 인사이트
          </p>
        </div>
        <Button className="gap-2">
          <Plus className="size-4" />
          리포트 요청
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {reportTypes.map((report) => (
          <Card key={report.id}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <report.icon className="size-5 text-primary" />
                    <h3 className="font-semibold">{report.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {report.description}
                  </p>
                </div>
                <Badge
                  variant={report.active ? "default" : "secondary"}
                  className="text-xs"
                >
                  {report.active ? "활성" : "비활성"}
                </Badge>
              </div>
              <Button variant="outline" size="sm" className="mt-4 w-full">
                바로 생성
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <Card>
          <CardHeader>
            <CardTitle>최근 리포트</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>리포트</TableHead>
                  <TableHead className="text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentReports.map((report) => (
                  <TableRow
                    key={report.id}
                    className={
                      selectedReport.id === report.id ? "bg-muted/50" : ""
                    }
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <FileText className="size-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{report.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {report.date}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedReport(report)}
                        >
                          <Eye className="size-4" />
                          <span className="sr-only">보기</span>
                        </Button>
                        {report.hasPdf && (
                          <Button variant="ghost" size="sm">
                            <Download className="size-4" />
                            <span className="sr-only">PDF 다운로드</span>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">리포트 뷰어</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4">
              <article className="prose prose-sm max-w-none dark:prose-invert">
                <div className="whitespace-pre-wrap text-sm">
                  {sampleReportContent}
                </div>
              </article>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
