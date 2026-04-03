"use client"

import { useEffect, useLayoutEffect, useRef, useCallback, useState } from "react"
import { useTranslations } from "next-intl"
import { useVoicePlayback } from "@/hooks/use-voice-playback"
import { ChatEmptyState } from "@/components/chat/chat-empty-state"
import { MessageBubble } from "@/components/chat/message-bubble"
import { ThinkingBubble } from "@/components/chat/message-helpers"
import { Loader2, ChevronDown } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import type { ChatMessage } from "@/hooks/use-chat"

interface ChatMessagesProps {
  messages: ChatMessage[]
  historyLoading?: boolean
  loadingMore?: boolean
  isThinking?: boolean
  hasMore?: boolean
  onLoadMore?: () => void
  conversationId?: string | null
  onMessageDeleted?: (msgId: string) => void
  onSuggest?: (text: string) => void
  onRetry?: () => void
}

export function ChatMessages({
  messages,
  historyLoading = false,
  loadingMore = false,
  isThinking = false,
  hasMore = false,
  onLoadMore,
  conversationId,
  onMessageDeleted,
  onSuggest,
  onRetry,
}: ChatMessagesProps) {
  const t = useTranslations("chat")
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const { playingId: speakingId, voiceState, speak } = useVoicePlayback()

  const handleSpeak = useCallback((msg: ChatMessage) => {
    speak({ id: msg.id, text: msg.text })
  }, [speak])

  const handleDelete = useCallback(async (msgId: string) => {
    if (!conversationId) return
    setDeletingId(msgId)
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages/${msgId}`, {
        method: "DELETE",
      })
      if (res.ok) {
        onMessageDeleted?.(msgId)
      }
    } finally {
      setDeletingId(null)
    }
  }, [conversationId, onMessageDeleted])

  const containerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const topSentinelRef = useRef<HTMLDivElement>(null)
  // Stores scrollHeight before prepending older messages (0 = no pending restore).
  const prevScrollHeightRef = useRef(0)
  // True when the user is within 150px of the bottom.
  const isNearBottomRef = useRef(true)
  const [isNearBottom, setIsNearBottom] = useState(true)

  // Single layout effect handles all scroll cases (runs before paint, no animation flicker).
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Thread switched: messages cleared -> reset so next load auto-scrolls to bottom.
    if (messages.length === 0) {
      isNearBottomRef.current = true
      return
    }

    if (prevScrollHeightRef.current > 0) {
      // loadMore: restore position so prepended older messages don't jump the view.
      container.scrollTop = container.scrollHeight - prevScrollHeightRef.current
      prevScrollHeightRef.current = 0
    } else if (isNearBottomRef.current) {
      // Initial load or new message: instant snap to bottom.
      container.scrollTop = container.scrollHeight
    }
  }, [messages])

  // ResizeObserver: re-scroll when content grows after images/files finish loading.
  useEffect(() => {
    const inner = innerRef.current
    const container = containerRef.current
    if (!inner || !container) return

    const ro = new ResizeObserver(() => {
      if (prevScrollHeightRef.current === 0 && isNearBottomRef.current) {
        container.scrollTop = container.scrollHeight
      }
    })
    ro.observe(inner)
    return () => ro.disconnect()
  }, [])

  // Track whether the user is near the bottom to decide on auto-scroll.
  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const near = distFromBottom < 150
    isNearBottomRef.current = near
    setIsNearBottom(near)
  }, [])

  // IntersectionObserver on the top sentinel triggers loadMore when visible.
  useEffect(() => {
    const sentinel = topSentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !loadingMore) {
          prevScrollHeightRef.current = containerRef.current?.scrollHeight ?? 0
          onLoadMore?.()
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, onLoadMore])

  const scrollToBottom = useCallback(() => {
    containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: "smooth" })
  }, [])

  return (
    <div className="relative flex-1 min-h-0">
      {/* Scroll-to-bottom button */}
      {!isNearBottom && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center justify-center size-8 rounded-full bg-background border border-border shadow-md text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
          title={t("scrollToBottom")}
        >
          <ChevronDown className="size-4" />
        </button>
      )}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-3 py-3 md:px-4 md:py-4"
      >
        <div ref={innerRef} className="mx-auto max-w-5xl space-y-6">
          {/* Top sentinel -- triggers loadMore when scrolled into view */}
          <div ref={topSentinelRef} />

          {loadingMore && (
            <div className="flex items-center justify-center py-3 text-muted-foreground gap-2">
              <Loader2 className="size-4 animate-spin" />
              <span className="text-sm">{t("loadingOlderMessages")}</span>
            </div>
          )}

          {historyLoading && (
            <div className="space-y-6 py-4">
              {/* assistant skeleton */}
              <div className="flex">
                <div className="w-full space-y-2 px-4 py-2.5">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              </div>
              {/* user skeleton */}
              <div className="flex flex-row-reverse">
                <div className="max-w-[72%] rounded-2xl rounded-tr-sm border bg-primary/5 border-primary/20 px-4 py-2.5 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>
              {/* assistant skeleton */}
              <div className="flex">
                <div className="w-full space-y-2 px-4 py-2.5">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </div>
              {/* user skeleton */}
              <div className="flex flex-row-reverse">
                <div className="max-w-[72%] rounded-2xl rounded-tr-sm border bg-primary/5 border-primary/20 px-4 py-2.5 space-y-2">
                  <Skeleton className="h-4 w-56" />
                </div>
              </div>
            </div>
          )}

          {!historyLoading && messages.length === 0 && (
            <ChatEmptyState onSuggest={onSuggest ?? (() => {})} />
          )}

          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              conversationId={conversationId}
              speakingId={speakingId}
              voiceState={voiceState}
              onSpeak={handleSpeak}
              onDelete={handleDelete}
              deletingId={deletingId}
              onRetry={onRetry}
            />
          ))}

          {isThinking && <ThinkingBubble />}
        </div>
      </div>
    </div>
  )
}
