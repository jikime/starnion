"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"

const data = [
  { name: "식비", value: 45 },
  { name: "교통", value: 18 },
  { name: "쇼핑", value: 22 },
  { name: "기타", value: 15 },
]

const COLORS = [
  "oklch(0.44 0.18 285)",
  "oklch(0.55 0.15 285)",
  "oklch(0.65 0.12 285)",
  "oklch(0.75 0.08 285)",
]

export function CategoryPieChart() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>카테고리 분포</CardTitle>
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
                label={({ name, value }) => `${name} ${value}%`}
              >
                {data.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip formatter={(value) => `${value}%`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
