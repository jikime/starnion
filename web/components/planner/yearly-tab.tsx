"use client"

import { useState } from "react"
import { usePlannerStore } from "@/lib/planner-store"
import { format, endOfMonth } from "date-fns"
import { cn } from "@/lib/utils"
import { ChevronLeft, ChevronRight } from "lucide-react"

// Korean holidays and 24 solar terms keyed as "MM-DD"
const KR_EVENTS: Record<string, string> = {
  "01-01": "신정",
  "02-04": "입춘",
  "03-01": "삼일절",
  "03-02": "대체공휴일",
  "03-03": "청명대보름",
  "03-08": "세계여성의날",
  "04-05": "식목일",
  "04-11": "대한민국\n임시정부수립일",
  "04-19": "4.19 혁명",
  "04-20": "장애인의날",
  "04-21": "과학의날",
  "04-25": "대체공휴일",
  "04-28": "충무공탄신일",
  "05-01": "근로자의날",
  "05-05": "어린이날",
  "05-08": "어버이날",
  "05-15": "스승의날",
  "05-18": "5.18 민주화운동·생전기날",
  "05-24": "부처님오신날",
  "05-25": "대체공휴일",
  "06-05": "환경의날",
  "06-06": "현충일",
  "06-10": "6.10 민주항쟁",
  "06-15": "조해",
  "06-17": "제헌절",
  "06-25": "6.25 전쟁일",
  "07-07": "입주",
  "07-14": "말복",
  "07-15": "광복절",
  "07-17": "제헌절",
  "08-07": "입추",
  "08-14": "말복",
  "08-15": "광복절",
  "08-17": "대체공휴일",
  "08-24": "주석연후",
  "08-25": "추석",
  "08-26": "주석연후",
  "09-01": "국군의날",
  "09-02": "노인의날",
  "09-03": "개천절",
  "09-04": "학생독립운동기념일",
  "09-05": "대체공휴일",
  "09-07": "입동",
  "09-09": "한글날",
  "09-11": "농업인의날",
  "09-25": "독도의날",
  "10-03": "개천절",
  "10-05": "대체공휴일",
  "10-07": "입동",
  "10-09": "한글날",
  "10-10": "세계정신건강일",
  "10-11": "농업인의날",
  "11-03": "학생독립운동기념일",
  "11-07": "입동",
  "11-11": "농업인의날",
  "12-10": "세계인권선언일",
  "12-22": "동지",
  "12-25": "크리스마스",
  // Lunar-based (approximate for 2026)
  "01-28": "설날연후",
  "01-29": "설날",
  "01-30": "설날연후",
  "02-16": "설날연후",
  "02-17": "설날",
  "02-18": "설날연후",
}

// 24 solar terms for 2026 (approximate)
const SOLAR_TERMS: Record<string, string> = {
  "02-04": "입춘",
  "02-19": "우수",
  "03-06": "경칩",
  "03-20": "춘분",
  "04-05": "청명",
  "04-20": "곡우",
  "05-06": "입하",
  "05-21": "소만",
  "06-06": "망종",
  "06-21": "하지",
  "07-07": "소서",
  "07-23": "대서",
  "08-07": "입추",
  "08-23": "처서",
  "09-08": "백로",
  "09-23": "추분",
  "10-08": "한로",
  "10-23": "상강",
  "11-07": "입동",
  "11-22": "소설",
  "12-07": "대설",
  "12-22": "동지",
  "01-06": "소한",
  "01-20": "대한",
}

// Public holidays (shaded pink in image)
const PUBLIC_HOLIDAYS = new Set([
  "01-01", "02-17", "02-18", "02-19",
  "03-01", "04-05", "05-01", "05-05",
  "05-06", "05-25", "06-06",
  "08-15", "08-17",
  "09-03", "09-09",
  "10-03", "10-09",
  "12-25",
])

const MONTHS_EN = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
]

function getDayOfWeek(year: number, month: number, day: number) {
  return new Date(year, month, day).getDay()
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getEventLabel(monthIdx: number, day: number): string {
  const key = `${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  return KR_EVENTS[key] || SOLAR_TERMS[key] || ""
}

function isPublicHoliday(monthIdx: number, day: number) {
  const key = `${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  return PUBLIC_HOLIDAYS.has(key)
}

export function YearlyTab() {
  const { tasks, setSelectedDate } = usePlannerStore()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())

  // Map task counts by date
  const taskCountByDate = new Map<string, number>()
  tasks.forEach((t) => {
    const prev = taskCountByDate.get(t.date) ?? 0
    taskCountByDate.set(t.date, prev + 1)
  })

  const today = format(now, "yyyy-MM-dd")

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-h-0 bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border shrink-0">
        <button
          onClick={() => setYear((y) => y - 1)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="이전 연도"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h2 className="text-base font-bold tracking-wide">{year} YEARLY PLAN</h2>
        <button
          onClick={() => setYear((y) => y + 1)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="다음 연도"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto min-h-0">
        <table
          className="border-collapse w-full text-[9.5px]"
          style={{ tableLayout: "fixed", minWidth: 900 }}
        >
          <colgroup>
            {/* Day # left */}
            <col style={{ width: 24 }} />
            {/* 12 months */}
            {Array.from({ length: 12 }).map((_, i) => (
              <col key={i} />
            ))}
            {/* Day # right */}
            <col style={{ width: 24 }} />
          </colgroup>

          <thead>
            <tr>
              <th className="border border-border bg-card/50 py-1.5" />
              {MONTHS_EN.map((m) => (
                <th
                  key={m}
                  className="border border-border bg-card/50 py-1.5 text-center font-semibold text-[10px] text-foreground"
                >
                  {m}
                </th>
              ))}
              <th className="border border-border bg-card/50 py-1.5" />
            </tr>
          </thead>

          <tbody>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((dayNum) => {
              // Determine row weekend shade based on most months
              // We check if majority of this row's valid dates are weekend
              const firstValidMonth = Array.from({ length: 12 }, (_, mi) => mi).find(
                (mi) => dayNum <= daysInMonth(year, mi)
              )
              const firstDow = firstValidMonth !== undefined
                ? getDayOfWeek(year, firstValidMonth, dayNum)
                : -1
              const isSunRow = firstDow === 0
              const isSatRow = firstDow === 6

              return (
                <tr key={dayNum}>
                  {/* Left day number */}
                  <td
                    className={cn(
                      "border border-border text-center font-medium text-muted-foreground leading-none py-0.5",
                      isSunRow && "text-destructive font-semibold",
                      isSatRow && "text-primary font-semibold"
                    )}
                  >
                    {dayNum}
                  </td>

                  {/* 12 month cells */}
                  {Array.from({ length: 12 }, (_, mi) => {
                    const maxDay = daysInMonth(year, mi)
                    if (dayNum > maxDay) {
                      return (
                        <td
                          key={mi}
                          className="border border-border"
                          style={{ background: "var(--card)" }}
                        />
                      )
                    }

                    const dow = getDayOfWeek(year, mi, dayNum)
                    const isSun = dow === 0
                    const isSat = dow === 6
                    const dateStr = `${year}-${String(mi + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`
                    const isPubHol = isPublicHoliday(mi, dayNum)
                    const eventLabel = getEventLabel(mi, dayNum)
                    const taskCount = taskCountByDate.get(dateStr) ?? 0
                    const isToday = dateStr === today

                    return (
                      <td
                        key={mi}
                        className={cn(
                          "border border-border px-1 py-0.5 h-7 cursor-pointer transition-colors hover:bg-accent/30",
                          isSun && "bg-destructive/[0.06]",
                          isSat && "bg-primary/[0.04]",
                          isPubHol && !isSun && "bg-destructive/[0.06]",
                          isToday && "ring-1 ring-inset ring-primary"
                        )}
                        onClick={() => setSelectedDate(dateStr)}
                      >
                        <div className="flex items-start justify-between gap-0.5 h-full">
                          <span
                            className={cn(
                              "leading-none flex-1 min-w-0 truncate",
                              isSun || isPubHol
                                ? "text-destructive"
                                : isSat
                                ? "text-primary"
                                : "text-muted-foreground"
                            )}
                          >
                            {eventLabel && (
                              <span className="text-[8.5px] leading-tight">{eventLabel}</span>
                            )}
                          </span>
                          {taskCount > 0 && (
                            <span
                              className="shrink-0 text-[7.5px] font-bold tabular-nums leading-none mt-0.5"
                              style={{ color: "var(--primary)" }}
                            >
                              {taskCount}
                            </span>
                          )}
                        </div>
                      </td>
                    )
                  })}

                  {/* Right day number */}
                  <td
                    className={cn(
                      "border border-border text-center font-medium text-muted-foreground leading-none py-0.5",
                      isSunRow && "text-destructive font-semibold",
                      isSatRow && "text-primary font-semibold"
                    )}
                  >
                    {dayNum}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
