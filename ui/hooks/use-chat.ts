"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useChat as useAIChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"

// ── Message model ─────────────────────────────────────────────────────────────

export type MessageRole = "user" | "assistant"

export interface ToolEvent {
  tool: string
  result?: string
}

export interface FileAttachment {
  name: string
  mime: string
  url: string
  size?: number
}

export interface ChatMessage {
  id: string
  role: MessageRole
  text: string
  toolEvents: ToolEvent[]
  files: FileAttachment[]
  streaming: boolean
  timestamp: Date
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function nanoid(): string {
  return Math.random().toString(36).slice(2, 10)
}

function textFromUIMessage(m: UIMessage): string {
  return m.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("")
}

function filesFromUIMessage(m: UIMessage): FileAttachment[] {
  return m.parts
    .filter((p): p is { type: "file"; url: string; mediaType: string } => p.type === "file")
    .map((p) => ({
      name: p.url.split("/").pop() ?? p.mediaType.split("/")[1] ?? "file",
      mime: p.mediaType,
      url: p.url,
    }))
}

function toMessage(m: {
  id?: string
  role: string
  content: string
  created_at?: string
  attachments?: FileAttachment[] | null
}): ChatMessage {
  return {
    id: m.id ?? nanoid(),
    role: m.role as MessageRole,
    text: m.content,
    toolEvents: [],
    files: m.attachments ?? [],
    streaming: false,
    timestamp: m.created_at ? new Date(m.created_at) : new Date(),
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useChat(activeThreadId: string | null) {
  // History from DB (stable, not streaming).
  const [historyMessages, setHistoryMessages] = useState<ChatMessage[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const mountedRef = useRef(true)
  const cursorRef = useRef<string | null>(null)

  // Keep a ref so the transport closure always reads the current thread id.
  const activeThreadIdRef = useRef(activeThreadId)
  useEffect(() => {
    activeThreadIdRef.current = activeThreadId
  }, [activeThreadId])

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Load the latest 30 messages when the active thread changes.
  useEffect(() => {
    setHistoryMessages([])
    setHasMore(false)
    cursorRef.current = null

    if (!activeThreadId) return

    setHistoryLoading(true)
    fetch(`/api/conversations/${activeThreadId}/messages?limit=30`)
      .then((r) => r.ok ? r.json() : { messages: [], has_more: false, next_cursor: null })
      .then((data: { messages: Array<{ id: string; role: string; content: string; created_at: string; attachments?: FileAttachment[] }>; has_more: boolean; next_cursor: string | null }) => {
        if (!mountedRef.current) return
        setHistoryMessages(data.messages.map(toMessage))
        setHasMore(data.has_more)
        cursorRef.current = data.next_cursor ?? null
      })
      .catch(() => {})
      .finally(() => { if (mountedRef.current) setHistoryLoading(false) })
  }, [activeThreadId])

  // Load older messages when the user scrolls to the top.
  const loadMore = useCallback(async () => {
    if (!activeThreadId || !hasMore || loadingMore || !cursorRef.current) return
    setLoadingMore(true)
    try {
      const res = await fetch(
        `/api/conversations/${activeThreadId}/messages?before=${cursorRef.current}&limit=30`
      )
      if (!res.ok) return
      const data: { messages: Array<{ id: string; role: string; content: string; created_at: string; attachments?: FileAttachment[] }>; has_more: boolean; next_cursor: string | null } = await res.json()
      if (!mountedRef.current) return
      setHistoryMessages((prev) => [...data.messages.map(toMessage), ...prev])
      setHasMore(data.has_more)
      cursorRef.current = data.next_cursor ?? null
    } finally {
      if (mountedRef.current) setLoadingMore(false)
    }
  }, [activeThreadId, hasMore, loadingMore])

  // ── AI SDK v6 streaming ──────────────────────────────────────────────────────

  // Transport is created once. The `body` function is called at request time,
  // so it always reads the latest thread_id via the ref.
  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({ thread_id: activeThreadIdRef.current }),
      })
  )

  const {
    messages: aiMessages,
    sendMessage,
    status,
    setMessages: setAIMessages,
    error: aiError,
  } = useAIChat({
    transport,
    // After the stream finishes, move user + assistant messages to historyMessages
    // and clear AI SDK state to avoid duplicates.
    onFinish: ({ message, messages: allMessages }) => {
      if (!mountedRef.current) return
      const toAdd: ChatMessage[] = []

      // Include the user message from the completed exchange.
      const userAIMsg = [...allMessages].reverse().find((m) => m.role === "user")
      if (userAIMsg) {
        toAdd.push({
          id: userAIMsg.id,
          role: "user",
          text: textFromUIMessage(userAIMsg),
          toolEvents: [],
          files: [],
          streaming: false,
          timestamp: new Date(),
        })
      }

      toAdd.push({
        id: message.id,
        role: "assistant",
        text: textFromUIMessage(message),
        toolEvents: [],
        files: filesFromUIMessage(message),
        streaming: false,
        timestamp: new Date(),
      })

      setHistoryMessages((prev) => [...prev, ...toAdd])
      setAIMessages([])
    },
    onError: (err) => {
      console.error("chat stream error:", err)
      setAIMessages([])
    },
  })

  // Reset AI SDK messages when thread changes.
  useEffect(() => {
    setAIMessages([])
  }, [activeThreadId, setAIMessages])

  const isStreaming = status === "streaming" || status === "submitted"

  // During streaming: show AI SDK messages (user + streaming assistant).
  // Once done, historyMessages has the completed exchange and aiMessages is cleared.
  const streamingMessages: ChatMessage[] = isStreaming
    ? aiMessages.map((m) => ({
        id: m.id,
        role: m.role as MessageRole,
        text: textFromUIMessage(m),
        toolEvents: [],
        files: [],
        streaming: m.role === "assistant",
        timestamp: new Date(),
      }))
    : []

  const messages: ChatMessage[] = [...historyMessages, ...streamingMessages]

  // ── Send ──────────────────────────────────────────────────────────────────

  const sendMsg = useCallback(
    (text: string) => {
      if (!text.trim()) return
      sendMessage({ text })
    },
    [sendMessage]
  )

  // Derive connection state from error status.
  const connState = aiError
    ? ("error" as const)
    : ("connected" as const)

  return {
    messages,
    sendMessage: sendMsg,
    connState,
    isConnected: !aiError,
    isStreaming,
    historyLoading,
    hasMore,
    loadingMore,
    loadMore,
  }
}
