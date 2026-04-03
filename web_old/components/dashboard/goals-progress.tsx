"use client"

import { useTranslations } from "next-intl"
import { Progress } from "@/components/ui/progress"
import { Target } from "lucide-react"

const goals = [
  {
    id: 1,
    titleKey: "goalTravel",
    current: 800000,
    target: 1000000,
    unit: "원",
    progress: 80,
  },
  {
    id: 2,
    titleKey: "goalExercise",
    current: 12,
    target: 30,
    unit: "일",
    progress: 40,
  },
  {
    id: 3,
    titleKey: "goalReading",
    current: 1,
    target: 4,
    unit: "권",
    progress: 25,
  },
]

export function GoalsProgress() {
  const t = useTranslations("dashboard")

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6">
      <div className="px-6">
        <div className="leading-none font-semibold flex items-center gap-2">
          <Target className="size-5" />
          {t("goalsProgress")}
        </div>
      </div>
      <div className="px-6 space-y-6">
        {goals.map((goal) => (
          <div key={goal.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t(goal.titleKey as Parameters<typeof t>[0])}</span>
              <span className="text-sm text-muted-foreground">
                {goal.progress}%
              </span>
            </div>
            <Progress value={goal.progress} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {goal.unit === "원"
                  ? new Intl.NumberFormat("ko-KR", {
                      style: "currency",
                      currency: "KRW",
                    }).format(goal.current)
                  : `${goal.current}${goal.unit}`}
              </span>
              <span>
                {goal.unit === "원"
                  ? new Intl.NumberFormat("ko-KR", {
                      style: "currency",
                      currency: "KRW",
                    }).format(goal.target)
                  : `${goal.target}${goal.unit}`}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
