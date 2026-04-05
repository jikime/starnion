"use client"

import { useState, useMemo } from "react"
import { useTranslations } from "next-intl"
import { usePlannerStore } from "@/lib/planner-store"
import { cn } from "@/lib/utils"
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  addDays,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  getWeek,
  parseISO,
} from "date-fns"
import { ko } from "date-fns/locale"
import { ChevronLeft, ChevronRight } from "lucide-react"

const DOW_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const

function getCalendarDays(year: number, month: number): Date[][] {
  const first = startOfMonth(new Date(year, month, 1))
  const last = endOfMonth(first)
  const start = startOfWeek(first, { weekStartsOn: 0 })
  const rows: Date[][] = []
  let cur = start
  while (cur <= last || rows.length < 5) {
    const row: Date[] = []
    for (let i = 0; i < 7; i++) {
      row.push(new Date(cur))
      cur = addDays(cur, 1)
    }
    rows.push(row)
    if (cur > last && rows.length >= 5) break
  }
  return rows
}

function MiniCalendar({
  year,
  month,
  onMonthClick,
}: {
  year: number
  month: number
  onMonthClick: (y: number, m: number) => void
}) {
  const rows = getCalendarDays(year, month)
  const today = new Date()
  return (
    <div
      className="text-xs"
      style={{ background: "var(--card)", minWidth: 120 }}
    >
      <button
        className="font-semibold text-xs w-full text-left hover:text-primary transition-colors px-2 pt-2 pb-1"
        style={{ color: "var(--primary)" }}
        onClick={() => onMonthClick(year, month)}
      >
        {format(new Date(year, month, 1), "MMMM", { locale: ko })}
      </button>
      <div className="grid grid-cols-7 gap-0 text-center px-2 pb-2">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} className="text-muted-foreground font-medium py-0.5">{d}</span>
        ))}
        {rows.flat().map((d, i) => {
          const inMonth = d.getMonth() === month
          const isToday = isSameDay(d, today)
          return (
            <span
              key={i}
              className={cn(
                "py-0.5 rounded-sm text-center",
                !inMonth && "opacity-30",
                isToday && "font-bold",
                d.getDay() === 0 && inMonth && "text-destructive",
                d.getDay() === 6 && inMonth && "text-primary",
              )}
            >
              {d.getDate()}
            </span>
          )
        })}
      </div>
    </div>
  )
}

interface MonthlyTabProps {
  onNavigateToDaily: (date: string) => void
  onNavigateToWeekly: (date: string) => void
  onNavigateToMonthly: (year: number, month: number) => void
}

export function MonthlyTab({
  onNavigateToDaily,
  onNavigateToWeekly,
  onNavigateToMonthly,
}: MonthlyTabProps) {
  const tDays = useTranslations("planner.monthlyDays")
  const tNav = useTranslations("planner.monthNav")
  const tMonthly = useTranslations("planner.monthly")
  const tTab = useTranslations("planner.monthlyTab")
  const { tasks, roles, getDdayGoals, setSelectedDate } = usePlannerStore()
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  const rows = useMemo(() => getCalendarDays(viewYear, viewMonth), [viewYear, viewMonth])

  // Monthly key tasks (store tasks that belong to this month)
  const monthStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`
  const monthTasks = useMemo(() => tasks.filter((t) => t.date.startsWith(monthStr)), [tasks, monthStr])

  // Pre-compute task map by date for O(1) lookup in calendar cells
  const tasksByDate = useMemo(() => {
    const map = new Map<string, typeof tasks>()
    for (const t of tasks) { const arr = map.get(t.date) ?? []; arr.push(t); map.set(t.date, arr) }
    return map
  }, [tasks])

  const prevMonthDate = subMonths(new Date(viewYear, viewMonth, 1), 1)
  const nextMonthDate = addMonths(new Date(viewYear, viewMonth, 1), 1)

  function handlePrev() {
    const d = subMonths(new Date(viewYear, viewMonth, 1), 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }

  function handleNext() {
    const d = addMonths(new Date(viewYear, viewMonth, 1), 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }

  function handleDayClick(date: Date) {
    const ds = format(date, "yyyy-MM-dd")
    setSelectedDate(ds)
    onNavigateToDaily(ds)
  }

  function handleWeekClick(date: Date) {
    const ds = format(date, "yyyy-MM-dd")
    setSelectedDate(ds)
    onNavigateToWeekly(ds)
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-h-0 bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-2 sm:px-6 py-2 sm:py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrev}
            className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            aria-label={tNav("prevMonth")}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="text-xl font-bold text-foreground tracking-tight">
            {viewYear} {format(new Date(viewYear, viewMonth, 1), "MMMM", { locale: ko })}
          </h2>
          <button
            onClick={handleNext}
            className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            aria-label={tNav("nextMonth")}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={() => {
            setViewYear(today.getFullYear())
            setViewMonth(today.getMonth())
          }}
          className="text-xs px-3 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          {tMonthly("today")}
        </button>
      </div>

      {/* Calendar area + right mini calendars */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Main calendar */}
        <div className="flex flex-col flex-1 overflow-hidden min-h-0">
          {/* DOW header */}
          <div
            className="grid shrink-0 border-b border-border"
            style={{ gridTemplateColumns: "repeat(7, 1fr)" }}
          >
            {DOW_KEYS.map((key, i) => (
              <div
                key={key}
                className={cn(
                  "py-2 text-center text-xs font-semibold tracking-wider",
                  i === 0 ? "text-destructive" : i === 6 ? "text-primary" : "text-muted-foreground"
                )}
              >
                {tDays(key)}
              </div>
            ))}
          </div>

          {/* Calendar rows */}
          <div className="flex flex-col flex-1 overflow-hidden min-h-0">
            {rows.map((row, ri) => {
              const satDate = row[6]
              const weekNum = getWeek(row[1] ?? row[0], { weekStartsOn: 1 })
              return (
                <div
                  key={ri}
                  className="grid flex-1 border-b border-border last:border-b-0 min-h-0"
                  style={{ gridTemplateColumns: "repeat(7, 1fr)" }}
                >
                  {row.map((d, di) => {
                    const inMonth = isSameMonth(d, new Date(viewYear, viewMonth, 1))
                    const isToday = isSameDay(d, today)
                    const ds = format(d, "yyyy-MM-dd")
                    const dayTasks = tasksByDate.get(ds) ?? []
                    const isSelected = false

                    return (
                      <div
                        key={di}
                        className={cn(
                          "border-r border-border last:border-r-0 p-1.5 flex flex-col gap-0.5 cursor-pointer hover:bg-accent/30 transition-colors group min-h-0",
                          !inMonth && "bg-muted/30",
                          di === 0 && "border-l-0"
                        )}
                        onClick={() => inMonth && handleDayClick(d)}
                      >
                        {/* Day number */}
                        <div className="flex items-start justify-between">
                          <span
                            className={cn(
                              "text-xs font-medium leading-none",
                              !inMonth && "text-muted-foreground/50",
                              isToday && "font-bold",
                              di === 0 && inMonth && "text-destructive",
                              di === 6 && inMonth && "text-primary"
                            )}
                          >
                            {isToday ? (
                              <span
                                className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs"
                                style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
                              >
                                {d.getDate()}
                              </span>
                            ) : (
                              d.getDate()
                            )}
                          </span>
                          {/* W badge on Saturday — click to go to weekly */}
                          {di === 6 && inMonth && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleWeekClick(d)
                              }}
                              className="hidden sm:inline-flex text-xs font-bold px-1 py-0.5 rounded-sm transition-colors hover:opacity-80"
                              style={{
                                background: "var(--muted)",
                                color: "var(--muted-foreground)",
                              }}
                              title={tMonthly("weekPlan")}
                            >
                              W
                            </button>
                          )}
                        </div>

                        {/* Task list — desktop: titles, mobile: count only */}
                        {dayTasks.length > 0 && (
                          <>
                            {/* Mobile: count badge — bottom right */}
                            <div className="sm:hidden flex-1 flex items-end justify-end">
                              <span className="text-xs font-semibold tabular-nums px-1 py-px rounded" style={{ color: "var(--primary)", background: "var(--priority-a-bg)" }}>
                                {dayTasks.length}
                              </span>
                            </div>
                            {/* Desktop: task titles */}
                            <div className="hidden sm:flex flex-col gap-px mt-0.5 overflow-hidden flex-1 min-h-0">
                              {dayTasks.slice(0, 3).map((t) => {
                                const color = t.status === "done"
                                  ? "var(--status-done)"
                                  : t.priority === "A" ? "var(--priority-a)"
                                  : t.priority === "B" ? "var(--priority-b)"
                                  : "var(--muted-foreground)"
                                return (
                                  <div
                                    key={t.id}
                                    className={cn(
                                      "flex items-center gap-1 px-1 py-px rounded text-xs truncate leading-tight",
                                      t.status === "done" && "opacity-50 line-through"
                                    )}
                                    style={{ background: `color-mix(in oklch, ${color} 15%, transparent)` }}
                                    title={`${t.priority}${t.order + 1}. ${t.title}`}
                                  >
                                    <span className="font-bold shrink-0" style={{ color }}>{t.priority}</span>
                                    <span className="truncate" style={{ color }}>{t.title}</span>
                                  </div>
                                )
                              })}
                              {dayTasks.length > 3 && (
                                <span className="text-xs text-muted-foreground px-1 leading-tight">
                                  {tTab("moreItems", { count: dayTasks.length - 3 })}
                                </span>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })}

                </div>
              )
            })}
          </div>
        </div>

        {/* Right: prev/next mini calendars */}
        <div className="hidden lg:flex w-36 shrink-0 border-l border-border flex-col">
          <MiniCalendar
            year={prevMonthDate.getFullYear()}
            month={prevMonthDate.getMonth()}
            onMonthClick={(y, m) => {
              setViewYear(y)
              setViewMonth(m)
            }}
          />
          <div className="border-t border-border" />
          <MiniCalendar
            year={nextMonthDate.getFullYear()}
            month={nextMonthDate.getMonth()}
            onMonthClick={(y, m) => {
              setViewYear(y)
              setViewMonth(m)
            }}
          />
        </div>
      </div>

      {/* Bottom: 주요 업무 + 월간 목표 */}
      <div className="border-t border-border overflow-hidden" style={{ height: "20%", minHeight: 120 }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 h-full sm:divide-x divide-border">
          {/* 주요 업무 (A 우선순위 미완료) */}
          <div className="flex flex-col">
            <div className="px-4 py-2 border-b border-border text-xs font-semibold text-muted-foreground tracking-wider text-center">
              {tMonthly("mainTasks")}
            </div>
            <div className="p-3 flex-1 overflow-y-auto">
              {monthTasks.filter((t) => t.priority === "A" && t.status !== "done").length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">{tMonthly("noATasks")}</p>
              ) : (
                monthTasks
                  .filter((t) => t.priority === "A" && t.status !== "done")
                  .slice(0, 8)
                  .map((t) => {
                    const role = roles.find((r) => r.id === t.roleId)
                    return (
                      <div key={t.id} className="flex items-center gap-2 text-xs text-foreground py-1 border-b border-border/50">
                        {role && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: role.color }} />}
                        <span className="truncate flex-1">{t.title}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{t.date.slice(5)}</span>
                      </div>
                    )
                  })
              )}
            </div>
          </div>

          {/* 월간 목표 (D-Day 역할별) */}
          <div className="flex flex-col">
            <div className="px-4 py-2 border-b border-border text-xs font-semibold text-muted-foreground tracking-wider text-center">
              {tMonthly("monthlyGoals")}
            </div>
            <div className="p-3 flex-1 overflow-y-auto">
              {getDdayGoals().length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">{tMonthly("noGoals")}</p>
              ) : (
                getDdayGoals().slice(0, 6).map((g) => {
                  const role = roles.find((r) => r.id === g.roleId)
                  return (
                    <div key={g.id} className="flex items-center gap-2 text-xs py-1 border-b border-border/50">
                      {role && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: role.color }} />}
                      <span className="truncate flex-1 text-foreground">{g.title}</span>
                      <span className={`shrink-0 font-semibold tabular-nums ${g.urgent ? "text-destructive" : "text-muted-foreground"}`}>
                        D{g.daysLeft > 0 ? `-${g.daysLeft}` : g.daysLeft === 0 ? "-Day" : `+${Math.abs(g.daysLeft)}`}
                      </span>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
