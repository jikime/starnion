"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts"

const data = [
  { name: "식비", value: 105525, percent: 45 },
  { name: "교통", value: 42210, percent: 18 },
  { name: "쇼핑", value: 51590, percent: 22 },
  { name: "기타", value: 35175, percent: 15 },
]

const COLORS = [
  "#f97316", // 식비 — orange
  "#3b6de0", // 교통 — brand primary blue
  "#a855f7", // 쇼핑 — violet
  "#6b7280", // 기타 — gray
]

export function CategoryChart() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          이번달 카테고리별 지출
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
              >
                {data.map((_, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={COLORS[index % COLORS.length]} 
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) =>
                  new Intl.NumberFormat("ko-KR", {
                    style: "currency",
                    currency: "KRW",
                  }).format(value)
                }
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 space-y-2">
          {data.map((item, index) => (
            <div key={item.name} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div 
                  className="size-3 rounded-full" 
                  style={{ backgroundColor: COLORS[index] }} 
                />
                <span>{item.name}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-muted-foreground">{item.percent}%</span>
                <span className="font-medium">
                  {new Intl.NumberFormat("ko-KR", {
                    style: "currency",
                    currency: "KRW",
                  }).format(item.value)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
