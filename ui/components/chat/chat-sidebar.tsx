"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Plus, MessageCircle, Loader2, Lock } from "lucide-react"

export interface Conversation {
  id: string
  title: string
  platform: string
  created_at: string
  updated_at: string
}

interface ChatSidebarProps {
  activeThreadId: string | null
  onSelectThread: (id: string, platform: string) => void
  onNewConversation: (conv: Conversation) => void
  /**
   * Called with a setter fn so the parent can imperatively update a title.
   * Pattern: parent stores the fn in a ref and calls it after PATCH succeeds.
   */
  onUpdateTitle?: (updater: (id: string, title: string) => void) => void
  /** Called once after the initial conversation list is fetched. */
  onLoad?: (conversations: Conversation[]) => void
}

const PLATFORM_META: Record<string, { icon: string; label: string }> = {
  telegram: { icon: "📱", label: "텔레그램" },
  discord:  { icon: "🎮", label: "디스코드" },
  slack:    { icon: "💬", label: "슬랙" },
}

export function ChatSidebar({
  activeThreadId,
  onSelectThread,
  onNewConversation,
  onUpdateTitle,
  onLoad,
}: ChatSidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const didAutoSelect = useRef(false)

  // Expose a title-updater to the parent so it can patch after PATCH API call.
  useEffect(() => {
    if (!onUpdateTitle) return
    onUpdateTitle((id, title) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title } : c))
      )
    })
  }, [onUpdateTitle])

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations")
      if (res.ok) {
        const data: Conversation[] = await res.json()
        setConversations(data)
        if (!didAutoSelect.current) {
          didAutoSelect.current = true
          onLoad?.(data)
        }
      }
    } catch {
      // silently ignore
    } finally {
      setLoading(false)
    }
  }, [onLoad])

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  const handleNewConversation = async () => {
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
        onNewConversation(conv)
      }
    } catch {
      // silently ignore
    } finally {
      setCreating(false)
    }
  }

  const webConvs = conversations.filter((c) => c.platform === "web")
  const platformConvs = conversations.filter((c) => c.platform !== "web")

  // Group web conversations by date.
  const grouped = groupByDate(webConvs)

  // Group platform conversations by platform type.
  const platformGroups: Record<string, Conversation[]> = {}
  for (const conv of platformConvs) {
    if (!platformGroups[conv.platform]) platformGroups[conv.platform] = []
    platformGroups[conv.platform].push(conv)
  }

  return (
    <div className="w-64 border-r border-border bg-muted/30 flex flex-col">
      <div className="p-4">
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
        <div className="space-y-4 px-3 pb-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Web conversations grouped by date */}
          {!loading && grouped.length > 0 && (
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
                      onClick={() => onSelectThread(conv.id, conv.platform)}
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

          {!loading && webConvs.length === 0 && platformConvs.length === 0 && (
            <p className="px-2 py-4 text-xs text-center text-muted-foreground">
              아직 대화가 없어요.<br />새 대화를 시작해보세요!
            </p>
          )}

          {/* Platform conversations (read-only) */}
          {!loading && Object.entries(platformGroups).map(([platform, items]) => {
            const meta = PLATFORM_META[platform] ?? { icon: "🔗", label: platform }
            return (
              <div key={platform}>
                <div className="mb-2 px-2 flex items-center gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {meta.icon} {meta.label}
                  </span>
                  <Badge variant="secondary" className="h-4 px-1 text-[10px] gap-0.5">
                    <Lock className="size-2.5" />
                    조회
                  </Badge>
                </div>
                {items.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => onSelectThread(conv.id, conv.platform)}
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
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

interface ConversationGroup {
  label: string
  items: Conversation[]
}

function groupByDate(conversations: Conversation[]): ConversationGroup[] {
  const now = new Date()
  const today = startOfDay(now)
  const yesterday = startOfDay(new Date(today.getTime() - 86400000))
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000)

  const groups: Record<string, Conversation[]> = {}

  for (const conv of conversations) {
    const d = new Date(conv.updated_at)
    let label: string

    if (d >= today) {
      label = "오늘"
    } else if (d >= yesterday) {
      label = "어제"
    } else if (d >= sevenDaysAgo) {
      label = "지난 7일"
    } else {
      label = formatMonthYear(d)
    }

    if (!groups[label]) groups[label] = []
    groups[label].push(conv)
  }

  // Preserve display order.
  const order = ["오늘", "어제", "지난 7일"]
  const result: ConversationGroup[] = []

  for (const label of order) {
    if (groups[label]) {
      result.push({ label, items: groups[label] })
      delete groups[label]
    }
  }

  // Remaining month groups (already sorted desc by query).
  for (const [label, items] of Object.entries(groups)) {
    result.push({ label, items })
  }

  return result
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function formatMonthYear(d: Date): string {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`
}
