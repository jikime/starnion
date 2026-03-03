"use client"

import { useCallback, useEffect, useRef, useState } from "react"

// ── Frame types (mirrors gateway/internal/wschat/frames.go) ──────────────────

type FrameType = "req" | "res" | "event"

interface OutFrame {
  type: FrameType
  id?: string
  ok?: boolean
  payload?: unknown
  event?: string
}

// ── Message model ─────────────────────────────────────────────────────────────

export type MessageRole = "user" | "assistant"

export interface ToolEvent {
  tool: string
  result?: string
}

export interface FileAttachment {
  name: string
  mime: string
  url: string // MinIO public URL
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

// ── Connection state ──────────────────────────────────────────────────────────

type ConnState = "disconnected" | "connecting" | "connected" | "error"

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080/ws"

// ── Token helpers ─────────────────────────────────────────────────────────────

async function fetchToken(): Promise<string> {
  const res = await fetch("/api/ws-token")
  if (!res.ok) throw new Error("failed to obtain WS token")
  const data = await res.json()
  return data.token as string
}

function nanoid(): string {
  return Math.random().toString(36).slice(2, 10)
}

// ── Hook ──────────────────────────────────────────────────────────────────────

function nanoidFull(): string {
  return `${nanoid()}-${nanoid()}`
}

function toMessage(m: {
  id?: string
  role: string
  content: string
  created_at?: string
  attachments?: FileAttachment[] | null
}): ChatMessage {
  return {
    id: m.id ?? nanoidFull(),
    role: m.role as MessageRole,
    text: m.content,
    toolEvents: [],
    files: m.attachments ?? [],
    streaming: false,
    timestamp: m.created_at ? new Date(m.created_at) : new Date(),
  }
}

export function useChat(activeThreadId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [connState, setConnState] = useState<ConnState>("disconnected")
  const [isStreaming, setIsStreaming] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const tokenRef = useRef<string | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  const cursorRef = useRef<string | null>(null)

  // Load latest page of messages when the active thread changes.
  useEffect(() => {
    setMessages([])
    setIsStreaming(false)
    setHasMore(false)
    cursorRef.current = null

    if (!activeThreadId) return

    setHistoryLoading(true)
    fetch(`/api/conversations/${activeThreadId}/messages?limit=30`)
      .then((r) => r.ok ? r.json() : { messages: [], has_more: false, next_cursor: null })
      .then((data: { messages: { id: string; role: string; content: string; created_at: string }[]; has_more: boolean; next_cursor: string | null }) => {
        if (!mountedRef.current) return
        setMessages(data.messages.map(toMessage))
        setHasMore(data.has_more)
        cursorRef.current = data.next_cursor ?? null
      })
      .catch(() => {})
      .finally(() => {
        if (mountedRef.current) setHistoryLoading(false)
      })
  }, [activeThreadId])

  // Load older messages (called when user scrolls to top).
  const loadMore = useCallback(async () => {
    if (!activeThreadId || !hasMore || loadingMore || !cursorRef.current) return
    setLoadingMore(true)
    try {
      const res = await fetch(
        `/api/conversations/${activeThreadId}/messages?before=${cursorRef.current}&limit=30`
      )
      if (!res.ok) return
      const data: { messages: { id: string; role: string; content: string; created_at: string; attachments?: FileAttachment[] }[]; has_more: boolean; next_cursor: string | null } = await res.json()
      if (!mountedRef.current) return
      setMessages((prev) => [...data.messages.map(toMessage), ...prev])
      setHasMore(data.has_more)
      cursorRef.current = data.next_cursor ?? null
    } finally {
      if (mountedRef.current) setLoadingMore(false)
    }
  }, [activeThreadId, hasMore, loadingMore])

  // ── Message helpers ─────────────────────────────────────────────────────────

  const addUserMessage = useCallback((text: string): string => {
    const id = nanoid()
    const msg: ChatMessage = {
      id,
      role: "user",
      text,
      toolEvents: [],
      files: [],
      streaming: false,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, msg])
    return id
  }, [])

  const appendAssistantChunk = useCallback((requestID: string, chunk: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === requestID ? { ...m, text: m.text + chunk, streaming: true } : m
      )
    )
  }, [])

  const addAssistantMessage = useCallback((requestID: string) => {
    const msg: ChatMessage = {
      id: requestID,
      role: "assistant",
      text: "",
      toolEvents: [],
      files: [],
      streaming: true,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, msg])
  }, [])

  const finalizeAssistant = useCallback((requestID: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === requestID ? { ...m, streaming: false } : m))
    )
    setIsStreaming(false)
  }, [])

  const appendToolEvent = useCallback((requestID: string, event: ToolEvent) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === requestID ? { ...m, toolEvents: [...m.toolEvents, event] } : m
      )
    )
  }, [])

  const appendFile = useCallback((requestID: string, file: FileAttachment) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === requestID ? { ...m, files: [...m.files, file] } : m
      )
    )
  }, [])

  // ── WebSocket frame handler ─────────────────────────────────────────────────

  const handleFrame = useCallback(
    (frame: OutFrame) => {
      if (frame.type !== "event" || !frame.id || !frame.event) return

      const payload = frame.payload as Record<string, string> | undefined
      const requestID = frame.id

      switch (frame.event) {
        case "text":
          appendAssistantChunk(requestID, payload?.text ?? "")
          break
        case "tool_call":
          appendToolEvent(requestID, { tool: payload?.tool ?? "" })
          break
        case "tool_result":
          appendToolEvent(requestID, {
            tool: payload?.tool ?? "",
            result: payload?.result,
          })
          break
        case "file":
          appendFile(requestID, {
            name: payload?.name ?? "file",
            mime: payload?.mime ?? "application/octet-stream",
            url: payload?.url ?? "",
          })
          break
        case "error":
          appendAssistantChunk(requestID, `\n\n⚠️ ${payload?.message ?? "오류가 발생했어요."}`)
          finalizeAssistant(requestID)
          break
        case "done":
          finalizeAssistant(requestID)
          break
      }
    },
    [appendAssistantChunk, appendToolEvent, appendFile, finalizeAssistant]
  )

  // ── WebSocket connection ────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    if (!mountedRef.current) return
    setConnState("connecting")

    try {
      if (!tokenRef.current) {
        tokenRef.current = await fetchToken()
      }
    } catch {
      setConnState("error")
      return
    }

    const url = `${WS_URL}?token=${encodeURIComponent(tokenRef.current)}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) return
      setConnState("connected")
    }

    ws.onmessage = (ev) => {
      try {
        const frame: OutFrame = JSON.parse(ev.data as string)
        handleFrame(frame)
      } catch {
        // ignore malformed frames
      }
    }

    ws.onerror = () => {
      setConnState("error")
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      setConnState("disconnected")
      wsRef.current = null
      reconnectTimer.current = setTimeout(() => {
        if (mountedRef.current) connect()
      }, 3000)
    }
  }, [handleFrame])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  // ── Send message ────────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim() || wsRef.current?.readyState !== WebSocket.OPEN) return

      const requestID = nanoid()
      addUserMessage(text)
      addAssistantMessage(requestID)
      setIsStreaming(true)

      const frame = {
        type: "req" as const,
        id: requestID,
        method: "chat",
        params: {
          message: text,
          ...(activeThreadId ? { thread_id: activeThreadId } : {}),
        },
      }
      wsRef.current.send(JSON.stringify(frame))
    },
    [addUserMessage, addAssistantMessage, activeThreadId]
  )

  return {
    messages,
    sendMessage,
    connState,
    isConnected: connState === "connected",
    isStreaming,
    historyLoading,
    hasMore,
    loadingMore,
    loadMore,
  }
}
