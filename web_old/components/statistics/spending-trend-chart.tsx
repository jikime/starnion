"use client"

import { useTranslations } from "next-intl"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

export function SpendingTrendChart() {
  const t = useTranslations("statistics")

  const data = [
    { month: t("jan"), amount: 320000 },
    { month: t("feb"), amount: 280000 },
    { month: t("mar"), amount: 234500 },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("monthlySpendingTrend")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <XAxis
                dataKey="month"
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
              <Line
                type="monotone"
                dataKey="amount"
                stroke="oklch(0.44 0.18 285)"
                strokeWidth={2}
                dot={{ fill: "oklch(0.44 0.18 285)", r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
