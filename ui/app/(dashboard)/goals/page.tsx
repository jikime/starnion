"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Edit, Check, Flame, Calendar } from "lucide-react"
import { cn } from "@/lib/utils"

const goals = {
  inProgress: [
    {
      id: 1,
      title: "여행 자금 모으기",
      icon: "🏖️",
      current: 800000,
      target: 1000000,
      unit: "원",
      progress: 80,
      startDate: "2026-01-01",
      endDate: "2026-06-30",
      daysRemaining: 119,
      weeklyProgress: [40, 55, 65, 75, 80],
    },
    {
      id: 2,
      title: "운동 30일 챌린지",
      icon: "💪",
      current: 12,
      target: 30,
      unit: "일",
      progress: 40,
      startDate: "2026-02-20",
      endDate: "2026-03-21",
      daysRemaining: 18,
      streak: 5,
      calendar: [1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 0, 1, 1, 1],
    },
    {
      id: 3,
      title: "독서 월 4권",
      icon: "📚",
      current: 1,
      target: 4,
      unit: "권",
      progress: 25,
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      daysRemaining: 28,
    },
  ],
  completed: [
    {
      id: 4,
      title: "물 2L 마시기 습관",
      icon: "💧",
      progress: 100,
      completedDate: "2026-02-28",
    },
    {
      id: 5,
      title: "1월 저축 목표",
      icon: "💰",
      progress: 100,
      completedDate: "2026-01-31",
    },
  ],
  abandoned: [
    {
      id: 6,
      title: "매일 영어 공부",
      icon: "📖",
      progress: 15,
      abandonedDate: "2026-02-15",
    },
  ],
}

export default function GoalsPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">목표 관리</h1>
          <p className="text-muted-foreground">목표를 설정하고 진행 상황을 추적하세요</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="size-4" />
              목표 추가
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>새 목표 추가</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">목표 제목</Label>
                <Input id="title" placeholder="여행 자금 모으기" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="target">목표</Label>
                  <Input id="target" type="number" placeholder="1000000" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unit">단위</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="원">원</SelectItem>
                      <SelectItem value="일">일</SelectItem>
                      <SelectItem value="권">권</SelectItem>
                      <SelectItem value="회">회</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">시작일</Label>
                  <Input id="startDate" type="date" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">종료일</Label>
                  <Input id="endDate" type="date" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">설명 (선택)</Label>
                <Textarea id="description" placeholder="목표에 대한 설명..." />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline">취소</Button>
                <Button>저장</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="inProgress" className="space-y-6">
        <TabsList>
          <TabsTrigger value="inProgress">
            진행중 ({goals.inProgress.length})
          </TabsTrigger>
          <TabsTrigger value="completed">
            완료 ({goals.completed.length})
          </TabsTrigger>
          <TabsTrigger value="abandoned">
            포기 ({goals.abandoned.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inProgress" className="space-y-4">
          {goals.inProgress.map((goal) => (
            <Card key={goal.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{goal.icon}</span>
                    <div>
                      <h3 className="font-semibold">{goal.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {goal.startDate} ~ {goal.endDate} | 남은 기간: {goal.daysRemaining}일
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="gap-1">
                      <Edit className="size-3" />
                      편집
                    </Button>
                    <Button size="sm" className="gap-1">
                      <Check className="size-3" />
                      달성
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span>진행률</span>
                    <span className="font-medium">{goal.progress}%</span>
                  </div>
                  <Progress value={goal.progress} className="h-3" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      {goal.unit === "원"
                        ? new Intl.NumberFormat("ko-KR", {
                            style: "currency",
                            currency: "KRW",
                          }).format(goal.current)
                        : `${goal.current}${goal.unit}`}
                    </span>
                    <span>
                      {goal.unit === "원"
                        ? new Intl.NumberFormat("ko-KR", {
                            style: "currency",
                            currency: "KRW",
                          }).format(goal.target)
                        : `${goal.target}${goal.unit}`}
                    </span>
                  </div>
                </div>

                {goal.streak && (
                  <div className="flex items-center gap-2 mb-4">
                    <Flame className="size-4 text-destructive" />
                    <span className="text-sm font-medium">
                      연속 {goal.streak}일 달성!
                    </span>
                  </div>
                )}

                {goal.calendar && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">달력 뷰</p>
                    <div className="flex flex-wrap gap-1">
                      {goal.calendar.map((day, idx) => (
                        <div
                          key={idx}
                          className={cn(
                            "size-6 rounded flex items-center justify-center text-xs",
                            day === 1
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                          )}
                        >
                          {day === 1 ? "✓" : ""}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {goal.weeklyProgress && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">주간 진행 추이</p>
                    <div className="flex items-end gap-1 h-16">
                      {goal.weeklyProgress.map((week, idx) => (
                        <div
                          key={idx}
                          className="flex-1 bg-primary rounded-t"
                          style={{ height: `${week}%` }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          {goals.completed.map((goal) => (
            <Card key={goal.id}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{goal.icon}</span>
                    <div>
                      <h3 className="font-semibold">{goal.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        완료일: {goal.completedDate}
                      </p>
                    </div>
                  </div>
                  <Badge className="bg-success text-success-foreground">
                    완료
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="abandoned" className="space-y-4">
          {goals.abandoned.map((goal) => (
            <Card key={goal.id}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl opacity-50">{goal.icon}</span>
                    <div>
                      <h3 className="font-semibold text-muted-foreground">
                        {goal.title}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        포기일: {goal.abandonedDate} | 달성률: {goal.progress}%
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">
                    다시 시작
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  )
}
