"use client"

import { useEffect, useState, useCallback, useMemo, memo } from "react"
import { useTranslations } from "next-intl"
// NOTE: Recharts is client-only. This page is already "use client", so static
// import is fine. If bundle size becomes an issue, consider extracting chart
// panels into a separate component and using next/dynamic with { ssr: false }.
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
  Loader2,
  BarChart3,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function fmtCost(n: number): string {
  if (n < 0.001) return `$${n.toFixed(6)}`
  if (n < 0.01)  return `$${n.toFixed(4)}`
  return `$${n.toFixed(4)}`
}

function fmtDate(iso: string): string {
  return iso.replace("T", " ").slice(0, 16)
}

function providerColor(p: string): string {
  return PROVIDER_COLORS[p.toLowerCase()] ?? PROVIDER_COLORS.unknown
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  sub,
  value,
  icon: Icon,
  iconBg,
}: {
  label: string
  sub: string
  value: string
  icon: React.ElementType
  iconBg: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{sub}</p>
          <p className="mt-0.5 text-2xl font-bold tracking-tight">{value}</p>
        </div>
        <div className={`rounded-lg p-2 ${iconBg}`}>
          <Icon className="size-4" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
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
      {/* Summary row */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-xs text-muted-foreground w-32 shrink-0 truncate">
          {fmtDate(row.created_at)}
        </span>
        <Badge
          variant="outline"
          className={`text-xs shrink-0 ${
            row.status === "success"
              ? "border-emerald-500/40 text-emerald-600"
              : "border-rose-500/40 text-rose-600"
          }`}
        >
          {row.status}
        </Badge>
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
        {open ? (
          <ChevronUp className="size-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
        )}
      </button>

      {/* Detail panel */}
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

  const [days, setDays] = useState("30")
  const [data, setData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/usage?days=${days}&limit=100`)
      const json = await res.json()
      setData(json)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => { fetchData() }, [fetchData])

  const s = data?.summary
  const daily = data?.daily ?? []
  const models = data?.model_breakdown ?? []
  const logs = data?.logs ?? []

  const totalTokens = (s?.total_input_tokens ?? 0) + (s?.total_output_tokens ?? 0)
  const successRate = s && s.total_requests > 0
    ? Math.round((s.success_requests / s.total_requests) * 100)
    : 0

  const pieData = [
    { name: t("successLabel"), value: s?.success_requests ?? 0 },
    { name: t("errorLabel"),   value: (s?.total_requests ?? 0) - (s?.success_requests ?? 0) },
  ]

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

      {/* Tabs */}
      <Tabs defaultValue="analytics">
        <TabsList className="mb-4">
          <TabsTrigger value="analytics">{t("tabAnalytics")}</TabsTrigger>
          <TabsTrigger value="logs">{t("tabLogs")}</TabsTrigger>
        </TabsList>

        {/* ── Analytics Tab ── */}
        <TabsContent value="analytics">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
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
                />
                <KpiCard
                  label={t("totalCostSub")}
                  sub={t("totalCost")}
                  value={fmtCost(s?.total_cost_usd ?? 0)}
                  icon={CircleDollarSign}
                  iconBg="bg-violet-500/10 text-violet-500"
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
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtTokens} width={40} />
                        <Tooltip
                          contentStyle={{ fontSize: 12 }}
                          formatter={(v: number) => [fmtTokens(v)]}
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
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={30} />
                        <Tooltip contentStyle={{ fontSize: 12 }} />
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
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v.toFixed(3)}`} width={52} />
                        <Tooltip
                          contentStyle={{ fontSize: 12 }}
                          formatter={(v: number) => [`$${v.toFixed(6)}`, t("cost")]}
                        />
                        <Area type="monotone" dataKey="cost_usd" stroke="#3b6de0" strokeWidth={2} fill="url(#costGrad)" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </Panel>

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
                        return models.slice(0, 6).map((m) => {
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
                    </div>
                  )}
                </Panel>

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
                          <Tooltip contentStyle={{ fontSize: 12 }} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex gap-4 text-xs">
                        {pieData.map((entry, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <span className="size-2.5 rounded-full" style={{ background: PIE_COLORS[i] }} />
                            <span>{entry.name}: <span className="font-semibold">{entry.value}</span></span>
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
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
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

              {logs.length === 0 ? (
                <p className="text-xs text-muted-foreground py-12 text-center">{t("noLogs")}</p>
              ) : (
                // TODO: 로그 수가 500건 이상일 경우 react-window 가상화 적용 필요
                logs.map((row) => <LogEntry key={row.id} row={row} t={t} />)
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
