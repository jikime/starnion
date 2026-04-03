"use client"

import { useTranslations } from "next-intl"
import { Wallet, CreditCard, Target, StickyNote, TrendingUp, TrendingDown } from "lucide-react"

export function DashboardStats() {
  const t = useTranslations("dashboard")

  const stats = [
    {
      title: t("statsThisMonthExpense"),
      value: "₩234,500",
      description: t("statsExpenseDesc"),
      icon: Wallet,
      trend: "up",
    },
    {
      title: t("statsBudgetBalance"),
      value: "₩265,500",
      description: t("statsBudgetUsed"),
      icon: CreditCard,
      trend: "down",
    },
    {
      title: t("statsActiveGoals"),
      value: t("statsActiveGoalsValue"),
      description: t("statsGoalsInProgress"),
      icon: Target,
      trend: "neutral",
    },
    {
      title: t("statsMemo"),
      value: t("statsMemoValue"),
      description: t("statsRecentDays"),
      icon: StickyNote,
      trend: "neutral",
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.title} className="bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6">
          <div className="flex flex-row items-center justify-between gap-2 px-6 pb-2">
            <div className="leading-none text-sm font-medium text-muted-foreground">
              {stat.title}
            </div>
            <stat.icon className="size-4 text-muted-foreground" />
          </div>
          <div className="px-6">
            <div className="text-2xl font-bold">{stat.value}</div>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              {stat.trend === "up" && (
                <TrendingUp className="size-3 text-destructive" />
              )}
              {stat.trend === "down" && (
                <TrendingDown className="size-3 text-emerald-500" />
              )}
              {stat.description}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
