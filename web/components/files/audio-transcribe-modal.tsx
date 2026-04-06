"use client"

import { useState, useRef } from "react"
import {
  Upload, FileAudio, Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { FILE_ACCEPT } from "./types"

export default function AudioTranscribeModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("files")
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<"idle" | "uploading" | "transcribing" | "done" | "error">("idle")
  const [transcript, setTranscript] = useState("")
  const [error, setError] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  const reset = () => { setFile(null); setStatus("idle"); setTranscript(""); setError("") }

  const handleSubmit = async () => {
    if (!file) { setError(t("audioFileRequired")); return }
    setStatus("uploading"); setTranscript(""); setError("")
    try {
      const fd = new FormData()
      fd.append("file", file)
      const upRes = await fetch("/api/files", { method: "POST", body: fd })
      if (!upRes.ok) throw new Error(t("audioUploadFailed"))
      const upData = await upRes.json() as { id: number; url: string; name: string }

      setStatus("transcribing")
      const tRes = await fetch("/api/audios/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "transcribe", file_url: upData.url, file_name: upData.name, file_mime: file.type }),
      })
      if (!tRes.ok) throw new Error(t("audioTranscribeFailed"))
      const tData = await tRes.json() as { text?: string }
      const text = tData.text ?? ""
      setTranscript(text)

      if (text && upData.id) {
        await fetch(`/api/files/${upData.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: text }),
        })
      }

      setStatus("done")
      toast.success(t("audioTranscribeSuccess"))
      onDone()
      reset()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"))
      setStatus("error")
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose() } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileAudio className="size-5 text-yellow-500" /> {t("audioTranscribeTitle")}
          </DialogTitle>
          <DialogDescription className="sr-only">{t("audioTranscribeTitle")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("audioFileLabel")}</Label>
            <input ref={fileRef} type="file" accept={FILE_ACCEPT.audio} className="hidden"
              onChange={e => setFile(e.target.files?.[0] ?? null)} />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full h-20 border-2 border-dashed border-border rounded-lg flex items-center justify-center gap-2 text-sm text-muted-foreground hover:border-primary/40 hover:bg-muted/30 transition-colors"
              disabled={status !== "idle" && status !== "error"}
            >
              {file ? (
                <span className="truncate px-4">{file.name}</span>
              ) : (
                <><Upload className="size-4" /> {t("audioSelectFile")}</>
              )}
            </button>
          </div>
          {transcript && (
            <div className="max-h-32 overflow-y-auto text-xs bg-muted/50 rounded-lg p-3 whitespace-pre-wrap">{transcript}</div>
          )}
          {status === "uploading" && <p className="text-xs text-muted-foreground">{t("audioUploading")}</p>}
          {status === "transcribing" && <p className="text-xs text-muted-foreground">{t("audioTranscribing")}</p>}
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => { reset(); onClose() }}>{t("cancel")}</Button>
            <Button size="sm" onClick={handleSubmit} disabled={status === "uploading" || status === "transcribing"}>
              {status === "uploading" || status === "transcribing"
                ? <><Loader2 className="size-4 mr-1.5 animate-spin" />{t("audioProcessing")}</>
                : <><FileAudio className="size-4 mr-1.5" />{t("audioTranscribeButton")}</>
              }
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
