"use client"

import { useTranslations } from "next-intl"
import { usePlannerStore } from "@/lib/planner-store"
import { useShallow } from "zustand/react/shallow"
import { format, parse } from "date-fns"
import { ko } from "date-fns/locale"
import { ChevronLeft, ChevronRight } from "lucide-react"

export function MonthSidebar() {
  const t = useTranslations("planner.monthNav")
  const tSidebar = useTranslations("planner.monthSidebar")
  const { selectedDate, setSelectedDate } = usePlannerStore()
  
  const currentDate = parse(selectedDate, "yyyy-MM-dd", new Date())
  const currentMonth = currentDate.getMonth()
  const currentYear = currentDate.getFullYear()

  const months = [
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
    "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"
  ]

  const handlePrevMonth = () => {
    const newDate = new Date(currentDate)
    newDate.setMonth(newDate.getMonth() - 1)
    setSelectedDate(format(newDate, "yyyy-MM-dd"))
  }

  const handleNextMonth = () => {
    const newDate = new Date(currentDate)
    newDate.setMonth(newDate.getMonth() + 1)
    setSelectedDate(format(newDate, "yyyy-MM-dd"))
  }

  const handleSelectMonth = (monthIndex: number) => {
    const newDate = new Date(currentYear, monthIndex, 1)
    setSelectedDate(format(newDate, "yyyy-MM-dd"))
  }

  return (
    <aside className="hidden sm:flex w-20 shrink-0 flex-col gap-2 items-center py-4 px-1.5 border-r border-border bg-card/50">
      {/* Year and nav */}
      <div className="flex flex-col items-center gap-1 text-center text-xs text-muted-foreground font-medium mb-2">
        <div className="flex items-center justify-center gap-0.5">
          <button
            onClick={handlePrevMonth}
            className="p-0.5 hover:bg-accent rounded transition-colors"
            aria-label={t("prevMonth")}
          >
            <ChevronLeft className="w-2.5 h-2.5" />
          </button>
          <span className="w-8 text-xs">{currentYear}</span>
          <button
            onClick={handleNextMonth}
            className="p-0.5 hover:bg-accent rounded transition-colors"
            aria-label={t("nextMonth")}
          >
            <ChevronRight className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>

      {/* Month list */}
      <div className="flex flex-col gap-1 w-full">
        {months.map((month, idx) => (
          <button
            key={idx}
            onClick={() => handleSelectMonth(idx)}
            className="py-1 px-1 rounded text-xs font-semibold transition-all"
            style={{
              background: idx === currentMonth ? "var(--primary)" : "transparent",
              color: idx === currentMonth ? "#ffffff" : "var(--muted-foreground)",
              borderRadius: "4px",
            }}
            aria-pressed={idx === currentMonth}
            aria-label={tSidebar("selectMonth", { month })}
          >
            {month}
          </button>
        ))}
      </div>

      {/* Day indicator */}
      <div className="mt-auto pt-4 border-t border-border w-full text-center">
        <div className="text-xs text-muted-foreground font-medium">
          Day
        </div>
        <div className="text-lg font-bold text-foreground">
          {format(currentDate, "d")}
        </div>
      </div>
    </aside>
  )
}
