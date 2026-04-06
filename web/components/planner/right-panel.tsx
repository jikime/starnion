"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { usePlannerStore, type Priority, type Task } from "@/lib/planner-store"
import { useShallow } from "zustand/react/shallow"
import { cn } from "@/lib/utils"
import {
  Plus, Trash2, ArrowRight, Inbox, MessageSquare, BarChart2, X,
  Clock3, BookMarked,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type Tab = "inbox" | "diary" | "timeline" | "stats"

const PRIORITY_CONFIG = {
  A: {
    badgeStyle: {
      background: "var(--priority-a-bg)",
      color: "var(--priority-a)",
      border: "1px solid var(--priority-a)",
    } as React.CSSProperties,
  },
  B: {
    badgeStyle: {
      background: "var(--priority-b-bg)",
      color: "var(--priority-b)",
      border: "1px solid var(--priority-b)",
    } as React.CSSProperties,
  },
  C: {
    badgeStyle: {
      background: "var(--priority-c-bg)",
      color: "var(--priority-c)",
      border: "1px solid var(--priority-c)",
    } as React.CSSProperties,
  },
}

const REFLECTION_PROMPT_KEYS = ["reflectQ1", "reflectQ2", "reflectQ3", "reflectQ4Extra"] as const

const MOOD_KEYS = ["great", "good", "neutral", "tired", "rough"] as const
const MOOD_SYMBOLS: Record<string, string> = {
  great: "★★★", good: "★★", neutral: "★", tired: "△", rough: "▽",
}

// ─── Nion End-of-Day Popup ────────────────────────────────────────────────────

function NionPopup({ onClose }: { onClose: () => void }) {
  const t = useTranslations("planner.rightPanel")
  const { selectedDate, getTasksForDate, forwardTask, updateTask } = usePlannerStore()
  const tasks = getTasksForDate(selectedDate)
  const remaining = tasks.filter(
    (t) => t.priority !== "C" && (t.status === "pending" || t.status === "in-progress")
  )

  const [decisions, setDecisions] = useState<Record<string, "forward" | "cancel" | null>>(
    Object.fromEntries(remaining.map((t) => [t.id, null]))
  )

  const allDecided = remaining.every((t) => decisions[t.id] !== null)

  const handleApply = () => {
    remaining.forEach((t) => {
      if (decisions[t.id] === "forward") forwardTask(t.id)
      else if (decisions[t.id] === "cancel") updateTask(t.id, { status: "cancelled" })
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end p-4 pointer-events-none">
      <div
        className="pointer-events-auto w-80 rounded-xl border border-border bg-card shadow-2xl overflow-hidden"
        style={{ boxShadow: "0 0 0 1px var(--border), 0 24px 64px rgba(0,0,0,0.5)" }}
      >
        <div
          className="px-4 py-3 flex items-center justify-between"
          style={{ background: "var(--priority-a-bg)", borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-2">
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: "var(--priority-a)", color: "#ffffff" }}
            >
              N
            </span>
            <div>
              <p className="text-xs font-semibold text-foreground">{t("nionTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("nionSubtitle")}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors" aria-label={t("closeLabel")}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-3 space-y-2 max-h-72 overflow-y-auto">
          {remaining.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">{t("allTasksDone")}</p>
          ) : (
            remaining.map((task) => (
              <div key={task.id} className="border border-border rounded-lg p-2.5 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-bold px-1 rounded shrink-0 mt-px" style={PRIORITY_CONFIG[task.priority].badgeStyle}>
                    {task.priority}
                  </span>
                  <p className="text-xs text-foreground leading-snug flex-1">{task.title}</p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setDecisions((d) => ({ ...d, [task.id]: "forward" }))}
                    className={cn(
                      "flex items-center gap-1 flex-1 h-6 rounded text-xs justify-center font-medium transition-colors border",
                      decisions[task.id] === "forward" ? "text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                    )}
                    style={decisions[task.id] === "forward" ? { background: "var(--status-forwarded)", color: "#ffffff", borderColor: "var(--status-forwarded)" } : undefined}
                  >
                    <ArrowRight className="w-3 h-3" />
                    {t("forwardTomorrow")}
                  </button>
                  <button
                    onClick={() => setDecisions((d) => ({ ...d, [task.id]: "cancel" }))}
                    className={cn(
                      "flex items-center gap-1 flex-1 h-6 rounded text-xs justify-center font-medium transition-colors border",
                      decisions[task.id] === "cancel" ? "text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                    )}
                    style={decisions[task.id] === "cancel" ? { background: "var(--status-cancelled)", color: "#fff", borderColor: "var(--status-cancelled)" } : undefined}
                  >
                    <X className="w-3 h-3" />
                    {t("cancelTask")}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-3 border-t border-border flex items-center gap-2">
          <Button
            className="flex-1 h-8 text-xs"
            style={{ background: "var(--priority-a)", color: "#ffffff" }}
            disabled={!allDecided && remaining.length > 0}
            onClick={handleApply}
          >
            {remaining.length === 0 ? t("closeLabel") : t("apply")}
          </Button>
          <Button variant="ghost" className="h-8 text-xs text-muted-foreground" onClick={onClose}>
            {t("later")}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Inbox Panel ──────────────────────────────────────────────────────────────

function InboxPanel() {
  const t = useTranslations("planner.rightPanel")
  const tTask = useTranslations("planner.task")
  const { inboxTasks, addInboxTask, moveInboxToTasks, deleteInboxTask, roles } = usePlannerStore()
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newRoleId, setNewRoleId] = useState(roles[0]?.id ?? "")
  const [moveTarget, setMoveTarget] = useState<Record<string, Priority>>({})

  const handleAdd = () => {
    if (!newTitle.trim()) { setAdding(false); return }
    addInboxTask(newTitle.trim(), newRoleId || roles[0]?.id)
    setNewTitle("")
    setAdding(false)
  }

  const handleMove = (id: string) => {
    const priority = moveTarget[id] ?? "B"
    moveInboxToTasks(id, priority)
    const next = { ...moveTarget }
    delete next[id]
    setMoveTarget(next)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Inbox className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">{t("inboxLabel")}</span>
          {inboxTasks.length > 0 && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ background: "var(--priority-a-bg)", color: "var(--priority-a)" }}>
              {inboxTasks.length}
            </span>
          )}
        </div>
        <button onClick={() => setAdding(!adding)} className="text-muted-foreground hover:text-foreground transition-colors" aria-label={t("inboxAddTask")}>
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {adding && (
        <div className="px-4 py-2.5 border-b border-border bg-accent/20 space-y-2 shrink-0">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={t("inputPlaceholder")}
            className="h-7 text-xs bg-muted border-border"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd()
              if (e.key === "Escape") { setAdding(false); setNewTitle("") }
            }}
            autoFocus
          />
          <div className="flex gap-2">
            <Select value={newRoleId} onValueChange={setNewRoleId}>
              <SelectTrigger className="h-6 text-xs bg-muted border-border flex-1">
                <SelectValue placeholder={tTask("role")} />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id} className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: r.color }} />
                      {r.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button onClick={handleAdd} className="h-6 px-2 rounded text-xs font-medium shrink-0 hover:opacity-80 transition-opacity" style={{ background: "var(--priority-a)", color: "#ffffff" }}>
              {tTask("add")}
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5">
        {inboxTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 py-8">
            <Inbox className="w-8 h-8 text-muted-foreground opacity-30" />
            <p className="text-xs text-muted-foreground text-center">
              {t("inboxEmpty")}
              <br />
              <span className="text-xs opacity-60">{t("inboxEmptyHint")}</span>
            </p>
          </div>
        ) : (
          inboxTasks.map((task) => {
            const role = roles.find((r) => r.id === task.roleId)
            const targetPriority = moveTarget[task.id] ?? "B"
            return (
              <div key={task.id} className="group border border-border rounded-md px-3 py-2 hover:bg-accent/30 transition-colors">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground leading-snug">{task.title}</p>
                    {role && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: role.color }} />
                        <span className="text-xs text-muted-foreground">{role.name}</span>
                      </div>
                    )}
                  </div>
                  <button onClick={() => deleteInboxTask(task.id)} className="text-muted-foreground opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity shrink-0 mt-0.5" aria-label={tTask("delete")}>
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Select value={targetPriority} onValueChange={(v) => setMoveTarget((prev) => ({ ...prev, [task.id]: v as Priority }))}>
                    <SelectTrigger className="h-5 text-xs bg-muted border-border w-16">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      {(["A", "B", "C"] as Priority[]).map((p) => (
                        <SelectItem key={p} value={p} className="text-xs">
                          <span style={PRIORITY_CONFIG[p].badgeStyle} className="px-1 rounded">{p}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button onClick={() => handleMove(task.id)} className="flex items-center gap-1 h-5 px-2 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                    <ArrowRight className="w-2.5 h-2.5" />
                    {t("toTask")}
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="px-4 py-2 border-t border-border shrink-0">
        <p className="text-xs text-muted-foreground italic leading-snug">
          &ldquo;{t("inboxQuote")}&rdquo;
        </p>
      </div>
    </div>
  )
}

// ─── Diary Panel (merged Reflection + mood + one-liner) ───────────────────────

function DiaryPanel() {
  const t = useTranslations("planner.rightPanel")
  const tJournal = useTranslations("planner.journal")
  const tMood = useTranslations("planner.mood")
  const { selectedDate, diaryEntries, setDiaryEntry, reflectionNotes, setReflectionNote } = usePlannerStore()
  const entry = diaryEntries[selectedDate]
  const legacyNote = reflectionNotes[selectedDate] ?? ""

  const [oneLiner, setOneLiner] = useState(entry?.oneLiner ?? "")
  const [mood, setMood] = useState(entry?.mood ?? "neutral")
  const [fullNote, setFullNote] = useState(entry?.fullNote ?? legacyNote)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const e = diaryEntries[selectedDate]
    setOneLiner(e?.oneLiner ?? "")
    setMood(e?.mood ?? "neutral")
    setFullNote(e?.fullNote ?? reflectionNotes[selectedDate] ?? "")
  }, [selectedDate, diaryEntries, reflectionNotes])

  const handleSave = () => {
    setDiaryEntry(selectedDate, { oneLiner, mood, fullNote })
    setReflectionNote(selectedDate, fullNote)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <BookMarked className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-foreground">{t("diaryTitle")}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Mood picker */}
        <div className="space-y-1.5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{t("todayCondition")}</p>
          <div className="flex gap-1.5">
            {MOOD_KEYS.map((key) => (
              <button
                key={key}
                onClick={() => setMood(key)}
                className={cn(
                  "flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg border text-xs transition-all",
                  mood === key ? "border-transparent" : "border-border bg-muted/40 text-muted-foreground"
                )}
                style={mood === key ? { background: "var(--priority-a-bg)", color: "var(--priority-a)", border: "1px solid var(--priority-a)" } : {}}
              >
                <span className="text-sm leading-none">{MOOD_SYMBOLS[key]}</span>
                <span>{tMood(key)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* One-liner */}
        <div className="space-y-1.5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{t("todayOneLiner")}</p>
          <Input
            value={oneLiner}
            onChange={(e) => setOneLiner(e.target.value)}
            placeholder={t("oneLinerPlaceholder")}
            className="h-8 text-xs bg-muted border-border"
            maxLength={80}
          />
          <p className="text-xs text-muted-foreground text-right">{oneLiner.length}/80</p>
        </div>

        {/* Reflection prompts */}
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{t("reflectionQuestions")}</p>
          <div className="space-y-1">
            {REFLECTION_PROMPT_KEYS.map((key, i) => {
              const prompt = tJournal(key)
              return (
                <div
                  key={key}
                  className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-accent/30 transition-colors cursor-pointer"
                  onClick={() => {
                    const prefix = `${i + 1}. ${prompt}\n`
                    if (!fullNote.includes(prompt)) {
                      setFullNote((d) => (d ? `${d}\n\n${prefix}` : prefix))
                    }
                  }}
                >
                  <span className="w-4 h-4 rounded text-xs font-bold flex items-center justify-center shrink-0 mt-px" style={{ background: "var(--priority-a-bg)", color: "var(--priority-a)" }}>
                    {i + 1}
                  </span>
                  <p className="text-xs text-muted-foreground leading-snug">{prompt}</p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Full note */}
        <div className="space-y-1.5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{t("freeRecord")}</p>
          <Textarea
            value={fullNote}
            onChange={(e) => setFullNote(e.target.value)}
            placeholder={t("freeRecordPlaceholder")}
            rows={8}
            className="text-xs resize-none bg-muted border-border text-foreground leading-relaxed"
          />
        </div>
      </div>

      <div className="px-4 py-3 border-t border-border shrink-0 flex items-center justify-between">
        <p className={cn("text-xs transition-opacity duration-300", saved ? "opacity-100" : "opacity-0")} style={{ color: "var(--status-done)" }}>
          {t("savedMessage")}
        </p>
        <Button size="sm" className="h-7 text-xs px-3" style={{ background: "var(--priority-a)", color: "#ffffff" }} onClick={handleSave}>
          {t("save")}
        </Button>
      </div>
    </div>
  )
}

// ─── Timeline Panel ───────────────────────────────────────────────────────────

function TimelinePanel() {
  const t = useTranslations("planner.rightPanel")
  const tMood = useTranslations("planner.mood")
  const { tasks, diaryEntries, goals, roles, getDdayGoals } = usePlannerStore()
  const ddayGoals = getDdayGoals()

  // Build last 7 days timeline
  const days: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`)
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  const tDays = useTranslations("planner.monthlyDays")
  const dayLabel = (dateStr: string) => {
    const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const
    return tDays(dayKeys[new Date(dateStr).getDay()])
  }

  const STATUS_COLORS: Record<string, string> = {
    done: "var(--status-done)",
    "in-progress": "var(--status-in-progress)",
    forwarded: "var(--status-forwarded)",
    cancelled: "var(--status-cancelled)",
    delegated: "var(--status-delegated)",
    pending: "var(--muted-foreground)",
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <Clock3 className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-foreground">{t("timelineTitle")}</span>
        <span className="text-xs text-muted-foreground ml-auto">{t("last7days")}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
        {/* Upcoming D-Day Goals */}
        {ddayGoals.filter((g) => g.daysLeft >= 0 && g.daysLeft <= 30).length > 0 && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{t("ddayGoals")}</p>
            <div className="space-y-1.5">
              {ddayGoals.filter((g) => g.daysLeft >= 0 && g.daysLeft <= 30).map((goal) => {
                const role = roles.find((r) => r.id === goal.roleId)
                return (
                  <div
                    key={goal.id}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-lg border"
                    style={{
                      borderColor: goal.urgent ? "color-mix(in oklch, var(--status-cancelled) 40%, var(--border))" : "var(--border)",
                      background: goal.urgent ? "var(--priority-a-bg)" : "var(--card)",
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{goal.title}</p>
                      {role && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: role.color }} />
                          <span className="text-xs text-muted-foreground">{role.name}</span>
                        </div>
                      )}
                    </div>
                    <span
                      className="text-xs font-bold tabular-nums shrink-0"
                      style={{ color: goal.urgent ? "var(--status-cancelled)" : "var(--priority-a)" }}
                    >
                      D-{goal.daysLeft}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Daily timeline */}
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{t("dailyRecord")}</p>
          <div className="space-y-4">
            {[...days].reverse().map((dateStr) => {
              const dayTasks = tasks.filter((t) => t.date === dateStr)
              const diary = diaryEntries[dateStr]
              const doneTasks = dayTasks.filter((t) => t.status === "done")
              const total = dayTasks.length
              const pct = total > 0 ? Math.round((doneTasks.length / total) * 100) : 0
              const isToday = dateStr === days[days.length - 1]

              if (total === 0 && !diary) return null

              return (
                <div key={dateStr} className="relative pl-5">
                  {/* Timeline line */}
                  <div className="absolute left-1.5 top-4 bottom-0 w-px bg-border" />
                  {/* Timeline dot */}
                  <div
                    className="absolute left-0 top-2.5 w-3 h-3 rounded-full border-2 shrink-0"
                    style={{
                      background: isToday ? "var(--priority-a)" : pct >= 70 ? "var(--status-done)" : "var(--muted)",
                      borderColor: isToday ? "var(--priority-a)" : pct >= 70 ? "var(--status-done)" : "var(--border)",
                    }}
                  />

                  <div className="space-y-1.5 pb-3">
                    {/* Date header */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-foreground">
                        {formatDate(dateStr)} ({dayLabel(dateStr)})
                      </span>
                      {isToday && (
                        <span className="text-xs px-1 rounded font-medium" style={{ background: "var(--priority-a)", color: "#ffffff" }}>
                          {t("today")}
                        </span>
                      )}
                      {total > 0 && (
                        <span className="text-xs text-muted-foreground ml-auto">
                          {t("doneOfTotal", { done: doneTasks.length, total })}
                        </span>
                      )}
                    </div>

                    {/* Progress bar */}
                    {total > 0 && (
                      <div className="h-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            background: pct >= 70 ? "var(--status-done)" : "var(--priority-a)",
                          }}
                        />
                      </div>
                    )}

                    {/* Task dots */}
                    {total > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {dayTasks.slice(0, 8).map((t) => (
                          <span
                            key={t.id}
                            className="text-xs px-1.5 py-0.5 rounded truncate max-w-[120px]"
                            style={{
                              background: `color-mix(in oklch, ${STATUS_COLORS[t.status]} 15%, var(--muted))`,
                              color: STATUS_COLORS[t.status],
                              border: `1px solid color-mix(in oklch, ${STATUS_COLORS[t.status]} 30%, var(--border))`,
                            }}
                            title={t.title}
                          >
                            {t.priority} {t.title}
                          </span>
                        ))}
                        {total > 8 && (
                          <span className="text-xs text-muted-foreground">{t("moreItems", { count: total - 8 })}</span>
                        )}
                      </div>
                    )}

                    {/* Diary snippet */}
                    {diary?.oneLiner && (
                      <div
                        className="flex items-start gap-1.5 px-2 py-1.5 rounded-md"
                        style={{ background: "color-mix(in oklch, var(--priority-a) 6%, var(--muted))", border: "1px solid var(--border)" }}
                      >
                        <BookMarked className="w-2.5 h-2.5 shrink-0 mt-0.5" style={{ color: "var(--priority-a)" }} />
                        <p className="text-xs text-foreground leading-snug italic">&ldquo;{diary.oneLiner}&rdquo;</p>
                        {diary.mood && (
                          <span className="text-xs ml-auto shrink-0 text-muted-foreground">
                            {diary.mood ? MOOD_SYMBOLS[diary.mood] : ""}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Stats Panel ──────────────────────────────────────────────────────────────

function StatsPanel() {
  const t = useTranslations("planner.rightPanel")
  const { selectedDate, getTasksForDate, roles, getCompletionScore } = usePlannerStore()
  const tasks = getTasksForDate(selectedDate)
  const score = getCompletionScore(selectedDate)

  const aDone = tasks.filter((t) => t.priority === "A" && t.status === "done").length
  const aTotal = tasks.filter((t) => t.priority === "A").length
  const bDone = tasks.filter((t) => t.priority === "B" && t.status === "done").length
  const bTotal = tasks.filter((t) => t.priority === "B").length
  const cDone = tasks.filter((t) => t.priority === "C" && t.status === "done").length
  const cTotal = tasks.filter((t) => t.priority === "C").length

  const statusCounts = tasks.reduce(
    (acc, t) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc },
    {} as Record<string, number>
  )

  const roleTaskCounts = roles.map((r) => ({
    ...r,
    count: tasks.filter((t) => t.roleId === r.id).length,
    doneCount: tasks.filter((t) => t.roleId === r.id && t.status === "done").length,
  }))
  const maxRoleCount = Math.max(...roleTaskCounts.map((r) => r.count), 1)

  const STATUS_LABEL_KEYS: Record<string, string> = {
    pending: "statusPending", "in-progress": "statusInProgress", done: "statusDone",
    forwarded: "statusForwarded", cancelled: "statusCancelled", delegated: "statusDelegated",
  }
  const STATUS_COLORS: Record<string, string> = {
    pending: "var(--muted-foreground)", "in-progress": "var(--status-in-progress)",
    done: "var(--status-done)", forwarded: "var(--status-forwarded)",
    cancelled: "var(--status-cancelled)", delegated: "var(--status-delegated)",
  }

  const PriorityBar = ({
    label, done, total, color,
  }: { label: string; done: number; total: number; color: string }) => (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color }}>{label}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{done}/{total}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: total > 0 ? `${(done / total) * 100}%` : "0%", background: color }}
        />
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <BarChart2 className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-foreground">{t("dailyStats")}</span>
      </div>

      <div className="px-4 py-4 space-y-5">
        {/* Score */}
        <div className="rounded-lg border border-border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{t("overallScore")}</p>
            <span
              className="text-xl font-bold tabular-nums"
              style={{ color: score >= 70 ? "var(--status-done)" : score >= 40 ? "var(--priority-a)" : "var(--status-cancelled)" }}
            >
              {score}<span className="text-sm font-normal text-muted-foreground">{t("scoreUnit")}</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${score}%`,
                background: score >= 70 ? "var(--status-done)" : score >= 40 ? "var(--priority-a)" : "var(--status-cancelled)",
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {t("scoreDescription")}
          </p>
        </div>

        {/* Priority bars */}
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{t("priorityCompletion")}</p>
          <div className="space-y-2.5">
            <PriorityBar label={t("priorityALabel")} done={aDone} total={aTotal} color="var(--priority-a)" />
            <PriorityBar label={t("priorityBLabel")} done={bDone} total={bTotal} color="var(--priority-b)" />
            <PriorityBar label={t("priorityCLabel")} done={cDone} total={cTotal} color="var(--priority-c)" />
          </div>
        </div>

        {/* Status breakdown */}
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{t("statusBreakdown")}</p>
          <div className="grid grid-cols-3 gap-1.5">
            {Object.entries(statusCounts).map(([status, count]) => (
              <div
                key={status}
                className="rounded-md px-2 py-1.5 text-center border border-border"
                style={{ background: `color-mix(in oklch, ${STATUS_COLORS[status]} 10%, var(--muted))` }}
              >
                <p className="text-sm font-bold tabular-nums" style={{ color: STATUS_COLORS[status] }}>{count}</p>
                <p className="text-xs text-muted-foreground">{STATUS_LABEL_KEYS[status] ? t(STATUS_LABEL_KEYS[status]) : status}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Role balance */}
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{t("roleBalance")}</p>
          <div className="space-y-2">
            {roleTaskCounts.filter((r) => r.count > 0).map((r) => (
              <div key={r.id} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: r.color }} />
                    <span className="text-xs text-foreground">{r.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums">{r.doneCount}/{r.count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${(r.count / maxRoleCount) * 100}%`, background: r.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Right Panel ──────────────────────────────────────────────────────────────

export function RightPanel() {
  const t = useTranslations("planner.rightPanel")
  const { selectedDate, getTasksForDate } = usePlannerStore()
  const [activeTab, setActiveTab] = useState<Tab>("inbox")
  const [showNion, setShowNion] = useState(false)

  // Auto-trigger Nion at or after 21:00
  useEffect(() => {
    const now = new Date()
    if (now.getHours() >= 21) {
      const tasks = getTasksForDate(selectedDate)
      const pending = tasks.filter(
        (t) => t.priority !== "C" && (t.status === "pending" || t.status === "in-progress")
      )
      if (pending.length > 0) setShowNion(true)
    }
  }, [selectedDate, getTasksForDate])

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "inbox", label: t("tabInbox"), icon: <Inbox className="w-3 h-3" /> },
    { key: "diary", label: t("tabDiary"), icon: <BookMarked className="w-3 h-3" /> },
    { key: "timeline", label: t("tabTimeline"), icon: <Clock3 className="w-3 h-3" /> },
    { key: "stats", label: t("tabStats"), icon: <BarChart2 className="w-3 h-3" /> },
  ]

  return (
    <>
      <aside className="w-64 shrink-0 flex flex-col border-l border-border bg-card overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-border shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors border-b-2",
                activeTab === tab.key
                  ? "border-[var(--primary)] text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
              style={activeTab === tab.key ? { borderBottomColor: "var(--priority-a)" } : {}}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Nion trigger button */}
        <div className="px-3 py-2 border-b border-border shrink-0 flex items-center justify-between">
          <span className="text-xs text-muted-foreground italic">
            {t("nionReadyPrompt")}
          </span>
          <button
            onClick={() => setShowNion(true)}
            className="text-xs font-medium px-2 py-0.5 rounded transition-colors hover:opacity-80"
            style={{ background: "var(--priority-a-bg)", color: "var(--priority-a)" }}
          >
            Nion
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === "inbox" && <InboxPanel />}
          {activeTab === "diary" && <DiaryPanel />}
          {activeTab === "timeline" && <TimelinePanel />}
          {activeTab === "stats" && <StatsPanel />}
        </div>
      </aside>

      {showNion && <NionPopup onClose={() => setShowNion(false)} />}
    </>
  )
}
