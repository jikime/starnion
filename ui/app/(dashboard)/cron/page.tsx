"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Loader2, Plus, Trash2, Pencil } from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

interface SystemJob {
  id: string
  name: string
  description: string
  schedule: string
  level: string
  enabled: boolean
}

interface ScheduleTime {
  hour: number
  minute: number
  day_of_week?: string
  date?: string
}

interface UserSchedule {
  id: string
  kb_row_id: number
  title: string
  type: string
  report_type: string
  schedule: ScheduleTime
  status: string
  message: string
  last_sent: string
  created_at: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const LEVEL_LABELS: Record<string, string> = {
  rule:        "Rule-Based",
  pattern:     "Pattern",
  autonomous:  "Autonomous",
  runner:      "Runner",
  maintenance: "Maintenance",
}

const LEVEL_COLORS: Record<string, string> = {
  rule:        "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  pattern:     "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  autonomous:  "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  runner:      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  maintenance: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
}

const REPORT_TYPES = [
  { value: "custom_reminder", label: "커스텀 메시지" },
  { value: "daily",           label: "일간 요약" },
  { value: "weekly",          label: "주간 리포트" },
  { value: "monthly",         label: "월간 리포트" },
]

const DOW_OPTIONS = [
  { value: "monday",    label: "월요일" },
  { value: "tuesday",   label: "화요일" },
  { value: "wednesday", label: "수요일" },
  { value: "thursday",  label: "목요일" },
  { value: "friday",    label: "금요일" },
  { value: "saturday",  label: "토요일" },
  { value: "sunday",    label: "일요일" },
]

function cronHuman(expr: string): string {
  const m: Record<string, string> = {
    "0 9 * * 1":      "매주 월 09:00",
    "0 * * * *":      "매시간",
    "0 21 * * *":     "매일 21:00",
    "0 20 * * *":     "매일 20:00",
    "0 21 28-31 * *": "월말 21:00",
    "0 6 * * *":      "매일 06:00",
    "0 */3 * * *":    "3시간마다",
    "0 14 * * *":     "매일 14:00",
    "*/10 * * * *":   "10분마다",
    "0 7 * * *":      "매일 07:00",
    "0 8 * * *":      "매일 08:00",
    "0 12 * * 3":     "매주 수 12:00",
    "*/15 * * * *":   "15분마다",
    "0 5 * * 1":      "매주 월 05:00",
  }
  return m[expr] ?? expr
}

function scheduleDisplay(s: ScheduleTime, type: string): string {
  const time = `${String(s.hour).padStart(2, "0")}:${String(s.minute).padStart(2, "0")}`
  if (type === "one_time") return s.date ? `${s.date} ${time}` : time
  if (s.day_of_week) {
    const dow = DOW_OPTIONS.find((d) => d.value === s.day_of_week)?.label ?? s.day_of_week
    return `매주 ${dow} ${time}`
  }
  return `매일 ${time}`
}

function statusBadge(status: string) {
  if (status === "active")    return <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 border-0">활성</Badge>
  if (status === "paused")    return <Badge variant="secondary">일시정지</Badge>
  if (status === "completed") return <Badge variant="outline">완료</Badge>
  return <Badge variant="outline">{status}</Badge>
}

const emptyCronForm = () => ({
  title: "", type: "recurring", report_type: "custom_reminder",
  message: "", hour: 9, minute: 0, day_of_week: "", date: "",
})

// ── Main Component ─────────────────────────────────────────────────────────────

export default function CronPage() {
  const [systemJobs, setSystemJobs]         = useState<SystemJob[]>([])
  const [schedules, setSchedules]           = useState<UserSchedule[]>([])
  const [loadingSystem, setLoadingSystem]   = useState(true)
  const [loadingUser, setLoadingUser]       = useState(true)
  const [cronDialogOpen, setCronDialogOpen] = useState(false)
  const [cronEditTarget, setCronEditTarget] = useState<UserSchedule | null>(null)
  const [cronSaving, setCronSaving]         = useState(false)
  const [togglingId, setTogglingId]         = useState<string | null>(null)
  const [cronDeletingId, setCronDeletingId] = useState<string | null>(null)
  const [cronForm, setCronForm]             = useState(emptyCronForm())

  // ── Fetch: system jobs ───────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/cron/system")
      .then((r) => r.json())
      .then((d) => setSystemJobs(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoadingSystem(false))
  }, [])

  // ── Fetch: user schedules ───────────────────────────────────────────────────
  const fetchSchedules = useCallback(() => {
    setLoadingUser(true)
    fetch("/api/cron/schedules")
      .then((r) => r.json())
      .then((d) => setSchedules(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoadingUser(false))
  }, [])

  useEffect(() => { fetchSchedules() }, [fetchSchedules])

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const openCronCreate = () => {
    setCronEditTarget(null)
    setCronForm(emptyCronForm())
    setCronDialogOpen(true)
  }

  const openCronEdit = (s: UserSchedule) => {
    setCronEditTarget(s)
    setCronForm({
      title: s.title, type: s.type, report_type: s.report_type,
      message: s.message, hour: s.schedule.hour, minute: s.schedule.minute,
      day_of_week: s.schedule.day_of_week ?? "", date: s.schedule.date ?? "",
    })
    setCronDialogOpen(true)
  }

  const handleCronSave = async () => {
    if (!cronForm.title.trim()) return
    setCronSaving(true)
    try {
      const body = {
        title: cronForm.title, type: cronForm.type, report_type: cronForm.report_type,
        message: cronForm.message,
        schedule: {
          hour: cronForm.hour, minute: cronForm.minute,
          day_of_week: cronForm.type === "recurring" ? (cronForm.day_of_week || undefined) : undefined,
          date: cronForm.type === "one_time" ? (cronForm.date || undefined) : undefined,
        },
      }
      if (cronEditTarget) {
        await fetch(`/api/cron/schedules/${cronEditTarget.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        })
      } else {
        await fetch("/api/cron/schedules", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        })
      }
      setCronDialogOpen(false)
      fetchSchedules()
    } finally {
      setCronSaving(false)
    }
  }

  const handleToggle = async (id: string) => {
    setTogglingId(id)
    try {
      const res = await fetch(`/api/cron/schedules/${id}/toggle`, { method: "POST" })
      if (res.ok) {
        const { status } = await res.json()
        setSchedules((prev) => prev.map((s) => s.id === id ? { ...s, status } : s))
      }
    } finally {
      setTogglingId(null)
    }
  }

  const handleCronDelete = async (id: string) => {
    if (!confirm("이 일정을 삭제하시겠습니까?")) return
    setCronDeletingId(id)
    try {
      await fetch(`/api/cron/schedules/${id}`, { method: "DELETE" })
      setSchedules((prev) => prev.filter((s) => s.id !== id))
    } finally {
      setCronDeletingId(null)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">알림 센터</h1>
        <p className="text-muted-foreground">시스템 자동화 스케줄과 내 알림 일정을 관리합니다</p>
      </div>

      <Tabs defaultValue="system" className="space-y-6">
        <TabsList>
          <TabsTrigger value="system">시스템 Cron</TabsTrigger>
          <TabsTrigger value="user">내 일정</TabsTrigger>
        </TabsList>

        {/* ── System Jobs ──────────────────────────────────────────────────── */}
        <TabsContent value="system">
          <Card>
            <CardHeader><CardTitle>시스템 Cron Jobs</CardTitle></CardHeader>
            <CardContent>
              {loadingSystem ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-2">
                  {systemJobs.map((job) => (
                    <div key={job.id} className="flex items-center gap-4 rounded-lg border border-border p-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{job.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${LEVEL_COLORS[job.level] ?? LEVEL_COLORS.maintenance}`}>
                            {LEVEL_LABELS[job.level] ?? job.level}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{job.description}</p>
                      </div>
                      <code className="text-xs bg-muted px-2 py-1 rounded shrink-0 hidden sm:block">{job.schedule}</code>
                      <span className="text-xs text-muted-foreground shrink-0 hidden md:block">{cronHuman(job.schedule)}</span>
                      <Badge variant={job.enabled ? "default" : "secondary"} className="shrink-0">
                        {job.enabled ? "활성" : "비활성"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── User Schedules ───────────────────────────────────────────────── */}
        <TabsContent value="user">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>내 일정</CardTitle>
              <Button size="sm" onClick={openCronCreate} className="gap-1">
                <Plus className="size-4" />일정 추가
              </Button>
            </CardHeader>
            <CardContent>
              {loadingUser ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              ) : schedules.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  등록된 일정이 없습니다. 일정 추가를 눌러 생성하세요.
                </div>
              ) : (
                <div className="space-y-2">
                  {schedules.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{s.title}</span>
                          {statusBadge(s.status)}
                        </div>
                        <div className="flex gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                          <span>{scheduleDisplay(s.schedule, s.type)}</span>
                          {s.report_type === "custom_reminder" && s.message && (
                            <span className="truncate max-w-xs">{s.message}</span>
                          )}
                          {s.last_sent && <span>마지막 전송: {s.last_sent}</span>}
                        </div>
                      </div>
                      {s.status !== "completed" && (
                        togglingId === s.id ? (
                          <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
                        ) : (
                          <Switch checked={s.status === "active"} onCheckedChange={() => handleToggle(s.id)} />
                        )
                      )}
                      <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => openCronEdit(s)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="size-8 shrink-0 text-destructive hover:text-destructive"
                        onClick={() => handleCronDelete(s.id)}
                        disabled={cronDeletingId === s.id}
                      >
                        {cronDeletingId === s.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Cron Dialog ──────────────────────────────────────────────────────── */}
      <Dialog open={cronDialogOpen} onOpenChange={setCronDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{cronEditTarget ? "일정 수정" : "일정 추가"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>제목</Label>
              <Input placeholder="일정 이름" value={cronForm.title} onChange={(e) => setCronForm({ ...cronForm, title: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>유형</Label>
              <Select value={cronForm.type} onValueChange={(v) => setCronForm({ ...cronForm, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="recurring">반복</SelectItem>
                  <SelectItem value="one_time">1회</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>알림 유형</Label>
              <Select value={cronForm.report_type} onValueChange={(v) => setCronForm({ ...cronForm, report_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REPORT_TYPES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {cronForm.report_type === "custom_reminder" && (
              <div className="space-y-1.5">
                <Label>메시지</Label>
                <Input placeholder="전송할 메시지" value={cronForm.message} onChange={(e) => setCronForm({ ...cronForm, message: e.target.value })} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>시간</Label>
              <div className="flex gap-2 items-center">
                <Input type="number" min={0} max={23} value={cronForm.hour} onChange={(e) => setCronForm({ ...cronForm, hour: Number(e.target.value) })} className="w-20" placeholder="시" />
                <span className="text-muted-foreground">:</span>
                <Input type="number" min={0} max={59} value={cronForm.minute} onChange={(e) => setCronForm({ ...cronForm, minute: Number(e.target.value) })} className="w-20" placeholder="분" />
              </div>
            </div>
            {cronForm.type === "recurring" && (
              <div className="space-y-1.5">
                <Label>요일 (비워두면 매일)</Label>
                <Select value={cronForm.day_of_week} onValueChange={(v) => setCronForm({ ...cronForm, day_of_week: v === "daily" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="매일" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">매일</SelectItem>
                    {DOW_OPTIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {cronForm.type === "one_time" && (
              <div className="space-y-1.5">
                <Label>날짜</Label>
                <Input type="date" value={cronForm.date} onChange={(e) => setCronForm({ ...cronForm, date: e.target.value })} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCronDialogOpen(false)}>취소</Button>
            <Button onClick={handleCronSave} disabled={cronSaving || !cronForm.title.trim()}>
              {cronSaving && <Loader2 className="size-4 animate-spin mr-2" />}
              {cronEditTarget ? "수정" : "추가"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
