"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AudioRecorder } from "@/components/chat/audio-recorder"
import {
  AlertTriangle,
  Download,
  FileAudio,
  Mic,
  Music,
  RefreshCw,
  Square,
  Trash2,
  Upload,
} from "lucide-react"
import { cn } from "@/lib/utils"

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
// Color maps
// ────────────────────────────────────────────────────────────────────────────

const TYPE_BADGE: Record<string, string> = {
  uploaded:  "bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
  recorded:  "bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  generated: "bg-violet-100 text-violet-700 border border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800",
}

const TYPE_LEFT_BORDER: Record<string, string> = {
  uploaded:  "border-l-blue-400",
  recorded:  "border-l-emerald-400",
  generated: "border-l-violet-400",
}

const TYPE_ICON_BG: Record<string, string> = {
  uploaded:  "bg-blue-100 dark:bg-blue-950/50",
  recorded:  "bg-emerald-100 dark:bg-emerald-950/50",
  generated: "bg-violet-100 dark:bg-violet-950/50",
}

const TYPE_ICON_COLOR: Record<string, string> = {
  uploaded:  "text-blue-500",
  recorded:  "text-emerald-500",
  generated: "text-violet-500",
}

const SOURCE_BADGE: Record<string, string> = {
  web:      "bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700",
  telegram: "bg-sky-100 text-sky-700 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800",
  webchat:  "bg-indigo-100 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800",
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

async function uploadFile(file: File) {
  const fd = new FormData()
  fd.append("file", file)
  const res = await fetch("/api/upload", { method: "POST", body: fd })
  if (!res.ok) throw new Error("upload failed")
  const data = await res.json()
  return { url: data.url as string, name: data.name as string, mime: file.type, size: file.size }
}

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

async function patchTranscript(id: number, transcript: string) {
  await fetch(`/api/audios/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript }),
  })
}

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
// TranscriptBox
// ────────────────────────────────────────────────────────────────────────────

function TranscriptBox({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/50">
        <span className="size-1.5 rounded-full bg-emerald-400 shrink-0" />
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>
      <p className="px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed">{text}</p>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// RecordTab
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
      setStatus("uploading")
      const { url, name, mime, size } = await uploadBlob(blob, mimeType)
      const audioId = await saveAudioMeta({ url, name, mime, size, type: "recorded" })

      setStatus("transcribing")
      let full = ""
      full = await streamTranscript(url, name, mime, (delta) => {
        setTranscript((prev) => prev + delta)
      })

      if (full) await patchTranscript(audioId, full)
      setStatus("done")
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"))
      setStatus("error")
    }
  }, [onSaved, t])

  const handleCancel = useCallback(() => setShowRecorder(false), [])

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border/60">
        <div className="rounded-lg p-1.5 bg-red-100 dark:bg-red-950/50">
          <Mic className="size-4 text-red-600 dark:text-red-400" />
        </div>
        <p className="font-semibold text-sm">{t("recordTitle")}</p>
      </div>

      <div className="p-5 space-y-6">
        {showRecorder ? (
          <AudioRecorder onAttach={handleAttach} onCancel={handleCancel} />
        ) : (
          <div className="flex flex-col items-center gap-5 py-4">
            {status === "idle" && (
              <>
                {/* Mic button with pulse ring */}
                <div className="relative flex items-center justify-center">
                  <span className="absolute size-28 rounded-full bg-red-100 dark:bg-red-950/30 animate-ping opacity-30" />
                  <span className="absolute size-24 rounded-full bg-red-100 dark:bg-red-950/40 opacity-50" />
                  <div className="relative size-20 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center ring-4 ring-red-200/50 dark:ring-red-800/30">
                    <Mic className="size-9 text-red-500" />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{t("micPrompt")}</p>
                <Button size="lg" className="gap-2 bg-red-500 hover:bg-red-600 text-white border-0" onClick={() => setShowRecorder(true)}>
                  <Mic className="size-5" />
                  {t("startRecording")}
                </Button>
              </>
            )}

            {(status === "uploading" || status === "transcribing") && (
              <div className="flex flex-col items-center gap-4">
                {/* Step indicators */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <div className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full border font-medium transition-colors",
                    status === "uploading"
                      ? "border-sky-300 bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-700"
                      : "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-700"
                  )}>
                    <RefreshCw className="size-3 animate-spin" />
                    {status === "uploading" ? t("uploading") : t("transcribing")}
                  </div>
                </div>
                <div className="flex gap-2">
                  {["uploading", "transcribing"].map((step) => (
                    <div
                      key={step}
                      className={cn(
                        "h-1.5 w-16 rounded-full transition-colors",
                        status === step
                          ? "bg-primary animate-pulse"
                          : status === "transcribing" && step === "uploading"
                          ? "bg-emerald-400"
                          : "bg-muted"
                      )}
                    />
                  ))}
                </div>
              </div>
            )}

            {status === "done" && (
              <div className="flex flex-col items-center gap-3">
                <div className="size-14 rounded-full bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center">
                  <span className="text-2xl">✓</span>
                </div>
                <Button variant="outline" size="sm" className="gap-2" onClick={reset}>
                  <Mic className="size-4" />
                  {t("reRecord")}
                </Button>
              </div>
            )}

            {status === "error" && (
              <div className="flex flex-col items-center gap-3 w-full">
                <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive w-full">
                  <AlertTriangle className="size-4 shrink-0" />
                  {error}
                </div>
                <Button variant="outline" size="sm" onClick={reset}>{t("retry")}</Button>
              </div>
            )}
          </div>
        )}

        {transcript && (
          <TranscriptBox label={t("transcriptResult")} text={transcript} />
        )}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// TranscribeTab
// ────────────────────────────────────────────────────────────────────────────

function TranscribeTab({ onSaved }: { onSaved: () => void }) {
  const t = useTranslations("audio")
  const [file, setFile] = useState<File | null>(null)
  const [drag, setDrag] = useState(false)
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
    setDrag(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  const handleTranscribe = async () => {
    if (!file) return
    setError("")
    setTranscript("")

    try {
      setStatus("uploading")
      const { url, name, mime, size } = await uploadFile(file)
      const audioId = await saveAudioMeta({ url, name, mime, size, type: "uploaded" })

      setStatus("transcribing")
      let full = ""
      full = await streamTranscript(url, name, mime, (delta) => {
        setTranscript((prev) => prev + delta)
      })

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
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border/60">
        <div className="rounded-lg p-1.5 bg-sky-100 dark:bg-sky-950/50">
          <FileAudio className="size-4 text-sky-600 dark:text-sky-400" />
        </div>
        <p className="font-semibold text-sm">{t("transcribeTitle")}</p>
      </div>

      <div className="p-5 space-y-5">
        {/* Drop zone */}
        <div
          className={cn(
            "border-2 border-dashed rounded-xl p-10 text-center transition-colors",
            drag ? "border-primary bg-primary/5" : "border-border hover:border-sky-400/60 hover:bg-sky-50/20 dark:hover:bg-sky-950/10",
            busy && "pointer-events-none opacity-60",
            !busy && "cursor-pointer"
          )}
          onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
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
          {file ? (
            <div className="flex flex-col items-center gap-3">
              <div className="size-12 rounded-full bg-sky-100 dark:bg-sky-950/50 flex items-center justify-center">
                <FileAudio className="size-6 text-sky-500" />
              </div>
              <p className="font-medium text-sm truncate max-w-xs">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          ) : (
            <>
              <div className={cn(
                "mx-auto size-12 rounded-full flex items-center justify-center mb-3 transition-colors",
                drag ? "bg-primary/10" : "bg-sky-100 dark:bg-sky-950/50"
              )}>
                <Upload className={cn("size-6 transition-colors", drag ? "text-primary" : "text-sky-500")} />
              </div>
              <p className="font-medium text-sm mb-1">{t("uploadAudio")}</p>
              <p className="text-xs text-muted-foreground">{t("audioFormats")}</p>
            </>
          )}
        </div>

        <Button className="w-full gap-2" disabled={!file || busy} onClick={handleTranscribe}>
          {busy
            ? <><RefreshCw className="size-4 animate-spin" />{status === "uploading" ? t("uploading") : t("converting")}</>
            : <><FileAudio className="size-4" />{t("convertButton")}</>
          }
        </Button>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" />
            {error}
          </div>
        )}

        {transcript && (
          <TranscriptBox label={t("transcriptResult")} text={transcript} />
        )}
      </div>
    </div>
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

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
        <div className="flex items-center gap-2">
          <div className="rounded-lg p-1.5 bg-violet-100 dark:bg-violet-950/50">
            <Music className="size-4 text-violet-600 dark:text-violet-400" />
          </div>
          <p className="font-semibold text-sm">{t("filesTitle")}</p>
          {items.length > 0 && (
            <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
              {items.length}
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={load} className="gap-1.5 text-xs" disabled={loading}>
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          {t("refresh")}
        </Button>
      </div>

      <div className="p-5">
        {loading ? (
          <div className="flex justify-center py-12">
            <RefreshCw className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <div className="rounded-full p-4 bg-muted/50">
              <FileAudio className="size-8 opacity-40" />
            </div>
            <p className="text-sm">{t("noFiles")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "group flex flex-col gap-2.5 rounded-xl border border-border bg-background overflow-hidden",
                  "border-l-4 transition-colors hover:border-border/80",
                  TYPE_LEFT_BORDER[item.type] ?? "border-l-border"
                )}
              >
                <div className="px-4 pt-4 pb-3 border-b border-border/50">
                  <div className="flex items-center justify-between gap-2">
                    {/* Icon + name */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={cn(
                        "rounded-lg p-1.5 shrink-0",
                        TYPE_ICON_BG[item.type] ?? "bg-muted"
                      )}>
                        <FileAudio className={cn("size-3.5", TYPE_ICON_COLOR[item.type] ?? "text-muted-foreground")} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {[
                            item.size_label,
                            item.duration ? fmtDuration(item.duration) : null,
                            item.created_at,
                          ].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 opacity-50 group-hover:opacity-100 transition-opacity"
                        title={playingId === item.id ? t("stop") : t("play")}
                        onClick={() => handlePlay(item)}
                      >
                        {playingId === item.id
                          ? <Square className="size-4 text-primary" />
                          : <span className="text-primary text-xs font-bold">▶</span>
                        }
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 opacity-50 group-hover:opacity-100 transition-opacity"
                        title={t("download")}
                        asChild
                      >
                        <a href={item.url} download={item.name} target="_blank" rel="noreferrer">
                          <Download className="size-4" />
                        </a>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 opacity-50 group-hover:opacity-100 hover:text-destructive transition-opacity"
                        title={t("delete")}
                        onClick={() => handleDelete(item.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Badges + transcript */}
                <div className="px-4 pb-3 space-y-2">
                  <div className="flex gap-1.5 flex-wrap">
                    <span className={cn(
                      "text-xs font-medium px-2 py-0.5 rounded-full",
                      SOURCE_BADGE[item.source] ?? SOURCE_BADGE.web
                    )}>
                      {item.source}
                    </span>
                    <span className={cn(
                      "text-xs font-medium px-2 py-0.5 rounded-full",
                      TYPE_BADGE[item.type] ?? TYPE_BADGE.uploaded
                    )}>
                      {item.type}
                    </span>
                  </div>

                  {item.transcript && (
                    <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{t("transcript")}: </span>
                      {item.transcript}
                    </div>
                  )}
                  {item.prompt && (
                    <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{t("prompt")}: </span>
                      {item.prompt}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
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
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Music className="size-6 text-primary" />
          {t("title")}
        </h1>
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
