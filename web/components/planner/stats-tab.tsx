// cache-bust: v3
"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import {
  BookOpen, BarChart2, Target, Map,
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
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-xl font-bold tabular-nums text-foreground">{value}</span>
      {sub && (
        <span className={cn("text-[10px] flex items-center gap-0.5 font-medium", up ? "text-green-400" : "text-red-400")}>
          {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {sub}
        </span>
      )}
    </div>
  )
}

// ── Tab 1: 가계부 ─────────────────────────────────────────────────────────────

function LedgerTab() {
  const [txs, setTxs]          = useState<Transaction[]>(SAMPLE_TXS)
  const [adding, setAdding]    = useState(false)
  const [filterCat, setFilter] = useState("전체")
  const [form, setForm]        = useState<Partial<Transaction>>({
    type: "expense", category: "식비", date: "2026-04-03",
  })

  const totalIncome  = txs.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0)
  const totalExpense = txs.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0)
  const filtered     = filterCat === "전체" ? txs : txs.filter(t => t.category === filterCat)

  const save = () => {
    if (!form.amount || !form.memo) return
    setTxs(prev => [{
      id: `t${Date.now()}`, type: form.type!, amount: Number(form.amount),
      category: form.category!, tags: [], memo: form.memo!, date: form.date!,
    }, ...prev])
    setAdding(false)
    setForm({ type: "expense", category: "식비", date: "2026-04-03" })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3 px-5 py-4 border-b border-border shrink-0">
        <StatCard label="이번달 수입"  value={`+${fmt(totalIncome)}`}           sub="전월 대비 +2.5%" up />
        <StatCard label="이번달 지출"  value={`-${fmt(totalExpense)}`}          sub="전월 대비 +8.3%" />
        <StatCard label="순 잔액"      value={fmt(totalIncome - totalExpense)} />
      </div>

      {/* Filter + add button */}
      <div className="flex items-center gap-2 px-5 py-2 border-b border-border shrink-0 overflow-x-auto">
        {["전체", ...CATEGORIES].map(c => (
          <button key={c} onClick={() => setFilter(c)}
            className={cn(
              "shrink-0 h-6 px-2.5 rounded-full text-[10px] font-medium transition-colors",
              filterCat === c ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/40"
            )}>
            {c}
          </button>
        ))}
        <button onClick={() => setAdding(v => !v)}
          className="ml-auto shrink-0 flex items-center gap-1 h-7 px-3 rounded-lg text-[11px] font-semibold"
          style={{ background: "var(--priority-a)", color: "#0d1117" }}>
          <Plus className="w-3 h-3" />추가
        </button>
      </div>

      {/* Inline add form */}
      {adding && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 px-5 py-3 border-b border-border bg-card/60 shrink-0">
          <select value={form.type}
            onChange={e => setForm(f => ({ ...f, type: e.target.value as TxType }))}
            className="h-8 rounded-lg border border-border bg-background text-xs px-2 text-foreground">
            <option value="expense">지출</option>
            <option value="income">수입</option>
          </select>
          <select value={form.category}
            onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            className="h-8 rounded-lg border border-border bg-background text-xs px-2 text-foreground">
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <input type="number" placeholder="금액 (원)" value={form.amount ?? ""}
            onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))}
            className="h-8 rounded-lg border border-border bg-background text-xs px-2 text-foreground" />
          <input type="text" placeholder="메모" value={form.memo ?? ""}
            onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
            onKeyDown={e => e.key === "Enter" && save()}
            className="h-8 rounded-lg border border-border bg-background text-xs px-2 text-foreground" />
          <button onClick={save}
            className="col-span-2 md:col-span-4 h-8 rounded-lg text-xs font-semibold"
            style={{ background: "var(--priority-a)", color: "#0d1117" }}>
            저장
          </button>
        </div>
      )}

      {/* Transaction list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map(tx => {
          const color = CAT_COLOR[tx.category] ?? "#8B949E"
          return (
            <div key={tx.id}
              className="flex items-center gap-3 px-5 py-2.5 border-b border-border hover:bg-accent/10 group transition-colors">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: color + "22" }}>
                <span className="text-[10px] font-bold" style={{ color }}>{tx.category.slice(0, 1)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground truncate">{tx.memo}</p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className="text-[10px] text-muted-foreground">{tx.date}</span>
                  {tx.location && <span className="text-[10px] text-muted-foreground">· {tx.location}</span>}
                  {tx.tags.map(tag => (
                    <span key={tag}
                      className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
              <span className={cn(
                "text-sm font-semibold tabular-nums shrink-0",
                tx.type === "income" ? "text-green-400" : "text-foreground"
              )}>
                {tx.type === "income" ? "+" : "-"}{fmtFull(tx.amount)}
              </span>
              <button onClick={() => setTxs(p => p.filter(t => t.id !== tx.id))}
                className="opacity-0 group-hover:opacity-50 hover:!opacity-100 text-muted-foreground transition-opacity">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
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

function InsightsTab() {
  const totalExp = DONUT_DATA.reduce((s, d) => s + d.value, 0)

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5">
      {/* Area chart */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold text-foreground mb-3">월별 수입 / 지출 추이</p>
        <ResponsiveContainer width="100%" height={150}>
          <AreaChart data={TREND_DATA} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="incG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#3FB950" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#3FB950" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="expG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#F85149" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#F85149" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="month"
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              axisLine={false} tickLine={false}
              tickFormatter={v => `${(v / 1_000_000).toFixed(1)}M`} />
            <Tooltip
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
              formatter={(v: number) => fmtFull(v)} />
            <Area type="monotone" dataKey="수입" stroke="#3FB950" strokeWidth={2} fill="url(#incG)" dot={false} />
            <Area type="monotone" dataKey="지출" stroke="#F85149" strokeWidth={2} fill="url(#expG)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-2">
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="w-3 h-0.5 rounded bg-green-400 inline-block" />수입
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="w-3 h-0.5 rounded bg-red-400 inline-block" />지출
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Donut */}
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold text-foreground mb-3">카테고리별 지출 비율</p>
          <div className="flex items-center gap-3">
            <ResponsiveContainer width={130} height={130}>
              <PieChart>
                <Pie data={DONUT_DATA} cx="50%" cy="50%"
                  innerRadius={35} outerRadius={58} paddingAngle={2} dataKey="value">
                  {DONUT_DATA.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                  formatter={(v: number) => fmtFull(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-1.5">
              {DONUT_DATA.map(d => (
                <div key={d.name} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                  <span className="text-[11px] text-foreground flex-1">{d.name}</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {Math.round(d.value / totalExp * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top 5 */}
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold text-foreground mb-3">Top 5 지출 항목</p>
          <div className="space-y-2.5">
            {DONUT_DATA.slice(0, 5).map((d, i) => (
              <div key={d.name} className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground w-4 tabular-nums">{i + 1}</span>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                <span className="text-[11px] text-foreground flex-1">{d.name}</span>
                <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full"
                    style={{ width: `${Math.round(d.value / DONUT_DATA[0].value * 100)}%`, background: d.color }} />
                </div>
                <span className="text-[11px] font-medium tabular-nums text-foreground w-14 text-right">
                  {fmt(d.value)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-border">
            <p className="text-[10px] text-amber-400 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              현재 소비 속도가 지난달 대비 8.3% 빠릅니다
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Tab 3: 예산 관리 ──────────────────────────────────────────────────────────

function BudgetTab() {
  const totalLimit = SAMPLE_BUDGETS.reduce((s, b) => s + b.limit, 0)
  const totalUsed  = SAMPLE_BUDGETS.reduce((s, b) => s + b.used, 0)

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="총 예산"    value={fmt(totalLimit)} />
        <StatCard label="사용 금액"  value={fmt(totalUsed)}
          sub={`${Math.round(totalUsed / totalLimit * 100)}% 소진`} />
        <StatCard label="잔여 예산"  value={fmt(totalLimit - totalUsed)} sub="잔여 27일" up />
      </div>

      {/* Progress bars */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        <p className="text-xs font-semibold text-foreground">카테고리별 예산 현황</p>
        {SAMPLE_BUDGETS.map(b => {
          const pct  = Math.min(Math.round(b.used / b.limit * 100), 100)
          const warn = pct >= 80
          return (
            <div key={b.category} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-foreground">{b.category}</span>
                <span className={cn("text-[11px] tabular-nums font-medium",
                  warn ? "text-amber-400" : "text-muted-foreground")}>
                  {fmtFull(b.used)} / {fmtFull(b.limit)}{warn && "  ⚠"}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    background: pct >= 90 ? "#F85149" : pct >= 80 ? "#E3A948" : b.color,
                  }} />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{pct}% 사용</span>
                <span>잔여 {fmtFull(b.limit - b.used)}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Saving goals */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <p className="text-xs font-semibold text-foreground">D-Day 저축 목표</p>
        {SAMPLE_GOALS.map(g => {
          const pct = Math.round(g.saved / g.target * 100)
          return (
            <div key={g.id} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">{g.title}</span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: g.color + "22", color: g.color }}>
                  {dday(g.dueDate)}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: g.color }} />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{fmtFull(g.saved)} 저축 완료</span>
                <span>목표 {fmtFull(g.target)} ({pct}%)</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Balance forecast */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold text-foreground mb-1">월말 잔액 예측</p>
        <p className="text-[10px] text-muted-foreground mb-3">현재 소비 속도 기준 월말 예상 잔액</p>
        <div className="flex items-end gap-5">
          <div>
            <p className="text-[10px] text-muted-foreground">예상 월 지출</p>
            <p className="text-lg font-bold text-foreground">-{fmt(totalUsed / 4 * 30)}</p>
          </div>
          <ArrowUpRight className="w-5 h-5 text-green-400 mb-1" />
          <div>
            <p className="text-[10px] text-muted-foreground">예상 잔액</p>
            <p className="text-lg font-bold text-green-400">+{fmt(3950000 - (totalUsed / 4 * 30))}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Tab 4: 소비 지도 ──────────────────────────────────────────────────────────

function HeatmapTab() {
  const [selected, setSelected] = useState<typeof HEATMAP_SPOTS[0] | null>(null)

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-h-0">
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Map canvas */}
        <div className="flex-1 relative overflow-hidden bg-[#0d1117]">
          <svg className="absolute inset-0 w-full h-full opacity-10">
            <defs>
              <pattern id="mapgrid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#58A6FF" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#mapgrid)" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-72 h-60 rounded-[40%] border border-[#58A6FF]/20" />
          </div>

          {HEATMAP_SPOTS.map(spot => {
            const size     = Math.max(32, spot.count * 3.2)
            const isActive = selected?.name === spot.name
            const hex      = Math.min(255, spot.count * 6).toString(16).padStart(2, "0")
            return (
              <button key={spot.name}
                onClick={() => setSelected(isActive ? null : spot)}
                className="absolute"
                style={{ left: `${spot.x}%`, top: `${spot.y}%`, transform: "translate(-50%,-50%)" }}>
                <div className="absolute rounded-full animate-pulse"
                  style={{
                    width: size, height: size,
                    top: -size / 2, left: -size / 2,
                    background: `radial-gradient(circle, #58A6FF${hex} 0%, transparent 70%)`,
                  }} />
                <div className={cn(
                  "relative w-3 h-3 rounded-full border-2 transition-all",
                  isActive ? "border-white scale-125" : "border-[#58A6FF]"
                )}
                  style={{ background: isActive ? "#fff" : "#58A6FF88" }} />
              </button>
            )
          })}

          <div className="absolute bottom-4 left-4 bg-card/90 border border-border rounded-lg p-2.5 space-y-1">
            <p className="text-xs font-semibold text-foreground">지출 밀집도</p>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <div className="w-16 h-1.5 rounded-full"
                style={{ background: "linear-gradient(to right, #58A6FF22, #58A6FF)" }} />
              낮음 → 높음
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-56 shrink-0 border-l border-border flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-border shrink-0">
            <p className="text-xs font-semibold text-foreground">지출 핫스팟</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">마커를 클릭해 상세 확인</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {[...HEATMAP_SPOTS].sort((a, b) => b.amount - a.amount).map(spot => (
              <button key={spot.name}
                onClick={() => setSelected(selected?.name === spot.name ? null : spot)}
                className={cn(
                  "w-full text-left px-4 py-3 border-b border-border transition-colors",
                  selected?.name === spot.name ? "bg-accent/30" : "hover:bg-accent/10"
                )}>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-foreground font-medium">{spot.name}</span>
                  <span className="text-[10px] text-muted-foreground">{spot.count}회</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{spot.category}</p>
                <p className="text-xs font-semibold text-foreground mt-0.5">{fmtFull(spot.amount)}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {selected && (
        <div className="flex items-center gap-3 px-5 py-3 border-t border-border bg-card/60 shrink-0">
          <Map className="w-4 h-4 shrink-0" style={{ color: "#58A6FF" }} />
          <div>
            <p className="text-xs font-semibold text-foreground">{selected.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {selected.category} · {selected.count}회 방문 · {fmtFull(selected.amount)} 지출
            </p>
          </div>
        </div>
      )}
    </div>
  )
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
          <p className="text-[10px] text-muted-foreground">StarNion Financial Intelligence</p>
        </div>
        <nav className="flex items-center gap-0.5 ml-4">
          {ASSET_TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-1.5 h-7 px-3 rounded-lg text-[11px] font-medium transition-colors",
                tab === id
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
              )}>
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </nav>
        <button className="ml-auto flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-border text-[11px] text-muted-foreground hover:text-foreground transition-colors">
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
