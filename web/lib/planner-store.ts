"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
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
  timeStart?: number // e.g. 9 = 09:00
  timeEnd?: number   // e.g. 10 = 10:00
  delegatee?: string
  note?: string
  date: string       // YYYY-MM-DD
  forwardedFromId?: string
}

export interface Role {
  id: string
  name: string
  color: string
  bigRock: string   // legacy single big rock (kept for compat)
  mission?: string  // "이 역할로서 나는 어떤 사람이 되고 싶은가"
}

export interface WeeklyGoal {
  id: string
  roleId: string
  title: string
  done: boolean
  weekStart: string   // YYYY-MM-DD of that week's Monday
}

export interface Goal {
  id: string
  title: string
  roleId: string
  dueDate: string     // YYYY-MM-DD
  description?: string
  linkedTaskIds?: string[]
}

export interface DiaryEntry {
  date: string          // YYYY-MM-DD (key)
  oneLiner: string      // 한 줄 일기
  mood: "great" | "good" | "neutral" | "tired" | "rough"
  fullNote?: string     // 자유 기록 (기존 reflectionNote 통합)
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

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

// addDays = addDaysStr alias used by SAMPLE_GOALS
function addDays(dateStr: string, n: number): string {
  return addDaysStr(dateStr, n)
}

const SAMPLE_ROLES: Role[] = [
  { id: "r1", name: "Leader", color: "#58A6FF", bigRock: "Q2 전략 방향 확정 및 팀 얼라인", mission: "팀이 최선의 결과를 낼 수 있도록 방향을 제시하는 리더가 된다" },
  { id: "r2", name: "Parent", color: "#3FB950", bigRock: "주말 가족 여행 계획 수립", mission: "아이들에게 존재만으로 안정감을 주는 부모가 된다" },
  { id: "r3", name: "Learner", color: "#E3A948", bigRock: "AI/ML 온라인 과정 2강 완료", mission: "매주 한 가지를 깊이 배워 삶에 적용한다" },
  { id: "r4", name: "Creator", color: "#BC8CFF", bigRock: "블로그 포스트 초안 작성 완료", mission: "나만의 시각으로 세상에 가치 있는 것을 만든다" },
]

function getWeekStart(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr) : new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const THIS_WEEK = getWeekStart()

const SAMPLE_WEEKLY_GOALS: WeeklyGoal[] = [
  { id: "wg1", roleId: "r1", title: "Q2 성과 리뷰 슬라이드 완성", done: false, weekStart: THIS_WEEK },
  { id: "wg2", roleId: "r1", title: "팀원 1:1 미팅 3회 완료", done: false, weekStart: THIS_WEEK },
  { id: "wg3", roleId: "r2", title: "주말 가족 나들이 장소 예약", done: true, weekStart: THIS_WEEK },
  { id: "wg4", roleId: "r3", title: "AI 강의 2강 수강 완료", done: false, weekStart: THIS_WEEK },
  { id: "wg5", roleId: "r4", title: "블로그 초안 1,500자 작성", done: false, weekStart: THIS_WEEK },
]

function makeDiaryNotes(entries: { id: string; text: string; createdAt: string }[]): string {
  return JSON.stringify(entries)
}

const SAMPLE_DIARY_ENTRIES: Record<string, DiaryEntry> = {
  [TODAY]: {
    date: TODAY,
    mood: "good",
    oneLiner: "집중력 있게 흘러간 하루. 보고서는 마무리 못했지만 방향이 잡혔다.",
  },
  [addDaysStr(TODAY, -1)]: {
    date: addDaysStr(TODAY, -1),
    mood: "great",
    oneLiner: "팀 스프린트 리뷰가 잘 마무리됐다. 에너지가 넘쳤던 하루.",
  },
  [addDaysStr(TODAY, -2)]: {
    date: addDaysStr(TODAY, -2),
    mood: "neutral",
    oneLiner: "평범하지만 꾸준한 하루. 강의 1강 완료.",
  },
  [addDaysStr(TODAY, -3)]: {
    date: addDaysStr(TODAY, -3),
    mood: "tired",
    oneLiner: "회의가 너무 많았다. 내일은 딥워크 블록을 꼭 지키자.",
  },
  [addDaysStr(TODAY, -5)]: {
    date: addDaysStr(TODAY, -5),
    mood: "great",
    oneLiner: "블로그 초안 완성! 오랜만에 창작의 기쁨을 느꼈다.",
  },
}

const SAMPLE_REFLECTION_NOTES: Record<string, string> = {
  [TODAY]: makeDiaryNotes([
    {
      id: "n1",
      text: "오전 집중 세션이 생각보다 잘 됐다. Q2 전략의 핵심 방향을 세 가지로 압축했는데, '선택과 집중'이 키워드인 것 같다.\n\n오후에는 팀원 1:1이 있었는데 민준이가 번아웃 직전이라는 걸 느꼈다. 다음 주에 업무 조정이 필요하다.",
      createdAt: new Date(new Date().setHours(10, 30)).toISOString(),
    },
    {
      id: "n2",
      text: "저녁에 AI 강의를 듣다가 Transformer 아키텍처 설명에서 막혔다. 내일 다시 정독해야겠다. 모르는 것을 인정하는 것도 성장이라고 생각하자.",
      createdAt: new Date(new Date().setHours(21, 15)).toISOString(),
    },
  ]),
  [addDaysStr(TODAY, -1)]: makeDiaryNotes([
    {
      id: "n3",
      text: "스프린트 리뷰에서 팀이 자신감 있게 발표하는 모습이 뿌듯했다. 6개월 전과 비교하면 정말 많이 성장했다.\n\n'리더의 역할은 팀이 빛날 수 있는 무대를 만드는 것'이라는 걸 다시 느꼈다.",
      createdAt: new Date(new Date().setHours(19, 0)).toISOString(),
    },
    {
      id: "n4",
      text: "퇴근 후 아이와 공원 산책 30분. 아무것도 안 하는 시간이 오히려 머릿속을 정리해줬다. 일과 가정의 균형을 위해 이런 시간을 의식적으로 만들어야 한다.",
      createdAt: new Date(new Date().setHours(20, 45)).toISOString(),
    },
  ]),
  [addDaysStr(TODAY, -2)]: makeDiaryNotes([
    {
      id: "n5",
      text: "AI 강의 1강 완료. 선형대수 기초부터 다시 시작하는 게 맞는 것 같다. 빠르게 가려다 오히려 더 느려지는 패턴을 반복하지 말자.",
      createdAt: new Date(new Date().setHours(22, 0)).toISOString(),
    },
  ]),
  [addDaysStr(TODAY, -3)]: makeDiaryNotes([
    {
      id: "n6",
      text: "오늘의 교훈: 회의는 결정을 위해 존재한다. 정보 공유만을 위한 회의는 이메일로 대체할 수 있다. 다음 팀 회의 때 이 원칙을 제안해보자.",
      createdAt: new Date(new Date().setHours(18, 30)).toISOString(),
    },
  ]),
  [addDaysStr(TODAY, -5)]: makeDiaryNotes([
    {
      id: "n7",
      text: "블로그 초안 1,800자 완성. 주제는 '일잘러의 우선순위 관리법'으로 잡았다. 내가 실제로 쓰는 방법을 솔직하게 쓰니 더 잘 써졌다.\n\n독자의 고통에서 시작해서 솔루션으로 끝나는 구조가 효과적인 것 같다. 다음 편도 이 패턴으로 가자.",
      createdAt: new Date(new Date().setHours(16, 20)).toISOString(),
    },
    {
      id: "n8",
      text: "글을 쓰면서 내 생각이 더 명확해진다는 걸 다시 느꼈다. 주 1회 블��그는 단순한 콘텐츠 생산이 아니라 자기 성찰의 도구다.",
      createdAt: new Date(new Date().setHours(17, 0)).toISOString(),
    },
  ]),
}

const SAMPLE_GOALS: Goal[] = [
  {
    id: "g1", title: "스타니온 MVP 출시", roleId: "r4",
    dueDate: addDays(TODAY, 30),
    description: "핵심 기능 구현 완료 후 베타 사용자 100명 모집",
  },
  {
    id: "g2", title: "AI/ML 자격증 취득", roleId: "r3",
    dueDate: addDays(TODAY, 60),
    description: "온라인 강의 완료 후 시험 응시",
  },
  {
    id: "g3", title: "Q2 성과 리뷰 발표", roleId: "r1",
    dueDate: addDays(TODAY, 7),
    description: "팀 성과 데이터 취합 및 슬라이드 완성",
  },
]

const SAMPLE_TASKS: Task[] = [
  {
    id: "t1", title: "Q2 전략 회의 자료 준비", status: "pending",
    priority: "A", order: 0, roleId: "r1", timeStart: 9, timeEnd: 11, date: TODAY,
  },
  {
    id: "t2", title: "핵심 보고서 제출 (마감 오늘)", status: "in-progress",
    priority: "A", order: 1, roleId: "r1", timeStart: 14, timeEnd: 16, date: TODAY,
  },
  {
    id: "t3", title: "팀원 성과 리뷰 피드백 작성", status: "pending",
    priority: "A", order: 2, roleId: "r1", date: TODAY,
  },
  {
    id: "t4", title: "코드 리뷰 완료 (PR #247)", status: "done",
    priority: "B", order: 0, roleId: "r4", timeStart: 11, timeEnd: 12, date: TODAY,
  },
  {
    id: "t5", title: "팀원 1:1 미팅 (박민준)", status: "pending",
    priority: "B", order: 1, roleId: "r1", timeStart: 16, timeEnd: 17, date: TODAY,
  },
  {
    id: "t6", title: "AI 강의 1강 수강", status: "forwarded",
    priority: "B", order: 2, roleId: "r3", date: TODAY,
  },
  {
    id: "t7", title: "이메일 정리 및 답장", status: "pending",
    priority: "C", order: 0, roleId: "r1", date: TODAY,
  },
  {
    id: "t8", title: "LinkedIn 프로필 업데이트", status: "pending",
    priority: "C", order: 1, roleId: "r3", date: TODAY,
  },
]

const SAMPLE_INBOX: Task[] = [
  {
    id: "i1", title: "디자인팀 협업 요청 검토", status: "pending",
    priority: "A", order: 0, roleId: "r1", date: TODAY,
  },
  {
    id: "i2", title: "서버 비용 최적화 검토", status: "pending",
    priority: "B", order: 1, roleId: "r4", date: TODAY,
  },
  {
    id: "i3", title: "신입 온보딩 문서 갱신", status: "pending",
    priority: "C", order: 2, roleId: "r1", date: TODAY,
  },
]

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

  // Weekly Goals (Big Rocks)
  addWeeklyGoal: (roleId: string, title: string, weekStart?: string) => void
  toggleWeeklyGoal: (id: string) => void
  deleteWeeklyGoal: (id: string) => void
  addWeeklyGoalAsTask: (id: string, priority: Priority) => void

  // Goals / D-Day
  addGoal: (title: string, roleId: string, dueDate: string, description?: string) => void
  updateGoal: (id: string, updates: Partial<Goal>) => void
  deleteGoal: (id: string) => void

  // Diary
  setDiaryEntry: (date: string, entry: Partial<DiaryEntry>) => void

  // Reflection (legacy compat)
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
  persist(
    (set, get) => ({
      selectedDate: TODAY,
      tasks: SAMPLE_TASKS,
      inboxTasks: SAMPLE_INBOX,
      roles: SAMPLE_ROLES,
      goals: SAMPLE_GOALS,
      weeklyGoals: SAMPLE_WEEKLY_GOALS,
      diaryEntries: SAMPLE_DIARY_ENTRIES,
      missionStatement:
        "내가 맡은 모든 역할에서 최선을 다하고, 나의 가치와 일치하는 선택을 하며, 주변 사람들에게 긍정적인 영향을 미치는 삶을 산다.",
      reflectionNotes: SAMPLE_REFLECTION_NOTES,

      setSelectedDate: (date) => set({ selectedDate: date }),
      setMissionStatement: (text) => set({ missionStatement: text }),

      addTask: (priority, title, roleId) => {
        const { tasks, selectedDate } = get()
        const samePriorityTasks = tasks.filter(
          (t) => t.priority === priority && t.date === selectedDate
        )
        const newTask: Task = {
          id: uid(),
          title,
          status: "pending",
          priority,
          order: samePriorityTasks.length,
          roleId,
          date: selectedDate,
        }
        set({ tasks: [...tasks, newTask] })
      },

      updateTask: (id, updates) =>
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        })),

      deleteTask: (id) =>
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),

      forwardTask: (id) => {
        const { tasks } = get()
        const task = tasks.find((t) => t.id === id)
        if (!task) return
        const nextDate = new Date(task.date)
        nextDate.setDate(nextDate.getDate() + 1)
        const newDateStr = format(nextDate, "yyyy-MM-dd")
        const nextDayTasks = tasks.filter(
          (t) => t.priority === task.priority && t.date === newDateStr
        )
        const forwardedTask: Task = {
          ...task,
          id: uid(),
          status: "pending",
          date: newDateStr,
          order: nextDayTasks.length,
          timeStart: undefined,
          timeEnd: undefined,
          forwardedFromId: id,
        }
        set((s) => ({
          tasks: [
            ...s.tasks.map((t) =>
              t.id === id ? { ...t, status: "forwarded" as TaskStatus } : t
            ),
            forwardedTask,
          ],
        }))
      },

      reorderTasks: (priority, date, orderedIds) =>
        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.priority !== priority || t.date !== date) return t
            const idx = orderedIds.indexOf(t.id)
            return idx >= 0 ? { ...t, order: idx } : t
          }),
        })),

      addInboxTask: (title, roleId) => {
        const { inboxTasks } = get()
        const newTask: Task = {
          id: uid(),
          title,
          status: "pending",
          priority: "B",
          order: inboxTasks.length,
          roleId,
          date: get().selectedDate,
        }
        set({ inboxTasks: [...inboxTasks, newTask] })
      },

      moveInboxToTasks: (id, priority) => {
        const { inboxTasks, tasks, selectedDate } = get()
        const task = inboxTasks.find((t) => t.id === id)
        if (!task) return
        const samePriority = tasks.filter(
          (t) => t.priority === priority && t.date === selectedDate
        )
        const movedTask: Task = {
          ...task,
          priority,
          status: "pending",
          order: samePriority.length,
          date: selectedDate,
        }
        set({
          inboxTasks: inboxTasks.filter((t) => t.id !== id),
          tasks: [...tasks, movedTask],
        })
      },

      deleteInboxTask: (id) =>
        set((s) => ({ inboxTasks: s.inboxTasks.filter((t) => t.id !== id) })),

      addRole: (name, color, bigRock, mission) =>
        set((s) => ({
          roles: [...s.roles, { id: uid(), name, color, bigRock, mission }],
        })),

      updateRole: (id, updates) =>
        set((s) => ({
          roles: s.roles.map((r) => (r.id === id ? { ...r, ...updates } : r)),
        })),

      updateRoleBigRock: (id, bigRock) =>
        set((s) => ({
          roles: s.roles.map((r) => (r.id === id ? { ...r, bigRock } : r)),
        })),

      deleteRole: (id) =>
        set((s) => ({ roles: s.roles.filter((r) => r.id !== id) })),

      addWeeklyGoal: (roleId, title, weekStart) =>
        set((s) => ({
          weeklyGoals: [
            ...s.weeklyGoals,
            { id: uid(), roleId, title, done: false, weekStart: weekStart ?? getWeekStart() },
          ],
        })),

      toggleWeeklyGoal: (id) =>
        set((s) => ({
          weeklyGoals: s.weeklyGoals.map((g) =>
            g.id === id ? { ...g, done: !g.done } : g
          ),
        })),

      deleteWeeklyGoal: (id) =>
        set((s) => ({ weeklyGoals: s.weeklyGoals.filter((g) => g.id !== id) })),

      addWeeklyGoalAsTask: (id, priority) => {
        const { weeklyGoals, tasks, selectedDate, roles } = get()
        const wg = weeklyGoals.find((g) => g.id === id)
        if (!wg) return
        const samePriority = tasks.filter(
          (t) => t.priority === priority && t.date === selectedDate
        )
        const newTask: Task = {
          id: uid(),
          title: wg.title,
          status: "pending",
          priority,
          order: samePriority.length,
          roleId: wg.roleId,
          date: selectedDate,
        }
        set((s) => ({ tasks: [...s.tasks, newTask] }))
      },

      addGoal: (title, roleId, dueDate, description) =>
        set((s) => ({
          goals: [...s.goals, { id: uid(), title, roleId, dueDate, description }],
        })),

      updateGoal: (id, updates) =>
        set((s) => ({
          goals: s.goals.map((g) => (g.id === id ? { ...g, ...updates } : g)),
        })),

      deleteGoal: (id) =>
        set((s) => ({ goals: s.goals.filter((g) => g.id !== id) })),

      setDiaryEntry: (date, entry) =>
        set((s) => ({
          diaryEntries: {
            ...s.diaryEntries,
            [date]: { date, oneLiner: "", mood: "neutral", ...s.diaryEntries[date], ...entry },
          },
        })),

      setReflectionNote: (date, note) =>
        set((s) => ({ reflectionNotes: { ...s.reflectionNotes, [date]: note } })),

      getTasksForDate: (date) => get().tasks.filter((t) => t.date === date),

      getCompletionScore: (date) => {
        const tasks = get().tasks.filter((t) => t.date === date)
        if (tasks.length === 0) return 0
        const done = tasks.filter((t) => t.status === "done")
        const aDone = tasks.filter(
          (t) => t.priority === "A" && t.status === "done"
        ).length
        const aTotal = tasks.filter((t) => t.priority === "A").length
        const baseScore = done.length / tasks.length
        const aPenalty = aTotal > 0 ? aDone / aTotal : 1
        return Math.round(baseScore * 0.4 * 100 + aPenalty * 0.6 * 100)
      },

      getRoleBalance: (date) => {
        const tasks = get().tasks.filter((t) => t.date === date)
        const balance: Record<string, number> = {}
        get().roles.forEach((r) => {
          balance[r.id] = tasks.filter((t) => t.roleId === r.id).length
        })
        return balance
      },

      getDdayGoals: () => {
        const today = getToday()
        return get().goals
          .map((g) => {
            const due = new Date(g.dueDate)
            const now = new Date(today)
            const diffMs = due.getTime() - now.getTime()
            const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
            return { ...g, daysLeft, urgent: daysLeft <= 7 && daysLeft >= 0 }
          })
          .sort((a, b) => a.daysLeft - b.daysLeft)
      },

      getWeekBalance: (weekStart) => {
        const ws = weekStart ?? getWeekStart()
        const goals = get().weeklyGoals.filter((g) => g.weekStart === ws)
        const balance: Record<string, number> = {}
        get().roles.forEach((r) => {
          balance[r.id] = goals.filter((g) => g.roleId === r.id).length
        })
        return balance
      },

      getUnassignedRoles: (weekStart) => {
        const ws = weekStart ?? getWeekStart()
        const rolesWithGoals = new Set(
          get().weeklyGoals
            .filter((g) => g.weekStart === ws)
            .map((g) => g.roleId)
        )
        return get().roles.filter((r) => !rolesWithGoals.has(r.id))
      },
    }),
    { name: "franklin-planner-v3" }
  )
)
