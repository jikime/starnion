"use client"

import { useState, useEffect, useCallback } from "react"
import { useTranslations, useLocale } from "next-intl"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  PieChart,
  Settings,
  TrendingUp,
  TrendingDown,
  Wallet,
  AlertTriangle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ArrowUpDown,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  ResponsiveContainer,
} from "recharts"

// ── types ──────────────────────────────────────────────────────────────────

type BudgetItem = {
  category: string
  budget: number
  spent: number
  percent: number
}

type MonthlyPoint = { month: string; spent: number }

type BudgetData = {
  budgets: BudgetItem[]
  total_budget: number
  total_spent: number
  total_remaining: number
  total_percent: number
  warning_threshold: number
  danger_threshold: number
  monthly_spend_chart: MonthlyPoint[]
}

type SortBy = "spent" | "percent" | "remaining"

// ── constants ──────────────────────────────────────────────────────────────

const CATEGORIES = ["식비", "교통", "쇼핑", "구독", "의료", "문화", "기타"]

const CATEGORY_COLORS: Record<string, string> = {
  식비:  "#f97316",
  교통:  "#3b82f6",
  쇼핑:  "#a855f7",
  구독:  "#06b6d4",
  의료:  "#ef4444",
  문화:  "#eab308",
  기타:  "#6b7280",
}

const KRW = (v: number) =>
  new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW" }).format(v)


// ── mini sparkline bar ──────────────────────────────────────────────────────

function SparkBar({ data }: { data: MonthlyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={52}>
      <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <Bar dataKey="spent" fill="currentColor" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function SparkArea({ data }: { data: MonthlyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={52}>
      <AreaChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="currentColor" stopOpacity={0.3} />
            <stop offset="95%" stopColor="currentColor" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="spent"
          stroke="currentColor"
          fill="url(#sg)"
          strokeWidth={2}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── budget allocation mini chart (총예산 카드용) ─────────────────────────────

function BudgetAllocChart({ items }: { items: BudgetItem[] }) {
  const hasBudget = items.filter(b => b.budget > 0)
  if (hasBudget.length === 0) {
    return (
      <div className="h-[52px] flex items-end gap-1">
        {CATEGORIES.map(cat => (
          <div key={cat} className="flex-1 rounded-sm bg-muted" style={{ height: "20%" }} />
        ))}
      </div>
    )
  }
  const maxB = Math.max(...hasBudget.map(b => b.budget), 1)
  return (
    <div className="h-[52px] flex items-end gap-1">
      {CATEGORIES.map(cat => {
        const item = items.find(b => b.category === cat)
        const budget = item?.budget ?? 0
        const h = budget > 0 ? Math.max((budget / maxB) * 100, 12) : 8
        return (
          <div
            key={cat}
            className="flex-1 rounded-sm transition-all"
            style={{
              height: `${h}%`,
              backgroundColor: budget > 0 ? (CATEGORY_COLORS[cat] ?? "#6b7280") : undefined,
              opacity: budget > 0 ? 0.7 : undefined,
            }}
          >
            {budget === 0 && <div className="w-full h-full rounded-sm bg-muted" />}
          </div>
        )
      })}
    </div>
  )
}

// ── top metric card ─────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  delta,
  deltaLabel,
  chart,
  color,
}: {
  label: string
  value: string
  sub?: string
  delta?: number
  deltaLabel?: string
  chart: React.ReactNode
  color: string
}) {
  const positive = (delta ?? 0) >= 0
  return (
    <div className="rounded-2xl border bg-card p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          {delta !== undefined && (
            <span
              className={cn(
                "flex items-center gap-0.5 text-xs font-medium mt-0.5",
                positive ? "text-emerald-500" : "text-rose-500"
              )}
            >
              {positive ? (
                <TrendingUp className="size-3 shrink-0" />
              ) : (
                <TrendingDown className="size-3 shrink-0" />
              )}
              {positive ? "+" : ""}
              {delta.toFixed(1)}%
            </span>
          )}
        </div>
        {deltaLabel && (
          <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground shrink-0">
            {deltaLabel}
          </span>
        )}
      </div>
      <div className={cn("text-muted-foreground", color)}>{chart}</div>
      <div>
        <p className="text-sm font-medium">{label}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  )
}

// ── icon stat card ──────────────────────────────────────────────────────────

function IconCard({
  icon: Icon,
  iconBg,
  value,
  label,
  period,
  delta,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  iconBg: string
  value: string
  label: string
  period: string
  delta: number
  children?: React.ReactNode
}) {
  const positive = delta >= 0
  return (
    <div className="rounded-2xl border bg-card p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className={cn("rounded-xl p-2.5", iconBg)}>
          <Icon className="size-5" />
        </div>
        <span
          className={cn(
            "flex items-center gap-0.5 text-sm font-medium",
            positive ? "text-emerald-500" : "text-rose-500"
          )}
        >
          {positive ? (
            <TrendingUp className="size-3.5" />
          ) : (
            <TrendingDown className="size-3.5" />
          )}
          {positive ? "+" : ""}
          {delta.toFixed(1)}%
        </span>
      </div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
      <span className="w-fit text-xs bg-muted px-3 py-1 rounded-full text-muted-foreground">
        {period}
      </span>
      {children}
    </div>
  )
}

// ── main page ───────────────────────────────────────────────────────────────

export default function BudgetPage() {
  const t = useTranslations("budget")
  const tc = useTranslations("common")
  const tf = useTranslations("finance")
  const locale = useLocale()

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [data, setData] = useState<BudgetData | null>(null)
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<SortBy>("spent")

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [formBudgets, setFormBudgets] = useState<Record<string, string>>({})
  const [formWarn, setFormWarn] = useState("70")
  const [formDanger, setFormDanger] = useState("90")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const categoryLabel = (cat: string) => {
    const map: Record<string, string> = {
      "식비": tf("categories.food"),
      "교통": tf("categories.transport"),
      "쇼핑": tf("categories.shopping"),
      "구독": tf("categories.subscription"),
      "의료": tf("categories.medical"),
      "문화": tf("categories.culture"),
      "기타": tf("categories.other"),
    }
    return map[cat] ?? cat
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/budget?year=${year}&month=${month}`)
      if (res.ok) {
        const data = await res.json()
        setData(data)
      }
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => { fetchData() }, [fetchData])

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    // 현재 월 이후로는 이동 불가 (지출 데이터 없음)
    const cur = new Date(year, month - 1)
    if (cur >= new Date(now.getFullYear(), now.getMonth())) return
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  const openSettings = () => {
    const init: Record<string, string> = {}
    CATEGORIES.forEach(c => {
      const found = data?.budgets.find(b => b.category === c)
      init[c] = found?.budget ? String(found.budget) : ""
    })
    setFormBudgets(init)
    setFormWarn(String(data?.warning_threshold ?? 70))
    setFormDanger(String(data?.danger_threshold ?? 90))
    setSaveError(null)
    setSettingsOpen(true)
  }

  const handleSave = async () => {
    setSaveError(null)

    // ④ 경보 임계값 논리 검증
    const warnVal = parseInt(formWarn, 10)
    const dangerVal = parseInt(formDanger, 10)
    if (isNaN(warnVal) || isNaN(dangerVal) || warnVal <= 0 || dangerVal <= 0) {
      setSaveError(t("errorThresholdInvalid"))
      return
    }
    if (warnVal >= dangerVal) {
      setSaveError(t("errorThresholdOrder", { warn: warnVal, danger: dangerVal }))
      return
    }

    setSaving(true)
    try {
      const budgets: Record<string, number> = {}
      for (const [k, v] of Object.entries(formBudgets)) {
        const n = parseInt(v, 10)
        if (n > 0) budgets[k] = n
      }
      const res = await fetch("/api/budget", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          budgets,
          warning_threshold: warnVal,
          danger_threshold: dangerVal,
        }),
      })
      if (!res.ok) throw new Error(t("errorSaveFailed", { status: res.status }))
      setSettingsOpen(false)
      await fetchData()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t("errorSaveRetry"))
    } finally {
      setSaving(false)
    }
  }

  // ── derived ──────────────────────────────────────────────────────────────
  const chart = data?.monthly_spend_chart ?? []
  const prevMonthSpent = chart.length >= 2 ? chart[chart.length - 2].spent : 0
  const curMonthSpent = data?.total_spent ?? 0
  const spentDelta = prevMonthSpent > 0
    ? ((curMonthSpent - prevMonthSpent) / prevMonthSpent) * 100
    : 0

  const budgetItems = data?.budgets ?? []
  const overItems = budgetItems.filter(b => b.percent >= (data?.danger_threshold ?? 90))
  const warnItems = budgetItems.filter(
    b => b.percent >= (data?.warning_threshold ?? 70) && b.percent < (data?.danger_threshold ?? 90)
  )

  // ⑨ 정렬 기준 반영
  const sortedItems = [...budgetItems].sort((a, b) => {
    if (sortBy === "percent") return b.percent - a.percent
    if (sortBy === "remaining") {
      const remA = (a.budget > 0 ? a.budget : 0) - a.spent
      const remB = (b.budget > 0 ? b.budget : 0) - b.spent
      return remA - remB  // 초과 많은 것(음수) 먼저
    }
    return b.spent - a.spent  // default: 지출 금액
  })
  const maxSpent = [...budgetItems].sort((a, b) => b.spent - a.spent)[0]?.spent || 1

  const hasBudgets = budgetItems.some(b => b.budget > 0)
  const totalPct = data?.total_percent ?? 0
  const totalOverAmt = (data?.total_spent ?? 0) - (data?.total_budget ?? 0)

  // ⑩ 잔여예산 의미있는 표시값
  const remainingPct = data?.total_budget
    ? (data.total_remaining / data.total_budget) * 100
    : 0
  const remainingSub = data?.total_budget
    ? remainingPct >= 0
      ? t("remainingPctLabel", { pct: remainingPct.toFixed(0) })
      : t("overPctLabel", { pct: Math.abs(remainingPct).toFixed(0) })
    : t("remainingBudgetSub")

  // ⑤ 설정 다이얼로그 총합계
  const formTotal = Object.values(formBudgets).reduce((sum, v) => {
    const n = parseInt(v, 10)
    return sum + (n > 0 ? n : 0)
  }, 0)

  const monthLabel = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(
    new Date(year, month - 1)
  )

  // 미래 월 여부 (다음 버튼 비활성화용)
  const isCurrentMonth = new Date(year, month - 1) >= new Date(now.getFullYear(), now.getMonth())

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-8 w-32" />
          <div className="flex items-center gap-2">
            <Skeleton className="size-9 rounded-md" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="size-9 rounded-md" />
            <Skeleton className="h-9 w-24 rounded-md" />
          </div>
        </div>

        {/* Row 1 — MetricCards */}
        <div className="grid sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl border bg-card p-5 flex flex-col gap-3">
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-[52px] w-full rounded-md" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          ))}
        </div>

        {/* Row 2 — IconCards */}
        <div className="grid sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl border bg-card p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <Skeleton className="size-10 rounded-xl" />
                <Skeleton className="h-5 w-16 rounded" />
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-4 w-28" />
              </div>
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          ))}
        </div>

        {/* Category status card */}
        <div className="rounded-2xl border bg-card p-6 space-y-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="grid lg:grid-cols-2 gap-8">
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-3 w-3 rounded-full shrink-0" />
                  <Skeleton className="h-8 flex-1 rounded-md" />
                  <Skeleton className="h-3 w-8 shrink-0" />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <Skeleton className="size-2 rounded-full shrink-0" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                  <Skeleton className="h-7 w-16 ml-3.5" />
                  <Skeleton className="h-3 w-24 ml-3.5" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Total progress card */}
        <div className="rounded-2xl border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-36" />
          </div>
          <Skeleton className="h-5 w-full rounded-full" />
          <div className="flex justify-between">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <PieChart className="size-6 text-primary" />
            {t("title")}
          </h1>
        </div>
        <div className="flex items-center w-full sm:w-auto">
          <div className="flex-1 sm:hidden" />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={prevMonth}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-sm font-medium w-20 text-center">{monthLabel}</span>
            <Button variant="outline" size="icon" onClick={nextMonth} disabled={isCurrentMonth}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <div className="flex-1 flex justify-end sm:hidden">
            <Button variant="outline" className="gap-2 ml-2" onClick={openSettings}>
              <Settings className="size-4" />
              {t("settings")}
            </Button>
          </div>
          <Button variant="outline" className="gap-2 ml-2 hidden sm:flex" onClick={openSettings}>
            <Settings className="size-4" />
            {t("settings")}
          </Button>
        </div>
      </div>

      {/* Row 1 — metric cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        {/* ① 총예산: 카테고리별 예산 분포 차트 */}
        <MetricCard
          label={t("totalBudget")}
          value={KRW(data?.total_budget ?? 0)}
          sub={t("categoriesConfigured", { n: budgetItems.filter(b => b.budget > 0).length, total: CATEGORIES.length })}
          chart={
            <div className="text-blue-500">
              <BudgetAllocChart items={budgetItems} />
            </div>
          }
          color=""
        />
        <MetricCard
          label={t("thisMonthExpense")}
          value={KRW(curMonthSpent)}
          sub={t("prevMonthCompare")}
          delta={spentDelta}
          deltaLabel={t("lastMonthCompare")}
          chart={
            <div className="text-orange-500">
              <SparkBar data={chart} />
            </div>
          }
          color=""
        />
        {/* ⑩ 잔여예산: 의미있는 sub + delta 제거 */}
        <MetricCard
          label={t("remainingBudget")}
          value={KRW(data?.total_remaining ?? 0)}
          sub={remainingSub}
          chart={
            <div className="text-emerald-500">
              <SparkArea data={chart} />
            </div>
          }
          color=""
        />
      </div>

      {/* Row 2 — icon stat cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        <IconCard
          icon={Wallet}
          iconBg="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
          value={`${(data?.total_percent ?? 0).toFixed(1)}%`}
          label={t("totalUsageRate")}
          period={monthLabel}
          delta={spentDelta}
        />
        <IconCard
          icon={AlertTriangle}
          iconBg="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
          value={t("count", { n: warnItems.length })}
          label={t("warningCategories")}
          period={t("warningThreshold", { n: data?.warning_threshold ?? 70 })}
          delta={-warnItems.length * 5}
        >
          {warnItems.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {warnItems.map(b => (
                <span key={b.category} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  {categoryLabel(b.category)} {b.percent.toFixed(0)}%
                </span>
              ))}
            </div>
          )}
        </IconCard>
        <IconCard
          icon={AlertTriangle}
          iconBg="bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400"
          value={t("count", { n: overItems.length })}
          label={t("dangerCategories")}
          period={t("warningThreshold", { n: data?.danger_threshold ?? 90 })}
          delta={-overItems.length * 10}
        >
          {overItems.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {overItems.map(b => (
                <span key={b.category} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">
                  {categoryLabel(b.category)} {b.percent.toFixed(0)}%
                </span>
              ))}
            </div>
          )}
        </IconCard>
      </div>

      {/* Empty state onboarding */}
      {!hasBudgets && (
        <div className="rounded-2xl border-2 border-dashed border-border bg-muted/20 p-8 text-center">
          <PieChart className="size-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="font-semibold mb-1">{t("noBudgetTitle")}</p>
          <p className="text-sm text-muted-foreground mb-4">
            {t("noBudgetDesc")}
          </p>
          <Button onClick={openSettings}>
            <Settings className="size-4 mr-2" />
            {t("setBudgetButton")}
          </Button>
        </div>
      )}

      {/* Main — category budget status */}
      <div className="rounded-2xl border bg-card p-6">
        <div className="flex items-center justify-between mb-6">
          <p className="font-semibold text-base">{t("categoryStatus")}</p>
          {/* ⑨ 정렬 기준 토글 */}
          <div className="flex items-center gap-1">
            <ArrowUpDown className="size-3.5 text-muted-foreground mr-1" />
            {(["spent", "percent", "remaining"] as SortBy[]).map(key => {
              const labels: Record<SortBy, string> = {
                spent: t("sortSpent"),
                percent: t("sortPercent"),
                remaining: t("sortRemaining"),
              }
              return (
                <button
                  key={key}
                  onClick={() => setSortBy(key)}
                  className={cn(
                    "text-xs px-2 py-0.5 rounded-full border transition-colors",
                    sortBy === key
                      ? "bg-primary text-primary-foreground border-primary"
                      : "text-muted-foreground border-border hover:bg-muted"
                  )}
                >
                  {labels[key]}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left: horizontal bar chart — ② 레이블 바 외부 표시 */}
          <div className="space-y-2.5">
            {sortedItems.filter(b => b.budget > 0 || b.spent > 0).map((item, idx) => {
              const barW = maxSpent > 0 ? (item.spent / maxSpent) * 100 : 0
              const over = item.percent >= (data?.danger_threshold ?? 90)
              const warn = item.percent >= (data?.warning_threshold ?? 70) && !over
              const color = over
                ? "#ef4444"
                : warn
                ? "#f97316"
                : (CATEGORY_COLORS[item.category] ?? "#6b7280")

              return (
                <div key={item.category}>
                  {/* 카테고리명 + 퍼센트 (바 위에) */}
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground w-4 text-right shrink-0">{idx + 1}</span>
                      <span className="text-xs font-medium text-foreground">{categoryLabel(item.category)}</span>
                    </div>
                    <span className={cn("text-xs font-medium", over ? "text-rose-500" : warn ? "text-amber-500" : "text-muted-foreground")}>
                      {item.percent.toFixed(0)}%
                    </span>
                  </div>
                  {/* 바 */}
                  <div className="ml-5 relative h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="absolute left-0 top-0 bottom-0 rounded-full transition-all duration-500"
                      style={{ width: `${barW}%`, backgroundColor: color }}
                    />
                  </div>
                </div>
              )
            })}
            {sortedItems.filter(b => b.budget > 0 || b.spent > 0).length === 0 && (
              <p className="text-sm text-muted-foreground py-4">{t("noExpense")}</p>
            )}
          </div>

          {/* Right: category grid — ⑥ 금액 크게, 퍼센트 작게 */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-5">
            {sortedItems.filter(b => b.budget > 0 || b.spent > 0).map(item => {
              const over = item.percent >= (data?.danger_threshold ?? 90)
              const warn = item.percent >= (data?.warning_threshold ?? 70) && !over
              const dotColor = over
                ? "bg-rose-500"
                : warn
                ? "bg-amber-500"
                : ""
              const overAmt = item.spent - item.budget

              return (
                <Link
                  key={item.category}
                  href={`/finance?category=${encodeURIComponent(item.category)}`}
                  className="flex flex-col gap-0.5 group rounded-lg p-1 -m-1 hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn("size-2 rounded-full shrink-0", dotColor || "bg-muted-foreground")}
                      style={!dotColor ? { backgroundColor: CATEGORY_COLORS[item.category] ?? "#6b7280" } : undefined}
                    />
                    <span className="text-xs text-muted-foreground">{categoryLabel(item.category)}</span>
                  </div>
                  {/* ⑥ 금액을 주인공으로, 퍼센트는 보조 */}
                  <p className="text-base font-bold ml-3.5">{KRW(item.spent)}</p>
                  <div className="flex items-center gap-1.5 ml-3.5">
                    <span className={cn("text-xs font-medium", over ? "text-rose-500" : warn ? "text-amber-500" : "text-muted-foreground")}>
                      {item.percent.toFixed(0)}%
                    </span>
                    {item.budget > 0 && (
                      <span className="text-xs text-muted-foreground/50">/ {KRW(item.budget)}</span>
                    )}
                  </div>
                  {over && item.budget > 0 && overAmt > 0 && (
                    <span className="ml-3.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 w-fit">
                      {t("overAmountBadge", { amount: KRW(overAmt) })}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      {/* Bottom — total progress bar */}
      <div className="rounded-2xl border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="font-semibold text-base">{t("totalProgress")}</p>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {KRW(data?.total_spent ?? 0)} / {KRW(data?.total_budget ?? 0)}
            </span>
            {totalPct > 100 && totalOverAmt > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                {t("overAmountBadge", { amount: KRW(totalOverAmt) })}
              </span>
            )}
          </div>
        </div>
        <div className="relative h-5 rounded-full bg-muted overflow-hidden">
          {(() => {
            const pct = Math.min(totalPct, 100)
            const isOver = totalPct > 100
            const warn = totalPct >= (data?.warning_threshold ?? 70) && !isOver
            const bg = isOver ? "bg-rose-500" : warn ? "bg-amber-500" : "bg-blue-500"
            return (
              <>
                <div
                  className={cn("h-full rounded-full transition-all duration-700", bg)}
                  style={{ width: `${pct}%` }}
                />
                {isOver && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[11px] font-bold text-white drop-shadow-sm">
                      {t("overBudgetLabel", { pct: totalPct.toFixed(0) })}
                    </span>
                  </div>
                )}
              </>
            )
          })()}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground mt-2">
          <span>{t("used")} {totalPct.toFixed(1)}%</span>
          <span>
            {totalPct > 100
              ? <span className="text-rose-600 font-medium">{t("overSpentLabel", { amount: KRW(Math.abs(data?.total_remaining ?? 0)) })}</span>
              : <>{t("remaining")} {KRW(data?.total_remaining ?? 0)}</>
            }
          </span>
        </div>
      </div>

      {/* Settings dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("settingsTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2 max-h-[70vh] overflow-y-auto pr-1">
            {/* ⑤ 총합계 실시간 표시 */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{t("categoryBudgetDesc")}</p>
              <span className={cn(
                "text-xs font-semibold px-2 py-0.5 rounded-full",
                formTotal > 0 ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "bg-muted text-muted-foreground"
              )}>
                {t("totalSum", { amount: KRW(formTotal) })}
              </span>
            </div>
            {CATEGORIES.map(cat => (
              <div key={cat} className="flex items-center gap-3">
                <Label className="w-14 shrink-0 text-sm">{categoryLabel(cat)}</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={formBudgets[cat] ?? ""}
                  onChange={e =>
                    setFormBudgets(f => ({ ...f, [cat]: e.target.value }))
                  }
                />
              </div>
            ))}
            <div className="border-t pt-4 space-y-3">
              <p className="text-xs text-muted-foreground font-medium">{t("alertThreshold")}</p>
              <div className="flex items-center gap-3">
                <Label className="w-14 shrink-0 text-sm text-amber-500">{t("warning")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={99}
                  value={formWarn}
                  onChange={e => setFormWarn(e.target.value)}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">%</span>
                <span className="text-xs text-muted-foreground">{t("warnThresholdDesc")}</span>
              </div>
              <div className="flex items-center gap-3">
                <Label className="w-14 shrink-0 text-sm text-rose-500">{t("danger")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={formDanger}
                  onChange={e => setFormDanger(e.target.value)}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">%</span>
                <span className="text-xs text-muted-foreground">{t("dangerThresholdDesc")}</span>
              </div>
              {/* ④ 검증 힌트 */}
              <p className="text-xs text-muted-foreground">{t("thresholdHint")}</p>
            </div>

            {/* ③ 저장 에러 표시 */}
            {saveError && (
              <div className="flex items-start gap-2 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 px-3 py-2">
                <AlertCircle className="size-4 text-rose-500 shrink-0 mt-0.5" />
                <p className="text-xs text-rose-700 dark:text-rose-400">{saveError}</p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setSettingsOpen(false)} disabled={saving}>
                {tc("cancel")}
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="size-3.5 animate-spin mr-1.5" />}
                {tc("save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
