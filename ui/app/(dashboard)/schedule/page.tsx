"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Edit, Trash2, Clock, Calendar, Cake } from "lucide-react"

const schedules = [
  {
    id: "a1b2c3",
    title: "주간 리포트",
    type: "반복",
    nextRun: "매주 일요일 21:00",
    status: "active",
  },
  {
    id: "d4e5f6",
    title: "식비 절약 알림",
    type: "반복",
    nextRun: "매일 12:00",
    status: "active",
  },
  {
    id: "g7h8i9",
    title: "3/15 약속 알림",
    type: "1회",
    nextRun: "2026-03-15 09:00",
    status: "pending",
  },
]

const reminders = [
  {
    id: 1,
    title: "오전 9시 미팅",
    date: "2026-03-04",
    status: "active",
  },
  {
    id: 2,
    title: "병원 예약",
    date: "2026-03-10",
    status: "active",
  },
]

const ddays = [
  {
    id: 1,
    title: "생일",
    icon: "🎂",
    date: "2026-03-18",
    daysRemaining: 15,
  },
  {
    id: 2,
    title: "여름 휴가",
    icon: "🏖️",
    date: "2026-06-13",
    daysRemaining: 102,
  },
  {
    id: 3,
    title: "자격증 시험",
    icon: "📝",
    date: "2026-04-02",
    daysRemaining: 30,
  },
]

export default function SchedulePage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">일정 & 알림</h1>
          <p className="text-muted-foreground">
            스케줄, 리마인더, 디데이 통합 관리
          </p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="size-4" />
              추가
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>새 일정 추가</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="scheduleType">유형</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="유형 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="schedule">예약 스케줄</SelectItem>
                    <SelectItem value="reminder">리마인더</SelectItem>
                    <SelectItem value="dday">디데이</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="title">제목</Label>
                <Input id="title" placeholder="일정 제목" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="datetime">날짜/시간</Label>
                <Input id="datetime" type="datetime-local" />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline">취소</Button>
                <Button>저장</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="schedules" className="space-y-6">
        <TabsList>
          <TabsTrigger value="schedules">예약 스케줄</TabsTrigger>
          <TabsTrigger value="reminders">리마인더</TabsTrigger>
          <TabsTrigger value="dday">디데이</TabsTrigger>
        </TabsList>

        <TabsContent value="schedules">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="size-5" />
                예약 스케줄
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>제목</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead>다음 실행</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead className="text-right">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedules.map((schedule) => (
                    <TableRow key={schedule.id}>
                      <TableCell className="font-mono text-xs">
                        {schedule.id}
                      </TableCell>
                      <TableCell className="font-medium">
                        {schedule.title}
                      </TableCell>
                      <TableCell>{schedule.type}</TableCell>
                      <TableCell>{schedule.nextRun}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            schedule.status === "active"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {schedule.status === "active" ? "활성" : "대기"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="sm">
                            <Edit className="size-4" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reminders">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Clock className="size-5" />
                리마인더
              </CardTitle>
              <Button size="sm" className="gap-2">
                <Plus className="size-4" />
                알림 추가
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {reminders.map((reminder) => (
                <div
                  key={reminder.id}
                  className="flex items-center justify-between rounded-lg border border-border p-4"
                >
                  <div className="flex items-center gap-3">
                    <Clock className="size-5 text-primary" />
                    <div>
                      <p className="font-medium">{reminder.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {reminder.date}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="default">활성</Badge>
                    <Button variant="ghost" size="sm">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dday">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cake className="size-5" />
                디데이
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {ddays.map((dday) => (
                <div
                  key={dday.id}
                  className="flex items-center justify-between rounded-lg border border-border p-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{dday.icon}</span>
                    <div>
                      <p className="font-medium">{dday.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {dday.date}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-primary">
                      D-{dday.daysRemaining}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
