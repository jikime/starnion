"use client"

import { useState, useEffect } from "react"
import { usePlannerStore } from "@/lib/planner-store"
import { cn } from "@/lib/utils"
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, X, Check, Calendar } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { format, addDays, subDays, parseISO, isToday, isTomorrow, isYesterday } from "date-fns"
import { ko } from "date-fns/locale"

const MOOD_OPTIONS = [
  { key: "great" as const, label: "최고", symbol: "★★★" },
  { key: "good" as const, label: "좋음", symbol: "★★" },
  { key: "neutral" as const, label: "보통", symbol: "★" },
  { key: "tired" as const, label: "피곤", symbol: "△" },
  { key: "rough" as const, label: "힘듦", symbol: "▽" },
]

interface DayNote {
  id: string
  text: string
  createdAt: string
}

function parseDayNotes(raw: string | undefined): DayNote[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
  } catch {}
  if (raw.trim()) return [{ id: "legacy", text: raw, createdAt: "" }]
  return []
}

function serializeDayNotes(notes: DayNote[]): string {
  return JSON.stringify(notes)
}

type ViewMode = "view" | "edit" | "new"

export function NoteTab({ embedded = false }: { embedded?: boolean }) {
  const { diaryEntries, setDiaryEntry, reflectionNotes, setReflectionNote, selectedDate, setSelectedDate } =
    usePlannerStore()

  const parsed = parseISO(selectedDate)

  const goBack = () => setSelectedDate(format(subDays(parsed, 1), "yyyy-MM-dd"))
  const goForward = () => setSelectedDate(format(addDays(parsed, 1), "yyyy-MM-dd"))
  const goToday = () => setSelectedDate(format(new Date(), "yyyy-MM-dd"))

  const isCurrentToday = isToday(parsed)
  let dayLabel = ""
  if (isCurrentToday) dayLabel = "오늘"
  else if (isTomorrow(parsed)) dayLabel = "내일"
  else if (isYesterday(parsed)) dayLabel = "어제"

  const entry = diaryEntries[selectedDate]
  const [mood, setMood] = useState<typeof MOOD_OPTIONS[number]["key"]>(entry?.mood ?? "neutral")
  const [oneLiner, setOneLiner] = useState(entry?.oneLiner ?? "")
  const [notes, setNotes] = useState<DayNote[]>(() => parseDayNotes(reflectionNotes[selectedDate]))
  const [viewMode, setViewMode] = useState<ViewMode>("view")
  const [editingNote, setEditingNote] = useState<DayNote | null>(null)
  const [draftText, setDraftText] = useState("")
  const [draftOneLiner, setDraftOneLiner] = useState("")
  const [draftMood, setDraftMood] = useState<typeof MOOD_OPTIONS[number]["key"]>("neutral")

  useEffect(() => {
    const e = diaryEntries[selectedDate]
    setMood(e?.mood ?? "neutral")
    setOneLiner(e?.oneLiner ?? "")
    setNotes(parseDayNotes(reflectionNotes[selectedDate]))
    setViewMode("view")
    setEditingNote(null)
  }, [selectedDate])

  const handleNewNote = () => {
    setDraftText("")
    setDraftOneLiner(oneLiner)
    setDraftMood(mood)
    setEditingNote(null)
    setViewMode("new")
  }

  const handleEditNote = (note: DayNote) => {
    setDraftText(note.text)
    setDraftOneLiner(oneLiner)
    setDraftMood(mood)
    setEditingNote(note)
    setViewMode("edit")
  }

  const handleCancel = () => {
    setViewMode("view")
    setEditingNote(null)
  }

  const handleSave = () => {
    let newNotes: DayNote[]
    if (viewMode === "new") {
      const newNote: DayNote = { id: `${Date.now()}`, text: draftText, createdAt: new Date().toISOString() }
      newNotes = [...notes, newNote]
    } else {
      newNotes = notes.map((n) => (n.id === editingNote?.id ? { ...n, text: draftText } : n))
    }
    setNotes(newNotes)
    setMood(draftMood)
    setOneLiner(draftOneLiner)
    setReflectionNote(selectedDate, serializeDayNotes(newNotes))
    setDiaryEntry(selectedDate, { mood: draftMood, oneLiner: draftOneLiner, fullNote: draftText })
    setViewMode("view")
    setEditingNote(null)
  }

  const handleDeleteNote = (id: string) => {
    const newNotes = notes.filter((n) => n.id !== id)
    setNotes(newNotes)
    setReflectionNote(selectedDate, serializeDayNotes(newNotes))
  }

  const header = !embedded ? (
    <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50 backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-2">
        <button onClick={goBack} className="w-7 h-7 flex items-center justify-center rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground" aria-label="이전 날">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{format(parsed, "yyyy년 M월 d일", { locale: ko })}</span>
            {dayLabel && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: isCurrentToday ? "var(--priority-a-bg)" : "var(--muted)", color: isCurrentToday ? "var(--priority-a)" : "var(--muted-foreground)" }}>
                {dayLabel}
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">{format(parsed, "EEEE", { locale: ko })}</p>
        </div>
        <button onClick={goForward} className="w-7 h-7 flex items-center justify-center rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground" aria-label="다음 날">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        {!isCurrentToday && (
          <button onClick={goToday} className="flex items-center gap-1.5 h-7 px-2.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border border-border">
            <Calendar className="w-3 h-3" />오늘로
          </button>
        )}
        <div className="hidden md:flex items-center gap-0.5">
          {[-3, -2, -1, 0, 1, 2, 3].map((offset) => {
            const d = addDays(parsed, offset)
            const dateStr = format(d, "yyyy-MM-dd")
            const isSelected = offset === 0
            const isTodayDay = isToday(d)
            const hasEntry = !!reflectionNotes[dateStr]
            return (
              <button key={offset} onClick={() => setSelectedDate(dateStr)} className={cn("flex flex-col items-center w-8 py-1 rounded transition-colors text-[9px]", isSelected ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground")}>
                <span className={cn("font-medium", isTodayDay && !isSelected && "text-primary")}>{format(d, "EEE", { locale: ko }).slice(0, 1)}</span>
                <span className={cn("w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-semibold mt-0.5", isSelected && "text-foreground", isTodayDay && isSelected && "bg-primary text-primary-foreground")}>{format(d, "d")}</span>
                {hasEntry && !isSelected && <span className="w-1 h-1 rounded-full mt-0.5" style={{ background: "var(--primary)" }} />}
              </button>
            )
          })}
        </div>
      </div>
    </header>
  ) : null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {header}

      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* ─── VIEW mode ─── */}
        {viewMode === "view" && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Mood + one-liner summary bar */}
            {(entry?.mood || entry?.oneLiner) && (
              <div className="flex items-center gap-3 px-6 py-2.5 border-b border-border bg-muted/30 shrink-0">
                {entry?.mood && (
                  <span className="text-sm">{MOOD_OPTIONS.find((m) => m.key === entry.mood)?.symbol}</span>
                )}
                {entry?.oneLiner && (
                  <p className="text-sm text-muted-foreground italic flex-1 truncate">{entry.oneLiner}</p>
                )}
                <button
                  onClick={() => {
                    setDraftOneLiner(oneLiner)
                    setDraftMood(mood)
                    setViewMode("edit")
                    setEditingNote(null)
                    setDraftText("")
                  }}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                  수정
                </button>
              </div>
            )}

            {/* Notes list */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {notes.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-20">
                  <p className="text-muted-foreground text-sm">이 날의 노트가 없습니다.</p>
                  <Button variant="outline" size="sm" onClick={handleNewNote} className="gap-1.5">
                    <Plus className="w-3.5 h-3.5" />
                    첫 노트 작성하기
                  </Button>
                </div>
              )}
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="group relative rounded-xl border border-border bg-card px-5 py-4 hover:border-primary/30 transition-colors"
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">{note.text}</p>
                  {note.createdAt && (
                    <p className="text-[10px] text-muted-foreground mt-2">
                      {format(new Date(note.createdAt), "HH:mm")}
                    </p>
                  )}
                  {/* Actions */}
                  <div className="absolute top-3 right-3 hidden group-hover:flex items-center gap-1">
                    <button
                      onClick={() => handleEditNote(note)}
                      className="w-6 h-6 flex items-center justify-center rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleDeleteNote(note.id)}
                      className="w-6 h-6 flex items-center justify-center rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add new note button */}
            {notes.length > 0 && (
              <div className="px-6 py-4 border-t border-border shrink-0">
                <Button variant="outline" className="w-full gap-1.5" onClick={handleNewNote}>
                  <Plus className="w-3.5 h-3.5" />
                  노트 추가
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ─── EDIT / NEW mode ─── */}
        {(viewMode === "edit" || viewMode === "new") && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Mood picker */}
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">오늘의 컨디션</p>
                <div className="flex gap-2">
                  {MOOD_OPTIONS.map((m) => (
                    <button
                      key={m.key}
                      onClick={() => setDraftMood(m.key)}
                      className={cn(
                        "flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border text-[10px] transition-all font-medium",
                        draftMood === m.key
                          ? "border-transparent"
                          : "border-border bg-muted/30 text-muted-foreground hover:bg-accent/30"
                      )}
                      style={
                        draftMood === m.key
                          ? { background: "var(--priority-a-bg)", color: "var(--priority-a)", border: "1px solid var(--priority-a)" }
                          : {}
                      }
                    >
                      <span className="text-sm leading-none">{m.symbol}</span>
                      <span>{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* One-liner */}
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">오늘의 한 줄</p>
                <Input
                  value={draftOneLiner}
                  onChange={(e) => setDraftOneLiner(e.target.value)}
                  placeholder="오늘 하루를 한 문장으로 요약한다면?"
                  className="h-9 text-sm bg-muted border-border"
                  maxLength={80}
                />
                <p className="text-[10px] text-muted-foreground text-right">{draftOneLiner.length}/80</p>
              </div>

              {/* Note body */}
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
                  {viewMode === "new" ? "노트 내용" : "노트 수정"}
                </p>
                <Textarea
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  placeholder="오늘의 생각, 배움, 감사함을 자유롭게 기록하세요..."
                  className="text-sm bg-muted border-border resize-none leading-relaxed min-h-48"
                  autoFocus
                />
              </div>
            </div>

            {/* Action bar */}
            <div className="flex gap-2 px-6 py-4 border-t border-border shrink-0">
              <Button variant="outline" className="flex-1 gap-1.5" onClick={handleCancel}>
                <X className="w-3.5 h-3.5" />
                취소
              </Button>
              <Button
                className="flex-1 gap-1.5"
                onClick={handleSave}
                style={{ background: "var(--priority-a)", color: "#0d1117" }}
              >
                <Check className="w-3.5 h-3.5" />
                {viewMode === "new" ? "저장" : "수정 완료"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
