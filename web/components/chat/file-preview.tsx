"use client"

import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { getExtColor, formatSize } from "@/components/chat/message-helpers"
import type { FileAttachment } from "@/hooks/use-chat"

// Matches /api/files/... paths with document extensions
const DOC_FILE_RE = /^\/api\/files\/.+\.(md|txt|pdf|docx|xlsx|csv|pptx|html|json)$/

export { DOC_FILE_RE }

export function FilePreview({ file }: { file: FileAttachment }) {
  if (!file.url) return null

  if (file.mime.startsWith("image/")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={file.url} alt={file.name} className="mt-2 max-w-xs rounded-lg" />
    )
  }

  if (file.mime.startsWith("audio/")) {
    return (
      <div className="mt-2 max-w-xs rounded-xl border border-black/8 dark:border-white/10 bg-white/80 dark:bg-white/10 px-3 py-2 shadow-sm">
        <p className="mb-1.5 truncate text-xs font-semibold text-foreground">{file.name}</p>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio controls src={file.url} className="h-8 w-full" preload="metadata" />
      </div>
    )
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "file"
  const badgeColor = getExtColor(ext, file.mime)
  const size = formatSize(file.size)

  return (
    <a
      href={file.url}
      download={file.name}
      rel="noopener noreferrer"
      className="mt-2 flex items-center gap-3 rounded-xl bg-white/80 dark:bg-white/10 border border-black/8 dark:border-white/10 px-3 py-2.5 shadow-sm hover:bg-white dark:hover:bg-white/15 transition-colors min-w-0 max-w-[280px]"
    >
      {/* Extension badge */}
      <div className={cn("flex shrink-0 items-center justify-center rounded-lg w-10 h-10 text-white font-bold text-xs uppercase tracking-wide", badgeColor)}>
        {ext.length > 4 ? ext.slice(0, 4) : ext}
      </div>
      {/* Filename + size */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold leading-snug text-foreground">{file.name}</p>
        {size && <p className="mt-0.5 text-xs text-muted-foreground leading-none">{size}</p>}
      </div>
    </a>
  )
}

export function DocDownloadCard({ href, label }: { href: string; label: string }) {
  const t = useTranslations("chat")
  const ext = href.split(".").pop()?.toLowerCase() ?? "file"
  const badgeColor = getExtColor(ext, "application/octet-stream")
  // Strip leading emoji like "📄 " from displayed filename
  const displayName = label.replace(/^[\p{Emoji}\s]+/u, "").trim() || href.split("/").pop() || "document"

  return (
    <a
      href={href}
      download={displayName}
      rel="noopener noreferrer"
      className="my-2 inline-flex items-center gap-3 rounded-xl bg-white/80 dark:bg-white/10 border border-black/8 dark:border-white/10 px-3 py-2.5 shadow-sm hover:bg-white dark:hover:bg-white/15 transition-colors min-w-0 max-w-[280px] no-underline"
    >
      <span className={cn("flex shrink-0 items-center justify-center rounded-lg w-10 h-10 text-white font-bold text-xs uppercase tracking-wide", badgeColor)}>
        {ext.length > 4 ? ext.slice(0, 4) : ext}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold leading-snug text-foreground">{displayName}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground leading-none">{t("download")}</span>
      </span>
    </a>
  )
}
