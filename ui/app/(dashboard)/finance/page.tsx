"use client"

import { useState, useEffect, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Plus,
  TrendingUp,
  TrendingDown,
  Wallet,
  PiggyBank,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts"

// ── types ─────────────────────────────────────────────────────────────────────

type Transaction = {
  id: number
  amount: number
  category: string
  description: string
  created_at: string
}

type MonthlyPoint = { month: string; income: number; expense: number }
type CategoryPoint = { category: string; amount: number }

type Summary = {
  income: number
  expense: number
  net: number
  savings_rate: number
  monthly_chart: MonthlyPoint[]
  category_breakdown: CategoryPoint[]
}

type TransactionList = {
  transactions: Transaction[]
  total: number
  page: number
  limit: number
}

// ── constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = ["식비", "교통", "쇼핑", "구독", "의료", "문화", "기타"]

const CATEGORY_COLORS: Record<string, string> = {
  식비: "#f97316",
  교통: "#3b82f6",
  쇼핑: "#a855f7",
  구독: "#06b6d4",
  의료: "#ef4444",
  문화: "#eab308",
  기타: "#6b7280",
  수입: "#22c55e",
}

const KRW = (v: number) =>
  new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW" }).format(v)

// ── stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ComponentType<{ className?: string }>
  color: string
}) {
  return (
    <div className="rounded-xl border bg-card p-5 flex items-start gap-4">
      <div className={cn("rounded-lg p-2.5", color)}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold tracking-tight truncate">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function FinancePage() {
  const t = useTranslations("finance")
  const tc = useTranslations("common")

  const categoryLabel = (cat: string) => {
    const map: Record<string, string> = {
      "식비": t("categories.food"),
      "교통": t("categories.transport"),
      "쇼핑": t("categories.shopping"),
      "구독": t("categories.subscription"),
      "의료": t("categories.medical"),
      "문화": t("categories.culture"),
      "기타": t("categories.other"),
    }
    return map[cat] ?? cat
  }

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const [summary, setSummary] = useState<Summary | null>(null)
  const [txList, setTxList] = useState<TransactionList>({
    transactions: [],
    total: 0,
    page: 1,
    limit: 20,
  })
  const [loading, setLoading] = useState(true)
  const [txLoading, setTxLoading] = useState(false)
  const [filterType, setFilterType] = useState("all")
  const [filterCategory, setFilterCategory] = useState("all")
  const [page, setPage] = useState(1)

  // ── dialog state ─────────────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Transaction | null>(null)
  const [form, setForm] = useState({
    amount: "",
    category: "식비",
    description: "",
    date: new Date().toISOString().slice(0, 10),
    type: "expense" as "expense" | "income",
  })
  const [saving, setSaving] = useState(false)

  // ── fetch summary ─────────────────────────────────────────────────────────
  const fetchSummary = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/finance/summary?year=${year}&month=${month}`
      )
      if (res.ok) setSummary(await res.json())
    } finally {
      setLoading(false)
    }
  }, [year, month])

  // ── fetch transactions ─────────────────────────────────────────────────────
  const fetchTx = useCallback(async () => {
    setTxLoading(true)
    try {
      const params = new URLSearchParams({
        year: String(year),
        month: String(month),
        page: String(page),
        limit: "20",
      })
      if (filterType !== "all") params.set("type", filterType)
      if (filterCategory !== "all") params.set("category", filterCategory)

      const res = await fetch(`/api/finance/transactions?${params}`)
      if (res.ok) setTxList(await res.json())
    } finally {
      setTxLoading(false)
    }
  }, [year, month, page, filterType, filterCategory])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  useEffect(() => {
    fetchTx()
  }, [fetchTx])

  // ── month navigation ──────────────────────────────────────────────────────
  const prevMonth = () => {
    if (month === 1) {
      setYear((y) => y - 1)
      setMonth(12)
    } else {
      setMonth((m) => m - 1)
    }
    setPage(1)
  }
  const nextMonth = () => {
    if (month === 12) {
      setYear((y) => y + 1)
      setMonth(1)
    } else {
      setMonth((m) => m + 1)
    }
    setPage(1)
  }

  // ── dialog helpers ────────────────────────────────────────────────────────
  const openNew = () => {
    setEditTarget(null)
    setForm({
      amount: "",
      category: "식비",
      description: "",
      date: new Date().toISOString().slice(0, 10),
      type: "expense",
    })
    setDialogOpen(true)
  }

  const openEdit = (tx: Transaction) => {
    setEditTarget(tx)
    const isIncome = tx.amount > 0
    setForm({
      amount: String(Math.abs(tx.amount)),
      category: tx.category,
      description: tx.description,
      date: tx.created_at.slice(0, 10),
      type: isIncome ? "income" : "expense",
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    const rawAmount = parseInt(form.amount || "0", 10)
    const amount = form.type === "expense" ? -rawAmount : rawAmount

    setSaving(true)
    try {
      if (editTarget) {
        await fetch(`/api/finance/transactions/${editTarget.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount,
            category: form.category,
            description: form.description,
            created_at: form.date,
          }),
        })
      } else {
        await fetch("/api/finance/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount,
            category: form.category,
            description: form.description,
            created_at: form.date,
          }),
        })
      }
      setDialogOpen(false)
      await Promise.all([fetchSummary(), fetchTx()])
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm(tc("delete") + "?")) return
    await fetch(`/api/finance/transactions/${id}`, { method: "DELETE" })
    await Promise.all([fetchSummary(), fetchTx()])
  }

  // ── derived ───────────────────────────────────────────────────────────────
  const totalPages = Math.ceil(txList.total / txList.limit)

  const chartData =
    summary?.monthly_chart.map((p) => ({
      ...p,
      label: p.month.slice(5),
    })) ?? []

  const pieData = summary?.category_breakdown ?? []

  const monthLabel = `${year}년 ${month}월`

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Wallet className="size-6 text-primary" />
            {t("title")}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevMonth}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm font-medium w-20 text-center">{monthLabel}</span>
          <Button variant="outline" size="icon" onClick={nextMonth}>
            <ChevronRight className="size-4" />
          </Button>
          <Button className="gap-2 ml-2" onClick={openNew}>
            <Plus className="size-4" />
            {t("addRecord")}
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl border bg-card p-5 h-24 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label={t("thisMonthIncome")}
            value={KRW(summary?.income ?? 0)}
            icon={TrendingUp}
            color="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
          />
          <StatCard
            label={t("thisMonthExpense")}
            value={KRW(summary?.expense ?? 0)}
            icon={TrendingDown}
            color="bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400"
          />
          <StatCard
            label={t("net")}
            value={KRW(summary?.net ?? 0)}
            sub={(summary?.net ?? 0) >= 0 ? t("surplus") : t("deficit")}
            icon={Wallet}
            color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
          />
          <StatCard
            label={t("savingsRate")}
            value={`${(summary?.savings_rate ?? 0).toFixed(1)}%`}
            sub={t("netOverIncome")}
            icon={PiggyBank}
            color="bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400"
          />
        </div>
      )}

      {/* Charts row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Monthly bar chart */}
        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm font-medium mb-4">{t("monthlyChart")}</p>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                barGap={2}
                margin={{ left: -10, right: 8 }}
              >
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`}
                  width={40}
                />
                <Tooltip
                  formatter={(v: number) => KRW(v)}
                  labelStyle={{ fontSize: 12 }}
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                  }}
                />
                <Bar
                  dataKey="income"
                  name={t("income")}
                  fill="#22c55e"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                />
                <Bar
                  dataKey="expense"
                  name={t("expense")}
                  fill="#f97316"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Category pie chart */}
        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm font-medium mb-4">{t("categoryChart")}</p>
          {pieData.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
              {t("noExpense")}
            </div>
          ) : (
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="amount"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                  >
                    {pieData.map((entry) => (
                      <Cell
                        key={entry.category}
                        fill={CATEGORY_COLORS[entry.category] ?? "#6b7280"}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => KRW(v)}
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                    }}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Transactions */}
      <div className="rounded-xl border bg-card">
        {/* Filters bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <p className="text-sm font-medium mr-auto">{t("transactions")}</p>
          <Select
            value={filterType}
            onValueChange={(v) => {
              setFilterType(v)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-28 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("all")}</SelectItem>
              <SelectItem value="expense">{t("expense")}</SelectItem>
              <SelectItem value="income">{t("income")}</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filterCategory}
            onValueChange={(v) => {
              setFilterCategory(v)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-28 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allCategories")}</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {categoryLabel(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead className="w-24">{t("date")}</TableHead>
              <TableHead>{t("description")}</TableHead>
              <TableHead className="w-24">{t("category")}</TableHead>
              <TableHead className="text-right w-36">{t("amount")}</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {txLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10">
                  <Loader2 className="size-5 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : txList.transactions.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center py-12 text-muted-foreground text-sm"
                >
                  {t("noTransactions")}
                </TableCell>
              </TableRow>
            ) : (
              txList.transactions.map((tx) => (
                <TableRow key={tx.id} className="group">
                  <TableCell className="text-muted-foreground text-sm">
                    {tx.created_at.slice(0, 10)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {tx.description || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className="text-xs font-normal"
                      style={{
                        backgroundColor:
                          (CATEGORY_COLORS[tx.category] ?? "#6b7280") + "22",
                        color: CATEGORY_COLORS[tx.category] ?? "#6b7280",
                        borderColor:
                          (CATEGORY_COLORS[tx.category] ?? "#6b7280") + "44",
                      }}
                    >
                      {categoryLabel(tx.category)}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-medium tabular-nums text-sm",
                      tx.amount > 0 ? "text-emerald-600 dark:text-emerald-400" : ""
                    )}
                  >
                    {tx.amount > 0 ? "+" : ""}
                    {KRW(tx.amount)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => openEdit(tx)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(tx.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
            <span>
              {t("total", { total: txList.total, page, totalPages })}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon"
                className="size-7"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-7"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? t("editTransaction") : t("addTransaction")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>{t("type")}</Label>
              <RadioGroup
                value={form.type}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, type: v as "expense" | "income" }))
                }
                className="flex gap-4"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="expense" id="dlg-expense" />
                  <Label htmlFor="dlg-expense" className="font-normal cursor-pointer">
                    {t("expense")}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="income" id="dlg-income" />
                  <Label htmlFor="dlg-income" className="font-normal cursor-pointer">
                    {t("income")}
                  </Label>
                </div>
              </RadioGroup>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dlg-amount">{t("amountWon")}</Label>
              <Input
                id="dlg-amount"
                type="number"
                placeholder="12000"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dlg-category">{t("category")}</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
              >
                <SelectTrigger id="dlg-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {categoryLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dlg-desc">{t("memo")}</Label>
              <Input
                id="dlg-desc"
                placeholder=""
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dlg-date">{t("date")}</Label>
              <Input
                id="dlg-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                {tc("cancel")}
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="size-3.5 animate-spin mr-1.5" />}
                {tc("save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
