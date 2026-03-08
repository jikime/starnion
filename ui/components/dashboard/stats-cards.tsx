import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Wallet, CreditCard, Target, StickyNote, TrendingUp, TrendingDown } from "lucide-react"

const stats = [
  {
    title: "이번달 지출",
    value: "₩234,500",
    description: "전월 대비 +12%",
    icon: Wallet,
    trend: "up",
  },
  {
    title: "예산 잔액",
    value: "₩265,500",
    description: "72% 사용",
    icon: CreditCard,
    trend: "down",
  },
  {
    title: "활성 목표",
    value: "3개",
    description: "2개 진행중",
    icon: Target,
    trend: "neutral",
  },
  {
    title: "메모",
    value: "12개",
    description: "최근 7일",
    icon: StickyNote,
    trend: "neutral",
  },
]

export function DashboardStats() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {stat.title}
            </CardTitle>
            <stat.icon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              {stat.trend === "up" && (
                <TrendingUp className="size-3 text-destructive" />
              )}
              {stat.trend === "down" && (
                <TrendingDown className="size-3 text-emerald-500" />
              )}
              {stat.description}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
