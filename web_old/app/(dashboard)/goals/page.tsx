"use client"

import { useEffect, useState, useCallback } from "react"
import { useTranslations } from "next-intl"
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
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
import { Plus, Edit, Check, Flame, Loader2, Target, Trash2, RotateCcw, Flag, Minus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

// ── types ──────────────────────────────────────────────────────────────────────

interface Goal {
  id: number
  title: string
  icon: string
  category: string
  goal_type?: "habit" | "numeric"
  target_value: number
  current_value: number
  unit: string
  progress: number
  start_date: string
  end_date?: string
  status: "in_progress" | "completed" | "abandoned"
  description: string
  days_remaining?: number
  streak: number
  checkins: string[]
  completed_date?: string
  abandoned_date?: string
}

interface GoalForm {
  title: string
  icon: string
  category: string
  goal_type: "habit" | "numeric"
  target_value: string
  unit: string
  start_date: string
  end_date: string
  description: string
}

const EMPTY_FORM: GoalForm = {
  title: "",
  icon: "🎯",
  category: "general",
  goal_type: "numeric",
  target_value: "",
  unit: "",
  start_date: new Date().toISOString().slice(0, 10),
  end_date: "",
  description: "",
}

const UNIT_OPTIONS = ["원", "일", "회", "권", "km", "kg", "%", "개"]
const ICON_OPTIONS = ["🎯", "💰", "🏃", "📚", "💪", "🧘", "✈️", "🎵", "🍎", "💻"]

// [#1] 카테고리 옵션 — labels resolved via t() inside components
const CATEGORY_OPTIONS = [
  { value: "general" },
  { value: "health" },
  { value: "finance" },
  { value: "study" },
  { value: "lifestyle" },
  { value: "travel" },
  { value: "hobby" },
]

const CATEGORY_BADGE: Record<string, string> = {
  general:   "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  health:    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  finance:   "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  study:     "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300",
  lifestyle: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
  travel:    "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  hobby:     "bg-pink-100 text-pink-700 dark:bg-pink-950/50 dark:text-pink-300",
}

// ── helpers ────────────────────────────────────────────────────────────────────

function formatValue(value: number | null | undefined, unit: string) {
  const num = value ?? 0
  if (unit === "원") {
    return new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW" }).format(num)
  }
  return `${num.toLocaleString()}${unit}`
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

// categoryLabel is resolved via t() in components that have translation context

// ── api calls ─────────────────────────────────────────────────────────────────

async function fetchGoals(): Promise<Goal[]> {
  const res = await fetch("/api/goals", { cache: "no-store" })
  if (!res.ok) return []
  const data = await res.json()
  return (data.goals ?? []).map((g: Goal) => ({ ...g, checkins: g.checkins ?? [] }))
}

async function createGoal(form: GoalForm): Promise<boolean> {
  const res = await fetch("/api/goals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: form.title,
      icon: form.icon,
      category: form.category,
      goal_type: form.goal_type,
      target_value: parseFloat(form.target_value) || 0,
      unit: form.unit,
      start_date: form.start_date,
      end_date: form.end_date || undefined,
      description: form.description,
    }),
  })
  return res.ok
}

async function updateGoal(id: number, patch: Partial<Goal> & Record<string, unknown>): Promise<boolean> {
  const res = await fetch(`/api/goals/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  })
  return res.ok
}

async function deleteGoal(id: number): Promise<boolean> {
  const res = await fetch(`/api/goals/${id}`, { method: "DELETE" })
  return res.ok
}

async function addCheckin(id: number): Promise<boolean> {
  const res = await fetch(`/api/goals/${id}/checkin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: today() }),
  })
  return res.ok
}

async function removeCheckin(id: number, date: string): Promise<boolean> {
  const res = await fetch(`/api/goals/${id}/checkin?date=${date}`, { method: "DELETE" })
  return res.ok
}

// ── sub-components ─────────────────────────────────────────────────────────────

function GoalFormDialog({
  trigger,
  title,
  initial,
  onSubmit,
}: {
  trigger: React.ReactNode
  title: string
  initial?: GoalForm
  onSubmit: (form: GoalForm) => Promise<void>
}) {
  const t = useTranslations("goals")
  const tc = useTranslations("common")
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<GoalForm>(initial ?? EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setForm(initial ?? EMPTY_FORM)
  }, [open, initial])

  const set = (k: keyof GoalForm, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    await onSubmit(form)
    setSaving(false)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">

          {/* [#7] 목표 유형 선택 — 습관형 / 수치 달성형 */}
          <div className="space-y-2">
            <Label>{t("goalTypeLabel")}</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => set("goal_type", "numeric")}
                className={cn(
                  "flex-1 flex flex-col items-center gap-0.5 py-2.5 rounded-lg border text-sm transition-colors",
                  form.goal_type === "numeric"
                    ? "border-primary bg-primary/10 font-semibold"
                    : "border-border hover:bg-muted/50"
                )}
              >
                <span className="text-lg">📊</span>
                <span>{t("numericType")}</span>
                <span className="text-xs text-muted-foreground font-normal">{t("numericTypeDesc")}</span>
              </button>
              <button
                type="button"
                onClick={() => set("goal_type", "habit")}
                className={cn(
                  "flex-1 flex flex-col items-center gap-0.5 py-2.5 rounded-lg border text-sm transition-colors",
                  form.goal_type === "habit"
                    ? "border-primary bg-primary/10 font-semibold"
                    : "border-border hover:bg-muted/50"
                )}
              >
                <span className="text-lg">✅</span>
                <span>{t("habitType")}</span>
                <span className="text-xs text-muted-foreground font-normal">{t("habitTypeDesc")}</span>
              </button>
            </div>
          </div>

          {/* [#10] 아이콘 선택 + 직접 입력 */}
          <div className="space-y-2">
            <Label>{t("iconLabel")}</Label>
            <div className="flex flex-wrap gap-2">
              {ICON_OPTIONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => set("icon", icon)}
                  className={cn(
                    "text-xl p-1.5 rounded border transition-colors",
                    form.icon === icon ? "border-primary bg-primary/10" : "border-transparent hover:border-muted"
                  )}
                >
                  {icon}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t("customIconLabel")}</span>
              <Input
                className="w-16 text-center text-base"
                maxLength={2}
                value={form.icon}
                onChange={(e) => set("icon", e.target.value || "🎯")}
                placeholder="🎯"
              />
              <span className="text-xs text-muted-foreground">{t("selectedIconLabel")} <span className="text-lg">{form.icon}</span></span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">{t("goalTitleLabel")}</Label>
            <Input
              id="title"
              placeholder={t("goalTitlePlaceholder")}
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </div>

          {/* [#1] 카테고리 선택 */}
          <div className="space-y-2">
            <Label>{t("categoryLabel")}</Label>
            <Select value={form.category} onValueChange={(v) => set("category", v)}>
              <SelectTrigger>
                <SelectValue placeholder={t("categoryPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{t(`categories.${c.value}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="target">{t("targetValue")}</Label>
              <Input
                id="target"
                type="number"
                placeholder="1000000"
                value={form.target_value}
                onChange={(e) => set("target_value", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("unit")}</Label>
              <Select value={form.unit} onValueChange={(v) => set("unit", v)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("unitPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_OPTIONS.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">{t("startDate")}</Label>
              <Input
                id="startDate"
                type="date"
                value={form.start_date}
                onChange={(e) => set("start_date", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">{t("endDate")}</Label>
              <Input
                id="endDate"
                type="date"
                value={form.end_date}
                onChange={(e) => set("end_date", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t("descriptionLabel")}</Label>
            <Textarea
              id="description"
              placeholder={t("descriptionPlaceholder")}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>{tc("cancel")}</Button>
            <Button onClick={handleSubmit} disabled={saving || !form.title.trim()}>
              {saving && <Loader2 className="size-4 mr-1 animate-spin" />}
              {tc("save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// [#5] 진행률 수정 — delta/absolute 두 가지 모드
function EditProgressDialog({
  goal,
  onSave,
}: {
  goal: Goal
  onSave: (currentValue: number) => Promise<void>
}) {
  const t = useTranslations("goals")
  const tc = useTranslations("common")
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<"delta" | "absolute">("delta")
  const [deltaValue, setDeltaValue] = useState("")
  const [absValue, setAbsValue] = useState(String(goal.current_value))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setMode("delta")
      setDeltaValue("")
      setAbsValue(String(goal.current_value))
    }
  }, [open, goal.current_value])

  const computedValue =
    mode === "delta"
      ? goal.current_value + (parseFloat(deltaValue) || 0)
      : parseFloat(absValue) || 0

  const handleSave = async () => {
    setSaving(true)
    await onSave(computedValue)
    setSaving(false)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1 h-7 text-xs">
          <Edit className="size-3" />
          {t("editButton")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>{t("updateProgress")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* 모드 토글 */}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === "delta" ? "default" : "outline"}
              className="flex-1 text-xs h-8"
              onClick={() => setMode("delta")}
            >
              {t("addToday")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "absolute" ? "default" : "outline"}
              className="flex-1 text-xs h-8"
              onClick={() => setMode("absolute")}
            >
              {t("directInput")}
            </Button>
          </div>

          {mode === "delta" ? (
            <div className="space-y-2">
              <Label>{t("todayAddAmount", { unit: goal.unit })}</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="size-9 p-0 shrink-0"
                  onClick={() => setDeltaValue(String((parseFloat(deltaValue) || 0) - 1))}
                >
                  <Minus className="size-3.5" />
                </Button>
                <Input
                  type="number"
                  value={deltaValue}
                  onChange={(e) => setDeltaValue(e.target.value)}
                  className="text-center"
                  autoFocus
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="size-9 p-0 shrink-0"
                  onClick={() => setDeltaValue(String((parseFloat(deltaValue) || 0) + 1))}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                {formatValue(goal.current_value, goal.unit)}
                {" → "}
                <span className="font-semibold text-foreground">{formatValue(computedValue, goal.unit)}</span>
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>{t("currentValue", { unit: goal.unit })}</Label>
              <Input
                type="number"
                value={absValue}
                onChange={(e) => setAbsValue(e.target.value)}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                {t("targetLabel")} {formatValue(goal.target_value, goal.unit)}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>{tc("cancel")}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="size-4 mr-1 animate-spin" />}
              {tc("save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// [#2] 달성 확인 AlertDialog
function CompleteGoalButton({
  goalTitle,
  disabled,
  isMutating,
  onConfirm,
}: {
  goalTitle: string
  disabled?: boolean
  isMutating?: boolean
  onConfirm: () => void
}) {
  const t = useTranslations("goals")
  const tc = useTranslations("common")
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="size-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
          disabled={disabled}
          title={t("completeTitle")}
        >
          {isMutating ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("completeDialogTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{goalTitle}</strong>{t("completeConfirmDesc")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {t("completeAction")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// [#3] 포기 확인 AlertDialog
function AbandonGoalButton({
  goalTitle,
  disabled,
  isMutating,
  onConfirm,
}: {
  goalTitle: string
  disabled?: boolean
  isMutating?: boolean
  onConfirm: () => void
}) {
  const t = useTranslations("goals")
  const tc = useTranslations("common")
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="size-8 p-0 text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
          disabled={disabled}
          title={t("abandonTitle")}
        >
          {isMutating ? <Loader2 className="size-3.5 animate-spin" /> : <Flag className="size-3.5" />}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("abandonDialogTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{goalTitle}</strong>{t("abandonConfirmDesc")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("keepGoingButton")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-amber-500 text-white hover:bg-amber-600"
          >
            {t("abandonAction")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function DeleteGoalButton({
  goalTitle,
  disabled,
  onConfirm,
}: {
  goalTitle: string
  disabled?: boolean
  onConfirm: () => void
}) {
  const t = useTranslations("goals")
  const tc = useTranslations("common")

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="size-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
          disabled={disabled}
        >
          <Trash2 className="size-3" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteDialogTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("deleteDialogDescription", { title: goalTitle })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
          >
            {tc("delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ── main component ─────────────────────────────────────────────────────────────

export default function GoalsPage() {
  const t = useTranslations("goals")

  const categoryLabel = (value: string) => {
    const key = `categories.${value}` as Parameters<typeof t>[0]
    try { return t(key) } catch { return value }
  }

  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [mutating, setMutating] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const data = await fetchGoals()
    setGoals(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const inProgress = goals.filter((g) => g.status === "in_progress")
  const completed  = goals.filter((g) => g.status === "completed")
  const abandoned  = goals.filter((g) => g.status === "abandoned")

  // ── handlers ──

  const handleCreate = async (form: GoalForm) => {
    await createGoal(form)
    await load()
  }

  const handleEditGoal = async (goal: Goal, form: GoalForm) => {
    await updateGoal(goal.id, {
      title: form.title,
      icon: form.icon,
      category: form.category,
      goal_type: form.goal_type,
      target_value: parseFloat(form.target_value) || goal.target_value,
      unit: form.unit,
      start_date: form.start_date,
      end_date: form.end_date,
      description: form.description,
    })
    await load()
  }

  const handleUpdateProgress = async (id: number, currentValue: number) => {
    setMutating(id)
    await updateGoal(id, { current_value: currentValue })
    await load()
    setMutating(null)
  }

  const handleComplete = async (id: number) => {
    setMutating(id)
    await updateGoal(id, { status: "completed" })
    await load()
    setMutating(null)
  }

  // [#3] 포기 핸들러
  const handleAbandon = async (id: number) => {
    setMutating(id)
    await updateGoal(id, { status: "abandoned" })
    await load()
    setMutating(null)
  }

  const handleRestart = async (id: number) => {
    setMutating(id)
    await updateGoal(id, { status: "in_progress" })
    await load()
    setMutating(null)
  }

  const handleDelete = async (id: number) => {
    setMutating(id)
    await deleteGoal(id)
    await load()
    setMutating(null)
  }

  const handleCheckin = async (goal: Goal) => {
    const todayStr = today()
    const alreadyChecked = goal.checkins.includes(todayStr)
    setMutating(goal.id)
    if (alreadyChecked) {
      await removeCheckin(goal.id, todayStr)
    } else {
      await addCheckin(goal.id)
    }
    await load()
    setMutating(null)
  }

  // ── render helpers ──

  // [#7] 습관형 판별 — goal_type 우선, 없으면 unit 기반 fallback
  const isHabitGoal = (goal: Goal) =>
    goal.goal_type === "habit" || goal.unit === "일" || goal.unit === "회"

  const todayStr = today()

  if (loading) {
    return (
      <div className="p-4 sm:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>
        <Skeleton className="h-10 w-72 rounded-md" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton className="size-8 rounded-lg" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <div className="flex gap-1">
                  <Skeleton className="size-7 rounded-md" />
                  <Skeleton className="size-7 rounded-md" />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-10" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Target className="size-6 text-primary" />
            {t("title")}
          </h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <GoalFormDialog
          trigger={
            <Button className="gap-2">
              <Plus className="size-4" />
              <span className="hidden sm:inline">{t("addGoal")}</span>
            </Button>
          }
          title={t("newGoalTitle")}
          onSubmit={handleCreate}
        />
      </div>

      <Tabs defaultValue="inProgress" className="space-y-6">
        <TabsList>
          <TabsTrigger value="inProgress">{t("inProgress", { count: inProgress.length })}</TabsTrigger>
          <TabsTrigger value="completed">{t("completed", { count: completed.length })}</TabsTrigger>
          <TabsTrigger value="abandoned">{t("abandoned", { count: abandoned.length })}</TabsTrigger>
        </TabsList>

        {/* ── In Progress ── */}
        <TabsContent value="inProgress">
          {/* [#6] 빈 상태 — CTA 포함 */}
          {inProgress.length === 0 ? (
            <div className="text-center py-16 space-y-4">
              <div className="size-16 mx-auto rounded-2xl bg-muted/50 flex items-center justify-center">
                <Target className="size-8 opacity-40" />
              </div>
              <div>
                <p className="font-medium text-sm">{t("emptyInProgress")}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("emptyInProgressHint")}</p>
              </div>
              <GoalFormDialog
                trigger={
                  <Button variant="outline" className="gap-2">
                    <Plus className="size-4" />
                    {t("createFirstGoal")}
                  </Button>
                }
                title={t("newGoalTitle")}
                onSubmit={handleCreate}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {inProgress.map((goal) => {
                const isMutating = mutating === goal.id
                const checkedToday = goal.checkins.includes(todayStr)
                const isHabit = isHabitGoal(goal)

                // [#9] 기한 초과 판별
                const isOverdue = goal.days_remaining != null && goal.end_date && goal.days_remaining < 0
                const isDueToday = goal.days_remaining === 0
                const isUrgent = goal.days_remaining != null && goal.days_remaining > 0 && goal.days_remaining <= 3

                return (
                  <div key={goal.id} className={cn(
                    "rounded-xl border border-border bg-card flex flex-col",
                    isOverdue && "border-red-300 dark:border-red-800"
                  )}>
                    <div className="p-4 sm:p-5 flex flex-col gap-4 flex-1">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-2xl shrink-0">{goal.icon}</span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h3 className="font-semibold truncate">{goal.title}</h3>
                              {/* [#1] 카테고리 배지 */}
                              {goal.category && goal.category !== "general" && (
                                <span className={cn(
                                  "text-[10px] px-1.5 py-0.5 rounded-full shrink-0",
                                  CATEGORY_BADGE[goal.category] ?? CATEGORY_BADGE["general"]
                                )}>
                                  {categoryLabel(goal.category)}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              <p className="text-xs text-muted-foreground">
                                {goal.start_date} ~ {goal.end_date ?? "–"}
                              </p>
                              {/* [#9] 기한 초과/임박 배지 */}
                              {isOverdue && (
                                <Badge className="text-[10px] px-1.5 py-0 bg-red-100 text-red-600 border-red-200 dark:bg-red-950/50 dark:text-red-300">
                                  {t("overdueLabel", { days: Math.abs(goal.days_remaining!) })}
                                </Badge>
                              )}
                              {isDueToday && (
                                <Badge className="text-[10px] px-1.5 py-0 bg-red-100 text-red-600 border-red-200">
                                  D-Day!
                                </Badge>
                              )}
                              {isUrgent && (
                                <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-600 border-amber-200">
                                  D-{goal.days_remaining}
                                </Badge>
                              )}
                              {goal.days_remaining != null && goal.days_remaining > 3 && (
                                <p className="text-xs text-muted-foreground">
                                  {t("daysRemaining", { days: goal.days_remaining })}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                        {/* [#4] 액션 버튼 — 색상으로 위험도 구분: 편집(기본) | 달성(초록) | 포기(주황) | 삭제(빨강) */}
                        <div className="flex items-center gap-0.5 shrink-0">
                          <GoalFormDialog
                            trigger={
                              <Button variant="ghost" size="sm" className="size-8 p-0">
                                <Edit className="size-3.5" />
                              </Button>
                            }
                            title={t("editGoalTitle")}
                            initial={{
                              title: goal.title,
                              icon: goal.icon,
                              category: goal.category,
                              goal_type: goal.goal_type ?? (isHabit ? "habit" : "numeric"),
                              target_value: String(goal.target_value),
                              unit: goal.unit,
                              start_date: goal.start_date,
                              end_date: goal.end_date ?? "",
                              description: goal.description,
                            }}
                            onSubmit={(form) => handleEditGoal(goal, form)}
                          />
                          <CompleteGoalButton
                            goalTitle={goal.title}
                            disabled={isMutating}
                            isMutating={isMutating}
                            onConfirm={() => handleComplete(goal.id)}
                          />
                          <AbandonGoalButton
                            goalTitle={goal.title}
                            disabled={isMutating}
                            isMutating={isMutating}
                            onConfirm={() => handleAbandon(goal.id)}
                          />
                          <DeleteGoalButton
                            goalTitle={goal.title}
                            disabled={isMutating}
                            onConfirm={() => handleDelete(goal.id)}
                          />
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{t("progressRate")}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{Math.round(goal.progress)}%</span>
                            {/* [#5] 수치형에만 편집 버튼 */}
                            {!isHabit && (
                              <EditProgressDialog
                                goal={goal}
                                onSave={(v) => handleUpdateProgress(goal.id, v)}
                              />
                            )}
                          </div>
                        </div>
                        <Progress value={goal.progress} className="h-2" />
                        {goal.unit && (
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{formatValue(goal.current_value, goal.unit)}</span>
                            <span>{formatValue(goal.target_value, goal.unit)}</span>
                          </div>
                        )}
                      </div>

                      {/* Streak */}
                      {goal.streak > 0 && (
                        <div className="flex items-center gap-1.5">
                          <Flame className="size-4 text-destructive" />
                          <span className="text-sm font-medium">{t("streak", { days: goal.streak })}</span>
                        </div>
                      )}

                      {/* Checkin calendar (habit goals) */}
                      {isHabit && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">{t("checkin30Days")}</p>
                            <Button
                              size="sm"
                              variant={checkedToday ? "secondary" : "default"}
                              className="gap-1 h-7 text-xs"
                              disabled={isMutating}
                              onClick={() => handleCheckin(goal)}
                            >
                              {isMutating
                                ? <Loader2 className="size-3 animate-spin" />
                                : <Check className="size-3" />
                              }
                              {checkedToday ? t("checkedToday") : t("checkToday")}
                            </Button>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {(() => {
                              const days: React.ReactNode[] = []
                              for (let i = 29; i >= 0; i--) {
                                const d = new Date()
                                d.setDate(d.getDate() - i)
                                const key = d.toISOString().slice(0, 10)
                                const checked = goal.checkins.includes(key)
                                days.push(
                                  <div
                                    key={key}
                                    title={key}
                                    className={cn(
                                      "size-5 rounded flex items-center justify-center text-[10px]",
                                      checked ? "bg-primary text-primary-foreground" : "bg-muted"
                                    )}
                                  >
                                    {checked ? "✓" : ""}
                                  </div>
                                )
                              }
                              return days
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Completed ── */}
        <TabsContent value="completed">
          {/* [#6] 빈 상태 */}
          {completed.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <div className="size-16 mx-auto rounded-2xl bg-muted/50 flex items-center justify-center">
                <Check className="size-8 opacity-40" />
              </div>
              <p className="text-muted-foreground text-sm">{t("emptyCompleted")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {completed.map((goal) => {
                const isMutating = mutating === goal.id
                return (
                  <div key={goal.id} className="rounded-xl border border-border bg-card">
                    {/* [#8] 완료 카드 — 성취 정보 강화 */}
                    <div className="p-4 sm:p-5 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-2xl shrink-0">{goal.icon}</span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h3 className="font-semibold truncate">{goal.title}</h3>
                              {goal.category && goal.category !== "general" && (
                                <span className={cn(
                                  "text-[10px] px-1.5 py-0.5 rounded-full shrink-0",
                                  CATEGORY_BADGE[goal.category] ?? CATEGORY_BADGE["general"]
                                )}>
                                  {categoryLabel(goal.category)}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {t("completedDate")} {goal.completed_date ?? "-"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge className="bg-emerald-500 text-white text-xs">{t("completedBadge")}</Badge>
                          {/* 완료된 목표도 다시 도전 가능 */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-8 p-0 text-muted-foreground hover:text-foreground"
                            disabled={isMutating}
                            onClick={() => handleRestart(goal.id)}
                            title={t("retryTitle")}
                          >
                            {isMutating
                              ? <Loader2 className="size-3.5 animate-spin" />
                              : <RotateCcw className="size-3.5" />
                            }
                          </Button>
                          <DeleteGoalButton
                            goalTitle={goal.title}
                            disabled={isMutating}
                            onConfirm={() => handleDelete(goal.id)}
                          />
                        </div>
                      </div>
                      {/* 성취 요약 */}
                      <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground pt-0.5 border-t border-border/60">
                        <span className="font-medium text-emerald-600">{t("achievementRateDisplay", { rate: Math.round(goal.progress) })}</span>
                        {goal.streak > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Flame className="size-3 text-destructive" />
                            {t("bestStreak", { days: goal.streak })}
                          </span>
                        )}
                        {goal.unit && (
                          <span>
                            {formatValue(goal.current_value, goal.unit)} / {formatValue(goal.target_value, goal.unit)}
                          </span>
                        )}
                        {goal.start_date && goal.completed_date && (
                          <span>{goal.start_date} ~ {goal.completed_date}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Abandoned ── */}
        <TabsContent value="abandoned">
          {/* [#6] 빈 상태 */}
          {abandoned.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <div className="size-16 mx-auto rounded-2xl bg-muted/50 flex items-center justify-center">
                <Flag className="size-8 opacity-40" />
              </div>
              <p className="text-muted-foreground text-sm">{t("emptyAbandoned")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {abandoned.map((goal) => {
                const isMutating = mutating === goal.id
                return (
                  <div key={goal.id} className="rounded-xl border border-border bg-card">
                    <div className="p-4 sm:p-5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-2xl opacity-50 shrink-0">{goal.icon}</span>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-muted-foreground truncate">{goal.title}</h3>
                            <p className="text-xs text-muted-foreground">
                              {t("abandonedDate")} {goal.abandoned_date ?? "-"} · {t("achievementRate")} {Math.round(goal.progress)}%
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            className="size-8 p-0"
                            disabled={isMutating}
                            onClick={() => handleRestart(goal.id)}
                            title={t("restartButton")}
                          >
                            {isMutating
                              ? <Loader2 className="size-3.5 animate-spin" />
                              : <RotateCcw className="size-3.5" />
                            }
                          </Button>
                          <DeleteGoalButton
                            goalTitle={goal.title}
                            disabled={isMutating}
                            onConfirm={() => handleDelete(goal.id)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
