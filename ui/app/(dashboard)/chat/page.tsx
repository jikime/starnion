"use client"

import { useRef, useState, useEffect } from "react"
import { ChatSidebar, type Conversation } from "@/components/chat/chat-sidebar"
import { ChatMessages } from "@/components/chat/chat-messages"
import { ChatInput } from "@/components/chat/chat-input"
import { useChat } from "@/hooks/use-chat"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PanelLeftClose, PanelLeft, Wifi, WifiOff, Loader2 } from "lucide-react"

const PERSONAS = [
  { id: "assistant", name: "기본 비서" },
  { id: "finance",   name: "금융 전문가" },
  { id: "buddy",     name: "친한 친구" },
  { id: "coach",     name: "재정 코치" },
  { id: "analyst",   name: "데이터 분석가" },
]

export default function ChatPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [persona, setPersona] = useState("assistant")

  // Load saved persona from DB on mount.
  useEffect(() => {
    fetch("/api/profile/persona")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.persona) setPersona(data.persona) })
      .catch(() => {})
  }, [])

  const handlePersonaChange = (value: string) => {
    setPersona(value)
    fetch("/api/profile/persona", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona: value }),
    }).catch(() => {})
  }
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [isReadonly, setIsReadonly] = useState(false)
  // Tracks whether the first message in the current thread has been sent (for auto-title).
  const firstMsgSent = useRef(false)
  // Callback ref so sidebar can update its title list from the parent.
  const updateTitleRef = useRef<((id: string, title: string) => void) | null>(null)

  const { messages, sendMessage, connState, isConnected, isStreaming, historyLoading, hasMore, loadingMore, loadMore } = useChat(activeThreadId)

  const handleSend = (text: string) => {
    sendMessage(text)

    // Auto-title from the first user message in this thread.
    if (activeThreadId && !firstMsgSent.current) {
      firstMsgSent.current = true
      const title = text.slice(0, 40)
      fetch(`/api/conversations/${activeThreadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      })
        .then((r) => {
          if (r.ok && updateTitleRef.current) {
            updateTitleRef.current(activeThreadId, title)
          }
        })
        .catch(() => {})
    }
  }

  const handleNewConversation = (conv: Conversation) => {
    firstMsgSent.current = false
    setActiveThreadId(conv.id)
    setIsReadonly(false)
  }

  const handleSelectThread = (id: string, platform: string) => {
    firstMsgSent.current = true // Existing thread — title already set.
    setActiveThreadId(id)
    setIsReadonly(platform !== "web")
  }

  // Auto-select the most recent web conversation after sidebar loads.
  const handleSidebarLoad = (convs: Conversation[]) => {
    const firstWeb = convs.find((c) => c.platform === "web")
    if (firstWeb) handleSelectThread(firstWeb.id, firstWeb.platform)
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {sidebarOpen && (
        <ChatSidebar
          activeThreadId={activeThreadId}
          onSelectThread={handleSelectThread}
          onNewConversation={handleNewConversation}
          onUpdateTitle={(fn) => { updateTitleRef.current = fn }}
          onLoad={handleSidebarLoad}
        />
      )}

      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? (
                <PanelLeftClose className="size-5" />
              ) : (
                <PanelLeft className="size-5" />
              )}
            </Button>
            <h1 className="text-lg font-semibold">웹챗</h1>
            {connState === "connecting" && (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            )}
            {connState === "error" && (
              <WifiOff className="size-4 text-destructive" />
            )}
          </div>

          <Badge
            variant={isConnected ? "default" : "secondary"}
            className="gap-1"
          >
            {isConnected ? (
              <Wifi className="size-3" />
            ) : (
              <WifiOff className="size-3" />
            )}
            {isConnected
              ? "연결됨"
              : connState === "connecting"
              ? "연결중..."
              : "연결 끊김"}
          </Badge>
        </div>

        <ChatMessages
            messages={messages}
            historyLoading={historyLoading}
            loadingMore={loadingMore}
            hasMore={hasMore}
            onLoadMore={loadMore}
          />
        <ChatInput
          onSend={handleSend}
          disabled={!isConnected || isStreaming || activeThreadId === null || isReadonly}
          placeholder={
            isReadonly
              ? "읽기 전용 대화입니다"
              : activeThreadId === null
              ? "새 대화를 시작하거나 왼쪽에서 대화를 선택하세요"
              : undefined
          }
          persona={persona}
          personas={PERSONAS}
          onPersonaChange={handlePersonaChange}
        />
      </div>
    </div>
  )
}
