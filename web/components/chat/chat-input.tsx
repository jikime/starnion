"use client"

import { useState, useRef, useCallback, useMemo, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Plus, Mic, ArrowUp, X, Loader2, Bot, ChevronDown, Cpu } from "lucide-react"
import { cn } from "@/lib/utils"
import { AudioRecorder } from "@/components/chat/audio-recorder"
import { AVAILABLE_MODELS, DEFAULT_MODEL_ID, type ModelOption } from "@/lib/models"

interface BotPersona {
  id: string
  name: string
  isDefault: boolean
}

export interface AttachedFile {
  id: string
  name: string
  mime: string
  url?: string          // set after upload completes (cleared before passed to onSend)
  uploading: boolean    // true only during upload-on-send phase
  error?: string
  previewUrl?: string   // object URL for local image preview
  file?: File           // raw File object held until send (not serialized to backend)
}

interface ChatInputProps {
  onSend: (text: string, files?: AttachedFile[]) => void
  disabled?: boolean
  placeholder?: string
  botPersonas?: BotPersona[]
  activePersonaId?: string
  onSoulChange?: (personaId: string) => void
  availableModels?: ModelOption[]
  selectedModelId?: string
  onModelChange?: (modelId: string) => void
}

// ── File chip shown above the textarea ────────────────────────────────────────

function FileChip({ file, onRemove }: { file: AttachedFile; onRemove: () => void }) {
  const t = useTranslations("chat")
  const isImage = file.mime.startsWith("image/")

  return (
    <div className="relative flex items-center gap-2 rounded-xl border border-border bg-background px-2 py-1.5 shadow-sm max-w-[200px]">
      {isImage && file.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={file.previewUrl} alt={file.name} className="h-8 w-8 rounded object-cover shrink-0" />
      ) : (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted text-xs font-bold uppercase text-muted-foreground">
          {file.name.split(".").pop()?.slice(0, 4) ?? "file"}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium leading-tight">{file.name}</p>
        {file.uploading && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-2.5 animate-spin" />
            {t("fileSending")}
          </p>
        )}
        {file.error && <p className="text-xs text-destructive">{file.error}</p>}
        {!file.uploading && !file.error && (
          <p className="text-xs text-muted-foreground">
            {file.url ? t("fileDone") : t("fileAttached")}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={file.uploading}
        className="ml-1 shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
      >
        <X className="size-3" />
        <span className="sr-only">{t("fileRemove")}</span>
      </button>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ChatInput({
  onSend,
  disabled = false,
  placeholder,
  botPersonas = [],
  activePersonaId,
  onSoulChange,
  availableModels = AVAILABLE_MODELS,
  selectedModelId,
  onModelChange,
}: ChatInputProps) {
  const t = useTranslations("chat")
  const [message, setMessage] = useState("")
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [showRecorder, setShowRecorder] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [autoSendCountdown, setAutoSendCountdown] = useState<number | null>(null)
  const autoSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [soulOpen, setSoulOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Resolve display name: assigned persona → default persona → fallback
  const activeBotLabel = useMemo(() => {
    if (activePersonaId) {
      return botPersonas.find((p) => p.id === activePersonaId)?.name ?? t("botSettings")
    }
    return botPersonas.find((p) => p.isDefault)?.name ?? (botPersonas.length > 0 ? botPersonas[0].name : null)
  }, [activePersonaId, botPersonas, t])

  // Resolve active model label
  const activeModelLabel = useMemo(() => {
    const id = selectedModelId ?? DEFAULT_MODEL_ID
    return availableModels.find((m) => m.id === id)?.label ?? id
  }, [selectedModelId, availableModels])

  const removeFile = useCallback((id: string) => {
    setAttachedFiles((prev) => {
      const f = prev.find((f) => f.id === id)
      if (f?.previewUrl) URL.revokeObjectURL(f.previewUrl)
      return prev.filter((f) => f.id !== id)
    })
  }, [])

  // File selected → store raw File in state, NO upload yet.
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? [])
    e.target.value = "" // reset so same file can be reselected
    if (!selected.length) return

    const entries: AttachedFile[] = selected.map((f) => ({
      id: Math.random().toString(36).slice(2),
      name: f.name,
      mime: f.type || "application/octet-stream",
      uploading: false,
      file: f,
      previewUrl: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
    }))

    setAttachedFiles((prev) => [...prev, ...entries])
  }, [])

  // Audio recorded → store as File in state, NO upload yet.
  const handleAudioAttach = useCallback((blob: Blob, mimeType: string) => {
    setShowRecorder(false)
    const ext = mimeType.split("/")[1]?.split(";")[0] ?? "webm"
    const name = `voice-${Date.now()}.${ext}`
    const audioFile = new File([blob], name, { type: mimeType })
    setAttachedFiles((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).slice(2),
        name,
        mime: mimeType,
        uploading: false,
        file: audioFile,
        previewUrl: URL.createObjectURL(blob),
      },
    ])
  }, [])

  const handleAudioCancel = useCallback(() => {
    setShowRecorder(false)
  }, [])

  // Transcribe recorded audio via Whisper STT → insert text into the message field.
  const handleTranscribe = useCallback(async (blob: Blob, mimeType: string) => {
    setIsTranscribing(true)
    try {
      // 1. Upload the audio blob.
      const ext = mimeType.split("/")[1]?.split(";")[0] ?? "webm"
      const filename = `voice-${Date.now()}.${ext}`
      const form = new FormData()
      form.append("file", new File([blob], filename, { type: mimeType }))
      const uploadResult = await fetch("/api/upload", { method: "POST", body: form })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)

      if (!uploadResult?.url) return  // upload failed — do nothing

      // 2. Call the transcription endpoint (returns JSON {text: "..."}).
      const res = await fetch("/api/audios/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "transcribe", file_url: uploadResult.url }),
      }).catch(() => null)

      if (!res?.ok) return  // transcription unavailable — do nothing

      const data = await res.json().catch(() => null) as { text?: string } | null
      const transcribed = data?.text?.trim()
      if (transcribed) {
        setMessage((prev) => (prev ? prev + " " + transcribed : transcribed))
        setShowRecorder(false)
        // Start 2-second auto-send countdown
        setAutoSendCountdown(2)
      }
    } finally {
      setIsTranscribing(false)
    }
  }, [])

  // Upload a single pending file and return its URL (or null on failure).
  const uploadFile = useCallback(async (id: string, file: File): Promise<string | null> => {
    setAttachedFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, uploading: true } : f))
    )
    const form = new FormData()
    form.append("file", file)
    const result = await fetch("/api/upload", { method: "POST", body: form })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)

    const url: string | null = result?.url ?? null
    const mime: string | null = result?.mime ?? null
    setAttachedFiles((prev) =>
      prev.map((f) =>
        f.id === id
          ? url
            ? { ...f, url, mime: mime ?? f.mime, uploading: false, file: undefined }
            : { ...f, uploading: false, error: t("uploadFailed"), file: undefined }
          : f
      )
    )
    return url
  }, [])

  const [isSending, setIsSending] = useState(false)

  const handleSubmit = useCallback(async (e: { preventDefault(): void }) => {
    e.preventDefault()
    const hasContent = message.trim() || attachedFiles.some((f) => f.file || f.url)
    if (!hasContent || disabled || isSending) return

    setIsSending(true)
    try {
      // Upload all pending (not-yet-uploaded) files and collect their URLs directly
      // from the Promise results — avoids relying on stale React state closures.
      const pending = attachedFiles.filter((f) => f.file && !f.url)
      const uploadedUrls = new Map<string, string>()
      if (pending.length > 0) {
        const results = await Promise.all(
          pending.map((f) => uploadFile(f.id, f.file!).then((url) => ({ id: f.id, url })))
        )
        for (const r of results) {
          if (r.url) uploadedUrls.set(r.id, r.url)
        }
      }

      // Build the final file list from the snapshot captured at call time.
      const readyFiles = attachedFiles
        .map((f): AttachedFile | null => {
          if (f.url) return f                            // already uploaded
          const newUrl = uploadedUrls.get(f.id)
          if (newUrl) return { ...f, url: newUrl, uploading: false, file: undefined }
          return null                                    // upload failed — skip
        })
        .filter((f): f is AttachedFile => f !== null)

      onSend(message.trim(), readyFiles.length > 0 ? readyFiles : undefined)
      setMessage("")
      setAttachedFiles((prev) => {
        prev.forEach((f) => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl) })
        return []
      })
    } finally {
      setIsSending(false)
    }
  }, [attachedFiles, disabled, isSending, message, onSend, uploadFile])

  // Auto-send countdown after STT: tick down every second, submit at 0.
  useEffect(() => {
    if (autoSendCountdown === null) return
    if (autoSendCountdown <= 0) {
      setAutoSendCountdown(null)
      handleSubmit({ preventDefault: () => {} })
      return
    }
    const id = setTimeout(() => setAutoSendCountdown((n) => (n !== null ? n - 1 : null)), 1000)
    autoSendTimerRef.current = id
    return () => clearTimeout(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSendCountdown])

  const cancelAutoSend = useCallback(() => {
    if (autoSendTimerRef.current) clearTimeout(autoSendTimerRef.current)
    setAutoSendCountdown(null)
  }, [])

  const isUploading = isSending || attachedFiles.some((f) => f.uploading)
  const canSend = !disabled && !isSending && (!!message.trim() || attachedFiles.some((f) => f.file || f.url))

  return (
    <div className="bg-background px-4 pb-4 pt-2">
      <form onSubmit={handleSubmit} className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-border bg-gray-50 dark:bg-background shadow-sm focus-within:border-ring transition-colors">
          {/* Audio recorder — shown instead of chips + textarea */}
          {showRecorder && (
            <div className="px-3 pt-3">
              <AudioRecorder
                onAttach={handleAudioAttach}
                onCancel={handleAudioCancel}
                onTranscribe={handleTranscribe}
                isTranscribing={isTranscribing}
              />
            </div>
          )}

          {/* Attached file chips */}
          {!showRecorder && attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pt-3">
              {attachedFiles.map((file) => (
                <FileChip key={file.id} file={file} onRemove={() => removeFile(file.id)} />
              ))}
            </div>
          )}

          {/* Textarea — hidden while recorder is open */}
          {!showRecorder && (
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={placeholder ?? t("inputPlaceholder")}
              className="min-h-[64px] max-h-40 resize-none border-0 bg-transparent px-4 pt-4 pb-2 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 text-base"
              rows={2}
              maxLength={32000}
              disabled={disabled}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  handleSubmit(e)
                }
              }}
            />
          )}

          {/* Bottom toolbar */}
          <div className="flex items-center justify-between px-3 pb-3">
            {/* Left: Attach */}
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
              className={cn("h-8 w-8 rounded-full border-border", isUploading && "opacity-50")}
            >
              {isUploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              <span className="sr-only">{t("attachFile")}</span>
            </Button>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xlsx,.xls,.pptx,.ppt,.hwp,.hwpx,.mp3,.mp4,.wav"
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Right: Persona + Model + Mic + Send */}
            <div className="flex items-center gap-1">
              {onModelChange && (
                <Popover open={modelOpen} onOpenChange={setModelOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={disabled}
                      className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground border-0 shadow-none"
                    >
                      <Cpu className="size-3.5 shrink-0" />
                      <span className="max-w-[80px] truncate">{activeModelLabel}</span>
                      <ChevronDown className="size-3 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" side="top" className="w-52 p-1 mb-1">
                    <div className="text-xs text-muted-foreground px-2 py-1.5 font-medium">{t("selectModel")}</div>
                    {availableModels.map((m) => (
                      <button
                        type="button"
                        key={m.id}
                        onClick={() => { onModelChange(m.id); setModelOpen(false) }}
                        className={cn(
                          "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors",
                          (selectedModelId ?? DEFAULT_MODEL_ID) === m.id && "bg-accent"
                        )}
                      >
                        <Cpu className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
                        <span className="flex flex-col min-w-0">
                          <span className="truncate">{m.label}</span>
                          {m.description && (
                            <span className="text-xs text-muted-foreground">{m.description}</span>
                          )}
                        </span>
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              )}

              {botPersonas.length > 0 && onSoulChange && (
                <Popover open={soulOpen} onOpenChange={setSoulOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={disabled}
                      className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground border-0 shadow-none"
                    >
                      <Bot className="size-3.5 shrink-0" />
                      <span className="max-w-[80px] truncate">{activeBotLabel ?? t("botSettings")}</span>
                      <ChevronDown className="size-3 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" side="top" className="w-52 p-1 mb-1">
                    <div className="text-xs text-muted-foreground px-2 py-1.5 font-medium">{t("selectBotSoul")}</div>
                    <button
                      type="button"
                      onClick={() => { onSoulChange(""); setSoulOpen(false) }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors",
                        !activePersonaId && "bg-accent"
                      )}
                    >
                      <Bot className="size-3.5 text-muted-foreground shrink-0" />
                      <span>{t("defaultSettings")}</span>
                    </button>
                    {botPersonas.map((bp) => (
                      <button
                        type="button"
                        key={bp.id}
                        onClick={() => { onSoulChange(bp.id); setSoulOpen(false) }}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors",
                          activePersonaId === bp.id && "bg-accent"
                        )}
                      >
                        <Bot className="size-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate flex-1 text-left">{bp.name}</span>
                        {bp.isDefault && !activePersonaId && (
                          <span className="text-xs text-muted-foreground shrink-0">{t("defaultLabel")}</span>
                        )}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              )}

              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled || showRecorder}
                onClick={() => setShowRecorder(true)}
                className={cn(
                  "h-8 w-8 rounded-full text-muted-foreground hover:text-foreground",
                  showRecorder && "text-destructive"
                )}
              >
                <Mic className="size-4" />
                <span className="sr-only">{t("voiceInput")}</span>
              </Button>

              {autoSendCountdown !== null ? (
                <button
                  type="button"
                  onClick={cancelAutoSend}
                  className="flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/80"
                >
                  <span>{autoSendCountdown}s</span>
                  <X className="size-3" />
                </button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  disabled={!canSend}
                  className="h-8 w-8 rounded-full bg-foreground text-background hover:bg-foreground/80 disabled:bg-muted disabled:text-muted-foreground"
                >
                  <ArrowUp className="size-4" />
                  <span className="sr-only">{t("sendMessage")}</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
