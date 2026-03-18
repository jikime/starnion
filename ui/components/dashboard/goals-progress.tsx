import { Progress } from "@/components/ui/progress"
import { Target } from "lucide-react"

const goals = [
  {
    id: 1,
    title: "여행 자금 모으기",
    current: 800000,
    target: 1000000,
    unit: "원",
    progress: 80,
  },
  {
    id: 2,
    title: "운동 30일 챌린지",
    current: 12,
    target: 30,
    unit: "일",
    progress: 40,
  },
  {
    id: 3,
    title: "독서 월 4권",
    current: 1,
    target: 4,
    unit: "권",
    progress: 25,
  },
]

export function GoalsProgress() {
  return (
    <div className="bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6">
      <div className="px-6">
        <div className="leading-none font-semibold flex items-center gap-2">
          <Target className="size-5" />
          목표 진행률
        </div>
      </div>
      <div className="px-6 space-y-6">
        {goals.map((goal) => (
          <div key={goal.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{goal.title}</span>
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
