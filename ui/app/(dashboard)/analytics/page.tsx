"use client"

import { useEffect, useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts"
import {
  MessageSquare,
  MessagesSquare,
  Bot,
  Send,
  Users,
  Radio,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Loader2,
  BarChart3,
  Clock,
  TrendingUp,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Summary {
  total_messages: number
  this_month: number
  user_messages: number
  ai_messages: number
  total_conversations: number
  active_conversations: number
  telegram_messages: number
  webchat_messages: number
  avg_per_day: number
  mom: number
}

interface DailyRow { date: string; count: number }
interface HourlyRow { hour: number; count: number }
interface PlatformRow { platform: string; messages: number; conversations: number }
interface WeeklyRow { week: string; count: number }

interface AnalyticsData {
  summary: Summary
  daily_trend: DailyRow[]
  hourly_dist: HourlyRow[]
  platforms: PlatformRow[]
  weekly_trend: WeeklyRow[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pct(a: number, b: number) {
  if (b === 0) return 0
  return Math.round((a / b) * 100)
}

const PLATFORM_COLOR: Record<string, string> = {
  telegram: "#2AABEE",
  web: "#3b6de0",
  webchat: "#3b6de0",
}

// ─── Mini Sparkline ───────────────────────────────────────────────────────────

function Sparkline({ data, color = "#10b981" }: { data: number[]; color?: string }) {
  const points = data.map((v, i) => ({ i, v }))
  return (
    <ResponsiveContainer width="100%" height={48}>
      <AreaChart data={points} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`sg-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.25} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#sg-${color.replace("#", "")})`}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ─── Metric Card ─────────────────────────────────────────────────────────────

function MetricCard({
  label,
  sub,
  value,
  trend,
  sparkData,
  sparkColor,
  icon: Icon,
  iconBg,
}: {
  label: string
  sub: string
  value: string | number
  trend?: number
  sparkData?: number[]
  sparkColor?: string
  icon: React.ElementType
  iconBg: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{sub}</p>
          <p className="mt-0.5 text-xl font-bold tracking-tight">{value}</p>
        </div>
        <div className={`rounded-lg p-2 ${iconBg}`}>
          <Icon className="size-4" />
        </div>
      </div>
      {sparkData && <Sparkline data={sparkData} color={sparkColor} />}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        {trend !== undefined && (
          <span className={`flex items-center gap-0.5 font-medium ${
            trend > 0 ? "text-emerald-500" : trend < 0 ? "text-rose-500" : "text-muted-foreground"
          }`}>
            {trend > 0 ? <ArrowUpRight className="size-3" /> :
             trend < 0 ? <ArrowDownRight className="size-3" /> :
             <Minus className="size-3" />}
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Panel wrapper ────────────────────────────────────────────────────────────

function Panel({
  title,
  sub,
  icon: Icon,
  iconBg,
  children,
  action,
}: {
  title: string
  sub?: string
  icon: React.ElementType
  iconBg: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card flex flex-col">
      <div className="flex items-start justify-between px-5 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className={`rounded-lg p-2 ${iconBg}`}>
            <Icon className="size-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">{title}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
        </div>
        {action}
      </div>
      <div className="px-5 pb-5 flex-1">{children}</div>
    </div>
  )
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function CountTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { value: number }[]
  label?: string
}) {
  const t = useTranslations("analytics")
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs">
      <p className="font-medium">{label}</p>
      <p className="text-muted-foreground">{t("msgCount", { n: payload[0].value })}</p>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const t = useTranslations("analytics")

  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/analytics")
      const json = await res.json()
      setData(json)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const s = data?.summary
  const daily = data?.daily_trend ?? []
  const hourly = data?.hourly_dist ?? []
  const platforms = data?.platforms ?? []
  const weekly = data?.weekly_trend ?? []

  // Sparkline data from last 7 days of daily trend
  const spark7 = daily.slice(-7).map((d) => d.count)

  // Peak hour
  const peakHour = hourly.reduce((a, b) => (b.count > a.count ? b : a), { hour: 0, count: 0 })

  // Total platforms messages for %
  const totalPlatMsg = platforms.reduce((a, p) => a + p.messages, 0)

  // Weekly max for bar highlight
  const weeklyMax = Math.max(...weekly.map((w) => w.count), 1)

  // Hourly chart — show every 2h label
  const hourlyChart = hourly.map((h) => ({
    label: h.hour % 2 === 0 ? `${String(h.hour).padStart(2, "0")}시` : "",
    count: h.count,
    hour: h.hour,
  }))

  return (
    <div className="p-6 space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <BarChart3 className="size-6 text-indigo-500" />
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* ── Top Metric Cards ──────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label={t("totalMessagesSub")}
          sub={t("totalMessages")}
          value={s?.total_messages.toLocaleString() ?? 0}
          sparkData={spark7}
          sparkColor="#3b6de0"
          icon={MessageSquare}
          iconBg="bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400"
        />
        <MetricCard
          label={t("thisMonthSub")}
          sub={t("thisMonthMessages")}
          value={s?.this_month.toLocaleString() ?? 0}
          trend={s?.mom}
          sparkData={spark7}
          sparkColor="#8b5cf6"
          icon={TrendingUp}
          iconBg="bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-400"
        />
        <MetricCard
          label={t("userMessagesSub")}
          sub={t("userMessages")}
          value={s?.user_messages.toLocaleString() ?? 0}
          sparkData={spark7}
          sparkColor="#10b981"
          icon={Send}
          iconBg="bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
        />
        <MetricCard
          label={t("aiMessagesSub")}
          sub={t("aiMessages")}
          value={s?.ai_messages.toLocaleString() ?? 0}
          sparkData={spark7}
          sparkColor="#f59e0b"
          icon={Bot}
          iconBg="bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
        />
        <MetricCard
          label={t("conversationsSub")}
          sub={t("conversations")}
          value={s?.total_conversations.toLocaleString() ?? 0}
          sparkData={spark7}
          sparkColor="#3b82f6"
          icon={MessagesSquare}
          iconBg="bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
        />
        <MetricCard
          label={t("telegramSub", { n: s?.avg_per_day ?? 0 })}
          sub={t("telegram")}
          value={s?.telegram_messages.toLocaleString() ?? 0}
          sparkData={spark7}
          sparkColor="#2AABEE"
          icon={Radio}
          iconBg="bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-400"
        />
      </div>

      {/* ── Bottom 3 Panels ──────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">

        {/* Left: Weekly trend bar chart */}
        <Panel
          title={t("weeklyTrend")}
          sub={t("weeklyTrendSub")}
          icon={BarChart3}
          iconBg="bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400"
        >
          {weekly.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              {t("noData")}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-3xl font-bold">{(s?.total_messages ?? 0).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("totalMessagesLabel")}</p>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={weekly} barCategoryGap="25%">
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                  <YAxis hide />
                  <Tooltip content={<CountTooltip />} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {weekly.map((w, i) => (
                      <Cell
                        key={i}
                        fill={w.count === weeklyMax ? "#3b6de0" : "#aac4f0"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        {/* Center: Platform breakdown */}
        <Panel
          title={t("channelAnalysis")}
          sub={t("channelAnalysisSub")}
          icon={Users}
          iconBg="bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
        >
          {platforms.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              {t("noData")}
            </div>
          ) : (
            <div className="space-y-5">
              {platforms.map((p) => {
                const ratio = pct(p.messages, totalPlatMsg)
                const color = PLATFORM_COLOR[p.platform] ?? "#3b6de0"
                const label = p.platform === "telegram" ? t("telegram") : t("webchat")
                return (
                  <div key={p.platform} className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div
                        className="rounded-lg p-2"
                        style={{ backgroundColor: `${color}20`, color }}
                      >
                        {p.platform === "telegram"
                          ? <Radio className="size-4" />
                          : <MessageSquare className="size-4" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">{t("convCount", { n: p.conversations })}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">{t("msgCount", { n: p.messages.toLocaleString() })}</p>
                        <p className="text-xs font-medium" style={{ color }}>
                          {ratio}%
                        </p>
                      </div>
                    </div>
                    <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${ratio}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                )
              })}

              {/* User vs AI ratio */}
              <div className="pt-3 border-t border-border/60 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">{t("userVsAi")}</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-muted/40 rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-indigo-500 rounded-l-full"
                      style={{ width: `${pct(s?.user_messages ?? 0, s?.total_messages ?? 1)}%` }}
                    />
                    <div
                      className="h-full bg-amber-400"
                      style={{ width: `${pct(s?.ai_messages ?? 0, s?.total_messages ?? 1)}%` }}
                    />
                  </div>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="size-2 rounded-full bg-indigo-500 inline-block" />
                    {t("userLabel")} {pct(s?.user_messages ?? 0, s?.total_messages ?? 1)}%
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="size-2 rounded-full bg-amber-400 inline-block" />
                    {t("aiLabel")} {pct(s?.ai_messages ?? 0, s?.total_messages ?? 1)}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </Panel>

        {/* Right: Hourly distribution */}
        <Panel
          title={t("hourlyActivity")}
          sub={t("hourlyActivitySub")}
          icon={Clock}
          iconBg="bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-400"
        >
          <div className="space-y-3">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t("peakHour")}</p>
                <p className="text-2xl font-bold">
                  {String(peakHour.hour).padStart(2, "0")}:00
                </p>
              </div>
              <span className="text-xs text-emerald-500 font-medium flex items-center gap-0.5">
                <ArrowUpRight className="size-3.5" />
                {t("msgCount", { n: peakHour.count })}
              </span>
            </div>

            {/* Platform quick stats */}
            <div className="space-y-1.5">
              {[
                { label: t("webchat"), value: s?.webchat_messages ?? 0, color: "#3b6de0" },
                { label: t("telegram"), value: s?.telegram_messages ?? 0, color: "#2AABEE" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
                    {item.label}
                  </span>
                  <span className="font-medium">{t("msgCount", { n: item.value.toLocaleString() })}</span>
                </div>
              ))}
            </div>

            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={hourlyChart} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="hourGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b6de0" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#3b6de0" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={0} />
                <YAxis hide />
                <Tooltip content={<CountTooltip />} />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#3b6de0"
                  strokeWidth={2}
                  fill="url(#hourGrad)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* ── Daily Trend (full width) ──────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-lg p-2 bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-400">
            <TrendingUp className="size-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">{t("dailyTrend")}</p>
            <p className="text-xs text-muted-foreground">{t("dailyTrendSub")}</p>
          </div>
        </div>
        {daily.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            {t("noData")}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={daily} barCategoryGap="15%">
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => v.slice(5)} // MM-DD
                interval={4}
              />
              <YAxis tick={{ fontSize: 10 }} width={28} />
              <Tooltip content={<CountTooltip />} />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {daily.map((d, i) => {
                  const max = Math.max(...daily.map((x) => x.count), 1)
                  return <Cell key={i} fill={d.count === max ? "#3b6de0" : "#c7d2fe"} />
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
