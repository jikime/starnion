"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { usePlannerStore, type Priority } from "@/lib/planner-store"
import { cn } from "@/lib/utils"
import { Inbox, Plus, Trash2, ArrowRight, Check, Forward, AlertCircle } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

const PRIORITY_COLORS: Record<Priority, string> = {
  A: "var(--priority-a)",
  B: "var(--priority-b)",
  C: "var(--muted-foreground)",
}

export function IntelligencePanel() {
  const t = useTranslations("planner")
  const {
    selectedDate, tasks, inboxTasks, roles,
    addInboxTask, deleteInboxTask, moveInboxToTasks,
    getCompletionScore,
  } = usePlannerStore()

  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newRoleId, setNewRoleId] = useState(roles[0]?.id ?? "")
  const [moveTarget, setMoveTarget] = useState<Record<string, Priority>>({})

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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Completion score + pending tasks */}
      <div className="px-4 py-3 border-b border-border shrink-0 space-y-3">
        {/* Score */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">{t("score.todayRate")}</span>
            <span
              className="text-sm font-bold tabular-nums"
              style={{
                color: score >= 70 ? "var(--priority-b)" : score >= 40 ? "var(--priority-c)" : "var(--muted-foreground)",
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
                background: score >= 70 ? "var(--priority-b)" : score >= 40 ? "var(--priority-c)" : "var(--muted-foreground)",
              }}
            />
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Check className="w-3 h-3 text-green-500" />{t("score.done", { count: doneTasks.length })}
            </span>
            <span className="flex items-center gap-1">
              <AlertCircle className="w-3 h-3 text-amber-500" />{t("score.pending", { count: pendingTasks.length })}
            </span>
          </div>
        </div>

        {/* Pending tasks — forward to inbox */}
        {pendingTasks.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-foreground">{t("inbox.pendingForward")}</p>
            <div className="space-y-1">
              {pendingTasks.map((task) => {
                const role = roles.find((r) => r.id === task.roleId)
                return (
                  <div key={task.id} className="flex items-center gap-2 p-2 rounded-lg border border-border">
                    <span className="text-xs font-bold w-4 shrink-0" style={{ color: PRIORITY_COLORS[task.priority] }}>{task.priority}</span>
                    <span className="flex-1 text-xs text-foreground truncate">{task.title}</span>
                    {role && <span className="text-xs text-muted-foreground shrink-0">{role.name}</span>}
                    <button
                      className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                      title={t("inbox.forwardToInbox")}
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
      </div>

      {/* Inbox header */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <Inbox className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-xs font-semibold text-foreground">{t("inbox.title")}</p>
          {inboxTasks.length > 0 && (
            <span className="text-xs text-muted-foreground">({inboxTasks.length})</span>
          )}
        </div>
        <button
          onClick={() => setAdding(!adding)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label={t("inbox.addLabel")}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="px-4 pb-3 space-y-2 shrink-0 border-b border-border bg-accent/10">
          <Input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={t("inbox.capturePlaceholder")}
            className="h-8 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddInbox()
              if (e.key === "Escape") { setAdding(false); setNewTitle("") }
            }}
          />
          <div className="flex gap-2">
            <Select value={newRoleId} onValueChange={setNewRoleId}>
              <SelectTrigger className="h-6 text-xs flex-1">
                <SelectValue placeholder={t("inbox.rolePlaceholder")} />
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
              className="h-6 px-3 rounded text-xs font-medium"
              style={{ background: "var(--priority-a)", color: "#ffffff" }}
            >
              {t("inbox.add")}
            </button>
          </div>
        </div>
      )}

      {/* Inbox list */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
        {inboxTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <Inbox className="w-7 h-7 opacity-30" />
            <p className="text-xs">{t("inbox.empty")}</p>
            <p className="text-xs opacity-60">{t("inbox.emptyHint")}</p>
          </div>
        ) : (
          inboxTasks.map((task) => {
            const role = roles.find((r) => r.id === task.roleId)
            const target = moveTarget[task.id] ?? "B"
            return (
              <div key={task.id} className="group border border-border rounded-lg p-2.5 hover:bg-accent/20 transition-colors">
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
                  <button
                    onClick={() => deleteInboxTask(task.id)}
                    className="opacity-0 group-hover:opacity-50 hover:opacity-100 text-muted-foreground transition-opacity"
                    aria-label={t("inbox.deleteLabel")}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex items-center gap-1.5 mt-2">
                  <Select
                    value={target}
                    onValueChange={(v) => setMoveTarget((prev) => ({ ...prev, [task.id]: v as Priority }))}
                  >
                    <SelectTrigger className="h-6 text-xs w-14">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["A", "B", "C"] as Priority[]).map((p) => (
                        <SelectItem key={p} value={p} className="text-xs">
                          <span style={{ color: PRIORITY_COLORS[p] }} className="font-bold">{p}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button
                    onClick={() => handleMove(task.id)}
                    className="flex items-center gap-1 h-6 px-2 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent border border-border transition-colors"
                  >
                    <ArrowRight className="w-3 h-3" />
                    {t("inbox.promoteToTask")}
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
