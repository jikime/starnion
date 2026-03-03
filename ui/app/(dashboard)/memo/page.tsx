"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Search, Edit, Trash2, Brain, StickyNote } from "lucide-react"
import { cn } from "@/lib/utils"

const tags = ["전체", "업무", "개인", "쇼핑", "아이디어"]

const memos = [
  {
    id: 1,
    title: "쇼핑 목록",
    content: "• 우유\n• 계란 2판\n• 두부",
    tag: "쇼핑",
    date: "2026-03-03",
  },
  {
    id: 2,
    title: "회의 메모",
    content: "3월 미팅\n주제: 스프린트\n결정사항: ...",
    tag: "업무",
    date: "2026-03-02",
  },
  {
    id: 3,
    title: "아이디어",
    content: "앱 아이디어...\n새로운 기능 구상",
    tag: "아이디어",
    date: "2026-03-01",
  },
]

const aiMemories = [
  {
    id: 1,
    title: "패턴 인사이트",
    content: "매주 금요일 외식 지출이 높고, 커피 지출 증가 추세",
    date: "2026-03-02",
  },
  {
    id: 2,
    title: "대화 분석",
    content: "스트레스 지수 증가, 수면 패턴 불규칙",
    date: "2026-03-01",
  },
]

export default function MemoPage() {
  const [selectedTag, setSelectedTag] = useState("전체")
  const [searchQuery, setSearchQuery] = useState("")

  const filteredMemos = memos.filter(
    (memo) =>
      (selectedTag === "전체" || memo.tag === selectedTag) &&
      (searchQuery === "" ||
        memo.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        memo.content.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">기억 & 메모</h1>
          <p className="text-muted-foreground">메모, AI 기억, 통합 검색</p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Tabs defaultValue="memos" className="space-y-6">
        <TabsList>
          <TabsTrigger value="memos">
            <StickyNote className="mr-2 size-4" />
            메모
          </TabsTrigger>
          <TabsTrigger value="aiMemory">
            <Brain className="mr-2 size-4" />
            AI 기억 (지식베이스)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="memos" className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              {tags.map((tag) => (
                <Button
                  key={tag}
                  variant={selectedTag === tag ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedTag(tag)}
                >
                  {tag}
                </Button>
              ))}
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="size-4" />
                  메모 추가
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>새 메모</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="memoTitle">제목</Label>
                    <Input id="memoTitle" placeholder="메모 제목" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="memoContent">내용</Label>
                    <Textarea
                      id="memoContent"
                      placeholder="메모 내용..."
                      className="min-h-[120px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>태그</Label>
                    <div className="flex gap-2">
                      {tags.slice(1).map((tag) => (
                        <Button key={tag} variant="outline" size="sm">
                          {tag}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button variant="outline">취소</Button>
                    <Button>저장</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredMemos.map((memo) => (
              <Card key={memo.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <StickyNote className="size-4 text-primary" />
                      <CardTitle className="text-base">{memo.title}</CardTitle>
                    </div>
                    <Badge variant="secondary">{memo.tag}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <pre className="whitespace-pre-wrap text-sm text-muted-foreground mb-4">
                    {memo.content}
                  </pre>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {memo.date}
                    </span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm">
                        <Edit className="size-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="aiMemory" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="size-5" />
                AI 기억
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {aiMemories.map((memory) => (
                <div
                  key={memory.id}
                  className="rounded-lg border border-border p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">{memory.title}</h4>
                    <span className="text-xs text-muted-foreground">
                      {memory.date}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {memory.content}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
