"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { usePlannerStore } from "@/lib/planner-store"
import { cn } from "@/lib/utils"
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, X, Check, Calendar, Eye, PenLine } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeSanitize from "rehype-sanitize"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { format, addDays, subDays, parseISO, isToday, isTomorrow, isYesterday } from "date-fns"
import { ko } from "date-fns/locale"

const MOOD_KEYS = ["great", "good", "neutral", "tired", "rough"] as const
const MOOD_SYMBOLS: Record<string, string> = {
  great: "★★★", good: "★★", neutral: "★", tired: "△", rough: "▽",
}

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
  const t = useTranslations("planner")
  const tc = useTranslations("common")
  const { diaryEntries, setDiaryEntry, reflectionNotes, setReflectionNote, selectedDate, setSelectedDate } =
    usePlannerStore()

  const MOOD_OPTIONS = MOOD_KEYS.map((key) => ({
    key,
    label: t(`mood.${key}`),
    symbol: MOOD_SYMBOLS[key],
  }))

  const parsed = parseISO(selectedDate)

  const goBack = () => setSelectedDate(format(subDays(parsed, 1), "yyyy-MM-dd"))
  const goForward = () => setSelectedDate(format(addDays(parsed, 1), "yyyy-MM-dd"))
  const goToday = () => setSelectedDate(format(new Date(), "yyyy-MM-dd"))

  const isCurrentToday = isToday(parsed)
  let dayLabel = ""
  if (isCurrentToday) dayLabel = t("dateHeader.today")
  else if (isTomorrow(parsed)) dayLabel = t("dateHeader.tomorrow")
  else if (isYesterday(parsed)) dayLabel = t("dateHeader.yesterday")

  const entry = diaryEntries[selectedDate]
  const [mood, setMood] = useState<typeof MOOD_KEYS[number]>(entry?.mood ?? "neutral")
  const [oneLiner, setOneLiner] = useState(entry?.oneLiner ?? "")
  const [notes, setNotes] = useState<DayNote[]>(() => parseDayNotes(reflectionNotes[selectedDate]))
  const [viewMode, setViewMode] = useState<ViewMode>("view")
  const [editingNote, setEditingNote] = useState<DayNote | null>(null)
  const [draftText, setDraftText] = useState("")
  const [draftOneLiner, setDraftOneLiner] = useState("")
  const [draftMood, setDraftMood] = useState<typeof MOOD_KEYS[number]>("neutral")
  const [showPreview, setShowPreview] = useState(false)

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
        <button onClick={goBack} className="w-7 h-7 flex items-center justify-center rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground" aria-label={t("dateHeader.prevDay")}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{format(parsed, "PPP", { locale: ko })}</span>
            {dayLabel && (
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ background: isCurrentToday ? "var(--priority-a-bg)" : "var(--muted)", color: isCurrentToday ? "var(--priority-a)" : "var(--muted-foreground)" }}>
                {dayLabel}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{format(parsed, "EEEE", { locale: ko })}</p>
        </div>
        <button onClick={goForward} className="w-7 h-7 flex items-center justify-center rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground" aria-label={t("dateHeader.nextDay")}>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        {!isCurrentToday && (
          <button onClick={goToday} className="flex items-center gap-1.5 h-7 px-2.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border border-border">
            <Calendar className="w-3 h-3" />{t("note.goToday")}
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
              <button key={offset} onClick={() => setSelectedDate(dateStr)} className={cn("flex flex-col items-center w-8 py-1 rounded transition-colors text-xs", isSelected ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground")}>
                <span className={cn("font-medium", isTodayDay && !isSelected && "text-primary")}>{format(d, "EEE", { locale: ko }).slice(0, 1)}</span>
                <span className={cn("w-5 h-5 flex items-center justify-center rounded-full text-xs font-semibold mt-0.5", isSelected && "text-foreground", isTodayDay && isSelected && "bg-primary text-primary-foreground")}>{format(d, "d")}</span>
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
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                  {t("note.edit")}
                </button>
              </div>
            )}

            {/* Notes list */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {notes.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-20">
                  <p className="text-muted-foreground text-sm">{t("note.emptyNote")}</p>
                  <Button variant="outline" size="sm" onClick={handleNewNote} className="gap-1.5">
                    <Plus className="w-3.5 h-3.5" />
                    {t("note.firstNote")}
                  </Button>
                </div>
              )}
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="group relative rounded-xl border border-border bg-card px-5 py-4 hover:border-primary/30 transition-colors"
                >
                  <div className="text-sm leading-relaxed text-foreground markdown-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                      {note.text}
                    </ReactMarkdown>
                  </div>
                  {note.createdAt && (
                    <p className="text-xs text-muted-foreground mt-2">
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
                  {t("note.addNote")}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ─── DIARY EDIT mode (mood + one-liner only) ─── */}
        {viewMode === "edit" && !editingNote && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Mood picker */}
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">{t("note.todayCondition")}</p>
                <div className="flex gap-2">
                  {MOOD_OPTIONS.map((m) => (
                    <button
                      key={m.key}
                      onClick={() => setDraftMood(m.key)}
                      className={cn(
                        "flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs transition-all font-medium",
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
                <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">{t("note.todayOneLiner")}</p>
                <Input
                  value={draftOneLiner}
                  onChange={(e) => setDraftOneLiner(e.target.value)}
                  placeholder={t("note.oneLinerPlaceholder")}
                  className="h-9 text-sm bg-muted border-border"
                  maxLength={80}
                  autoFocus
                />
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-muted-foreground">{draftOneLiner.length}/80</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={handleCancel}>
                      <X className="w-3 h-3" />{t("note.cancel")}
                    </Button>
                    <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => {
                      setMood(draftMood); setOneLiner(draftOneLiner)
                      setDiaryEntry(selectedDate, { mood: draftMood, oneLiner: draftOneLiner })
                      setViewMode("view")
                    }} style={{ background: "var(--priority-a)", color: "#ffffff" }}>
                      <Check className="w-3 h-3" />{t("note.editDone")}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── NOTE EDIT / NEW mode (note body only) ─── */}
        {(viewMode === "new" || (viewMode === "edit" && editingNote)) && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
                    {viewMode === "new" ? t("note.noteContent") : t("note.noteEdit")}
                  </p>
                  <button
                    onClick={() => setShowPreview(!showPreview)}
                    className={cn(
                      "flex items-center gap-1 text-xs px-2 py-0.5 rounded transition-colors",
                      showPreview
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    )}
                  >
                    {showPreview ? <PenLine className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    {showPreview ? t("note.noteEdit") : t("note.preview")}
                  </button>
                </div>
                {showPreview ? (
                  <div className="rounded-lg border border-border bg-card px-4 py-3 min-h-48 overflow-y-auto text-sm leading-relaxed markdown-body">
                    {draftText.trim() ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                        {draftText}
                      </ReactMarkdown>
                    ) : (
                      <p className="text-muted-foreground italic">{t("note.previewEmpty")}</p>
                    )}
                  </div>
                ) : (
                  <Textarea
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    placeholder={t("note.notePlaceholder")}
                    className="text-sm bg-muted border-border resize-none leading-relaxed min-h-48"
                    autoFocus
                  />
                )}
                <div className="flex justify-end gap-2 mt-1">
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => { setShowPreview(false); handleCancel() }}>
                    <X className="w-3 h-3" />{t("note.cancel")}
                  </Button>
                  <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => { setShowPreview(false); handleSave() }} style={{ background: "var(--priority-a)", color: "#ffffff" }}>
                    <Check className="w-3 h-3" />{viewMode === "new" ? t("note.save") : t("note.editDone")}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
