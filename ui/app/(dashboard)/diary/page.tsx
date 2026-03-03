"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Plus, BookOpen, Brain, Wallet } from "lucide-react"

const diaryEntries = [
  {
    id: 1,
    date: new Date(2026, 2, 3),
    title: "오늘",
    content: "오늘 팀 미팅이 있었다. 점심은 김치찌개를 먹었고, 오후에는 코드 리뷰를 진행했다...",
    emotion: "보통",
    keywords: ["점심", "회의"],
    analysis: {
      sentiment: "중립 → 긍정적",
      keywords: ["업무", "음식", "루틴"],
      insight: "업무 집중도 높은 날",
    },
    relatedExpenses: [
      { description: "점심 식비", amount: 12000 },
      { description: "커피", amount: 5500 },
    ],
  },
  {
    id: 2,
    date: new Date(2026, 2, 2),
    title: "어제",
    content: "날씨가 좋아서 퇴근 후 산책을 했다. 마트에서 장을 봤다...",
    emotion: "좋음",
    keywords: ["산책", "쇼핑"],
    analysis: {
      sentiment: "긍정적",
      keywords: ["여가", "건강", "쇼핑"],
      insight: "휴식이 잘 된 날",
    },
    relatedExpenses: [
      { description: "마트", amount: 35000 },
    ],
  },
  {
    id: 3,
    date: new Date(2026, 2, 1),
    title: "3월 1일",
    content: "새 달의 시작. 이번 달 목표를 정리했다...",
    emotion: "좋음",
    keywords: ["목표", "계획"],
    analysis: {
      sentiment: "긍정적",
      keywords: ["동기부여", "계획"],
      insight: "의욕적인 시작",
    },
    relatedExpenses: [],
  },
]

export default function DiaryPage() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    new Date(2026, 2, 3)
  )
  const [selectedEntry, setSelectedEntry] = useState(diaryEntries[0])

  const datesWithEntries = diaryEntries.map((e) => e.date)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">일기</h1>
          <p className="text-muted-foreground">매일의 기록과 AI 분석</p>
        </div>
        <Button className="gap-2">
          <Plus className="size-4" />
          새 일기
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardContent className="p-3">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                modifiers={{
                  hasEntry: datesWithEntries,
                }}
                modifiersStyles={{
                  hasEntry: {
                    fontWeight: "bold",
                    textDecoration: "underline",
                    textDecorationColor: "oklch(0.44 0.18 285)",
                  },
                }}
                className="rounded-md"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">목록</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[200px]">
                {diaryEntries.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => setSelectedEntry(entry)}
                    className={`w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors ${
                      selectedEntry.id === entry.id ? "bg-muted/50" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <BookOpen className="size-4 text-primary" />
                      <span className="text-sm font-medium">{entry.title}</span>
                    </div>
                  </button>
                ))}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {selectedEntry.date.toLocaleDateString("ko-KR", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}{" "}
                일기
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">감정: {selectedEntry.emotion}</Badge>
                {selectedEntry.keywords.map((kw) => (
                  <Badge key={kw} variant="outline">
                    {kw}
                  </Badge>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <p>{selectedEntry.content}</p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Brain className="size-5 text-primary" />
                <h4 className="font-semibold">AI 분석</h4>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground mb-1">감정</p>
                  <p className="text-sm font-medium">
                    {selectedEntry.analysis.sentiment}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground mb-1">핵심 키워드</p>
                  <p className="text-sm font-medium">
                    {selectedEntry.analysis.keywords.join(", ")}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground mb-1">인사이트</p>
                  <p className="text-sm font-medium">
                    {selectedEntry.analysis.insight}
                  </p>
                </div>
              </div>
            </div>

            {selectedEntry.relatedExpenses.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Wallet className="size-5 text-primary" />
                  <h4 className="font-semibold">관련 지출</h4>
                </div>
                <div className="space-y-2">
                  {selectedEntry.relatedExpenses.map((expense, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-lg border border-border p-3"
                    >
                      <span className="text-sm">{expense.description}</span>
                      <span className="text-sm font-medium">
                        {new Intl.NumberFormat("ko-KR", {
                          style: "currency",
                          currency: "KRW",
                        }).format(expense.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
