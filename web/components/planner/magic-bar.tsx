"use client"

import { useState, useCallback, useRef } from "react"
import { useTranslations } from "next-intl"
import { usePlannerStore, type Priority } from "@/lib/planner-store"
import { cn } from "@/lib/utils"
import { Zap, X, ChevronDown, Plus } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

export function MagicBar() {
  const t = useTranslations("planner.task")
  const { addTask, updateTask, roles } = usePlannerStore()
  const [title, setTitle] = useState("")
  const [priority, setPriority] = useState<Priority>("A")
  const [order, setOrder] = useState("1")
  const [roleId, setRoleId] = useState("")
  const [timeStart, setTimeStart] = useState("")
  const [timeEnd, setTimeEnd] = useState("")
  const [feedback, setFeedback] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  const commit = useCallback(() => {
    if (!title.trim()) return
    const finalRoleId = roleId || roles[0]?.id || ""

    const { tasks } = usePlannerStore.getState()
    addTask(priority, title.trim(), finalRoleId)

    const startHour = timeStart ? parseInt(timeStart) : null
    const endHour = timeEnd ? parseInt(timeEnd) : (startHour !== null ? startHour + 1 : null)
    const orderNum = order ? parseInt(order) : null
    const updates: Record<string, unknown> = {}
    if (startHour !== null) { updates.timeStart = startHour; updates.timeEnd = endHour ?? startHour + 1 }
    if (orderNum !== null) updates.order = orderNum

    if (Object.keys(updates).length > 0) {
      const newTask = usePlannerStore.getState().tasks.find(
        (t) => !tasks.find((old) => old.id === t.id) && t.title === title.trim()
      )
      if (newTask) updateTask(newTask.id, updates)
    }

    const roleName = roles.find(r => r.id === finalRoleId)?.name ?? ""
    const parts: string[] = [`${priority}${order || ""}`]
    if (roleName) parts.push(roleName)
    if (startHour !== null) parts.push(`${String(startHour).padStart(2, "0")}:00`)
    setFeedback(`[${parts.join(" · ")}] "${title.trim()}" 추가됨`)

    setTitle("")
    setOrder("1")
    setTimeStart("")
    setTimeEnd("")
    setTimeout(() => setFeedback(null), 2800)
  }, [title, priority, order, roleId, timeStart, timeEnd, roles, addTask, updateTask])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") commit()
    if (e.key === "Escape") { setTitle(""); titleRef.current?.blur() }
  }

  const timeOptions = Array.from({ length: 19 }, (_, i) => i + 5)

  return (
    <div className="px-2 sm:px-4 pt-3 pb-2 shrink-0 space-y-2">
      {/* ── Mobile layout: input full width on top, controls below ── */}
      <div className="flex sm:hidden flex-col gap-2">
        {/* Row 1: Title input + add button */}
        <div className="flex items-center gap-1.5">
          <div className="flex-1 relative">
            <Zap className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              ref={titleRef}
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setExpanded(true)}
              placeholder={t("addPlaceholder")}
              className="h-10 pl-8 pr-8 text-sm"
            />
            {title && (
              <button onClick={() => setTitle("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={commit}
            disabled={!title.trim()}
            className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0 transition-all hover:opacity-85 disabled:opacity-25"
            style={{ background: "var(--priority-a)", color: "#ffffff" }}
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Row 2: Priority + order + expand toggle */}
        <div className="flex items-center gap-1">
          {(["A", "B", "C"] as Priority[]).map(p => (
            <button
              key={p}
              onClick={() => setPriority(p)}
              className={cn(
                "w-8 h-8 rounded-md text-xs font-bold transition-all",
                priority === p ? "text-[#ffffff] shadow-sm" : "text-muted-foreground bg-muted hover:bg-accent"
              )}
              style={priority === p ? { background: p === "A" ? "var(--priority-a)" : p === "B" ? "var(--priority-b)" : "var(--muted-foreground)" } : undefined}
            >
              {p}
            </button>
          ))}
          <Input
            type="number" min={1} max={99} value={order}
            onChange={e => { const v = e.target.value.replace(/\D/g, ""); setOrder(v || "1") }}
            onKeyDown={e => { if (["e", "E", "+", "-", "."].includes(e.key)) e.preventDefault() }}
            className="w-12 h-8 text-center text-xs px-1"
          />
          <button
            onClick={() => setExpanded(v => !v)}
            className={cn("h-8 px-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors ml-auto", expanded && "bg-accent text-foreground")}
          >
            <ChevronDown className={cn("w-4 h-4 transition-transform", expanded && "rotate-180")} />
          </button>
        </div>
      </div>

      {/* ── Desktop layout: single row ── */}
      <div className="hidden sm:flex items-center gap-2">
        <div className="flex items-center gap-1 shrink-0">
          {(["A", "B", "C"] as Priority[]).map(p => (
            <button
              key={p}
              onClick={() => setPriority(p)}
              className={cn(
                "w-8 h-9 rounded-md text-xs font-bold transition-all",
                priority === p ? "text-[#ffffff] shadow-sm" : "text-muted-foreground bg-muted hover:bg-accent"
              )}
              style={priority === p ? { background: p === "A" ? "var(--priority-a)" : p === "B" ? "var(--priority-b)" : "var(--muted-foreground)" } : undefined}
            >
              {p}
            </button>
          ))}
          <Input
            type="number" min={1} max={99} value={order}
            onChange={e => { const v = e.target.value.replace(/\D/g, ""); setOrder(v || "1") }}
            onKeyDown={e => { if (["e", "E", "+", "-", "."].includes(e.key)) e.preventDefault() }}
            className="w-14 h-9 text-center text-xs px-1"
          />
        </div>
        <div className="flex-1 relative">
          <Zap className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setExpanded(true)}
            placeholder={t("addPlaceholder")}
            className="h-9 pl-8 pr-8 text-sm"
          />
          {title && (
            <button onClick={() => setTitle("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
          className={cn("h-9 px-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors", expanded && "bg-accent text-foreground")}
        >
          <ChevronDown className={cn("w-4 h-4 transition-transform", expanded && "rotate-180")} />
        </button>
        <button
          onClick={commit}
          disabled={!title.trim()}
          className="h-9 px-4 rounded-lg text-xs font-bold shrink-0 transition-all hover:opacity-85 disabled:opacity-25 disabled:cursor-not-allowed"
          style={{ background: "var(--priority-a)", color: "#ffffff" }}
        >
          {t("add")}
        </button>
      </div>

      {/* Expanded: Role + Time (shared) */}
      {expanded && (
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground shrink-0">{t("role")}</span>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger className="h-8 w-[100px] sm:w-[130px] text-xs">
                <SelectValue placeholder={t("roleNone")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("roleNone")}</SelectItem>
                {roles.map(r => (
                  <SelectItem key={r.id} value={r.id}>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} />
                      {r.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground shrink-0">{t("timeStart")}</span>
            <Select value={timeStart} onValueChange={v => { setTimeStart(v); if (!timeEnd && v && v !== "none") setTimeEnd(String(Math.min(Number(v) + 1, 23))) }}>
              <SelectTrigger className="h-8 w-[72px] sm:w-[80px] text-xs"><SelectValue placeholder="--" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">--</SelectItem>
                {timeOptions.map(h => <SelectItem key={h} value={String(h)}>{String(h).padStart(2, "0")}:00</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground shrink-0">{t("timeEnd")}</span>
            <Select value={timeEnd} onValueChange={setTimeEnd}>
              <SelectTrigger className="h-8 w-[72px] sm:w-[80px] text-xs"><SelectValue placeholder="--" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">--</SelectItem>
                {timeOptions.map(h => <SelectItem key={h} value={String(h)}>{String(h).padStart(2, "0")}:00</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {(roleId && roleId !== "none" || (timeStart && timeStart !== "none")) && (
            <div className="flex items-center gap-1 ml-auto">
              {roleId && roleId !== "none" && (() => {
                const r = roles.find(r => r.id === roleId)
                return r ? <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: `${r.color}22`, color: r.color }}>{r.name}</span> : null
              })()}
              {timeStart && timeStart !== "none" && (
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--priority-b-bg)", color: "var(--priority-b)" }}>
                  {timeStart.padStart(2, "0")}:00{timeEnd && timeEnd !== "none" ? `~${timeEnd.padStart(2, "0")}:00` : ""}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Feedback */}
      {feedback && (
        <p className="text-xs pl-1" style={{ color: "var(--status-done)" }}>{feedback}</p>
      )}
    </div>
  )
}
