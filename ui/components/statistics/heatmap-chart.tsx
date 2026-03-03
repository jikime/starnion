"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const timeSlots = ["오전", "오후", "저녁"]
const hours = ["6-9", "9-12", "12-15", "15-18", "18-21", "21-24"]

const heatmapData = [
  [1, 2, 3, 2, 1, 0],
  [2, 3, 5, 4, 3, 1],
  [3, 2, 2, 3, 5, 2],
]

function getIntensityClass(value: number) {
  if (value === 0) return "bg-muted"
  if (value <= 2) return "bg-primary/20"
  if (value <= 3) return "bg-primary/40"
  if (value <= 4) return "bg-primary/60"
  return "bg-primary/80"
}

export function HeatmapChart() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>시간대별 지출 히트맵</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center gap-2 pl-12">
            {hours.map((hour) => (
              <div key={hour} className="flex-1 text-center text-xs text-muted-foreground">
                {hour}
              </div>
            ))}
          </div>
          {timeSlots.map((slot, rowIdx) => (
            <div key={slot} className="flex items-center gap-2">
              <span className="w-10 text-xs text-muted-foreground">{slot}</span>
              {heatmapData[rowIdx].map((value, colIdx) => (
                <div
                  key={colIdx}
                  className={cn(
                    "flex-1 h-8 rounded",
                    getIntensityClass(value)
                  )}
                  title={`지출 빈도: ${value}`}
                />
              ))}
            </div>
          ))}
          <div className="flex items-center justify-end gap-2 pt-2">
            <span className="text-xs text-muted-foreground">낮음</span>
            <div className="flex gap-1">
              {[0, 2, 3, 4, 5].map((v) => (
                <div
                  key={v}
                  className={cn("size-4 rounded", getIntensityClass(v))}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">높음</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
