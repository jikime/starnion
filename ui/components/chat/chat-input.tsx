"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Mic, ArrowUp } from "lucide-react"

interface PersonaOption {
  id: string
  name: string
}

interface ChatInputProps {
  onSend: (text: string) => void
  disabled?: boolean
  placeholder?: string
  persona?: string
  personas?: PersonaOption[]
  onPersonaChange?: (value: string) => void
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder,
  persona,
  personas = [],
  onPersonaChange,
}: ChatInputProps) {
  const [message, setMessage] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim() || disabled) return
    onSend(message.trim())
    setMessage("")
  }

  return (
    <div className="bg-background px-4 pb-4 pt-2">
      <form onSubmit={handleSubmit} className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-border bg-background shadow-sm focus-within:border-ring transition-colors">
          {/* Textarea */}
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={placeholder ?? "메시지를 입력하세요. /를 입력하면 바로가기를 볼 수 있어요."}
            className="min-h-[64px] max-h-40 resize-none border-0 bg-transparent px-4 pt-4 pb-2 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm"
            rows={2}
            disabled={disabled}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e)
              }
            }}
          />

          {/* Bottom toolbar */}
          <div className="flex items-center justify-between px-3 pb-3">
            {/* Left: Attach */}
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={disabled}
              className="h-8 w-8 rounded-full border-border"
            >
              <Plus className="size-4" />
              <span className="sr-only">파일 첨부</span>
            </Button>

            {/* Right: Persona + Mic + Send */}
            <div className="flex items-center gap-1">
              {personas.length > 0 && onPersonaChange && (
                <Select value={persona} onValueChange={onPersonaChange} disabled={disabled}>
                  <SelectTrigger className="h-8 w-auto gap-1 border-0 bg-transparent px-2 text-sm text-muted-foreground shadow-none hover:bg-accent hover:text-foreground focus:ring-0 focus:ring-offset-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end">
                    {personas.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled}
                className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
              >
                <Mic className="size-4" />
                <span className="sr-only">음성 입력</span>
              </Button>

              <Button
                type="submit"
                size="icon"
                disabled={!message.trim() || disabled}
                className="h-8 w-8 rounded-full bg-foreground text-background hover:bg-foreground/80 disabled:bg-muted disabled:text-muted-foreground"
              >
                <ArrowUp className="size-4" />
                <span className="sr-only">전송</span>
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
