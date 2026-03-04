"use client"

import { useRef, useState, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { ChatSidebar, type Conversation } from "@/components/chat/chat-sidebar"
import { ChatMessages } from "@/components/chat/chat-messages"
import { ChatInput } from "@/components/chat/chat-input"
import { useChat } from "@/hooks/use-chat"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PanelLeftClose, PanelLeft, WifiOff, Loader2 } from "lucide-react"

const PERSONAS = [
  { id: "assistant", name: "기본 비서" },
  { id: "finance",   name: "금융 전문가" },
  { id: "buddy",     name: "친한 친구" },
  { id: "coach",     name: "재정 코치" },
  { id: "analyst",   name: "데이터 분석가" },
]

function ChatPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlId = searchParams.get("id")

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

  // Initialize from URL so page refresh / sidebar toggle preserves selection.
  const [activeThreadId, setActiveThreadId] = useState<string | null>(urlId)
  const [isReadonly, setIsReadonly] = useState(false)
  const firstMsgSent = useRef(false)
  const updateTitleRef = useRef<((id: string, title: string) => void) | null>(null)

  const { messages, sendMessage, connState, isConnected, isStreaming, historyLoading, hasMore, loadingMore, loadMore } = useChat(activeThreadId)

  // Keep URL in sync whenever the active thread changes.
  const selectThread = (id: string, platform: string) => {
    firstMsgSent.current = platform !== "web" // existing threads already have a title
    setActiveThreadId(id)
    setIsReadonly(platform !== "web")
    router.replace(`/chat?id=${id}`)
  }

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
    router.replace(`/chat?id=${conv.id}`)
  }

  const handleSelectThread = (id: string, platform: string) => {
    selectThread(id, platform)
  }

  // Auto-select only when there is no conversation in the URL yet.
  const handleSidebarLoad = (convs: Conversation[]) => {
    if (activeThreadId) return // already selected — don't override
    const firstWeb = convs.find((c) => c.platform === "web")
    if (firstWeb) selectThread(firstWeb.id, firstWeb.platform)
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
            {isStreaming && (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            )}
            {connState === "error" && (
              <WifiOff className="size-4 text-destructive" />
            )}
          </div>

          {connState === "error" && (
            <Badge variant="secondary" className="gap-1">
              <WifiOff className="size-3" />
              오류
            </Badge>
          )}
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

export default function ChatPage() {
  return (
    <Suspense>
      <ChatPageInner />
    </Suspense>
  )
}
