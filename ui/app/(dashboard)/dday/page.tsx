"use client"

import { useState, useEffect, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Plus, Edit, Trash2, Clock, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface Dday {
  id: number
  title: string
  target_date: string
  icon: string
  description: string
  dday_value: number
  dday_label: string
  created_at: string
}

interface DdayForm {
  title: string
  target_date: string
  icon: string
  description: string
}

const emptyForm: DdayForm = { title: "", target_date: "", icon: "📅", description: "" }

const ICON_OPTIONS = ["📅", "🎂", "💍", "✈️", "🎓", "🏆", "💼", "❤️", "🎯", "⭐"]

function DDayBadge({ label, value }: { label: string; value: number }) {
  const isToday = value === 0
  const isPast = value > 0

  return (
    <span
      className={cn(
        "text-3xl font-bold tabular-nums tracking-tight",
        isToday && "text-green-500",
        isPast && "text-muted-foreground",
        !isToday && !isPast && "text-primary"
      )}
    >
      {label}
    </span>
  )
}

export default function DdayPage() {
  const t = useTranslations("dday")
  const tc = useTranslations("common")

  const [items, setItems] = useState<Dday[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Dday | null>(null)
  const [form, setForm] = useState<DdayForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/dday")
      if (!res.ok) throw new Error("fetch failed")
      const data = await res.json()
      setItems(Array.isArray(data) ? data : [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  function openCreate() {
    setEditTarget(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(item: Dday) {
    setEditTarget(item)
    setForm({
      title: item.title,
      target_date: item.target_date,
      icon: item.icon,
      description: item.description,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.title.trim() || !form.target_date) return
    setSaving(true)
    try {
      let res: Response
      if (editTarget) {
        res = await fetch(`/api/dday/${editTarget.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })
      } else {
        res = await fetch("/api/dday", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })
      }
      if (!res.ok) throw new Error("save failed")
      setDialogOpen(false)
      await fetchItems()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    setDeleteId(id)
    try {
      await fetch(`/api/dday/${id}`, { method: "DELETE" })
      await fetchItems()
    } finally {
      setDeleteId(null)
    }
  }

  const upcoming = items.filter((d) => d.dday_value <= 0)
  const past = items.filter((d) => d.dday_value > 0)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Clock className="size-6 text-primary" />
            {t("title")}
          </h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="size-4" />
          {t("addButton")}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <Clock className="size-10" />
          <p className="text-base">{t("empty")}</p>
          <Button variant="outline" onClick={openCreate}>{t("addFirst")}</Button>
        </div>
      ) : (
        <div className="space-y-8">
          {upcoming.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                {t("upcoming")}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {upcoming.map((item) => (
                  <DdayCard
                    key={item.id}
                    item={item}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    deleting={deleteId === item.id}
                  />
                ))}
              </div>
            </section>
          )}

          {past.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                {t("past")}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {past.map((item) => (
                  <DdayCard
                    key={item.id}
                    item={item}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    deleting={deleteId === item.id}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget ? t("editTitle") : t("createTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("iconLabel")}</Label>
              <div className="flex gap-2 flex-wrap">
                {ICON_OPTIONS.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, icon }))}
                    className={cn(
                      "text-xl rounded-md px-2 py-1 border transition-colors",
                      form.icon === icon
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ddayTitle">{t("titleLabel")}</Label>
              <Input
                id="ddayTitle"
                placeholder={t("titlePlaceholder")}
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ddayDate">{t("dateLabel")}</Label>
              <Input
                id="ddayDate"
                type="date"
                value={form.target_date}
                onChange={(e) => setForm((f) => ({ ...f, target_date: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ddayDesc">{t("memoLabel")}</Label>
              <Textarea
                id="ddayDesc"
                placeholder={t("memoPlaceholder")}
                className="min-h-[80px]"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                {tc("cancel")}
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !form.title.trim() || !form.target_date}
              >
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

function DdayCard({
  item,
  onEdit,
  onDelete,
  deleting,
}: {
  item: Dday
  onEdit: (item: Dday) => void
  onDelete: (id: number) => void
  deleting: boolean
}) {
  const t = useTranslations("dday")
  const isToday = item.dday_value === 0
  const isPast = item.dday_value > 0

  return (
    <Card
      className={cn(
        "relative overflow-hidden",
        isToday && "ring-2 ring-green-500/60"
      )}
    >
      <CardContent className="p-5 flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <span className="text-2xl">{item.icon}</span>
          <div className="flex gap-0.5">
            <Button variant="ghost" size="icon" className="size-7" onClick={() => onEdit(item)}>
              <Edit className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-destructive hover:text-destructive"
              onClick={() => onDelete(item.id)}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
            </Button>
          </div>
        </div>

        <DDayBadge label={item.dday_label} value={item.dday_value} />

        <div>
          <p className="font-medium leading-tight">{item.title}</p>
          {item.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>
          )}
        </div>

        <p className={cn("text-xs", isPast ? "text-muted-foreground" : "text-foreground/70")}>
          {item.target_date}
          {isToday && (
            <span className="ml-2 font-semibold text-green-500">{t("today")}</span>
          )}
        </p>
      </CardContent>
    </Card>
  )
}
