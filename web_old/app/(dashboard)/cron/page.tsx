"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Bell,
  Loader2,
  Plus,
  Trash2,
  Pencil,
  Server,
  CalendarClock,
  HelpCircle,
  BanIcon,
} from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

interface SystemJob {
  id: string
  name: string
  description: string
  schedule: string
  level: string
  enabled: boolean
  can_disable: boolean
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

// #5 레벨 설명 (Tooltip용)
const LEVEL_DESCRIPTIONS: Record<string, string> = {
  rule:        "사전 정의된 규칙에 따라 고정 주기로 실행됩니다.",
  pattern:     "데이터 패턴을 분석해 주기적으로 실행됩니다.",
  autonomous:  "AI가 상황에 따라 자율적으로 판단해 실행됩니다.",
  runner:      "작업을 순차적으로 처리하는 실행 담당 잡입니다.",
  maintenance: "시스템 유지 관리를 위한 백그라운드 잡입니다.",
}

// #3 시간 선택 옵션 생성
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: String(i).padStart(2, "0") + "시",
}))
const MINUTE_OPTIONS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => ({
  value: String(m),
  label: String(m).padStart(2, "0") + "분",
}))

const emptyCronForm = () => ({
  title: "", type: "recurring", report_type: "custom_reminder",
  message: "", hour: 9, minute: 0, day_of_week: "", date: "",
})

// ── Main Component ─────────────────────────────────────────────────────────────

export default function CronPage() {
  const t = useTranslations("cron")

  const REPORT_TYPES = useMemo(() => [
    { value: "custom_reminder", label: t("reportTypes.custom_reminder") },
    { value: "daily",           label: t("reportTypes.daily") },
    { value: "weekly",          label: t("reportTypes.weekly") },
    { value: "monthly",         label: t("reportTypes.monthly") },
  ], [t])

  const DOW_OPTIONS = useMemo(() => [
    { value: "monday",    label: t("dow.monday") },
    { value: "tuesday",   label: t("dow.tuesday") },
    { value: "wednesday", label: t("dow.wednesday") },
    { value: "thursday",  label: t("dow.thursday") },
    { value: "friday",    label: t("dow.friday") },
    { value: "saturday",  label: t("dow.saturday") },
    { value: "sunday",    label: t("dow.sunday") },
  ], [t])

  const cronHuman = useCallback((expr: string): string => {
    const m: Record<string, string> = {
      "0 9 * * 1":      t("cronHuman.weeklyMon09"),
      "0 * * * *":      t("cronHuman.hourly"),
      "0 21 * * *":     t("cronHuman.daily21"),
      "0 20 * * *":     t("cronHuman.daily20"),
      "0 21 28-31 * *": t("cronHuman.monthEnd21"),
      "0 6 * * *":      t("cronHuman.daily06"),
      "0 */3 * * *":    t("cronHuman.every3h"),
      "0 14 * * *":     t("cronHuman.daily14"),
      "*/10 * * * *":   t("cronHuman.every10m"),
      "0 7 * * *":      t("cronHuman.daily07"),
      "0 8 * * *":      t("cronHuman.daily08"),
      "0 12 * * 3":     t("cronHuman.weeklyWed12"),
      "*/15 * * * *":   t("cronHuman.every15m"),
      "0 5 * * 1":      t("cronHuman.weeklyMon05"),
    }
    return m[expr] ?? expr
  }, [t])

  const scheduleDisplay = useCallback((s: ScheduleTime, type: string): string => {
    const time = `${String(s.hour).padStart(2, "0")}:${String(s.minute).padStart(2, "0")}`
    if (type === "one_time") return s.date ? `${s.date} ${time}` : time
    if (s.day_of_week) {
      const dow = DOW_OPTIONS.find((d) => d.value === s.day_of_week)?.label ?? s.day_of_week
      return t("scheduleWeekly", { dow, time })
    }
    return t("scheduleDaily", { time })
  }, [t, DOW_OPTIONS])

  const statusBadge = useCallback((status: string) => {
    if (status === "active")    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border border-green-300 dark:border-green-700 bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">{t("statusActive")}</span>
    if (status === "paused")    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border border-border bg-muted text-muted-foreground">{t("statusPaused")}</span>
    if (status === "completed") return (
      // #8 completed 상태 설명 추가
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-border text-muted-foreground cursor-help">
            {t("statusCompleted")}
            <HelpCircle className="size-3" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          일회성 알림이 이미 발송되어 완료된 상태입니다. 수정하려면 새로 만드세요.
        </TooltipContent>
      </Tooltip>
    )
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border border-border text-muted-foreground">{status}</span>
  }, [t])

  const [systemJobs, setSystemJobs]         = useState<SystemJob[]>([])
  const [schedules, setSchedules]           = useState<UserSchedule[]>([])
  const [loadingSystem, setLoadingSystem]   = useState(true)
  const [loadingUser, setLoadingUser]       = useState(true)
  const [cronDialogOpen, setCronDialogOpen] = useState(false)
  const [cronEditTarget, setCronEditTarget] = useState<UserSchedule | null>(null)
  const [cronSaving, setCronSaving]         = useState(false)
  const [togglingId, setTogglingId]         = useState<string | null>(null)
  const [togglingSystemId, setTogglingSystemId] = useState<string | null>(null)
  // #1 AlertDialog용 삭제 대상 state
  const [deleteTarget, setDeleteTarget]     = useState<UserSchedule | null>(null)
  const [cronDeletingId, setCronDeletingId] = useState<string | null>(null)
  const [cronForm, setCronForm]             = useState(emptyCronForm())

  // ── Fetch: system jobs ───────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/cron/system")
      .then((r) => r.json())
      .then((d) => setSystemJobs(Array.isArray(d) ? d : []))
      .catch(() => toast.error(t("toast.loadSystemJobsFailed")))
      .finally(() => setLoadingSystem(false))
  }, [])

  // ── Fetch: user schedules ───────────────────────────────────────────────────
  const fetchSchedules = useCallback(() => {
    setLoadingUser(true)
    fetch("/api/cron/schedules")
      .then((r) => r.json())
      .then((d) => setSchedules(Array.isArray(d) ? d : []))
      .catch(() => toast.error(t("toast.loadSchedulesFailed")))
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

  // #10 다이얼로그 닫힐 때 항상 상태 정리
  const handleDialogClose = (open: boolean) => {
    setCronDialogOpen(open)
    if (!open) {
      setCronEditTarget(null)
      setCronForm(emptyCronForm())
    }
  }

  // #2 저장 toast 추가
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
        const res = await fetch(`/api/cron/schedules/${cronEditTarget.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error("수정 실패")
        toast.success("알림 일정이 수정되었습니다.")
      } else {
        const res = await fetch("/api/cron/schedules", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error("저장 실패")
        toast.success("알림 일정이 추가되었습니다.")
      }
      setCronDialogOpen(false)
      setCronEditTarget(null)
      setCronForm(emptyCronForm())
      fetchSchedules()
    } catch {
      toast.error(cronEditTarget ? "일정 수정에 실패했습니다." : "일정 저장에 실패했습니다.")
    } finally {
      setCronSaving(false)
    }
  }

  // #2 토글 toast 추가
  const handleToggle = async (id: string) => {
    setTogglingId(id)
    try {
      const res = await fetch(`/api/cron/schedules/${id}/toggle`, { method: "POST" })
      if (!res.ok) throw new Error()
      const { status } = await res.json()
      setSchedules((prev) => prev.map((s) => s.id === id ? { ...s, status } : s))
      toast.success(status === "active" ? "알림을 활성화했습니다." : "알림을 일시정지했습니다.")
    } catch {
      toast.error("상태 변경에 실패했습니다.")
    } finally {
      setTogglingId(null)
    }
  }

  // #2 시스템 잡 토글 toast 추가
  const handleToggleSystem = async (id: string) => {
    setTogglingSystemId(id)
    try {
      const res = await fetch(`/api/cron/system/${id}/toggle`, { method: "POST" })
      if (!res.ok) throw new Error()
      const { enabled } = await res.json()
      setSystemJobs((prev) => prev.map((j) => j.id === id ? { ...j, enabled } : j))
      toast.success(enabled ? "시스템 잡을 활성화했습니다." : "시스템 잡을 비활성화했습니다.")
    } catch {
      toast.error("시스템 잡 상태 변경에 실패했습니다.")
    } finally {
      setTogglingSystemId(null)
    }
  }

  // #1 AlertDialog 확정 시 삭제 실행 + #2 toast
  const handleCronDelete = async () => {
    if (!deleteTarget) return
    setCronDeletingId(deleteTarget.id)
    try {
      const res = await fetch(`/api/cron/schedules/${deleteTarget.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      setSchedules((prev) => prev.filter((s) => s.id !== deleteTarget.id))
      toast.success(`"${deleteTarget.title}" 알림이 삭제되었습니다.`)
    } catch {
      toast.error("알림 삭제에 실패했습니다.")
    } finally {
      setCronDeletingId(null)
      setDeleteTarget(null)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Bell className="size-6 text-primary" />
            {t("title")}
          </h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>

        {/* #4 탭 순서: 내 알림 먼저 */}
        <Tabs defaultValue="user" className="space-y-6">
          <TabsList>
            <TabsTrigger value="user">{t("tabUser")}</TabsTrigger>
            <TabsTrigger value="system">{t("tabSystem")}</TabsTrigger>
          </TabsList>

          {/* ── User Schedules ───────────────────────────────────────────────── */}
          <TabsContent value="user">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
                <div className="size-8 rounded-lg bg-violet-100 dark:bg-violet-950/60 flex items-center justify-center shrink-0">
                  <CalendarClock className="size-4 text-violet-500" />
                </div>
                <h2 className="text-sm font-semibold flex-1">{t("mySchedulesTitle")}</h2>
                <Button size="sm" onClick={openCronCreate} className="gap-1">
                  <Plus className="size-4" />{t("addSchedule")}
                </Button>
              </div>
              <div className="p-5">
                {loadingUser ? (
                  <div className="space-y-2 py-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-4 rounded-lg border border-border p-3">
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <Skeleton className="h-4 w-40" />
                          <Skeleton className="h-3 w-56" />
                        </div>
                        <Skeleton className="hidden sm:block h-6 w-24 rounded" />
                        <Skeleton className="h-7 w-16 rounded" />
                      </div>
                    ))}
                  </div>
                ) : schedules.length === 0 ? (
                  // #7 Empty state CTA
                  <div className="flex flex-col items-center justify-center py-14 gap-4 text-center">
                    <div className="size-12 rounded-full bg-violet-100 dark:bg-violet-950/60 flex items-center justify-center">
                      <Bell className="size-5 text-violet-500" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">{t("noSchedules")}</p>
                      <p className="text-xs text-muted-foreground">{t("emptyHintAuto")}</p>
                    </div>
                    <Button size="sm" onClick={openCronCreate} className="gap-1">
                      <Plus className="size-4" /> {t("createNow")}
                    </Button>
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
                            {/* #6 메시지 전체 내용 Tooltip으로 확인 */}
                            {s.report_type === "custom_reminder" && s.message && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="truncate max-w-xs cursor-help underline decoration-dashed underline-offset-2">
                                    {s.message}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-xs whitespace-pre-wrap">
                                  {s.message}
                                </TooltipContent>
                              </Tooltip>
                            )}
                            {s.last_sent && <span>{t("lastSent", { date: s.last_sent })}</span>}
                          </div>
                        </div>
                        {s.status !== "completed" ? (
                          togglingId === s.id ? (
                            <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
                          ) : (
                            <Switch checked={s.status === "active"} onCheckedChange={() => handleToggle(s.id)} />
                          )
                        ) : (
                          // #8 completed 상태 — 토글 대신 잠금 아이콘
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <BanIcon className="size-4 text-muted-foreground shrink-0 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              완료된 일정은 수정할 수 없습니다.
                            </TooltipContent>
                          </Tooltip>
                        )}
                        <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => openCronEdit(s)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        {/* #1 삭제 — AlertDialog 트리거 */}
                        <Button
                          variant="ghost" size="icon"
                          className="size-8 shrink-0 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(s)}
                          disabled={cronDeletingId === s.id}
                        >
                          {cronDeletingId === s.id
                            ? <Loader2 className="size-3.5 animate-spin" />
                            : <Trash2 className="size-3.5" />
                          }
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ── System Jobs ──────────────────────────────────────────────────── */}
          <TabsContent value="system">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
                <div className="size-8 rounded-lg bg-sky-100 dark:bg-sky-950/60 flex items-center justify-center shrink-0">
                  <Server className="size-4 text-sky-500" />
                </div>
                <h2 className="text-sm font-semibold">{t("systemJobsTitle")}</h2>
              </div>
              <div className="p-5">
                {loadingSystem ? (
                  <div className="space-y-2 py-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-4 rounded-lg border border-border p-3">
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-5 w-16 rounded-full" />
                          </div>
                          <Skeleton className="h-3 w-48" />
                        </div>
                        <Skeleton className="hidden sm:block h-6 w-24 rounded" />
                        <Skeleton className="hidden md:block h-4 w-20" />
                        <Skeleton className="size-9 rounded-full shrink-0" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {systemJobs.map((job) => (
                      <div key={job.id} className="flex items-center gap-4 rounded-lg border border-border p-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{job.name}</span>
                            {/* #5 레벨 배지 + Tooltip */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium cursor-help ${LEVEL_COLORS[job.level] ?? LEVEL_COLORS.maintenance}`}>
                                  {LEVEL_LABELS[job.level] ?? job.level}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                {LEVEL_DESCRIPTIONS[job.level] ?? "시스템 잡입니다."}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{job.description}</p>
                        </div>
                        <code className="text-xs bg-muted px-2 py-1 rounded shrink-0 hidden sm:block">{job.schedule}</code>
                        <span className="text-xs text-muted-foreground shrink-0 hidden md:block">{cronHuman(job.schedule)}</span>
                        {job.can_disable ? (
                          togglingSystemId === job.id ? (
                            <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
                          ) : (
                            <Switch
                              checked={job.enabled}
                              onCheckedChange={() => handleToggleSystem(job.id)}
                              className="shrink-0"
                            />
                          )
                        ) : (
                          // #5 Background Only 배지 + Tooltip
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-border bg-muted text-muted-foreground shrink-0 cursor-help">
                                {t("backgroundOnly")}
                                <HelpCircle className="size-3" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              이 잡은 시스템 필수 프로세스로 비활성화할 수 없습니다.
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* ── #1 삭제 AlertDialog ──────────────────────────────────────────────── */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("deleteDialog.title")}</AlertDialogTitle>
              <AlertDialogDescription>
                <span className="font-medium text-foreground">"{deleteTarget?.title}"</span> {t("deleteDialog.description")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("deleteDialog.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleCronDelete}
                disabled={!!cronDeletingId}
              >
                {cronDeletingId && <Loader2 className="size-4 animate-spin mr-2" />}
                {t("deleteDialog.confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ── Cron Dialog ──────────────────────────────────────────────────────── */}
        {/* #10 onOpenChange → handleDialogClose로 교체 */}
        <Dialog open={cronDialogOpen} onOpenChange={handleDialogClose}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{cronEditTarget ? t("dialogEditTitle") : t("dialogAddTitle")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>{t("fieldTitle")}</Label>
                <Input
                  placeholder={t("fieldTitlePlaceholder")}
                  value={cronForm.title}
                  onChange={(e) => setCronForm({ ...cronForm, title: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("fieldType")}</Label>
                <Select value={cronForm.type} onValueChange={(v) => setCronForm({ ...cronForm, type: v, day_of_week: "", date: "" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recurring">{t("typeRecurring")}</SelectItem>
                    <SelectItem value="one_time">{t("typeOneTime")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("fieldReportType")}</Label>
                <Select value={cronForm.report_type} onValueChange={(v) => setCronForm({ ...cronForm, report_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REPORT_TYPES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {cronForm.report_type === "custom_reminder" && (
                <div className="space-y-1.5">
                  <Label>{t("fieldMessage")}</Label>
                  <Input
                    placeholder={t("fieldMessagePlaceholder")}
                    value={cronForm.message}
                    onChange={(e) => setCronForm({ ...cronForm, message: e.target.value })}
                  />
                </div>
              )}
              {/* #3 시간 — 숫자 직접 입력 → Select로 교체 */}
              <div className="space-y-1.5">
                <Label>{t("fieldTime")}</Label>
                <div className="flex gap-2 items-center">
                  <Select
                    value={String(cronForm.hour)}
                    onValueChange={(v) => setCronForm({ ...cronForm, hour: Number(v) })}
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue placeholder={t("fieldHour")} />
                    </SelectTrigger>
                    <SelectContent className="max-h-52">
                      {HOUR_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-muted-foreground font-medium">:</span>
                  <Select
                    value={String(cronForm.minute)}
                    onValueChange={(v) => setCronForm({ ...cronForm, minute: Number(v) })}
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue placeholder={t("fieldMinute")} />
                    </SelectTrigger>
                    <SelectContent className="max-h-52">
                      {MINUTE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* #9 타입 전환 시 필드 — overflow:hidden + max-height transition으로 레이아웃 점프 방지 */}
              <div
                className="overflow-hidden transition-all duration-200"
                style={{ maxHeight: cronForm.type === "recurring" ? "80px" : 0, opacity: cronForm.type === "recurring" ? 1 : 0 }}
              >
                <div className="space-y-1.5">
                  <Label>{t("fieldDow")}</Label>
                  <Select value={cronForm.day_of_week} onValueChange={(v) => setCronForm({ ...cronForm, day_of_week: v === "daily" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder={t("dowDaily")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">{t("dowDaily")}</SelectItem>
                      {DOW_OPTIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div
                className="overflow-hidden transition-all duration-200"
                style={{ maxHeight: cronForm.type === "one_time" ? "80px" : 0, opacity: cronForm.type === "one_time" ? 1 : 0 }}
              >
                <div className="space-y-1.5">
                  <Label>{t("fieldDate")}</Label>
                  <Input type="date" value={cronForm.date} onChange={(e) => setCronForm({ ...cronForm, date: e.target.value })} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleDialogClose(false)}>{t("cancel")}</Button>
              <Button onClick={handleCronSave} disabled={cronSaving || !cronForm.title.trim()}>
                {cronSaving && <Loader2 className="size-4 animate-spin mr-2" />}
                {cronEditTarget ? t("update") : t("add")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
