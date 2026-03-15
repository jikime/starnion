"use client"

import { useState, useEffect, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Search, Edit, Trash2, StickyNote, Loader2 } from "lucide-react"

// DB values for tags (kept as Korean for API compatibility)
const TAGS = ["전체", "업무", "개인", "쇼핑", "아이디어"]

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

  const [memos, setMemos] = useState<Memo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTag, setSelectedTag] = useState("전체")
  const [searchQuery, setSearchQuery] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Memo | null>(null)
  const [form, setForm] = useState<MemoForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const fetchMemos = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (selectedTag && selectedTag !== "전체") qs.set("tag", selectedTag)
      if (searchQuery) qs.set("q", searchQuery)
      const res = await fetch(`/api/memo?${qs}`)
      if (!res.ok) throw new Error("fetch failed")
      const data = await res.json()
      setMemos(Array.isArray(data) ? data : [])
    } catch {
      setMemos([])
    } finally {
      setLoading(false)
    }
  }, [selectedTag, searchQuery])

  useEffect(() => {
    const timer = setTimeout(() => fetchMemos(), searchQuery ? 300 : 0)
    return () => clearTimeout(timer)
  }, [fetchMemos, searchQuery])

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

  async function handleSave() {
    if (!form.title.trim()) return
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

  async function handleDelete(id: number) {
    setDeleteId(id)
    try {
      await fetch(`/api/memo/${id}`, { method: "DELETE" })
      await fetchMemos()
    } finally {
      setDeleteId(null)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <StickyNote className="size-6 text-primary" />
            {t("title")}
          </h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder={t("searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-2 flex-wrap">
              {TAGS.map((tag) => (
                <Button
                  key={tag}
                  variant={selectedTag === tag ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedTag(tag)}
                >
                  {tagLabel(tag)}
                </Button>
              ))}
            </div>
            <Button className="gap-2" onClick={openCreate}>
              <Plus className="size-4" />
              {t("addMemo")}
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : memos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <StickyNote className="size-8" />
              <p>{t("empty")}</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {memos.map((memo) => (
                <Card key={memo.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <StickyNote className="size-4 text-primary shrink-0" />
                        <CardTitle className="text-base truncate">{memo.title}</CardTitle>
                      </div>
                      <Badge variant="secondary" className="ml-2 shrink-0">{tagLabel(memo.tag)}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <pre className="whitespace-pre-wrap text-sm text-muted-foreground mb-4 line-clamp-4">
                      {memo.content}
                    </pre>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{memo.updated_at}</span>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(memo)}>
                          <Edit className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(memo.id)}
                          disabled={deleteId === memo.id}
                        >
                          {deleteId === memo.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget ? t("editTitle") : t("createTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="memoTitle">{t("titleLabel")}</Label>
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
                    {tagLabel(tag)}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                {tc("cancel")}
              </Button>
              <Button onClick={handleSave} disabled={saving || !form.title.trim()}>
                {saving && <Loader2 className="size-4 animate-spin mr-2" />}
                {tc("save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
