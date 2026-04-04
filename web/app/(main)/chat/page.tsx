"use client"

import { useRef, useState, useEffect, useCallback, Suspense } from "react"
import { useTranslations } from "next-intl"
import { useSearchParams, useRouter } from "next/navigation"
import { ChatMessages } from "@/components/chat/chat-messages"
import { ChatInput, type AttachedFile } from "@/components/chat/chat-input"
import { useWebSocketChat } from "@/hooks/use-websocket-chat"
import { AVAILABLE_MODELS, DEFAULT_MODEL_ID } from "@/lib/models"
import { ChatSidebar } from "@/components/chat/chat-sidebar"
import { ChatHeader } from "@/components/chat/chat-header"
import { type Conversation, type Persona, groupByDate } from "@/components/chat/types"

function ChatPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tc = useTranslations("chat")
  const urlId = searchParams.get("id")

  const [sidebarOpen, setSidebarOpen] = useState(false)
  useEffect(() => {
    const isDesktop = window.matchMedia("(min-width: 768px)").matches
    setSidebarOpen(isDesktop)
  }, [])

  const [selectedModelId, setSelectedModelId] = useState<string>(DEFAULT_MODEL_ID)
  const [botPersonas, setBotPersonas] = useState<Persona[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [convLoading, setConvLoading] = useState(true)
  const [hasMoreConvs, setHasMoreConvs] = useState(false)
  const [convsCursor, setConvsCursor] = useState<string | null>(null)
  const [loadingMoreConvs, setLoadingMoreConvs] = useState(false)
  const [creating, setCreating] = useState(false)
  const didAutoSelect = useRef(false)
  const activeThreadIdRef = useRef<string | null>(urlId)

  useEffect(() => {
    fetch("/api/settings/personas")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.personas) setBotPersonas(data.personas)
      })
      .catch(() => {})
  }, [])

  const [activeThreadId, setActiveThreadId] = useState<string | null>(urlId)
  const firstMsgSent = useRef(false)
  const updateTitleRef = useRef<((id: string, title: string) => void) | null>(null)

  activeThreadIdRef.current = activeThreadId

  const handleUpdateTitle = useCallback((id: string, title: string) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)))
  }, [])
  updateTitleRef.current = handleUpdateTitle

  const onNewThreadRef = useRef<((convId: string) => void) | undefined>(undefined)
  const { messages, sendMessage, retry, connState, isConnected, isStreaming, isThinking, historyLoading, hasMore, loadingMore, loadMore, removeMessage } = useWebSocketChat(activeThreadId, selectedModelId, useCallback((convId: string) => onNewThreadRef.current?.(convId), []))

  const fetchConversations = useCallback(async (cursor?: string) => {
    try {
      const url = cursor ? `/api/conversations?before=${encodeURIComponent(cursor)}` : "/api/conversations"
      const res = await fetch(url)
      if (res.ok) {
        const data: { conversations: Conversation[]; has_more: boolean; next_cursor: string } = await res.json()
        const convList = data.conversations ?? []
        if (cursor) {
          setConversations((prev) => [...prev, ...convList])
        } else {
          setConversations(convList)
          if (!didAutoSelect.current) {
            didAutoSelect.current = true
            if (!activeThreadIdRef.current) {
              const firstWeb = convList.find((c) => c.platform === "web")
              if (firstWeb) {
                firstMsgSent.current = true
                setActiveThreadId(firstWeb.id)
                router.replace(`/chat?id=${firstWeb.id}`)
              }
            }
          }
        }
        setHasMoreConvs(data.has_more)
        setConvsCursor(data.next_cursor ?? null)
      }
    } catch {
      // silently ignore
    } finally {
      setConvLoading(false)
    }
  }, [router])

  const loadMoreConvs = useCallback(async () => {
    if (!hasMoreConvs || loadingMoreConvs || !convsCursor) return
    setLoadingMoreConvs(true)
    try {
      await fetchConversations(convsCursor)
    } finally {
      setLoadingMoreConvs(false)
    }
  }, [hasMoreConvs, loadingMoreConvs, convsCursor, fetchConversations])

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  const handleNewThread = useCallback((convId: string) => {
    setActiveThreadId(convId)
    window.history.replaceState(null, "", `/chat?id=${convId}`)
    firstMsgSent.current = true
    fetchConversations()
  }, [fetchConversations])
  onNewThreadRef.current = handleNewThread

  const selectThread = useCallback((id: string, platform: string) => {
    firstMsgSent.current = platform !== "web"
    setActiveThreadId(id)
    router.replace(`/chat?id=${id}`)
  }, [router])

  const handleSend = useCallback((text: string, files?: AttachedFile[]) => {
    const sdkFiles = files?.map((f) => ({ url: f.url!, mime: f.mime, name: f.name }))
    sendMessage(text, sdkFiles)

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

  const handleNewConversation = useCallback(async () => {
    setCreating(true)
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: tc("newConversation") }),
      })
      if (res.ok) {
        const conv: Conversation = await res.json()
        setConversations((prev) => [conv, ...prev])
        firstMsgSent.current = false
        setActiveThreadId(conv.id)
        router.replace(`/chat?id=${conv.id}`)
      }
    } catch {
      // silently ignore
    } finally {
      setCreating(false)
    }
  }, [router])

  const handleSoulChange = useCallback(async (personaId: string) => {
    if (!activeThreadId) return
    const res = await fetch(`/api/conversations/${activeThreadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona_id: personaId }),
    }).catch(() => null)
    if (res?.ok) {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== activeThreadId) return c
          const found = botPersonas.find((p) => p.id === personaId)
          return { ...c, persona_id: personaId, persona_name: found?.name ?? "" }
        })
      )
    }
  }, [activeThreadId, botPersonas])

  const activeConv = conversations.find((c) => c.id === activeThreadId) ?? null

  const webConvs = conversations.filter((c) => c.platform === "web")
  const platformConvs = conversations.filter((c) => c.platform !== "web")
  const grouped = groupByDate(webConvs, tc)
  const platformGroups: Record<string, Conversation[]> = {}
  for (const conv of platformConvs) {
    if (!platformGroups[conv.platform]) platformGroups[conv.platform] = []
    platformGroups[conv.platform].push(conv)
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      <ChatSidebar
        open={sidebarOpen}
        grouped={grouped}
        webConvs={webConvs}
        platformGroups={platformGroups}
        activeThreadId={activeThreadId}
        convLoading={convLoading}
        hasMoreConvs={hasMoreConvs}
        loadingMoreConvs={loadingMoreConvs}
        creating={creating}
        onSelectThread={selectThread}
        onNewConversation={handleNewConversation}
        onLoadMoreConvs={loadMoreConvs}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <ChatHeader
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          isStreaming={isStreaming}
          connState={connState}
        />

        <ChatMessages
          messages={messages}
          historyLoading={historyLoading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          onLoadMore={loadMore}
          isThinking={isThinking}
          conversationId={activeThreadId}
          onMessageDeleted={removeMessage}
          onSuggest={(text) => handleSend(text)}
          onRetry={retry}
        />
        <ChatInput
          onSend={(text, files) => handleSend(text, files)}
          disabled={!isConnected || isStreaming}
          placeholder={undefined}
          botPersonas={botPersonas}
          activePersonaId={activeConv?.persona_id}
          onSoulChange={handleSoulChange}
          availableModels={AVAILABLE_MODELS}
          selectedModelId={selectedModelId}
          onModelChange={setSelectedModelId}
        />
      </div>
    </div>
  )
}

export default function ChatPage() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null
  return (
    <Suspense>
      <ChatPageInner />
    </Suspense>
  )
}
