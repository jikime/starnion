"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useTranslations } from "next-intl"
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
import { Plus, Edit, Trash2, Clock, Loader2, RefreshCw, Bell, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

// ── types ──────────────────────────────────────────────────────────────────────

interface DdayRaw {
  id: number
  title: string
  target_date: string
  icon: string
  description: string
  recurring: boolean
  created_at: string
}

interface Dday extends DdayRaw {
  dday_value: number
  dday_label: string
}

interface DdayForm {
  title: string
  target_date: string
  icon: string
  description: string
  recurring: boolean // [#1] 매년 반복 설정
}

const emptyForm: DdayForm = {
  title: "",
  target_date: "",
  icon: "📅",
  description: "",
  recurring: false,
}

const ICON_OPTIONS = ["📅", "🎂", "💍", "✈️", "🎓", "🏆", "💼", "❤️", "🎯", "⭐"]

// [#1] recurring 지원 — 반복 기념일은 다음 연도 기준으로 D-Day 재계산
function computeDday(
  targetDate: string,
  recurring?: boolean
): { dday_value: number; dday_label: string } {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let target = new Date(targetDate)
  target.setHours(0, 0, 0, 0)

  if (recurring) {
    const thisYear = today.getFullYear()
    const candidate = new Date(target)
    candidate.setFullYear(thisYear)
    // 올해 날짜가 오늘보다 이전이면 내년으로 자동 전진
    if (candidate < today) {
      candidate.setFullYear(thisYear + 1)
    }
    target = candidate
  }

  const value = Math.round((today.getTime() - target.getTime()) / 86_400_000)
  const label = value === 0 ? "D-Day" : value < 0 ? `D${value}` : `D+${value}`
  return { dday_value: value, dday_label: label }
}

// [#5] 폼에서 실시간 D-Day 미리보기용 자연어 변환 — resolved via t() in components

function naturalDayText(value: number, t: ReturnType<typeof useTranslations<"dday">>): string {
  if (value === 0) return t("todayText")
  if (value < 0) return t("daysLater", { days: Math.abs(value) })
  return t("daysBefore", { days: value })
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
  const [pastExpanded, setPastExpanded] = useState(false)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/dday")
      if (!res.ok) throw new Error("fetch failed")
      const data = await res.json()
      const raw: DdayRaw[] = data.ddays ?? (Array.isArray(data) ? data : [])
      setItems(raw.map((d) => ({ ...d, ...computeDday(d.target_date, d.recurring) })))
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
      recurring: item.recurring,
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
    await fetch(`/api/dday/${id}`, { method: "DELETE" })
    await fetchItems()
  }

  // [#4] 정렬 보장 — 임박한 순서 (0, -1, -2, ...) / 지난 것은 최근 순 (1, 2, ...)
  const upcoming = useMemo(
    () =>
      items
        .filter((d) => d.dday_value <= 0)
        .sort((a, b) => b.dday_value - a.dday_value),
    [items]
  )
  const past = useMemo(
    () =>
      items
        .filter((d) => d.dday_value > 0)
        .sort((a, b) => a.dday_value - b.dday_value),
    [items]
  )

  // [#9] 임박 D-Day (7일 이내)
  const urgent = upcoming.filter((d) => d.dday_value >= -7 && d.dday_value < 0)

  // [#5] 폼 실시간 D-Day 미리보기
  const formPreview = form.target_date
    ? computeDday(form.target_date, form.recurring)
    : null

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* [#8] 반응형 헤더 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Clock className="size-6 text-primary" />
            {t("title")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
        </div>
        <Button className="gap-2 w-full sm:w-auto" onClick={openCreate}>
          <Plus className="size-4" />
          <span>{t("addButton")}</span>
        </Button>
      </div>

      {loading ? (
        <div className="space-y-8">
          {[4, 3].map((count, si) => (
            <div key={si} className="space-y-3">
              <Skeleton className="h-4 w-20" />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: count }).map((_, i) => (
                  <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Skeleton className="size-6 rounded" />
                        <Skeleton className="h-4 w-28" />
                      </div>
                      <div className="flex gap-1">
                        <Skeleton className="size-6 rounded" />
                        <Skeleton className="size-6 rounded" />
                      </div>
                    </div>
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        /* [#10] 온보딩 빈 상태 */
        <div className="flex flex-col items-center justify-center py-16 gap-6">
          <div className="size-16 rounded-2xl bg-muted/50 flex items-center justify-center">
            <Clock className="size-8 opacity-40" />
          </div>
          <div className="text-center space-y-1">
            <p className="font-medium">{t("empty")}</p>
            <p className="text-sm text-muted-foreground">{t("emptyHint")}</p>
          </div>
          {/* 예시 제안 */}
          <div className="flex flex-wrap justify-center gap-2">
            {[
              { icon: "🎂", labelKey: "exampleBirthday" as const },
              { icon: "💍", labelKey: "exampleAnniversary" as const },
              { icon: "✈️", labelKey: "exampleTrip" as const },
              { icon: "🎓", labelKey: "exampleExam" as const },
            ].map((ex) => (
              <span
                key={ex.labelKey}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border border-border bg-muted/40 text-muted-foreground"
              >
                {ex.icon} {t(ex.labelKey)}
              </span>
            ))}
          </div>
          <Button onClick={openCreate}>{t("addFirst")}</Button>
        </div>
      ) : (
        <div className="space-y-8">
          {/* [#9] 임박 D-Day 섹션 (7일 이내) */}
          {urgent.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-1.5 text-sm font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                <Bell className="size-3.5" />
                {t("urgentTitle")}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {urgent.map((item) => (
                  <DdayCard
                    key={item.id}
                    item={item}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    urgent
                  />
                ))}
              </div>
            </section>
          )}

          {upcoming.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                {t("upcoming")}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {upcoming
                  .filter((d) => d.dday_value < -7 || d.dday_value === 0)
                  .map((item) => (
                    <DdayCard
                      key={item.id}
                      item={item}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                    />
                  ))}
              </div>
            </section>
          )}

          {past.length > 0 && (
            <section className="space-y-3">
              {/* 토글 버튼 — 기본 접힘 */}
              <button
                type="button"
                onClick={() => setPastExpanded((v) => !v)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronDown
                  className={cn(
                    "size-4 transition-transform duration-200",
                    pastExpanded && "rotate-180"
                  )}
                />
                {pastExpanded
                  ? t("collapsePast")
                  : t("expandPast", { count: past.length })}
              </button>

              {/* 카드 그리드 — 펼쳐진 경우만 표시 */}
              {pastExpanded && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {past.map((item) => (
                    <DdayCard
                      key={item.id}
                      item={item}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )}
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

            {/* [#7] 아이콘 선택 + 직접 입력 */}
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
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{t("customIconLabel")}</span>
                <Input
                  className="w-16 text-center text-base"
                  maxLength={2}
                  value={form.icon}
                  onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value || "📅" }))}
                  placeholder="📅"
                />
                <span className="text-xs text-muted-foreground">
                  {t("selectedIconLabel")} <span className="text-lg">{form.icon}</span>
                </span>
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
              {/* [#5] 날짜 입력 실시간 D-Day 미리보기 */}
              {formPreview && (
                <div className={cn(
                  "flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg",
                  formPreview.dday_value === 0
                    ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                    : formPreview.dday_value < 0
                    ? "bg-primary/5 text-primary"
                    : "bg-muted/60 text-muted-foreground"
                )}>
                  <span className="font-bold tabular-nums">{formPreview.dday_label}</span>
                  <span className="text-xs">·</span>
                  <span className="text-xs">{naturalDayText(formPreview.dday_value, t)}</span>
                  {form.recurring && formPreview.dday_value < 0 && (
                    <span className="ml-auto text-xs opacity-70">{t("recurringBasis")}</span>
                  )}
                </div>
              )}
            </div>

            {/* [#1] 매년 반복 토글 */}
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <div className="flex items-center gap-2">
                <RefreshCw className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{t("recurringLabel")}</p>
                  <p className="text-xs text-muted-foreground">{t("recurringDesc")}</p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.recurring}
                onClick={() => setForm((f) => ({ ...f, recurring: !f.recurring }))}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                  form.recurring ? "bg-primary" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block size-4 rounded-full bg-white shadow-sm transition-transform",
                    form.recurring ? "translate-x-4" : "translate-x-0"
                  )}
                />
              </button>
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

// ── DdayCard ───────────────────────────────────────────────────────────────────

function DdayCard({
  item,
  onEdit,
  onDelete,
  urgent,
}: {
  item: Dday
  onEdit: (item: Dday) => void
  onDelete: (id: number) => void
  urgent?: boolean
}) {
  const t = useTranslations("dday")
  const tc = useTranslations("common")
  const isToday = item.dday_value === 0
  const isPast = item.dday_value > 0
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleConfirmDelete() {
    setConfirmDelete(false)
    setDeleting(true)
    await onDelete(item.id)
    setDeleting(false)
  }

  return (
    <>
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border border-border bg-card",
          isToday && "ring-2 ring-green-500/60",
          urgent && !isToday && "ring-2 ring-amber-400/50 border-amber-200 dark:border-amber-800"
        )}
      >
        <div className="p-4 sm:p-5 flex flex-col gap-3">
          {/* [#3] 제목을 상단에 — 정보 위계 개선 */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xl shrink-0">{item.icon}</span>
              <div className="min-w-0">
                <p className="font-semibold leading-tight truncate">{item.title}</p>
                {/* [#1] 매년 반복 배지 */}
                {item.recurring && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-primary/70 mt-0.5">
                    <RefreshCw className="size-2.5" />
                    {t("recurringLabel")}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-0.5 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => onEdit(item)}
              >
                <Edit className="size-3.5" />
              </Button>
              {/* [#2] 삭제 확인 AlertDialog */}
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setConfirmDelete(true)}
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

          {/* D-Day 숫자 + 자연어 */}
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "text-3xl font-bold tabular-nums tracking-tight",
                isToday && "text-green-500",
                isPast && "text-muted-foreground",
                !isToday && !isPast && "text-primary"
              )}
            >
              {item.dday_label}
            </span>
            {/* [#6] 자연어 표현 */}
            <span className={cn(
              "text-xs",
              isToday && "text-green-500 font-semibold",
              isPast && "text-muted-foreground",
              !isToday && !isPast && "text-muted-foreground"
            )}>
              {naturalDayText(item.dday_value, t)}
            </span>
          </div>

          {/* 메모 */}
          {item.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
          )}

          {/* 날짜 + 임박 배지 */}
          <div className="flex items-center justify-between">
            <p className={cn("text-xs", isPast ? "text-muted-foreground" : "text-foreground/70")}>
              {item.target_date}
              {isToday && (
                <span className="ml-2 font-semibold text-green-500">{t("today")}</span>
              )}
            </p>
            {/* [#9] 임박 배지 */}
            {urgent && !isToday && (
              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 font-medium">
                <Bell className="size-2.5" />
                {t("urgentBadge")}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* [#2] 삭제 확인 다이얼로그 */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{item.title}</strong>{t("deleteConfirmDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

