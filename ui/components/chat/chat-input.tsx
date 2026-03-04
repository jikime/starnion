"use client"

import { useState, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Mic, ArrowUp, X, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { AudioRecorder } from "@/components/chat/audio-recorder"

interface PersonaOption {
  id: string
  name: string
}

export interface AttachedFile {
  id: string
  name: string
  mime: string
  url?: string          // set after upload completes
  uploading: boolean
  error?: string
  previewUrl?: string   // object URL for local image preview
}

interface ChatInputProps {
  onSend: (text: string, files?: AttachedFile[]) => void
  disabled?: boolean
  placeholder?: string
  persona?: string
  personas?: PersonaOption[]
  onPersonaChange?: (value: string) => void
}

// ── File chip shown above the textarea ────────────────────────────────────────

function FileChip({ file, onRemove }: { file: AttachedFile; onRemove: () => void }) {
  const isImage = file.mime.startsWith("image/")

  return (
    <div className="relative flex items-center gap-2 rounded-xl border border-border bg-background px-2 py-1.5 shadow-sm max-w-[200px]">
      {isImage && file.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={file.previewUrl} alt={file.name} className="h-8 w-8 rounded object-cover shrink-0" />
      ) : (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-bold uppercase text-muted-foreground">
          {file.name.split(".").pop()?.slice(0, 4) ?? "file"}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium leading-tight">{file.name}</p>
        {file.uploading && (
          <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Loader2 className="size-2.5 animate-spin" />
            업로드 중...
          </p>
        )}
        {file.error && <p className="text-[10px] text-destructive">{file.error}</p>}
        {!file.uploading && !file.error && file.url && (
          <p className="text-[10px] text-muted-foreground">완료</p>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="ml-1 shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-3" />
        <span className="sr-only">파일 제거</span>
      </button>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ChatInput({
  onSend,
  disabled = false,
  placeholder,
  persona,
  personas = [],
  onPersonaChange,
}: ChatInputProps) {
  const [message, setMessage] = useState("")
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [showRecorder, setShowRecorder] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const removeFile = useCallback((id: string) => {
    setAttachedFiles((prev) => {
      const f = prev.find((f) => f.id === id)
      if (f?.previewUrl) URL.revokeObjectURL(f.previewUrl)
      return prev.filter((f) => f.id !== id)
    })
  }, [])

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? [])
    // Reset so the same file can be reselected.
    e.target.value = ""
    if (!selected.length) return

    const placeholders: AttachedFile[] = selected.map((f) => ({
      id: Math.random().toString(36).slice(2),
      name: f.name,
      mime: f.type || "application/octet-stream",
      uploading: true,
      previewUrl: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
    }))

    setAttachedFiles((prev) => [...prev, ...placeholders])

    // Upload each file and update its state when done.
    await Promise.all(
      selected.map(async (file, i) => {
        const id = placeholders[i].id
        const form = new FormData()
        form.append("file", file)

        const result = await fetch("/api/upload", { method: "POST", body: form })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)

        setAttachedFiles((prev) =>
          prev.map((f) =>
            f.id === id
              ? result
                ? { ...f, url: result.url as string, uploading: false }
                : { ...f, uploading: false, error: "업로드 실패" }
              : f
          )
        )
      })
    )
  }, [])

  // Called when AudioRecorder confirms the recording.
  // Creates a placeholder chip immediately, then uploads in background.
  const handleAudioAttach = useCallback(async (blob: Blob, mimeType: string) => {
    setShowRecorder(false)

    const ext = mimeType.split("/")[1]?.split(";")[0] ?? "webm"
    const name = `voice-${Date.now()}.${ext}`
    const id = Math.random().toString(36).slice(2)
    const previewUrl = URL.createObjectURL(blob)

    setAttachedFiles((prev) => [...prev, { id, name, mime: mimeType, uploading: true, previewUrl }])

    const audioFile = new File([blob], name, { type: mimeType })
    const form = new FormData()
    form.append("file", audioFile)

    const result = await fetch("/api/upload", { method: "POST", body: form })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)

    setAttachedFiles((prev) =>
      prev.map((f) =>
        f.id === id
          ? result
            ? { ...f, url: result.url as string, uploading: false }
            : { ...f, uploading: false, error: "업로드 실패" }
          : f
      )
    )
  }, [])

  const handleAudioCancel = useCallback(() => {
    setShowRecorder(false)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const readyFiles = attachedFiles.filter((f) => f.url)
    const hasContent = message.trim() || readyFiles.length > 0
    if (!hasContent || disabled) return

    onSend(message.trim(), readyFiles.length > 0 ? readyFiles : undefined)
    setMessage("")
    setAttachedFiles((prev) => {
      prev.forEach((f) => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl) })
      return []
    })
  }

  const isUploading = attachedFiles.some((f) => f.uploading)
  const canSend = !disabled && !isUploading && (!!message.trim() || attachedFiles.some((f) => f.url))

  return (
    <div className="bg-background px-4 pb-4 pt-2">
      <form onSubmit={handleSubmit} className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-border bg-background shadow-sm focus-within:border-ring transition-colors">
          {/* Audio recorder — shown instead of chips + textarea */}
          {showRecorder && (
            <div className="px-3 pt-3">
              <AudioRecorder onAttach={handleAudioAttach} onCancel={handleAudioCancel} />
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
              placeholder={placeholder ?? "메시지를 입력하세요. /를 입력하면 바로가기를 볼 수 있어요."}
              className="min-h-[64px] max-h-40 resize-none border-0 bg-transparent px-4 pt-4 pb-2 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm"
              rows={2}
              disabled={disabled}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
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
              <span className="sr-only">파일 첨부</span>
            </Button>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xlsx,.xls,.pptx,.ppt,.zip,.mp3,.mp4,.wav"
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Right: Persona + Mic + Send */}
            <div className="flex items-center gap-1">
              {personas.length > 0 && onPersonaChange && (
                <Select value={persona} onValueChange={onPersonaChange} disabled={disabled}>
                  <SelectTrigger className="h-8 w-auto gap-1 border-0 bg-transparent px-2 text-sm text-muted-foreground shadow-none hover:bg-accent hover:text-foreground focus:ring-0 focus:ring-offset-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end">
                    {personas.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <span className="sr-only">음성 입력</span>
              </Button>

              <Button
                type="submit"
                size="icon"
                disabled={!canSend}
                className="h-8 w-8 rounded-full bg-foreground text-background hover:bg-foreground/80 disabled:bg-muted disabled:text-muted-foreground"
              >
                <ArrowUp className="size-4" />
                <span className="sr-only">전송</span>
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
