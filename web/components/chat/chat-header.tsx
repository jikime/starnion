"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { MessageCircle, WifiOff, Loader2, PanelLeft, Menu, Radio } from "lucide-react"
import { ChannelsView } from "@/components/channels-view"

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
  const [channelsOpen, setChannelsOpen] = useState(false)

  return (
    <>
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

        <div className="flex items-center gap-2">
          {connState === "error" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-border bg-secondary text-secondary-foreground">
              <WifiOff className="size-3" />
              연결 오류
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setChannelsOpen(true)}
          >
            <Radio className="size-3.5" />
            채널
          </Button>
        </div>
      </div>

      <Sheet open={channelsOpen} onOpenChange={setChannelsOpen}>
        <SheetContent side="right" className="w-full sm:w-[480px] sm:max-w-lg p-0 overflow-y-auto">
          <SheetHeader className="px-6 py-4 border-b border-border">
            <SheetTitle className="flex items-center gap-2">
              <Radio className="size-5 text-primary" />
              채널 관리
            </SheetTitle>
            <SheetDescription className="sr-only">외부 메시징 채널 설정</SheetDescription>
          </SheetHeader>
          <ChannelsView />
        </SheetContent>
      </Sheet>
    </>
  )
}
