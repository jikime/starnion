"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts"
import NextImage from "next/image"
import {
  Wallet, TrendingUp, TrendingDown, Target, Clock, RefreshCw,
  Loader2, PiggyBank, LayoutDashboard, BookOpen, StickyNote,
  ArrowRight, Flame, FileText, Images,
} from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

interface MonthlyStat { month: string; income: number; expense: number }

interface Summary {
  income: number
  expense: number
  net: number
  savings_rate: number
  monthly_chart: MonthlyStat[]
}

interface Goal {
  id: number
  title: string
  icon: string
  target_value: number
  current_value: number
  unit: string
  progress: number
  status: string
  streak: number
}

interface Transaction {
  id: number
  description: string
  amount: number
  category: string
  created_at: string
}

interface DDay {
  id: number
  title: string
  icon: string
  dday_value: number
  dday_label: string
}

interface BudgetItem {
  category: string
  budget: number
  spent: number
  percent: number
}

interface DiaryEntry {
  id: number
  title: string
  content: string
  mood: string
  entry_date: string
}

interface Memo {
  id: number
  title: string
  content: string
  tags: string[]
}

interface DocItem {
  id: number
  name: string
  format: string
  size_label: string
  created_at: string
}

interface ImageItem {
  id: number
  url: string
  name: string
  type: string
}

interface DashboardData {
  summary: Summary | null
  goals: Goal[]
  transactions: Transaction[]
  ddays: DDay[]
  budgets: BudgetItem[]
  diary: DiaryEntry | null
  memos: Memo[]
  documents: DocItem[]
  images: ImageItem[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function KRW(n: number) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency", currency: "KRW", maximumFractionDigits: 0,
  }).format(n)
}

function shortKRW(n: number) {
  if (Math.abs(n) >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`
  if (Math.abs(n) >= 10_000) return `${(n / 10_000).toFixed(0)}만`
  return n.toLocaleString("ko-KR")
}

const FORMAT_COLOR: Record<string, string> = {
  PDF:  "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  DOCX: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  XLSX: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  PPTX: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  MD:   "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  TXT:  "bg-muted text-muted-foreground",
  CSV:  "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
}

const MOOD_EMOJI: Record<string, string> = {
  매우좋음: "😄", 좋음: "🙂", 보통: "😐", 나쁨: "😟", 매우나쁨: "😢",
}
const MOOD_COLOR: Record<string, string> = {
  매우좋음: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  좋음: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  보통: "bg-muted text-muted-foreground",
  나쁨: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  매우나쁨: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
}

// ── Shared card wrapper ───────────────────────────────────────────────────────

function SectionCard({
  title, icon: Icon, href, children, className,
}: {
  title: string
  icon: React.ElementType
  href: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-card overflow-hidden", className)}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="size-4 text-primary" />
          {title}
        </h2>
        <Link href={href}>
          <Button variant="ghost" size="icon" className="size-6">
            <ArrowRight className="size-3.5 text-muted-foreground" />
          </Button>
        </Link>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

// ── KPI Row ───────────────────────────────────────────────────────────────────

function KpiRow({ summary, goalCount, nearestDday, memoCount }: {
  summary: Summary | null
  goalCount: number
  nearestDday: DDay | null
  memoCount: number
}) {
  const t = useTranslations("dashboard")
  const net = summary?.net ?? 0
  const items = [
    {
      label: t("net"),
      value: summary ? KRW(summary.net) : "-",
      sub: summary ? `↑ ${shortKRW(summary.income)}  ↓ ${shortKRW(summary.expense)}` : "",
      icon: Wallet,
      color: net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400",
      href: "/finance",
    },
    {
      label: t("activeGoals"),
      value: goalCount.toString(),
      sub: t("inProgress"),
      icon: Target,
      color: "text-primary",
      href: "/goals",
    },
    {
      label: t("nearestDday"),
      value: nearestDday ? nearestDday.dday_label : "-",
      sub: nearestDday?.title ?? t("noDDay"),
      icon: Clock,
      color: nearestDday && nearestDday.dday_value >= 0 && nearestDday.dday_value <= 7
        ? "text-red-500 dark:text-red-400"
        : "text-primary",
      href: "/dday",
    },
    {
      label: t("memoCount"),
      value: memoCount.toString(),
      sub: t("memos"),
      icon: StickyNote,
      color: "text-primary",
      href: "/memo",
    },
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(({ label, value, sub, icon: Icon, color, href }) => (
        <Link key={label} href={href}>
          <div className="rounded-xl border border-border bg-card overflow-hidden hover:bg-muted/30 transition-colors cursor-pointer">
            <div className="p-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={`text-xl font-bold ${color}`}>{value}</p>
                  {sub && <p className="truncate text-[11px] text-muted-foreground">{sub}</p>}
                </div>
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Icon className="size-4 text-primary" />
                </div>
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

// ── Monthly Chart ─────────────────────────────────────────────────────────────

function MonthlyChartCard({ data }: { data: MonthlyStat[] }) {
  const t = useTranslations("dashboard")
  return (
    <SectionCard title={t("monthlyChart")} icon={TrendingUp} href="/finance">
      {data.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{t("noData")}</p>
      ) : (
        <ResponsiveContainer width="100%" height={210}>
          <BarChart data={data} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={shortKRW} tick={{ fontSize: 10 }} />
            <Tooltip
              formatter={(v: number, name: string) => [KRW(v), name === "income" ? t("income") : t("expense")]}
              labelFormatter={(l) => `${l}월`}
              contentStyle={{
                fontSize: 12, borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--background)",
                color: "var(--foreground)",
              }}
            />
            <Bar dataKey="income" fill="#3b6de0" radius={[3, 3, 0, 0]} name="income" />
            <Bar dataKey="expense" fill="#ef4444" radius={[3, 3, 0, 0]} name="expense" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </SectionCard>
  )
}

// ── Diary ─────────────────────────────────────────────────────────────────────

function DiaryCard({ entry }: { entry: DiaryEntry | null }) {
  const t = useTranslations("dashboard")
  return (
    <SectionCard title={t("diary")} icon={BookOpen} href="/diary">
      {!entry ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("noDiary")}</p>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className={cn("inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-medium", MOOD_COLOR[entry.mood] ?? "bg-secondary text-secondary-foreground")}>
              {MOOD_EMOJI[entry.mood] ?? ""} {entry.mood}
            </span>
            <span className="text-[11px] text-muted-foreground">{entry.entry_date}</span>
          </div>
          <p className="line-clamp-1 text-sm font-medium">{entry.title || entry.content}</p>
        </div>
      )}
    </SectionCard>
  )
}

// ── Memo ──────────────────────────────────────────────────────────────────────

function MemoCard({ memos }: { memos: Memo[] }) {
  const t = useTranslations("dashboard")
  return (
    <SectionCard title={t("memo")} icon={StickyNote} href="/memo">
      {memos.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{t("noMemo")}</p>
      ) : (
        <div className="space-y-3">
          {memos.slice(0, 3).map((m) => (
            <div key={m.id} className="space-y-0.5 border-b border-border pb-2.5 last:border-0 last:pb-0">
              {m.title && <p className="line-clamp-1 text-sm font-medium">{m.title}</p>}
              <p className="line-clamp-2 text-xs text-muted-foreground">{m.content}</p>
              {m.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {m.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="inline-flex items-center px-1 py-0 rounded-full text-[10px] font-medium border border-border">#{tag}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

// ── Documents ─────────────────────────────────────────────────────────────────

function DocumentsCard({ documents }: { documents: DocItem[] }) {
  const t = useTranslations("dashboard")
  return (
    <SectionCard title={t("documents")} icon={FileText} href="/documents">
      {documents.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{t("noDocuments")}</p>
      ) : (
        <div className="space-y-2">
          {documents.slice(0, 5).map((doc) => (
            <div key={doc.id} className="flex items-center gap-2.5">
              <span className={cn("inline-flex w-10 shrink-0 justify-center items-center px-1.5 py-0.5 rounded text-[10px] font-bold", FORMAT_COLOR[doc.format] ?? "bg-muted text-muted-foreground")}>
                {doc.format}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{doc.name}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{doc.size_label}</span>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

// ── Images ────────────────────────────────────────────────────────────────────

function ImagesCard({ images }: { images: ImageItem[] }) {
  const t = useTranslations("dashboard")
  return (
    <SectionCard title={t("images")} icon={Images} href="/images">
      {images.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{t("noImages")}</p>
      ) : (
        <div className="grid grid-cols-5 gap-1.5">
          {images.slice(0, 10).map((img) => (
            <div
              key={img.id}
              className="relative aspect-square overflow-hidden rounded-md bg-muted border border-border"
            >
              <NextImage
                src={img.url}
                alt={img.name}
                fill
                sizes="100px"
                className="object-cover"
              />
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

// ── Goals ─────────────────────────────────────────────────────────────────────

function GoalsCard({ goals }: { goals: Goal[] }) {
  const t = useTranslations("dashboard")
  return (
    <SectionCard title={t("goals")} icon={Target} href="/goals">
      {goals.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{t("noGoals")}</p>
      ) : (
        <div className="space-y-3">
          {goals.slice(0, 4).map((g) => (
            <div key={g.id} className="space-y-1">
              <div className="flex items-center justify-between gap-1">
                <span className="flex min-w-0 items-center gap-1 text-sm font-medium">
                  <span className="shrink-0">{g.icon}</span>
                  <span className="truncate">{g.title}</span>
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  {g.streak > 0 && (
                    <span className="flex items-center gap-0.5 text-[10px] text-orange-500">
                      <Flame className="size-3" />{g.streak}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">{g.progress.toFixed(0)}%</span>
                </div>
              </div>
              <Progress value={g.progress} className="h-1.5" />
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

// ── D-Day ─────────────────────────────────────────────────────────────────────

function DDayCard({ ddays }: { ddays: DDay[] }) {
  const t = useTranslations("dashboard")
  return (
    <SectionCard title={t("dday")} icon={Clock} href="/dday">
      {ddays.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{t("noDDay")}</p>
      ) : (
        <div className="space-y-2.5">
          {ddays.slice(0, 5).map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
                <span className="shrink-0">{d.icon}</span>
                <span className="truncate">{d.title}</span>
              </span>
              <span className={cn(
                "shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold",
                d.dday_value === 0
                  ? "bg-primary text-primary-foreground"
                  : d.dday_value > 0 && d.dday_value <= 7
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-secondary text-secondary-foreground border border-border"
              )}>
                {d.dday_label}
              </span>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

// ── Transactions ──────────────────────────────────────────────────────────────

function TransactionsCard({ transactions }: { transactions: Transaction[] }) {
  const t = useTranslations("dashboard")
  return (
    <SectionCard title={t("recentTransactions")} icon={TrendingDown} href="/finance">
      {transactions.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{t("noTransactions")}</p>
      ) : (
        <div className="space-y-2">
          {transactions.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border border-border">
                  {tx.category}
                </span>
                <span className="truncate text-sm text-muted-foreground">{tx.description}</span>
              </div>
              <span className={`shrink-0 text-sm font-medium ${tx.amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}>
                {tx.amount >= 0 ? "+" : ""}{KRW(tx.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

// ── Budget ────────────────────────────────────────────────────────────────────

function BudgetCard({ budgets }: { budgets: BudgetItem[] }) {
  const t = useTranslations("dashboard")
  return (
    <SectionCard title={t("budget")} icon={PiggyBank} href="/budget">
      {budgets.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{t("noBudget")}</p>
      ) : (
        <div className="space-y-3">
          {budgets.slice(0, 5).map((b) => {
            const pct = Math.min(100, b.percent)
            const over = pct >= 100
            return (
              <div key={b.category} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{b.category}</span>
                  <span className={`text-xs ${over ? "text-red-500" : "text-muted-foreground"}`}>
                    {shortKRW(b.spent)} / {shortKRW(b.budget)}
                  </span>
                </div>
                <Progress value={pct} className={`h-1.5 ${over ? "[&>div]:bg-red-500" : ""}`} />
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const t = useTranslations("dashboard")
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<DashboardData>({
    summary: null, goals: [], transactions: [], ddays: [],
    budgets: [], diary: null, memos: [], documents: [], images: [],
  })

  const load = useCallback(async () => {
    setLoading(true)
    const [summaryRes, goalsRes, txRes, ddayRes, budgetRes, diaryRes, memoRes, docsRes, imgsRes] =
      await Promise.allSettled([
        fetch("/api/finance/summary"),
        fetch("/api/goals?status=in_progress"),
        fetch("/api/finance/transactions?limit=5"),
        fetch("/api/dday"),
        fetch("/api/budget"),
        fetch("/api/diary?limit=1"),
        fetch("/api/memo?limit=3"),
        fetch("/api/documents"),
        fetch("/api/images?limit=6"),
      ])

    async function json<T>(r: PromiseSettledResult<Response>): Promise<T | null> {
      if (r.status === "fulfilled" && r.value.ok) {
        try { return await r.value.json() } catch { return null }
      }
      return null
    }

    const summary   = await json<Summary>(summaryRes)
    const goalsRaw  = await json<{ goals?: Goal[] } | Goal[]>(goalsRes)
    const txRaw     = await json<{ transactions?: Transaction[] } | Transaction[]>(txRes)
    const ddayRaw   = await json<DDay[]>(ddayRes)
    const budgetRaw = await json<{ budgets?: BudgetItem[] } | BudgetItem[]>(budgetRes)
    const diaryRaw  = await json<{ entries?: DiaryEntry[] }>(diaryRes)
    const memoRaw   = await json<Memo[]>(memoRes)
    const docsRaw   = await json<DocItem[]>(docsRes)
    const imgsRaw   = await json<ImageItem[]>(imgsRes)

    const goals = Array.isArray(goalsRaw) ? goalsRaw : (goalsRaw as { goals?: Goal[] })?.goals ?? []
    const transactions = Array.isArray(txRaw) ? txRaw : (txRaw as { transactions?: Transaction[] })?.transactions ?? []
    const ddays = (Array.isArray(ddayRaw) ? ddayRaw : []).sort((a, b) => {
      const af = a.dday_value >= 0, bf = b.dday_value >= 0
      if (af && !bf) return -1
      if (!af && bf) return 1
      return af ? a.dday_value - b.dday_value : b.dday_value - a.dday_value
    })
    const budgets = Array.isArray(budgetRaw)
      ? budgetRaw
      : (budgetRaw as { budgets?: BudgetItem[] })?.budgets ?? []
    const diaryEntries = diaryRaw?.entries ?? []
    const memos = Array.isArray(memoRaw) ? memoRaw : []
    const documents = Array.isArray(docsRaw) ? docsRaw : []
    const images = Array.isArray(imgsRaw) ? imgsRaw : []

    setData({ summary, goals, transactions, ddays, budgets, diary: diaryEntries[0] ?? null, memos, documents, images })
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const nearestDday = data.ddays.find((d) => d.dday_value >= 0) ?? data.ddays[0] ?? null

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col gap-4 overflow-y-auto p-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <LayoutDashboard className="size-5 text-primary" />
          {t("title")}
        </h1>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          {t("refresh")}
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Row 1: KPI */}
          <KpiRow
            summary={data.summary}
            goalCount={data.goals.length}
            nearestDday={nearestDday}
            memoCount={data.memos.length}
          />

          {/* Row 2: Chart(2/3) + Diary+Memo stacked(1/3) */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <MonthlyChartCard data={data.summary?.monthly_chart ?? []} />
            </div>
            <div className="flex flex-col gap-4">
              <DiaryCard entry={data.diary} />
              <MemoCard memos={data.memos} />
            </div>
          </div>

          {/* Row 3: Goals | D-Day | Transactions | Budget */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <GoalsCard goals={data.goals} />
            <DDayCard ddays={data.ddays} />
            <TransactionsCard transactions={data.transactions} />
            <BudgetCard budgets={data.budgets} />
          </div>

          {/* Row 4: Documents | Images */}
          <div className="grid gap-4 lg:grid-cols-2">
            <DocumentsCard documents={data.documents} />
            <ImagesCard images={data.images} />
          </div>
        </div>
      )}
    </div>
  )
}
