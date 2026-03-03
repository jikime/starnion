"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Settings, AlertTriangle, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

const budgets = [
  { category: "식비", spent: 105525, budget: 150000, percent: 70 },
  { category: "교통", spent: 21500, budget: 80000, percent: 27 },
  { category: "쇼핑", spent: 51590, budget: 100000, percent: 52 },
  { category: "구독", spent: 17000, budget: 50000, percent: 34 },
  { category: "의료", spent: 0, budget: 80000, percent: 0 },
  { category: "기타", spent: 38885, budget: 40000, percent: 97 },
]

const totalBudget = 500000
const totalSpent = 234500
const totalRemaining = totalBudget - totalSpent
const totalPercent = Math.round((totalSpent / totalBudget) * 100)

function getStatusColor(percent: number) {
  if (percent >= 90) return "destructive"
  if (percent >= 70) return "warning"
  return "primary"
}

function getStatusLabel(percent: number) {
  if (percent >= 90) return { icon: AlertTriangle, text: "위험", color: "text-destructive" }
  if (percent >= 70) return { icon: AlertCircle, text: "주의", color: "text-warning" }
  return null
}

export default function BudgetPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">예산 관리</h1>
          <p className="text-muted-foreground">2026년 3월</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Settings className="size-4" />
              예산 설정
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>예산 설정</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {budgets.map((item) => (
                <div key={item.category} className="flex items-center gap-4">
                  <Label className="w-16">{item.category}</Label>
                  <Input
                    type="number"
                    defaultValue={item.budget}
                    className="flex-1"
                  />
                </div>
              ))}
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline">취소</Button>
                <Button>저장</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">총 예산</p>
                <p className="text-2xl font-bold">
                  {new Intl.NumberFormat("ko-KR", {
                    style: "currency",
                    currency: "KRW",
                  }).format(totalBudget)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">사용</p>
                <p className="text-lg font-semibold">
                  {new Intl.NumberFormat("ko-KR", {
                    style: "currency",
                    currency: "KRW",
                  }).format(totalSpent)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">잔액</p>
                <p className="text-lg font-semibold text-success">
                  {new Intl.NumberFormat("ko-KR", {
                    style: "currency",
                    currency: "KRW",
                  }).format(totalRemaining)}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Progress value={totalPercent} className="h-3" />
              <p className="text-sm text-muted-foreground text-right">
                {totalPercent}% 사용
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>카테고리별 예산</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {budgets.map((item) => {
            const status = getStatusLabel(item.percent)
            const statusColor = getStatusColor(item.percent)
            
            return (
              <div key={item.category} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{item.category}</span>
                    {status && (
                      <span className={cn("flex items-center gap-1 text-xs", status.color)}>
                        <status.icon className="size-3" />
                        {status.text}
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {item.percent}%
                  </span>
                </div>
                <Progress
                  value={item.percent}
                  className={cn(
                    "h-2",
                    statusColor === "warning" && "[&>div]:bg-warning",
                    statusColor === "destructive" && "[&>div]:bg-destructive"
                  )}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {new Intl.NumberFormat("ko-KR", {
                      style: "currency",
                      currency: "KRW",
                    }).format(item.spent)}
                  </span>
                  <span>
                    {new Intl.NumberFormat("ko-KR", {
                      style: "currency",
                      currency: "KRW",
                    }).format(item.budget)}
                  </span>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>예산 경고 알림 설정</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Label className="w-24">경고 임계값</Label>
            <Input type="number" defaultValue={70} className="w-20" />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
          <div className="flex items-center gap-4">
            <Label className="w-24">위험 임계값</Label>
            <Input type="number" defaultValue={90} className="w-20" />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
          <div className="space-y-3 pt-2">
            <Label>알림 채널</Label>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Checkbox id="telegram" defaultChecked />
                <Label htmlFor="telegram" className="font-normal">
                  Telegram
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="web" defaultChecked />
                <Label htmlFor="web" className="font-normal">
                  웹 알림
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="email" />
                <Label htmlFor="email" className="font-normal">
                  이메일
                </Label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
