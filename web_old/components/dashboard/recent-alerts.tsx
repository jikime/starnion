"use client"

import { useTranslations } from "next-intl"
import { Bell, AlertCircle, CheckCircle, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"

export function RecentAlerts() {
  const t = useTranslations("dashboard")

  const alerts = [
    {
      id: 1,
      messageKey: "alertBudget72",
      timeKey: "alert2HoursAgo",
      type: "warning",
      icon: AlertCircle,
    },
    {
      id: 2,
      messageKey: "alertWeeklyReport",
      timeKey: "alert4HoursAgo",
      type: "info",
      icon: Bell,
    },
    {
      id: 3,
      messageKey: "alertGoalExercise",
      timeKey: "alertYesterday",
      type: "success",
      icon: CheckCircle,
    },
    {
      id: 4,
      messageKey: "alertCoffeePattern",
      timeKey: "alertYesterday",
      type: "insight",
      icon: TrendingUp,
    },
  ]

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6">
      <div className="px-6">
        <div className="leading-none font-semibold flex items-center gap-2">
          <Bell className="size-5" />
          {t("recentAlerts")}
        </div>
      </div>
      <div className="px-6">
        <div className="space-y-4">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="flex items-start gap-3 rounded-lg border border-border p-3"
            >
              <div
                className={cn(
                  "mt-0.5 rounded-full p-1.5",
                  alert.type === "warning" && "bg-amber-500/10 text-amber-500",
                  alert.type === "info" && "bg-primary/10 text-primary",
                  alert.type === "success" && "bg-emerald-500/10 text-emerald-500",
                  alert.type === "insight" && "bg-accent text-accent-foreground"
                )}
              >
                <alert.icon className="size-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{t(alert.messageKey as Parameters<typeof t>[0])}</p>
                <p className="text-xs text-muted-foreground">{t(alert.timeKey as Parameters<typeof t>[0])}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
