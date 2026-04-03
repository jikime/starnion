"use client"

import { useState } from "react"
import { FileText, FileAudio, FileImage, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { FileItem } from "./types"
import { formatBadgeColor, subTypeBadgeColor } from "./types"
import ImagePreviewDialog from "./image-preview-dialog"

export function FileTypeIcon({ fileType, className }: { fileType: string; className?: string }) {
  if (fileType === "image") return <FileImage className={cn("text-purple-500", className)} />
  if (fileType === "audio") return <FileAudio className={cn("text-yellow-500", className)} />
  return <FileText className={cn("text-blue-500", className)} />
}

export default function FileCard({ file, onClick, onDelete, isSelected, onToggleSelect }: {
  file: FileItem
  onClick: (f: FileItem) => void
  onDelete: (id: number) => void
  isSelected?: boolean
  onToggleSelect?: (id: number) => void
}) {
  const [previewOpen, setPreviewOpen] = useState(false)

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={file.name}
        className={cn(
          "group relative bg-white dark:bg-zinc-900 border rounded-xl p-3 cursor-pointer hover:border-primary/40 hover:shadow-md transition-all",
          isSelected ? "border-primary ring-2 ring-primary/20" : "border-border"
        )}
        onClick={() => onClick(file)}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(file) } }}
      >
        {onToggleSelect && (
          <div
            className="absolute top-2 left-2 z-10"
            onClick={(e) => { e.stopPropagation(); onToggleSelect(file.id) }}
          >
            <div className={cn(
              "size-5 rounded border-2 flex items-center justify-center transition-all",
              isSelected
                ? "bg-primary border-primary"
                : "bg-white/80 dark:bg-zinc-800/80 border-muted-foreground/40 opacity-0 group-hover:opacity-100"
            )}>
              {isSelected && <span className="text-white text-xs font-bold">&#10003;</span>}
            </div>
          </div>
        )}
        <div className="aspect-square w-full rounded-lg bg-muted flex items-center justify-center overflow-hidden mb-3">
          {file.file_type === "image" && file.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={file.url}
              alt={file.name}
              className="w-full h-full object-cover rounded-lg cursor-zoom-in"
              onClick={(e) => { e.stopPropagation(); setPreviewOpen(true) }}
            />
          ) : file.file_type === "audio" ? (
            <FileAudio className="size-10 text-yellow-400" />
          ) : (
            <FileText className="size-10 text-blue-400" />
          )}
        </div>
        <p className="text-xs font-medium truncate mb-1">{file.name}</p>
        <div className="flex items-center gap-1 flex-wrap">
          <span className={cn("text-xs font-semibold px-1.5 py-0.5 rounded", formatBadgeColor(file.format))}>
            {file.format}
          </span>
          {file.sub_type && file.sub_type !== "uploaded" && (
            <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded", subTypeBadgeColor(file.sub_type))}>
              {file.sub_type}
            </span>
          )}
          {file.file_type === "document" && file.indexed && (
            <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">indexed</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1 truncate">
          {file.size_label} · {file.created_at.slice(0, 10)}
        </p>
        <div
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="p-1 bg-white dark:bg-zinc-800 rounded shadow border border-border hover:bg-muted"
            title="Delete"
            onClick={() => onDelete(file.id)}
          >
            <Trash2 className="size-3 text-destructive" />
          </button>
        </div>
      </div>

      {file.file_type === "image" && file.url && (
        <ImagePreviewDialog
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          imageUrl={file.url}
          fileName={file.name}
        />
      )}
    </>
  )
}
