"use client"

import { useState, useRef, useEffect } from "react"
import {
  Upload, X, Loader2, Wand2, ScanSearch, Pencil,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { FILE_ACCEPT, callImageStream } from "./types"

export default function ImgActionModal({ action, open, onClose, onDone }: {
  action: "img-generate" | "img-analyze" | "img-edit"
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const t = useTranslations("files")
  const [prompt, setPrompt] = useState("")
  const [aspectRatio, setAspectRatio] = useState("1:1")
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle")
  const [output, setOutput] = useState("")
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [error, setError] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)
  const readerRef = useRef<FileReader | null>(null)

  useEffect(() => {
    return () => { readerRef.current?.abort() }
  }, [])

  const needsFile = action === "img-analyze" || action === "img-edit"
  const title = action === "img-generate" ? t("imgGenerateTitle") : action === "img-analyze" ? t("imgAnalyzeTitle") : t("imgEditTitle")
  const icon = action === "img-generate" ? <Wand2 className="size-5 text-violet-500" />
    : action === "img-analyze" ? <ScanSearch className="size-5 text-emerald-500" />
    : <Pencil className="size-5 text-blue-500" />

  const reset = () => {
    setPrompt(""); setFile(null); setPreview(null); setStatus("idle")
    setOutput(""); setResultUrl(null); setError("")
  }

  const handleFile = (f: File | null) => {
    readerRef.current?.abort()
    readerRef.current = null
    setFile(f)
    if (f) {
      const reader = new FileReader()
      readerRef.current = reader
      reader.onload = e => setPreview(e.target?.result as string)
      reader.readAsDataURL(f)
    } else {
      setPreview(null)
    }
  }

  const handleSubmit = async () => {
    if (needsFile && !file) { setError(t("imgFileRequired")); return }
    if (!prompt.trim() && action !== "img-analyze") { setError(t("imgPromptRequired")); return }
    setStatus("running"); setOutput(""); setResultUrl(null); setError("")
    try {
      const fd = new FormData()
      fd.append("action", action === "img-generate" ? "generate" : action === "img-analyze" ? "analyze" : "edit")
      fd.append("message", action === "img-generate" ? `${prompt} --aspect-ratio ${aspectRatio}` : prompt)
      if (file) fd.append("file", file)
      const { imageUrl, text } = await callImageStream(fd, delta => setOutput(prev => prev + delta))
      if (imageUrl) setResultUrl(imageUrl)
      setOutput(text)
      setStatus("done")
      const successMsg = action === "img-generate" ? t("imgGenerateSuccess")
        : action === "img-analyze" ? t("imgAnalyzeSuccess")
        : t("imgEditSuccess")
      toast.success(successMsg)
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{icon}{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {needsFile && (
            <div className="space-y-1.5">
              <Label>{t("imgFileLabel")}</Label>
              <input ref={fileRef} type="file" accept={FILE_ACCEPT.image} className="hidden"
                onChange={e => handleFile(e.target.files?.[0] ?? null)} />
              {preview ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="preview" className="w-full max-h-48 object-contain rounded-lg border border-border" />
                  <button
                    className="absolute top-1 right-1 p-1 bg-black/50 rounded-full text-white"
                    onClick={() => handleFile(null)}
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full h-24 border-2 border-dashed border-border rounded-lg flex items-center justify-center gap-2 text-sm text-muted-foreground hover:border-primary/40 hover:bg-muted/30 transition-colors"
                  disabled={status === "running"}
                >
                  <Upload className="size-4" /> {t("imgSelectFile")}
                </button>
              )}
            </div>
          )}
          {action === "img-generate" && (
            <div className="space-y-1.5">
              <Label>{t("imgAspectLabel")}</Label>
              <div className="flex gap-2 flex-wrap">
                {["1:1", "3:4", "4:3", "9:16", "16:9"].map(r => (
                  <button
                    key={r}
                    onClick={() => setAspectRatio(r)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                      aspectRatio === r ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
                    )}
                    disabled={status === "running"}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{action === "img-analyze" ? t("imgAnalyzePromptLabel") : t("imgPromptLabel")}</Label>
            <Textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder={
                action === "img-generate" ? t("imgGeneratePlaceholder")
                : action === "img-analyze" ? t("imgAnalyzePlaceholder")
                : t("imgEditPlaceholder")
              }
              rows={3}
              disabled={status === "running"}
            />
          </div>
          {resultUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={resultUrl} alt="result" className="w-full rounded-lg border border-border" />
          )}
          {output && !resultUrl && (
            <div className="max-h-32 overflow-y-auto text-xs bg-muted/50 rounded-lg p-3 whitespace-pre-wrap">{output}</div>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => { reset(); onClose() }}>{t("cancel")}</Button>
            <Button size="sm" onClick={handleSubmit} disabled={status === "running"}>
              {status === "running" ? <><Loader2 className="size-4 mr-1.5 animate-spin" />{t("imgProcessing")}</> : <>{icon}<span className="ml-1.5">{title}</span></>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
