"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AudioRecorder } from "@/components/chat/audio-recorder"
import { Download, FileAudio, Mic, RefreshCw, Square, Trash2, Upload } from "lucide-react"

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
  source: string
  type: string
  transcript: string
  prompt: string
  size_label: string
  created_at: string
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function fmtDuration(s: number): string {
  if (!s) return ""
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, "0")}`
}

/** Upload a Blob to MinIO and return {url, name, mime, size}. */
async function uploadBlob(blob: Blob, mimeType: string) {
  const ext = mimeType.split("/")[1]?.split(";")[0] ?? "webm"
  const name = `voice-${Date.now()}.${ext}`
  const file = new File([blob], name, { type: mimeType })
  const fd = new FormData()
  fd.append("file", file)
  const res = await fetch("/api/upload", { method: "POST", body: fd })
  if (!res.ok) throw new Error("upload failed")
  const data = await res.json()
  return { url: data.url as string, name: data.name as string, mime: mimeType, size: blob.size }
}

/** Upload a File to MinIO and return {url, name, mime, size}. */
async function uploadFile(file: File) {
  const fd = new FormData()
  fd.append("file", file)
  const res = await fetch("/api/upload", { method: "POST", body: fd })
  if (!res.ok) throw new Error("upload failed")
  const data = await res.json()
  return { url: data.url as string, name: data.name as string, mime: file.type, size: file.size }
}

/** Save audio metadata to DB. Returns the new row id. */
async function saveAudioMeta(params: {
  url: string; name: string; mime: string; size: number
  type: "recorded" | "uploaded" | "generated"; duration?: number
}): Promise<number> {
  const res = await fetch("/api/audios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: "web", duration: 0, ...params }),
  })
  if (!res.ok) throw new Error("save failed")
  const data = await res.json()
  return data.id as number
}

/** Patch transcript on an existing audio row. */
async function patchTranscript(id: number, transcript: string) {
  await fetch(`/api/audios/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript }),
  })
}

/**
 * Stream STT from the action endpoint.
 * Calls onText with each delta; returns the full transcript string.
 */
async function streamTranscript(
  fileUrl: string, fileName: string, fileMime: string,
  onText: (delta: string) => void
): Promise<string> {
  const res = await fetch("/api/audios/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "transcribe", file_url: fileUrl, file_name: fileName, file_mime: fileMime }),
  })
  if (!res.ok || !res.body) throw new Error("stream failed")

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ""
  let full = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split("\n")
    buf = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue
      const raw = line.slice(6).trim()
      if (raw === "[DONE]") return full
      try {
        const chunk = JSON.parse(raw)
        if (chunk.type === "text-delta" && chunk.delta) {
          full += chunk.delta as string
          onText(chunk.delta as string)
        } else if (chunk.type === "error") {
          throw new Error(chunk.errorText ?? "agent error")
        }
      } catch { /* skip malformed */ }
    }
  }
  return full
}

// ────────────────────────────────────────────────────────────────────────────
// Badges
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
  const t = useTranslations("audio")
  const map: Record<string, { labelKey: string; className: string }> = {
    uploaded:  { labelKey: "typeBadges.uploaded",  className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
    recorded:  { labelKey: "typeBadges.recorded",  className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
    generated: { labelKey: "typeBadges.generated", className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
  }
  const entry = map[type]
  const label = entry ? t(entry.labelKey as Parameters<typeof t>[0]) : type
  const className = entry?.className ?? ""
  return <Badge variant="outline" className={`text-xs ${className}`}>{label}</Badge>
}

// ────────────────────────────────────────────────────────────────────────────
// RecordTab  –  uses the WaveSurfer AudioRecorder from webchat
// ────────────────────────────────────────────────────────────────────────────

function RecordTab({ onSaved }: { onSaved: () => void }) {
  const t = useTranslations("audio")
  const [showRecorder, setShowRecorder] = useState(false)
  const [status, setStatus] = useState<"idle" | "uploading" | "transcribing" | "done" | "error">("idle")
  const [transcript, setTranscript] = useState("")
  const [error, setError] = useState("")

  const reset = () => {
    setShowRecorder(false)
    setStatus("idle")
    setTranscript("")
    setError("")
  }

  const handleAttach = useCallback(async (blob: Blob, mimeType: string) => {
    setShowRecorder(false)
    setError("")
    setTranscript("")

    try {
      // 1. Upload to MinIO
      setStatus("uploading")
      const { url, name, mime, size } = await uploadBlob(blob, mimeType)

      // 2. Save metadata to DB as 'recorded'
      const audioId = await saveAudioMeta({ url, name, mime, size, type: "recorded" })

      // 3. Stream STT
      setStatus("transcribing")
      let full = ""
      full = await streamTranscript(url, name, mime, (delta) => {
        setTranscript((t) => t + delta)
      })

      // 4. Patch transcript
      if (full) await patchTranscript(audioId, full)

      setStatus("done")
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"))
      setStatus("error")
    }
  }, [onSaved, t])

  const handleCancel = useCallback(() => {
    setShowRecorder(false)
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("recordTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 py-6">
        {/* Recorder widget */}
        {showRecorder ? (
          <AudioRecorder onAttach={handleAttach} onCancel={handleCancel} />
        ) : (
          <div className="flex flex-col items-center gap-4">
            {status === "idle" && (
              <>
                <div className="size-24 rounded-full bg-primary/10 flex items-center justify-center">
                  <Mic className="size-12 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground">{t("micPrompt")}</p>
                <Button size="lg" className="gap-2" onClick={() => setShowRecorder(true)}>
                  <Mic className="size-5" />
                  {t("startRecording")}
                </Button>
              </>
            )}

            {(status === "uploading" || status === "transcribing") && (
              <div className="flex flex-col items-center gap-3">
                <RefreshCw className="size-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  {status === "uploading" ? t("uploading") : t("transcribing")}
                </p>
              </div>
            )}

            {status === "done" && (
              <Button variant="outline" size="sm" className="gap-2" onClick={reset}>
                <Mic className="size-4" />
                {t("reRecord")}
              </Button>
            )}

            {status === "error" && (
              <div className="flex flex-col items-center gap-3">
                <p className="text-sm text-destructive">{error}</p>
                <Button variant="outline" size="sm" onClick={reset}>{t("retry")}</Button>
              </div>
            )}
          </div>
        )}

        {/* Live transcript */}
        {transcript && (
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground mb-1">{t("transcriptResult")}</p>
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
  const t = useTranslations("audio")
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<"idle" | "uploading" | "transcribing" | "done" | "error">("idle")
  const [transcript, setTranscript] = useState("")
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = (f: File) => {
    setFile(f)
    setTranscript("")
    setError("")
    setStatus("idle")
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  const handleTranscribe = async () => {
    if (!file) return
    setError("")
    setTranscript("")

    try {
      // 1. Upload
      setStatus("uploading")
      const { url, name, mime, size } = await uploadFile(file)

      // 2. Save metadata
      const audioId = await saveAudioMeta({ url, name, mime, size, type: "uploaded" })

      // 3. Stream STT
      setStatus("transcribing")
      let full = ""
      full = await streamTranscript(url, name, mime, (delta) => {
        setTranscript((t) => t + delta)
      })

      // 4. Patch transcript
      if (full) await patchTranscript(audioId, full)

      setStatus("done")
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"))
      setStatus("error")
    }
  }

  const busy = status === "uploading" || status === "transcribing"

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("transcribeTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div
          className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => !busy && inputRef.current?.click()}
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
              <p className="font-medium mb-1">{t("uploadAudio")}</p>
              <p className="text-sm text-muted-foreground">{t("audioFormats")}</p>
            </>
          )}
        </div>

        <Button className="w-full gap-2" disabled={!file || busy} onClick={handleTranscribe}>
          {busy ? <RefreshCw className="size-4 animate-spin" /> : <FileAudio className="size-4" />}
          {status === "uploading" ? t("uploading") : status === "transcribing" ? t("converting") : t("convertButton")}
        </Button>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {transcript && (
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground mb-1">{t("transcriptResult")}</p>
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
  const t = useTranslations("audio")
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
    if (!confirm(t("deleteConfirm"))) return
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
        <CardTitle>{t("filesTitle")}</CardTitle>
        <Button variant="ghost" size="sm" onClick={load} className="gap-1">
          <RefreshCw className="size-4" />
          {t("refresh")}
        </Button>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-muted-foreground gap-2">
            <FileAudio className="size-10" />
            <p className="text-sm">{t("noFiles")}</p>
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
                      title={playingId === item.id ? t("stop") : t("play")}
                      onClick={() => handlePlay(item)}
                    >
                      {playingId === item.id
                        ? <Square className="size-4 text-primary" />
                        : <span className="text-primary text-xs font-bold">▶</span>
                      }
                    </Button>
                    <a href={item.url} download={item.name} target="_blank" rel="noreferrer">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title={t("download")}>
                        <Download className="size-4" />
                      </Button>
                    </a>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      title={t("delete")}
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
                    <span className="font-medium text-foreground">{t("transcript")}: </span>
                    {item.transcript}
                  </div>
                )}
                {item.prompt && (
                  <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{t("prompt")}: </span>
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
  const t = useTranslations("audio")
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = () => setRefreshKey((k) => k + 1)

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Tabs defaultValue="record" className="space-y-6">
        <TabsList>
          <TabsTrigger value="record" className="gap-2">
            <Mic className="size-4" />
            {t("tabRecord")}
          </TabsTrigger>
          <TabsTrigger value="transcribe" className="gap-2">
            <FileAudio className="size-4" />
            {t("tabTranscribe")}
          </TabsTrigger>
          <TabsTrigger value="files" className="gap-2">
            <Upload className="size-4" />
            {t("tabFiles")}
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
