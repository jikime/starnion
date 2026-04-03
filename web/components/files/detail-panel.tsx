"use client"

import { useState, useEffect, useRef } from "react"
import {
  FileText, FileAudio, Download, Trash2,
  Play, Pause, RefreshCw, Loader2, X,
  MapPin, ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"
import type { FileItem } from "./types"
import { formatBadgeColor, subTypeBadgeColor, fmtDuration } from "./types"

export default function DetailPanel({ file, onClose, onDelete, onIndex }: {
  file: FileItem
  onClose: () => void
  onDelete: (id: number) => void
  onIndex: (id: number) => Promise<void>
}) {
  const t = useTranslations("files")
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [indexing, setIndexing] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  const togglePlay = () => {
    if (!audioRef.current) return
    if (isPlaying) { audioRef.current.pause() } else { audioRef.current.play() }
    setIsPlaying(!isPlaying)
  }

  const handleIndex = async () => {
    setIndexing(true)
    try { await onIndex(file.id) } finally { setIndexing(false) }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[400px] bg-background border-l border-border flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold truncate">{file.name}</span>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="size-4" /></button>
        </div>
        <div className="p-4 flex flex-col gap-4 overflow-y-auto flex-1">
          <div className="aspect-square w-full rounded-xl bg-muted flex items-center justify-center overflow-hidden">
            {file.file_type === "image" && file.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={file.url} alt={file.name} className="w-full h-full object-contain" />
            ) : file.file_type === "audio" ? (
              <div className="flex flex-col items-center gap-3 p-4 w-full">
                <FileAudio className="size-16 text-yellow-400" />
                {file.url && (
                  <>
                    <audio
                      ref={audioRef}
                      src={file.url}
                      onEnded={() => { setIsPlaying(false); setCurrentTime(0) }}
                      onTimeUpdate={() => setCurrentTime(Math.floor(audioRef.current?.currentTime ?? 0))}
                    />
                    <button onClick={togglePlay} className="p-3 bg-yellow-100 rounded-full hover:bg-yellow-200 transition-colors">
                      {isPlaying ? <Pause className="size-6 text-yellow-700" /> : <Play className="size-6 text-yellow-700" />}
                    </button>
                    {file.duration > 0 && (
                      <div className="w-full flex items-center gap-2 px-2">
                        <span className="text-xs text-muted-foreground w-9 text-right tabular-nums">{fmtDuration(currentTime)}</span>
                        <input
                          type="range"
                          min={0}
                          max={file.duration}
                          value={currentTime}
                          onChange={e => {
                            const v = Number(e.target.value)
                            setCurrentTime(v)
                            if (audioRef.current) audioRef.current.currentTime = v
                          }}
                          className="flex-1 h-1.5 accent-yellow-500 cursor-pointer"
                        />
                        <span className="text-xs text-muted-foreground w-9 tabular-nums">{fmtDuration(file.duration)}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <FileText className="size-16 text-blue-400" />
            )}
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("detailType")}</span>
              <span className={cn("text-xs font-semibold px-2 py-0.5 rounded", formatBadgeColor(file.format))}>{file.format}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("detailSize")}</span>
              <span>{file.size_label}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("detailDate")}</span>
              <span>{file.created_at.slice(0, 10)}</span>
            </div>
            {file.sub_type && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("detailSubtype")}</span>
                <span className={cn("text-xs font-medium px-2 py-0.5 rounded", subTypeBadgeColor(file.sub_type))}>{file.sub_type}</span>
              </div>
            )}
            {file.file_type === "document" && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("detailIndexing")}</span>
                <span className={file.indexed ? "text-emerald-600 font-medium" : "text-muted-foreground"}>
                  {file.indexed ? t("indexingDone") : t("indexingPending")}
                </span>
              </div>
            )}
            {file.file_type === "audio" && file.duration > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("detailDuration")}</span>
                <span>{fmtDuration(file.duration)}</span>
              </div>
            )}
            {file.file_type === "image" && !!file.metadata?.camera_model && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("detailCamera")}</span>
                <span className="text-right text-xs">
                  {[file.metadata.camera_make as string, file.metadata.camera_model as string].filter(Boolean).join(" ")}
                </span>
              </div>
            )}
            {file.file_type === "image" && !!file.metadata?.date_taken && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("detailDateTaken")}</span>
                <span>{String(file.metadata.date_taken).slice(0, 10)}</span>
              </div>
            )}
          </div>
          {file.file_type === "image" && !!file.metadata?.latitude && !!file.metadata?.longitude && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground">{t("detailLocation")}</p>
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs tabular-nums">
                    {Number(file.metadata.latitude as number).toFixed(6)}, {Number(file.metadata.longitude as number).toFixed(6)}
                  </p>
                  <a
                    href={`https://www.google.com/maps?q=${file.metadata.latitude},${file.metadata.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="size-3" />
                    Google Maps
                  </a>
                </div>
              </div>
            </div>
          )}
          {file.analysis && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">{t("analysisResult")}</p>
              <p className="text-xs bg-muted/50 rounded-lg p-3 leading-relaxed whitespace-pre-wrap">{file.analysis}</p>
            </div>
          )}
          {file.transcript && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">{t("transcript")}</p>
              <p className="text-xs bg-muted/50 rounded-lg p-3 leading-relaxed whitespace-pre-wrap">{file.transcript}</p>
            </div>
          )}
          {file.prompt && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">{t("prompt")}</p>
              <p className="text-xs bg-muted/50 rounded-lg p-3 leading-relaxed">{file.prompt}</p>
            </div>
          )}
        </div>
        <div className="p-4 border-t border-border flex flex-col gap-2">
          <Button variant="outline" size="sm" className="w-full" asChild>
            <a href={file.url} target="_blank" rel="noopener noreferrer" download>
              <Download className="size-4 mr-2" /> {t("download")}
            </a>
          </Button>
          {file.file_type === "document" && !file.indexed && (
            <Button size="sm" className="w-full" onClick={handleIndex} disabled={indexing}>
              {indexing ? <Loader2 className="size-4 mr-2 animate-spin" /> : <RefreshCw className="size-4 mr-2" />}
              {t("indexDocument")}
            </Button>
          )}
          <Button
            variant="destructive" size="sm" className="w-full"
            onClick={() => { onDelete(file.id); onClose() }}
          >
            <Trash2 className="size-4 mr-2" /> {t("delete")}
          </Button>
        </div>
      </div>
    </>
  )
}
