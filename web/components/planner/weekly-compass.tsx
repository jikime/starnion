"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { usePlannerStore, type Priority } from "@/lib/planner-store"
import { useShallow } from "zustand/react/shallow"
import { cn } from "@/lib/utils"
import {
  Check, Plus, Trash2, ChevronDown, ChevronUp,
  Compass, AlertCircle, ChevronRight,
  Circle, ArrowRight, X,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

// ── Balance bar ─────────────────────────────────────────────────────────────

function BalanceBar({
  roleId,
  color,
  count,
  total,
}: {
  roleId: string
  color: string
  count: number
  total: number
}) {
  const pct = total === 0 ? 0 : Math.round((count / total) * 100)
  return (
    <div className="h-1 rounded-full bg-muted overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  )
}

// ── Nion coaching tip ────────────────────────────────────────────────────────

function NionCoachingTip({ unassigned, t }: { unassigned: string[]; t: ReturnType<typeof useTranslations> }) {
  if (unassigned.length === 0) return null
  return (
    <div
      className="flex items-start gap-2 px-2.5 py-2 rounded-md text-xs leading-snug"
      style={{
        background: "color-mix(in oklch, var(--priority-b) 12%, transparent)",
        border: "1px solid color-mix(in oklch, var(--priority-b) 30%, var(--border))",
        color: "var(--priority-b)",
      }}
    >
      <AlertCircle className="w-3 h-3 shrink-0 mt-px" />
      <span>
        <strong>&apos;{unassigned[0]}&apos;</strong> {t("compassStopped")}
        {" "}{t("compassHint")}
      </span>
    </div>
  )
}

// ── Status icon for linked tasks ────────────────────────────────────────────

const TASK_STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <Circle className="w-2.5 h-2.5 text-muted-foreground" />,
  "in-progress": <Circle className="w-2.5 h-2.5 fill-current" style={{ color: "var(--status-in-progress)" }} />,
  done: <Check className="w-2.5 h-2.5" style={{ color: "var(--status-done)" }} strokeWidth={3} />,
  forwarded: <ArrowRight className="w-2.5 h-2.5" style={{ color: "var(--status-forwarded)" }} />,
  cancelled: <X className="w-2.5 h-2.5" style={{ color: "var(--status-cancelled)" }} />,
}

const PRIORITY_COLORS: Record<Priority, { bg: string; fg: string }> = {
  A: { bg: "var(--priority-a-bg)", fg: "var(--priority-a)" },
  B: { bg: "color-mix(in oklch, var(--priority-b) 15%, transparent)", fg: "var(--priority-b)" },
  C: { bg: "var(--muted)", fg: "var(--muted-foreground)" },
}

// ── Inline add task form ────────────────────────────────────────────────────

function InlineAddTaskForm({
  goalId,
  onClose,
}: {
  goalId: string
  onClose: () => void
}) {
  const t = useTranslations("planner.weeklyCompass")
  const { addWeeklyGoalAsTask } = usePlannerStore()
  const [title, setTitle] = useState("")
  const [priority, setPriority] = useState<Priority>("A")
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
  const [date, setDate] = useState(todayStr)

  const handleSubmit = () => {
    if (!title.trim()) return
    // Create a custom task using addWeeklyGoalAsTask logic but with custom title
    const { weeklyGoals, tasks } = usePlannerStore.getState()
    const wg = weeklyGoals.find(g => g.id === goalId)
    if (!wg) return
    const samePriority = tasks.filter(t => t.priority === priority && t.date === date)
    const tempId = Math.random().toString(36).slice(2, 10)
    const newTask = {
      id: tempId,
      title: title.trim(),
      status: "pending" as const,
      priority,
      order: samePriority.length,
      roleId: wg.roleId,
      date,
      weeklyGoalId: goalId,
    }
    usePlannerStore.setState(s => ({ tasks: [...s.tasks, newTask] }))
    fetch("/api/planner/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), priority, roleId: Number(wg.roleId), date, weeklyGoalId: goalId }),
    }).then(r => r.ok ? r.json() : null).then(res => {
      if (res?.id) usePlannerStore.setState(s => ({ tasks: s.tasks.map(t => t.id === tempId ? { ...t, id: String(res.id) } : t) }))
    }).catch(() => {})
    setTitle("")
    onClose()
  }

  return (
    <div className="space-y-1.5 pt-1.5 border-t border-border/30">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("taskTitle")}
        className="h-6 text-xs bg-muted border-border"
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit()
          if (e.key === "Escape") onClose()
        }}
        autoFocus
      />
      <div className="flex items-center gap-1.5">
        {/* Priority select */}
        <div className="flex gap-0.5">
          {(["A", "B", "C"] as Priority[]).map((p) => (
            <button
              key={p}
              onClick={() => setPriority(p)}
              className={cn(
                "w-5 h-5 rounded text-xs font-bold transition-all",
                priority === p ? "ring-1 ring-offset-1 ring-offset-background" : "opacity-50 hover:opacity-80"
              )}
              style={{
                background: PRIORITY_COLORS[p].bg,
                color: PRIORITY_COLORS[p].fg,
                ...(priority === p ? { ringColor: PRIORITY_COLORS[p].fg } : {}),
              }}
            >
              {p}
            </button>
          ))}
        </div>
        {/* Date input */}
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-5 text-xs bg-muted border border-border rounded px-1 text-foreground flex-1 min-w-0"
        />
        {/* Cancel */}
        <button
          onClick={onClose}
          className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
        >
          <X className="w-2.5 h-2.5" />
        </button>
        {/* Submit */}
        <Button
          size="sm"
          className="h-5 text-xs px-2 shrink-0"
          onClick={handleSubmit}
        >
          {t("add")}
        </Button>
      </div>
    </div>
  )
}

// ── Role card ────────────────────────────────────────────────────────────────

function RoleCard({
  roleId,
  weekStart,
  urgentGoalTitle,
}: {
  roleId: string
  weekStart: string
  urgentGoalTitle?: string
}) {
  const t = useTranslations("planner.weeklyCompass")
  const tTask = useTranslations("planner.task")
  const {
    roles,
    weeklyGoals,
    tasks,
    addWeeklyGoal,
    toggleWeeklyGoal,
    deleteWeeklyGoal,
    addWeeklyGoalAsTask,
    getDdayGoals,
  } = usePlannerStore()

  const role = roles.find((r) => r.id === roleId)
  if (!role) return null

  const goals = weeklyGoals.filter(
    (g) => g.roleId === roleId && g.weekStart === weekStart
  )
  const doneCount = goals.filter((g) => g.done).length

  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState("")
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null)
  const [addingTaskForGoal, setAddingTaskForGoal] = useState<string | null>(null)

  // Compute week date range for filtering linked tasks
  const weekEndDate = (() => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 6)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  })()

  const getLinkedTasks = (goalId: string) =>
    tasks.filter(t => t.weeklyGoalId === goalId)

  const getProgress = (goalId: string) => {
    const linked = getLinkedTasks(goalId)
    return { total: linked.length, done: linked.filter(t => t.status === "done").length }
  }

  const handleAdd = () => {
    if (!draft.trim()) return
    addWeeklyGoal(roleId, draft.trim(), weekStart)
    setDraft("")
    setAdding(false)
  }

  const ddayForRole = getDdayGoals().find(
    (g) => g.roleId === roleId && g.urgent
  )

  return (
    <div
      className="rounded-lg border p-3 space-y-2.5 transition-all"
      style={{
        borderColor: ddayForRole
          ? "color-mix(in oklch, var(--status-cancelled) 50%, var(--border))"
          : urgentGoalTitle
          ? "color-mix(in oklch, var(--priority-a) 30%, var(--border))"
          : "var(--border)",
        background: ddayForRole
          ? "color-mix(in oklch, var(--status-cancelled) 5%, var(--card))"
          : "var(--card)",
        boxShadow: ddayForRole ? `0 0 0 1px color-mix(in oklch, var(--status-cancelled) 20%, transparent)` : undefined,
      }}
    >
      {/* Role header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: role.color }}
          />
          <span className="text-xs font-semibold text-foreground uppercase tracking-wide truncate">
            {role.name}
          </span>
          {ddayForRole && (
            <span
              className="text-xs font-bold px-1 rounded shrink-0"
              style={{ background: "var(--status-cancelled)", color: "#fff" }}
            >
              D-{ddayForRole.daysLeft}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-muted-foreground tabular-nums">
            {doneCount}/{goals.length}
          </span>
          <button
            onClick={() => setAdding(!adding)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Add key goal"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Role mission */}
      {role.mission && (
        <p className="text-xs text-muted-foreground italic leading-relaxed line-clamp-2 border-l-2 pl-2"
          style={{ borderColor: role.color + "60" }}>
          {role.mission}
        </p>
      )}

      {/* Key goals list */}
      <div className="space-y-1">
        {goals.length === 0 && !adding && (
          <p className="text-xs text-muted-foreground italic text-center py-1">
            {/* TODO: i18n */}
          </p>
        )}
        {goals.map((g) => {
          const isExpanded = expandedGoalId === g.id
          const progress = getProgress(g.id)
          const linkedTasks = getLinkedTasks(g.id)

          return (
            <div key={g.id} className="space-y-0">
              <div
                className={cn(
                  "group flex items-start gap-2 rounded px-2 py-1.5 transition-colors",
                  g.done ? "opacity-50" : "hover:bg-accent/40",
                  isExpanded && !g.done && "bg-accent/30"
                )}
              >
                {/* Checkbox */}
                <button
                  onClick={() => toggleWeeklyGoal(g.id)}
                  className={cn(
                    "w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 mt-px transition-colors",
                    g.done
                      ? "border-transparent"
                      : "border-muted-foreground hover:border-foreground"
                  )}
                  style={g.done ? { background: role.color } : undefined}
                  aria-label={g.done ? t("undone") : t("markDone")}
                >
                  {g.done && <Check className="w-2 h-2 text-background" />}
                </button>

                {/* Title - clickable to expand */}
                <button
                  onClick={() => {
                    if (!g.done) setExpandedGoalId(isExpanded ? null : g.id)
                  }}
                  className={cn(
                    "text-xs flex-1 leading-snug text-left",
                    g.done ? "line-through text-muted-foreground" : "text-foreground hover:underline cursor-pointer"
                  )}
                >
                  {g.title}
                </button>

                {/* Progress indicator (collapsed) + actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {!g.done && progress.total > 0 && (
                    <span
                      className="text-xs tabular-nums px-1 py-0.5 rounded"
                      style={{
                        background: progress.done === progress.total && progress.total > 0
                          ? "color-mix(in oklch, var(--status-done) 15%, transparent)"
                          : "var(--muted)",
                        color: progress.done === progress.total && progress.total > 0
                          ? "var(--status-done)"
                          : "var(--muted-foreground)",
                      }}
                    >
                      {progress.done}/{progress.total}
                    </span>
                  )}

                  {/* Expand/collapse toggle */}
                  {!g.done && (
                    <button
                      onClick={() => setExpandedGoalId(isExpanded ? null : g.id)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={isExpanded ? t("foldCompass") : t("unfoldCompass")}
                    >
                      <ChevronRight className={cn(
                        "w-2.5 h-2.5 transition-transform duration-200",
                        isExpanded && "rotate-90"
                      )} />
                    </button>
                  )}

                  {/* Delete (on hover) */}
                  {!g.done && (
                    <button
                      onClick={() => deleteWeeklyGoal(g.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                      aria-label={tTask("delete")}
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded: linked tasks + add form */}
              {isExpanded && !g.done && (
                <div className="ml-6 mr-1 mb-1.5 space-y-1 rounded-md bg-accent/20 p-2">
                  {linkedTasks.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      {t("noLinkedTasks")}
                    </p>
                  ) : (
                    <div className="space-y-0.5">
                      {linkedTasks.map((task) => (
                        <div key={task.id} className="flex items-center gap-1.5 text-xs">
                          {/* Priority badge */}
                          <span
                            className="w-4 text-center font-bold text-xs shrink-0"
                            style={{ color: PRIORITY_COLORS[task.priority].fg }}
                          >
                            {task.priority}
                          </span>
                          {/* Status icon */}
                          <span className="shrink-0">
                            {TASK_STATUS_ICON[task.status] ?? TASK_STATUS_ICON.pending}
                          </span>
                          {/* Title */}
                          <span className={cn(
                            "flex-1 truncate",
                            task.status === "done" && "line-through text-muted-foreground"
                          )}>
                            {task.title}
                          </span>
                          {/* Date */}
                          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                            {task.date.slice(5)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add daily task button / form */}
                  {addingTaskForGoal === g.id ? (
                    <InlineAddTaskForm
                      goalId={g.id}
                      onClose={() => setAddingTaskForGoal(null)}
                    />
                  ) : (
                    <button
                      onClick={() => setAddingTaskForGoal(g.id)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors pt-1"
                    >
                      <Plus className="w-2.5 h-2.5" />
                      {t("addDailyTask")}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add key goal input */}
      {adding && (
        <div className="flex gap-1.5">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("addBigRockPlaceholder")}
            className="h-7 text-xs bg-muted border-border flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd()
              if (e.key === "Escape") { setAdding(false); setDraft("") }
            }}
            autoFocus
          />
          <button
            onClick={() => { setAdding(false); setDraft("") }}
            className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
          <Button
            size="sm"
            className="h-7 text-xs px-2 shrink-0"
            onClick={handleAdd}
            style={{ background: role.color, color: "#ffffff" }}
          >
            {t("add")}
          </Button>
        </div>
      )}

      {/* Progress bar */}
      {goals.length > 0 && (
        <div className="h-0.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${goals.length === 0 ? 0 : (doneCount / goals.length) * 100}%`,
              background: role.color,
            }}
          />
        </div>
      )}
    </div>
  )
}

// ── Main export ──────────────────────────────────────────────────────────────

export function WeeklyCompass() {
  const t = useTranslations("planner.weeklyCompass")
  const { roles, getWeekBalance, getUnassignedRoles, weeklyGoals } = usePlannerStore()
  const [open, setOpen] = useState(true)

  // Get current week's Monday
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  const weekStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

  const weekBalance = getWeekBalance(weekStart)
  const unassignedRoles = getUnassignedRoles(weekStart)
  const totalWeekGoals = Object.values(weekBalance).reduce((a, b) => a + b, 0)

  return (
    <div className="px-4 py-3 flex-1">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <Compass className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            {t("weeklyCompassTitle")}
          </span>
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label={open ? t("foldCompass") : t("unfoldCompass")}
        >
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {open && (
        <div className="space-y-3">
          {/* Balance mini-bar for each role */}
          {totalWeekGoals > 0 && (
            <div className="space-y-1.5 mb-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                {t("roleBalance")}
              </p>
              {roles.map((role) => {
                const count = weekBalance[role.id] ?? 0
                return (
                  <div key={role.id} className="flex items-center gap-2">
                    <div className="flex items-center gap-1 w-16 shrink-0">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: role.color }}
                      />
                      <span className="text-xs text-muted-foreground truncate">
                        {role.name}
                      </span>
                    </div>
                    <div className="flex-1">
                      <BalanceBar
                        roleId={role.id}
                        color={role.color}
                        count={count}
                        total={totalWeekGoals}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums w-4 text-right shrink-0">
                      {count}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Nion coaching tip */}
          <NionCoachingTip unassigned={unassignedRoles.map((r) => r.name)} t={t} />

          {/* Role cards */}
          <div className="space-y-2.5 pb-4">
            {roles.map((role) => (
              <RoleCard
                key={role.id}
                roleId={role.id}
                weekStart={weekStart}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
