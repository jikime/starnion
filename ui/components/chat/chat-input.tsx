"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Paperclip, Mic, Send } from "lucide-react"

export function ChatInput() {
  const [message, setMessage] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return
    // TODO: Send message
    setMessage("")
  }

  return (
    <div className="border-t border-border bg-background p-4">
      <form onSubmit={handleSubmit} className="mx-auto max-w-2xl">
        <div className="flex items-end gap-2">
          <div className="flex gap-1">
            <Button type="button" variant="ghost" size="icon">
              <Paperclip className="size-5" />
              <span className="sr-only">파일 첨부</span>
            </Button>
            <Button type="button" variant="ghost" size="icon">
              <Mic className="size-5" />
              <span className="sr-only">음성 입력</span>
            </Button>
          </div>
          
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="메시지를 입력하세요..."
            className="min-h-[44px] max-h-32 resize-none"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e)
              }
            }}
          />
          
          <Button type="submit" size="icon" disabled={!message.trim()}>
            <Send className="size-5" />
            <span className="sr-only">전송</span>
          </Button>
        </div>
      </form>
    </div>
  )
}
