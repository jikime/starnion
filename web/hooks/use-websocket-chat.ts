"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { ChatMessage, FileAttachment, ToolEvent } from "@/hooks/use-chat"

// ── Types ──────────────────────────────────────────────────────────────────────

export type WsConnState = "connecting" | "connected" | "reconnecting" | "error"

interface WsOutgoing {
  type: string
  id?: string
  message?: string
  thread_id?: string
  model?: string
  limit?: number
  attachments?: Array<{ url: string; mime: string; name: string }>
}

interface WsIncoming {
  type: string
  id?: string
  run_id?: string
  text?: string
  tool?: string
  input?: string    // tool_use: input_json
  result?: string   // tool_result: result
  is_error?: boolean
  bot_name?: string
  model_used?: string
  input_tokens?: number
  output_tokens?: number
  context_tokens?: number
  context_window?: number
  conv_id?: string  // new conversation id (when gateway auto-creates)
  messages?: unknown
  message?: string
}

function nanoid(): string {
  return Math.random().toString(36).slice(2, 10)
}

function toMessage(m: {
  id?: string
  role: string
  content: string
  created_at?: string
  attachments?: FileAttachment[] | null
  bot_name?: string
  model_used?: string
  input_tokens?: number
  output_tokens?: number
  context_tokens?: number
  context_window?: number
  tool_events?: string | ToolEvent[]
}): ChatMessage {
  // tool_events may come as a JSON string (from DB) or already parsed array.
  let toolEvents: ToolEvent[] = []
  if (m.tool_events) {
    if (typeof m.tool_events === "string") {
      try {
        const parsed = JSON.parse(m.tool_events)
        if (Array.isArray(parsed)) toolEvents = parsed as ToolEvent[]
      } catch { /* ignore malformed JSON */ }
    } else if (Array.isArray(m.tool_events)) {
      toolEvents = m.tool_events
    }
  }
  return {
    id: m.id ?? nanoid(),
    role: m.role as "user" | "assistant",
    text: m.content,
    toolEvents,
    files: m.attachments ?? [],
    streaming: false,
    timestamp: m.created_at ? new Date(m.created_at) : new Date(),
    botName: m.bot_name || undefined,
    modelId: m.model_used || undefined,
    inputTokens: m.input_tokens || undefined,
    outputTokens: m.output_tokens || undefined,
    contextTokens: m.context_tokens || undefined,
    contextWindow: m.context_window || undefined,
  }
}

function getWsBase(): string {
  if (typeof window === "undefined") return ""
  const override = process.env.NEXT_PUBLIC_GATEWAY_WS_URL
  if (override) return override
  const { protocol, hostname, port } = window.location
  const wsProto = protocol === "https:" ? "wss" : "ws"
  if (port) {
    // dev: Next.js :3000 → Gateway :8080
    return `${wsProto}://${hostname}:8080`
  }
  // production: same origin (nginx proxies /ws → gateway)
  return `${wsProto}://${hostname}`
}

const MAX_RECONNECT = 5
const RECONNECT_BASE_MS = 1500

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWebSocketChat(
  activeThreadId: string | null,
  overrideModelId?: string,
  onNewThread?: (convId: string) => void,
) {
  // History (REST API, supports pagination)
  const [historyMessages, setHistoryMessages] = useState<ChatMessage[]>([])
  const historyMessagesRef = useRef<ChatMessage[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const cursorRef = useRef<string | null>(null)

  // Streaming display state (drives UI)
  const [streamText, setStreamText] = useState("")
  const [streamToolEvents, setStreamToolEvents] = useState<ToolEvent[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [isThinking, setIsThinking] = useState(false)

  // Mutable refs to avoid stale closures inside ws.onmessage
  const streamTextRef = useRef("")
  const streamToolEventsRef = useRef<ToolEvent[]>([])
  const streamRunIdRef = useRef<string | null>(null)
  const lastSentRef = useRef<{ text: string; files: Array<{ url: string; mime: string; name: string }> } | null>(null)

  // WS state
  const [connState, setConnState] = useState<WsConnState>("connecting")
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectCountRef = useRef(0)
  const mountedRef = useRef(true)
  const activeThreadIdRef = useRef(activeThreadId)
  const overrideModelIdRef = useRef(overrideModelId)
  const onNewThreadRef = useRef(onNewThread)
  // final 이벤트로 신규 스레드가 생성될 때, 이미 messages를 보유하므로
  // activeThreadId 변경에 의한 history 재조회를 한 번 건너뜀
  const skipNextHistoryReloadRef = useRef(false)

  useEffect(() => { activeThreadIdRef.current = activeThreadId }, [activeThreadId])
  useEffect(() => { overrideModelIdRef.current = overrideModelId }, [overrideModelId])
  useEffect(() => { onNewThreadRef.current = onNewThread }, [onNewThread])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      wsRef.current?.close()
    }
  }, [])

  // Keep ref in sync with state for polling closure
  useEffect(() => { historyMessagesRef.current = historyMessages }, [historyMessages])

  // ── History via REST (with pagination) ───────────────────────────────────────

  useEffect(() => {
    // 첫 메시지 전송으로 스레드가 자동 생성된 경우: messages가 이미 있으므로 재조회 스킵
    if (skipNextHistoryReloadRef.current) {
      skipNextHistoryReloadRef.current = false
      return
    }
    setHistoryMessages([])
    setHasMore(false)
    cursorRef.current = null
    if (!activeThreadId) return

    setHistoryLoading(true)
    fetch(`/api/conversations/${activeThreadId}/messages?limit=30`)
      .then((r) => r.ok ? r.json() : { messages: [], has_more: false, next_cursor: null })
      .then((data: {
        messages: Array<{ id: string; role: string; content: string; created_at: string; attachments?: FileAttachment[]; bot_name?: string; model_used?: string; input_tokens?: number; output_tokens?: number; context_tokens?: number; context_window?: number; tool_events?: string }>
        has_more: boolean
        next_cursor: string | null
      }) => {
        if (!mountedRef.current) return
        setHistoryMessages(data.messages.map(toMessage))
        setHasMore(data.has_more)
        cursorRef.current = data.next_cursor ?? null
      })
      .catch(() => {})
      .finally(() => { if (mountedRef.current) setHistoryLoading(false) })
  }, [activeThreadId])

  // ── Polling for new messages (e.g. from Telegram while web chat is open) ────
  useEffect(() => {
    if (!activeThreadId) return

    const POLL_INTERVAL = 10_000 // 10 seconds

    const poll = async () => {
      // Skip while streaming (assistant is responding)
      if (isStreaming) return

      // Get the latest message timestamp
      const msgs = historyMessagesRef.current
      if (msgs.length === 0) return
      const lastTimestamp = msgs[msgs.length - 1]?.timestamp
      if (!lastTimestamp) return
      const lastCreatedAt = lastTimestamp.toISOString()

      try {
        const res = await fetch(
          `/api/conversations/${activeThreadId}/messages?since=${encodeURIComponent(lastCreatedAt)}&limit=20`
        )
        if (!res.ok) return
        const data = await res.json()
        const newMsgs: Array<{ id: string; role: string; content: string; created_at: string; attachments?: FileAttachment[]; bot_name?: string; model_used?: string; input_tokens?: number; output_tokens?: number; context_tokens?: number; context_window?: number; tool_events?: string }> = data.messages ?? []
        if (newMsgs.length === 0) return

        // Deduplicate by id
        const existingIds = new Set(msgs.map((m: ChatMessage) => m.id))
        const filtered = newMsgs.filter(m => !existingIds.has(m.id))
        if (filtered.length === 0) return

        setHistoryMessages(prev => [...prev, ...filtered.map(toMessage)])
      } catch {
        // ignore polling errors
      }
    }

    const interval = setInterval(poll, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [activeThreadId, isStreaming])

  const loadMore = useCallback(async () => {
    if (!activeThreadId || !hasMore || loadingMore || !cursorRef.current) return
    setLoadingMore(true)
    try {
      const res = await fetch(
        `/api/conversations/${activeThreadId}/messages?before=${cursorRef.current}&limit=30`
      )
      if (!res.ok) return
      const data: {
        messages: Array<{ id: string; role: string; content: string; created_at: string; attachments?: FileAttachment[]; bot_name?: string; model_used?: string; input_tokens?: number; output_tokens?: number; context_tokens?: number; context_window?: number; tool_events?: string }>
        has_more: boolean
        next_cursor: string | null
      } = await res.json()
      if (!mountedRef.current) return
      setHistoryMessages((prev) => [...data.messages.map(toMessage), ...prev])
      setHasMore(data.has_more)
      cursorRef.current = data.next_cursor ?? null
    } finally {
      if (mountedRef.current) setLoadingMore(false)
    }
  }, [activeThreadId, hasMore, loadingMore])

  // ── WebSocket connection ──────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    if (!mountedRef.current) return

    const res = await fetch("/api/ws-token").catch(() => null)
    if (!res?.ok) { setConnState("error"); return }
    const { token } = await res.json() as { token: string }

    const ws = new WebSocket(`${getWsBase()}/ws?token=${token}`)
    wsRef.current = ws
    setConnState("connecting")

    ws.onopen = () => {
      if (!mountedRef.current) return
      reconnectCountRef.current = 0
      setConnState("connected")
    }

    ws.onmessage = (event: MessageEvent) => {
      if (!mountedRef.current) return
      let msg: WsIncoming
      try { msg = JSON.parse(event.data as string) } catch { return }

      switch (msg.type) {
        case "delta":
          setIsThinking(false)
          setIsStreaming(true)
          if (msg.run_id && !streamRunIdRef.current) streamRunIdRef.current = msg.run_id
          streamTextRef.current += msg.text ?? ""
          setStreamText(streamTextRef.current)
          break

        case "tool_use":
          setIsThinking(false)
          setIsStreaming(true) // show streamingMsg so tool events are visible immediately
          streamToolEventsRef.current = [
            ...streamToolEventsRef.current,
            { tool: msg.tool ?? "tool", input: msg.input, status: "running" },
          ]
          setStreamToolEvents([...streamToolEventsRef.current])
          break

        case "tool_result": {
          // Find the last "running" event with matching tool name and mark it done
          const events = [...streamToolEventsRef.current]
          const idx = events.findLastIndex((e) => e.tool === (msg.tool ?? "") && e.status === "running")
          if (idx !== -1) {
            events[idx] = { ...events[idx], result: msg.result, isError: msg.is_error, status: msg.is_error ? "error" : "done" }
          }
          streamToolEventsRef.current = events
          setStreamToolEvents([...events])
          break
        }

        case "final": {
          // Gateway sends full accumulated text in msg.text; use it as the authoritative
          // final text. Fall back to locally streamed text if msg.text is empty.
          const finalText = msg.text || streamTextRef.current
          const finalToolEvents = [...streamToolEventsRef.current]
          // Add message if there's text OR tool events (e.g. image generation with no text response)
          if (finalText || finalToolEvents.length > 0) {
            setHistoryMessages((prev) => [
              ...prev,
              {
                id: streamRunIdRef.current ?? nanoid(),
                role: "assistant",
                text: finalText,
                toolEvents: finalToolEvents,
                files: [],
                streaming: false,
                timestamp: new Date(),
                botName: msg.bot_name,
                modelId: msg.model_used,
                inputTokens: msg.input_tokens,
                outputTokens: msg.output_tokens,
                contextTokens: msg.context_tokens,
                contextWindow: msg.context_window,
              },
            ])
          }
          // Notify parent if gateway auto-created a new conversation.
          // conv_id가 현재 스레드와 다를 때(= 첫 메시지로 신규 생성)만 플래그를 세워
          // activeThreadId 변경이 유발하는 history 재조회를 건너뜀.
          if (msg.conv_id) {
            if (msg.conv_id !== activeThreadIdRef.current) {
              skipNextHistoryReloadRef.current = true
            }
            onNewThreadRef.current?.(msg.conv_id)
          }
          // Reset streaming state
          streamTextRef.current = ""
          streamToolEventsRef.current = []
          streamRunIdRef.current = null
          setStreamText("")
          setStreamToolEvents([])
          setIsStreaming(false)
          setIsThinking(false)
          break
        }

        case "error":
          // Show error message in chat instead of silently dropping it
          setHistoryMessages((prev) => [
            ...prev,
            {
              id: nanoid(),
              role: "assistant",
              text: msg.message ? `⚠️ ${msg.message}` : "⚠️ An error occurred.",
              toolEvents: [],
              files: [],
              streaming: false,
              timestamp: new Date(),
            },
          ])
          streamTextRef.current = ""
          streamToolEventsRef.current = []
          streamRunIdRef.current = null
          setStreamText("")
          setStreamToolEvents([])
          setIsStreaming(false)
          setIsThinking(false)
          break
      }
    }

    ws.onerror = () => {
      if (!mountedRef.current) return
      setConnState("error")
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      if (reconnectCountRef.current < MAX_RECONNECT) {
        reconnectCountRef.current += 1
        setConnState("reconnecting")
        setTimeout(
          () => { if (mountedRef.current) connect() },
          // Jitter prevents thundering-herd when many clients reconnect simultaneously.
          RECONNECT_BASE_MS * reconnectCountRef.current * (0.5 + Math.random() * 0.5)
        )
      } else {
        setConnState("error")
      }
    }
  }, []) // no deps — reads refs only inside ws handlers

  useEffect(() => { connect() }, [connect])

  // Keepalive ping every 30s
  useEffect(() => {
    const id = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }))
      }
    }, 30_000)
    return () => clearInterval(id)
  }, [])

  // Reset streaming state when thread changes
  useEffect(() => {
    streamTextRef.current = ""
    streamToolEventsRef.current = []
    streamRunIdRef.current = null
    setStreamText("")
    setStreamToolEvents([])
    setIsStreaming(false)
    setIsThinking(false)
  }, [activeThreadId])

  // ── Send message ──────────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    (text: string, files?: Array<{ url: string; mime: string; name?: string }>) => {
      if ((!text.trim() && (!files || files.length === 0)) || wsRef.current?.readyState !== WebSocket.OPEN) return

      const fileAttachments: FileAttachment[] = (files ?? []).map((f) => ({
        url: f.url,
        mime: f.mime,
        name: f.name ?? f.url.split("/").pop() ?? "file",
      }))

      lastSentRef.current = { text, files: fileAttachments.map((f) => ({ url: f.url, mime: f.mime, name: f.name })) }

      // Append user message immediately (with files for display)
      setHistoryMessages((prev) => [
        ...prev,
        {
          id: nanoid(),
          role: "user",
          text,
          toolEvents: [],
          files: fileAttachments,
          streaming: false,
          timestamp: new Date(),
        },
      ])

      // Reset streaming
      streamTextRef.current = ""
      streamToolEventsRef.current = []
      streamRunIdRef.current = null
      setStreamText("")
      setStreamToolEvents([])
      setIsThinking(true)
      setIsStreaming(false)

      const payload: WsOutgoing = {
        type: "chat.send",
        id: nanoid(),
        message: text,
        thread_id: activeThreadIdRef.current ?? undefined,
        model: overrideModelIdRef.current ?? undefined,
        ...(fileAttachments.length > 0 && {
          attachments: fileAttachments.map((f) => ({ url: f.url, mime: f.mime, name: f.name })),
        }),
      }
      wsRef.current.send(JSON.stringify(payload))
    },
    [],
  )

  // ── Retry last message ───────────────────────────────────────────────────────

  const retry = useCallback(() => {
    const last = lastSentRef.current
    if (!last || wsRef.current?.readyState !== WebSocket.OPEN) return

    // Remove the last error message before re-sending
    setHistoryMessages((prev) => {
      const tail = prev[prev.length - 1]
      if (tail?.text.startsWith("⚠️")) return prev.slice(0, -1)
      return prev
    })

    streamTextRef.current = ""
    streamToolEventsRef.current = []
    streamRunIdRef.current = null
    setStreamText("")
    setStreamToolEvents([])
    setIsThinking(true)
    setIsStreaming(false)

    const payload: WsOutgoing = {
      type: "chat.send",
      id: nanoid(),
      message: last.text,
      thread_id: activeThreadIdRef.current ?? undefined,
      model: overrideModelIdRef.current ?? undefined,
      ...(last.files.length > 0 && { attachments: last.files }),
    }
    wsRef.current!.send(JSON.stringify(payload))
  }, [])

  // ── Compose final messages array ──────────────────────────────────────────────

  const streamingMsg: ChatMessage | null = isStreaming
    ? {
        id: streamRunIdRef.current ?? "streaming",
        role: "assistant",
        text: streamText,
        toolEvents: streamToolEvents,
        files: [],
        streaming: true,
        timestamp: new Date(),
      }
    : null

  const messages: ChatMessage[] = streamingMsg
    ? [...historyMessages, streamingMsg]
    : historyMessages

  const removeMessage = useCallback((msgId: string) => {
    setHistoryMessages((prev) => prev.filter((m) => m.id !== msgId))
  }, [])

  return {
    messages,
    sendMessage: sendMessage as (text: string, files?: Array<{ url: string; mime: string }>) => void,
    retry,
    connState: connState === "connected" ? ("connected" as const) : ("error" as const),
    isConnected: connState === "connected",
    isStreaming,
    isThinking,
    historyLoading,
    hasMore,
    loadingMore,
    loadMore,
    removeMessage,
  }
}
