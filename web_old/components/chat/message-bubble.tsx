"use client"

import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Loader2, Volume2, Trash2, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { ToolEventGroup } from "@/components/chat/tool-event-card"
import { AssistantBody } from "@/components/chat/assistant-body"
import { FilePreview } from "@/components/chat/file-preview"
import { CopyButton, formatTokens } from "@/components/chat/message-helpers"
import type { ChatMessage } from "@/hooks/use-chat"

interface MessageBubbleProps {
  message: ChatMessage
  conversationId?: string | null
  speakingId: string | null
  voiceState: string
  onSpeak: (msg: ChatMessage) => void
  onDelete: (msgId: string) => void
  deletingId: string | null
  onRetry?: () => void
}

export function MessageBubble({
  message,
  conversationId,
  speakingId,
  voiceState,
  onSpeak,
  onDelete,
  deletingId,
  onRetry,
}: MessageBubbleProps) {
  const t = useTranslations("chat")

  return (
    <div
      className={cn(
        "group flex",
        message.role === "user" && "flex-row-reverse"
      )}
    >
      <div
        className={cn(
          "space-y-1",
          message.role === "user" ? "max-w-[88%] md:max-w-[88%] items-end" : "w-full"
        )}
      >
        <div
          className={cn(
            "relative group/bubble px-3 py-2 md:px-4 md:py-2.5",
            message.role === "assistant"
              ? ""
              : "rounded-2xl rounded-tr-sm border bg-primary/10 border-primary/35 text-foreground"
          )}
        >
          {message.role === "assistant" ? (
            <>
              {message.toolEvents.length > 0 && (
                <ToolEventGroup events={message.toolEvents} streaming={message.streaming} />
              )}
              <AssistantBody message={message} />
            </>
          ) : (
            <p className="text-base whitespace-pre-wrap leading-relaxed">
              {message.text}
              {message.streaming && (
                <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-current align-middle" />
              )}
            </p>
          )}
          {(() => {
            const allFiles = message.files ?? []
            const imageFiles = allFiles.filter(f => f.url && f.mime.startsWith("image/"))
            const otherFiles = allFiles.filter(f => !f.mime.startsWith("image/"))
            return (
              <>
                {imageFiles.length > 0 && (
                  <div className={cn(
                    "mt-2 flex flex-wrap gap-1.5",
                    imageFiles.length === 1 && "block"
                  )}>
                    {imageFiles.map((file, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={file.url}
                        alt={file.name}
                        className={cn(
                          "rounded-lg object-cover",
                          imageFiles.length === 1
                            ? "max-w-xs"
                            : "h-24 w-24"
                        )}
                      />
                    ))}
                  </div>
                )}
                {otherFiles.map((file, i) => (
                  <FilePreview key={i} file={file} />
                ))}
              </>
            )
          })()}
        </div>

        {/* Retry button for error messages — always visible, no hover required */}
        {message.role === "assistant" && !message.streaming && message.text.startsWith("\u26A0\uFE0F") && onRetry && (
          <button
            onClick={onRetry}
            className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className="size-3" />
            {t("retry")}
          </button>
        )}

        <div
          className={cn(
            "flex flex-wrap items-center gap-1.5 transition-opacity duration-150 opacity-0 group-hover:opacity-100",
            message.role === "user" ? "flex-row-reverse" : "flex-row"
          )}
        >
          {/* Timestamp */}
          <span className="text-xs text-muted-foreground">
            {message.timestamp.toLocaleTimeString("ko-KR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>

          {/* Assistant-only metadata */}
          {message.role === "assistant" && !message.streaming && (
            <>
              {message.botName && (
                <span className="text-xs text-muted-foreground">
                  · {message.botName}
                </span>
              )}
              {message.modelId && (
                <span className="text-xs text-muted-foreground">
                  · {message.modelId}
                </span>
              )}
              {((message.inputTokens ?? 0) + (message.outputTokens ?? 0) > 0) && (
                <span className="text-xs text-muted-foreground">
                  · ↑{formatTokens(message.inputTokens ?? 0)} ↓{formatTokens(message.outputTokens ?? 0)}
                </span>
              )}
              {(message.contextWindow ?? 0) > 0 && (message.contextTokens ?? 0) > 0 && (
                <span className="text-xs text-muted-foreground">
                  · ctx {formatTokens(message.contextTokens!)} / {Math.round(((message.contextTokens!) / (message.contextWindow!)) * 100)}%
                </span>
              )}
            </>
          )}

          {/* Action buttons — assistant only, not while streaming */}
          {message.role === "assistant" && !message.streaming && (
            <div
              className={cn(
                "flex items-center gap-0.5 transition-opacity duration-150",
                "opacity-0 group-hover:opacity-100",
                speakingId === message.id && "opacity-100"
              )}
            >
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-6 w-6 text-muted-foreground/50 hover:text-foreground",
                  speakingId === message.id && "text-primary"
                )}
                onClick={() => onSpeak(message)}
                title={t("readAloud")}
              >
                {speakingId === message.id && voiceState === "loading"
                  ? <Loader2 className="size-4 animate-spin" />
                  : <Volume2 className="size-4" />
                }
              </Button>
              <CopyButton text={message.text} />
              {conversationId && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground/50 hover:text-destructive"
                  onClick={() => onDelete(message.id)}
                  disabled={deletingId === message.id}
                  title={t("delete")}
                >
                  {deletingId === message.id
                    ? <Loader2 className="size-4 animate-spin" />
                    : <Trash2 className="size-4" />
                  }
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
