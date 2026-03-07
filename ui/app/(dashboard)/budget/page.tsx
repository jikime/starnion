"use client"

import { useState, useEffect, useCallback } from "react"
import { useTranslations, useLocale } from "next-intl"
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
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  ResponsiveContainer,
  Tooltip,
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

const KRW_SHORT = (v: number) => {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억`
  if (v >= 10_000) return `${(v / 10_000).toFixed(0)}만`
  return `${v.toLocaleString()}`
}

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
                "text-xs font-medium",
                positive ? "text-emerald-500" : "text-rose-500"
              )}
            >
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
}: {
  icon: React.ComponentType<{ className?: string }>
  iconBg: string
  value: string
  label: string
  period: string
  delta: number
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

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [formBudgets, setFormBudgets] = useState<Record<string, string>>({})
  const [formWarn, setFormWarn] = useState("70")
  const [formDanger, setFormDanger] = useState("90")
  const [saving, setSaving] = useState(false)

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
      if (res.ok) setData(await res.json())
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
    setSettingsOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const budgets: Record<string, number> = {}
      for (const [k, v] of Object.entries(formBudgets)) {
        const n = parseInt(v, 10)
        if (n > 0) budgets[k] = n
      }
      await fetch("/api/budget", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          budgets,
          warning_threshold: parseInt(formWarn, 10) || 70,
          danger_threshold: parseInt(formDanger, 10) || 90,
        }),
      })
      setSettingsOpen(false)
      await fetchData()
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

  const sortedItems = [...budgetItems].sort((a, b) => b.spent - a.spent)
  const maxSpent = sortedItems[0]?.spent || 1

  const monthLabel = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(
    new Date(year, month - 1)
  )

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <PieChart className="size-6 text-primary" />
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{monthLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevMonth}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm font-medium w-20 text-center">{monthLabel}</span>
          <Button variant="outline" size="icon" onClick={nextMonth}>
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="outline" className="gap-2 ml-2" onClick={openSettings}>
            <Settings className="size-4" />
            {t("settings")}
          </Button>
        </div>
      </div>

      {/* Row 1 — metric cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        <MetricCard
          label={t("totalBudget")}
          value={KRW_SHORT(data?.total_budget ?? 0) + "원"}
          sub={t("totalBudgetSub")}
          delta={undefined}
          chart={
            <div className="text-blue-500">
              <SparkBar data={chart} />
            </div>
          }
          color=""
        />
        <MetricCard
          label={t("thisMonthExpense")}
          value={KRW_SHORT(curMonthSpent) + "원"}
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
        <MetricCard
          label={t("remainingBudget")}
          value={KRW_SHORT(data?.total_remaining ?? 0) + "원"}
          sub={t("remainingBudgetSub")}
          delta={
            data?.total_budget
              ? ((data.total_remaining / data.total_budget) * 100) - 100
              : undefined
          }
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
        />
        <IconCard
          icon={AlertTriangle}
          iconBg="bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400"
          value={t("count", { n: overItems.length })}
          label={t("dangerCategories")}
          period={t("warningThreshold", { n: data?.danger_threshold ?? 90 })}
          delta={-overItems.length * 10}
        />
      </div>

      {/* Main — category budget status */}
      <div className="rounded-2xl border bg-card p-6">
        <div className="flex items-center justify-between mb-6">
          <p className="font-semibold text-base">{t("categoryStatus")}</p>
          <span className="text-xs text-muted-foreground">{t("spentOverBudget")}</span>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left: horizontal bar chart */}
          <div className="space-y-3">
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
                <div key={item.category} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-4 text-right shrink-0">
                    {idx + 1}
                  </span>
                  <div className="flex-1 relative h-8 flex items-center">
                    <div className="absolute inset-0 rounded-md bg-muted" />
                    <div
                      className="absolute left-0 top-0 bottom-0 rounded-md transition-all duration-500"
                      style={{ width: `${barW}%`, backgroundColor: color }}
                    />
                    <span className="relative z-10 px-3 text-xs font-medium text-white mix-blend-overlay">
                      {categoryLabel(item.category)}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground w-10 text-right shrink-0">
                    {item.percent.toFixed(0)}%
                  </span>
                </div>
              )
            })}
            {sortedItems.filter(b => b.budget > 0 || b.spent > 0).length === 0 && (
              <p className="text-sm text-muted-foreground py-4">{t("noExpense")}</p>
            )}
            <div className="flex justify-between text-xs text-muted-foreground pt-1 ml-7">
              <span>0%</span>
              <span>25%</span>
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Right: category grid */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-5">
            {sortedItems.filter(b => b.budget > 0 || b.spent > 0).map(item => {
              const over = item.percent >= (data?.danger_threshold ?? 90)
              const warn = item.percent >= (data?.warning_threshold ?? 70) && !over
              const dotColor = over
                ? "bg-rose-500"
                : warn
                ? "bg-amber-500"
                : ""

              return (
                <div key={item.category} className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "size-2 rounded-full shrink-0",
                        dotColor || "bg-muted-foreground"
                      )}
                      style={
                        !dotColor
                          ? { backgroundColor: CATEGORY_COLORS[item.category] ?? "#6b7280" }
                          : undefined
                      }
                    />
                    <span className="text-xs text-muted-foreground">{categoryLabel(item.category)}</span>
                  </div>
                  <p className="text-xl font-bold ml-3.5">{item.percent.toFixed(0)}%</p>
                  <p className="text-xs text-muted-foreground ml-3.5">
                    {KRW(item.spent)}
                    {item.budget > 0 && (
                      <span className="text-muted-foreground/60"> / {KRW(item.budget)}</span>
                    )}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Bottom — total progress bar */}
      <div className="rounded-2xl border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="font-semibold text-base">{t("totalProgress")}</p>
          <span className="text-sm text-muted-foreground">
            {KRW(data?.total_spent ?? 0)} / {KRW(data?.total_budget ?? 0)}
          </span>
        </div>
        <div className="relative h-5 rounded-full bg-muted overflow-hidden">
          {(() => {
            const pct = Math.min(data?.total_percent ?? 0, 100)
            const over = pct >= (data?.danger_threshold ?? 90)
            const warn = pct >= (data?.warning_threshold ?? 70) && !over
            const bg = over ? "bg-rose-500" : warn ? "bg-amber-500" : "bg-blue-500"
            return (
              <div
                className={cn("h-full rounded-full transition-all duration-700", bg)}
                style={{ width: `${pct}%` }}
              />
            )
          })()}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground mt-2">
          <span>{t("used")} {(data?.total_percent ?? 0).toFixed(1)}%</span>
          <span>{t("remaining")} {KRW(data?.total_remaining ?? 0)}</span>
        </div>
      </div>

      {/* Settings dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("settingsTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2 max-h-[70vh] overflow-y-auto pr-1">
            <p className="text-xs text-muted-foreground">{t("categoryBudgetDesc")}</p>
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
                  value={formWarn}
                  onChange={e => setFormWarn(e.target.value)}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <div className="flex items-center gap-3">
                <Label className="w-14 shrink-0 text-sm text-rose-500">{t("danger")}</Label>
                <Input
                  type="number"
                  value={formDanger}
                  onChange={e => setFormDanger(e.target.value)}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
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
