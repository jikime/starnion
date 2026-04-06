"use client"

import { useState } from "react"
import { FileOutput, Wand2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { callImageStream } from "./types"

export default function DocGenerateModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("files")
  const [title, setTitle] = useState("")
  const [format, setFormat] = useState("docx")
  const [content, setContent] = useState("")
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle")
  const [output, setOutput] = useState("")
  const [error, setError] = useState("")

  const reset = () => { setTitle(""); setFormat("docx"); setContent(""); setStatus("idle"); setOutput(""); setError("") }

  const handleSubmit = async () => {
    if (!title.trim()) { setError(t("docTitleRequired")); return }
    setStatus("running"); setOutput(""); setError("")
    try {
      const fd = new FormData()
      fd.append("action", "generate")
      fd.append("message", `제목: "${title}", 형식: ${format}으로 문서를 만들어줘.\n\n${content}`)
      await callImageStream(fd, (delta) => setOutput(prev => prev + delta))
      setStatus("done")
      toast.success(t("docGenerateSuccess"))
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
          <DialogTitle className="flex items-center gap-2">
            <FileOutput className="size-5 text-blue-500" /> {t("docGenerateTitle")}
          </DialogTitle>
          <DialogDescription className="sr-only">{t("docGenerateTitle")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>{t("docTitleLabel")}</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder={t("docTitlePlaceholder")} disabled={status === "running"} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("docFormatLabel")}</Label>
              <Select value={format} onValueChange={setFormat} disabled={status === "running"}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["docx", "pdf", "xlsx", "pptx", "md", "txt"].map(f => (
                    <SelectItem key={f} value={f}>{f.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("docContentLabel")}</Label>
            <Textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder={t("docContentPlaceholder")}
              rows={4}
              disabled={status === "running"}
            />
          </div>
          {output && (
            <div className="max-h-32 overflow-y-auto text-xs bg-muted/50 rounded-lg p-3 whitespace-pre-wrap">{output}</div>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => { reset(); onClose() }}>{t("cancel")}</Button>
            <Button size="sm" onClick={handleSubmit} disabled={status === "running"}>
              {status === "running" ? <><Loader2 className="size-4 mr-1.5 animate-spin" />{t("docGenerating")}</> : <><Wand2 className="size-4 mr-1.5" />{t("docGenerateButton")}</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
