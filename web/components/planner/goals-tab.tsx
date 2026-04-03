"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { usePlannerStore } from "@/lib/planner-store"
import { cn } from "@/lib/utils"
import { Plus, Trash2, Flag, ChevronDown, ChevronUp } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { CalendarIcon } from "lucide-react"
import { format, parseISO } from "date-fns"
import { ko } from "date-fns/locale"

export function GoalsTab() {
  const { goals, roles, addGoal, deleteGoal, getDdayGoals } = usePlannerStore()
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState("")
  const [roleId, setRoleId] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [desc, setDesc] = useState("")

  const ddayGoals = getDdayGoals?.() ?? []

  const handleAdd = () => {
    if (!title.trim() || !dueDate) return
    addGoal(title.trim(), roleId || roles[0]?.id, dueDate, desc.trim() || undefined)
    setTitle(""); setRoleId(""); setDueDate(""); setDesc(""); setAdding(false)
  }

  // Group goals by roleId
  const byRole: Record<string, typeof ddayGoals> = {}
  ddayGoals.forEach((g) => {
    if (!byRole[g.roleId]) byRole[g.roleId] = []
    byRole[g.roleId].push(g)
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0 bg-card/40">
        <div>
          <h2 className="text-lg font-bold text-foreground">목표</h2>
          <p className="text-xs text-muted-foreground mt-0.5">마감일이 있는 중요한 목표를 관리합니다</p>
        </div>
        <button
          onClick={() => setAdding(!adding)}
          className="flex items-center gap-1.5 h-8 px-3 rounded text-xs font-medium hover:opacity-80 transition-opacity"
          style={{ background: "var(--priority-a)", color: "#ffffff" }}
        >
          <Plus className="w-3.5 h-3.5" />
          목표 추가
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
        {/* Add form */}
        {adding && (
          <div
            className="rounded-xl border border-border p-4 space-y-3"
            style={{ background: "var(--card)" }}
          >
            <p className="text-xs font-semibold text-foreground">새 목표 추가</p>
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="목표 이름"
              className="h-8 text-sm bg-muted border-border"
            />
            <div className="grid grid-cols-[1fr_2fr] gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">마감일</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full h-8 justify-start text-xs font-normal gap-1.5 px-2">
                      <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" />
                      {dueDate ? format(parseISO(dueDate), "yyyy년 M월 d일", { locale: ko }) : "날짜 선택"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dueDate ? parseISO(dueDate) : undefined}
                      onSelect={(date) => { if (date) setDueDate(format(date, "yyyy-MM-dd")) }}
                      locale={ko}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">역할</label>
                <Select value={roleId} onValueChange={setRoleId}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="역할 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
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
            </div>
            <Input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="목표 설명 (선택)"
              className="h-8 text-sm bg-muted border-border"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleAdd}
                style={{ background: "var(--priority-a)", color: "#ffffff" }}
                className="text-xs"
              >
                추가
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setAdding(false)}
                className="text-xs text-muted-foreground"
              >
                취소
              </Button>
            </div>
          </div>
        )}

        {ddayGoals.length === 0 && !adding && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <Flag className="w-8 h-8 opacity-30" />
            <p className="text-sm">아직 목표가 없습니다</p>
            <p className="text-xs opacity-70">위 &lsquo;목표 추가&rsquo; 버튼으로 목표를 추가해보세요</p>
          </div>
        )}

        {/* Goals grouped by role */}
        {roles.map((role) => {
          const roleGoals = byRole[role.id]
          if (!roleGoals || roleGoals.length === 0) return null
          return (
            <div key={role.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: role.color }} />
                <span className="text-xs font-semibold text-foreground uppercase tracking-wide">{role.name}</span>
              </div>
              {roleGoals.map((goal) => {
                const overdue = goal.daysLeft < 0
                return (
                  <div
                    key={goal.id}
                    className="group rounded-xl border p-4 space-y-2 transition-colors hover:bg-accent/10"
                    style={{
                      borderColor: goal.urgent
                        ? "color-mix(in oklch, var(--status-cancelled) 40%, var(--border))"
                        : "var(--border)",
                      background: goal.urgent ? "color-mix(in oklch, var(--status-cancelled) 6%, var(--card))" : "var(--card)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground leading-snug">{goal.title}</p>
                        {goal.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{goal.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className="text-sm font-bold tabular-nums px-2 py-0.5 rounded"
                          style={{
                            background: overdue
                              ? "color-mix(in oklch, var(--status-cancelled) 15%, transparent)"
                              : goal.urgent
                              ? "color-mix(in oklch, var(--status-cancelled) 15%, transparent)"
                              : "var(--muted)",
                            color: overdue || goal.urgent
                              ? "var(--status-cancelled)"
                              : "var(--muted-foreground)",
                          }}
                        >
                          {overdue ? `D+${Math.abs(goal.daysLeft)}` : `D-${goal.daysLeft}`}
                        </span>
                        <button
                          onClick={() => deleteGoal(goal.id)}
                          className="opacity-0 group-hover:opacity-60 hover:opacity-100 text-muted-foreground transition-opacity"
                          aria-label="목표 삭제"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Progress bar for goals within 60 days */}
                    {!overdue && goal.daysLeft <= 60 && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{goal.dueDate} 마감</span>
                          <span>{goal.daysLeft}일 남음</span>
                        </div>
                        <div className="h-1 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.max(2, 100 - (goal.daysLeft / 60) * 100)}%`,
                              background: goal.urgent ? "var(--status-cancelled)" : role.color,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
