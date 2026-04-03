"use client"

import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

export type PlannerTab = "daily" | "weekly" | "monthly" | "goals" | "guide"

const TAB_IDS: PlannerTab[] = ["daily", "weekly", "monthly", "goals", "guide"]
const TAB_KEYS: Record<PlannerTab, string> = {
  daily: "daily", weekly: "weekly", monthly: "monthly", goals: "goals", guide: "compass",
}

interface TabBarProps {
  active: PlannerTab
  onChange: (tab: PlannerTab) => void
}

export function TabBar({ active, onChange }: TabBarProps) {
  const t = useTranslations("planner.tabs")

  return (
    <nav
      className="flex items-end gap-0 px-2 sm:px-6 border-b border-border bg-card/60 backdrop-blur-sm shrink-0 overflow-x-auto"
      role="tablist"
      aria-label="Planner tabs"
    >
      {TAB_IDS.map((id) => {
        const isActive = id === active
        return (
          <button
            key={id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(id)}
            className={cn(
              "relative px-3 sm:px-5 py-3 text-xs font-semibold tracking-widest transition-colors select-none whitespace-nowrap",
              isActive
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t(TAB_KEYS[id])}
            {isActive && (
              <span
                className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full"
                style={{ background: "var(--primary)" }}
              />
            )}
          </button>
        )
      })}
    </nav>
  )
}
