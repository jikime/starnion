"use client"

import React, { useRef } from "react"
import {
  Upload, Search, X, RefreshCw, Loader2,
  Plus, Wand2, ScanSearch, Pencil,
  Mic, FileAudio, FileOutput,
  ArrowUpDown, LayoutGrid, List,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"
import type { ActionType } from "./types"

interface TopBarProps {
  searchQuery: string
  onSearchChange: (v: string) => void
  uploading: boolean
  uploadAccept: string
  onUpload: (file: File) => void
  onAction: (action: ActionType) => void
  sortBy: "date" | "name" | "size" | "type"
  sortDir: "asc" | "desc"
  onSort: (key: "date" | "name" | "size" | "type") => void
  viewMode: "grid" | "list"
  onViewChange: (v: "grid" | "list") => void
  loading: boolean
  onRefresh: () => void
}

export default function TopBar({
  searchQuery, onSearchChange, uploading, uploadAccept, onUpload,
  onAction, sortBy, sortDir, onSort, viewMode, onViewChange, loading, onRefresh,
}: TopBarProps) {
  const t = useTranslations("files")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""
  }

  return (
    <div className="flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-3 border-b border-border shrink-0 flex-wrap">
      <h1 className="text-lg font-bold shrink-0">{t("title")}</h1>
      <div className="relative flex-1 min-w-0 w-full sm:w-auto sm:max-w-xs order-last sm:order-none">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder={t("searchPlaceholder")}
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          className="pl-9 h-8 text-sm w-full"
        />
        {searchQuery && (
          <button onClick={() => onSearchChange("")} className="absolute right-2 top-1/2 -translate-y-1/2">
            <X className="size-4 text-muted-foreground" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 ml-auto flex-wrap">
        <input ref={fileInputRef} type="file" accept={uploadAccept} className="hidden" onChange={handleFileInput} />
        <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="size-4 animate-spin mr-1.5" /> : <Upload className="size-4 mr-1.5" />}
          <span className="hidden sm:inline">{t("upload")}</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm">
              <Plus className="size-4 mr-1.5" /> <span className="hidden sm:inline">{t("createNew")}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>{t("menuDocument")}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onAction("doc-generate")}>
              <FileOutput className="size-4 mr-2 text-blue-500" /> {t("menuDocGenerate")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t("menuImage")}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onAction("img-generate")}>
              <Wand2 className="size-4 mr-2 text-violet-500" /> {t("menuImgGenerate")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction("img-analyze")}>
              <ScanSearch className="size-4 mr-2 text-emerald-500" /> {t("menuImgAnalyze")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction("img-edit")}>
              <Pencil className="size-4 mr-2 text-blue-500" /> {t("menuImgEdit")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t("menuAudio")}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onAction("audio-record")}>
              <Mic className="size-4 mr-2 text-rose-500" /> {t("menuAudioRecord")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction("audio-transcribe")}>
              <FileAudio className="size-4 mr-2 text-yellow-500" /> {t("menuAudioTranscribe")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={cn(
              "p-1.5 hover:bg-muted rounded-lg flex items-center gap-1 transition-colors",
              (sortBy !== "date" || sortDir !== "desc") && "text-primary"
            )}>
              <ArrowUpDown className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuLabel>{t("sortBy")}</DropdownMenuLabel>
            {([
              { key: "date", label: t("colDate") },
              { key: "name", label: t("colName") },
              { key: "size", label: t("colSize") },
              { key: "type", label: t("colFormat") },
            ] as const).map(({ key, label }) => (
              <DropdownMenuItem
                key={key}
                onClick={() => onSort(key)}
                className={cn("flex items-center justify-between", sortBy === key && "font-medium text-primary")}
              >
                {label}
                {sortBy === key && <span className="text-xs ml-2">{sortDir === "asc" ? "\u2191" : "\u2193"}</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex border border-border rounded-lg overflow-hidden">
          <button onClick={() => onViewChange("grid")} className={cn("p-1.5", viewMode === "grid" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
            <LayoutGrid className="size-4" />
          </button>
          <button onClick={() => onViewChange("list")} className={cn("p-1.5", viewMode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
            <List className="size-4" />
          </button>
        </div>

        <button onClick={onRefresh} className="p-1.5 hover:bg-muted rounded-lg">
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
        </button>
      </div>
    </div>
  )
}
