"use client"

import { useState } from "react"
import { usePlannerStore, type Priority } from "@/lib/planner-store"
import { cn } from "@/lib/utils"
import { Inbox, Plus, Trash2, ArrowRight, BarChart2, Check, Forward, AlertCircle } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { format, parseISO } from "date-fns"
import { ko } from "date-fns/locale"

type Panel = "inbox" | "reflection"

const PRIORITY_COLORS: Record<Priority, string> = {
  A: "var(--priority-a)",
  B: "var(--priority-b)",
  C: "var(--muted-foreground)",
}

const MOOD_OPTIONS = [
  { key: "great"   as const, label: "최고", symbol: "★★★", color: "#58A6FF" },
  { key: "good"    as const, label: "좋음", symbol: "★★",  color: "#3FB950" },
  { key: "neutral" as const, label: "보통", symbol: "★",   color: "#E3A948" },
  { key: "tired"   as const, label: "피곤", symbol: "△",   color: "#BC8CFF" },
  { key: "rough"   as const, label: "힘듦", symbol: "▽",   color: "#F85149" },
]

export function IntelligencePanel() {
  const {
    selectedDate, tasks, inboxTasks, roles,
    addInboxTask, deleteInboxTask, moveInboxToTasks,
    diaryEntries, setDiaryEntry,
    reflectionNotes, setReflectionNote,
    getCompletionScore,
  } = usePlannerStore()

  const [activePanel, setActivePanel] = useState<Panel>("inbox")
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newRoleId, setNewRoleId] = useState(roles[0]?.id ?? "")
  const [moveTarget, setMoveTarget] = useState<Record<string, Priority>>({})
  const [noteText, setNoteText] = useState(reflectionNotes[selectedDate] ?? "")

  const diary = diaryEntries[selectedDate]
  const score = getCompletionScore(selectedDate)
  const todayTasks = tasks.filter((t) => t.date === selectedDate)
  const doneTasks = todayTasks.filter((t) => t.status === "done")
  const pendingTasks = todayTasks.filter((t) => t.status === "pending")

  const handleAddInbox = () => {
    if (!newTitle.trim()) return
    addInboxTask(newTitle.trim(), newRoleId || roles[0]?.id)
    setNewTitle("")
    setAdding(false)
  }

  const handleMove = (taskId: string) => {
    moveInboxToTasks(taskId, moveTarget[taskId] ?? "B")
  }

  const dateLabel = format(parseISO(selectedDate), "M월 d일 (EEE)", { locale: ko })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sub-tab toggle */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border shrink-0">
        {([
          { id: "inbox",      label: "인박스",   icon: Inbox },
          { id: "reflection", label: "리플렉션", icon: BarChart2 },
        ] as { id: Panel; label: string; icon: React.ElementType }[]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActivePanel(id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              activePanel === id
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
            )}
          >
            <Icon className="w-3 h-3" />
            {label}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-muted-foreground pr-1">{dateLabel}</span>
      </div>

      {/* INBOX */}
      {activePanel === "inbox" && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 shrink-0">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              우선순위 미정 과업 및 이월 목록
            </p>
            <button
              onClick={() => setAdding(!adding)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="추가"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {adding && (
            <div className="px-4 pb-3 space-y-2 shrink-0 border-b border-border bg-accent/10">
              <Input
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="빠르게 캡처..."
                className="h-8 text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddInbox()
                  if (e.key === "Escape") { setAdding(false); setNewTitle("") }
                }}
              />
              <div className="flex gap-2">
                <Select value={newRoleId} onValueChange={setNewRoleId}>
                  <SelectTrigger className="h-6 text-[10px] flex-1">
                    <SelectValue placeholder="역할" />
                  </SelectTrigger>
                  <SelectContent>
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
                <button
                  onClick={handleAddInbox}
                  className="h-6 px-3 rounded text-[10px] font-medium"
                  style={{ background: "var(--priority-a)", color: "#0d1117" }}
                >
                  추가
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
            {inboxTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                <Inbox className="w-7 h-7 opacity-30" />
                <p className="text-xs">인박스가 비어 있습니다</p>
                <p className="text-[10px] opacity-60">아이디어나 요청사항을 여기에 캡처하세요</p>
              </div>
            ) : (
              inboxTasks.map((task) => {
                const role = roles.find((r) => r.id === task.roleId)
                const target = moveTarget[task.id] ?? "B"
                return (
                  <div
                    key={task.id}
                    className="group border border-border rounded-lg p-2.5 hover:bg-accent/20 transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground leading-snug">{task.title}</p>
                        {role && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: role.color }} />
                            <span className="text-[10px] text-muted-foreground">{role.name}</span>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => deleteInboxTask(task.id)}
                        className="opacity-0 group-hover:opacity-50 hover:opacity-100 text-muted-foreground transition-opacity"
                        aria-label="삭제"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2">
                      <Select
                        value={target}
                        onValueChange={(v) =>
                          setMoveTarget((prev) => ({ ...prev, [task.id]: v as Priority }))
                        }
                      >
                        <SelectTrigger className="h-6 text-[10px] w-14">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(["A", "B", "C"] as Priority[]).map((p) => (
                            <SelectItem key={p} value={p} className="text-xs">
                              <span style={{ color: PRIORITY_COLORS[p] }} className="font-bold">
                                {p}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <button
                        onClick={() => handleMove(task.id)}
                        className="flex items-center gap-1 h-6 px-2 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent border border-border transition-colors"
                      >
                        <ArrowRight className="w-3 h-3" />
                        과업으로
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* REFLECTION NODE */}
      {activePanel === "reflection" && (
        <div className="flex flex-col flex-1 overflow-y-auto px-4 py-3 gap-4">
          {/* Completion score */}
          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-foreground">오늘의 완료율</span>
              <span
                className="text-sm font-bold tabular-nums"
                style={{
                  color:
                    score >= 70 ? "var(--priority-b)"
                    : score >= 40 ? "var(--priority-c)"
                    : "var(--muted-foreground)",
                }}
              >
                {score}%
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${score}%`,
                  background:
                    score >= 70 ? "var(--priority-b)"
                    : score >= 40 ? "var(--priority-c)"
                    : "var(--muted-foreground)",
                }}
              />
            </div>
            <div className="flex gap-4 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Check className="w-3 h-3 text-green-500" />
                완료 {doneTasks.length}개
              </span>
              <span className="flex items-center gap-1">
                <AlertCircle className="w-3 h-3 text-amber-500" />
                미완 {pendingTasks.length}개
              </span>
            </div>
          </div>

          {/* Mood */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-foreground">오늘 컨디션</p>
            <div className="flex gap-1.5 flex-wrap">
              {MOOD_OPTIONS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setDiaryEntry(selectedDate, { mood: m.key })}
                  className={cn(
                    "flex flex-col items-center px-2.5 py-1.5 rounded-lg border text-[10px] transition-all",
                    diary?.mood === m.key
                      ? "border-transparent"
                      : "border-border text-muted-foreground hover:bg-accent/20"
                  )}
                  style={
                    diary?.mood === m.key
                      ? { background: m.color + "22", borderColor: m.color, color: m.color }
                      : {}
                  }
                >
                  <span className="text-sm leading-none">{m.symbol}</span>
                  <span className="mt-0.5">{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Pending tasks — forward to inbox */}
          {pendingTasks.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-foreground">미완료 과업 이월</p>
              <div className="space-y-1.5">
                {pendingTasks.map((task) => {
                  const role = roles.find((r) => r.id === task.roleId)
                  return (
                    <div
                      key={task.id}
                      className="flex items-center gap-2 p-2 rounded-lg border border-border"
                    >
                      <span
                        className="text-[10px] font-bold w-4 shrink-0"
                        style={{ color: PRIORITY_COLORS[task.priority] }}
                      >
                        {task.priority}
                      </span>
                      <span className="flex-1 text-xs text-foreground truncate">{task.title}</span>
                      {role && (
                        <span className="text-[9px] text-muted-foreground shrink-0">
                          {role.name}
                        </span>
                      )}
                      <button
                        className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                        title="인박스로 이월"
                        onClick={() => addInboxTask(task.title, task.roleId)}
                      >
                        <Forward className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Free reflection note */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-foreground">하루 회고</p>
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onBlur={() => setReflectionNote(selectedDate, noteText)}
              placeholder="오늘 하루를 돌아보며..."
              className="text-xs resize-none min-h-[100px] bg-muted border-border leading-relaxed"
              rows={5}
            />
            <p className="text-[9px] text-muted-foreground">포커스 이동 시 자동 저장됩니다</p>
          </div>
        </div>
      )}
    </div>
  )
}
