"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Download, Brain, TrendingUp, Calendar, Clock } from "lucide-react"
import { SpendingTrendChart } from "@/components/statistics/spending-trend-chart"
import { CategoryPieChart } from "@/components/statistics/category-pie-chart"
import { WeekdayChart } from "@/components/statistics/weekday-chart"
import { HeatmapChart } from "@/components/statistics/heatmap-chart"

const insights = [
  "매주 금요일 외식 지출이 평균 2.3배 높아요",
  "이번달 커피 지출이 전월 대비 40% 증가했어요",
  "월초 구독료 ₩47,000이 자동 결제되고 있어요",
  "식비 예산 초과 패턴이 3개월 연속 발생하고 있어요",
]

export default function StatisticsPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">통계 & 패턴 분석</h1>
          <p className="text-muted-foreground">
            AI 기반 지출 패턴 인사이트
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select defaultValue="3months">
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1month">최근 1개월</SelectItem>
              <SelectItem value="3months">최근 3개월</SelectItem>
              <SelectItem value="6months">최근 6개월</SelectItem>
              <SelectItem value="1year">최근 1년</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2">
            <Download className="size-4" />
            CSV 내보내기
          </Button>
        </div>
      </div>

      <Tabs defaultValue="spending" className="space-y-6">
        <TabsList>
          <TabsTrigger value="spending" className="gap-2">
            <TrendingUp className="size-4" />
            지출 분석
          </TabsTrigger>
          <TabsTrigger value="pattern" className="gap-2">
            <Brain className="size-4" />
            패턴 인사이트
          </TabsTrigger>
          <TabsTrigger value="goals" className="gap-2">
            <Calendar className="size-4" />
            목표 달성률
          </TabsTrigger>
          <TabsTrigger value="conversation" className="gap-2">
            <Clock className="size-4" />
            대화 분석
          </TabsTrigger>
        </TabsList>

        <TabsContent value="spending" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <SpendingTrendChart />
            <CategoryPieChart />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="size-5" />
                AI 패턴 인사이트
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {insights.map((insight, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-3 rounded-lg border border-border p-3"
                  >
                    <div className="mt-0.5 size-2 rounded-full bg-primary" />
                    <span className="text-sm">{insight}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <HeatmapChart />
            <WeekdayChart />
          </div>
        </TabsContent>

        <TabsContent value="pattern" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>패턴 분석 결과</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="rounded-lg border border-border p-4">
                  <h4 className="font-medium mb-2">주간 지출 패턴</h4>
                  <p className="text-sm text-muted-foreground">
                    주중에는 평균 ₩15,000을 지출하고, 주말에는 평균 ₩45,000을 지출합니다.
                    특히 금요일 저녁 외식 지출이 두드러집니다.
                  </p>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <h4 className="font-medium mb-2">카테고리 트렌드</h4>
                  <p className="text-sm text-muted-foreground">
                    식비가 전체 지출의 45%를 차지하며, 이 중 커피/음료가 20%를 차지합니다.
                    교통비는 꾸준히 절약되고 있습니다.
                  </p>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <h4 className="font-medium mb-2">절약 기회</h4>
                  <p className="text-sm text-muted-foreground">
                    구독 서비스 중 2개월 이상 미사용된 서비스가 2개 있습니다.
                    해지 시 월 ₩25,000 절약 가능합니다.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="goals" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>목표 달성률 분석</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="rounded-lg border border-border p-4">
                  <h4 className="font-medium mb-2">이번 달 목표 현황</h4>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="text-center">
                      <p className="text-3xl font-bold text-primary">3</p>
                      <p className="text-sm text-muted-foreground">진행중</p>
                    </div>
                    <div className="text-center">
                      <p className="text-3xl font-bold text-success">7</p>
                      <p className="text-sm text-muted-foreground">완료</p>
                    </div>
                    <div className="text-center">
                      <p className="text-3xl font-bold text-muted-foreground">1</p>
                      <p className="text-sm text-muted-foreground">포기</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conversation" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>대화 분석</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="rounded-lg border border-border p-4">
                  <h4 className="font-medium mb-2">이번 주 대화 통계</h4>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="text-center">
                      <p className="text-3xl font-bold text-primary">42</p>
                      <p className="text-sm text-muted-foreground">총 메시지</p>
                    </div>
                    <div className="text-center">
                      <p className="text-3xl font-bold text-primary">15</p>
                      <p className="text-sm text-muted-foreground">도구 호출</p>
                    </div>
                    <div className="text-center">
                      <p className="text-3xl font-bold text-primary">8</p>
                      <p className="text-sm text-muted-foreground">리포트 생성</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <h4 className="font-medium mb-2">자주 사용하는 기능</h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>1. 가계부 기록 (45%)</li>
                    <li>2. 일정 조회 (25%)</li>
                    <li>3. 리포트 요청 (15%)</li>
                    <li>4. 목표 체크 (10%)</li>
                    <li>5. 기타 (5%)</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
