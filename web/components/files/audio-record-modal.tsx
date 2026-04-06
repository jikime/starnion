"use client"

import { useState, useRef, useEffect } from "react"
import {
  Mic, MicOff, Square, Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { fmtDuration } from "./types"

export default function AudioRecordModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("files")
  const [status, setStatus] = useState<"idle" | "recording" | "uploading" | "transcribing" | "done" | "error">("idle")
  const [elapsed, setElapsed] = useState(0)
  const [transcript, setTranscript] = useState("")
  const [error, setError] = useState("")
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  const reset = () => {
    setStatus("idle"); setElapsed(0); setTranscript(""); setError("")
    mediaRef.current = null; chunksRef.current = []
    if (timerRef.current) clearInterval(timerRef.current)
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const mime = mr.mimeType || "audio/webm"
        const blob = new Blob(chunksRef.current, { type: mime })
        try {
          await processBlob(blob, mime)
        } catch (e) {
          setError(e instanceof Error ? e.message : t("error"))
          setStatus("error")
        }
      }
      mr.start(250)
      mediaRef.current = mr
      setStatus("recording"); setElapsed(0)
      timerRef.current = setInterval(() => setElapsed(prev => prev + 1), 1000)
    } catch {
      setError(t("audioMicRequired"))
      setStatus("error")
    }
  }

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    mediaRef.current?.stop()
  }

  const processBlob = async (blob: Blob, mime: string) => {
    try {
      setStatus("uploading")
      const ext = mime.split("/")[1]?.split(";")[0] ?? "webm"
      const file = new File([blob], `recording-${Date.now()}.${ext}`, { type: mime })
      const fd = new FormData()
      fd.append("file", file)
      const upRes = await fetch("/api/files", { method: "POST", body: fd })
      if (!upRes.ok) throw new Error(t("audioUploadFailed"))
      const upData = await upRes.json() as { id: number; url: string; name: string }

      setStatus("transcribing")
      const tRes = await fetch("/api/audios/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "transcribe", file_url: upData.url, file_name: upData.name, file_mime: mime }),
      })
      if (!tRes.ok) throw new Error(t("audioTranscribeFailed"))
      const tData = await tRes.json() as { text?: string }
      const text = tData.text ?? ""
      setTranscript(text)

      if (text && upData.id) {
        await fetch(`/api/files/${upData.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: text, sub_type: "recorded" }),
        })
      }

      setStatus("done")
      toast.success(t("audioRecordSuccess"))
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
            <Mic className="size-5 text-rose-500" /> {t("audioRecordTitle")}
          </DialogTitle>
          <DialogDescription className="sr-only">{t("audioRecordTitle")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          <div className={cn(
            "size-24 rounded-full flex items-center justify-center transition-colors",
            status === "recording" ? "bg-rose-100 animate-pulse" : "bg-muted"
          )}>
            {status === "recording"
              ? <Mic className="size-10 text-rose-500" />
              : <MicOff className="size-10 text-muted-foreground" />
            }
          </div>
          {status === "recording" && (
            <p className="text-lg font-mono font-semibold text-rose-600">{fmtDuration(elapsed)}</p>
          )}
          {status === "uploading" && <p className="text-sm text-muted-foreground">{t("audioUploading")}</p>}
          {status === "transcribing" && <p className="text-sm text-muted-foreground">{t("audioTranscribing")}</p>}
          {transcript && (
            <div className="w-full max-h-32 overflow-y-auto text-xs bg-muted/50 rounded-lg p-3 whitespace-pre-wrap">{transcript}</div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            {status === "idle" || status === "error" ? (
              <Button onClick={startRecording} className="gap-2">
                <Mic className="size-4" /> {t("audioRecordStart")}
              </Button>
            ) : status === "recording" ? (
              <Button variant="destructive" onClick={stopRecording} className="gap-2">
                <Square className="size-4" /> {t("audioRecordStop")}
              </Button>
            ) : status === "uploading" || status === "transcribing" ? (
              <Button disabled><Loader2 className="size-4 animate-spin mr-1.5" />{t("audioProcessing")}</Button>
            ) : (
              <Button variant="outline" onClick={() => { reset() }}>{t("audioRecordAgain")}</Button>
            )}
            <Button variant="outline" onClick={() => { reset(); onClose() }}>{t("audioClose")}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
