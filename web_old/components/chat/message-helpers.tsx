"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Copy, Check } from "lucide-react"

export function CopyButton({ text }: { text: string }) {
  const t = useTranslations("chat")
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleCopy}
      className="h-6 w-6 text-muted-foreground/50 hover:text-foreground"
      title={t("copyMarkdown")}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
    </Button>
  )
}

export function getExtColor(ext: string, mime: string): string {
  if (mime.startsWith("image/")) return "bg-emerald-500"
  if (mime.startsWith("audio/")) return "bg-purple-500"
  if (mime.startsWith("video/")) return "bg-pink-500"
  const map: Record<string, string> = {
    pdf: "bg-red-500",
    doc: "bg-blue-500", docx: "bg-blue-500",
    xls: "bg-green-600", xlsx: "bg-green-600", csv: "bg-green-600",
    ppt: "bg-orange-500", pptx: "bg-orange-500",
    zip: "bg-amber-500", gz: "bg-amber-500", tar: "bg-amber-500",
    rar: "bg-amber-500", "7z": "bg-amber-500",
    txt: "bg-slate-500", md: "bg-slate-500",
    js: "bg-yellow-500", ts: "bg-blue-400", tsx: "bg-blue-400",
    py: "bg-indigo-500", go: "bg-cyan-500",
  }
  return map[ext] ?? "bg-slate-400"
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return `${n}`
}

export function formatSize(bytes?: number): string {
  if (!bytes) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Animated "생각 중..." bubble shown before the first token arrives */
export function ThinkingBubble() {
  return (
    <div className="rounded-2xl rounded-tl-sm border bg-card border-border px-4 py-3 w-fit">
      <div className="flex items-center gap-1.5">
        <span
          className="size-2 rounded-full bg-muted-foreground/60 animate-bounce"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="size-2 rounded-full bg-muted-foreground/60 animate-bounce"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="size-2 rounded-full bg-muted-foreground/60 animate-bounce"
          style={{ animationDelay: "300ms" }}
        />
      </div>
    </div>
  )
}
