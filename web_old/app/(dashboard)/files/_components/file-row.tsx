"use client"

import { FileAudio, Download, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { FileItem } from "./types"
import { formatBadgeColor, subTypeBadgeColor } from "./types"
import { FileTypeIcon } from "./file-card"

export default function FileRow({ file, onClick, onDelete, isSelected, onToggleSelect }: {
  file: FileItem
  onClick: (f: FileItem) => void
  onDelete: (id: number) => void
  isSelected?: boolean
  onToggleSelect?: (id: number) => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={file.name}
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 cursor-pointer rounded-lg group transition-colors",
        isSelected && "bg-primary/5 border border-primary/20"
      )}
      onClick={() => onClick(file)}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(file) } }}
    >
      {onToggleSelect && (
        <div
          className="shrink-0"
          onClick={(e) => { e.stopPropagation(); onToggleSelect(file.id) }}
        >
          <div className={cn(
            "size-4 rounded border-2 flex items-center justify-center transition-all",
            isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"
          )}>
            {isSelected && <span className="text-white text-[8px] font-bold">&#10003;</span>}
          </div>
        </div>
      )}
      <FileTypeIcon fileType={file.file_type} className="size-5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{file.name}</p>
      </div>
      <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded shrink-0", formatBadgeColor(file.format))}>
        {file.format}
      </span>
      {file.sub_type && file.sub_type !== "uploaded" && (
        <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded shrink-0", subTypeBadgeColor(file.sub_type))}>
          {file.sub_type}
        </span>
      )}
      <span className="text-xs text-muted-foreground shrink-0 w-16 text-right hidden sm:block">{file.size_label}</span>
      <span className="text-xs text-muted-foreground shrink-0 w-20 text-right hidden sm:block">{file.created_at.slice(0, 10)}</span>
      <div
        className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="p-1.5 hover:bg-muted rounded"
          onClick={() => window.open(file.url, "_blank")}
          title="Download"
        >
          <Download className="size-3.5 text-muted-foreground" />
        </button>
        <button
          className="p-1.5 hover:bg-muted rounded"
          onClick={() => onDelete(file.id)}
          title="Delete"
        >
          <Trash2 className="size-3.5 text-destructive" />
        </button>
      </div>
    </div>
  )
}
