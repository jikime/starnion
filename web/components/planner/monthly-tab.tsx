"use client"

import { useState } from "react"
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

const DOW_LABELS = ["일", "월", "화", "수", "목", "금", "토"]

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
      className="text-[10px]"
      style={{ background: "var(--card)", minWidth: 120 }}
    >
      <button
        className="font-semibold text-[11px] w-full text-left hover:text-primary transition-colors px-2 pt-2 pb-1"
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
  const { tasks, setSelectedDate } = usePlannerStore()
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  const rows = getCalendarDays(viewYear, viewMonth)

  // Monthly key tasks (store tasks that belong to this month)
  const monthStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`
  const monthTasks = tasks.filter((t) => t.date.startsWith(monthStr))

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
      <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrev}
            className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            aria-label="이전 달"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="text-xl font-bold text-foreground tracking-tight">
            {viewYear} {format(new Date(viewYear, viewMonth, 1), "MMMM", { locale: ko })}
          </h2>
          <button
            onClick={handleNext}
            className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            aria-label="다음 달"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={() => {
            setViewYear(today.getFullYear())
            setViewMonth(today.getMonth())
          }}
          className="text-[11px] px-3 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          오늘
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
            {DOW_LABELS.map((d, i) => (
              <div
                key={d}
                className={cn(
                  "py-2 text-center text-[11px] font-semibold tracking-wider",
                  i === 0 ? "text-destructive" : i === 6 ? "text-primary" : "text-muted-foreground"
                )}
              >
                {d}
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
                    const dayTasks = tasks.filter((t) => t.date === ds)
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
                                className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px]"
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
                              className="text-[9px] font-bold px-1 py-0.5 rounded-sm transition-colors hover:opacity-80"
                              style={{
                                background: "var(--muted)",
                                color: "var(--muted-foreground)",
                              }}
                              title="주간계획으로 이동"
                            >
                              W
                            </button>
                          )}
                        </div>

                        {/* Task dots */}
                        <div className="flex flex-wrap gap-0.5 mt-0.5">
                          {dayTasks.slice(0, 4).map((t) => (
                            <span
                              key={t.id}
                              className="w-1 h-1 rounded-full shrink-0"
                              style={{
                                background:
                                  t.status === "done"
                                    ? "var(--status-done)"
                                    : t.priority === "A"
                                    ? "var(--priority-a)"
                                    : t.priority === "B"
                                    ? "var(--priority-b)"
                                    : "var(--muted-foreground)",
                              }}
                            />
                          ))}
                          {dayTasks.length > 4 && (
                            <span className="text-[8px] text-muted-foreground leading-none">
                              +{dayTasks.length - 4}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}

                </div>
              )
            })}
          </div>
        </div>

        {/* Right: prev/next mini calendars */}
        <div className="w-36 shrink-0 border-l border-border flex flex-col">
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

      {/* Bottom: 주요업무 리스트 + 월간목표 */}
      <div className="shrink-0 border-t border-border" style={{ minHeight: 120 }}>
        <div className="grid grid-cols-2 h-full divide-x divide-border">
          {/* 주요업무 리스트 */}
          <div className="flex flex-col">
            <div className="px-4 py-2 border-b border-border text-[11px] font-semibold text-muted-foreground tracking-wider text-center">
              주요업무 리스트
            </div>
            <div className="grid grid-cols-2 divide-x divide-border flex-1">
              <div className="p-3">
                <p className="text-[10px] text-muted-foreground mb-2 font-medium">개인</p>
                {monthTasks
                  .filter((t) => t.priority === "A" && t.status !== "done")
                  .slice(0, 5)
                  .map((t) => (
                    <div key={t.id} className="text-[11px] text-foreground py-0.5 border-b border-border/50">
                      {t.title}
                    </div>
                  ))}
              </div>
              <div className="p-3">
                <p className="text-[10px] text-muted-foreground mb-2 font-medium">업무</p>
                {monthTasks
                  .filter((t) => t.priority === "B" && t.status !== "done")
                  .slice(0, 5)
                  .map((t) => (
                    <div key={t.id} className="text-[11px] text-foreground py-0.5 border-b border-border/50">
                      {t.title}
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* 월간목표 */}
          <div className="flex flex-col">
            <div className="px-4 py-2 border-b border-border text-[11px] font-semibold text-muted-foreground tracking-wider text-center">
              월간목표
            </div>
            <div className="grid grid-cols-2 divide-x divide-border flex-1">
              <div className="p-3">
                <p className="text-[10px] text-muted-foreground mb-2 font-medium">개인</p>
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-6 border-b border-border/50" />
                ))}
              </div>
              <div className="p-3">
                <p className="text-[10px] text-muted-foreground mb-2 font-medium">업무</p>
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-6 border-b border-border/50" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
