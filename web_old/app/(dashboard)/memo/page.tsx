"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Search, Edit, Trash2, StickyNote, Loader2, X, ArrowUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

// DB values for tags (kept as Korean for API compatibility)
const TAGS = ["전체", "업무", "개인", "쇼핑", "아이디어"]

const TAG_BADGE: Record<string, string> = {
  "업무":    "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
  "개인":    "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800",
  "쇼핑":    "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
  "아이디어": "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
}

const TAG_ICON: Record<string, string> = {
  "업무":    "💼",
  "개인":    "🙂",
  "쇼핑":    "🛍️",
  "아이디어": "💡",
}

type SortKey = "updated_desc" | "updated_asc" | "title_asc" | "created_desc"

interface Memo {
  id: number
  title: string
  content: string
  tag: string
  created_at: string
  updated_at: string
}

interface MemoForm {
  title: string
  content: string
  tag: string
}

const emptyForm: MemoForm = { title: "", content: "", tag: "개인" }

// Format a date string to a human-readable relative/absolute date
function formatDate(raw: string, tf: (key: string, params?: Record<string, number | string>) => string): string {
  const date = new Date(raw)
  if (isNaN(date.getTime())) return raw
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return tf("dateJustNow")
  if (diffMin < 60) return tf("dateMinutesAgo", { n: diffMin })
  if (diffHour < 24) return tf("dateHoursAgo", { n: diffHour })
  if (diffDay < 7) return tf("dateDaysAgo", { n: diffDay })

  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

export default function MemoPage() {
  const t = useTranslations("memo")
  const tc = useTranslations("common")

  const tagLabel = (tag: string) => {
    const map: Record<string, string> = {
      "전체": t("tags.all"),
      "업무": t("tags.work"),
      "개인": t("tags.personal"),
      "쇼핑": t("tags.shopping"),
      "아이디어": t("tags.idea"),
    }
    return map[tag] ?? tag
  }

  const [allMemos, setAllMemos] = useState<Memo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTag, setSelectedTag] = useState("전체")
  const [searchQuery, setSearchQuery] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("updated_desc")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Memo | null>(null)
  const [viewTarget, setViewTarget] = useState<Memo | null>(null)
  const [form, setForm] = useState<MemoForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Memo | null>(null)
  const [deleting, setDeleting] = useState(false)

  // #8: Load all memos once; filter/sort on client
  const fetchMemos = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/memo")
      if (!res.ok) throw new Error("fetch failed")
      const data = await res.json()
      setAllMemos(Array.isArray(data) ? data : (data?.memos ?? []))
    } catch {
      setAllMemos([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMemos()
  }, [fetchMemos])

  // #6: Per-tag memo counts
  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const tag of TAGS.slice(1)) {
      counts[tag] = allMemos.filter((m) => m.tag === tag).length
    }
    return counts
  }, [allMemos])

  // #8 + #9: Client-side filter + sort
  const memos = useMemo(() => {
    let filtered = allMemos
    if (selectedTag !== "전체") {
      filtered = filtered.filter((m) => m.tag === selectedTag)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      filtered = filtered.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          m.content.toLowerCase().includes(q)
      )
    }
    const sorted = [...filtered]
    switch (sortKey) {
      case "updated_desc":
        sorted.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        break
      case "updated_asc":
        sorted.sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime())
        break
      case "title_asc":
        sorted.sort((a, b) => (a.title || a.content).localeCompare(b.title || b.content, "ko"))
        break
      case "created_desc":
        sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        break
    }
    return sorted
  }, [allMemos, selectedTag, searchQuery, sortKey])

  // #5: Active filters
  const hasFilters = selectedTag !== "전체" || searchQuery.trim() !== ""

  function clearFilters() {
    setSelectedTag("전체")
    setSearchQuery("")
  }

  function openCreate() {
    setEditTarget(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(memo: Memo) {
    setEditTarget(memo)
    setForm({ title: memo.title, content: memo.content, tag: memo.tag })
    setDialogOpen(true)
  }

  function openView(memo: Memo) {
    setViewTarget(memo)
  }

  async function handleSave() {
    // #4: title OR content required
    if (!form.title.trim() && !form.content.trim()) return
    setSaving(true)
    try {
      let res: Response
      if (editTarget) {
        res = await fetch(`/api/memo/${editTarget.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })
      } else {
        res = await fetch("/api/memo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })
      }
      if (!res.ok) throw new Error("save failed")
      setDialogOpen(false)
      await fetchMemos()
    } finally {
      setSaving(false)
    }
  }

  // #1: Delete with AlertDialog confirmation
  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await fetch(`/api/memo/${deleteTarget.id}`, { method: "DELETE" })
      await fetchMemos()
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  // Display title: fallback to content preview if title is empty
  function displayTitle(memo: Memo) {
    if (memo.title.trim()) return memo.title
    return memo.content.trim().slice(0, 40) || t("noTitle")
  }

  return (
    <div className="p-3 sm:p-6 space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <StickyNote className="size-5 sm:size-6 text-primary shrink-0" />
          <div>
            <h1 className="text-lg sm:text-2xl font-semibold leading-tight">{t("title")}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">{t("subtitle")}</p>
          </div>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder={t("searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 sm:h-10 text-sm"
          />
        </div>
      </div>

      <div className="space-y-3 sm:space-y-6">
        {/* Tag filter + Sort + Add button */}
        <div className="flex flex-col gap-2 sm:gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Mobile: tag dropdown */}
          <div className="flex sm:hidden gap-2 w-full">
            <Select value={selectedTag} onValueChange={setSelectedTag}>
              <SelectTrigger className="flex-1 h-9 gap-1.5 text-xs">
                <span>{selectedTag !== "전체" && TAG_ICON[selectedTag]} {tagLabel(selectedTag)}</span>
              </SelectTrigger>
              <SelectContent>
                {TAGS.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    <span className="flex items-center gap-2">
                      {tag !== "전체" && <span>{TAG_ICON[tag]}</span>}
                      {tagLabel(tag)}
                      {tag !== "전체" && (
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          {tagCounts[tag] ?? 0}
                        </span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
              <SelectTrigger className="w-10 h-9 px-0 justify-center">
                <ArrowUpDown className="size-3.5 text-muted-foreground" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updated_desc">{t("sortUpdatedDesc")}</SelectItem>
                <SelectItem value="updated_asc">{t("sortUpdatedAsc")}</SelectItem>
                <SelectItem value="created_desc">{t("sortCreatedDesc")}</SelectItem>
                <SelectItem value="title_asc">{t("sortTitleAsc")}</SelectItem>
              </SelectContent>
            </Select>
            <Button className="gap-1.5 shrink-0 h-9 text-xs" onClick={openCreate}>
              <Plus className="size-4" />
              {t("addMemo")}
            </Button>
          </div>
          {/* Desktop: tag buttons */}
          <div className="hidden sm:flex gap-2 flex-wrap items-center">
            {TAGS.map((tag) => (
              <Button
                key={tag}
                variant={selectedTag === tag ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedTag(tag)}
              >
                {tag !== "전체" && <span className="mr-1">{TAG_ICON[tag]}</span>}
                {tagLabel(tag)}
                {/* #6: tag count badge */}
                {tag !== "전체" && (
                  <span className={cn(
                    "ml-1.5 text-xs rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center",
                    selectedTag === tag
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}>
                    {tagCounts[tag] ?? 0}
                  </span>
                )}
              </Button>
            ))}
            {/* #5: Clear filters button */}
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="gap-1 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
                {t("clearFilters")}
              </Button>
            )}
          </div>
          <div className="hidden sm:flex gap-2">
            {/* #9: Sort dropdown */}
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
              <SelectTrigger className="w-40 gap-1.5 text-sm">
                <ArrowUpDown className="size-3.5 shrink-0 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updated_desc">{t("sortUpdatedDesc")}</SelectItem>
                <SelectItem value="updated_asc">{t("sortUpdatedAsc")}</SelectItem>
                <SelectItem value="created_desc">{t("sortCreatedDesc")}</SelectItem>
                <SelectItem value="title_asc">{t("sortTitleAsc")}</SelectItem>
              </SelectContent>
            </Select>
            <Button className="gap-2 shrink-0" onClick={openCreate}>
              <Plus className="size-4" />
              {t("addMemo")}
            </Button>
          </div>
        </div>

        {/* #5: Active filter summary */}
        {hasFilters && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>
              {t("filterResults", { count: memos.length })}
              {selectedTag !== "전체" && (
                <span className="ml-1">
                  — <span className={cn(
                    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-xs font-medium",
                    TAG_BADGE[selectedTag] ?? "bg-muted border-border"
                  )}>
                    {TAG_ICON[selectedTag]}{tagLabel(selectedTag)}
                  </span>
                </span>
              )}
              {searchQuery.trim() && (
                <span className="ml-1">
                  — "<span className="font-medium text-foreground">{searchQuery}</span>" {t("searching")}
                </span>
              )}
            </span>
          </div>
        )}

        {/* Content area */}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex flex-col rounded-xl border border-border bg-card overflow-hidden">
                <div className="p-4 space-y-2 flex-1">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
                <div className="border-t border-border px-4 py-2 flex items-center justify-between">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-5 w-12 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : memos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 border-2 border-dashed border-border rounded-xl text-muted-foreground">
            <StickyNote className="size-10 opacity-40" />
            <p className="text-sm">
              {hasFilters ? t("noFilterResults") : t("empty")}
            </p>
            {hasFilters ? (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                <X className="size-3.5 mr-1.5" />
                {t("clearFilters")}
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={openCreate}>
                <Plus className="size-3.5 mr-1.5" />
                {t("addMemo")}
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {memos.map((memo) => (
              <div
                key={memo.id}
                className="group flex flex-col rounded-xl border border-border bg-card overflow-hidden transition-colors hover:border-primary/30 cursor-pointer"
                onClick={() => openView(memo)}
              >
                {/* Card header */}
                <div className="px-4 pt-4 pb-3 border-b border-border/50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base shrink-0">{TAG_ICON[memo.tag] ?? "📝"}</span>
                      <p className="text-sm font-semibold truncate leading-snug">{displayTitle(memo)}</p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium",
                        TAG_BADGE[memo.tag] ?? "bg-muted text-muted-foreground border-border"
                      )}
                    >
                      {tagLabel(memo.tag)}
                    </span>
                  </div>
                </div>

                {/* Card body */}
                <div className="px-4 py-3 flex-1">
                  {/* #7: Empty content state */}
                  {memo.content.trim() ? (
                    <pre className="whitespace-pre-wrap font-sans text-sm text-muted-foreground line-clamp-4 leading-relaxed">
                      {memo.content}
                    </pre>
                  ) : (
                    <p className="text-sm text-muted-foreground/50 italic">{t("noContent")}</p>
                  )}
                </div>

                {/* Card footer */}
                <div className="px-4 pb-3 flex items-center justify-between">
                  {/* #2: Formatted date */}
                  <span className="text-xs text-muted-foreground/70">{formatDate(memo.updated_at, t)}</span>
                  <div
                    className="flex gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-7 p-0 opacity-50 hover:opacity-100 transition-opacity"
                      onClick={() => openEdit(memo)}
                    >
                      <Edit className="size-3.5" />
                    </Button>
                    {/* #1: Delete with confirmation */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-7 p-0 opacity-50 hover:opacity-100 hover:text-destructive transition-opacity"
                      onClick={() => setDeleteTarget(memo)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* #3: Read-only Viewer Dialog */}
      <Dialog open={!!viewTarget} onOpenChange={(open) => !open && setViewTarget(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg sm:w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>{TAG_ICON[viewTarget?.tag ?? ""] ?? "📝"}</span>
              <span className="truncate">{viewTarget ? displayTitle(viewTarget) : ""}</span>
            </DialogTitle>
          </DialogHeader>
          {viewTarget && (
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between">
                <span className={cn(
                  "text-xs px-2 py-0.5 rounded-full border font-medium",
                  TAG_BADGE[viewTarget.tag] ?? "bg-muted text-muted-foreground border-border"
                )}>
                  {TAG_ICON[viewTarget.tag]} {tagLabel(viewTarget.tag)}
                </span>
                <span className="text-xs text-muted-foreground">{formatDate(viewTarget.updated_at, t)}</span>
              </div>
              {viewTarget.content.trim() ? (
                <pre className="whitespace-pre-wrap font-sans text-sm text-foreground leading-relaxed max-h-[50vh] overflow-y-auto">
                  {viewTarget.content}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground italic">{t("noContent")}</p>
              )}
              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button variant="outline" size="sm" onClick={() => setViewTarget(null)}>{tc("close")}</Button>
                <Button size="sm" onClick={() => { setViewTarget(null); openEdit(viewTarget) }}>
                  <Edit className="size-3.5 mr-1.5" />
                  {tc("edit")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg sm:w-full">
          <DialogHeader>
            <DialogTitle>{editTarget ? t("editTitle") : t("createTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="memoTitle">
                {t("titleLabel")}
                <span className="ml-1 text-xs text-muted-foreground">{t("optional")}</span>
              </Label>
              <Input
                id="memoTitle"
                placeholder={t("titlePlaceholder")}
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="memoContent">{t("contentLabel")}</Label>
              <Textarea
                id="memoContent"
                placeholder={t("contentPlaceholder")}
                className="min-h-[120px]"
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("tagLabel")}</Label>
              <div className="flex gap-2 flex-wrap">
                {TAGS.slice(1).map((tag) => (
                  <Button
                    key={tag}
                    variant={form.tag === tag ? "default" : "outline"}
                    size="sm"
                    onClick={() => setForm((f) => ({ ...f, tag }))}
                  >
                    <span className="mr-1">{TAG_ICON[tag]}</span>
                    {tagLabel(tag)}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                {tc("cancel")}
              </Button>
              {/* #4: title OR content required */}
              <Button
                onClick={handleSave}
                disabled={saving || (!form.title.trim() && !form.content.trim())}
              >
                {saving && <Loader2 className="size-4 animate-spin mr-2" />}
                {tc("save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* #1: Delete Confirmation AlertDialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">"{deleteTarget ? displayTitle(deleteTarget) : ""}"</span> {t("deleteConfirmDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="size-4 animate-spin mr-2" />}
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
