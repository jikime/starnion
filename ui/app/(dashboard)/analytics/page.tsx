"use client"

import { useEffect, useState, useCallback } from "react"
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
  web: "#6366f1",
  webchat: "#6366f1",
}

function platformLabel(p: string) {
  if (p === "telegram") return "텔레그램"
  return "웹챗"
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

// ─── Metric Card (image style top row) ───────────────────────────────────────

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
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs">
      <p className="font-medium">{label}</p>
      <p className="text-muted-foreground">{payload[0].value}건</p>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
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
          통계 / 분석
        </h1>
        <p className="text-sm text-muted-foreground">텔레그램 · 웹챗 대화 데이터 종합 분석</p>
      </div>

      {/* ── Top Metric Cards (6개, image 3 상단 스타일) ──────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label="전체 누적"
          sub="총 메시지"
          value={s?.total_messages.toLocaleString() ?? 0}
          sparkData={spark7}
          sparkColor="#6366f1"
          icon={MessageSquare}
          iconBg="bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400"
        />
        <MetricCard
          label="전월 대비"
          sub="이번달 메시지"
          value={s?.this_month.toLocaleString() ?? 0}
          trend={s?.mom}
          sparkData={spark7}
          sparkColor="#8b5cf6"
          icon={TrendingUp}
          iconBg="bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-400"
        />
        <MetricCard
          label="내가 보낸 메시지"
          sub="사용자 메시지"
          value={s?.user_messages.toLocaleString() ?? 0}
          sparkData={spark7}
          sparkColor="#10b981"
          icon={Send}
          iconBg="bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
        />
        <MetricCard
          label="AI 응답 수"
          sub="AI 메시지"
          value={s?.ai_messages.toLocaleString() ?? 0}
          sparkData={spark7}
          sparkColor="#f59e0b"
          icon={Bot}
          iconBg="bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
        />
        <MetricCard
          label="전체 대화방"
          sub="대화 수"
          value={s?.total_conversations.toLocaleString() ?? 0}
          sparkData={spark7}
          sparkColor="#3b82f6"
          icon={MessagesSquare}
          iconBg="bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
        />
        <MetricCard
          label={`일평균 ${s?.avg_per_day ?? 0}건`}
          sub="텔레그램"
          value={s?.telegram_messages.toLocaleString() ?? 0}
          sparkData={spark7}
          sparkColor="#2AABEE"
          icon={Radio}
          iconBg="bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-400"
        />
      </div>

      {/* ── Bottom 3 Panels (image 3 하단 3열 스타일) ────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">

        {/* Left: Weekly trend bar chart */}
        <Panel
          title="주간 메시지 추이"
          sub="최근 8주"
          icon={BarChart3}
          iconBg="bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400"
        >
          {weekly.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              데이터가 없습니다
            </div>
          ) : (
            <div className="space-y-4">
              {/* Big number */}
              <div>
                <p className="text-3xl font-bold">{(s?.total_messages ?? 0).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-0.5">총 메시지</p>
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
                        fill={w.count === weeklyMax ? "#6366f1" : "#c7d2fe"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        {/* Center: Platform breakdown (Report panel style) */}
        <Panel
          title="채널 분석"
          sub="텔레그램 vs 웹챗"
          icon={Users}
          iconBg="bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
        >
          {platforms.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              데이터가 없습니다
            </div>
          ) : (
            <div className="space-y-5">
              {platforms.map((p) => {
                const ratio = pct(p.messages, totalPlatMsg)
                const color = PLATFORM_COLOR[p.platform] ?? "#6366f1"
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
                        <p className="text-sm font-medium">{platformLabel(p.platform)}</p>
                        <p className="text-xs text-muted-foreground">{p.conversations}개 대화</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">{p.messages.toLocaleString()}건</p>
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
                <p className="text-xs font-medium text-muted-foreground">사용자 vs AI 응답</p>
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
                    사용자 {pct(s?.user_messages ?? 0, s?.total_messages ?? 1)}%
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="size-2 rounded-full bg-amber-400 inline-block" />
                    AI {pct(s?.ai_messages ?? 0, s?.total_messages ?? 1)}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </Panel>

        {/* Right: Hourly distribution (Total sales style) */}
        <Panel
          title="시간대별 활동"
          sub="최근 30일 기준"
          icon={Clock}
          iconBg="bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-400"
        >
          <div className="space-y-3">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-muted-foreground">가장 활발한 시간</p>
                <p className="text-2xl font-bold">
                  {String(peakHour.hour).padStart(2, "0")}:00
                </p>
              </div>
              <span className="text-xs text-emerald-500 font-medium flex items-center gap-0.5">
                <ArrowUpRight className="size-3.5" />
                {peakHour.count}건
              </span>
            </div>

            {/* Platform quick stats */}
            <div className="space-y-1.5">
              {[
                { label: "웹챗", value: s?.webchat_messages ?? 0, color: "#6366f1" },
                { label: "텔레그램", value: s?.telegram_messages ?? 0, color: "#2AABEE" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
                    {item.label}
                  </span>
                  <span className="font-medium">{item.value.toLocaleString()}건</span>
                </div>
              ))}
            </div>

            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={hourlyChart} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="hourGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={0} />
                <YAxis hide />
                <Tooltip content={<CountTooltip />} />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#6366f1"
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
            <p className="text-sm font-semibold">일별 메시지 추이</p>
            <p className="text-xs text-muted-foreground">최근 30일</p>
          </div>
        </div>
        {daily.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            데이터가 없습니다
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
                  return <Cell key={i} fill={d.count === max ? "#6366f1" : "#c7d2fe"} />
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
