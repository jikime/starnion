import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Bell, AlertCircle, CheckCircle, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"

const alerts = [
  {
    id: 1,
    message: "예산 72% 도달",
    time: "2시간 전",
    type: "warning",
    icon: AlertCircle,
  },
  {
    id: 2,
    message: "주간 리포트 생성됨",
    time: "4시간 전",
    type: "info",
    icon: Bell,
  },
  {
    id: 3,
    message: '목표 "운동" 7일 달성',
    time: "어제",
    type: "success",
    icon: CheckCircle,
  },
  {
    id: 4,
    message: "커피 지출 패턴 감지",
    time: "어제",
    type: "insight",
    icon: TrendingUp,
  },
]

export function RecentAlerts() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="size-5" />
          최근 알림
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="flex items-start gap-3 rounded-lg border border-border p-3"
            >
              <div
                className={cn(
                  "mt-0.5 rounded-full p-1.5",
                  alert.type === "warning" && "bg-warning/10 text-warning",
                  alert.type === "info" && "bg-primary/10 text-primary",
                  alert.type === "success" && "bg-success/10 text-success",
                  alert.type === "insight" && "bg-accent text-accent-foreground"
                )}
              >
                <alert.icon className="size-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{alert.message}</p>
                <p className="text-xs text-muted-foreground">{alert.time}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
