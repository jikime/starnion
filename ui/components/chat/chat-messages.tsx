"use client"

import { useEffect, useLayoutEffect, useRef, useCallback } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Bot, User, Wrench, Paperclip, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ChatMessage, FileAttachment } from "@/hooks/use-chat"

interface ChatMessagesProps {
  messages: ChatMessage[]
  historyLoading?: boolean
  loadingMore?: boolean
  hasMore?: boolean
  onLoadMore?: () => void
}

function FilePreview({ file }: { file: FileAttachment }) {
  if (!file.url) return null
  if (file.mime.startsWith("image/")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={file.url} alt={file.name} className="mt-2 max-w-xs rounded-lg" />
    )
  }
  return (
    <a
      href={file.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 flex items-center gap-1.5 text-xs underline"
    >
      <Paperclip className="size-3" />
      {file.name}
    </a>
  )
}

export function ChatMessages({
  messages,
  historyLoading = false,
  loadingMore = false,
  hasMore = false,
  onLoadMore,
}: ChatMessagesProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const topSentinelRef = useRef<HTMLDivElement>(null)
  // Stores scrollHeight before prepending older messages (0 = no pending restore).
  const prevScrollHeightRef = useRef(0)
  // True when the user is within 150px of the bottom.
  const isNearBottomRef = useRef(true)

  // Single layout effect handles all scroll cases (runs before paint, no animation flicker).
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Thread switched: messages cleared → reset so next load auto-scrolls to bottom.
    if (messages.length === 0) {
      isNearBottomRef.current = true
      return
    }

    if (prevScrollHeightRef.current > 0) {
      // loadMore: restore position so prepended older messages don't jump the view.
      container.scrollTop = container.scrollHeight - prevScrollHeightRef.current
      prevScrollHeightRef.current = 0
    } else if (isNearBottomRef.current) {
      // Initial load or new message: instant snap to bottom (no smooth — smooth
      // animation fires handleScroll mid-way and incorrectly clears isNearBottom).
      container.scrollTop = container.scrollHeight
    }
  }, [messages])

  // Track whether the user is near the bottom to decide on auto-scroll.
  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    isNearBottomRef.current = distFromBottom < 150
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

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-4 py-4"
    >
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Top sentinel — triggers loadMore when scrolled into view */}
        <div ref={topSentinelRef} />

        {loadingMore && (
          <div className="flex items-center justify-center py-3 text-muted-foreground gap-2">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-sm">이전 메시지 불러오는 중...</span>
          </div>
        )}

        {historyLoading && (
          <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-sm">대화 불러오는 중...</span>
          </div>
        )}

        {!historyLoading && messages.length === 0 && (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <p className="text-sm">대화를 시작해보세요!</p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex gap-3",
              message.role === "user" && "flex-row-reverse"
            )}
          >
            <Avatar className="size-8 shrink-0">
              <AvatarFallback
                className={cn(
                  message.role === "assistant"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
              >
                {message.role === "assistant" ? (
                  <Bot className="size-4" />
                ) : (
                  <User className="size-4" />
                )}
              </AvatarFallback>
            </Avatar>

            <div
              className={cn(
                "max-w-[80%] space-y-1",
                message.role === "user" && "items-end"
              )}
            >
              <div
                className={cn(
                  "rounded-2xl px-4 py-2.5",
                  message.role === "assistant"
                    ? "bg-muted/50 rounded-tl-sm"
                    : "bg-primary text-primary-foreground rounded-tr-sm"
                )}
              >
                {message.role === "assistant" ? (
                  <div className="text-sm prose-chat">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                        h1: ({ children }) => <h1 className="text-base font-bold mt-3 mb-1 first:mt-0">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-sm font-bold mt-2 mb-1 first:mt-0">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1 first:mt-0">{children}</h3>,
                        ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-0.5">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>,
                        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                        pre: ({ children }) => <pre className="bg-black/10 rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono">{children}</pre>,
                        code: ({ children, className }) => {
                          const content = String(children)
                          // Block code: has language class OR is multi-line
                          if (className || content.includes("\n")) {
                            return <code className={cn("font-mono text-xs", className)}>{children}</code>
                          }
                          // Inline code
                          return <code className="bg-black/10 rounded px-1 py-0.5 font-mono text-xs">{children}</code>
                        },
                        blockquote: ({ children }) => <blockquote className="border-l-2 border-foreground/30 pl-3 my-2 opacity-80">{children}</blockquote>,
                        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:opacity-80">{children}</a>,
                        hr: () => <hr className="border-foreground/20 my-3" />,
                        table: ({ children }) => <div className="overflow-x-auto my-2"><table className="text-xs border-collapse w-full">{children}</table></div>,
                        th: ({ children }) => <th className="border border-foreground/20 px-2 py-1 text-left font-semibold bg-black/5">{children}</th>,
                        td: ({ children }) => <td className="border border-foreground/20 px-2 py-1">{children}</td>,
                        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                      }}
                    >
                      {message.text}
                    </ReactMarkdown>
                    {message.streaming && (
                      <span className="inline-block h-3.5 w-0.5 animate-pulse bg-foreground align-middle" />
                    )}
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">
                    {message.text}
                    {message.streaming && (
                      <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-current align-middle" />
                    )}
                  </p>
                )}
                {message.files.map((file, i) => (
                  <FilePreview key={i} file={file} />
                ))}
              </div>

              <div
                className={cn(
                  "flex flex-wrap items-center gap-2",
                  message.role === "user" && "flex-row-reverse"
                )}
              >
                <span className="text-xs text-muted-foreground">
                  {message.timestamp.toLocaleTimeString("ko-KR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {message.toolEvents.map((ev, i) => (
                  <Badge key={i} variant="outline" className="text-xs gap-1">
                    <Wrench className="size-3" />
                    {ev.tool}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        ))}

      </div>
    </div>
  )
}
