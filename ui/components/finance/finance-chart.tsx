"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

const data = [
  { date: "3/1", amount: 52000 },
  { date: "3/2", amount: 35000 },
  { date: "3/3", amount: 13500 },
  { date: "3/4", amount: 0 },
  { date: "3/5", amount: 0 },
]

export function FinanceChart() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">일별 지출 트렌드</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12 }}
                tickFormatter={(value) =>
                  `₩${(value / 1000).toFixed(0)}K`
                }
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
