"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

export type PlannerTab = "daily" | "weekly" | "monthly" | "goals" | "guide"

const TABS: { id: PlannerTab; label: string }[] = [
  { id: "daily",   label: "DAILY" },
  { id: "weekly",  label: "WEEKLY" },
  { id: "monthly", label: "MONTHLY" },
  { id: "goals",   label: "GOALS" },
  { id: "guide",   label: "GUIDE" },
]

interface TabBarProps {
  active: PlannerTab
  onChange: (tab: PlannerTab) => void
}

export function TabBar({ active, onChange }: TabBarProps) {
  return (
    <nav
      className="flex items-end gap-0 px-6 border-b border-border bg-card/60 backdrop-blur-sm shrink-0"
      role="tablist"
      aria-label="플래너 탭"
    >
      {TABS.map((tab) => {
        const isActive = tab.id === active
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative px-5 py-3 text-xs font-semibold tracking-widest transition-colors select-none",
              isActive
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
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
