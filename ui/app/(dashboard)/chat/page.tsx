"use client"

import { useRef, useState, useEffect, useCallback, useMemo, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { ChatSidebar, type Conversation } from "@/components/chat/chat-sidebar"
import { ChatMessages } from "@/components/chat/chat-messages"
import { ChatInput, type AttachedFile } from "@/components/chat/chat-input"
import { useChat } from "@/hooks/use-chat"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MessageCircle, PanelLeftClose, PanelLeft, WifiOff, Loader2 } from "lucide-react"

function ChatPageInner() {
  const t = useTranslations("chat")
  const personas = useMemo(() => [
    { id: "assistant",    name: t("personas.assistant") },
    { id: "finance",      name: t("personas.finance") },
    { id: "heart_friend", name: t("personas.heart_friend") },
    { id: "life_coach",   name: t("personas.life_coach") },
    { id: "analyst",      name: t("personas.analyst") },
  ], [t])
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

  const handlePersonaChange = useCallback((value: string) => {
    setPersona(value)
    fetch("/api/profile/persona", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona: value }),
    }).catch(() => {})
  }, [])

  // Initialize from URL so page refresh / sidebar toggle preserves selection.
  const [activeThreadId, setActiveThreadId] = useState<string | null>(urlId)
  const [isReadonly, setIsReadonly] = useState(false)
  const firstMsgSent = useRef(false)
  const updateTitleRef = useRef<((id: string, title: string) => void) | null>(null)

  const { messages, sendMessage, connState, isConnected, isStreaming, isThinking, historyLoading, hasMore, loadingMore, loadMore } = useChat(activeThreadId)

  // Keep URL in sync whenever the active thread changes.
  const selectThread = useCallback((id: string, platform: string) => {
    firstMsgSent.current = platform !== "web" // existing threads already have a title
    setActiveThreadId(id)
    setIsReadonly(platform !== "web")
    router.replace(`/chat?id=${id}`)
  }, [router])

  const handleSend = useCallback((text: string, files?: AttachedFile[]) => {
    const sdkFiles = files?.map((f) => ({ url: f.url!, mime: f.mime }))
    sendMessage(text, sdkFiles)

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
  }, [activeThreadId, sendMessage])

  const handleNewConversation = useCallback((conv: Conversation) => {
    firstMsgSent.current = false
    setActiveThreadId(conv.id)
    setIsReadonly(false)
    router.replace(`/chat?id=${conv.id}`)
  }, [router])

  const handleSelectThread = useCallback((id: string, platform: string) => {
    selectThread(id, platform)
  }, [selectThread])

  // Auto-select only when there is no conversation in the URL yet.
  const handleSidebarLoad = useCallback((convs: Conversation[]) => {
    if (activeThreadId) {
      // URL에 id가 이미 있으면 해당 대화의 platform을 확인해 readonly 설정
      const current = convs.find((c) => c.id === activeThreadId)
      if (current) setIsReadonly(current.platform !== "web")
      return
    }
    const firstWeb = convs.find((c) => c.platform === "web")
    if (firstWeb) selectThread(firstWeb.id, firstWeb.platform)
  }, [activeThreadId, selectThread])

  return (
    <div className="flex h-full overflow-hidden">
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
            <h1 className="flex items-center gap-2 text-lg font-semibold">
              <MessageCircle className="size-5 text-primary" />
              {t("title")}
            </h1>
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
              {t("errorBadge")}
            </Badge>
          )}
        </div>

        <ChatMessages
          messages={messages}
          historyLoading={historyLoading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          onLoadMore={loadMore}
          isThinking={isThinking}
        />
        <ChatInput
          onSend={(text, files) => handleSend(text, files)}
          disabled={!isConnected || isStreaming || activeThreadId === null || isReadonly}
          placeholder={
            isReadonly
              ? t("readonlyPlaceholder")
              : activeThreadId === null
              ? t("newConvPlaceholder")
              : undefined
          }
          persona={persona}
          personas={personas}
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
