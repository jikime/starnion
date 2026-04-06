"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { usePlannerStore } from "@/lib/planner-store"
import { useShallow } from "zustand/react/shallow"
import { cn } from "@/lib/utils"
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { format, addDays, subDays, parseISO, isToday, isTomorrow, isYesterday } from "date-fns"
import { ko } from "date-fns/locale"

interface DateHeaderProps {
  rightSlot?: React.ReactNode
}

export function DateHeader({ rightSlot }: DateHeaderProps = {}) {
  const { selectedDate, setSelectedDate } = usePlannerStore()
  const t = useTranslations("planner.dateHeader")
  const parsed = parseISO(selectedDate)

  const goBack = () => setSelectedDate(format(subDays(parsed, 1), "yyyy-MM-dd"))
  const goForward = () => setSelectedDate(format(addDays(parsed, 1), "yyyy-MM-dd"))
  const goToday = () => setSelectedDate(format(new Date(), "yyyy-MM-dd"))

  const isCurrentToday = isToday(parsed)
  const isCurrentTomorrow = isTomorrow(parsed)
  const isCurrentYesterday = isYesterday(parsed)

  let dayLabel = ""
  if (isCurrentToday) dayLabel = t("today")
  else if (isCurrentTomorrow) dayLabel = t("tomorrow")
  else if (isCurrentYesterday) dayLabel = t("yesterday")

  const dayOfWeek = format(parsed, "EEEE", { locale: ko })
  const fullDate = format(parsed, "yyyy년 M월 d일", { locale: ko })
  const shortDate = format(parsed, "M월 d일", { locale: ko })

  return (
    <header className="relative z-0 flex items-center justify-between px-2 sm:px-4 py-2 sm:py-3 border-b border-border bg-card/50 shrink-0">
      {/* Date navigation */}
      <div className="flex items-center gap-1 sm:gap-2">
        <button
          onClick={goBack}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          aria-label={t("prevDay")}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <button className="text-sm font-semibold text-foreground hover:bg-accent/50 rounded px-1 py-0.5 transition-colors cursor-pointer">
                    <span className="hidden sm:inline">{fullDate}</span>
                    <span className="sm:hidden">{shortDate}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={parsed}
                    onSelect={(date) => { if (date) setSelectedDate(format(date, "yyyy-MM-dd")) }}
                    defaultMonth={parsed}
                  />
                </PopoverContent>
              </Popover>
              {dayLabel && (
                <span
                  className="text-xs font-semibold px-1.5 py-0.5 rounded"
                  style={{
                    background: isCurrentToday ? "var(--priority-a-bg)" : "var(--muted)",
                    color: isCurrentToday ? "var(--priority-a)" : "var(--muted-foreground)",
                  }}
                >
                  {dayLabel}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground hidden sm:block">{dayOfWeek}</p>
          </div>
        </div>

        <button
          onClick={goForward}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          aria-label={t("nextDay")}
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
            <CalendarIcon className="w-3 h-3" />
            <span className="hidden sm:inline">{t("goToday")}</span>
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
                  "flex flex-col items-center w-8 py-1 rounded transition-colors text-xs",
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
                    "w-5 h-5 flex items-center justify-center rounded-full text-xs font-semibold mt-0.5",
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
