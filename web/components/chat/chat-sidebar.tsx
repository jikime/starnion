"use client"

import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { MessageCircle, Loader2, Plus, Lock, Bot } from "lucide-react"
import type { Conversation, ConversationGroup } from "./types"
import { PLATFORM_META } from "./types"

interface ChatSidebarProps {
  open: boolean
  grouped: ConversationGroup[]
  webConvs: Conversation[]
  platformGroups: Record<string, Conversation[]>
  activeThreadId: string | null
  convLoading: boolean
  hasMoreConvs: boolean
  loadingMoreConvs: boolean
  creating: boolean
  onSelectThread: (id: string, platform: string) => void
  onNewConversation: () => void
  onLoadMoreConvs: () => void
  onClose?: () => void
}

export function ChatSidebar({
  open,
  grouped,
  webConvs,
  platformGroups,
  activeThreadId,
  convLoading,
  hasMoreConvs,
  loadingMoreConvs,
  creating,
  onSelectThread,
  onNewConversation,
  onLoadMoreConvs,
  onClose,
}: ChatSidebarProps) {
  const t = useTranslations("chat")
  const handleSelect = (id: string, platform: string) => {
    onSelectThread(id, platform)
    // Auto-close on mobile
    onClose?.()
  }

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <div
        className={cn(
          // Mobile: full-screen overlay
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-background transition-transform duration-200 ease-in-out w-72",
          "md:relative md:inset-auto md:z-auto md:transition-all md:duration-200",
          // Desktop: width-based toggle
          open ? "md:w-60 md:translate-x-0" : "md:w-0 md:overflow-hidden",
          // Mobile: slide in/out
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="p-3 border-b border-border">
          <Button
            className="w-full gap-2"
            size="sm"
            onClick={onNewConversation}
            disabled={creating}
          >
            {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {t("newConversation")}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="space-y-4 px-3 py-3">
            {convLoading && (
              <div className="space-y-1">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg px-2 py-2">
                    <Skeleton className="size-4 shrink-0 rounded-full" />
                    <Skeleton className="h-4 flex-1" style={{ width: `${55 + (i % 3) * 15}%` }} />
                  </div>
                ))}
              </div>
            )}

            {!convLoading && grouped.length > 0 && (
              <div>
                <div className="mb-2 px-2 text-xs font-medium text-muted-foreground">{"💬 " + t("chatList")}</div>
                {grouped.map(({ label, items }) => (
                  <div key={label} className="mb-3">
                    <div className="mb-1 px-2 text-xs text-muted-foreground/70">{label}</div>
                    {items.map((conv) => (
                      <button
                        key={conv.id}
                        onClick={() => handleSelect(conv.id, conv.platform)}
                        className={cn(
                          "flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-sm",
                          "hover:bg-accent transition-colors",
                          activeThreadId === conv.id && "bg-accent"
                        )}
                      >
                        <MessageCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <span className="flex flex-col min-w-0">
                          <span className="line-clamp-1">{conv.title}</span>
                          {conv.persona_name && (
                            <span className="text-xs text-muted-foreground/70 flex items-center gap-0.5">
                              <Bot className="size-2.5" />
                              {conv.persona_name}
                            </span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
                {hasMoreConvs && (
                  <button
                    onClick={onLoadMoreConvs}
                    disabled={loadingMoreConvs}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    {loadingMoreConvs ? <Loader2 className="size-3 animate-spin" /> : t("loadMore")}
                  </button>
                )}
              </div>
            )}

            {!convLoading && webConvs.length === 0 && Object.keys(platformGroups).length === 0 && (
              <p className="px-2 py-4 text-xs text-center text-muted-foreground">
                {t("noConversations")}<br />{t("startNew")}
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
                    <span className="inline-flex items-center gap-0.5 h-4 px-1 rounded-full text-xs font-medium border border-border bg-secondary text-secondary-foreground">
                      <Lock className="size-2.5" />
                      {t("viewOnly")}
                    </span>
                  </div>
                  {items.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => handleSelect(conv.id, conv.platform)}
                      className={cn(
                        "flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-sm",
                        "hover:bg-accent transition-colors",
                        activeThreadId === conv.id && "bg-accent"
                      )}
                    >
                      <MessageCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <span className="flex flex-col min-w-0">
                        <span className="line-clamp-1 font-medium">{conv.title}</span>
                        {conv.thread_id && (
                          <span className="text-xs text-muted-foreground/70 truncate">
                            ID: {conv.thread_id}
                          </span>
                        )}
                        {conv.persona_name && (
                          <span className="text-xs text-muted-foreground/70 flex items-center gap-0.5">
                            <Bot className="size-2.5" />
                            {conv.persona_name}
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
