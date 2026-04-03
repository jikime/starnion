"use client"

import { useEffect, useState, useCallback, memo, useMemo } from "react"
import { useTranslations } from "next-intl"
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
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
  Activity,
  Zap,
  CircleDollarSign,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  BarChart3,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Search,
  X,
} from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Summary {
  total_requests: number
  success_requests: number
  total_input_tokens: number
  total_output_tokens: number
  total_cached_tokens: number
  total_cost_usd: number
}

interface DailyRow {
  date: string
  requests: number
  input_tokens: number
  output_tokens: number
  cached_tokens: number
  cost_usd: number
  success_count: number
  error_count: number
}

interface ModelRow {
  model: string
  provider: string
  count: number
  cost_usd: number
  tokens: number
}

interface LogRow {
  id: number
  model: string
  provider: string
  input_tokens: number
  output_tokens: number
  cached_tokens: number
  cost_usd: number
  status: string
  call_type: string
  created_at: string
}

interface UsageData {
  summary: Summary
  daily: DailyRow[]
  model_breakdown: ModelRow[]
  logs: LogRow[]
  total: number
  page: number
  limit: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PROVIDER_COLORS: Record<string, string> = {
  gemini:    "#4285F4",
  anthropic: "#D97706",
  openai:    "#10A37F",
  ollama:    "#2ECC71",
  custom:    "#9B59B6",
  zai:       "#E74C3C",
  unknown:   "#3b6de0",
}

const PIE_COLORS = ["#10b981", "#ef4444"]
const LOG_LIMIT = 50

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

// #8 소수점 과다 표시 수정
function fmtCost(n: number): string {
  if (n === 0)    return "$0.00"
  if (n >= 100)   return `$${n.toFixed(2)}`
  if (n >= 1)     return `$${n.toFixed(3)}`
  if (n >= 0.01)  return `$${n.toFixed(4)}`
  if (n >= 0.001) return `$${n.toFixed(5)}`
  return `$${n.toFixed(6)}`
}

function fmtDate(iso: string): string {
  return iso.replace("T", " ").slice(0, 16)
}

function providerColor(p: string): string {
  return PROVIDER_COLORS[p.toLowerCase()] ?? PROVIDER_COLORS.unknown
}

// #9 X축 날짜 한국어화
function fmtAxisDate(d: string): string {
  const parts = d.split("-")
  if (parts.length < 3) return d
  return `${parseInt(parts[1])}/${parseInt(parts[2])}`
}

// #5 전기간 대비 변화율 계산
function calcTrend(daily: DailyRow[], field: keyof DailyRow): number | null {
  if (daily.length < 4) return null
  const mid = Math.floor(daily.length / 2)
  const first  = daily.slice(0, mid).reduce((s, d) => s + (d[field] as number), 0)
  const second = daily.slice(mid).reduce((s, d) => s + (d[field] as number), 0)
  if (first === 0) return second > 0 ? 100 : null
  return Math.round(((second - first) / first) * 100)
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  sub,
  value,
  icon: Icon,
  iconBg,
  trend,
}: {
  label: string
  sub: string
  value: string
  icon: React.ElementType
  iconBg: string
  trend?: number | null
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">{sub}</p>
          <p className="mt-0.5 text-2xl font-bold tracking-tight">{value}</p>
        </div>
        <div className={`rounded-lg p-2 ${iconBg} shrink-0`}>
          <Icon className="size-4" />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        {/* #5 변화율 표시 */}
        {trend !== null && trend !== undefined && (
          <span className={cn(
            "inline-flex items-center gap-0.5 text-xs font-medium",
            trend > 0 ? "text-emerald-500" : trend < 0 ? "text-red-500" : "text-muted-foreground"
          )}>
            {trend > 0
              ? <TrendingUp className="size-3" />
              : trend < 0
                ? <TrendingDown className="size-3" />
                : null}
            {trend > 0 ? "+" : ""}{trend}%
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

function Panel({
  title,
  sub,
  icon: Icon,
  iconBg,
  children,
}: {
  title: string
  sub?: string
  icon: React.ElementType
  iconBg: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card flex flex-col">
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <div className={`rounded-lg p-2 ${iconBg}`}>
          <Icon className="size-4" />
        </div>
        <div>
          <p className="text-sm font-semibold">{title}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </div>
      <div className="px-5 pb-5 flex-1">{children}</div>
    </div>
  )
}

// ─── Log Row (expandable) ─────────────────────────────────────────────────────

const LogEntry = memo(function LogEntry({ row, t }: { row: LogRow; t: ReturnType<typeof useTranslations> }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-b border-border last:border-0">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-xs text-muted-foreground w-32 shrink-0 truncate">
          {fmtDate(row.created_at)}
        </span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border shrink-0 ${
          row.status === "success"
            ? "border-emerald-500/40 text-emerald-600"
            : "border-rose-500/40 text-rose-600"
        }`}>
          {row.status}
        </span>
        <span
          className="text-xs font-medium truncate flex-1"
          style={{ color: providerColor(row.provider) }}
        >
          {row.model}
        </span>
        <span className="text-xs text-muted-foreground shrink-0">
          {fmtTokens(row.input_tokens + row.output_tokens)} tok
        </span>
        <span className="text-xs font-medium tabular-nums shrink-0 w-20 text-right">
          {fmtCost(row.cost_usd)}
        </span>
        {open
          ? <ChevronUp className="size-3.5 text-muted-foreground shrink-0" />
          : <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="bg-muted/30 px-4 pb-4 pt-2 grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3 text-xs">
          <div>
            <p className="text-muted-foreground">{t("model")}</p>
            <p className="font-medium">{row.model}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("provider")}</p>
            <p className="font-medium capitalize">{row.provider}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("callType")}</p>
            <p className="font-medium">{row.call_type}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("inputTokens")}</p>
            <p className="font-medium tabular-nums">{row.input_tokens.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("outputTokens")}</p>
            <p className="font-medium tabular-nums">{row.output_tokens.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("cachedTokens")}</p>
            <p className="font-medium tabular-nums">{row.cached_tokens.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("costUsd")}</p>
            <p className="font-medium tabular-nums">{fmtCost(row.cost_usd)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("status")}</p>
            <p className="font-medium">{row.status}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("time")}</p>
            <p className="font-medium">{fmtDate(row.created_at)}</p>
          </div>
        </div>
      )}
    </div>
  )
})

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function UsagePage() {
  const t = useTranslations("usage")

  // Analytics state
  const [days, setDays]           = useState("30")
  const [data, setData]           = useState<UsageData | null>(null)
  const [loading, setLoading]     = useState(true)
  // #1 에러 상태
  const [error, setError]         = useState<string | null>(null)

  // #10 로그 탭 별도 기간 + 페이지
  const [logDays, setLogDays]     = useState("30")
  const [logPage, setLogPage]     = useState(1)
  const [logsData, setLogsData]   = useState<{ logs: LogRow[]; total: number } | null>(null)
  const [logsLoading, setLogsLoading] = useState(true)
  const [logsError, setLogsError] = useState<string | null>(null)

  // #2 로그 필터
  const [logSearch, setLogSearch]   = useState("")
  const [logStatus, setLogStatus]   = useState("all")

  // #6 모델 분석 더보기
  const [showAllModels, setShowAllModels] = useState(false)

  // ── Analytics fetch ──────────────────────────────────────────────────────
  const fetchAnalytics = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/usage?days=${days}&limit=1`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: UsageData = await res.json()
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("loadError"))
    } finally {
      setLoading(false)
    }
  }, [days])

  // ── Logs fetch ───────────────────────────────────────────────────────────
  const fetchLogs = useCallback(async () => {
    setLogsLoading(true)
    setLogsError(null)
    try {
      const res = await fetch(
        `/api/usage?days=${logDays}&limit=${LOG_LIMIT}&page=${logPage}`
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: UsageData = await res.json()
      setLogsData({ logs: json.logs ?? [], total: json.total ?? 0 })
    } catch (e) {
      setLogsError(e instanceof Error ? e.message : t("logsLoadError"))
    } finally {
      setLogsLoading(false)
    }
  }, [logDays, logPage])

  useEffect(() => { fetchAnalytics() }, [fetchAnalytics])
  useEffect(() => { fetchLogs() }, [fetchLogs])

  // Reset page when logDays changes
  useEffect(() => { setLogPage(1) }, [logDays])

  const s      = data?.summary
  const daily  = data?.daily ?? []
  const models = data?.model_breakdown ?? []

  const totalTokens = (s?.total_input_tokens ?? 0) + (s?.total_output_tokens ?? 0)
  const successRate = s && s.total_requests > 0
    ? Math.round((s.success_requests / s.total_requests) * 100)
    : 0

  // #5 KPI 변화율
  const trendRequests = useMemo(() => calcTrend(daily, "requests"), [daily])
  const trendTokens   = useMemo(() => {
    if (daily.length < 4) return null
    const mid    = Math.floor(daily.length / 2)
    const first  = daily.slice(0, mid).reduce((s, d) => s + d.input_tokens + d.output_tokens, 0)
    const second = daily.slice(mid).reduce((s, d)  => s + d.input_tokens + d.output_tokens, 0)
    if (first === 0) return second > 0 ? 100 : null
    return Math.round(((second - first) / first) * 100)
  }, [daily])
  const trendCost = useMemo(() => calcTrend(daily, "cost_usd"), [daily])

  const pieData = [
    { name: t("successLabel"), value: s?.success_requests ?? 0 },
    { name: t("errorLabel"),   value: (s?.total_requests ?? 0) - (s?.success_requests ?? 0) },
  ]
  // #7 파이 총합 (비율 계산용)
  const pieTotal = pieData.reduce((sum, d) => sum + d.value, 0)

  // #6 모델 분석 표시 목록
  const displayModels = showAllModels ? models : models.slice(0, 6)

  // #2 로그 클라이언트 필터링
  const allLogs = logsData?.logs ?? []
  const filteredLogs = useMemo(() => {
    let list = allLogs
    if (logStatus !== "all") list = list.filter((r) => r.status === logStatus)
    if (logSearch.trim()) {
      const q = logSearch.trim().toLowerCase()
      list = list.filter(
        (r) => r.model.toLowerCase().includes(q) || r.provider.toLowerCase().includes(q)
      )
    }
    return list
  }, [allLogs, logStatus, logSearch])

  const logTotal   = logsData?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(logTotal / LOG_LIMIT))

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-violet-500/10 p-2">
            <BarChart3 className="size-5 text-violet-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* #3 새로고침 버튼 */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => { fetchAnalytics(); fetchLogs() }}
            disabled={loading || logsLoading}
          >
            <RefreshCw className={cn("size-3.5", (loading || logsLoading) && "animate-spin")} />
          </Button>

          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">{t("days7")}</SelectItem>
              <SelectItem value="14">{t("days14")}</SelectItem>
              <SelectItem value="30">{t("days30")}</SelectItem>
              <SelectItem value="90">{t("days90")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="analytics">
        <TabsList className="mb-4">
          <TabsTrigger value="analytics">{t("tabAnalytics")}</TabsTrigger>
          <TabsTrigger value="logs">{t("tabLogs")}</TabsTrigger>
        </TabsList>

        {/* ── Analytics Tab ── */}
        <TabsContent value="analytics">
          {/* #1 에러 상태 */}
          {error ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-destructive/30 bg-destructive/5 py-16">
              <div className="rounded-full border border-destructive/20 bg-destructive/10 p-4">
                <AlertCircle className="size-6 text-destructive" />
              </div>
              <div className="text-center">
                <p className="font-medium text-destructive">{error}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("connectionCheck")}</p>
              </div>
              <Button variant="outline" size="sm" onClick={fetchAnalytics}>
                <RefreshCw className="size-3.5 mr-2" />
                {t("retryAction")}
              </Button>
            </div>
          ) : loading ? (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-xl border bg-card p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="size-7 rounded-lg" />
                    </div>
                    <Skeleton className="h-7 w-28" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                ))}
              </div>
              <div className="rounded-xl border bg-card p-4 space-y-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-48 w-full rounded-lg" />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {/* KPI row */}
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <KpiCard
                  label={t("totalRequestsSub")}
                  sub={t("totalRequests")}
                  value={(s?.total_requests ?? 0).toLocaleString()}
                  icon={Activity}
                  iconBg="bg-blue-500/10 text-blue-500"
                  trend={trendRequests}
                />
                <KpiCard
                  label={t("successRateSub")}
                  sub={t("successRate")}
                  value={`${successRate}%`}
                  icon={CheckCircle2}
                  iconBg="bg-emerald-500/10 text-emerald-500"
                />
                <KpiCard
                  label={t("totalTokensSub")}
                  sub={t("totalTokens")}
                  value={fmtTokens(totalTokens)}
                  icon={Zap}
                  iconBg="bg-amber-500/10 text-amber-500"
                  trend={trendTokens}
                />
                <KpiCard
                  label={t("totalCostSub")}
                  sub={t("totalCost")}
                  value={fmtCost(s?.total_cost_usd ?? 0)}
                  icon={CircleDollarSign}
                  iconBg="bg-violet-500/10 text-violet-500"
                  trend={trendCost}
                />
              </div>

              {/* Daily tokens + daily requests */}
              <div className="grid gap-4 lg:grid-cols-2">
                <Panel
                  title={t("dailyTokens")}
                  icon={Zap}
                  iconBg="bg-amber-500/10 text-amber-500"
                >
                  {daily.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-8 text-center">{t("noData")}</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={daily} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        {/* #9 X축 날짜 한국어화 */}
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={fmtAxisDate} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtTokens} width={40} />
                        <Tooltip
                          contentStyle={{ fontSize: 12 }}
                          formatter={(v: number) => [fmtTokens(v)]}
                          labelFormatter={(d) => fmtAxisDate(String(d))}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="input_tokens"  name={t("inputTokens")}  stroke="#3b6de0" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="output_tokens" name={t("outputTokens")} stroke="#f59e0b" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="cached_tokens" name={t("cachedTokens")} stroke="#10b981" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </Panel>

                <Panel
                  title={t("dailyRequests")}
                  icon={Activity}
                  iconBg="bg-blue-500/10 text-blue-500"
                >
                  {daily.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-8 text-center">{t("noData")}</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={daily} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        {/* #9 */}
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={fmtAxisDate} />
                        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={30} />
                        <Tooltip
                          contentStyle={{ fontSize: 12 }}
                          labelFormatter={(d) => fmtAxisDate(String(d))}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="success_count" name={t("successLabel")} stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="error_count"   name={t("errorLabel")}   stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </Panel>
              </div>

              {/* Daily cost + model breakdown + pie */}
              <div className="grid gap-4 lg:grid-cols-3">
                <Panel
                  title={t("dailyCost")}
                  icon={CircleDollarSign}
                  iconBg="bg-violet-500/10 text-violet-500"
                >
                  {daily.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-8 text-center">{t("noData")}</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={daily} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#3b6de0" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#3b6de0" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        {/* #9 */}
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={fmtAxisDate} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v.toFixed(3)}`} width={52} />
                        <Tooltip
                          contentStyle={{ fontSize: 12 }}
                          formatter={(v: number) => [fmtCost(v), t("cost")]}
                          labelFormatter={(d) => fmtAxisDate(String(d))}
                        />
                        <Area type="monotone" dataKey="cost_usd" stroke="#3b6de0" strokeWidth={2} fill="url(#costGrad)" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </Panel>

                {/* #6 모델 분석 더보기 */}
                <Panel
                  title={t("modelBreakdown")}
                  icon={BarChart3}
                  iconBg="bg-sky-500/10 text-sky-500"
                >
                  {models.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-8 text-center">{t("noData")}</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {(() => {
                        const maxCost = Math.max(...models.map((x) => x.cost_usd), 0.0001)
                        return displayModels.map((m) => {
                          const pct = Math.round((m.cost_usd / maxCost) * 100)
                          return (
                            <div key={`${m.model}-${m.provider}`} className="flex flex-col gap-1">
                              <div className="flex justify-between text-xs">
                                <span className="truncate font-medium text-[11px]" style={{ color: providerColor(m.provider) }}>
                                  {m.model.length > 22 ? m.model.slice(0, 22) + "…" : m.model}
                                </span>
                                <span className="text-muted-foreground tabular-nums shrink-0 ml-2">
                                  {fmtCost(m.cost_usd)}
                                </span>
                              </div>
                              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{ width: `${pct}%`, backgroundColor: providerColor(m.provider) }}
                                />
                              </div>
                              <p className="text-[10px] text-muted-foreground">
                                {m.count} {t("requests")} · {fmtTokens(m.tokens)} {t("tokens")}
                              </p>
                            </div>
                          )
                        })
                      })()}
                      {/* 더보기/접기 버튼 */}
                      {models.length > 6 && (
                        <button
                          onClick={() => setShowAllModels((v) => !v)}
                          className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {showAllModels ? (
                            <><ChevronUp className="size-3" />{t("collapse")}</>
                          ) : (
                            <><ChevronDown className="size-3" />{t("showMore", { count: models.length - 6 })}</>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </Panel>

                {/* #7 파이차트 비율 표시 */}
                <Panel
                  title={t("successVsError")}
                  icon={CheckCircle2}
                  iconBg="bg-emerald-500/10 text-emerald-500"
                >
                  {(s?.total_requests ?? 0) === 0 ? (
                    <p className="text-xs text-muted-foreground py-8 text-center">{t("noData")}</p>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <ResponsiveContainer width="100%" height={160}>
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={72}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {pieData.map((_, i) => (
                              <Cell key={i} fill={PIE_COLORS[i]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ fontSize: 12 }}
                            formatter={(v: number, name: string) => [
                              t("totalCount", { total: v }) + ` (${pieTotal > 0 ? Math.round((v / pieTotal) * 100) : 0}%)`,
                              name
                            ]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex gap-4 text-xs">
                        {pieData.map((entry, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <span className="size-2.5 rounded-full" style={{ background: PIE_COLORS[i] }} />
                            <span>
                              {entry.name}:{" "}
                              <span className="font-semibold">{entry.value}</span>
                              {pieTotal > 0 && (
                                <span className="text-muted-foreground ml-1">
                                  ({Math.round((entry.value / pieTotal) * 100)}%)
                                </span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Panel>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Logs Tab ── */}
        <TabsContent value="logs">
          {/* #10 로그 탭 별도 기간 필터 + #2 검색/상태 필터 */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {/* 기간 */}
            <Select value={logDays} onValueChange={setLogDays}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">{t("days7")}</SelectItem>
                <SelectItem value="14">{t("days14")}</SelectItem>
                <SelectItem value="30">{t("days30")}</SelectItem>
                <SelectItem value="90">{t("days90")}</SelectItem>
              </SelectContent>
            </Select>

            {/* 상태 필터 */}
            <Select value={logStatus} onValueChange={(v) => { setLogStatus(v); setLogPage(1) }}>
              <SelectTrigger className="w-28 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("filterStatusAll")}</SelectItem>
                <SelectItem value="success">{t("filterStatusSuccess")}</SelectItem>
                <SelectItem value="error">{t("filterStatusError")}</SelectItem>
              </SelectContent>
            </Select>

            {/* 모델 검색 */}
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/60" />
              <Input
                placeholder={t("modelSearchPlaceholder")}
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                className="h-8 pl-8 pr-7 text-xs"
              />
              {logSearch && (
                <button
                  onClick={() => setLogSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>

            {/* 총 건수 */}
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {(logSearch || logStatus !== "all") ? (
                t("filteredCount", { count: filteredLogs.length, total: logTotal.toLocaleString() })
              ) : (
                t("totalCount", { total: logTotal.toLocaleString() })
              )}
            </span>
          </div>

          {/* #1 에러 */}
          {logsError ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-destructive/30 bg-destructive/5 py-12">
              <AlertCircle className="size-6 text-destructive" />
              <p className="text-sm text-destructive">{logsError}</p>
              <Button variant="outline" size="sm" onClick={fetchLogs}>
                <RefreshCw className="size-3.5 mr-2" />
                {t("retryAction")}
              </Button>
            </div>
          ) : logsLoading ? (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-2.5 bg-muted/50 border-b border-border">
                <Skeleton className="h-3 w-28" />
              </div>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0">
                  <Skeleton className="h-3 w-28 shrink-0" />
                  <Skeleton className="h-5 w-14 rounded-full shrink-0" />
                  <Skeleton className="h-3 flex-1" />
                  <Skeleton className="h-3 w-16 shrink-0" />
                  <Skeleton className="h-3 w-16 shrink-0" />
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                {/* Table header */}
                <div className="flex items-center gap-3 px-4 py-2.5 bg-muted/50 border-b border-border text-xs text-muted-foreground font-medium">
                  <span className="w-32 shrink-0">{t("time")}</span>
                  <span className="w-16 shrink-0">{t("status")}</span>
                  <span className="flex-1">{t("model")}</span>
                  <span className="shrink-0 w-20">{t("tokens")}</span>
                  <span className="shrink-0 w-20 text-right">{t("cost")}</span>
                  <span className="size-3.5 shrink-0" />
                </div>

                {filteredLogs.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-12">
                    <p className="text-sm text-muted-foreground">
                      {logSearch || logStatus !== "all" ? t("searchMatchEmpty") : t("noLogs")}
                    </p>
                    {(logSearch || logStatus !== "all") && (
                      <button
                        onClick={() => { setLogSearch(""); setLogStatus("all") }}
                        className="text-xs text-muted-foreground/60 hover:text-foreground underline underline-offset-2"
                      >
                        {t("resetFilter")}
                      </button>
                    )}
                  </div>
                ) : (
                  filteredLogs.map((row) => <LogEntry key={row.id} row={row} t={t} />)
                )}
              </div>

              {/* #4 페이지네이션 */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-3">
                  <p className="text-xs text-muted-foreground">
                    {t("pageInfo", { page: logPage, total: totalPages })}
                    <span className="ml-2 text-muted-foreground/60">
                      ({t("pageDetail", { total: logTotal.toLocaleString(), limit: LOG_LIMIT })})
                    </span>
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-3 text-xs"
                      onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                      disabled={logPage <= 1 || logsLoading}
                    >
                      {t("prevPage")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-3 text-xs"
                      onClick={() => setLogPage((p) => Math.min(totalPages, p + 1))}
                      disabled={logPage >= totalPages || logsLoading}
                    >
                      {t("nextPage")}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
