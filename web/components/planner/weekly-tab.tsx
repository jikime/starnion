"use client"

import { useState, useCallback, useMemo, memo } from "react"
import { usePlannerStore, type Priority, type Task } from "@/lib/planner-store"
import { WeeklyCompass } from "./weekly-compass"
import { cn } from "@/lib/utils"
import { format, addDays, parseISO, isToday, startOfWeek } from "date-fns"
import { ko } from "date-fns/locale"
import { ChevronLeft, ChevronRight, Plus, Check, ArrowRight, X, Circle } from "lucide-react"

// ── Status symbol cycle ────────────────────────────────────────────────────

const STATUS_CYCLE = ["pending", "in-progress", "done", "forwarded", "cancelled"] as const
type CycleStatus = typeof STATUS_CYCLE[number]

const STATUS_SYMBOLS: Record<CycleStatus, { char: string; color: string; label: string }> = {
  pending:    { char: "○", color: "var(--muted-foreground)", label: "대기" },
  "in-progress": { char: "●", color: "var(--status-in-progress)", label: "진행" },
  done:       { char: "✓", color: "var(--status-done)", label: "완료" },
  forwarded:  { char: "→", color: "var(--status-forwarded)", label: "이월" },
  cancelled:  { char: "✕", color: "var(--status-cancelled)", label: "취소" },
}

const PRIORITY_COLOR: Record<Priority, string> = {
  A: "var(--priority-a)",
  B: "var(--priority-b)",
  C: "var(--muted-foreground)",
}

// ── Day column ─────────────────────────────────────────────────────────────

const DayColumn = memo(function DayColumn({
  dateStr,
  isWeekend,
  onNavigate,
  label,
  extraDateStr,
}: {
  dateStr: string
  isWeekend: boolean
  onNavigate: (date: string) => void
  label?: string
  extraDateStr?: string
}) {
  const { tasks, addTask, updateTask, roles, selectedDate, setSelectedDate } = usePlannerStore()
  const [addingPriority, setAddingPriority] = useState<Priority | null>(null)
  const [newTitle, setNewTitle] = useState("")

  const dayTasks = useMemo(() =>
    tasks
      .filter((t) => t.date === dateStr || (extraDateStr && t.date === extraDateStr))
      .sort((a, b) => {
        const po: Record<Priority, number> = { A: 0, B: 1, C: 2 }
        if (po[a.priority] !== po[b.priority]) return po[a.priority] - po[b.priority]
        return a.order - b.order
      }),
    [tasks, dateStr, extraDateStr]
  )

  const handleAddTask = (priority: Priority) => {
    if (!newTitle.trim()) { setAddingPriority(null); return }
    addTask(priority, newTitle.trim(), roles[0]?.id ?? "")
    setNewTitle("")
    setAddingPriority(null)
  }

  const cycleStatus = (task: Task) => {
    const cur = task.status as CycleStatus
    const idx = STATUS_CYCLE.indexOf(cur)
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    updateTask(task.id, { status: next })
  }

  const parsed = parseISO(dateStr)
  const isTodayDate = isToday(parsed)
  const isSelected = dateStr === selectedDate
  const dayNum = format(parsed, "d")
  const dayName = format(parsed, "EEE", { locale: ko })

  return (
    <div
      className={cn(
        "flex flex-col border border-border rounded-md overflow-hidden h-96",
        isWeekend && "opacity-80"
      )}
      style={{ minWidth: 0 }}
    >
      {/* Day header */}
      <button
        onClick={() => { setSelectedDate(dateStr); onNavigate(dateStr) }}
        className={cn(
          "flex items-center justify-between px-2.5 py-1.5 text-left transition-colors",
          isSelected
            ? "bg-primary/10"
            : isTodayDate
            ? "bg-accent"
            : "bg-card/60 hover:bg-accent/50"
        )}
      >
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "text-xs font-medium",
              isTodayDate ? "text-primary" : isWeekend ? "text-muted-foreground" : "text-foreground"
            )}
          >
            {label || dayName}
          </span>
          <span
            className={cn(
              "text-xs font-bold tabular-nums",
              isTodayDate ? "text-primary" : "text-foreground"
            )}
          >
            {dayNum}
          </span>
          {isTodayDate && (
            <span
              className="text-xs font-bold px-1 rounded"
              style={{ background: "var(--priority-a)", color: "#ffffff" }}
            >
              오늘
            </span>
          )}
        </div>
        {/* ABC legend */}
        <div className="flex items-center gap-0.5 text-[8px] text-muted-foreground font-mono">
          {(["A", "B", "C"] as Priority[]).map((p) => {
            const count = dayTasks.filter((t) => t.priority === p).length
            return count > 0 ? (
              <span key={p} style={{ color: PRIORITY_COLOR[p] }}>{p}{count}</span>
            ) : null
          })}
        </div>
      </button>

      {/* Task rows */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border/50">
              <th className="w-5 py-1 text-center text-[8px] text-muted-foreground font-normal border-r border-border/30">○</th>
              <th className="w-5 py-1 text-center text-[8px] text-muted-foreground font-normal border-r border-border/30">ABC</th>
              <th className="py-1 px-1.5 text-left text-[8px] text-muted-foreground font-normal">업무</th>
            </tr>
          </thead>
          <tbody>
            {dayTasks.map((task) => {
              const sym = STATUS_SYMBOLS[task.status as CycleStatus] ?? STATUS_SYMBOLS.pending
              return (
                <tr
                  key={task.id}
                  className={cn(
                    "border-b border-border/20 hover:bg-accent/20 transition-colors group",
                    task.status === "done" && "opacity-50"
                  )}
                >
                  <td className="text-center border-r border-border/30 py-0.5">
                    <button
                      onClick={() => cycleStatus(task)}
                      className="w-full h-full flex items-center justify-center text-xs font-mono"
                      style={{ color: sym.color }}
                      title={sym.label}
                    >
                      {sym.char}
                    </button>
                  </td>
                  <td className="text-center border-r border-border/30">
                    <span
                      className="text-xs font-bold"
                      style={{ color: PRIORITY_COLOR[task.priority] }}
                    >
                      {task.priority}
                    </span>
                  </td>
                  <td className="px-1.5 py-0.5">
                    <span
                      className={cn(
                        "text-xs leading-snug",
                        task.status === "done" && "line-through text-muted-foreground"
                      )}
                    >
                      {task.title}
                    </span>
                  </td>
                </tr>
              )
            })}

            {/* Quick add row */}
            {addingPriority ? (
              <tr className="border-b border-border/20 bg-accent/30">
                <td className="text-center border-r border-border/30 text-xs font-bold" style={{ color: PRIORITY_COLOR[addingPriority] }}>
                  {addingPriority}
                </td>
                <td colSpan={2} className="px-1.5 py-0.5">
                  <input
                    autoFocus
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddTask(addingPriority)
                      if (e.key === "Escape") { setAddingPriority(null); setNewTitle("") }
                    }}
                    onBlur={() => handleAddTask(addingPriority)}
                    placeholder="업무 입력 후 Enter"
                    className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/60"
                  />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Add buttons */}
      <div className="flex border-t border-border/30 shrink-0">
        {(["A", "B", "C"] as Priority[]).map((p) => (
          <button
            key={p}
            onClick={() => { setAddingPriority(p); setNewTitle("") }}
            className="flex-1 py-1 text-xs font-bold hover:bg-accent/50 transition-colors text-center"
            style={{ color: PRIORITY_COLOR[p] }}
            title={`${p} 업무 추가`}
          >
            +{p}
          </button>
        ))}
      </div>
    </div>
  )
})

// ── Weekly header bar ──────────────────────────────────────────────────────

function WeekHeader({
  weekStart,
  onPrev,
  onNext,
}: {
  weekStart: string
  onPrev: () => void
  onNext: () => void
}) {
  const start = parseISO(weekStart)
  const end = addDays(start, 6)
  const label = `${format(start, "yyyy.M.d", { locale: ko })} ~ ${format(end, "M.d", { locale: ko })}`
  const monthLabel = format(start, "MMMM", { locale: ko })

  return (
    <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0 bg-card/40">
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
          {format(start, "yyyy년 M월", { locale: ko })}
        </p>
        <h2 className="text-lg font-bold text-foreground leading-tight">주간계획</h2>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onPrev}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          aria-label="이전 주"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={onNext}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          aria-label="다음 주"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ── WeeklyTab ──────────────────────────────────────────────────────────────

export function WeeklyTab({ onNavigateToDaily }: { onNavigateToDaily: () => void }) {
  const { selectedDate, setSelectedDate } = usePlannerStore()

  // Derive week start from selectedDate
  const getWeekStartFromDate = (dateStr: string) => {
    const d = parseISO(dateStr)
    const start = startOfWeek(d, { weekStartsOn: 1 }) // Monday
    return format(start, "yyyy-MM-dd")
  }

  const [weekStart, setWeekStart] = useState(() => getWeekStartFromDate(selectedDate))

  const goToPrevWeek = () => {
    const d = parseISO(weekStart)
    const prev = format(addDays(d, -7), "yyyy-MM-dd")
    setWeekStart(prev)
  }

  const goToNextWeek = () => {
    const d = parseISO(weekStart)
    const next = format(addDays(d, 7), "yyyy-MM-dd")
    setWeekStart(next)
  }

  // Build 7 day columns: Mon–Sun
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(parseISO(weekStart), i)
    const dateStr = format(d, "yyyy-MM-dd")
    const dayOfWeek = d.getDay() // 0=Sun,6=Sat
    return { dateStr, isWeekend: dayOfWeek === 0 || dayOfWeek === 6 }
  })

  const handleNavigate = (date: string) => {
    setSelectedDate(date)
    onNavigateToDaily()
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-h-0">
      <WeekHeader weekStart={weekStart} onPrev={goToPrevWeek} onNext={goToNextWeek} />
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Day grid: 2 rows layout with flexible columns */}
        <div className="flex flex-col flex-1 overflow-hidden min-h-0 p-2 sm:p-4 gap-2 sm:gap-4">
          {/* Row 1: Mon Tue Wed */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 overflow-hidden min-h-0 flex-1">
            {days.slice(0, 3).map(({ dateStr, isWeekend }) => (
              <div key={dateStr} className="flex-1 min-w-0">
                <DayColumn
                  dateStr={dateStr}
                  isWeekend={isWeekend}
                  onNavigate={handleNavigate}
                />
              </div>
            ))}
          </div>
          {/* Row 2: Thu Fri Sat+Sun */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 overflow-hidden min-h-0 flex-1">
            {days.slice(3, 5).map(({ dateStr, isWeekend }) => (
              <div key={dateStr} className="flex-1 min-w-0">
                <DayColumn
                  dateStr={dateStr}
                  isWeekend={isWeekend}
                  onNavigate={handleNavigate}
                />
              </div>
            ))}
            <div className="flex-1 min-w-0">
              <DayColumn
                dateStr={days[5].dateStr}
                isWeekend={true}
                onNavigate={handleNavigate}
                label={`${format(parseISO(days[5].dateStr), "EEE", { locale: ko })}/${format(parseISO(days[6].dateStr), "EEE", { locale: ko })}`}
                extraDateStr={days[6].dateStr}
              />
            </div>
          </div>
        </div>

        {/* Right: Weekly Compass panel */}
        <div
          className="hidden lg:block w-64 shrink-0 border-l border-border overflow-y-auto"
          style={{ background: "var(--sidebar)" }}
        >
          <div className="px-4 pt-4 pb-2">
            <h3 className="text-lg font-bold text-foreground">위클리콤파스</h3>
            <p className="text-xs text-muted-foreground mt-0.5">역할별 이번 주 목표</p>
          </div>
          <WeeklyCompass />
        </div>
      </div>
    </div>
  )
}
