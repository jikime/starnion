"use client"

import { useEffect, useLayoutEffect, useRef, useCallback } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Badge } from "@/components/ui/badge"
import { Wrench, Loader2, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ChatMessage, FileAttachment, Segment } from "@/hooks/use-chat"

interface ChatMessagesProps {
  messages: ChatMessage[]
  historyLoading?: boolean
  loadingMore?: boolean
  isThinking?: boolean
  hasMore?: boolean
  onLoadMore?: () => void
}

function getExtColor(ext: string, mime: string): string {
  if (mime.startsWith("image/")) return "bg-emerald-500"
  if (mime.startsWith("audio/")) return "bg-purple-500"
  if (mime.startsWith("video/")) return "bg-pink-500"
  const map: Record<string, string> = {
    pdf: "bg-red-500",
    doc: "bg-blue-500", docx: "bg-blue-500",
    xls: "bg-green-600", xlsx: "bg-green-600", csv: "bg-green-600",
    ppt: "bg-orange-500", pptx: "bg-orange-500",
    zip: "bg-amber-500", gz: "bg-amber-500", tar: "bg-amber-500",
    rar: "bg-amber-500", "7z": "bg-amber-500",
    txt: "bg-slate-500", md: "bg-slate-500",
    js: "bg-yellow-500", ts: "bg-blue-400", tsx: "bg-blue-400",
    py: "bg-indigo-500", go: "bg-cyan-500",
  }
  return map[ext] ?? "bg-slate-400"
}

function formatSize(bytes?: number): string {
  if (!bytes) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FilePreview({ file }: { file: FileAttachment }) {
  if (!file.url) return null

  if (file.mime.startsWith("image/")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={file.url} alt={file.name} className="mt-2 max-w-xs rounded-lg" />
    )
  }

  if (file.mime.startsWith("audio/")) {
    return (
      <div className="mt-2 max-w-xs rounded-xl border border-black/8 dark:border-white/10 bg-white/80 dark:bg-white/10 px-3 py-2 shadow-sm">
        <p className="mb-1.5 truncate text-xs font-semibold text-foreground">{file.name}</p>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio controls src={file.url} className="h-8 w-full" preload="metadata" />
      </div>
    )
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "file"
  const badgeColor = getExtColor(ext, file.mime)
  const size = formatSize(file.size)

  return (
    <a
      href={file.url}
      download={file.name}
      rel="noopener noreferrer"
      className="mt-2 flex items-center gap-3 rounded-xl bg-white/80 dark:bg-white/10 border border-black/8 dark:border-white/10 px-3 py-2.5 shadow-sm hover:bg-white dark:hover:bg-white/15 transition-colors min-w-0 max-w-[280px]"
    >
      {/* Extension badge */}
      <div className={cn("flex shrink-0 items-center justify-center rounded-lg w-10 h-10 text-white font-bold text-[10px] uppercase tracking-wide", badgeColor)}>
        {ext.length > 4 ? ext.slice(0, 4) : ext}
      </div>
      {/* Filename + size */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold leading-snug text-foreground">{file.name}</p>
        {size && <p className="mt-0.5 text-[11px] text-muted-foreground leading-none">{size}</p>}
      </div>
    </a>
  )
}

/** Animated "생각 중..." bubble shown before the first token arrives */
function ThinkingBubble() {
  return (
    <div className="rounded-2xl rounded-tl-sm bg-muted/50 px-4 py-3 w-fit">
      <div className="flex items-center gap-1.5">
        <span
          className="size-2 rounded-full bg-muted-foreground/60 animate-bounce"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="size-2 rounded-full bg-muted-foreground/60 animate-bounce"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="size-2 rounded-full bg-muted-foreground/60 animate-bounce"
          style={{ animationDelay: "300ms" }}
        />
      </div>
    </div>
  )
}

/** Tool call row — shows the tool name with a spinner (calling) or check (done) */
function ToolCallRow({ seg }: { seg: Segment & { kind: "tool" } }) {
  return (
    <div className="flex items-center gap-1.5 py-1 text-xs text-muted-foreground">
      {seg.state === "call" ? (
        <Loader2 className="size-3 shrink-0 animate-spin" />
      ) : (
        <CheckCircle2 className="size-3 shrink-0 text-emerald-500" />
      )}
      <span>{seg.name}</span>
    </div>
  )
}

/** Assistant message body — renders ordered segments (text + tool calls) */
function AssistantBody({ message }: { message: ChatMessage }) {
  const segs = message.segments

  // Streaming message with segments: render text and tool calls in order
  if (segs && segs.length > 0) {
    const lastIdx = segs.length - 1
    return (
      <>
        {segs.map((seg, i) => {
          if (seg.kind === "tool") {
            // 텍스트 답변이 나오기 시작하면 도구 행 숨김
            if (!message.streaming || message.text.trim()) return null
            return <ToolCallRow key={i} seg={seg} />
          }
          const isLast = i === lastIdx
          return (
            <div key={i} className="chat-prose">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
                  ),
                }}
              >
                {seg.text}
              </ReactMarkdown>
              {isLast && message.streaming && (
                <span className="inline-block h-3.5 w-0.5 animate-pulse bg-foreground align-middle" />
              )}
            </div>
          )
        })}
        {/* Streaming but only tool calls so far — no text yet */}
        {message.streaming && segs.every((s) => s.kind === "tool") && (
          <span className="inline-block h-3.5 w-0.5 animate-pulse bg-foreground align-middle mt-1" />
        )}
      </>
    )
  }

  // History message or empty streaming message — plain markdown
  return (
    <div className="chat-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
          ),
        }}
      >
        {message.text}
      </ReactMarkdown>
      {message.streaming && (
        <span className="inline-block h-3.5 w-0.5 animate-pulse bg-foreground align-middle" />
      )}
    </div>
  )
}

export function ChatMessages({
  messages,
  historyLoading = false,
  loadingMore = false,
  isThinking = false,
  hasMore = false,
  onLoadMore,
}: ChatMessagesProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
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

  // ResizeObserver: re-scroll when content grows after images/files finish loading.
  // Images are loaded asynchronously, so useLayoutEffect fires before they add height.
  useEffect(() => {
    const inner = innerRef.current
    const container = containerRef.current
    if (!inner || !container) return

    const ro = new ResizeObserver(() => {
      // Only auto-scroll when loadMore position-restore is not pending.
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
      <div ref={innerRef} className="mx-auto max-w-5xl space-y-6">
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
              "flex",
              message.role === "user" && "flex-row-reverse"
            )}
          >
            <div
              className={cn(
                "max-w-[88%] space-y-1",
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
                  <AssistantBody message={message} />
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

        {isThinking && <ThinkingBubble />}

      </div>
    </div>
  )
}
