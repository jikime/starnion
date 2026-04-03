"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { AbcTaskList } from "./abc-task-list"
import { TimeBlockCalendar } from "./time-block-calendar"
import { DateHeader } from "./date-header"
import { NoteTab } from "./note-tab"
import { IntelligencePanel } from "./intelligence-panel"
import { cn } from "@/lib/utils"
import { ListTodo, BookOpen, BrainCircuit } from "lucide-react"

type DailyView = "tasks" | "note" | "intelligence"

const VIEW_IDS: DailyView[] = ["tasks", "note", "intelligence"]
const VIEW_KEYS: Record<DailyView, string> = { tasks: "tasks", note: "note", intelligence: "manage" }
const VIEW_ICONS: Record<DailyView, React.ElementType> = { tasks: ListTodo, note: BookOpen, intelligence: BrainCircuit }

export function DailyTab() {
  const t = useTranslations("planner.views")
  const [view, setView] = useState<DailyView>("tasks")

  const viewSwitcher = (
    <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5">
      {VIEW_IDS.map((id) => {
        const Icon = VIEW_ICONS[id]
        return (
          <button
            key={id}
            onClick={() => setView(id)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
              view === id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            aria-pressed={view === id}
          >
            <Icon className="w-3 h-3" />
            {t(VIEW_KEYS[id])}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-h-0">
      <DateHeader rightSlot={viewSwitcher} />

      <main className="flex flex-1 overflow-hidden min-h-0">
        {view === "tasks" && (
          <>
            <div className="flex flex-col flex-1 min-w-0 overflow-hidden border-r border-border">
              <AbcTaskList />
            </div>
            <div className="flex flex-col w-72 shrink-0 overflow-hidden">
              <TimeBlockCalendar />
            </div>
          </>
        )}

        {view === "note" && (
          <div className="flex flex-col flex-1 overflow-hidden min-h-0">
            <NoteTab embedded />
          </div>
        )}

        {view === "intelligence" && (
          <div className="flex flex-col flex-1 overflow-hidden min-h-0 max-w-xl mx-auto w-full">
            <IntelligencePanel />
          </div>
        )}
      </main>
    </div>
  )
}
