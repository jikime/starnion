"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Download, FileAudio, Mic, MicOff, RefreshCw, Square, Trash2, Upload } from "lucide-react"

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface AudioItem {
  id: number
  url: string
  name: string
  mime: string
  size: number
  duration: number
  source: string    // 'web' | 'telegram' | 'webchat'
  type: string      // 'uploaded' | 'recorded' | 'generated'
  transcript: string
  prompt: string
  size_label: string
  created_at: string
}

// ────────────────────────────────────────────────────────────────────────────
// SSE helper – reads the chat stream and extracts text / file events
// ────────────────────────────────────────────────────────────────────────────

async function callAudioStream(
  formData: FormData,
  onText: (delta: string) => void,
  onFile: (url: string, mime: string, name: string) => void,
  onDone: () => void,
  onError: (msg: string) => void
): Promise<void> {
  const res = await fetch("/api/audios/action", { method: "POST", body: formData }).catch(() => null)
  if (!res || !res.ok || !res.body) {
    onError("요청에 실패했어요. 다시 시도해 주세요.")
    onDone()
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })

    const lines = buf.split("\n")
    buf = lines.pop() ?? ""

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue
      const raw = line.slice(6).trim()
      if (raw === "[DONE]") { onDone(); return }
      try {
        const chunk = JSON.parse(raw)
        if (chunk.type === "text-delta" && chunk.delta) {
          onText(chunk.delta as string)
        } else if (chunk.type === "file" && chunk.url) {
          onFile(chunk.url as string, chunk.mediaType as string, chunk.name as string)
        } else if (chunk.type === "error") {
          onError(chunk.errorText ?? "오류가 발생했어요.")
        }
      } catch {
        // ignore non-JSON lines
      }
    }
  }
  onDone()
}

// ────────────────────────────────────────────────────────────────────────────
// Badge helpers
// ────────────────────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
    web:      { label: "Web",      variant: "default" },
    telegram: { label: "Telegram", variant: "secondary" },
    webchat:  { label: "Webchat",  variant: "outline" },
  }
  const { label, variant } = map[source] ?? { label: source, variant: "outline" }
  return <Badge variant={variant} className="text-xs">{label}</Badge>
}

function TypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; className: string }> = {
    uploaded:  { label: "업로드",  className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
    recorded:  { label: "녹음",    className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
    generated: { label: "생성됨",  className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
  }
  const { label, className } = map[type] ?? { label: type, className: "" }
  return <Badge variant="outline" className={`text-xs ${className}`}>{label}</Badge>
}

function fmtDuration(s: number): string {
  if (!s) return ""
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, "0")}`
}

// ────────────────────────────────────────────────────────────────────────────
// RecordTab
// ────────────────────────────────────────────────────────────────────────────

function RecordTab({ onSaved }: { onSaved: () => void }) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [processing, setProcessing] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [error, setError] = useState("")

  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const startRecording = useCallback(async () => {
    setError("")
    setTranscript("")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm"
      const mr = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.start(250)
      mediaRef.current = mr
      setRecording(true)
      setSeconds(0)
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
    } catch {
      setError("마이크 접근 권한이 필요합니다.")
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (!mediaRef.current) return
    mediaRef.current.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: mediaRef.current?.mimeType ?? "audio/webm" })
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null

      setProcessing(true)
      setTranscript("")
      const file = new File([blob], "recording.webm", { type: blob.type })
      const fd = new FormData()
      fd.append("action", "transcribe")
      fd.append("message", "")
      fd.append("file", file)

      let text = ""
      await callAudioStream(
        fd,
        (delta) => { text += delta; setTranscript(text) },
        () => {},
        () => { setProcessing(false); onSaved() },
        (msg) => { setError(msg); setProcessing(false) }
      )
    }
    mediaRef.current.stop()
    mediaRef.current = null
    setRecording(false)
    if (timerRef.current) clearInterval(timerRef.current)
  }, [onSaved])

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>음성 녹음</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center py-10 gap-6">
        <div className={`size-32 rounded-full flex items-center justify-center transition-colors ${
          recording ? "bg-red-100 dark:bg-red-900/30 animate-pulse" : "bg-primary/10"
        }`}>
          {recording
            ? <MicOff className="size-14 text-red-500" />
            : <Mic className="size-14 text-primary" />
          }
        </div>

        {recording && (
          <p className="text-2xl font-mono tabular-nums text-red-500">
            {fmtDuration(seconds)}
          </p>
        )}

        {!recording && !processing && (
          <p className="text-sm text-muted-foreground">녹음 버튼을 눌러 시작하세요</p>
        )}

        <div className="flex gap-3">
          {!recording && !processing && (
            <Button size="lg" onClick={startRecording} className="gap-2">
              <Mic className="size-5" />
              녹음 시작
            </Button>
          )}
          {recording && (
            <Button size="lg" variant="destructive" onClick={stopRecording} className="gap-2">
              <Square className="size-5" />
              녹음 중지 및 변환
            </Button>
          )}
          {processing && (
            <Button size="lg" disabled className="gap-2">
              <RefreshCw className="size-4 animate-spin" />
              변환 중...
            </Button>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {transcript && (
          <div className="w-full rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground mb-1">변환 결과</p>
            <p className="text-sm whitespace-pre-wrap">{transcript}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// TranscribeTab
// ────────────────────────────────────────────────────────────────────────────

function TranscribeTab({ onSaved }: { onSaved: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [processing, setProcessing] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = (f: File) => {
    setFile(f)
    setTranscript("")
    setError("")
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  const handleTranscribe = async () => {
    if (!file) return
    setProcessing(true)
    setTranscript("")
    setError("")

    const fd = new FormData()
    fd.append("action", "transcribe")
    fd.append("message", "")
    fd.append("file", file)

    let text = ""
    await callAudioStream(
      fd,
      (delta) => { text += delta; setTranscript(text) },
      () => {},
      () => { setProcessing(false); onSaved() },
      (msg) => { setError(msg); setProcessing(false) }
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>텍스트 변환 (STT)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div
          className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }}
          />
          <Upload className="mx-auto size-10 text-muted-foreground mb-3" />
          {file ? (
            <p className="font-medium">{file.name}</p>
          ) : (
            <>
              <p className="font-medium mb-1">오디오 파일 업로드</p>
              <p className="text-sm text-muted-foreground">MP3, M4A, WAV, OGG, WebM 지원 (클릭 또는 드래그)</p>
            </>
          )}
        </div>

        <Button
          className="w-full gap-2"
          disabled={!file || processing}
          onClick={handleTranscribe}
        >
          {processing ? <RefreshCw className="size-4 animate-spin" /> : <FileAudio className="size-4" />}
          {processing ? "변환 중..." : "텍스트로 변환"}
        </Button>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {transcript && (
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground mb-1">변환 결과</p>
            <p className="text-sm whitespace-pre-wrap">{transcript}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// FileListTab
// ────────────────────────────────────────────────────────────────────────────

function FileListTab({ refreshKey }: { refreshKey: number }) {
  const [items, setItems] = useState<AudioItem[]>([])
  const [loading, setLoading] = useState(true)
  const [playingId, setPlayingId] = useState<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/audios")
      if (res.ok) setItems(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load, refreshKey])

  const handleDelete = async (id: number) => {
    if (!confirm("삭제하시겠어요?")) return
    await fetch(`/api/audios/${id}`, { method: "DELETE" })
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  const handlePlay = (item: AudioItem) => {
    if (playingId === item.id) {
      audioRef.current?.pause()
      setPlayingId(null)
      return
    }
    if (audioRef.current) audioRef.current.pause()
    const audio = new Audio(item.url)
    audio.onended = () => setPlayingId(null)
    audio.play()
    audioRef.current = audio
    setPlayingId(item.id)
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-12">
          <RefreshCw className="size-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>오디오 파일</CardTitle>
        <Button variant="ghost" size="sm" onClick={load} className="gap-1">
          <RefreshCw className="size-4" />
          새로고침
        </Button>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-muted-foreground gap-2">
            <FileAudio className="size-10" />
            <p className="text-sm">저장된 오디오가 없어요</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="flex flex-col gap-2 rounded-lg border border-border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileAudio className="size-5 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[
                          item.size_label,
                          item.duration ? fmtDuration(item.duration) : null,
                          item.created_at,
                        ].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      title={playingId === item.id ? "정지" : "재생"}
                      onClick={() => handlePlay(item)}
                    >
                      {playingId === item.id
                        ? <Square className="size-4 text-primary" />
                        : <span className="text-primary text-xs">▶</span>
                      }
                    </Button>
                    <a href={item.url} download={item.name} target="_blank" rel="noreferrer">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="다운로드">
                        <Download className="size-4" />
                      </Button>
                    </a>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      title="삭제"
                      onClick={() => handleDelete(item.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex gap-1.5 flex-wrap">
                  <SourceBadge source={item.source} />
                  <TypeBadge type={item.type} />
                </div>

                {item.transcript && (
                  <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">전사: </span>
                    {item.transcript}
                  </div>
                )}
                {item.prompt && (
                  <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">프롬프트: </span>
                    {item.prompt}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────────────

export default function AudioPage() {
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = () => setRefreshKey((k) => k + 1)

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">오디오</h1>
        <p className="text-muted-foreground">음성 녹음, 텍스트 변환 및 파일 관리</p>
      </div>

      <Tabs defaultValue="record" className="space-y-6">
        <TabsList>
          <TabsTrigger value="record" className="gap-2">
            <Mic className="size-4" />
            녹음
          </TabsTrigger>
          <TabsTrigger value="transcribe" className="gap-2">
            <FileAudio className="size-4" />
            텍스트 변환
          </TabsTrigger>
          <TabsTrigger value="files" className="gap-2">
            <Upload className="size-4" />
            파일 목록
          </TabsTrigger>
        </TabsList>

        <TabsContent value="record">
          <RecordTab onSaved={refresh} />
        </TabsContent>

        <TabsContent value="transcribe">
          <TranscribeTab onSaved={refresh} />
        </TabsContent>

        <TabsContent value="files">
          <FileListTab refreshKey={refreshKey} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
