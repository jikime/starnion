"use client"

import { useEffect, useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Plus, Pencil, Trash2, NotebookPen, BookMarked, Tag } from "lucide-react"

interface DiaryEntry {
  id: number
  title: string
  content: string
  mood: string
  tags: string[]
  entry_date: string
  created_at: string
  updated_at: string
}

const MOOD_OPTIONS = ["매우좋음", "좋음", "보통", "나쁨", "매우나쁨"]

const MOOD_EMOJI: Record<string, string> = {
  매우좋음: "😄",
  좋음:    "🙂",
  보통:    "😐",
  나쁨:    "😕",
  매우나쁨: "😞",
}

const MOOD_BADGE: Record<string, string> = {
  매우좋음: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800",
  좋음:    "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800",
  보통:    "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  나쁨:    "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800",
  매우나쁨: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800",
}

const MOOD_LEFT_BORDER: Record<string, string> = {
  매우좋음: "border-l-emerald-400",
  좋음:    "border-l-blue-400",
  보통:    "border-l-slate-300",
  나쁨:    "border-l-amber-400",
  매우나쁨: "border-l-rose-400",
}

const MOOD_HERO_GRADIENT: Record<string, string> = {
  매우좋음: "from-emerald-50 via-emerald-50/40 to-background dark:from-emerald-950/30 dark:via-emerald-950/10",
  좋음:    "from-blue-50 via-blue-50/40 to-background dark:from-blue-950/30 dark:via-blue-950/10",
  보통:    "from-slate-50 via-slate-50/40 to-background dark:from-slate-900/30 dark:via-slate-900/10",
  나쁨:    "from-amber-50 via-amber-50/40 to-background dark:from-amber-950/30 dark:via-amber-950/10",
  매우나쁨: "from-rose-50 via-rose-50/40 to-background dark:from-rose-950/30 dark:via-rose-950/10",
}

const TODAY = new Date().toISOString().slice(0, 10)

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

function formatDateShort(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" })
}

function getDayOfWeek(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString("ko-KR", { weekday: "long" })
}

function parseEntryDate(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00")
}

interface EntryFormData {
  title: string
  content: string
  mood: string
  tags: string
  entry_date: string
}

const EMPTY_FORM: EntryFormData = {
  title: "",
  content: "",
  mood: "보통",
  tags: "",
  entry_date: TODAY,
}

export default function DiaryPage() {
  const t = useTranslations("diary")
  const tc = useTranslations("common")

  const [entries, setEntries] = useState<DiaryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date())
  const [selectedEntry, setSelectedEntry] = useState<DiaryEntry | null>(null)
  const [viewYear, setViewYear] = useState(new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(new Date().getMonth() + 1)

  const [formOpen, setFormOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<DiaryEntry | null>(null)
  const [form, setForm] = useState<EntryFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DiaryEntry | null>(null)

  const moodLabel = (mood: string) => {
    const map: Record<string, string> = {
      "매우좋음": t("moods.veryGood"),
      "좋음":    t("moods.good"),
      "보통":    t("moods.neutral"),
      "나쁨":    t("moods.bad"),
      "매우나쁨": t("moods.veryBad"),
    }
    return map[mood] ?? mood
  }

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({
        year: String(viewYear),
        month: String(viewMonth),
        limit: "100",
      })
      const res = await fetch(`/api/diary?${qs}`)
      if (res.ok) {
        const data = await res.json()
        const list: DiaryEntry[] = data.entries ?? []
        setEntries(list)
        if (list.length > 0 && !selectedEntry) {
          setSelectedEntry(list[0])
          setSelectedDate(parseEntryDate(list[0].entry_date))
        }
      }
    } finally {
      setLoading(false)
    }
  }, [viewYear, viewMonth]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  const datesWithEntries = entries.map((e) => parseEntryDate(e.entry_date))

  const handleMonthChange = (date: Date) => {
    setViewYear(date.getFullYear())
    setViewMonth(date.getMonth() + 1)
  }

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date)
    if (!date) return
    const dateStr = date.toISOString().slice(0, 10)
    const found = entries.find((e) => e.entry_date === dateStr)
    if (found) setSelectedEntry(found)
  }

  const openCreate = () => {
    const dateStr = selectedDate ? selectedDate.toISOString().slice(0, 10) : TODAY
    setEditingEntry(null)
    setForm({ ...EMPTY_FORM, entry_date: dateStr })
    setFormOpen(true)
  }

  const openEdit = (entry: DiaryEntry) => {
    setEditingEntry(entry)
    setForm({
      title: entry.title,
      content: entry.content,
      mood: entry.mood,
      tags: entry.tags.join(", "),
      entry_date: entry.entry_date,
    })
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!form.content.trim()) return
    setSaving(true)
    try {
      const payload = {
        title: form.title,
        content: form.content,
        mood: form.mood,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        entry_date: form.entry_date,
      }
      let res: Response
      if (editingEntry) {
        res = await fetch(`/api/diary/${editingEntry.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch("/api/diary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      }
      if (res.ok) {
        setFormOpen(false)
        await fetchEntries()
        setSelectedDate(parseEntryDate(form.entry_date))
        setViewYear(new Date(form.entry_date).getFullYear())
        setViewMonth(new Date(form.entry_date).getMonth() + 1)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const res = await fetch(`/api/diary/${deleteTarget.id}`, { method: "DELETE" })
    if (res.ok) {
      setDeleteTarget(null)
      if (selectedEntry?.id === deleteTarget.id) setSelectedEntry(null)
      await fetchEntries()
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <NotebookPen className="size-6 text-primary" />
            {t("title")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
        </div>
        <Button className="gap-2 w-full sm:w-auto" onClick={openCreate}>
          <Plus className="size-4" />
          {t("newEntry")}
        </Button>
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[280px_1fr]">

        {/* ── Sidebar ── */}
        <div className="space-y-4">
          {/* Calendar */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 pt-4 pb-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {viewYear}년 {viewMonth}월
              </p>
            </div>
            <div className="p-3 pt-1 flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleDateSelect}
                onMonthChange={handleMonthChange}
                modifiers={{ hasEntry: datesWithEntries }}
                modifiersStyles={{
                  hasEntry: {
                    fontWeight: "700",
                    textDecoration: "underline",
                    textDecorationColor: "var(--primary)",
                    textDecorationThickness: "2px",
                  },
                }}
                className="rounded-md"
              />
            </div>
          </div>

          {/* Entry list */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border/60">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">
                  {t("list", { count: entries.length })}
                </p>
                {entries.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {viewMonth}월
                  </span>
                )}
              </div>
            </div>
            <div>
              <ScrollArea className="h-[260px]">
                <div className="px-2 py-2 space-y-1.5">
                  {loading ? (
                    <p className="px-2 py-3 text-sm text-muted-foreground">{t("loading")}</p>
                  ) : entries.length === 0 ? (
                    <p className="px-2 py-3 text-sm text-muted-foreground">{t("empty")}</p>
                  ) : (
                    entries.map((entry) => {
                      const isSelected = selectedEntry?.id === entry.id
                      return (
                        <button
                          key={entry.id}
                          onClick={() => {
                            setSelectedEntry(entry)
                            setSelectedDate(parseEntryDate(entry.entry_date))
                          }}
                          className={`w-full rounded-lg px-3 py-2.5 text-left transition-all border-l-2
                            ${MOOD_LEFT_BORDER[entry.mood] ?? "border-l-slate-300"}
                            ${isSelected
                              ? "bg-primary/8 dark:bg-primary/10"
                              : "hover:bg-muted/50"
                            }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <span className="text-base leading-none mt-0.5 shrink-0">
                              {MOOD_EMOJI[entry.mood] ?? "📝"}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className={`text-sm leading-snug break-words ${isSelected ? "font-semibold" : "font-medium"}`}>
                                {entry.title || formatDate(entry.entry_date)}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {formatDateShort(entry.entry_date)} · {getDayOfWeek(entry.entry_date)}
                              </p>
                            </div>
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>

        {/* ── Detail panel ── */}
        {selectedEntry ? (
          <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
            {/* Hero */}
            <div className={`relative bg-gradient-to-b ${MOOD_HERO_GRADIENT[selectedEntry.mood] ?? MOOD_HERO_GRADIENT["보통"]} px-6 pt-6 pb-5 border-b border-border/60`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-4">
                  {/* Mood emoji circle */}
                  <div className="flex-shrink-0 size-12 rounded-2xl bg-background/80 border border-border/60 flex items-center justify-center text-2xl">
                    {MOOD_EMOJI[selectedEntry.mood] ?? "📝"}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold leading-tight">
                      {selectedEntry.title
                        ? selectedEntry.title
                        : t("diaryOf", { date: formatDate(selectedEntry.entry_date) })}
                    </h2>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-sm text-muted-foreground">
                        {formatDate(selectedEntry.entry_date)}
                      </span>
                      <span className="text-muted-foreground/40">·</span>
                      <span className="text-sm text-muted-foreground">
                        {getDayOfWeek(selectedEntry.entry_date)}
                      </span>
                      <Badge
                        className={`text-xs border ${MOOD_BADGE[selectedEntry.mood] ?? MOOD_BADGE["보통"]}`}
                      >
                        {moodLabel(selectedEntry.mood)}
                      </Badge>
                    </div>
                  </div>
                </div>
                {/* Action buttons */}
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-foreground"
                    onClick={() => openEdit(selectedEntry)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteTarget(selectedEntry)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>

              {/* Tags */}
              {selectedEntry.tags.length > 0 && (
                <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                  <Tag className="size-3 text-muted-foreground shrink-0" />
                  {selectedEntry.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs
                        bg-background/70 border border-border/70 text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 p-6">
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                  {selectedEntry.content}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-card flex items-center justify-center min-h-[300px]">
            <div className="text-center text-muted-foreground space-y-3 px-6">
              <div className="size-16 mx-auto rounded-2xl bg-muted/50 flex items-center justify-center">
                <BookMarked className="size-8 opacity-40" />
              </div>
              <div>
                <p className="font-medium text-sm">{t("emptyHint")}</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  {t("newEntry")} 버튼을 눌러 오늘의 일기를 작성해보세요
                </p>
              </div>
              <Button variant="outline" size="sm" className="gap-2" onClick={openCreate}>
                <Plus className="size-3.5" />
                {t("newEntry")}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Create / Edit dialog ── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg sm:w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <NotebookPen className="size-4 text-primary" />
              {editingEntry ? t("editTitle") : t("createTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            {/* Date row */}
            <div className="space-y-1.5">
              <Label htmlFor="entry-date">{t("date")}</Label>
              <Input
                id="entry-date"
                type="date"
                value={form.entry_date}
                onChange={(e) => setForm((f) => ({ ...f, entry_date: e.target.value }))}
              />
            </div>

            {/* Mood picker — emoji buttons */}
            <div className="space-y-1.5">
              <Label>{t("mood")}</Label>
              <div className="flex gap-2">
                {MOOD_OPTIONS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, mood: m }))}
                    className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border text-xs transition-all
                      ${form.mood === m
                        ? `${MOOD_BADGE[m]} border-current font-semibold`
                        : "border-border text-muted-foreground hover:bg-muted/50"
                      }`}
                  >
                    <span className="text-lg">{MOOD_EMOJI[m]}</span>
                    <span className="hidden sm:block">{moodLabel(m)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="title">{t("titleLabel")}</Label>
              <Input
                id="title"
                placeholder={t("titlePlaceholder")}
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>

            {/* Content */}
            <div className="space-y-1.5">
              <Label htmlFor="content">{t("content")}</Label>
              <Textarea
                id="content"
                placeholder={t("contentPlaceholder")}
                rows={6}
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                className="resize-none"
              />
            </div>

            {/* Tags */}
            <div className="space-y-1.5">
              <Label htmlFor="tags">{t("tags")}</Label>
              <Input
                id="tags"
                placeholder={t("tagsPlaceholder")}
                value={form.tags}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
                {tc("cancel")}
              </Button>
              <Button onClick={handleSave} disabled={saving || !form.content.trim()}>
                {saving ? t("saving") : tc("save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  <strong>{deleteTarget.title || formatDate(deleteTarget.entry_date)}</strong>{" "}
                  {t("deleteConfirmDesc")}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
