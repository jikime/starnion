"use client"

import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Bot, User } from "lucide-react"
import { cn } from "@/lib/utils"

interface Message {
  id: number
  role: "assistant" | "user"
  content: string
  timestamp: string
  tool?: string
}

const messages: Message[] = [
  {
    id: 1,
    role: "assistant",
    content: "안녕하세요! 무엇을 도와드릴까요?",
    timestamp: "09:00",
  },
  {
    id: 2,
    role: "user",
    content: "오늘 점심 12,000원",
    timestamp: "09:15",
  },
  {
    id: 3,
    role: "assistant",
    content: "식비 ₩12,000 기록했어요!\n이번달 식비: ₩87,000 (예산 대비 58%)",
    timestamp: "09:15",
    tool: "save_finance",
  },
]

export function ChatMessages() {
  return (
    <ScrollArea className="flex-1 p-4">
      <div className="mx-auto max-w-2xl space-y-6">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex gap-3",
              message.role === "user" && "flex-row-reverse"
            )}
          >
            <Avatar className="size-8 shrink-0">
              <AvatarFallback
                className={cn(
                  message.role === "assistant"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
              >
                {message.role === "assistant" ? (
                  <Bot className="size-4" />
                ) : (
                  <User className="size-4" />
                )}
              </AvatarFallback>
            </Avatar>
            
            <div
              className={cn(
                "max-w-[80%] space-y-1",
                message.role === "user" && "items-end"
              )}
            >
              <div
                className={cn(
                  "rounded-2xl px-4 py-2.5",
                  message.role === "assistant"
                    ? "bg-muted/50 rounded-tl-sm"
                    : "bg-primary text-primary-foreground rounded-tr-sm"
                )}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              </div>
              
              <div
                className={cn(
                  "flex items-center gap-2",
                  message.role === "user" && "flex-row-reverse"
                )}
              >
                <span className="text-xs text-muted-foreground">
                  {message.timestamp}
                </span>
                {message.tool && (
                  <Badge variant="outline" className="text-xs">
                    {message.tool}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}
