"use client"

import { create } from "zustand"
import { format } from "date-fns"

export type TaskStatus =
  | "pending"
  | "done"
  | "forwarded"
  | "cancelled"
  | "in-progress"
  | "delegated"

export type Priority = "A" | "B" | "C"

export interface Task {
  id: string
  title: string
  status: TaskStatus
  priority: Priority
  order: number
  roleId: string
  timeStart?: number
  timeEnd?: number
  delegatee?: string
  note?: string
  date: string
  forwardedFromId?: string
}

export interface Role {
  id: string
  name: string
  color: string
  bigRock: string
  mission?: string
}

export interface WeeklyGoal {
  id: string
  roleId: string
  title: string
  done: boolean
  weekStart: string
}

export interface Goal {
  id: string
  title: string
  roleId: string
  dueDate: string
  description?: string
  status?: string
  linkedTaskIds?: string[]
}

export interface DiaryEntry {
  date: string
  oneLiner: string
  mood: "great" | "good" | "neutral" | "tired" | "rough"
  fullNote?: string
}

// ── Helpers ──────────────────────────���───────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 10) }
function getToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
const TODAY = getToday()

function addDaysStr(dateStr: string, n: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function getWeekStart(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr) : new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// ── API helpers (fire-and-forget for mutations) ─────────────────────────────

const api = {
  get: (path: string) => fetch(path).then(r => r.ok ? r.json() : null).catch(() => null),
  post: (path: string, body: unknown) => fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.ok ? r.json() : null).catch(() => null),
  put: (path: string, body: unknown) => fetch(path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.ok ? r.json() : null).catch(() => null),
  patch: (path: string) => fetch(path, { method: "PATCH" }).then(r => r.ok ? r.json() : null).catch(() => null),
  del: (path: string) => fetch(path, { method: "DELETE" }).catch(() => null),
}

// Convert API time "HH:MM" to hour number, and vice versa
function timeToHour(t?: string): number | undefined {
  if (!t) return undefined
  const h = parseInt(t.split(":")[0])
  return isNaN(h) ? undefined : h
}
function hourToTime(h?: number): string {
  if (h === undefined || h === null) return ""
  return `${String(h).padStart(2, "0")}:00`
}

// Map API task to store Task
function mapTask(t: Record<string, unknown>): Task {
  return {
    id: String(t.id),
    title: String(t.title ?? ""),
    status: (t.status as TaskStatus) ?? "pending",
    priority: (t.priority as Priority) ?? "C",
    order: Number(t.order ?? 0),
    roleId: t.roleId ? String(t.roleId) : "",
    timeStart: timeToHour(t.timeStart as string),
    timeEnd: timeToHour(t.timeEnd as string),
    delegatee: (t.delegatee as string) || undefined,
    note: (t.note as string) || undefined,
    date: String(t.date ?? getToday()),
    forwardedFromId: t.forwardedFromId ? String(t.forwardedFromId) : undefined,
  }
}

function mapRole(r: Record<string, unknown>): Role {
  return { id: String(r.id), name: String(r.name ?? ""), color: String(r.color ?? "#3b6de0"), bigRock: String(r.bigRock ?? ""), mission: (r.mission as string) || undefined }
}

function mapWeeklyGoal(g: Record<string, unknown>): WeeklyGoal {
  return { id: String(g.id), roleId: String(g.roleId ?? ""), title: String(g.title ?? ""), done: Boolean(g.done), weekStart: String(g.weekStart ?? getWeekStart()) }
}

function mapGoal(g: Record<string, unknown>): Goal {
  return { id: String(g.id), title: String(g.title ?? ""), roleId: g.roleId ? String(g.roleId) : "", dueDate: String(g.dueDate ?? ""), description: (g.description as string) || undefined, status: (g.status as string) || "active" }
}

// ── Store Interface ──���───────────────────────���──────────────────────────────

interface PlannerStore {
  selectedDate: string
  tasks: Task[]
  inboxTasks: Task[]
  roles: Role[]
  goals: Goal[]
  weeklyGoals: WeeklyGoal[]
  diaryEntries: Record<string, DiaryEntry>
  missionStatement: string
  reflectionNotes: Record<string, string>
  _hydrated: boolean

  // Init
  hydrateFromAPI: () => Promise<void>

  // Setters
  setSelectedDate: (date: string) => void
  setMissionStatement: (text: string) => void

  // Task actions
  addTask: (priority: Priority, title: string, roleId: string) => void
  updateTask: (id: string, updates: Partial<Task>) => void
  deleteTask: (id: string) => void
  forwardTask: (id: string) => void
  reorderTasks: (priority: Priority, date: string, orderedIds: string[]) => void

  // Inbox
  addInboxTask: (title: string, roleId: string) => void
  moveInboxToTasks: (id: string, priority: Priority) => void
  deleteInboxTask: (id: string) => void

  // Roles
  addRole: (name: string, color: string, bigRock: string, mission?: string) => void
  updateRole: (id: string, updates: Partial<Role>) => void
  updateRoleBigRock: (id: string, bigRock: string) => void
  deleteRole: (id: string) => void

  // Weekly Goals
  addWeeklyGoal: (roleId: string, title: string, weekStart?: string) => void
  toggleWeeklyGoal: (id: string) => void
  deleteWeeklyGoal: (id: string) => void
  addWeeklyGoalAsTask: (id: string, priority: Priority) => void

  // Goals
  addGoal: (title: string, roleId: string, dueDate: string, description?: string) => void
  updateGoal: (id: string, updates: Partial<Goal>) => void
  deleteGoal: (id: string) => void

  // Diary
  setDiaryEntry: (date: string, entry: Partial<DiaryEntry>) => void
  setReflectionNote: (date: string, note: string) => void

  // Computed
  getTasksForDate: (date: string) => Task[]
  getCompletionScore: (date: string) => number
  getRoleBalance: (date: string) => Record<string, number>
  getDdayGoals: () => (Goal & { daysLeft: number; urgent: boolean })[]
  getWeekBalance: (weekStart?: string) => Record<string, number>
  getUnassignedRoles: (weekStart?: string) => Role[]
}

export const usePlannerStore = create<PlannerStore>()(
    (set, get) => ({
      selectedDate: TODAY,
      tasks: [],
      inboxTasks: [],
      roles: [],
      goals: [],
      weeklyGoals: [],
      diaryEntries: {},
      missionStatement: "",
      reflectionNotes: {},
      _hydrated: false,

      // ── Hydrate from API ────────────────────────────────────────────────
      hydrateFromAPI: async () => {
        const data = await api.get("/api/planner/snapshot")
        if (!data || data.error) return // API 실패 시 기존 localStorage 데이터 유지
        const roles = (data.roles ?? []).map(mapRole)
        const tasks = (data.tasks ?? []).map(mapTask)
        const inbox = (data.inbox ?? []).map((t: Record<string, unknown>) => mapTask({ ...t, date: getToday() }))
        const weeklyGoals = (data.weeklyGoals ?? []).map(mapWeeklyGoal)
        const goals = (data.goals ?? []).map(mapGoal)

        const diaryEntries: Record<string, DiaryEntry> = {}
        for (const d of (data.diary ?? [])) {
          diaryEntries[d.date] = { date: d.date, oneLiner: d.oneLiner ?? "", mood: d.mood ?? "neutral", fullNote: d.fullNote || undefined }
        }

        const reflectionNotes: Record<string, string> = {}
        for (const r of (data.reflections ?? [])) {
          reflectionNotes[r.date] = typeof r.notes === "string" ? r.notes : JSON.stringify(r.notes ?? [])
        }

        set({
          roles, tasks, inboxTasks: inbox, weeklyGoals, goals,
          diaryEntries, reflectionNotes,
          missionStatement: data.mission ?? "",
          _hydrated: true,
        })
      },

      setSelectedDate: (date) => set({ selectedDate: date }),

      setMissionStatement: (text) => {
        set({ missionStatement: text })
        api.put("/api/planner/mission", { mission: text })
      },

      // ── Tasks ─────────────────────────────────────────────────────────────

      addTask: (priority, title, roleId) => {
        const { tasks, selectedDate } = get()
        const tempId = uid()
        const samePriority = tasks.filter(t => t.priority === priority && t.date === selectedDate)
        const newTask: Task = { id: tempId, title, status: "pending", priority, order: samePriority.length, roleId, date: selectedDate }
        set({ tasks: [...tasks, newTask] })
        api.post("/api/planner/tasks", { title, priority, roleId: roleId ? Number(roleId) : null, date: selectedDate }).then(res => {
          if (res?.id) set(s => ({ tasks: s.tasks.map(t => t.id === tempId ? { ...t, id: String(res.id) } : t) }))
        })
      },

      updateTask: (id, updates) => {
        set(s => ({ tasks: s.tasks.map(t => t.id === id ? { ...t, ...updates } : t) }))
        const body: Record<string, unknown> = {}
        if (updates.title !== undefined) body.title = updates.title
        if (updates.status !== undefined) body.status = updates.status
        if (updates.priority !== undefined) body.priority = updates.priority
        if (updates.order !== undefined) body.order = updates.order
        if (updates.timeStart !== undefined) body.timeStart = hourToTime(updates.timeStart)
        if (updates.timeEnd !== undefined) body.timeEnd = hourToTime(updates.timeEnd)
        if (updates.delegatee !== undefined) body.delegatee = updates.delegatee
        if (updates.note !== undefined) body.note = updates.note
        if (updates.roleId !== undefined) body.roleId = updates.roleId ? Number(updates.roleId) : null
        if (updates.date !== undefined) body.date = updates.date
        if (Object.keys(body).length > 0) api.put(`/api/planner/tasks/${id}`, body)
      },

      deleteTask: (id) => {
        set(s => ({ tasks: s.tasks.filter(t => t.id !== id) }))
        api.del(`/api/planner/tasks/${id}`)
      },

      forwardTask: (id) => {
        const { tasks } = get()
        const task = tasks.find(t => t.id === id)
        if (!task) return
        const nextDate = new Date(task.date)
        nextDate.setDate(nextDate.getDate() + 1)
        const newDateStr = format(nextDate, "yyyy-MM-dd")
        const nextDayTasks = tasks.filter(t => t.priority === task.priority && t.date === newDateStr)
        const tempId = uid()
        const forwardedTask: Task = { ...task, id: tempId, status: "pending", date: newDateStr, order: nextDayTasks.length, timeStart: undefined, timeEnd: undefined, forwardedFromId: id }
        set(s => ({ tasks: [...s.tasks.map(t => t.id === id ? { ...t, status: "forwarded" as TaskStatus } : t), forwardedTask] }))
        api.post(`/api/planner/tasks/${id}/forward`, {}).then(res => {
          if (res?.id) set(s => ({ tasks: s.tasks.map(t => t.id === tempId ? { ...t, id: String(res.id) } : t) }))
        })
      },

      reorderTasks: (priority, date, orderedIds) => {
        set(s => ({ tasks: s.tasks.map(t => {
          if (t.priority !== priority || t.date !== date) return t
          const idx = orderedIds.indexOf(t.id)
          return idx >= 0 ? { ...t, order: idx } : t
        }) }))
        api.put("/api/planner/tasks/reorder", { items: orderedIds.map((id, i) => ({ id: Number(id), order: i })) })
      },

      // ─�� Inbox ─────────────────────────────────────────────────────────────

      addInboxTask: (title, _roleId) => {
        const { inboxTasks } = get()
        const tempId = uid()
        const newTask: Task = { id: tempId, title, status: "pending", priority: "B", order: inboxTasks.length, roleId: "", date: get().selectedDate }
        set({ inboxTasks: [...inboxTasks, newTask] })
        api.post("/api/planner/inbox", { title }).then(res => {
          if (res?.id) set(s => ({ inboxTasks: s.inboxTasks.map(t => t.id === tempId ? { ...t, id: String(res.id) } : t) }))
        })
      },

      moveInboxToTasks: (id, priority) => {
        const { inboxTasks, tasks, selectedDate } = get()
        const task = inboxTasks.find(t => t.id === id)
        if (!task) return
        const samePriority = tasks.filter(t => t.priority === priority && t.date === selectedDate)
        const movedTask: Task = { ...task, priority, status: "pending", order: samePriority.length, date: selectedDate }
        set({ inboxTasks: inboxTasks.filter(t => t.id !== id), tasks: [...tasks, movedTask] })
        api.post(`/api/planner/inbox/${id}/promote`, { priority, date: selectedDate })
      },

      deleteInboxTask: (id) => {
        set(s => ({ inboxTasks: s.inboxTasks.filter(t => t.id !== id) }))
        api.del(`/api/planner/inbox/${id}`)
      },

      // ── Roles ─────────────────────────────────────────────────────────────

      addRole: (name, color, bigRock, mission) => {
        const tempId = uid()
        set(s => ({ roles: [...s.roles, { id: tempId, name, color, bigRock, mission }] }))
        api.post("/api/planner/roles", { name, color, bigRock, mission }).then(res => {
          if (res?.id) set(s => ({ roles: s.roles.map(r => r.id === tempId ? { ...r, id: String(res.id) } : r) }))
        })
      },

      updateRole: (id, updates) => {
        set(s => ({ roles: s.roles.map(r => r.id === id ? { ...r, ...updates } : r) }))
        api.put(`/api/planner/roles/${id}`, updates)
      },

      updateRoleBigRock: (id, bigRock) => {
        set(s => ({ roles: s.roles.map(r => r.id === id ? { ...r, bigRock } : r) }))
        api.put(`/api/planner/roles/${id}`, { bigRock })
      },

      deleteRole: (id) => {
        set(s => ({ roles: s.roles.filter(r => r.id !== id) }))
        api.del(`/api/planner/roles/${id}`)
      },

      // ── Weekly Goals ───────��──────────────────────────────────────────────

      addWeeklyGoal: (roleId, title, weekStart) => {
        const ws = weekStart ?? getWeekStart()
        const tempId = uid()
        set(s => ({ weeklyGoals: [...s.weeklyGoals, { id: tempId, roleId, title, done: false, weekStart: ws }] }))
        api.post("/api/planner/weekly-goals", { roleId: Number(roleId), title, weekStart: ws }).then(res => {
          if (res?.id) set(s => ({ weeklyGoals: s.weeklyGoals.map(g => g.id === tempId ? { ...g, id: String(res.id) } : g) }))
        })
      },

      toggleWeeklyGoal: (id) => {
        set(s => ({ weeklyGoals: s.weeklyGoals.map(g => g.id === id ? { ...g, done: !g.done } : g) }))
        api.patch(`/api/planner/weekly-goals/${id}/toggle`)
      },

      deleteWeeklyGoal: (id) => {
        set(s => ({ weeklyGoals: s.weeklyGoals.filter(g => g.id !== id) }))
        api.del(`/api/planner/weekly-goals/${id}`)
      },

      addWeeklyGoalAsTask: (id, priority) => {
        const { weeklyGoals, tasks, selectedDate } = get()
        const wg = weeklyGoals.find(g => g.id === id)
        if (!wg) return
        const samePriority = tasks.filter(t => t.priority === priority && t.date === selectedDate)
        const tempId = uid()
        const newTask: Task = { id: tempId, title: wg.title, status: "pending", priority, order: samePriority.length, roleId: wg.roleId, date: selectedDate }
        set(s => ({ tasks: [...s.tasks, newTask] }))
        api.post("/api/planner/tasks", { title: wg.title, priority, roleId: Number(wg.roleId), date: selectedDate }).then(res => {
          if (res?.id) set(s => ({ tasks: s.tasks.map(t => t.id === tempId ? { ...t, id: String(res.id) } : t) }))
        })
      },

      // ── Goals ──────────────────────────────────────────────────────────────

      addGoal: (title, roleId, dueDate, description) => {
        const tempId = uid()
        set(s => ({ goals: [...s.goals, { id: tempId, title, roleId, dueDate, description }] }))
        api.post("/api/planner/goals", { title, roleId: roleId ? Number(roleId) : null, dueDate, description }).then(res => {
          if (res?.id) set(s => ({ goals: s.goals.map(g => g.id === tempId ? { ...g, id: String(res.id) } : g) }))
        })
      },

      updateGoal: (id, updates) => {
        set(s => ({ goals: s.goals.map(g => g.id === id ? { ...g, ...updates } : g) }))
        api.put(`/api/planner/goals/${id}`, updates)
      },

      deleteGoal: (id) => {
        set(s => ({ goals: s.goals.filter(g => g.id !== id) }))
        api.del(`/api/planner/goals/${id}`)
      },

      // ── Diary ─────���────────────────────────────────────────────────────────

      setDiaryEntry: (date, entry) => {
        const prev = get().diaryEntries[date]
        const merged: DiaryEntry = { date, oneLiner: prev?.oneLiner ?? "", mood: prev?.mood ?? "neutral", fullNote: prev?.fullNote, ...entry }
        set(s => ({ diaryEntries: { ...s.diaryEntries, [date]: merged } }))
        api.put("/api/planner/diary", { date: merged.date, oneLiner: merged.oneLiner, mood: merged.mood, fullNote: merged.fullNote ?? "" })
      },

      setReflectionNote: (date, note) => {
        set(s => ({ reflectionNotes: { ...s.reflectionNotes, [date]: note } }))
        let notes: unknown = []
        try { notes = JSON.parse(note) } catch { notes = [] }
        api.put("/api/planner/reflections", { date, notes })
      },

      // ── Computed ──────────────────────────────────────────────────────────

      getTasksForDate: (date) => get().tasks.filter(t => t.date === date),

      getCompletionScore: (date) => {
        const tasks = get().tasks.filter(t => t.date === date)
        if (tasks.length === 0) return 0
        const done = tasks.filter(t => t.status === "done")
        const aDone = tasks.filter(t => t.priority === "A" && t.status === "done").length
        const aTotal = tasks.filter(t => t.priority === "A").length
        const baseScore = done.length / tasks.length
        const aPenalty = aTotal > 0 ? aDone / aTotal : 1
        return Math.round(baseScore * 0.4 * 100 + aPenalty * 0.6 * 100)
      },

      getRoleBalance: (date) => {
        const tasks = get().tasks.filter(t => t.date === date)
        const balance: Record<string, number> = {}
        get().roles.forEach(r => { balance[r.id] = tasks.filter(t => t.roleId === r.id).length })
        return balance
      },

      getDdayGoals: () => {
        const today = getToday()
        return get().goals.map(g => {
          const due = new Date(g.dueDate)
          const now = new Date(today)
          const diffMs = due.getTime() - now.getTime()
          const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
          return { ...g, daysLeft, urgent: daysLeft <= 7 && daysLeft >= 0 }
        }).sort((a, b) => a.daysLeft - b.daysLeft)
      },

      getWeekBalance: (weekStart) => {
        const ws = weekStart ?? getWeekStart()
        const goals = get().weeklyGoals.filter(g => g.weekStart === ws)
        const balance: Record<string, number> = {}
        get().roles.forEach(r => { balance[r.id] = goals.filter(g => g.roleId === r.id).length })
        return balance
      },

      getUnassignedRoles: (weekStart) => {
        const ws = weekStart ?? getWeekStart()
        const rolesWithGoals = new Set(get().weeklyGoals.filter(g => g.weekStart === ws).map(g => g.roleId))
        return get().roles.filter(r => !rolesWithGoals.has(r.id))
      },
    })
)
