"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Plus, MessageCircle } from "lucide-react"

const conversations = [
  {
    id: 1,
    date: "오늘 3월 3일",
    messages: [
      "오늘 점심 만원",
      "이번달 예산 어때?",
    ],
  },
  {
    id: 2,
    date: "3월 2일",
    messages: ["내일 일정 잡아줘"],
  },
  {
    id: 3,
    date: "3월 1일",
    messages: ["주간 리포트 보내줘"],
  },
]

export function ChatSidebar() {
  return (
    <div className="w-64 border-r border-border bg-muted/30">
      <div className="p-4">
        <Button className="w-full gap-2" size="sm">
          <Plus className="size-4" />
          새 대화
        </Button>
      </div>
      
      <ScrollArea className="h-[calc(100vh-10rem)]">
        <div className="space-y-4 px-3 pb-4">
          {conversations.map((conv) => (
            <div key={conv.id}>
              <div className="mb-2 px-2 text-xs font-medium text-muted-foreground">
                {conv.date}
              </div>
              {conv.messages.map((msg, idx) => (
                <button
                  key={idx}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-sm",
                    "hover:bg-accent transition-colors",
                    idx === 0 && conv.id === 1 && "bg-accent"
                  )}
                >
                  <MessageCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="line-clamp-1">{msg}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
