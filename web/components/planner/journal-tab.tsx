"use client"

import { useState, useEffect } from "react"
import { usePlannerStore, type Priority } from "@/lib/planner-store"
import { cn } from "@/lib/utils"
import {
  BookMarked, Inbox, BarChart2, Plus, Trash2, ArrowRight,
  Search, Upload, LayoutGrid, List, RefreshCw, FileText,
  Image as ImageIcon, Music, Sparkles, Folder, MoreVertical,
  Download, Copy, Pencil, Trash,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

type JournalSection = "diary" | "inbox" | "stats"

const REFLECTION_PROMPTS = [
  "오늘 가장 잘한 일은 무엇인가?",
  "놓친 A 업무이 있다면 이유는 무엇인가?",
  "내일 가장 먼저 해야 할 일은?",
  "오늘 나의 역할을 얼마나 충실히 이행했는가?",
]

const MOOD_OPTIONS = [
  { key: "great" as const, label: "최고", symbol: "★★★" },
  { key: "good" as const, label: "좋음", symbol: "★★" },
  { key: "neutral" as const, label: "보통", symbol: "★" },
  { key: "tired" as const, label: "피곤", symbol: "△" },
  { key: "rough" as const, label: "힘듦", symbol: "▽" },
]

const PRIORITY_COLORS: Record<Priority, string> = {
  A: "var(--priority-a)",
  B: "var(--priority-b)",
  C: "var(--muted-foreground)",
}

// ── Diary panel ──────────────────────────────────────────────────────────────

function DiaryPanel() {
  const {
    selectedDate, diaryEntries, setDiaryEntry,
    reflectionNotes, setReflectionNote,
  } = usePlannerStore()

  const entry = diaryEntries[selectedDate]
  const legacyNote = reflectionNotes[selectedDate] ?? ""

  const [oneLiner, setOneLiner] = useState(entry?.oneLiner ?? "")
  const [mood, setMood] = useState<typeof MOOD_OPTIONS[number]["key"]>(entry?.mood ?? "neutral")
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
    <div className="flex flex-col h-full overflow-y-auto px-6 py-4 space-y-5">
      {/* Mood picker */}
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">오늘의 컨디션</p>
        <div className="flex gap-2">
          {MOOD_OPTIONS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMood(m.key)}
              className={cn(
                "flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs transition-all font-medium",
                mood === m.key ? "border-transparent" : "border-border bg-muted/30 text-muted-foreground hover:bg-accent/30"
              )}
              style={mood === m.key
                ? { background: "var(--priority-a-bg)", color: "var(--priority-a)", border: "1px solid var(--priority-a)" }
                : {}}
            >
              <span className="text-sm leading-none">{m.symbol}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* One-liner */}
      <div className="space-y-1.5">
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">오늘의 한 줄</p>
        <Input
          value={oneLiner}
          onChange={(e) => setOneLiner(e.target.value)}
          placeholder="오늘 하루를 한 문장으로 요약한다면?"
          className="h-9 text-sm bg-muted border-border"
          maxLength={80}
        />
        <p className="text-xs text-muted-foreground text-right">{oneLiner.length}/80</p>
      </div>

      {/* Reflection prompts */}
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">성찰 질문</p>
        <div className="grid grid-cols-2 gap-1.5">
          {REFLECTION_PROMPTS.map((prompt, i) => (
            <button
              key={i}
              onClick={() => {
                const prefix = `${i + 1}. ${prompt}\n`
                if (!fullNote.includes(prompt)) {
                  setFullNote((d) => (d ? `${d}\n\n${prefix}` : prefix))
                }
              }}
              className="flex items-start gap-2 px-2.5 py-2 rounded-lg border border-border bg-card hover:bg-accent/30 transition-colors text-left"
            >
              <span
                className="w-4 h-4 rounded text-xs font-bold flex items-center justify-center shrink-0 mt-px"
                style={{ background: "var(--priority-a-bg)", color: "var(--priority-a)" }}
              >
                {i + 1}
              </span>
              <p className="text-xs text-muted-foreground leading-snug">{prompt}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Full note */}
      <div className="space-y-1.5 flex-1">
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">자유 기록</p>
        <Textarea
          value={fullNote}
          onChange={(e) => setFullNote(e.target.value)}
          placeholder="오늘의 생각, 배움, 감사함을 자유롭게 기록하세요..."
          className="text-sm bg-muted border-border resize-none leading-relaxed"
          rows={8}
        />
      </div>

      <Button
        onClick={handleSave}
        className="w-full"
        style={{ background: saved ? "var(--status-done)" : "var(--priority-a)", color: "#ffffff" }}
      >
        {saved ? "저장됨" : "저장"}
      </Button>
    </div>
  )
}

// ── Inbox panel ──────────────────────────────────────────────────────────────

function InboxPanel() {
  const { inboxTasks, roles, addInboxTask, deleteInboxTask, moveInboxToTask, selectedDate } = usePlannerStore()
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newRoleId, setNewRoleId] = useState(roles[0]?.id ?? "")
  const [moveTarget, setMoveTarget] = useState<Record<string, Priority>>({})

  const handleAdd = () => {
    if (!newTitle.trim()) return
    addInboxTask(newTitle.trim(), newRoleId || roles[0]?.id)
    setNewTitle(""); setAdding(false)
  }

  const handleMove = (taskId: string) => {
    moveInboxToTask(taskId, moveTarget[taskId] ?? "B", selectedDate)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Inbox className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">인박스</span>
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
          aria-label="인박스 추가"
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
            placeholder="빠르게 캡처..."
            className="h-8 text-xs bg-muted border-border"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd()
              if (e.key === "Escape") { setAdding(false); setNewTitle("") }
            }}
          />
          <div className="flex gap-2">
            <Select value={newRoleId} onValueChange={setNewRoleId}>
              <SelectTrigger className="h-6 text-xs bg-muted border-border flex-1">
                <SelectValue placeholder="역할" />
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
              추가
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-3 space-y-2">
        {inboxTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
            <Inbox className="w-8 h-8 opacity-30" />
            <p className="text-sm">인박스가 비어 있습니다</p>
            <p className="text-xs opacity-60">빠른 아이디어나 요청사항을 여기에 캡처하세요</p>
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
                    aria-label="삭제"
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
                    업무으로
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

// ── Stats panel ───────────────────────────────────────────────────────────────

function StatsPanel() {
  const { tasks, roles, selectedDate, getCompletionScore, getRoleBalance } = usePlannerStore()
  const score = getCompletionScore(selectedDate)
  const balance = getRoleBalance(selectedDate)
  const totalBalance = Object.values(balance).reduce((a, b) => a + b, 0)

  // Last 7 days completion
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() - (6 - i))
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    const dayTasks = tasks.filter((t) => t.date === dateStr && t.priority !== "C")
    const done = dayTasks.filter((t) => t.status === "done").length
    const total = dayTasks.length
    return { dateStr, pct: total === 0 ? 0 : Math.round((done / total) * 100), label: `${d.getMonth() + 1}/${d.getDate()}` }
  })

  return (
    <div className="flex flex-col h-full overflow-y-auto px-6 py-4 space-y-6">
      {/* Today score */}
      <div
        className="rounded-xl p-5 space-y-2"
        style={{ background: "var(--priority-a-bg)", border: "1px solid var(--priority-a)" }}
      >
        <p className="text-xs uppercase tracking-widest font-medium" style={{ color: "var(--priority-a)" }}>오늘의 완료율</p>
        <div className="flex items-end gap-2">
          <span className="text-4xl font-bold tabular-nums" style={{ color: "var(--priority-a)" }}>
            {score}%
          </span>
          <span className="text-xs text-muted-foreground pb-1">(A+B 기준)</span>
        </div>
        <div className="h-2 rounded-full bg-black/10 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${score}%`, background: "var(--priority-a)" }}
          />
        </div>
      </div>

      {/* Role balance */}
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">역할별 업무 분포</p>
        {roles.map((role) => {
          const count = balance[role.id] ?? 0
          const pct = totalBalance === 0 ? 0 : Math.round((count / totalBalance) * 100)
          return (
            <div key={role.id} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: role.color }} />
                  <span className="text-foreground">{role.name}</span>
                </div>
                <span className="text-muted-foreground tabular-nums">{count}개 ({pct}%)</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: role.color }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Weekly completion chart */}
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">최근 7일 완료율</p>
        <div className="flex items-end gap-1.5 h-20">
          {last7.map((d) => (
            <div key={d.dateStr} className="flex flex-col items-center gap-1 flex-1">
              <div className="w-full flex items-end bg-muted rounded-sm overflow-hidden" style={{ height: 56 }}>
                <div
                  className="w-full rounded-sm transition-all duration-500"
                  style={{
                    height: `${Math.max(2, d.pct)}%`,
                    background: d.dateStr === selectedDate ? "var(--priority-a)" : "var(--primary)",
                    opacity: d.dateStr === selectedDate ? 1 : 0.5,
                  }}
                />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">{d.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── JournalTab ────────────────────────────────────────────────────────────────

export function JournalTab() {
  const [section, setSection] = useState<JournalSection>("diary")

  const SECTIONS: { id: JournalSection; label: string; icon: React.ReactNode }[] = [
    { id: "diary",  label: "일기",   icon: <BookMarked className="w-3.5 h-3.5" /> },
    { id: "inbox",  label: "인박스", icon: <Inbox className="w-3.5 h-3.5" /> },
    { id: "stats",  label: "통계",   icon: <BarChart2 className="w-3.5 h-3.5" /> },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sub-tab row */}
      <div className="flex items-center gap-0 px-6 border-b border-border shrink-0 bg-card/40">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-3 text-xs font-medium transition-colors relative",
              section === s.id
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {s.icon}
            {s.label}
            {section === s.id && (
              <span
                className="absolute bottom-0 left-0 right-0 h-0.5"
                style={{ background: "var(--primary)" }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {section === "diary"  && <DiaryPanel />}
        {section === "inbox"  && <InboxPanel />}
        {section === "stats"  && <StatsPanel />}
      </div>
    </div>
  )
}

// ── App Section stubs (used by GlobalNav in planner-app.tsx) ──────────────────

export function ChatSection() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center gap-4 text-muted-foreground">
      <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-border flex items-center justify-center">
        <span className="text-2xl">💬</span>
      </div>
      <p className="text-sm font-medium">채팅 기능은 준비 중입니다.</p>
    </div>
  )
}

export function AnalyticsSection() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center gap-4 text-muted-foreground">
      <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-border flex items-center justify-center">
        <span className="text-2xl">📊</span>
      </div>
      <p className="text-sm font-medium">통계/분석 기능은 준비 중입니다.</p>
    </div>
  )
}

// ── FilesSection ──────────────────────────────────────────────────────────────

type FileType = "all" | "doc" | "image" | "audio"
type ViewMode = "grid" | "list"

interface FileItem {
  id: string
  name: string
  type: FileType
  mime: string
  size: string
  date: string
  tags: string[]
  thumb?: string
  color?: string
}

const SAMPLE_FILES: FileItem[] = [
  {
    id: "f1", name: "2024 연간 보고서.pdf", type: "doc", mime: "PDF",
    size: "2.4 MB", date: "2026-04-03", tags: ["보고서", "문서"],
    color: "#F85149",
  },
  {
    id: "f2", name: "generated.jpg", type: "image", mime: "JPEG",
    size: "1.1 MB", date: "2026-04-03", tags: ["JPEG", "generated"],
    thumb: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/2026-04-03_16-54-10-8Vgto63XMYxtsmz1oBrhQFKZTiEhnO.webp",
  },
  {
    id: "f3", name: "generated.jpg", type: "image", mime: "JPEG",
    size: "1.0 MB", date: "2026-04-03", tags: ["JPEG", "generated"],
    thumb: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/2026-04-03_16-54-10-8Vgto63XMYxtsmz1oBrhQFKZTiEhnO.webp",
  },
  {
    id: "f4", name: "회의록_2026_Q1.docx", type: "doc", mime: "DOCX",
    size: "340 KB", date: "2026-03-28", tags: ["회의록", "Q1"],
    color: "#58A6FF",
  },
  {
    id: "f5", name: "배경음악.mp3", type: "audio", mime: "MP3",
    size: "4.2 MB", date: "2026-03-20", tags: ["음악", "MP3"],
    color: "#E3A948",
  },
  {
    id: "f6", name: "프로젝트 기획서.pdf", type: "doc", mime: "PDF",
    size: "1.8 MB", date: "2026-03-15", tags: ["기획", "PDF"],
    color: "#F85149",
  },
]

const TYPE_FILTERS: { id: FileType | "search"; label: string; icon: React.ElementType }[] = [
  { id: "all",    label: "전체",    icon: Folder },
  { id: "doc",    label: "문서",    icon: FileText },
  { id: "image",  label: "이미지",  icon: ImageIcon },
  { id: "audio",  label: "오디오",  icon: Music },
  { id: "search", label: "문서 검색", icon: Sparkles },
]

const MIME_COLORS: Record<string, string> = {
  PDF: "#F85149", DOCX: "#58A6FF", JPEG: "#BC8CFF",
  PNG: "#3FB950", MP3: "#E3A948",
}

export function FilesSection() {
  const [filter,   setFilter]   = useState<FileType | "search">("all")
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [query,    setQuery]    = useState("")
  const [files,    setFiles]    = useState<FileItem[]>(SAMPLE_FILES)
  const [menuId,   setMenuId]   = useState<string | null>(null)

  const filtered = files.filter(f => {
    const matchesType  = filter === "all" || filter === "search" || f.type === filter
    const matchesQuery = !query || f.name.toLowerCase().includes(query.toLowerCase())
    return matchesType && matchesQuery
  })

  const docCount   = files.filter(f => f.type === "doc").length
  const imageCount = files.filter(f => f.type === "image").length
  const audioCount = files.filter(f => f.type === "audio").length

  const counts: Record<string, number> = {
    all: files.length, doc: docCount, image: imageCount, audio: audioCount,
  }

  const deleteFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id))
    setMenuId(null)
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-background">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-5 h-12 border-b border-border shrink-0">
        <span className="text-sm font-bold text-foreground whitespace-nowrap">내 파일</span>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="파일 이름 검색..."
            className="w-full h-8 pl-8 pr-3 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-accent/40 transition-colors">
            <Upload className="w-3.5 h-3.5" />업로드
          </button>
          <button className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-colors"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
            <Plus className="w-3.5 h-3.5" />새로 만들기
          </button>
          <div className="w-px h-5 bg-border" />
          <button className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent/40 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode("grid")}
              className={cn("w-7 h-7 flex items-center justify-center transition-colors",
                viewMode === "grid" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/40")}>
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn("w-7 h-7 flex items-center justify-center transition-colors",
                viewMode === "list" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/40")}>
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 px-5 py-2.5 border-b border-border shrink-0 overflow-x-auto scrollbar-none">
        {TYPE_FILTERS.map(({ id, label, icon: Icon }) => {
          const count = id !== "search" ? counts[id] : undefined
          const isActive = filter === id
          return (
            <button key={id} onClick={() => setFilter(id as FileType | "search")}
              className={cn(
                "shrink-0 flex items-center gap-1.5 h-8 px-3.5 rounded-full text-xs font-medium transition-colors border",
                isActive
                  ? "border-transparent text-white"
                  : "border-border bg-background text-foreground hover:bg-accent/40"
              )}
              style={isActive ? { background: "var(--primary)" } : {}}>
              <Icon className="w-3.5 h-3.5" />
              {label}
              {count !== undefined && count > 0 && (
                <span className={cn("text-xs font-semibold",
                  isActive ? "opacity-80" : "text-muted-foreground")}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* File count */}
      <div className="px-5 py-2 shrink-0">
        <span className="text-xs text-muted-foreground">{filtered.length}개 파일</span>
      </div>

      {/* File grid / list */}
      <div className="flex-1 overflow-y-auto px-5 pb-5"
        onClick={() => setMenuId(null)}>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
            <Folder className="w-10 h-10 opacity-30" />
            <p className="text-sm">파일이 없습니다.</p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filtered.map(file => (
              <div key={file.id}
                className="group relative rounded-xl border border-border bg-card overflow-hidden hover:shadow-md transition-shadow cursor-pointer">
                {/* Thumbnail or icon */}
                <div className="relative aspect-[4/3] bg-muted overflow-hidden">
                  {file.thumb ? (
                    <img src={file.thumb} alt={file.name}
                      className="w-full h-full object-cover"
                      crossOrigin="anonymous" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-sm"
                        style={{ background: file.color ?? "#8B949E" }}>
                        {file.mime}
                      </div>
                    </div>
                  )}
                  {/* Context menu button */}
                  <button
                    onClick={e => { e.stopPropagation(); setMenuId(menuId === file.id ? null : file.id) }}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>
                  {/* Dropdown */}
                  {menuId === file.id && (
                    <div
                      onClick={e => e.stopPropagation()}
                      className="absolute top-8 right-1.5 w-36 rounded-xl border border-border bg-card shadow-xl z-20 py-1 overflow-hidden">
                      {[
                        { icon: Download, label: "다운로드" },
                        { icon: Pencil,   label: "이름 변경" },
                        { icon: Copy,     label: "복사" },
                      ].map(({ icon: Icon, label }) => (
                        <button key={label}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-accent/50 transition-colors">
                          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                          {label}
                        </button>
                      ))}
                      <div className="border-t border-border my-1" />
                      <button
                        onClick={() => deleteFile(file.id)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-accent/50 transition-colors">
                        <Trash className="w-3.5 h-3.5" />삭제
                      </button>
                    </div>
                  )}
                </div>
                {/* Info */}
                <div className="p-2.5">
                  <p className="text-xs text-foreground font-medium truncate">{file.name}</p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {file.tags.map(tag => (
                      <span key={tag} className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: (MIME_COLORS[file.mime] ?? "#8B949E") + "22", color: MIME_COLORS[file.mime] ?? "#8B949E" }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">{file.size} · {file.date}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* List view */
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_40px] px-4 py-2 border-b border-border bg-muted/40">
              {["이름", "유형", "크기", "날짜", ""].map((h, i) => (
                <span key={i} className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</span>
              ))}
            </div>
            {filtered.map((file, idx) => (
              <div key={file.id}
                className={cn("grid grid-cols-[2fr_1fr_1fr_1fr_40px] items-center px-4 py-2.5 hover:bg-accent/10 transition-colors group",
                  idx < filtered.length - 1 && "border-b border-border")}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold text-white"
                    style={{ background: MIME_COLORS[file.mime] ?? "#8B949E" }}>
                    {file.mime}
                  </div>
                  <span className="text-xs text-foreground truncate">{file.name}</span>
                </div>
                <span className="text-xs text-muted-foreground">{file.mime}</span>
                <span className="text-xs text-muted-foreground">{file.size}</span>
                <span className="text-xs text-muted-foreground">{file.date}</span>
                <div className="relative flex justify-end">
                  <button
                    onClick={e => { e.stopPropagation(); setMenuId(menuId === file.id ? null : file.id) }}
                    className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/40 opacity-0 group-hover:opacity-100 transition-opacity">
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>
                  {menuId === file.id && (
                    <div
                      onClick={e => e.stopPropagation()}
                      className="absolute top-6 right-0 w-36 rounded-xl border border-border bg-card shadow-xl z-20 py-1 overflow-hidden">
                      {[
                        { icon: Download, label: "다운로드" },
                        { icon: Pencil,   label: "이름 변경" },
                        { icon: Copy,     label: "복사" },
                      ].map(({ icon: Icon, label }) => (
                        <button key={label}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-accent/50 transition-colors">
                          <Icon className="w-3.5 h-3.5 text-muted-foreground" />{label}
                        </button>
                      ))}
                      <div className="border-t border-border my-1" />
                      <button onClick={() => deleteFile(file.id)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-accent/50 transition-colors">
                        <Trash className="w-3.5 h-3.5" />삭제
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function AssetsSection() {
  // Full implementation lives in stats-tab.tsx; re-exported from there via planner-app.tsx
  return null
}

