"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { usePlannerStore, type Priority } from "@/lib/planner-store"
import { Inbox, Plus, Trash2, ArrowRight } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

const PRIORITY_COLORS: Record<Priority, string> = {
  A: "var(--priority-a)",
  B: "var(--priority-b)",
  C: "var(--muted-foreground)",
}

export function InboxTab() {
  const t = useTranslations("planner.inbox")
  const tTask = useTranslations("planner.task")
  const { inboxTasks, roles, addInboxTask, deleteInboxTask, moveInboxToTasks, selectedDate } = usePlannerStore()
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newRoleId, setNewRoleId] = useState(roles[0]?.id ?? "")
  const [moveTarget, setMoveTarget] = useState<Record<string, Priority>>({})

  const handleAdd = () => {
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
      <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Inbox className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">{t("title")}</span>
          {inboxTasks.length > 0 && (
            <span
              className="text-xs font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: "var(--priority-a-bg)", color: "var(--priority-a)" }}
            >
              {inboxTasks.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setAdding(!adding)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label={t("title")}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {adding && (
        <div className="px-6 py-3 border-b border-border bg-accent/20 space-y-2 shrink-0">
          <Input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={t("capturePlaceholder")}
            className="h-8 text-xs bg-muted border-border"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd()
              if (e.key === "Escape") { setAdding(false); setNewTitle("") }
            }}
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
            <button
              onClick={handleAdd}
              className="h-6 px-3 rounded text-xs font-medium"
              style={{ background: "var(--priority-a)", color: "#ffffff" }}
            >
              {tTask("add")}
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-3 space-y-2">
        {inboxTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
            <Inbox className="w-8 h-8 opacity-30" />
            <p className="text-sm">{t("empty")}</p>
            <p className="text-xs opacity-60">{t("emptyHint")}</p>
          </div>
        ) : (
          inboxTasks.map((task) => {
            const role = roles.find((r) => r.id === task.roleId)
            const target = moveTarget[task.id] ?? "B"
            return (
              <div
                key={task.id}
                className="group border border-border rounded-xl p-3 hover:bg-accent/20 transition-colors"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground leading-snug">{task.title}</p>
                    {role && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: role.color }} />
                        <span className="text-xs text-muted-foreground">{role.name}</span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => deleteInboxTask(task.id)}
                    className="opacity-0 group-hover:opacity-60 hover:opacity-100 text-muted-foreground transition-opacity shrink-0"
                    aria-label={tTask("delete")}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Select
                    value={target}
                    onValueChange={(v) => setMoveTarget((prev) => ({ ...prev, [task.id]: v as Priority }))}
                  >
                    <SelectTrigger className="h-6 text-xs bg-muted border-border w-16">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      {(["A", "B", "C"] as Priority[]).map((p) => (
                        <SelectItem key={p} value={p} className="text-xs">
                          <span style={{ color: PRIORITY_COLORS[p] }} className="font-bold">{p}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button
                    onClick={() => handleMove(task.id)}
                    className="flex items-center gap-1 h-6 px-2.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border border-border"
                  >
                    <ArrowRight className="w-3 h-3" />
                    {t("promoteToTask")}
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
