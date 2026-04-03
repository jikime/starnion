"use client"

import { useTranslations } from "next-intl"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

export function WeekdayChart() {
  const t = useTranslations("statistics")

  const data = [
    { day: t("weekdays.mon"), amount: 12000 },
    { day: t("weekdays.tue"), amount: 8000 },
    { day: t("weekdays.wed"), amount: 15000 },
    { day: t("weekdays.thu"), amount: 9000 },
    { day: t("weekdays.fri"), amount: 45000 },
    { day: t("weekdays.sat"), amount: 32000 },
    { day: t("weekdays.sun"), amount: 18000 },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("avgWeekdaySpending")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => `₩${(value / 1000).toFixed(0)}K`}
              />
              <Tooltip
                formatter={(value: number) =>
                  new Intl.NumberFormat("ko-KR", {
                    style: "currency",
                    currency: "KRW",
                  }).format(value)
                }
              />
              <Bar
                dataKey="amount"
                fill="oklch(0.44 0.18 285)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
