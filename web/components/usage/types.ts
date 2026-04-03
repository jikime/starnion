export interface Summary {
  total_requests: number
  success_requests: number
  total_input_tokens: number
  total_output_tokens: number
  total_cached_tokens: number
  total_cost_usd: number
}

export interface DailyRow {
  date: string
  requests: number
  input_tokens: number
  output_tokens: number
  cached_tokens: number
  cost_usd: number
  success_count: number
  error_count: number
}

export interface ModelRow {
  model: string
  provider: string
  count: number
  cost_usd: number
  tokens: number
}

export interface LogRow {
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

export interface UsageData {
  summary: Summary
  daily: DailyRow[]
  model_breakdown: ModelRow[]
  logs: LogRow[]
  total: number
  page: number
  limit: number
}

export const PROVIDER_COLORS: Record<string, string> = {
  gemini: "#4285F4", anthropic: "#D97706", openai: "#10A37F",
  ollama: "#2ECC71", custom: "#9B59B6", zai: "#E74C3C", unknown: "#3b6de0",
}
export const PIE_COLORS = ["#10b981", "#ef4444"]
export const LOG_LIMIT = 50

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function fmtCost(n: number): string {
  if (n === 0) return "$0.00"
  if (n >= 100) return `$${n.toFixed(2)}`
  if (n >= 1) return `$${n.toFixed(3)}`
  if (n >= 0.01) return `$${n.toFixed(4)}`
  if (n >= 0.001) return `$${n.toFixed(5)}`
  return `$${n.toFixed(6)}`
}

export function fmtDate(iso: string): string { return iso.replace("T", " ").slice(0, 16) }
export function providerColor(p: string): string { return PROVIDER_COLORS[p.toLowerCase()] ?? PROVIDER_COLORS.unknown }
export function fmtAxisDate(d: string): string { const p = d.split("-"); return p.length < 3 ? d : `${parseInt(p[1])}/${parseInt(p[2])}` }

export function calcTrend(daily: DailyRow[], field: keyof DailyRow): number | null {
  if (daily.length < 4) return null
  const mid = Math.floor(daily.length / 2)
  const first = daily.slice(0, mid).reduce((s, d) => s + (d[field] as number), 0)
  const second = daily.slice(mid).reduce((s, d) => s + (d[field] as number), 0)
  if (first === 0) return second > 0 ? 100 : null
  return Math.round(((second - first) / first) * 100)
}
