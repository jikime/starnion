"use client"
// cache-bust: v5
import { useState } from "react"
import { usePlannerStore, type Priority, type Task } from "@/lib/planner-store"
import { TaskItem } from "./task-item"
import { MagicBar } from "./magic-bar"
import { cn } from "@/lib/utils"
import { Plus, ChevronDown, ChevronRight } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"

const PRIORITY_CONFIG = {
  A: {
    label: "A",
    sublabel: "필수 (Must Do)",
    badgeStyle: {
      background: "var(--priority-a-bg)",
      color: "var(--priority-a)",
      border: "1px solid var(--priority-a)",
    } as React.CSSProperties,
    accent: "var(--priority-a)",
  },
  B: {
    label: "B",
    sublabel: "중요 (Should Do)",
    badgeStyle: {
      background: "var(--priority-b-bg)",
      color: "var(--priority-b)",
      border: "1px solid var(--priority-b)",
    } as React.CSSProperties,
    accent: "var(--priority-b)",
  },
  C: {
    label: "C",
    sublabel: "선택 (Nice to Do)",
    badgeStyle: {
      background: "var(--priority-c-bg)",
      color: "var(--priority-c)",
      border: "1px solid var(--priority-c)",
    } as React.CSSProperties,
    accent: "var(--priority-c)",
  },
}

// Compute urgentGoalsByRole inline — avoids prop-passing issues entirely
function useUrgentGoalsByRole() {
  const { getDdayGoals } = usePlannerStore()
  const urgentGoals = (getDdayGoals?.() ?? []).filter((g) => g.urgent)
  const map = new Map<string, { title: string; daysLeft: number }>()
  for (const g of urgentGoals) {
    map.set(g.roleId, { title: g.title, daysLeft: g.daysLeft })
  }
  return { map, urgentGoals }
}

interface PriorityGroupProps {
  priority: Priority
}

function PriorityGroup({ priority }: PriorityGroupProps) {
  // Each PriorityGroup reads urgentGoals from store directly — no prop needed
  const { map: urgentMap } = useUrgentGoalsByRole()
  const { selectedDate, getTasksForDate, addTask, roles, reorderTasks } = usePlannerStore()
  const allTasks = getTasksForDate(selectedDate)
  const tasks: Task[] = allTasks
    .filter((t) => t.priority === priority)
    .sort((a, b) => a.order - b.order)

  const [collapsed, setCollapsed] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newRoleId, setNewRoleId] = useState(roles[0]?.id ?? "")

  const cfg = PRIORITY_CONFIG[priority]
  const doneCount = tasks.filter((t) => t.status === "done").length
  const pendingACount =
    priority === "A"
      ? tasks.filter((t) => t.status === "pending" || t.status === "in-progress").length
      : 0

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = tasks.map((t) => t.id)
    const oldIdx = ids.indexOf(active.id as string)
    const newIdx = ids.indexOf(over.id as string)
    if (oldIdx < 0 || newIdx < 0) return
    const reordered = [...ids]
    reordered.splice(oldIdx, 1)
    reordered.splice(newIdx, 0, active.id as string)
    reorderTasks(priority, selectedDate, reordered)
  }

  const handleAdd = () => {
    if (!newTitle.trim()) {
      setAdding(false)
      return
    }
    addTask(priority, newTitle.trim(), newRoleId || roles[0]?.id)
    setNewTitle("")
    setAdding(false)
  }

  return (
    <div
      className={cn(
        "border border-border rounded-lg overflow-hidden",
        priority === "A" &&
          pendingACount > 0 &&
          tasks.length > 0 &&
          doneCount < tasks.length &&
          "border-[var(--priority-a)]/40"
      )}
    >
      {/* Group header */}
      <button
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent/30 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
      >
        <span
          className="w-5 h-5 rounded text-xs font-bold flex items-center justify-center shrink-0"
          style={cfg.badgeStyle}
        >
          {cfg.label}
        </span>
        <div className="flex-1 text-left">
          <span className="text-xs font-semibold text-foreground">{cfg.sublabel}</span>
        </div>
        <div className="flex items-center gap-2">
          {priority === "A" && pendingACount > 0 && (
            <span
              className="text-xs font-semibold px-1.5 py-0.5 rounded"
              style={{ background: "var(--priority-a-bg)", color: "var(--priority-a)" }}
            >
              !{pendingACount}
            </span>
          )}
          <span className="text-xs text-muted-foreground tabular-nums">
            {doneCount}/{tasks.length}
          </span>
          {tasks.length > 0 && (
            <div className="w-12 h-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${(doneCount / tasks.length) * 100}%`,
                  background: cfg.accent,
                }}
              />
            </div>
          )}
          {collapsed ? (
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Tasks */}
      {!collapsed && (
        <div className="pb-1">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={tasks.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              {tasks.length === 0 && !adding && (
                <p className="px-3 py-3 text-xs text-muted-foreground italic">
                  {priority} 그룹에 업무이 없습니다
                </p>
              )}
              {tasks.map((task, idx) => (
                <div key={task.id} className="relative">
                  <div className="absolute left-7 top-2.5 w-3.5 text-xs text-muted-foreground text-right select-none pointer-events-none">
                    {idx + 1}
                  </div>
                  <TaskItem task={task} urgentGoal={urgentMap.get(task.roleId)} />
                </div>
              ))}
            </SortableContext>
          </DndContext>

        </div>
      )}
    </div>
  )
}

export function AbcTaskList() {
  const { selectedDate, getTasksForDate, roles } = usePlannerStore()
  const { map: urgentMap, urgentGoals } = useUrgentGoalsByRole()

  const allTasks = getTasksForDate(selectedDate)
  const pendingA = allTasks.filter(
    (t) => t.priority === "A" && (t.status === "pending" || t.status === "in-progress")
  ).length

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* A 업무 미완료 경고 배너 */}
      {pendingA > 0 && (
        <div
          className="mx-4 mt-3 mb-1 px-3 py-2 rounded-md text-xs font-medium flex items-center gap-2 shrink-0"
          style={{
            background: "var(--priority-a-bg)",
            color: "var(--priority-a)",
            border: "1px solid color-mix(in oklch, var(--priority-a) 30%, transparent)",
          }}
        >
          <span className="font-bold shrink-0">!</span>
          <span>
            완료되지 않은 A 업무이 <strong>{pendingA}개</strong> 있습니다. A를 먼저 처리하세요.
          </span>
        </div>
      )}

      {/* D-Day urgency banner */}
      {urgentGoals.length > 0 && (
        <div
          className="mx-4 mt-2 mb-1 px-3 py-2 rounded-md text-xs font-medium flex items-start gap-2 shrink-0"
          style={{
            background: "color-mix(in oklch, var(--status-cancelled) 12%, transparent)",
            color: "var(--status-cancelled)",
            border: "1px solid color-mix(in oklch, var(--status-cancelled) 35%, transparent)",
          }}
        >
          <span className="font-bold shrink-0 mt-px">D-7</span>
          <span>
            {urgentGoals
              .map((g) => {
                const role = roles.find((r) => r.id === g.roleId)
                return `"${g.title}" (D-${g.daysLeft}${role ? ` · ${role.name}` : ""})`
              })
              .join(", ")}{" "}
            — 관련 업무을 A등급으로 올리세요.
          </span>
        </div>
      )}

      {/* Magic Bar */}
      <MagicBar />

      {/* Priority groups — no prop passing needed */}
      <div className="flex flex-col gap-3 flex-1 overflow-y-auto px-4 pb-4">
        <PriorityGroup priority="A" />
        <PriorityGroup priority="B" />
        <PriorityGroup priority="C" />
      </div>
    </div>
  )
}
