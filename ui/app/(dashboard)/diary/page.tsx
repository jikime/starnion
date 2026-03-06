"use client"

import { useEffect, useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { Plus, BookOpen, Pencil, Trash2, NotebookPen } from "lucide-react"

interface DiaryEntry {
  id: number
  title: string
  content: string
  mood: string
  tags: string[]
  entry_date: string // "YYYY-MM-DD"
  created_at: string
  updated_at: string
}

const MOOD_OPTIONS = ["매우좋음", "좋음", "보통", "나쁨", "매우나쁨"]

const MOOD_COLORS: Record<string, string> = {
  매우좋음: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  좋음: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  보통: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  나쁨: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  매우나쁨: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
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

  // Dialog state
  const [formOpen, setFormOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<DiaryEntry | null>(null)
  const [form, setForm] = useState<EntryFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DiaryEntry | null>(null)

  const moodLabel = (mood: string) => {
    const map: Record<string, string> = {
      "매우좋음": t("moods.veryGood"),
      "좋음": t("moods.good"),
      "보통": t("moods.neutral"),
      "나쁨": t("moods.bad"),
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

  // Open create dialog
  const openCreate = () => {
    const dateStr = selectedDate
      ? selectedDate.toISOString().slice(0, 10)
      : TODAY
    setEditingEntry(null)
    setForm({ ...EMPTY_FORM, entry_date: dateStr })
    setFormOpen(true)
  }

  // Open edit dialog
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
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
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
        // Select the saved entry date on calendar
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
    const res = await fetch(`/api/diary/${deleteTarget.id}`, {
      method: "DELETE",
    })
    if (res.ok) {
      setDeleteTarget(null)
      if (selectedEntry?.id === deleteTarget.id) setSelectedEntry(null)
      await fetchEntries()
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <NotebookPen className="size-6 text-primary" />
            {t("title")}
          </h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="size-4" />
          {t("newEntry")}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Sidebar: calendar + list */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-3">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleDateSelect}
                onMonthChange={handleMonthChange}
                modifiers={{ hasEntry: datesWithEntries }}
                modifiersStyles={{
                  hasEntry: {
                    fontWeight: "bold",
                    textDecoration: "underline",
                    textDecorationColor: "oklch(0.44 0.18 285)",
                  },
                }}
                className="rounded-md"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {t("list", { count: entries.length })}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[200px]">
                {loading ? (
                  <p className="px-4 py-3 text-sm text-muted-foreground">
                    {t("loading")}
                  </p>
                ) : entries.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted-foreground">
                    {t("empty")}
                  </p>
                ) : (
                  entries.map((entry) => (
                    <button
                      key={entry.id}
                      onClick={() => {
                        setSelectedEntry(entry)
                        setSelectedDate(parseEntryDate(entry.entry_date))
                      }}
                      className={`w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors ${
                        selectedEntry?.id === entry.id ? "bg-muted/50" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <BookOpen className="size-4 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {entry.title || formatDate(entry.entry_date)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {entry.entry_date}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Main: entry detail */}
        {selectedEntry ? (
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <CardTitle>
                    {selectedEntry.title
                      ? selectedEntry.title
                      : t("diaryOf", { date: formatDate(selectedEntry.entry_date) })}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(selectedEntry.entry_date)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge
                    className={
                      MOOD_COLORS[selectedEntry.mood] ?? MOOD_COLORS["보통"]
                    }
                  >
                    {moodLabel(selectedEntry.mood)}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(selectedEntry)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget(selectedEntry)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>
              {selectedEntry.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {selectedEntry.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      #{tag}
                    </Badge>
                  ))}
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap">
                {selectedEntry.content}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="flex items-center justify-center min-h-[300px]">
            <div className="text-center text-muted-foreground space-y-2">
              <BookOpen className="size-10 mx-auto opacity-30" />
              <p>{t("emptyHint")}</p>
            </div>
          </Card>
        )}
      </div>

      {/* Create/Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingEntry ? t("editTitle") : t("createTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="entry-date">{t("date")}</Label>
                <Input
                  id="entry-date"
                  type="date"
                  value={form.entry_date}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, entry_date: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mood">{t("mood")}</Label>
                <Select
                  value={form.mood}
                  onValueChange={(v) => setForm((f) => ({ ...f, mood: v }))}
                >
                  <SelectTrigger id="mood">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MOOD_OPTIONS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {moodLabel(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="title">{t("titleLabel")}</Label>
              <Input
                id="title"
                placeholder={t("titlePlaceholder")}
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="content">{t("content")}</Label>
              <Textarea
                id="content"
                placeholder={t("contentPlaceholder")}
                rows={6}
                value={form.content}
                onChange={(e) =>
                  setForm((f) => ({ ...f, content: e.target.value }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tags">{t("tags")}</Label>
              <Input
                id="tags"
                placeholder={t("tagsPlaceholder")}
                value={form.tags}
                onChange={(e) =>
                  setForm((f) => ({ ...f, tags: e.target.value }))
                }
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setFormOpen(false)}
                disabled={saving}
              >
                {tc("cancel")}
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !form.content.trim()}
              >
                {saving ? t("saving") : tc("save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  <strong>
                    {deleteTarget.title || formatDate(deleteTarget.entry_date)}
                  </strong>{" "}
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
