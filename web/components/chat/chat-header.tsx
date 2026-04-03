"use client"

import { Button } from "@/components/ui/button"
import { MessageCircle, WifiOff, Loader2, PanelLeft, Menu } from "lucide-react"

interface ChatHeaderProps {
  sidebarOpen: boolean
  onToggleSidebar: () => void
  isStreaming: boolean
  connState: string
}

export function ChatHeader({
  sidebarOpen,
  onToggleSidebar,
  isStreaming,
  connState,
}: ChatHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-border px-3 py-2.5 md:px-4 md:py-3">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          title={sidebarOpen ? "대화 목록 숨기기" : "대화 목록 보기"}
          className="hidden md:inline-flex"
        >
          <PanelLeft className="size-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          title="대화 목록"
          className="md:hidden"
        >
          <Menu className="size-5" />
        </Button>
        <h1 className="flex items-center gap-2 text-base font-semibold md:text-lg">
          <MessageCircle className="size-4 text-primary md:size-5" />
          채팅
        </h1>
        {isStreaming && (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        )}
        {connState === "error" && (
          <WifiOff className="size-4 text-destructive" />
        )}
      </div>

      {connState === "error" && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-border bg-secondary text-secondary-foreground">
          <WifiOff className="size-3" />
          연결 오류
        </span>
      )}
    </div>
  )
}
