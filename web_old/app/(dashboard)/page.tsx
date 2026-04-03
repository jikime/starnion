"use client"

import { useCallback, useEffect, useState } from "react"
import { signOut } from "next-auth/react"
import { useTranslations } from "next-intl"
import { apiFetch } from "@/lib/client-api"
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
  ArrowRight, Flame, FileText, Images, AlertCircle, ChevronLeft, ChevronRight,
} from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"

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
  sub_type: string
}

interface DashboardData {
  summary: Summary | null
  goals: Goal[]
  transactions: Transaction[]
  ddays: DDay[]
  budgets: BudgetItem[]
  diary: DiaryEntry[]
  memos: Memo[]
  documents: DocItem[]
  images: ImageItem[]
}

type LoadError = "unavailable" | "failed" | false

interface LoadErrors {
  summary?: LoadError
  goals?: LoadError
  transactions?: LoadError
  ddays?: LoadError
  budgets?: LoadError
  diary?: LoadError
  memos?: LoadError
  documents?: LoadError
  images?: LoadError
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function KRW(n: number) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency", currency: "KRW", maximumFractionDigits: 0,
  }).format(n)
}

function shortKRW(n: number, units?: { billion: string; tenThousand: string }) {
  const u = units ?? { billion: "억", tenThousand: "만" }
  if (Math.abs(n) >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}${u.billion}`
  if (Math.abs(n) >= 10_000) return `${(n / 10_000).toFixed(0)}${u.tenThousand}`
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

// ── Dashboard Skeleton ────────────────────────────────────────────────────────

function SkeletonCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card overflow-hidden", className)}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-6 w-6 rounded-md" />
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {/* Row 1: KPI */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-2 min-w-0">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-7 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="size-9 rounded-full shrink-0" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Row 2: Chart(2/3) + Diary+Memo(1/3) */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SkeletonCard>
            <Skeleton className="h-[210px] w-full rounded-md" />
          </SkeletonCard>
        </div>
        <div className="flex flex-col gap-4">
          <SkeletonCard>
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-1.5 border-b border-border pb-2.5 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-14 rounded-full" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          </SkeletonCard>
          <SkeletonCard>
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="space-y-1.5 border-b border-border pb-2.5 last:border-0 last:pb-0">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              ))}
            </div>
          </SkeletonCard>
        </div>
      </div>

      {/* Row 3: Goals | D-Day | Transactions | Budget */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Goals */}
        <SkeletonCard>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-8" />
                </div>
                <Skeleton className="h-1.5 w-full rounded-full" />
              </div>
            ))}
          </div>
        </SkeletonCard>
        {/* D-Day */}
        <SkeletonCard>
          <div className="space-y-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-5 w-14 rounded-full shrink-0" />
              </div>
            ))}
          </div>
        </SkeletonCard>
        {/* Transactions */}
        <SkeletonCard>
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Skeleton className="h-5 w-12 rounded-full shrink-0" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-4 w-16 shrink-0" />
              </div>
            ))}
          </div>
        </SkeletonCard>
        {/* Budget */}
        <SkeletonCard>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-1.5 w-full rounded-full" />
              </div>
            ))}
          </div>
        </SkeletonCard>
      </div>

      {/* Row 4: Documents | Images */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SkeletonCard>
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <Skeleton className="h-6 w-10 rounded shrink-0" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-3 w-12 shrink-0" />
              </div>
            ))}
          </div>
        </SkeletonCard>
        <SkeletonCard>
          <div className="grid grid-cols-5 gap-1.5">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-md" />
            ))}
          </div>
        </SkeletonCard>
      </div>
    </div>
  )
}

// ── Shared card wrapper ───────────────────────────────────────────────────────

function SectionCard({
  title, icon: Icon, href, children, className, hasError,
}: {
  title: string
  icon: React.ElementType
  href: string
  children: React.ReactNode
  className?: string
  hasError?: LoadError
}) {
  const t = useTranslations("dashboard")
  return (
    <div className={cn("rounded-xl border border-border bg-card overflow-hidden", className)}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="size-4 text-primary" />
          {title}
          {hasError && <AlertCircle className="size-3.5 text-destructive" aria-label={t("dataLoadFailed")} />}
        </h2>
        <Link href={href}>
          <Button variant="ghost" size="icon" className="size-6">
            <ArrowRight className="size-3.5 text-muted-foreground" />
          </Button>
        </Link>
      </div>
      <div className="px-5 py-4">
        {hasError ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {hasError === "unavailable" ? t("serverUnavailable") : t("dataLoadError")}
          </p>
        ) : children}
      </div>
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
      sub: summary ? `↑ ${KRW(summary.income)}  ↓ ${KRW(summary.expense)}` : "",
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

function MonthlyChartCard({ data, hasError }: { data: MonthlyStat[]; hasError?: LoadError }) {
  const t = useTranslations("dashboard")
  const kwUnits = { billion: t("unitBillion"), tenThousand: t("unitTenThousand") }
  const shortKRWt = (n: number) => shortKRW(n, kwUnits)
  return (
    <SectionCard title={t("monthlyChart")} icon={TrendingUp} href="/finance" hasError={hasError}>
      {data.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{t("noData")}</p>
      ) : (
        <ResponsiveContainer width="100%" height={210}>
          <BarChart data={data} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={shortKRWt} tick={{ fontSize: 10 }} />
            <Tooltip
              formatter={(v: number, name: string) => [KRW(v), name === "income" ? t("income") : t("expense")]}
              labelFormatter={(l) => t("chartMonthLabel", { month: l })}
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

function DiaryCard({ entries, hasError }: { entries: DiaryEntry[]; hasError?: LoadError }) {
  const t = useTranslations("dashboard")
  return (
    <SectionCard title={t("diary")} icon={BookOpen} href="/diary" hasError={hasError}>
      {entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("noDiary")}</p>
      ) : (
        <div className="space-y-3">
          {entries.slice(0, 5).map((entry) => (
            <div key={entry.id} className="space-y-0.5 border-b border-border pb-2.5 last:border-0 last:pb-0">
              <div className="flex items-center gap-2">
                <span className={cn("inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-medium", MOOD_COLOR[entry.mood] ?? "bg-secondary text-secondary-foreground")}>
                  {MOOD_EMOJI[entry.mood] ?? ""} {entry.mood}
                </span>
                <span className="text-[11px] text-muted-foreground">{entry.entry_date}</span>
              </div>
              <p className="line-clamp-1 text-sm font-medium">{entry.title || entry.content}</p>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

// ── Memo ──────────────────────────────────────────────────────────────────────

function MemoCard({ memos, hasError }: { memos: Memo[]; hasError?: LoadError }) {
  const t = useTranslations("dashboard")
  return (
    <SectionCard title={t("memo")} icon={StickyNote} href="/memo" hasError={hasError}>
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

function DocumentsCard({ documents, hasError }: { documents: DocItem[]; hasError?: LoadError }) {
  const t = useTranslations("dashboard")
  return (
    <SectionCard title={t("documents")} icon={FileText} href="/files" hasError={hasError}>
      {documents.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{t("noDocuments")}</p>
      ) : (
        <div className="space-y-1">
          {documents.slice(0, 5).map((doc) => (
            <Link
              key={doc.id}
              href="/files"
              className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 hover:bg-accent transition-colors"
            >
              <span className={cn("inline-flex w-10 shrink-0 justify-center items-center px-1.5 py-0.5 rounded text-[10px] font-bold", FORMAT_COLOR[doc.format] ?? "bg-muted text-muted-foreground")}>
                {doc.format}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{doc.name}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{doc.size_label}</span>
            </Link>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

// ── Images ────────────────────────────────────────────────────────────────────

function ImagesCard({ images, hasError }: { images: ImageItem[]; hasError?: LoadError }) {
  const t = useTranslations("dashboard")
  return (
    <SectionCard title={t("images")} icon={Images} href="/files" hasError={hasError}>
      {images.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{t("noImages")}</p>
      ) : (
        <div className="grid grid-cols-5 gap-1.5">
          {images.slice(0, 10).map((img) => (
            <Link key={img.id} href="/files">
              <div className="relative aspect-square overflow-hidden rounded-md bg-muted border border-border hover:opacity-80 transition-opacity cursor-pointer">
                <NextImage
                  src={img.url}
                  alt={img.name}
                  fill
                  sizes="100px"
                  className="object-cover"
                />
              </div>
            </Link>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

// ── Goals ─────────────────────────────────────────────────────────────────────

function GoalsCard({ goals, hasError }: { goals: Goal[]; hasError?: LoadError }) {
  const t = useTranslations("dashboard")
  return (
    <SectionCard title={t("goals")} icon={Target} href="/goals" hasError={hasError}>
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

function DDayCard({ ddays, hasError }: { ddays: DDay[]; hasError?: LoadError }) {
  const t = useTranslations("dashboard")
  return (
    <SectionCard title={t("dday")} icon={Clock} href="/dday" hasError={hasError}>
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

function TransactionsCard({ transactions, hasError }: { transactions: Transaction[]; hasError?: LoadError }) {
  const t = useTranslations("dashboard")
  return (
    <SectionCard title={t("recentTransactions")} icon={TrendingDown} href="/finance" hasError={hasError}>
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

function BudgetCard({ budgets, hasError }: { budgets: BudgetItem[]; hasError?: LoadError }) {
  const t = useTranslations("dashboard")
  const kwUnits = { billion: t("unitBillion"), tenThousand: t("unitTenThousand") }
  const shortKRWt = (n: number) => shortKRW(n, kwUnits)
  return (
    <SectionCard title={t("budget")} icon={PiggyBank} href="/budget" hasError={hasError}>
      {budgets.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{t("noBudget")}</p>
      ) : (
        <div className="space-y-3">
          {budgets.slice(0, 5).map((b) => {
            const over = b.percent >= 100
            const overAmt = b.spent - b.budget
            return (
              <div key={b.category} className="space-y-1">
                <div className="flex items-center justify-between gap-1 text-sm">
                  <span className="font-medium truncate">{b.category}</span>
                  <div className="flex shrink-0 items-center gap-1">
                    {over && (
                      <span className="inline-flex items-center px-1 py-0 rounded text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                        {t("budgetOver", { amount: shortKRWt(overAmt) })}
                      </span>
                    )}
                    <span className={`text-xs tabular-nums ${over ? "text-red-500" : "text-muted-foreground"}`}>
                      {shortKRWt(b.spent)} / {shortKRWt(b.budget)}
                    </span>
                  </div>
                </div>
                <Progress value={Math.min(100, b.percent)} className={`h-1.5 ${over ? "[&>div]:bg-red-500" : ""}`} />
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
    budgets: [], diary: [], memos: [], documents: [], images: [],
  })
  const [errors, setErrors] = useState<LoadErrors>({})
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1)

  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === (now.getMonth() + 1)

  const goMonth = useCallback((delta: number) => {
    const d = new Date(viewYear, viewMonth - 1 + delta, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth() + 1)
  }, [viewYear, viewMonth])

  const load = useCallback(async () => {
    setLoading(true)
    const [summaryRes, goalsRes, txRes, ddayRes, budgetRes, diaryRes, memoRes, docsRes, imgsRes] =
      await Promise.allSettled([
        apiFetch(`/api/finance/summary?year=${viewYear}&month=${viewMonth}`),
        apiFetch("/api/goals?status=in_progress"),
        apiFetch(`/api/finance/transactions?limit=5&year=${viewYear}&month=${viewMonth}`),
        apiFetch("/api/dday"),
        apiFetch(`/api/budget?year=${viewYear}&month=${viewMonth}`),
        apiFetch("/api/diary?limit=5"),
        apiFetch("/api/memo?limit=3"),
        apiFetch("/api/files?type=document"),
        apiFetch("/api/files?type=image&limit=6"),
      ])

    // 세션 만료(401) 감지 → signOut은 apiFetch 내부에서 처리됨
    // 추가 안전장치: 모든 응답이 401이면 즉시 중단
    const allUnauthorized = [summaryRes, goalsRes, txRes, ddayRes, budgetRes, diaryRes, memoRes, docsRes, imgsRes]
      .filter(r => r.status === "fulfilled")
      .every(r => (r as PromiseFulfilledResult<Response>).value.status === 401)
    if (allUnauthorized) {
      signOut({ redirectTo: "/login" })
      return
    }

    function getError(r: PromiseSettledResult<Response>): LoadError {
      if (r.status === "rejected") return "unavailable"
      if (!r.value.ok) return r.value.status === 503 || r.value.status === 504 ? "unavailable" : "failed"
      return false
    }

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
    const docsRaw   = await json<{ files?: DocItem[] }>(docsRes)
    const imgsRaw   = await json<{ files?: ImageItem[] }>(imgsRes)

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
    const documents = docsRaw?.files ?? []
    const images = imgsRaw?.files ?? []

    setErrors({
      summary: getError(summaryRes),
      goals: getError(goalsRes),
      transactions: getError(txRes),
      ddays: getError(ddayRes),
      budgets: getError(budgetRes),
      diary: getError(diaryRes),
      memos: getError(memoRes),
      documents: getError(docsRes),
      images: getError(imgsRes),
    })
    setData({ summary, goals, transactions, ddays, budgets, diary: diaryEntries, memos, documents, images })
    setLastRefreshed(new Date())
    setLoading(false)
  }, [viewYear, viewMonth])

  useEffect(() => { load() }, [load])

  const nearestDday = data.ddays.find((d) => d.dday_value >= 0) ?? data.ddays[0] ?? null

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col gap-4 overflow-y-auto p-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <LayoutDashboard className="size-5 text-primary" />
          {t("title")}
        </h1>
        <div className="flex items-center gap-3">
          {/* Month selector */}
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="size-7" onClick={() => goMonth(-1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-[5.5rem] text-center text-sm font-medium tabular-nums">
              {t("monthLabel", { year: viewYear, month: viewMonth })}
            </span>
            <Button
              variant="ghost" size="icon" className="size-7"
              onClick={() => goMonth(1)}
              disabled={isCurrentMonth}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          {/* Last refreshed + refresh */}
          <div className="flex items-center gap-2">
            {lastRefreshed && (
              <span className="hidden sm:inline text-xs tabular-nums text-muted-foreground">
                {t("asOf", { time: lastRefreshed.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) })}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              {t("refresh")}
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <DashboardSkeleton />
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
              <MonthlyChartCard data={data.summary?.monthly_chart ?? []} hasError={errors.summary} />
            </div>
            <div className="flex flex-col gap-4">
              <DiaryCard entries={data.diary} hasError={errors.diary} />
              <MemoCard memos={data.memos} hasError={errors.memos} />
            </div>
          </div>

          {/* Row 3: Goals | D-Day | Transactions | Budget */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <GoalsCard goals={data.goals} hasError={errors.goals} />
            <DDayCard ddays={data.ddays} hasError={errors.ddays} />
            <TransactionsCard transactions={data.transactions} hasError={errors.transactions} />
            <BudgetCard budgets={data.budgets} hasError={errors.budgets} />
          </div>

          {/* Row 4: Documents | Images */}
          <div className="grid gap-4 lg:grid-cols-2">
            <DocumentsCard documents={data.documents} hasError={errors.documents} />
            <ImagesCard images={data.images} hasError={errors.images} />
          </div>
        </div>
      )}
    </div>
  )
}
