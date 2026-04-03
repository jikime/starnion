"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Wrench, Loader2, Check, FileText, Terminal, Zap, ChevronDown, ChevronRight, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ToolEvent } from "@/hooks/use-chat"

function toolIcon(name: string) {
  const n = name.toLowerCase()
  if (/read|file|get|view|fetch|load|open/.test(n)) return FileText
  if (/exec|run|bash|shell|command|execute|process/.test(n)) return Terminal
  return Wrench
}

export function ToolEventCard({ event }: { event: ToolEvent }) {
  const [expanded, setExpanded] = useState(false)
  const Icon = toolIcon(event.tool)
  const hasDetail = !!(event.input || event.result)

  return (
    <div className="tool-event-card">
      <button
        className="tool-event-card-row"
        onClick={() => hasDetail && setExpanded(!expanded)}
        disabled={!hasDetail}
      >
        <Icon className="tool-event-icon" />
        <span className="tool-event-name">{event.tool}</span>
        <span className="tool-event-status">
          {event.status === "running" && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
          {event.status === "done"    && <Check className="size-3 text-emerald-400" />}
          {event.status === "error"   && <AlertCircle className="size-3 text-destructive" />}
        </span>
        {hasDetail && (
          expanded
            ? <ChevronDown className="size-3 text-muted-foreground/60" />
            : <ChevronRight className="size-3 text-muted-foreground/60" />
        )}
      </button>
      {expanded && hasDetail && (
        <div className="tool-event-detail">
          {event.input && (
            <pre className="tool-event-pre">{event.input}</pre>
          )}
          {event.result && (
            <pre className={cn("tool-event-pre mt-1", event.isError && "text-destructive")}>
              {event.result}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

export function ToolEventGroup({ events, streaming }: { events: ToolEvent[]; streaming?: boolean }) {
  const t = useTranslations("chat")
  const isRunning = events.some(e => e.status === "running")
  const doneCount = events.filter(e => e.status !== "running").length
  // Show expanded while streaming, collapsed when done
  const [open, setOpen] = useState(!!streaming)

  // Auto-collapse when streaming ends
  useEffect(() => {
    if (!streaming) setOpen(false)
  }, [streaming])

  if (events.length === 0) return null

  return (
    <div className="tool-event-group not-prose">
      <button
        className="tool-event-group-header w-full text-left cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => setOpen(v => !v)}
      >
        <Zap className="size-3.5 text-amber-400" />
        <span className="tool-event-group-label">
          {isRunning
            ? t("toolRunning", { done: doneCount, total: events.length })
            : t("toolCompleted", { count: events.length })}
        </span>
        {open
          ? <ChevronDown className="size-3 text-muted-foreground/60 ml-auto" />
          : <ChevronRight className="size-3 text-muted-foreground/60 ml-auto" />
        }
      </button>
      {open && (
        <div className="tool-event-list">
          {events.map((ev, i) => (
            <ToolEventCard key={i} event={ev} />
          ))}
        </div>
      )}
    </div>
  )
}
