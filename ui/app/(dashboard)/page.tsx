"use client"

import { useTranslations, useLocale } from "next-intl"
import { DashboardStats } from "@/components/dashboard/stats-cards"
import { CategoryChart } from "@/components/dashboard/category-chart"
import { RecentAlerts } from "@/components/dashboard/recent-alerts"
import { GoalsProgress } from "@/components/dashboard/goals-progress"

export default function DashboardPage() {
  const t = useTranslations("dashboard")
  const locale = useLocale()

  const today = new Date().toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {t("greeting")}
          </h1>
          <p className="text-muted-foreground">{today}</p>
        </div>
      </div>

      <DashboardStats />

      <div className="grid gap-6 lg:grid-cols-2">
        <CategoryChart />
        <RecentAlerts />
      </div>

      <GoalsProgress />
    </div>
  )
}
