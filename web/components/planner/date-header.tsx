"use client"

import { useState } from "react"
import { usePlannerStore } from "@/lib/planner-store"
import { cn } from "@/lib/utils"
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react"
import { format, addDays, subDays, parseISO, isToday, isTomorrow, isYesterday } from "date-fns"
import { ko } from "date-fns/locale"

interface DateHeaderProps {
  rightSlot?: React.ReactNode
}

export function DateHeader({ rightSlot }: DateHeaderProps = {}) {
  const { selectedDate, setSelectedDate } = usePlannerStore()
  const parsed = parseISO(selectedDate)

  const goBack = () => setSelectedDate(format(subDays(parsed, 1), "yyyy-MM-dd"))
  const goForward = () => setSelectedDate(format(addDays(parsed, 1), "yyyy-MM-dd"))
  const goToday = () => setSelectedDate(format(new Date(), "yyyy-MM-dd"))

  const isCurrentToday = isToday(parsed)
  const isCurrentTomorrow = isTomorrow(parsed)
  const isCurrentYesterday = isYesterday(parsed)

  let dayLabel = ""
  if (isCurrentToday) dayLabel = "오늘"
  else if (isCurrentTomorrow) dayLabel = "내일"
  else if (isCurrentYesterday) dayLabel = "어제"

  const dayOfWeek = format(parsed, "EEEE", { locale: ko })
  const fullDate = format(parsed, "yyyy년 M월 d일", { locale: ko })

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50 backdrop-blur-sm shrink-0">
      {/* Date navigation */}
      <div className="flex items-center gap-2">
        <button
          onClick={goBack}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          aria-label="이전 날"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">{fullDate}</span>
              {dayLabel && (
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  style={{
                    background: isCurrentToday ? "var(--priority-a-bg)" : "var(--muted)",
                    color: isCurrentToday ? "var(--priority-a)" : "var(--muted-foreground)",
                  }}
                >
                  {dayLabel}
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">{dayOfWeek}</p>
          </div>
        </div>

        <button
          onClick={goForward}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          aria-label="다음 날"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2">
        {rightSlot}
        {!isCurrentToday && (
          <button
            onClick={goToday}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border border-border"
          >
            <Calendar className="w-3 h-3" />
            오늘로
          </button>
        )}

        {/* Day-of-week mini strip */}
        <div className="hidden md:flex items-center gap-0.5">
          {[-3, -2, -1, 0, 1, 2, 3].map((offset) => {
            const d = addDays(parsed, offset)
            const dateStr = format(d, "yyyy-MM-dd")
            const isSelected = offset === 0
            const isTodayDay = isToday(d)
            return (
              <button
                key={offset}
                onClick={() => setSelectedDate(dateStr)}
                className={cn(
                  "flex flex-col items-center w-8 py-1 rounded transition-colors text-[9px]",
                  isSelected
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
                aria-label={format(d, "M/d")}
                aria-current={isSelected ? "date" : undefined}
              >
                <span className={cn("font-medium", isTodayDay && !isSelected && "text-primary")}>
                  {format(d, "EEE", { locale: ko }).slice(0, 1)}
                </span>
                <span
                  className={cn(
                    "w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-semibold mt-0.5",
                    isSelected && "text-foreground",
                    isTodayDay && isSelected && "bg-primary text-primary-foreground"
                  )}
                >
                  {format(d, "d")}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </header>
  )
}
