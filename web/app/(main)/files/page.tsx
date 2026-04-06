"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  Search, Upload, Plus, RefreshCw, LayoutGrid, List,
  Folder, FileText, Image as ImageIcon, Music, Sparkles,
  MoreVertical, Download, Pencil, Copy, Trash, Loader2,
  X, Play, Pause, FileAudio, MapPin, ExternalLink, Trash2,
  Info, BookOpenText, AlertCircle, ChevronDown,
} from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import ReactMarkdown from "react-markdown"
import rehypeSanitize from "rehype-sanitize"
import remarkGfm from "remark-gfm"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

// ── Types ────────────────────────────────────────────────────────────────────

type FileType = "all" | "doc" | "image" | "audio"
type ViewMode = "grid" | "list"

interface SearchResult {
  id: number
  file_id: number
  file_name: string
  content: string
  similarity: number
}

function similarityLabel(score: number): { tKey: string; cls: string } {
  if (score >= 0.8) return { tKey: "similarityHigh", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" }
  if (score >= 0.5) return { tKey: "similarityMedium", cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" }
  return { tKey: "similarityLow", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" }
}

interface FileItem {
  id: number
  name: string
  file_type: string
  format: string
  size: number
  size_label?: string
  created_at: string
  thumbnail_url?: string
  url?: string
  indexed?: boolean
  sub_type?: string
  duration?: number
  analysis?: string
  transcript?: string
  prompt?: string
  metadata?: Record<string, unknown>
}

const MIME_COLORS: Record<string, string> = {
  pdf: "#F85149", docx: "#58A6FF", doc: "#58A6FF", txt: "#8B949E",
  jpg: "#BC8CFF", jpeg: "#BC8CFF", png: "#3FB950", webp: "#3FB950", gif: "#BC8CFF",
  mp3: "#E3A948", wav: "#E3A948", m4a: "#E3A948", ogg: "#E3A948",
}

const TYPE_FILTERS: { id: FileType | "search"; tKey: string; icon: React.ElementType }[] = [
  { id: "all",    tKey: "all",       icon: Folder },
  { id: "doc",    tKey: "doc",       icon: FileText },
  { id: "image",  tKey: "image",     icon: ImageIcon },
  { id: "audio",  tKey: "audioFilter", icon: Music },
  { id: "search", tKey: "docSearch", icon: Sparkles },
]

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return iso.slice(0, 10)
}

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, "0")}`
}

function mapFileType(ft: string): FileType {
  if (ft === "document") return "doc"
  if (ft === "image") return "image"
  if (ft === "audio") return "audio"
  return "doc"
}

// ── Component ────────────────────────────────────────────────────────────────

export default function FilesPage() {
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({})
  const [filter, setFilter] = useState<FileType | "search">("all")
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [query, setQuery] = useState("")
  const [menuId, setMenuId] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null)
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null)

  const t = useTranslations("files")

  // Filter dropdown (mobile)
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false)
    }
    if (filterOpen) document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [filterOpen])

  // Doc search state
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchMode, setSearchMode] = useState("")
  const [searched, setSearched] = useState(false)
  const [searchError, setSearchError] = useState("")

  const fetchFiles = useCallback(async (type: FileType = "all", search = "") => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: "1", limit: "100" })
      const apiType = type === "doc" ? "document" : type
      if (type !== "all") params.set("type", apiType)
      if (search) params.set("name", search)
      const res = await fetch(`/api/files?${params}`)
      if (!res.ok) throw new Error("failed")
      const data = await res.json() as { files?: FileItem[]; total?: number; type_counts?: Record<string, number> }
      setFiles(data.files ?? [])
      setTotal(data.total ?? 0)
      if (data.type_counts) setTypeCounts(data.type_counts)
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    const id = setTimeout(() => {
      const apiFilter = filter === "search" ? "all" : filter
      fetchFiles(apiFilter, query)
    }, query ? 300 : 0)
    return () => clearTimeout(id)
  }, [filter, query, fetchFiles])

  const deleteFile = async (id: number) => {
    setMenuId(null)
    try {
      await fetch(`/api/files/${id}`, { method: "DELETE" })
      setFiles(prev => prev.filter(f => f.id !== id))
      fetchFiles(filter === "search" ? "all" : filter, query)
    } catch { /* silent */ }
  }

  const uploadFile = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/files", { method: "POST", body: fd })
      if (res.ok) fetchFiles(filter === "search" ? "all" : filter, query)
    } catch { /* silent */ }
    finally { setUploading(false) }
  }

  const handleUploadClick = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.onchange = (e) => {
      const f = (e.target as HTMLInputElement).files?.[0]
      if (f) uploadFile(f)
    }
    input.click()
  }

  const doDocSearch = async () => {
    const q = searchQuery.trim()
    if (!q) return
    setSearching(true); setSearchError("")
    try {
      const res = await fetch(`/api/files/search?q=${encodeURIComponent(q)}&limit=20`)
      if (!res.ok) throw new Error()
      const data = await res.json() as { results: SearchResult[]; search_mode: string }
      setSearchResults(data.results ?? [])
      setSearchMode(data.search_mode ?? "")
      setSearched(true)
    } catch {
      setSearchError(t("searchFailed"))
    } finally {
      setSearching(false)
    }
  }

  const handleSearchFileSelect = async (fileId: number) => {
    const found = files.find(f => f.id === fileId)
    if (found) { setFilter("all"); setSelectedFile(found); return }
    try {
      const res = await fetch(`/api/files/${fileId}`)
      if (!res.ok) return
      const file = await res.json() as FileItem
      setFilter("all")
      setSelectedFile(file)
    } catch { /* ignore */ }
  }

  const downloadFile = (file: FileItem) => {
    if (file.url) window.open(file.url, "_blank")
    setMenuId(null)
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const filtered = files.filter(f => {
    const ft = mapFileType(f.file_type)
    const matchesType = filter === "all" || filter === "search" || ft === filter
    const matchesQuery = !query || f.name.toLowerCase().includes(query.toLowerCase())
    return matchesType && matchesQuery
  })

  const counts: Record<string, number> = {
    all: total,
    doc: typeCounts.document ?? 0,
    image: typeCounts.image ?? 0,
    audio: typeCounts.audio ?? 0,
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-background"
      onClick={() => setMenuId(null)}>
      {/* Top bar */}
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 h-12 border-b border-border shrink-0">
        <span className="text-sm font-bold text-foreground whitespace-nowrap hidden sm:block">{t("title")}</span>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full h-8 pl-8 pr-3 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
          <button
            onClick={handleUploadClick}
            disabled={uploading}
            className="flex items-center gap-1.5 h-8 px-2 sm:px-3 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-accent/40 transition-colors disabled:opacity-50"
            title={t("upload")}>
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{t("upload")}</span>
          </button>
          <button className="flex items-center gap-1.5 h-8 px-2 sm:px-3 rounded-lg text-xs font-semibold transition-colors"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
            title={t("createNew")}>
            <Plus className="w-3.5 h-3.5" /><span className="hidden sm:inline">{t("createNew")}</span>
          </button>
          <div className="w-px h-5 bg-border" />
          <button
            onClick={() => fetchFiles(filter === "search" ? "all" : filter, query)}
            disabled={loading}
            className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent/40 transition-colors">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </button>
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode("grid")}
              className={cn("w-7 h-7 flex items-center justify-center transition-colors",
                viewMode === "grid" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/40")}>
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn("w-7 h-7 flex items-center justify-center transition-colors",
                viewMode === "list" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/40")}>
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter tabs — Desktop: horizontal pills, Mobile: dropdown */}
      <div className="flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 border-b border-border shrink-0">
        {/* Mobile: custom dropdown */}
        <div ref={filterRef} className="sm:hidden relative flex-1">
          {(() => {
            const active = TYPE_FILTERS.find(f => f.id === filter)
            const ActiveIcon = active?.icon ?? Folder
            const activeCount = filter !== "search" ? counts[filter] : undefined
            return (
              <button
                onClick={() => setFilterOpen(v => !v)}
                className="w-full h-9 flex items-center gap-2 px-3 rounded-lg border border-border bg-background text-sm font-medium text-foreground transition-colors"
              >
                <ActiveIcon className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left">{active ? t(active.tKey) : t("all")}</span>
                {activeCount !== undefined && activeCount > 0 && (
                  <span className="text-xs text-muted-foreground">{activeCount}</span>
                )}
                <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", filterOpen && "rotate-180")} />
              </button>
            )
          })()}
          {filterOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-border bg-card shadow-xl z-[9999] py-1">
              {TYPE_FILTERS.map(({ id, tKey, icon: Icon }) => {
                const count = id !== "search" ? counts[id] : undefined
                const isActive = filter === id
                return (
                  <button key={id} onClick={() => { setFilter(id as FileType | "search"); setFilterOpen(false) }}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium transition-colors",
                      isActive ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    )}>
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="flex-1 text-left">{t(tKey)}</span>
                    {count !== undefined && count > 0 && (
                      <span className="text-xs text-muted-foreground">{count}</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Desktop: horizontal pills */}
        <div className="hidden sm:flex items-center gap-2 overflow-x-auto">
          {TYPE_FILTERS.map(({ id, tKey, icon: Icon }) => {
            const count = id !== "search" ? counts[id] : undefined
            const isActive = filter === id
            return (
              <button key={id} onClick={() => setFilter(id as FileType | "search")}
                className={cn(
                  "shrink-0 flex items-center gap-1.5 h-8 px-3.5 rounded-full text-xs font-medium transition-colors border",
                  isActive
                    ? "border-transparent text-white"
                    : "border-border bg-background text-foreground hover:bg-accent/40"
                )}
                style={isActive ? { background: "var(--primary)" } : {}}>
                <Icon className="w-3.5 h-3.5" />
                {t(tKey)}
                {count !== undefined && count > 0 && (
                  <span className={cn("text-xs font-semibold",
                    isActive ? "opacity-80" : "text-muted-foreground")}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Doc Search Panel ── */}
      {filter === "search" && (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Search bar */}
          <div className="px-6 py-4 border-b border-border shrink-0">
            <p className="text-xs text-muted-foreground mb-2">{t("docSearchDesc")}</p>
            <div className="flex items-start gap-2 text-xs bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg px-3 py-2 mb-3">
              <Info className="size-3.5 shrink-0 mt-0.5 text-blue-500" />
              <span className="text-blue-700 dark:text-blue-300 leading-relaxed">
                {t("docSearchHint")}
              </span>
            </div>
            <form onSubmit={e => { e.preventDefault(); doDocSearch() }} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder={t("searchInputPlaceholder")}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9"
                  autoFocus
                />
                {searchQuery && (
                  <button type="button"
                    onClick={() => { setSearchQuery(""); setSearchResults([]); setSearched(false) }}
                    className="absolute right-2 top-1/2 -translate-y-1/2">
                    <X className="size-4 text-muted-foreground" />
                  </button>
                )}
              </div>
              <Button type="submit" disabled={searching || !searchQuery.trim()}>
                {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                <span className="ml-1.5">{t("search")}</span>
              </Button>
            </form>
            {searchError && (
              <p className="mt-2 text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="size-3.5" />{searchError}
              </p>
            )}
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto">
            {searched && (
              <div className="px-6 py-2 border-b border-border flex items-center justify-between text-xs text-muted-foreground">
                <span>{searchResults.length > 0 ? t("results", { count: searchResults.length }) : t("noResults")}</span>
                {searchMode && (
                  <span className="px-2 py-0.5 bg-muted rounded-full font-medium">
                    {searchMode === "semantic" ? t("semanticSearch") : searchMode === "full-text" ? t("fullTextSearch") : searchMode}
                  </span>
                )}
              </div>
            )}
            {searchResults.length === 0 && searched && !searching && (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                <BookOpenText className="size-10 opacity-30" />
                <p className="text-sm">{t("noResults")}</p>
              </div>
            )}
            <div className="divide-y divide-border/50">
              {searchResults.map(r => {
                const sim = similarityLabel(r.similarity)
                return (
                  <div key={r.id} className="px-6 py-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="size-4 shrink-0 text-blue-500" />
                        <span className="text-sm font-medium truncate">{r.file_name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={cn("text-xs font-semibold px-1.5 py-0.5 rounded", sim.cls)}>
                          {t(sim.tKey)}
                        </span>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
                          onClick={() => handleSearchFileSelect(r.file_id)}>
                          {t("viewFile")}
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 bg-muted/40 rounded-md px-3 py-2">
                      {r.content}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* File count */}
      {filter !== "search" && (
      <div className="px-5 py-2 shrink-0">
        <span className="text-xs text-muted-foreground">
          {loading ? t("loading") : t("fileCount", { count: filtered.length })}
        </span>
      </div>
      )}

      {/* File grid / list */}
      {filter !== "search" && (
      <div className="flex-1 overflow-y-auto px-5 pb-5">
        {loading && files.length === 0 ? (
          viewMode === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border bg-card overflow-hidden">
                  <Skeleton className="aspect-square w-full" />
                  <div className="p-2.5 space-y-2">
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="h-2 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_40px] px-4 py-2 border-b border-border bg-muted/40">
                {[t("name"), t("type"), t("size"), t("date"), ""].map((h, i) => (
                  <span key={i} className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</span>
                ))}
              </div>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr_40px] items-center px-4 py-2.5 border-b border-border last:border-0">
                  <div className="flex items-center gap-2.5">
                    <Skeleton className="w-7 h-7 rounded-lg shrink-0" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-3 w-16" />
                  <div />
                </div>
              ))}
            </div>
          )
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
            <Folder className="w-10 h-10 opacity-30" />
            <p className="text-sm">{t("noFiles")}</p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filtered.map(file => {
              const ext = file.format?.toLowerCase() ?? file.name.split(".").pop()?.toLowerCase() ?? ""
              const color = MIME_COLORS[ext] ?? "#8B949E"
              const isImage = file.file_type === "image"
              return (
                <div key={file.id}
                  onClick={() => setSelectedFile(file)}
                  className="group relative rounded-xl border border-border bg-card overflow-hidden hover:shadow-md transition-shadow cursor-pointer">
                  {/* Thumbnail or icon */}
                  <div className="relative aspect-square bg-muted overflow-hidden rounded-lg">
                    {isImage && file.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={file.url} alt={file.name}
                        className="w-full h-full object-cover cursor-zoom-in"
                        onClick={e => { e.stopPropagation(); setPreviewImage({ url: file.url!, name: file.name }) }} />
                    ) : file.file_type === "audio" ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music className="w-10 h-10 text-yellow-400" />
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-sm"
                          style={{ background: color }}>
                          {ext.toUpperCase().slice(0, 4)}
                        </div>
                      </div>
                    )}
                    {/* Context menu button */}
                    <button
                      onClick={e => { e.stopPropagation(); setMenuId(menuId === file.id ? null : file.id) }}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                    {/* Dropdown */}
                    {menuId === file.id && (
                      <div
                        onClick={e => e.stopPropagation()}
                        className="absolute top-8 right-1.5 w-36 rounded-xl border border-border bg-card shadow-xl z-20 py-1 overflow-hidden">
                        <button onClick={() => downloadFile(file)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-accent/50 transition-colors">
                          <Download className="w-3.5 h-3.5 text-muted-foreground" />{t("download")}
                        </button>
                        <button onClick={() => setMenuId(null)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-accent/50 transition-colors">
                          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />{t("rename")}
                        </button>
                        <button onClick={() => setMenuId(null)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-accent/50 transition-colors">
                          <Copy className="w-3.5 h-3.5 text-muted-foreground" />{t("copy")}
                        </button>
                        <div className="border-t border-border my-1" />
                        <button onClick={() => deleteFile(file.id)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-accent/50 transition-colors">
                          <Trash className="w-3.5 h-3.5" />{t("delete")}
                        </button>
                      </div>
                    )}
                  </div>
                  {/* Info */}
                  <div className="p-2.5">
                    <p className="text-xs text-foreground font-medium truncate">{file.name}</p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: color + "22", color }}>
                        {ext.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">{formatSize(file.size)} · {formatDate(file.created_at)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* List view */
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_40px] px-4 py-2 border-b border-border bg-muted/40">
              {[t("name"), t("type"), t("size"), t("date"), ""].map((h, i) => (
                <span key={i} className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</span>
              ))}
            </div>
            {filtered.map((file, idx) => {
              const ext = file.format?.toLowerCase() ?? file.name.split(".").pop()?.toLowerCase() ?? ""
              const color = MIME_COLORS[ext] ?? "#8B949E"
              return (
                <div key={file.id}
                  onClick={() => setSelectedFile(file)}
                  className={cn("grid grid-cols-[2fr_1fr_1fr_1fr_40px] items-center px-4 py-2.5 hover:bg-accent/10 transition-colors group cursor-pointer",
                    idx < filtered.length - 1 && "border-b border-border")}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold text-white"
                      style={{ background: color }}>
                      {ext.toUpperCase().slice(0, 4)}
                    </div>
                    <span className="text-xs text-foreground truncate">{file.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{ext.toUpperCase()}</span>
                  <span className="text-xs text-muted-foreground">{formatSize(file.size)}</span>
                  <span className="text-xs text-muted-foreground">{formatDate(file.created_at)}</span>
                  <div className="relative flex justify-end">
                    <button
                      onClick={e => { e.stopPropagation(); setMenuId(menuId === file.id ? null : file.id) }}
                      className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/40 opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                    {menuId === file.id && (
                      <div
                        onClick={e => e.stopPropagation()}
                        className="absolute top-6 right-0 w-36 rounded-xl border border-border bg-card shadow-xl z-20 py-1 overflow-hidden">
                        <button onClick={() => downloadFile(file)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-accent/50 transition-colors">
                          <Download className="w-3.5 h-3.5 text-muted-foreground" />{t("download")}
                        </button>
                        <button onClick={() => setMenuId(null)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-accent/50 transition-colors">
                          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />{t("rename")}
                        </button>
                        <button onClick={() => setMenuId(null)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-accent/50 transition-colors">
                          <Copy className="w-3.5 h-3.5 text-muted-foreground" />{t("copy")}
                        </button>
                        <div className="border-t border-border my-1" />
                        <button onClick={() => deleteFile(file.id)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-accent/50 transition-colors">
                          <Trash className="w-3.5 h-3.5" />{t("delete")}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      )}

      {/* ── Image Preview Modal ── */}
      <Dialog open={!!previewImage} onOpenChange={v => { if (!v) setPreviewImage(null) }}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden bg-black/95 border-none">
          <DialogHeader className="absolute top-0 left-0 right-0 z-10 flex flex-row items-center justify-between px-4 py-3 bg-gradient-to-b from-black/70 to-transparent">
            <DialogTitle className="text-sm font-medium text-white truncate pr-8">
              {previewImage?.name}
            </DialogTitle>
            <DialogDescription className="sr-only">Image preview</DialogDescription>
            <button onClick={() => setPreviewImage(null)}
              className="absolute top-3 right-3 p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
              <X className="size-4 text-white" />
            </button>
          </DialogHeader>
          <div className="flex items-center justify-center w-full h-full min-h-[300px] max-h-[85vh] p-4 pt-12">
            {previewImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewImage.url} alt={previewImage.name}
                className="max-w-full max-h-full object-contain rounded-lg" />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Detail Panel (slide-in) ── */}
      {selectedFile && (
        <DetailPanel
          file={selectedFile}
          onClose={() => setSelectedFile(null)}
          onDelete={(id) => { deleteFile(id); setSelectedFile(null) }}
          onDownload={downloadFile}
        />
      )}
    </div>
  )
}

// ── DetailPanel ──────────────────────────────────────────────────────────────

function DetailPanel({ file, onClose, onDelete, onDownload }: {
  file: FileItem
  onClose: () => void
  onDelete: (id: number) => void
  onDownload: (f: FileItem) => void
}) {
  const t = useTranslations("files")
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  const togglePlay = () => {
    if (!audioRef.current) return
    if (isPlaying) audioRef.current.pause()
    else audioRef.current.play()
    setIsPlaying(!isPlaying)
  }

  const ext = file.format?.toLowerCase() ?? file.name.split(".").pop()?.toLowerCase() ?? ""
  const color = MIME_COLORS[ext] ?? "#8B949E"

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[400px] bg-background border-l border-border flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold truncate">{file.name}</span>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="size-4" /></button>
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col gap-4 overflow-y-auto flex-1">
          {/* Preview */}
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
                    {(file.duration ?? 0) > 0 && (
                      <div className="w-full flex items-center gap-2 px-2">
                        <span className="text-xs text-muted-foreground w-9 text-right tabular-nums">{fmtDuration(currentTime)}</span>
                        <input type="range" min={0} max={file.duration} value={currentTime}
                          onChange={e => { const v = Number(e.target.value); setCurrentTime(v); if (audioRef.current) audioRef.current.currentTime = v }}
                          className="flex-1 h-1.5 accent-yellow-500 cursor-pointer" />
                        <span className="text-xs text-muted-foreground w-9 tabular-nums">{fmtDuration(file.duration ?? 0)}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <FileText className="size-16 text-blue-400" />
            )}
          </div>

          {/* Details */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("type")}</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ background: color + "22", color }}>{ext.toUpperCase()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("size")}</span>
              <span>{file.size_label ?? formatSize(file.size)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("date")}</span>
              <span>{formatDate(file.created_at)}</span>
            </div>
            {file.sub_type && file.sub_type !== "uploaded" && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("createdBy")}</span>
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-muted">{file.sub_type}</span>
              </div>
            )}
            {file.file_type === "document" && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("indexing")}</span>
                <span className={file.indexed ? "text-emerald-600 font-medium" : "text-muted-foreground"}>
                  {file.indexed ? t("indexed") : t("notIndexed")}
                </span>
              </div>
            )}
            {file.file_type === "audio" && (file.duration ?? 0) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("duration")}</span>
                <span>{fmtDuration(file.duration ?? 0)}</span>
              </div>
            )}
            {file.file_type === "image" && !!file.metadata?.camera_model && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("camera")}</span>
                <span className="text-right text-xs">
                  {[file.metadata.camera_make as string, file.metadata.camera_model as string].filter(Boolean).join(" ")}
                </span>
              </div>
            )}
          </div>

          {/* GPS */}
          {file.file_type === "image" && !!file.metadata?.latitude && !!file.metadata?.longitude && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground">{t("location")}</p>
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs tabular-nums">
                    {Number(file.metadata.latitude as number).toFixed(6)}, {Number(file.metadata.longitude as number).toFixed(6)}
                  </p>
                  <a href={`https://www.google.com/maps?q=${file.metadata.latitude},${file.metadata.longitude}`}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <ExternalLink className="size-3" />Google Maps
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Analysis / Transcript / Prompt */}
          {file.analysis && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">{t("analysis")}</p>
              <div className="bg-muted/50 rounded-lg p-3 markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{file.analysis}</ReactMarkdown>
              </div>
            </div>
          )}
          {file.transcript && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">{t("transcript")}</p>
              <div className="bg-muted/50 rounded-lg p-3 markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{file.transcript}</ReactMarkdown>
              </div>
            </div>
          )}
          {file.prompt && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">{t("prompt")}</p>
              <div className="bg-muted/50 rounded-lg p-3 markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{file.prompt}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-border flex flex-col gap-2">
          <Button variant="outline" size="sm" className="w-full" onClick={() => onDownload(file)}>
            <Download className="size-4 mr-2" />{t("download")}
          </Button>
          <Button variant="destructive" size="sm" className="w-full" onClick={() => onDelete(file.id)}>
            <Trash2 className="size-4 mr-2" />{t("delete")}
          </Button>
        </div>
      </div>
    </>
  )
}
