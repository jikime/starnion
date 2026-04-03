"use client"

import { useTranslations } from "next-intl"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
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
  const t = useTranslations("statistics")

  const timeSlots = [t("timeMorning"), t("timeAfternoon"), t("timeEvening")]

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("heatmapByTime")}</CardTitle>
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
                  title={`${t("spendingFreq")}: ${value}`}
                />
              ))}
            </div>
          ))}
          <div className="flex items-center justify-end gap-2 pt-2">
            <span className="text-xs text-muted-foreground">{t("less")}</span>
            <div className="flex gap-1">
              {[0, 2, 3, 4, 5].map((v) => (
                <div
                  key={v}
                  className={cn("size-4 rounded", getIntensityClass(v))}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">{t("more")}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
