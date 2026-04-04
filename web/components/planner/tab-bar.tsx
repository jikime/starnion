"use client"

import { useState, useRef, useEffect } from "react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { ChevronDown } from "lucide-react"

export type PlannerTab = "daily" | "weekly" | "monthly" | "goals" | "guide"

const TAB_IDS: PlannerTab[] = ["daily", "weekly", "monthly", "goals", "guide"]
const TAB_KEYS: Record<PlannerTab, string> = {
  daily: "daily", weekly: "weekly", monthly: "monthly", goals: "goals", guide: "compass",
}

// First 3 tabs always visible, rest go to overflow menu on mobile
const VISIBLE_COUNT = 3

interface TabBarProps {
  active: PlannerTab
  onChange: (tab: PlannerTab) => void
}

export function TabBar({ active, onChange }: TabBarProps) {
  const t = useTranslations("planner.tabs")
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const visibleTabs = TAB_IDS.slice(0, VISIBLE_COUNT)
  const overflowTabs = TAB_IDS.slice(VISIBLE_COUNT)
  const isOverflowActive = overflowTabs.includes(active)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    if (menuOpen) document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [menuOpen])

  const tabButton = (id: PlannerTab, extraClass?: string) => {
    const isActive = id === active
    return (
      <button
        key={id}
        role="tab"
        aria-selected={isActive}
        onClick={() => { onChange(id); setMenuOpen(false) }}
        className={cn(
          "relative px-3 sm:px-5 py-3 text-xs font-semibold tracking-widest transition-colors select-none whitespace-nowrap",
          isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          extraClass,
        )}
      >
        {t(TAB_KEYS[id])}
        {isActive && (
          <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full" style={{ background: "var(--primary)" }} />
        )}
      </button>
    )
  }

  return (
    <nav
      className="relative z-10 flex items-end gap-0 px-2 sm:px-6 border-b border-border bg-card/60 shrink-0"
      role="tablist"
      aria-label="Planner tabs"
    >
      {/* Desktop: all tabs visible */}
      <div className="hidden sm:flex items-end">
        {TAB_IDS.map(id => tabButton(id))}
      </div>

      {/* Mobile: first 3 + overflow dropdown */}
      <div className="flex sm:hidden items-end flex-1">
        {visibleTabs.map(id => tabButton(id))}

        {/* Overflow menu */}
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen(v => !v)}
            className={cn(
              "relative flex items-center gap-1 px-3 py-3 text-xs font-semibold tracking-widest transition-colors select-none whitespace-nowrap",
              isOverflowActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {isOverflowActive ? t(TAB_KEYS[active]) : t("more" as any) || "..."}
            <ChevronDown className={cn("w-3 h-3 transition-transform", menuOpen && "rotate-180")} />
            {isOverflowActive && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full" style={{ background: "var(--primary)" }} />
            )}
          </button>

          {menuOpen && (
            <div className="absolute top-full -left-4 mt-1 min-w-[120px] rounded-lg border border-border bg-card shadow-xl z-[9999] py-1">
              {overflowTabs.map(id => (
                <button
                  key={id}
                  onClick={() => { onChange(id); setMenuOpen(false) }}
                  className={cn(
                    "w-full text-left px-4 py-2 text-xs font-medium transition-colors",
                    active === id ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  {t(TAB_KEYS[id])}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
