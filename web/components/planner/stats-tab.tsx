// cache-bust: v3
"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import {
  BookOpen, BarChart2, Target, Map, Loader2,
  Plus, TrendingUp, TrendingDown, Trash2, Download, ArrowUpRight,
} from "lucide-react"
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from "recharts"

// ── Types ─────────────────────────────────────────────────────────────────────

type TxType = "expense" | "income"

interface Transaction {
  id: string
  type: TxType
  amount: number
  category: string
  tags: string[]
  memo: string
  date: string
  location?: string
}

interface Budget {
  category: string
  limit: number
  used: number
  color: string
}

interface SavingGoal {
  id: string
  title: string
  target: number
  saved: number
  dueDate: string
  color: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = ["식비", "쇼핑", "교통", "문화/여가", "자기계발", "주거", "의료", "기타"]

const CAT_COLOR: Record<string, string> = {
  "식비": "#58A6FF", "쇼핑": "#F0883E", "교통": "#3FB950",
  "문화/여가": "#BC8CFF", "자기계발": "#E3A948", "주거": "#79C0FF",
  "의료": "#F85149", "기타": "#8B949E", "급여": "#3FB950", "부수입": "#58A6FF",
}

const SAMPLE_TXS: Transaction[] = [
  { id: "t1",  type: "expense", amount: 12500,   category: "식비",      tags: ["점심"],          memo: "설렁탕 점심",          date: "2026-04-03", location: "명동" },
  { id: "t2",  type: "expense", amount: 4800,    category: "식비",      tags: ["커피"],          memo: "스타벅스 아메리카노",   date: "2026-04-03", location: "강남" },
  { id: "t3",  type: "income",  amount: 3800000, category: "급여",      tags: ["월급"],          memo: "4월 급여",              date: "2026-04-01" },
  { id: "t4",  type: "expense", amount: 89000,   category: "쇼핑",      tags: ["온라인"],        memo: "쿠팡 생필품",           date: "2026-04-02" },
  { id: "t5",  type: "expense", amount: 1500,    category: "교통",      tags: ["지하철"],        memo: "교통카드",              date: "2026-04-02" },
  { id: "t6",  type: "expense", amount: 32000,   category: "문화/여가", tags: ["영화"],          memo: "CGV 영화 2인",          date: "2026-04-01" },
  { id: "t7",  type: "expense", amount: 45000,   category: "자기계발",  tags: ["강의"],          memo: "인프런 강의 결제",      date: "2026-03-31" },
  { id: "t8",  type: "expense", amount: 68000,   category: "식비",      tags: ["저녁", "외식"],  memo: "가족 저녁",             date: "2026-03-30", location: "홍대" },
  { id: "t9",  type: "expense", amount: 15000,   category: "의료",      tags: ["약국"],          memo: "약국 처방약",           date: "2026-03-29" },
  { id: "t10", type: "income",  amount: 150000,  category: "부수입",    tags: ["프리랜서"],      memo: "번역 작업 수입",        date: "2026-03-28" },
  { id: "t11", type: "expense", amount: 23000,   category: "교통",      tags: ["택시"],          memo: "야근 귀가 택시",        date: "2026-03-28", location: "서울" },
  { id: "t12", type: "expense", amount: 110000,  category: "주거",      tags: ["관리비"],        memo: "4월 관리비",            date: "2026-03-27" },
]

const SAMPLE_BUDGETS: Budget[] = [
  { category: "식비",      limit: 500000, used: 420000, color: "#58A6FF" },
  { category: "쇼핑",      limit: 200000, used: 89000,  color: "#F0883E" },
  { category: "교통",      limit: 80000,  used: 62000,  color: "#3FB950" },
  { category: "문화/여가", limit: 100000, used: 82000,  color: "#BC8CFF" },
  { category: "자기계발",  limit: 150000, used: 45000,  color: "#E3A948" },
  { category: "주거",      limit: 600000, used: 550000, color: "#79C0FF" },
]

const SAMPLE_GOALS: SavingGoal[] = [
  { id: "g1", title: "유럽 여행",     target: 3000000, saved: 1200000, dueDate: "2026-12-31", color: "#58A6FF" },
  { id: "g2", title: "맥북 Pro 구입", target: 2500000, saved: 800000,  dueDate: "2026-09-01", color: "#3FB950" },
  { id: "g3", title: "비상금 펀드",   target: 5000000, saved: 3500000, dueDate: "2027-01-01", color: "#E3A948" },
]

const TREND_DATA = [
  { month: "10월", 지출: 1820000, 수입: 3950000 },
  { month: "11월", 지출: 2100000, 수입: 3950000 },
  { month: "12월", 지출: 2540000, 수입: 4100000 },
  { month: "1월",  지출: 1680000, 수입: 3800000 },
  { month: "2월",  지출: 1950000, 수입: 3800000 },
  { month: "3월",  지출: 2210000, 수입: 3950000 },
  { month: "4월",  지출: 890000,  수입: 3950000 },
]

const HEATMAP_SPOTS = [
  { name: "강남역 인근", count: 24, category: "식비/카페",  amount: 185000, x: 65, y: 62 },
  { name: "홍대 합정",   count: 18, category: "문화/여가",  amount: 132000, x: 30, y: 35 },
  { name: "여의도",      count: 12, category: "점심 식사",  amount: 98000,  x: 28, y: 58 },
  { name: "명동",        count: 9,  category: "쇼핑/식사",  amount: 76000,  x: 48, y: 48 },
  { name: "판교",        count: 7,  category: "자기계발",   amount: 55000,  x: 72, y: 72 },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000)    return `${(n / 10_000).toFixed(1)}만`
  return n.toLocaleString()
}
function fmtFull(n: number) { return n.toLocaleString() + "원" }
function dday(dateStr: string) {
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000)
  return diff > 0 ? `D-${diff}` : diff === 0 ? "D-Day" : `D+${Math.abs(diff)}`
}

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, up }: { label: string; value: string; sub?: string; up?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xl font-bold tabular-nums text-foreground">{value}</span>
      {sub && (
        <span className={cn("text-xs flex items-center gap-0.5 font-medium", up ? "text-green-400" : "text-red-400")}>
          {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {sub}
        </span>
      )}
    </div>
  )
}

// ── Tab 1: 가계부 (API 연동) ──────────────────────────────────────────────────

import { Suspense } from "react"
import { FinanceView } from "@/components/finance/finance-view"

function LedgerTab() {
  return (
    <Suspense>
      <FinanceView />
    </Suspense>
  )
}

// ── Tab 2: 소비 분석 ──────────────────────────────────────────────────────────

const DONUT_DATA = CATEGORIES
  .map(cat => ({
    name: cat,
    value: SAMPLE_TXS
      .filter(t => t.type === "expense" && t.category === cat)
      .reduce((s, t) => s + t.amount, 0),
    color: CAT_COLOR[cat] ?? "#8B949E",
  }))
  .filter(d => d.value > 0)
  .sort((a, b) => b.value - a.value)

import { StatisticsView } from "@/components/statistics/statistics-view"

function InsightsTab() {
  return <StatisticsView />
}

// ── Tab 3: 예산 관리 (API 연동) ──────────────────────────────────────────────

import { BudgetView } from "@/components/budget/budget-view"

function BudgetTab() {
  return <BudgetView />
}

// ── Tab 4: 소비 지도 (API 연동 — Naver Maps) ────────────────────────────────

import dynamic from "next/dynamic"

const FinanceMapClient = dynamic(
  () => import("@/components/finance-map/finance-map-client"),
  { ssr: false, loading: () => <div className="flex flex-1 items-center justify-center"><Loader2 className="size-8 animate-spin text-primary" /></div> }
)

function HeatmapTab() {
  return <FinanceMapClient />
}

// ── Main AssetsSection ────────────────────────────────────────────────────────

type AssetTab = "ledger" | "insights" | "budget" | "heatmap"

const ASSET_TABS: { id: AssetTab; label: string; icon: React.ElementType }[] = [
  { id: "ledger",   label: "가계부",    icon: BookOpen },
  { id: "insights", label: "소비 분석", icon: BarChart2 },
  { id: "budget",   label: "예산 관리", icon: Target },
  { id: "heatmap",  label: "소비 지도", icon: Map },
]

export function AssetsSection() {
  const [tab, setTab] = useState<AssetTab>("ledger")

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Section header */}
      <div className="flex items-center gap-4 px-5 py-3 border-b border-border bg-card/50 shrink-0">
        <div>
          <h1 className="text-sm font-bold text-foreground tracking-tight">자산 관리</h1>
          <p className="text-xs text-muted-foreground">StarNion Financial Intelligence</p>
        </div>
        <nav className="flex items-center gap-0.5 ml-4">
          {ASSET_TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium transition-colors",
                tab === id
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
              )}>
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </nav>
        <button className="ml-auto flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors">
          <Download className="w-3.5 h-3.5" />CSV
        </button>
      </div>

      {/* Tab content */}
      <div className="flex flex-col flex-1 overflow-hidden min-h-0">
        {tab === "ledger"   && <LedgerTab />}
        {tab === "insights" && <InsightsTab />}
        {tab === "budget"   && <BudgetTab />}
        {tab === "heatmap"  && <HeatmapTab />}
      </div>
    </div>
  )
}

// Legacy alias kept for any old import
export { AssetsSection as StatsTab }
