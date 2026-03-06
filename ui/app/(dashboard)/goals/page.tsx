"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
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
import { Plus, Edit, Check, Flame, Loader2, Trash2, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"

// ── types ──────────────────────────────────────────────────────────────────────

interface Goal {
  id: number
  title: string
  icon: string
  category: string
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
  target_value: "",
  unit: "",
  start_date: new Date().toISOString().slice(0, 10),
  end_date: "",
  description: "",
}

const UNIT_OPTIONS = ["원", "일", "회", "권", "km", "kg", "%", "개"]
const ICON_OPTIONS = ["🎯", "💰", "🏃", "📚", "💪", "🧘", "✈️", "🎵", "🍎", "💻"]

// ── helpers ────────────────────────────────────────────────────────────────────

function formatValue(value: number, unit: string) {
  if (unit === "원") {
    return new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW" }).format(value)
  }
  return `${value.toLocaleString()}${unit}`
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

// ── api calls ─────────────────────────────────────────────────────────────────

async function fetchGoals(): Promise<Goal[]> {
  const res = await fetch("/api/goals", { cache: "no-store" })
  if (!res.ok) return []
  const data = await res.json()
  return data.goals ?? []
}

async function createGoal(form: GoalForm): Promise<boolean> {
  const res = await fetch("/api/goals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: form.title,
      icon: form.icon,
      category: form.category,
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* icon picker */}
          <div className="space-y-2">
            <Label>아이콘</Label>
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">목표 제목 *</Label>
            <Input
              id="title"
              placeholder="여행 자금 모으기"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="target">목표값</Label>
              <Input
                id="target"
                type="number"
                placeholder="1000000"
                value={form.target_value}
                onChange={(e) => set("target_value", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>단위</Label>
              <Select value={form.unit} onValueChange={(v) => set("unit", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="선택" />
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
              <Label htmlFor="startDate">시작일</Label>
              <Input
                id="startDate"
                type="date"
                value={form.start_date}
                onChange={(e) => set("start_date", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">종료일</Label>
              <Input
                id="endDate"
                type="date"
                value={form.end_date}
                onChange={(e) => set("end_date", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">설명 (선택)</Label>
            <Textarea
              id="description"
              placeholder="목표에 대한 설명..."
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
            <Button onClick={handleSubmit} disabled={saving || !form.title.trim()}>
              {saving && <Loader2 className="size-4 mr-1 animate-spin" />}
              저장
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function EditProgressDialog({
  goal,
  onSave,
}: {
  goal: Goal
  onSave: (currentValue: number) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(String(goal.current_value))
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await onSave(parseFloat(value) || 0)
    setSaving(false)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <Edit className="size-3" />
          편집
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>진행 현황 업데이트</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>현재값 ({goal.unit})</Label>
            <Input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              목표: {formatValue(goal.target_value, goal.unit)}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="size-4 mr-1 animate-spin" />}
              저장
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── main component ─────────────────────────────────────────────────────────────

export default function GoalsPage() {
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
  const completed = goals.filter((g) => g.status === "completed")
  const abandoned = goals.filter((g) => g.status === "abandoned")

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
    if (!confirm("목표를 삭제하시겠습니까?")) return
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

  const isHabitGoal = (goal: Goal) => goal.unit === "일" || goal.unit === "회"
  const todayStr = today()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">목표 관리</h1>
          <p className="text-muted-foreground">목표를 설정하고 진행 상황을 추적하세요</p>
        </div>
        <GoalFormDialog
          trigger={
            <Button className="gap-2">
              <Plus className="size-4" />
              목표 추가
            </Button>
          }
          title="새 목표 추가"
          onSubmit={handleCreate}
        />
      </div>

      <Tabs defaultValue="inProgress" className="space-y-6">
        <TabsList>
          <TabsTrigger value="inProgress">진행중 ({inProgress.length})</TabsTrigger>
          <TabsTrigger value="completed">완료 ({completed.length})</TabsTrigger>
          <TabsTrigger value="abandoned">포기 ({abandoned.length})</TabsTrigger>
        </TabsList>

        {/* ── In Progress ── */}
        <TabsContent value="inProgress" className="space-y-4">
          {inProgress.length === 0 && (
            <p className="text-center text-muted-foreground py-12">진행중인 목표가 없어요. 새 목표를 추가해보세요!</p>
          )}
          {inProgress.map((goal) => {
            const isMutating = mutating === goal.id
            const checkedToday = goal.checkins.includes(todayStr)
            const isHabit = isHabitGoal(goal)

            return (
              <Card key={goal.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{goal.icon}</span>
                      <div>
                        <h3 className="font-semibold">{goal.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          {goal.start_date} ~ {goal.end_date ?? "–"}
                          {goal.days_remaining != null && ` | 남은 기간: ${goal.days_remaining}일`}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap justify-end">
                      {/* Edit goal metadata */}
                      <GoalFormDialog
                        trigger={
                          <Button variant="outline" size="sm" className="gap-1">
                            <Edit className="size-3" />
                            편집
                          </Button>
                        }
                        title="목표 편집"
                        initial={{
                          title: goal.title,
                          icon: goal.icon,
                          category: goal.category,
                          target_value: String(goal.target_value),
                          unit: goal.unit,
                          start_date: goal.start_date,
                          end_date: goal.end_date ?? "",
                          description: goal.description,
                        }}
                        onSubmit={(form) => handleEditGoal(goal, form)}
                      />
                      {/* Complete */}
                      <Button
                        size="sm"
                        className="gap-1"
                        disabled={isMutating}
                        onClick={() => handleComplete(goal.id)}
                      >
                        {isMutating ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                        달성
                      </Button>
                      {/* Delete */}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1 text-destructive hover:text-destructive"
                        disabled={isMutating}
                        onClick={() => handleDelete(goal.id)}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between text-sm">
                      <span>진행률</span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{Math.round(goal.progress)}%</span>
                        {!isHabit && (
                          <EditProgressDialog
                            goal={goal}
                            onSave={(v) => handleUpdateProgress(goal.id, v)}
                          />
                        )}
                      </div>
                    </div>
                    <Progress value={goal.progress} className="h-3" />
                    {goal.unit && (
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{formatValue(goal.current_value, goal.unit)}</span>
                        <span>{formatValue(goal.target_value, goal.unit)}</span>
                      </div>
                    )}
                  </div>

                  {/* Streak */}
                  {goal.streak > 0 && (
                    <div className="flex items-center gap-2 mb-4">
                      <Flame className="size-4 text-destructive" />
                      <span className="text-sm font-medium">연속 {goal.streak}일 달성!</span>
                    </div>
                  )}

                  {/* Checkin calendar (habit goals) */}
                  {isHabit && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">최근 30일 체크인</p>
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
                          {checkedToday ? "오늘 완료" : "오늘 체크"}
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
                                  "size-6 rounded flex items-center justify-center text-xs",
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
                </CardContent>
              </Card>
            )
          })}
        </TabsContent>

        {/* ── Completed ── */}
        <TabsContent value="completed" className="space-y-4">
          {completed.length === 0 && (
            <p className="text-center text-muted-foreground py-12">완료된 목표가 없어요.</p>
          )}
          {completed.map((goal) => (
            <Card key={goal.id}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{goal.icon}</span>
                    <div>
                      <h3 className="font-semibold">{goal.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        완료일: {goal.completed_date ?? "-"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-green-500 text-white">완료</Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(goal.id)}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ── Abandoned ── */}
        <TabsContent value="abandoned" className="space-y-4">
          {abandoned.length === 0 && (
            <p className="text-center text-muted-foreground py-12">포기한 목표가 없어요.</p>
          )}
          {abandoned.map((goal) => {
            const isMutating = mutating === goal.id
            return (
              <Card key={goal.id}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl opacity-50">{goal.icon}</span>
                      <div>
                        <h3 className="font-semibold text-muted-foreground">{goal.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          포기일: {goal.abandoned_date ?? "-"} | 달성률: {Math.round(goal.progress)}%
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        disabled={isMutating}
                        onClick={() => handleRestart(goal.id)}
                      >
                        {isMutating
                          ? <Loader2 className="size-3 animate-spin" />
                          : <RotateCcw className="size-3" />
                        }
                        다시 시작
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(goal.id)}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </TabsContent>
      </Tabs>
    </div>
  )
}
