"use client"

import { usePlannerStore } from "@/lib/planner-store"
import { useShallow } from "zustand/react/shallow"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { useState } from "react"

const HOUR_HEIGHT = 56 // px per hour
const START_HOUR = 5
const END_HOUR = 24

const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => i + START_HOUR)

const PRIORITY_COLORS = {
  A: { bg: "var(--priority-a-bg)", border: "var(--priority-a)", text: "var(--priority-a)" },
  B: { bg: "var(--priority-b-bg)", border: "var(--priority-b)", text: "var(--priority-b)" },
  C: { bg: "var(--priority-c-bg)", border: "var(--priority-c)", text: "var(--priority-c)" },
}

function pad(n: number) {
  return String(n).padStart(2, "0")
}

export function TimeBlockCalendar() {
  const t = useTranslations("planner.timeBlock")
  const { selectedDate, getTasksForDate, roles } = usePlannerStore()
  const allTasks = getTasksForDate(selectedDate)
  const timedTasks = allTasks.filter(
    (t) => t.timeStart !== undefined && t.timeEnd !== undefined
  )

  // Detect current hour for "now" indicator
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  const currentHour = now.getHours() + now.getMinutes() / 60
  const showNow =
    selectedDate === todayStr &&
    currentHour >= START_HOUR &&
    currentHour < END_HOUR

  const nowOffset = (currentHour - START_HOUR) * HOUR_HEIGHT

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 pt-3 pb-2 shrink-0 border-b border-border">
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
          {t("title")}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 opacity-70">
          {t("timeBlockHint1")}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <div
          className="relative"
          style={{ height: HOUR_HEIGHT * (END_HOUR - START_HOUR) }}
        >
          {/* Hour grid lines */}
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="absolute left-0 right-0 flex items-start"
              style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}
            >
              {/* Hour label */}
              <span className="text-xs text-muted-foreground w-10 shrink-0 tabular-nums leading-none pt-px">
                {pad(hour)}:00
              </span>
              {/* Grid line */}
              <div className="flex-1 h-px bg-border/50 mt-1.5" />
            </div>
          ))}

          {/* Half-hour dotted lines */}
          {HOURS.map((hour) => (
            <div
              key={`half-${hour}`}
              className="absolute left-10 right-0 h-px"
              style={{
                top: (hour - START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2,
                borderTop: "1px dashed",
                borderColor: "var(--border)",
                opacity: 0.35,
              }}
            />
          ))}

          {/* Now indicator */}
          {showNow && (
            <div
              className="absolute left-0 right-0 z-10 flex items-center gap-1"
              style={{ top: nowOffset }}
            >
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: "var(--status-cancelled)", marginLeft: 36 }}
              />
              <div
                className="flex-1 h-px"
                style={{ background: "var(--status-cancelled)", opacity: 0.7 }}
              />
            </div>
          )}

          {/* Task blocks */}
          {timedTasks.map((task) => {
            const top = (task.timeStart! - START_HOUR) * HOUR_HEIGHT
            const height = Math.max(
              (task.timeEnd! - task.timeStart!) * HOUR_HEIGHT - 4,
              20
            )
            const role = roles.find((r) => r.id === task.roleId)
            const colors = PRIORITY_COLORS[task.priority]
            const isDone = task.status === "done"
            const isCancelled = task.status === "cancelled"

            return (
              <div
                key={task.id}
                className={cn(
                  "absolute left-11 right-1 rounded-md px-2 py-1 cursor-default transition-opacity",
                  (isDone || isCancelled) && "opacity-40"
                )}
                style={{
                  top: top + 2,
                  height,
                  background: colors.bg,
                  borderLeft: `2px solid ${colors.border}`,
                }}
                title={`${task.title} (${pad(task.timeStart!)}:00 – ${pad(task.timeEnd!)}:00)`}
              >
                <div className="flex items-center gap-1.5 h-full overflow-hidden">
                  {/* Priority badge */}
                  <span
                    className="text-xs font-bold shrink-0"
                    style={{ color: colors.text }}
                  >
                    {task.priority}
                  </span>

                  {/* Title */}
                  <span
                    className={cn(
                      "text-xs font-medium truncate leading-tight",
                      isDone && "line-through",
                      isCancelled && "line-through"
                    )}
                    style={{ color: colors.text }}
                  >
                    {task.title}
                  </span>

                  {/* Role dot */}
                  {role && height > 24 && (
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0 ml-auto"
                      style={{ background: role.color }}
                    />
                  )}
                </div>

                {/* Time label for taller blocks */}
                {height > 44 && (
                  <p className="text-xs mt-0.5" style={{ color: colors.text, opacity: 0.7 }}>
                    {pad(task.timeStart!)}:00 – {pad(task.timeEnd!)}:00
                  </p>
                )}
              </div>
            )
          })}

          {/* Empty state */}
          {timedTasks.length === 0 && (
            <div
              className="absolute left-11 right-1 flex items-center justify-center"
              style={{ top: (9 - START_HOUR) * HOUR_HEIGHT, height: HOUR_HEIGHT * 4 }}
            >
              <div className="text-center space-y-1">
                <p className="text-xs text-muted-foreground">{t("empty")}</p>
                <p className="text-xs text-muted-foreground opacity-60">
                  {t("timeBlockHint2")}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
