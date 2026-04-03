"use client"

import { useState } from "react"
import { usePlannerStore, type Task, type TaskStatus } from "@/lib/planner-store"
import { cn } from "@/lib/utils"
import {
  Check, ArrowRight, X, Circle, User, GripVertical,
  Clock, ChevronDown, Trash2, MoreHorizontal, StickyNote,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

const STATUS_CONFIG: Record<
  TaskStatus,
  { label: string; icon: React.ReactNode; className: string; strikethrough?: boolean }
> = {
  pending: {
    label: "대기",
    icon: <span className="w-3.5 h-3.5 rounded border border-muted-foreground inline-block" />,
    className: "text-foreground",
  },
  done: {
    label: "완료 (V)",
    icon: <Check className="w-3.5 h-3.5" style={{ color: "var(--status-done)" }} strokeWidth={3} />,
    className: "text-muted-foreground",
    strikethrough: true,
  },
  forwarded: {
    label: "이월 (→)",
    icon: <ArrowRight className="w-3.5 h-3.5" style={{ color: "var(--status-forwarded)" }} />,
    className: "text-muted-foreground",
    strikethrough: true,
  },
  cancelled: {
    label: "취소 (X)",
    icon: <X className="w-3.5 h-3.5" style={{ color: "var(--status-cancelled)" }} />,
    className: "text-muted-foreground",
    strikethrough: true,
  },
  "in-progress": {
    label: "진행 중 (●)",
    icon: <Circle className="w-3.5 h-3.5 fill-current" style={{ color: "var(--status-in-progress)" }} />,
    className: "text-foreground",
  },
  delegated: {
    label: "위임 (D)",
    icon: (
      <span
        className="w-3.5 h-3.5 rounded border-2 text-xs font-bold inline-flex items-center justify-center"
        style={{ color: "var(--status-delegated)", borderColor: "var(--status-delegated)" }}
      >
        D
      </span>
    ),
    className: "text-muted-foreground",
  },
}

const STATUS_CYCLE: TaskStatus[] = [
  "pending", "in-progress", "done", "forwarded", "cancelled", "delegated",
]

interface TaskItemProps {
  task: Task
  urgentGoal?: { title: string; daysLeft: number }
}

export function TaskItem({ task, urgentGoal: urgentGoalProp }: TaskItemProps) {
  const { updateTask, deleteTask, forwardTask, roles, getDdayGoals } = usePlannerStore()

  // Derive urgentGoal internally so old callers that pass undefined don't crash
  const urgentGoal = urgentGoalProp ?? (() => {
    const goals = getDdayGoals?.() ?? []
    const match = goals.find((g) => g.roleId === task.roleId && g.urgent)
    return match ? { title: match.title, daysLeft: match.daysLeft } : undefined
  })()
  const [showDelegatee, setShowDelegatee] = useState(task.status === "delegated")
  const [delegateeDraft, setDelegateeDraft] = useState(task.delegatee || "")
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(task.title)
  const [showTimeAssign, setShowTimeAssign] = useState(false)
  const [timeStartH, setTimeStartH] = useState(task.timeStart !== undefined ? String(Math.floor(task.timeStart)) : "")
  const [timeStartM, setTimeStartM] = useState(task.timeStart !== undefined ? String(Math.round((task.timeStart % 1) * 60)) : "0")
  const [timeEndH, setTimeEndH] = useState(task.timeEnd !== undefined ? String(Math.floor(task.timeEnd)) : "")
  const [timeEndM, setTimeEndM] = useState(task.timeEnd !== undefined ? String(Math.round((task.timeEnd % 1) * 60)) : "0")
  const [showMemo, setShowMemo] = useState(false)
  const [memoDraft, setMemoDraft] = useState(task.note ?? "")

  const role = roles.find((r) => r.id === task.roleId)
  const statusConfig = STATUS_CONFIG[task.status]

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  const cycleStatus = () => {
    const current = STATUS_CYCLE.indexOf(task.status)
    const next = STATUS_CYCLE[(current + 1) % STATUS_CYCLE.length]
    updateTask(task.id, { status: next })
    if (next === "delegated") setShowDelegatee(true)
    if (next === "forwarded") forwardTask(task.id)
  }

  const saveDelegatee = () => {
    updateTask(task.id, { delegatee: delegateeDraft })
    setShowDelegatee(false)
  }

  const saveTitle = () => {
    if (titleDraft.trim()) updateTask(task.id, { title: titleDraft.trim() })
    setEditingTitle(false)
  }

  const saveTimeBlock = () => {
    const sh = timeStartH ? parseInt(timeStartH) : undefined
    const sm = timeStartM ? parseInt(timeStartM) : 0
    const eh = timeEndH ? parseInt(timeEndH) : undefined
    const em = timeEndM ? parseInt(timeEndM) : 0
    updateTask(task.id, {
      timeStart: sh !== undefined ? sh + sm / 60 : undefined,
      timeEnd: eh !== undefined ? eh + em / 60 : undefined,
    })
    setShowTimeAssign(false)
  }

  const saveMemo = () => {
    updateTask(task.id, { note: memoDraft.trim() || undefined })
  }

  const formatHour = (h?: number) => {
    if (h === undefined) return null
    const hour = Math.floor(h)
    const min = Math.round((h % 1) * 60)
    return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        ...(urgentGoal && !isDragging
          ? { borderLeftColor: "var(--status-cancelled)", borderLeftWidth: 2 }
          : {}),
      }}
      className={cn(
        "group flex items-start gap-2 px-3 py-2 rounded-md border transition-all",
        isDragging
          ? "shadow-lg border-border bg-accent"
          : "border-transparent hover:border-border hover:bg-accent/40"
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity shrink-0"
        aria-label="순서 변경"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>

      {/* Status toggle button */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="mt-0.5 shrink-0 flex items-center justify-center w-4 h-4 hover:scale-110 transition-transform"
            aria-label={`상태: ${statusConfig.label}`}
          >
            {statusConfig.icon}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40 bg-popover border-border">
          {STATUS_CYCLE.map((s) => (
            <DropdownMenuItem
              key={s}
              onClick={() => {
                updateTask(task.id, { status: s })
                if (s === "delegated") setShowDelegatee(true)
                if (s === "forwarded") forwardTask(task.id)
              }}
              className={cn(
                "text-xs gap-2 cursor-pointer",
                task.status === s && "bg-accent"
              )}
            >
              <span className="flex items-center w-4 h-4">
                {STATUS_CONFIG[s].icon}
              </span>
              {STATUS_CONFIG[s].label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Task title */}
      <div className="flex-1 min-w-0">
        {editingTitle ? (
          <Input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveTitle()
              if (e.key === "Escape") setEditingTitle(false)
            }}
            className="h-6 text-xs bg-muted border-border py-0 px-1.5"
            autoFocus
          />
        ) : (
          <span
            onDoubleClick={() => {
              setTitleDraft(task.title)
              setEditingTitle(true)
            }}
            className={cn(
              "text-xs leading-snug cursor-default select-none block truncate",
              statusConfig.className,
              statusConfig.strikethrough && "line-through opacity-50"
            )}
            title={task.title}
          >
            <span className="text-muted-foreground font-semibold mr-1">{task.priority}{task.order + 1}.</span>
            {task.title}
          </span>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-2 mt-0.5">
          {role && (
            <div className="flex items-center gap-1">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: role.color }}
              />
              <span className="text-xs text-muted-foreground">{role.name}</span>
            </div>
          )}

          {urgentGoal && (
            <div
              className="flex items-center gap-1 px-1.5 py-0.5 rounded"
              style={{
                background: "color-mix(in oklch, var(--status-cancelled) 15%, transparent)",
                border: "1px solid color-mix(in oklch, var(--status-cancelled) 40%, transparent)",
              }}
              title={urgentGoal.title}
            >
              <span
                className="text-xs font-bold tabular-nums"
                style={{ color: "var(--status-cancelled)" }}
              >
                D-{urgentGoal.daysLeft}
              </span>
              <span
                className="text-xs max-w-[80px] truncate hidden sm:inline"
                style={{ color: "var(--status-cancelled)" }}
              >
                {urgentGoal.title}
              </span>
            </div>
          )}

          {showTimeAssign ? (
            <div className="flex items-center gap-1">
              <Clock className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
              <Input
                type="number" min={5} max={23} value={timeStartH}
                onChange={e => setTimeStartH(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveTimeBlock(); if (e.key === "Escape") setShowTimeAssign(false); if (["e","E","+","-","."].includes(e.key)) e.preventDefault() }}
                className="w-12 h-6 text-xs text-center px-1" autoFocus
              />
              <span className="text-xs text-muted-foreground">:</span>
              <Input
                type="number" min={0} max={59} step={5} value={timeStartM}
                onChange={e => setTimeStartM(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveTimeBlock(); if (e.key === "Escape") setShowTimeAssign(false); if (["e","E","+","-","."].includes(e.key)) e.preventDefault() }}
                className="w-12 h-6 text-xs text-center px-1"
              />
              <span className="text-xs text-muted-foreground">–</span>
              <Input
                type="number" min={6} max={24} value={timeEndH}
                onChange={e => setTimeEndH(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveTimeBlock(); if (e.key === "Escape") setShowTimeAssign(false); if (["e","E","+","-","."].includes(e.key)) e.preventDefault() }}
                className="w-12 h-6 text-xs text-center px-1"
              />
              <span className="text-xs text-muted-foreground">:</span>
              <Input
                type="number" min={0} max={59} step={5} value={timeEndM}
                onChange={e => setTimeEndM(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveTimeBlock(); if (e.key === "Escape") setShowTimeAssign(false); if (["e","E","+","-","."].includes(e.key)) e.preventDefault() }}
                className="w-12 h-6 text-xs text-center px-1"
              />
              <button onClick={saveTimeBlock} className="text-xs font-medium px-1.5 py-0.5 rounded hover:opacity-80" style={{ background: "var(--priority-a)", color: "#ffffff" }}>확인</button>
              <button onClick={() => setShowTimeAssign(false)} className="text-xs text-muted-foreground hover:text-foreground">취소</button>
            </div>
          ) : task.timeStart !== undefined ? (
            <button onClick={() => setShowTimeAssign(true)} className="flex items-center gap-0.5 hover:text-foreground transition-colors">
              <Clock className="w-2.5 h-2.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground hover:text-foreground">
                {formatHour(task.timeStart)}{task.timeEnd ? `–${formatHour(task.timeEnd)}` : ""}
              </span>
            </button>
          ) : null}

          {task.delegatee && task.status === "delegated" && (
            <div className="flex items-center gap-0.5">
              <User className="w-2.5 h-2.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{task.delegatee}</span>
            </div>
          )}

          {task.note && (
            <button
              onClick={() => setShowMemo(!showMemo)}
              className="flex items-center gap-0.5 hover:text-foreground transition-colors"
              aria-label="메모 보기"
            >
              <StickyNote className="w-2.5 h-2.5" style={{ color: "var(--priority-b)" }} />
              <span className="text-xs" style={{ color: "var(--priority-b)" }}>메모</span>
            </button>
          )}
        </div>

        {/* Delegatee input */}
        {showDelegatee && task.status === "delegated" && (
          <div className="flex gap-1 mt-1">
            <Input
              value={delegateeDraft}
              onChange={(e) => setDelegateeDraft(e.target.value)}
              placeholder="피위임자 이름"
              className="h-6 text-xs bg-muted border-border px-1.5 py-0"
              onKeyDown={(e) => {
                if (e.key === "Enter") saveDelegatee()
                if (e.key === "Escape") setShowDelegatee(false)
              }}
              autoFocus
            />
            <Button
              size="sm"
              className="h-6 text-xs px-1.5 shrink-0"
              style={{ background: "var(--status-delegated)", color: "#fff" }}
              onClick={saveDelegatee}
            >
              저장
            </Button>
          </div>
        )}

        {/* Contextual memo */}
        {showMemo && (
          <div
            className="mt-1.5 rounded-md p-2 space-y-1.5"
            style={{
              background: "color-mix(in oklch, var(--priority-b) 8%, var(--muted))",
              border: "1px solid color-mix(in oklch, var(--priority-b) 25%, var(--border))",
            }}
          >
            <div className="flex items-center gap-1.5">
              <StickyNote className="w-2.5 h-2.5 shrink-0" style={{ color: "var(--priority-b)" }} />
              <span className="text-xs font-medium" style={{ color: "var(--priority-b)" }}>
                업무 메모
              </span>
              <span className="text-xs text-muted-foreground ml-auto">업무 맥락 기록</span>
            </div>
            <Textarea
              value={memoDraft}
              onChange={(e) => setMemoDraft(e.target.value)}
              onBlur={saveMemo}
              placeholder="이 업무과 관련된 아이디어, 참고사항, 진행상황을 기록하세요..."
              rows={3}
              className="text-xs resize-none bg-muted border-border text-foreground leading-relaxed"
            />
            <div className="flex justify-end gap-1">
              <button
                onClick={() => { saveMemo(); setShowMemo(false) }}
                className="h-5 px-2 rounded text-xs font-medium hover:opacity-80 transition-opacity"
                style={{ background: "var(--priority-b)", color: "#ffffff" }}
              >
                저장
              </button>
              <button
                onClick={() => setShowMemo(false)}
                className="h-5 px-2 rounded text-xs text-muted-foreground hover:text-foreground transition-colors border border-border"
              >
                닫기
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="mt-0.5 text-muted-foreground opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity shrink-0"
            aria-label="더보기"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44 bg-popover border-border">
          <DropdownMenuItem
            className="text-xs gap-2 cursor-pointer"
            onClick={() => {
              setTitleDraft(task.title)
              setEditingTitle(true)
            }}
          >
            제목 수정
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-xs gap-2 cursor-pointer"
            onClick={() => setShowTimeAssign(!showTimeAssign)}
          >
            <Clock className="w-3 h-3" />
            시간 배정
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-xs gap-2 cursor-pointer"
            onClick={() => { setMemoDraft(task.note ?? ""); setShowMemo(!showMemo) }}
          >
            <StickyNote className="w-3 h-3" />
            {task.note ? "메모 편집" : "메모 추가"}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-border" />
          <DropdownMenuItem
            className="text-xs gap-2 cursor-pointer"
            onClick={() => forwardTask(task.id)}
            style={{ color: "var(--status-forwarded)" }}
          >
            <ArrowRight className="w-3 h-3" />
            내일로 이월
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-border" />
          <DropdownMenuItem
            className="text-xs gap-2 cursor-pointer"
            style={{ color: "var(--status-cancelled)" }}
            onClick={() => deleteTask(task.id)}
          >
            <Trash2 className="w-3 h-3" />
            삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Time block inline panel removed — now inline in meta row */}
    </div>
  )
}
