"use client"

import { useEffect, useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import {
  TrendingUp,
  TrendingDown,
  Brain,
  CreditCard,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Loader2,
  Lightbulb,
  CalendarDays,
  BarChart3,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface MonthlyTrend {
  month: string
  income: number
  expense: number
}

interface CategoryBreakdown {
  category: string
  amount: number
  percent: number
  count: number
}

interface WeekdaySpending {
  weekday: number
  total: number
  avg: number
  count: number
}

interface HeatmapRow {
  date: string
  total: number
}

interface Summary {
  total_expense: number
  avg_daily: number
  tx_count: number
  top_category: string
  top_category_amt: number
  this_month_expense: number
  last_month_expense: number
  mom: number
}

interface ConvStats {
  total_messages: number
  this_month: number
  user_messages: number
  conversations: number
}

interface StatsData {
  summary: Summary
  monthly_trend: MonthlyTrend[]
  category_breakdown: CategoryBreakdown[]
  weekday_spending: WeekdaySpending[]
  heatmap: HeatmapRow[]
  conversation: ConvStats
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_COLORS = [
  "#3b6de0", "#8b5cf6", "#ec4899", "#f59e0b",
  "#10b981", "#06b6d4", "#ef4444", "#14b8a6",
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatKRW(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`
  return `${n.toLocaleString()}`
}

function formatKRWFull(n: number): string {
  return `₩${n.toLocaleString()}`
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  trend,
  icon: Icon,
  color = "indigo",
}: {
  label: string
  value: string
  sub?: string
  trend?: number
  icon: React.ElementType
  color?: string
}) {
  const colorMap: Record<string, string> = {
    indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400",
    violet: "bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-400",
    rose: "bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between">
        <div className={`rounded-lg p-2.5 ${colorMap[color]}`}>
          <Icon className="size-5" />
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-medium ${
            trend > 0 ? "text-rose-500" : trend < 0 ? "text-emerald-500" : "text-muted-foreground"
          }`}>
            {trend > 0 ? <ArrowUpRight className="size-3.5" /> :
             trend < 0 ? <ArrowDownRight className="size-3.5" /> :
             <Minus className="size-3.5" />}
            {Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </div>
      <div className="mt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

function Panel({
  title,
  icon: Icon,
  iconClass,
  children,
}: {
  title: string
  icon: React.ElementType
  iconClass?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <Icon className={`size-4 ${iconClass}`} />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function CurrencyTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-background p-3 text-xs">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium">{formatKRWFull(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Heatmap ─────────────────────────────────────────────────────────────────

function SpendingHeatmap({ data, lessLabel, moreLabel }: { data: HeatmapRow[]; lessLabel: string; moreLabel: string }) {
  const map = new Map(data.map((d) => [d.date, d.total]))
  const max = Math.max(...data.map((d) => d.total), 1)

  const days: { date: string; total: number }[] = []
  for (let i = 89; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    days.push({ date: key, total: map.get(key) ?? 0 })
  }

  const firstDay = new Date(days[0].date).getDay()
  const padded = Array(firstDay).fill(null).concat(days)

  const weeks: ({ date: string; total: number } | null)[][] = []
  for (let i = 0; i < padded.length; i += 7) {
    weeks.push(padded.slice(i, i + 7))
  }

  function intensity(total: number): string {
    if (total === 0) return "bg-muted/40"
    const ratio = total / max
    if (ratio < 0.25) return "bg-indigo-200 dark:bg-indigo-900"
    if (ratio < 0.5) return "bg-indigo-400 dark:bg-indigo-700"
    if (ratio < 0.75) return "bg-indigo-600 dark:bg-indigo-500"
    return "bg-indigo-800 dark:bg-indigo-300"
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1 min-w-max">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((day, di) => (
              day === null
                ? <div key={di} className="size-3.5 rounded-sm" />
                : (
                  <div
                    key={di}
                    title={`${day.date}: ${formatKRWFull(day.total)}`}
                    className={`size-3.5 rounded-sm cursor-default transition-opacity hover:opacity-80 ${intensity(day.total)}`}
                  />
                )
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
        <span>{lessLabel}</span>
        {["bg-muted/40", "bg-indigo-200 dark:bg-indigo-900", "bg-indigo-400 dark:bg-indigo-700",
          "bg-indigo-600 dark:bg-indigo-500", "bg-indigo-800 dark:bg-indigo-300"].map((c, i) => (
          <div key={i} className={`size-3.5 rounded-sm ${c}`} />
        ))}
        <span>{moreLabel}</span>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StatisticsPage() {
  const t = useTranslations("statistics")

  const [months, setMonths] = useState("6")
  const [stats, setStats] = useState<StatsData | null>(null)
  const [insights, setInsights] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const WEEKDAY_LABELS = [
    t("weekdays.sun"),
    t("weekdays.mon"),
    t("weekdays.tue"),
    t("weekdays.wed"),
    t("weekdays.thu"),
    t("weekdays.fri"),
    t("weekdays.sat"),
  ]

  const fetchData = useCallback(async (m: string) => {
    setLoading(true)
    try {
      const [statsRes, insightsRes] = await Promise.all([
        fetch(`/api/statistics?months=${m}`),
        fetch("/api/statistics/insights"),
      ])
      const [statsData, insightsData] = await Promise.all([
        statsRes.json(),
        insightsRes.json(),
      ])
      setStats(statsData)
      setInsights(insightsData.insights ?? [])
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(months)
  }, [months, fetchData])

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const s = stats?.summary
  const trend = stats?.monthly_trend ?? []
  const cats = stats?.category_breakdown ?? []
  const weekdays = stats?.weekday_spending ?? []
  const heatmap = stats?.heatmap ?? []

  const weekdayData = WEEKDAY_LABELS.map((label, i) => {
    const found = weekdays.find((w) => w.weekday === i)
    return { label, total: found?.total ?? 0, avg: found?.avg ?? 0, count: found?.count ?? 0 }
  })
  const maxWeekday = Math.max(...weekdayData.map((w) => w.total), 1)

  return (
    <div className="p-6 space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <TrendingUp className="size-6 text-indigo-500" />
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Select value={months} onValueChange={(v) => setMonths(v)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">{t("month1")}</SelectItem>
            <SelectItem value="3">{t("month3")}</SelectItem>
            <SelectItem value="6">{t("month6")}</SelectItem>
            <SelectItem value="12">{t("month12")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── Summary Cards ──────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t("totalExpense")}
          value={formatKRWFull(s?.total_expense ?? 0)}
          sub={t("totalExpenseSub", { months })}
          icon={CreditCard}
          color="rose"
        />
        <StatCard
          label={t("thisMonthExpense")}
          value={formatKRWFull(s?.this_month_expense ?? 0)}
          trend={s?.mom}
          sub={t("prevMonthCompare")}
          icon={Wallet}
          color="indigo"
        />
        <StatCard
          label={t("avgDailyExpense")}
          value={formatKRWFull(s?.avg_daily ?? 0)}
          icon={CalendarDays}
          color="violet"
        />
        <StatCard
          label={t("txCount")}
          value={`${s?.tx_count ?? 0}`}
          sub={s?.top_category ? t("topCategory", { category: s.top_category }) : undefined}
          icon={BarChart3}
          color="emerald"
        />
      </div>

      {/* ── Monthly Trend ──────────────────────────────────────────────────── */}
      <Panel title={t("monthlyTrend")} icon={TrendingUp} iconClass="text-indigo-500">
        {trend.length === 0 ? (
          <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
            {t("noData")}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={trend} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `${formatKRW(v)}`} tick={{ fontSize: 11 }} width={56} />
              <Tooltip content={<CurrencyTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="income" name={t("incomeLabel")} fill="#3b6de0" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name={t("expenseLabel")} fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>

      {/* ── Category Breakdown + Insights ──────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t("categoryBreakdown")} icon={BarChart3} iconClass="text-violet-500">
          {cats.length === 0 ? (
            <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
              {t("noData")}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={cats}
                    dataKey="amount"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                  >
                    {cats.map((_, i) => (
                      <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatKRWFull(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {cats.slice(0, 6).map((cat, i) => (
                  <div key={cat.category} className="flex items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }}
                    />
                    <span className="flex-1 text-sm truncate">{cat.category}</span>
                    <span className="text-xs text-muted-foreground">{cat.percent.toFixed(1)}%</span>
                    <span className="text-sm font-medium w-20 text-right">
                      {formatKRWFull(cat.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>

        <Panel title={t("aiInsights")} icon={Lightbulb} iconClass="text-amber-500">
          <ul className="space-y-3">
            {insights.map((insight, i) => (
              <li
                key={i}
                className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-3"
              >
                <Brain className="size-4 mt-0.5 shrink-0 text-violet-500" />
                <span className="text-sm leading-relaxed">{insight}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* ── Weekday + Heatmap ──────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t("weekdayPattern")} icon={CalendarDays} iconClass="text-emerald-500">
          {weekdays.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              {t("noData")}
            </div>
          ) : (
            <div className="space-y-3">
              {weekdayData.map((w) => {
                const pct = Math.round((w.total / maxWeekday) * 100)
                const isMax = w.total === maxWeekday
                return (
                  <div key={w.label} className="flex items-center gap-3">
                    <span className="w-5 text-center text-sm font-medium">{w.label}</span>
                    <div className="flex-1 h-6 bg-muted/40 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isMax ? "bg-indigo-500" : "bg-indigo-300 dark:bg-indigo-700"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex gap-3 text-xs text-right">
                      <span className="w-16 font-medium">{formatKRWFull(w.total)}</span>
                      <span className="w-12 text-muted-foreground">{w.count}</span>
                    </div>
                    {isMax && (
                      <Badge variant="secondary" className="text-xs px-1.5 py-0">{t("most")}</Badge>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Panel>

        <Panel title={t("heatmap90")} icon={CalendarDays} iconClass="text-indigo-500">
          {heatmap.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              {t("noData")}
            </div>
          ) : (
            <SpendingHeatmap data={heatmap} lessLabel={t("less")} moreLabel={t("more")} />
          )}
        </Panel>
      </div>

      {/* ── MoM Detail ─────────────────────────────────────────────────────── */}
      {s && s.last_month_expense > 0 && (
        <Panel
          title={t("momChange")}
          icon={s.mom > 0 ? TrendingUp : TrendingDown}
          iconClass={s.mom > 0 ? "text-rose-500" : "text-emerald-500"}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="text-center rounded-lg border border-border/60 bg-muted/20 p-4">
              <p className="text-xs text-muted-foreground mb-1">{t("lastMonth")}</p>
              <p className="text-xl font-bold">{formatKRWFull(s.last_month_expense)}</p>
            </div>
            <div className="text-center rounded-lg border border-border/60 bg-muted/20 p-4">
              <p className="text-xs text-muted-foreground mb-1">{t("thisMonth")}</p>
              <p className="text-xl font-bold">{formatKRWFull(s.this_month_expense)}</p>
            </div>
            <div className={`text-center rounded-lg border p-4 ${
              s.mom > 0
                ? "border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950"
                : "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950"
            }`}>
              <p className="text-xs text-muted-foreground mb-1">{t("changeRate")}</p>
              <p className={`text-xl font-bold flex items-center justify-center gap-1 ${
                s.mom > 0 ? "text-rose-600" : "text-emerald-600"
              }`}>
                {s.mom > 0
                  ? <ArrowUpRight className="size-5" />
                  : <ArrowDownRight className="size-5" />}
                {Math.abs(s.mom).toFixed(1)}%
              </p>
            </div>
          </div>
        </Panel>
      )}
    </div>
  )
}
