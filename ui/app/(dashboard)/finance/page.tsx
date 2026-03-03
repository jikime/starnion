"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Plus, Download, TrendingUp, TrendingDown } from "lucide-react"
import { FinanceChart } from "@/components/finance/finance-chart"
import { cn } from "@/lib/utils"

const categories = ["식비", "교통", "쇼핑", "구독", "의료", "기타"]

const transactions = [
  { id: 1, date: "2026-03-03", description: "점심", category: "식비", amount: -12000 },
  { id: 2, date: "2026-03-03", description: "버스", category: "교통", amount: -1500 },
  { id: 3, date: "2026-03-02", description: "마트", category: "식비", amount: -35000 },
  { id: 4, date: "2026-03-02", description: "넷플릭스", category: "구독", amount: -17000 },
  { id: 5, date: "2026-03-01", description: "월급", category: "수입", amount: 3000000 },
]

export default function FinancePage() {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [transactionType, setTransactionType] = useState("all")

  const totalExpense = transactions
    .filter((t) => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)
  
  const totalIncome = transactions
    .filter((t) => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">가계부</h1>
          <p className="text-muted-foreground">2026년 3월</p>
        </div>
        <div className="flex gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="size-4" />
                기록 추가
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>지출/수입 기록</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">금액</Label>
                  <Input id="amount" type="number" placeholder="12000" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">카테고리</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="카테고리 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="memo">메모</Label>
                  <Input id="memo" placeholder="점심 김치찌개" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date">날짜</Label>
                  <Input id="date" type="date" defaultValue="2026-03-03" />
                </div>
                <div className="space-y-2">
                  <Label>유형</Label>
                  <RadioGroup defaultValue="expense" className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="expense" id="expense" />
                      <Label htmlFor="expense">지출</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="income" id="income" />
                      <Label htmlFor="income">수입</Label>
                    </div>
                  </RadioGroup>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline">취소</Button>
                  <Button>저장</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Button variant="outline" className="gap-2">
            <Download className="size-4" />
            내보내기
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">필터</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>기간</Label>
              <Select defaultValue="this-month">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="this-month">이번달</SelectItem>
                  <SelectItem value="last-month">지난달</SelectItem>
                  <SelectItem value="3-months">최근 3개월</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>카테고리</Label>
              {categories.map((cat) => (
                <div key={cat} className="flex items-center gap-2">
                  <Checkbox
                    id={cat}
                    checked={selectedCategories.includes(cat)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedCategories([...selectedCategories, cat])
                      } else {
                        setSelectedCategories(
                          selectedCategories.filter((c) => c !== cat)
                        )
                      }
                    }}
                  />
                  <Label htmlFor={cat} className="font-normal">
                    {cat}
                  </Label>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <Label>유형</Label>
              <RadioGroup
                value={transactionType}
                onValueChange={setTransactionType}
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="all" id="all" />
                  <Label htmlFor="all" className="font-normal">
                    전체
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="expense" id="filter-expense" />
                  <Label htmlFor="filter-expense" className="font-normal">
                    지출
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="income" id="filter-income" />
                  <Label htmlFor="filter-income" className="font-normal">
                    수입
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead>내용</TableHead>
                    <TableHead>카테고리</TableHead>
                    <TableHead className="text-right">금액</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-muted-foreground">
                        {tx.date}
                      </TableCell>
                      <TableCell>{tx.description}</TableCell>
                      <TableCell>{tx.category}</TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-medium",
                          tx.amount > 0 ? "text-success" : "text-foreground"
                        )}
                      >
                        {tx.amount > 0 ? "+" : ""}
                        {new Intl.NumberFormat("ko-KR", {
                          style: "currency",
                          currency: "KRW",
                        }).format(tx.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-2">
              <TrendingDown className="size-4 text-destructive" />
              <span>지출: </span>
              <span className="font-medium">
                {new Intl.NumberFormat("ko-KR", {
                  style: "currency",
                  currency: "KRW",
                }).format(totalExpense)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-success" />
              <span>수입: </span>
              <span className="font-medium">
                {new Intl.NumberFormat("ko-KR", {
                  style: "currency",
                  currency: "KRW",
                }).format(totalIncome)}
              </span>
            </div>
          </div>

          <FinanceChart />
        </div>
      </div>
    </div>
  )
}
