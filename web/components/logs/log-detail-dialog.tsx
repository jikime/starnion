"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Check, ClipboardCopy } from "lucide-react"
import { cn } from "@/lib/utils"
import type { LogEntry } from "./types"
import { fullTs, getCfg, SOURCE_COLOR } from "./types"

export function LogDetailDialog({ entry, open, onOpenChange }: {
  entry: LogEntry | null; open: boolean; onOpenChange: (v: boolean) => void
}) {
  const t = useTranslations("logs")
  const [copied, setCopied] = useState(false)
  if (!entry) return null

  const level = entry.level?.toLowerCase() ?? "info"
  const cfg = getCfg(level)
  const msg = entry.message || entry.raw || ""
  const src = entry.source ?? "app"

  const handleCopy = async () => {
    await navigator.clipboard.writeText(`[${fullTs(entry.time)}] [${cfg.label}] [${src}]\n${msg}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-zinc-950 border-white/10 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-sm">
            <span className={cn("text-xs font-bold tracking-wider", cfg.lv)}>{cfg.label}</span>
            <span className={cn("text-xs", SOURCE_COLOR[src] ?? "text-zinc-400")}>[{src}]</span>
            <span className="ml-auto text-xs text-zinc-500 font-normal">{fullTs(entry.time)}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className={cn(
            "rounded-lg border p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all",
            level === "error" || level === "fatal" ? "border-red-400/20 bg-red-950/20 text-red-300"
              : level === "warn" || level === "warning" ? "border-amber-400/20 bg-amber-950/20 text-amber-200"
              : "border-white/[0.07] bg-zinc-900 text-zinc-200"
          )}>{msg}</div>
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={handleCopy}
              className="border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200 font-mono text-xs">
              {copied ? <><Check className="size-3 mr-1.5 text-emerald-400" />{t("copied")}</> : <><ClipboardCopy className="size-3 mr-1.5" />{t("copyText")}</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
