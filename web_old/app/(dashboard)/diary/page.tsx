"use client"

import { useEffect, useState, useCallback, useRef, useMemo, KeyboardEvent } from "react"
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
import { Plus, Pencil, Trash2, NotebookPen, BookMarked, Tag, X } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"

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

const MOOD_BAR_COLOR: Record<string, string> = {
  매우좋음: "bg-emerald-400",
  좋음:    "bg-blue-400",
  보통:    "bg-slate-300",
  나쁨:    "bg-amber-400",
  매우나쁨: "bg-rose-400",
}

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

const TODAY = toLocalDateStr(new Date())

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

// [#7] 제목 없는 일기 표시 통일 — 목록/뷰어 동일 fallback
function entryDisplayTitle(entry: DiaryEntry, fmt: (s: string) => string): string {
  return entry.title || fmt(entry.entry_date)
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

  // [#1] 모바일 자동 스크롤용 ref
  const viewerRef = useRef<HTMLDivElement>(null)

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

  // [#4] 태그 칩 UX — 현재 입력 중인 태그 텍스트
  const [tagInput, setTagInput] = useState("")

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

  // [#6] 무드 인사이트 — 이번 달 무드별 카운트
  const moodCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const m of MOOD_OPTIONS) counts[m] = 0
    for (const e of entries) {
      if (e.mood in counts) counts[e.mood]++
    }
    return counts
  }, [entries])

  // [#4] 현재 태그 칩 목록 (form.tags 파생)
  const currentTags = useMemo(
    () => form.tags.split(",").map((t) => t.trim()).filter(Boolean),
    [form.tags]
  )

  const addTag = useCallback((raw: string) => {
    const tag = raw.trim()
    if (!tag) return
    setForm((f) => {
      const existing = f.tags.split(",").map((t) => t.trim()).filter(Boolean)
      if (existing.includes(tag)) return f
      return { ...f, tags: [...existing, tag].join(", ") }
    })
    setTagInput("")
  }, [])

  const removeTag = useCallback((tag: string) => {
    setForm((f) => {
      const updated = f.tags.split(",").map((t) => t.trim()).filter((t) => t && t !== tag)
      return { ...f, tags: updated.join(", ") }
    })
  }, [])

  const handleTagKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      addTag(tagInput)
    } else if (e.key === "Backspace" && !tagInput && currentTags.length > 0) {
      removeTag(currentTags[currentTags.length - 1])
    }
  }, [tagInput, currentTags, addTag, removeTag])

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
        const list: DiaryEntry[] = (data.entries ?? []).sort(
          (a: DiaryEntry, b: DiaryEntry) =>
            b.entry_date.localeCompare(a.entry_date) || b.created_at.localeCompare(a.created_at)
        )
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

  // [#10] 월 이동 시 selectedEntry 초기화 — 이전 달 항목이 뷰어에 잔류하는 혼동 방지
  const handleMonthChange = (date: Date) => {
    setViewYear(date.getFullYear())
    setViewMonth(date.getMonth() + 1)
    setSelectedEntry(null)
  }

  // [#1] 일기 선택 + 모바일 자동 스크롤
  const selectEntry = useCallback((entry: DiaryEntry) => {
    setSelectedEntry(entry)
    setSelectedDate(parseEntryDate(entry.entry_date))
    setTimeout(() => {
      viewerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 50)
  }, [])

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date)
    if (!date) return
    const dateStr = toLocalDateStr(date)
    const found = entries.find((e) => e.entry_date === dateStr)
    if (found) selectEntry(found)
  }

  const openCreate = () => {
    const dateStr = selectedDate ? toLocalDateStr(selectedDate) : TODAY
    setEditingEntry(null)
    setForm({ ...EMPTY_FORM, entry_date: dateStr })
    setTagInput("")
    setFormOpen(true)
  }

  const openEdit = (entry: DiaryEntry) => {
    setEditingEntry(entry)
    setForm({
      title: entry.title,
      content: entry.content,
      mood: entry.mood,
      tags: (entry.tags ?? []).join(", "),
      entry_date: entry.entry_date,
    })
    setTagInput("")
    setFormOpen(true)
  }

  // [#2] content 필수 → title 또는 content 중 하나면 저장 가능
  const canSave = form.title.trim().length > 0 || form.content.trim().length > 0

  const handleSave = async () => {
    if (!canSave) return
    // flush 중인 tagInput이 있으면 태그로 추가
    if (tagInput.trim()) {
      addTag(tagInput)
      await new Promise((r) => setTimeout(r, 0))
    }
    setSaving(true)
    try {
      const tagsArr = form.tags.split(",").map((t) => t.trim()).filter(Boolean)
      const payload = {
        title: form.title,
        content: form.content,
        mood: form.mood,
        tags: tagsArr,
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
        const savedDate = parseEntryDate(form.entry_date)
        setViewYear(savedDate.getFullYear())
        setViewMonth(savedDate.getMonth() + 1)
        setSelectedDate(savedDate)
        setSelectedEntry(null)
        await fetchEntries()
      }
    } finally {
      setSaving(false)
    }
  }

  // [#9] 삭제 후 selectedEntry 초기화 — 이미 구현되어 있으나 fetchEntries 이후 첫 항목 자동 선택 보장
  const handleDelete = async () => {
    if (!deleteTarget) return
    const res = await fetch(`/api/diary/${deleteTarget.id}`, { method: "DELETE" })
    if (res.ok) {
      setDeleteTarget(null)
      setSelectedEntry(null)
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

      {/* [#6] 무드 인사이트 바 — 이번 달 기분 분포 한눈에 */}
      {!loading && entries.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-border bg-card">
          <span className="text-xs text-muted-foreground font-medium shrink-0">
            {t("moodInsightLabel", { month: viewMonth })}
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            {MOOD_OPTIONS.filter((m) => moodCounts[m] > 0).map((m) => (
              <div key={m} className="flex items-center gap-0.5">
                <span className="text-sm leading-none">{MOOD_EMOJI[m]}</span>
                <span className="text-xs text-muted-foreground">{moodCounts[m]}</span>
              </div>
            ))}
          </div>
          <div className="flex-1 flex gap-0.5 h-1.5 rounded-full overflow-hidden bg-muted/40">
            {MOOD_OPTIONS.filter((m) => moodCounts[m] > 0).map((m) => (
              <div
                key={m}
                style={{ flex: moodCounts[m] }}
                className={`${MOOD_BAR_COLOR[m]} transition-all`}
              />
            ))}
          </div>
          <span className="text-xs text-muted-foreground shrink-0">{t("totalCount", { count: entries.length })}</span>
        </div>
      )}

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[280px_1fr]">

        {/* ── Sidebar ── */}
        <div className="space-y-4">
          {/* Calendar */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 pt-4 pb-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t("yearMonth", { year: viewYear, month: viewMonth })}
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
                    {t("monthLabel", { month: viewMonth })}
                  </span>
                )}
              </div>
            </div>
            {/* [#3] 고정 높이 260px → 최대 높이 + 화면 크기 반응형 */}
            <div>
              <ScrollArea className="max-h-[320px]">
                <div className="px-2 py-2 space-y-1.5">
                  {loading ? (
                    <div className="space-y-1.5 py-1">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-2 rounded-lg px-2 py-2">
                          <Skeleton className="h-3 w-16 shrink-0" />
                          <Skeleton className="h-3 flex-1" />
                        </div>
                      ))}
                    </div>
                  ) : entries.length === 0 ? (
                    <p className="px-2 py-3 text-sm text-muted-foreground">{t("empty")}</p>
                  ) : (
                    entries.map((entry) => {
                      const isSelected = selectedEntry?.id === entry.id
                      return (
                        <button
                          key={entry.id}
                          onClick={() => selectEntry(entry)}
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
                              {/* [#7] 제목 없는 일기 표시 통일 */}
                              <p className={`text-sm leading-snug break-words ${isSelected ? "font-semibold" : "font-medium"}`}>
                                {entryDisplayTitle(entry, formatDate)}
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
        {/* [#1] ref 추가 — 모바일에서 일기 선택 시 이 영역으로 스크롤 */}
        <div ref={viewerRef}>
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
                      {/* [#7] 제목 없는 일기 표시 통일 */}
                      <h2 className="text-lg font-bold leading-tight">
                        {entryDisplayTitle(selectedEntry, formatDate)}
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
                {(selectedEntry.tags?.length ?? 0) > 0 && (
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
                {/* [#8] 빈 content 일기 empty state */}
                {selectedEntry.content ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                      {selectedEntry.content}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
                    <p className="text-sm">{t("noContent")}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => openEdit(selectedEntry)}
                    >
                      <Pencil className="size-3.5" />
                      {t("writeContent")}
                    </Button>
                  </div>
                )}
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
                    {t("emptyHintDetail")}
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
              {/* [#5] 편집 시 날짜 변경 경고 */}
              {editingEntry && form.entry_date !== editingEntry.entry_date && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {t("dateChangeWarning", { date: formatDate(form.entry_date) })}
                </p>
              )}
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
            {/* [#2] content optional — 제목이나 내용 중 하나만 있어도 저장 가능 */}
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

            {/* [#4] Tags — 칩 형태 입력 */}
            <div className="space-y-1.5">
              <Label htmlFor="tag-input">{t("tags")}</Label>
              <div className="flex flex-wrap gap-1.5 p-2 rounded-md border border-input bg-background min-h-[42px] cursor-text"
                onClick={() => document.getElementById("tag-input")?.focus()}
              >
                {currentTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary border border-primary/20"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeTag(tag) }}
                      className="hover:text-destructive transition-colors"
                    >
                      <X className="size-2.5" />
                    </button>
                  </span>
                ))}
                <input
                  id="tag-input"
                  value={tagInput}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v.endsWith(",")) {
                      addTag(v.slice(0, -1))
                    } else {
                      setTagInput(v)
                    }
                  }}
                  onKeyDown={handleTagKeyDown}
                  onBlur={() => { if (tagInput.trim()) addTag(tagInput) }}
                  placeholder={currentTags.length === 0 ? t("tagsPlaceholder") : ""}
                  className="flex-1 min-w-[80px] text-xs outline-none bg-transparent placeholder:text-muted-foreground py-0.5"
                />
              </div>
              <p className="text-xs text-muted-foreground">{t("tagsHint")}</p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
                {tc("cancel")}
              </Button>
              {/* [#2] 제목 또는 내용 중 하나 있으면 저장 가능 */}
              <Button onClick={handleSave} disabled={saving || !canSave}>
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
                  <strong>{entryDisplayTitle(deleteTarget, formatDate)}</strong>{" "}
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
