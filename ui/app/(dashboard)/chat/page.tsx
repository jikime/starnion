"use client"

import { useRef, useState, useEffect, useCallback, useMemo, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { type Conversation } from "@/components/chat/chat-sidebar"
import { ChatMessages } from "@/components/chat/chat-messages"
import { ChatInput, type AttachedFile } from "@/components/chat/chat-input"
import { useChat } from "@/hooks/use-chat"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { MessageCircle, WifiOff, Loader2, Plus, Lock, List } from "lucide-react"

const PLATFORM_META: Record<string, { icon: string; label: string }> = {
  telegram: { icon: "📱", label: "텔레그램" },
  discord:  { icon: "🎮", label: "디스코드" },
  slack:    { icon: "💬", label: "슬랙" },
  cli:      { icon: "💻", label: "CLI" },
}

function groupByDate(conversations: Conversation[]) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000)

  const groups: Record<string, Conversation[]> = {}
  for (const conv of conversations) {
    const d = new Date(conv.updated_at)
    let label: string
    if (d >= today) label = "오늘"
    else if (d >= yesterday) label = "어제"
    else if (d >= sevenDaysAgo) label = "지난 7일"
    else label = `${d.getFullYear()}년 ${d.getMonth() + 1}월`
    if (!groups[label]) groups[label] = []
    groups[label].push(conv)
  }

  const order = ["오늘", "어제", "지난 7일"]
  const result: { label: string; items: Conversation[] }[] = []
  for (const label of order) {
    if (groups[label]) { result.push({ label, items: groups[label] }); delete groups[label] }
  }
  for (const [label, items] of Object.entries(groups)) result.push({ label, items })
  return result
}

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

  const [persona, setPersona] = useState("assistant")
  const [popoverOpen, setPopoverOpen] = useState(false)

  // Conversation list state (previously in ChatSidebar)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [convLoading, setConvLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const didAutoSelect = useRef(false)
  const activeThreadIdRef = useRef<string | null>(urlId)

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

  // Initialize from URL so page refresh preserves selection.
  const [activeThreadId, setActiveThreadId] = useState<string | null>(urlId)
  const [isReadonly, setIsReadonly] = useState(false)
  const firstMsgSent = useRef(false)
  const updateTitleRef = useRef<((id: string, title: string) => void) | null>(null)

  // Keep ref in sync for use inside fetchConversations.
  activeThreadIdRef.current = activeThreadId

  // Stable title updater exposed via ref.
  const handleUpdateTitle = useCallback((id: string, title: string) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)))
  }, [])
  updateTitleRef.current = handleUpdateTitle

  const { messages, sendMessage, connState, isConnected, isStreaming, isThinking, historyLoading, hasMore, loadingMore, loadMore } = useChat(activeThreadId)

  // Fetch conversation list once on mount.
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations")
      if (res.ok) {
        const data: Conversation[] = await res.json()
        setConversations(data)
        if (!didAutoSelect.current) {
          didAutoSelect.current = true
          const currentId = activeThreadIdRef.current
          if (currentId) {
            const current = data.find((c) => c.id === currentId)
            if (current) setIsReadonly(current.platform !== "web")
          } else {
            const firstWeb = data.find((c) => c.platform === "web")
            if (firstWeb) {
              firstMsgSent.current = true
              setActiveThreadId(firstWeb.id)
              setIsReadonly(false)
              router.replace(`/chat?id=${firstWeb.id}`)
            }
          }
        }
      }
    } catch {
      // silently ignore
    } finally {
      setConvLoading(false)
    }
  }, [router])

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  // Keep URL in sync whenever the active thread changes.
  const selectThread = useCallback((id: string, platform: string) => {
    firstMsgSent.current = platform !== "web"
    setActiveThreadId(id)
    setIsReadonly(platform !== "web")
    router.replace(`/chat?id=${id}`)
    setPopoverOpen(false)
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

  const handleNewConversation = useCallback(async () => {
    setCreating(true)
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "새 대화" }),
      })
      if (res.ok) {
        const conv: Conversation = await res.json()
        setConversations((prev) => [conv, ...prev])
        firstMsgSent.current = false
        setActiveThreadId(conv.id)
        setIsReadonly(false)
        router.replace(`/chat?id=${conv.id}`)
        setPopoverOpen(false)
      }
    } catch {
      // silently ignore
    } finally {
      setCreating(false)
    }
  }, [router])

  const webConvs = conversations.filter((c) => c.platform === "web")
  const platformConvs = conversations.filter((c) => c.platform !== "web")
  const grouped = groupByDate(webConvs)
  const platformGroups: Record<string, Conversation[]> = {}
  for (const conv of platformConvs) {
    if (!platformGroups[conv.platform]) platformGroups[conv.platform] = []
    platformGroups[conv.platform].push(conv)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
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

        <div className="flex items-center gap-2">
          {connState === "error" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-border bg-secondary text-secondary-foreground">
              <WifiOff className="size-3" />
              {t("errorBadge")}
            </span>
          )}
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon">
                <List className="size-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-0 overflow-hidden">
              <div className="flex flex-col h-[480px]">
                <div className="p-3 border-b border-border">
                  <Button
                    className="w-full gap-2"
                    size="sm"
                    onClick={handleNewConversation}
                    disabled={creating}
                  >
                    {creating ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    새 대화
                  </Button>
                </div>
                <ScrollArea className="flex-1">
                  <div className="space-y-4 px-3 py-3">
                    {convLoading && (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      </div>
                    )}

                    {!convLoading && grouped.length > 0 && (
                      <div>
                        <div className="mb-2 px-2 text-xs font-medium text-muted-foreground">
                          💬 웹챗
                        </div>
                        {grouped.map(({ label, items }) => (
                          <div key={label} className="mb-3">
                            <div className="mb-1 px-2 text-xs text-muted-foreground/70">
                              {label}
                            </div>
                            {items.map((conv) => (
                              <button
                                key={conv.id}
                                onClick={() => selectThread(conv.id, conv.platform)}
                                className={cn(
                                  "flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-sm",
                                  "hover:bg-accent transition-colors",
                                  activeThreadId === conv.id && "bg-accent"
                                )}
                              >
                                <MessageCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                                <span className="line-clamp-1">{conv.title}</span>
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}

                    {!convLoading && webConvs.length === 0 && platformConvs.length === 0 && (
                      <p className="px-2 py-4 text-xs text-center text-muted-foreground">
                        아직 대화가 없어요.<br />새 대화를 시작해보세요!
                      </p>
                    )}

                    {!convLoading && Object.entries(platformGroups).map(([platform, items]) => {
                      const meta = PLATFORM_META[platform] ?? { icon: "🔗", label: platform }
                      return (
                        <div key={platform}>
                          <div className="mb-2 px-2 flex items-center gap-1.5">
                            <span className="text-xs font-medium text-muted-foreground">
                              {meta.icon} {meta.label}
                            </span>
                            <span className="inline-flex items-center gap-0.5 h-4 px-1 rounded-full text-[10px] font-medium border border-border bg-secondary text-secondary-foreground">
                              <Lock className="size-2.5" />
                              조회
                            </span>
                          </div>
                          {items.map((conv) => (
                            <button
                              key={conv.id}
                              onClick={() => selectThread(conv.id, conv.platform)}
                              className={cn(
                                "flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-sm",
                                "hover:bg-accent transition-colors",
                                activeThreadId === conv.id && "bg-accent"
                              )}
                            >
                              <MessageCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                              <span className="line-clamp-1">{conv.title}</span>
                            </button>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
              </div>
            </PopoverContent>
          </Popover>
        </div>
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
  )
}

export default function ChatPage() {
  return (
    <Suspense>
      <ChatPageInner />
    </Suspense>
  )
}
