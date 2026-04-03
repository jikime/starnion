"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  FileText, Image as ImageIcon, Music, FolderOpen,
  Upload, X, Loader2, AlertCircle, Sparkles, RefreshCw, Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"
import type { FileItem, FileType, ActionType } from "./_components/types"
import { FILE_ACCEPT } from "./_components/types"
import TopBar from "./_components/top-bar"
import FileCard from "./_components/file-card"
import FileRow from "./_components/file-row"
import DetailPanel from "./_components/detail-panel"
import DocSearchPanel from "./_components/doc-search-panel"
import DocGenerateModal from "./_components/doc-generate-modal"
import ImgActionModal from "./_components/img-action-modal"
import AudioRecordModal from "./_components/audio-record-modal"
import AudioTranscribeModal from "./_components/audio-transcribe-modal"

export default function FilesPage() {
  const t = useTranslations("files")
  const [files, setFiles] = useState<FileItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [typeFilter, setTypeFilter] = useState<FileType>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null)
  const [activeTab, setActiveTab] = useState<"files" | "search">("files")
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({})
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null)
  const [activeAction, setActiveAction] = useState<ActionType>(null)
  const [sortBy, setSortBy] = useState<"date" | "name" | "size" | "type">("date")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const autoSelectRef = useRef(false)
  const LIMIT = 40

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchFiles = useCallback(async (p = 1, type: FileType = typeFilter, search = "") => {
    setLoading(true); setError("")
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) })
      if (type !== "all") params.set("type", type)
      if (search) params.set("name", search)
      const res = await fetch(`/api/files?${params}`)
      if (!res.ok) throw new Error("failed")
      const data = await res.json() as { files?: FileItem[]; total?: number; type_counts?: Record<string, number> }
      const newFiles = data.files ?? []
      setFiles(newFiles); setTotal(data.total ?? 0); setPage(p)
      if (data.type_counts) setTypeCounts(data.type_counts)
      if (autoSelectRef.current && newFiles.length > 0) { setSelectedFile(newFiles[0]); autoSelectRef.current = false }
    } catch { setError(t("loadFailed")) }
    finally { setLoading(false) }
  }, [typeFilter, t])

  const fetchCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/files?limit=1&page=1")
      if (!res.ok) return
      const data = await res.json() as { type_counts?: Record<string, number> }
      if (data.type_counts) setTypeCounts(data.type_counts)
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    const id = setTimeout(() => fetchFiles(1, typeFilter, searchQuery), searchQuery ? 300 : 0)
    return () => clearTimeout(id)
  }, [typeFilter, searchQuery]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ────────────────────────────────────────────────────────────────

  const uploadFile = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData(); fd.append("file", file)
      const res = await fetch("/api/files", { method: "POST", body: fd })
      if (!res.ok) throw new Error("upload failed")
      await fetchFiles(1, typeFilter, searchQuery); fetchCounts()
    } catch { setError(t("uploadFailed")) }
    finally { setUploading(false) }
  }

  const confirmDelete = (id: number) => setDeleteTarget(id)
  const deleteFile = async (id: number) => {
    setDeleteTarget(null)
    try {
      await fetch(`/api/files/${id}`, { method: "DELETE" })
      setFiles(prev => prev.filter(f => f.id !== id))
      if (selectedFile?.id === id) setSelectedFile(null)
      fetchCounts()
    } catch { setError(t("deleteFailed")) }
  }

  const indexFile = async (id: number) => {
    try {
      const res = await fetch(`/api/files/${id}/index`, { method: "POST" })
      if (!res.ok) throw new Error("index failed")
      const data = await res.json() as { indexed?: boolean }
      if (data.indexed) {
        setFiles(prev => prev.map(f => f.id === id ? { ...f, indexed: true } : f))
        if (selectedFile?.id === id) setSelectedFile(prev => prev ? { ...prev, indexed: true } : null)
      }
    } catch { setError(t("indexFailed")) }
  }

  const toggleSelect = (id: number) => setSelectedIds(prev => {
    const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next
  })
  const clearSelection = () => setSelectedIds(new Set())
  const selectAll = () => setSelectedIds(new Set(files.map(f => f.id)))

  const bulkDelete = async () => {
    await Promise.all([...selectedIds].map(id => fetch(`/api/files/${id}`, { method: "DELETE" })))
    setFiles(prev => prev.filter(f => !selectedIds.has(f.id)))
    if (selectedFile && selectedIds.has(selectedFile.id)) setSelectedFile(null)
    clearSelection(); fetchCounts()
  }
  const bulkIndex = async () => {
    const ids = [...selectedIds].filter(id => { const f = files.find(f => f.id === id); return f?.file_type === "document" && !f.indexed })
    await Promise.all(ids.map(id => indexFile(id))); clearSelection()
  }

  const handleActionDone = () => {
    autoSelectRef.current = true
    setTimeout(() => { fetchFiles(1, typeFilter, searchQuery); fetchCounts() }, 500)
  }

  const handleSearchFileSelect = async (fileId: number) => {
    const found = files.find(f => f.id === fileId)
    if (found) { setActiveTab("files"); setSelectedFile(found); return }
    try {
      const res = await fetch(`/api/files/${fileId}`)
      if (!res.ok) return
      setActiveTab("files"); setSelectedFile(await res.json() as FileItem)
    } catch { /* ignore */ }
  }

  const handleSort = (key: "date" | "name" | "size" | "type") => {
    if (sortBy === key) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortBy(key); setSortDir("desc") }
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const displayedFiles = [...files].sort((a, b) => {
    let cmp = 0
    switch (sortBy) {
      case "name": cmp = a.name.localeCompare(b.name, "ko"); break
      case "size": cmp = a.size - b.size; break
      case "type": cmp = a.format.localeCompare(b.format); break
      default: cmp = a.created_at.localeCompare(b.created_at); break
    }
    return sortDir === "asc" ? cmp : -cmp
  })

  const uploadAccept = typeFilter === "document" ? FILE_ACCEPT.document
    : typeFilter === "image" ? FILE_ACCEPT.image
    : typeFilter === "audio" ? FILE_ACCEPT.audio
    : Object.values(FILE_ACCEPT).join(",")

  const typeFilters: { key: FileType; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: "all", label: t("filterAll"), icon: <FolderOpen className="size-4" /> },
    { key: "document", label: t("filterDocument"), icon: <FileText className="size-4 text-blue-500" />, count: typeCounts.document },
    { key: "image", label: t("filterImage"), icon: <ImageIcon className="size-4 text-purple-500" />, count: typeCounts.image },
    { key: "audio", label: t("filterAudio"), icon: <Music className="size-4 text-yellow-500" />, count: typeCounts.audio },
  ]

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = () => setIsDragging(false)
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) uploadFile(f) }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      {isDragging && (
        <div className="fixed inset-0 z-50 bg-primary/10 border-4 border-dashed border-primary/40 flex items-center justify-center pointer-events-none">
          <div className="bg-background rounded-2xl p-8 shadow-xl text-center">
            <Upload className="size-12 text-primary mx-auto mb-3" />
            <p className="text-lg font-semibold">{t("dropHere")}</p>
          </div>
        </div>
      )}

      <TopBar
        searchQuery={searchQuery} onSearchChange={setSearchQuery}
        uploading={uploading} uploadAccept={uploadAccept} onUpload={uploadFile}
        onAction={setActiveAction}
        sortBy={sortBy} sortDir={sortDir} onSort={handleSort}
        viewMode={viewMode} onViewChange={setViewMode}
        loading={loading} onRefresh={() => fetchFiles(1, typeFilter, searchQuery)}
      />

      {/* ── Filter tabs ── */}
      <div className="flex items-center gap-1 px-4 sm:px-6 py-2 border-b border-border shrink-0 overflow-x-auto">
        {typeFilters.map(tf => (
          <button
            key={tf.key}
            onClick={() => { setTypeFilter(tf.key); setSelectedFile(null); setActiveTab("files"); setSearchQuery("") }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap shrink-0",
              activeTab === "files" && typeFilter === tf.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {tf.icon}{tf.label}
            {tf.count !== undefined && tf.count > 0 && (
              <span className={cn("text-[11px] px-1.5 py-0.5 rounded-full font-semibold",
                activeTab === "files" && typeFilter === tf.key ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
              )}>{tf.count}</span>
            )}
          </button>
        ))}
        <div className="w-px h-5 bg-border mx-1 shrink-0" />
        <button
          onClick={() => { setActiveTab("search"); setSelectedFile(null) }}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border whitespace-nowrap shrink-0",
            activeTab === "search" ? "bg-violet-600 text-white border-violet-600"
              : "text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-800 hover:bg-violet-50 dark:hover:bg-violet-900/20"
          )}
        >
          <Sparkles className="size-4" />{t("searchTab")}
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0">
        {activeTab === "search" && <div className="flex-1 min-w-0"><DocSearchPanel onFileSelect={handleSearchFileSelect} /></div>}
        <div className={cn("flex-1 flex flex-col min-w-0", activeTab === "search" && "hidden")}>
          {error && (
            <div className="mx-4 mt-3 flex items-center gap-2 px-3 py-2 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />{error}
              <button onClick={() => setError("")} className="ml-auto"><X className="size-4" /></button>
            </div>
          )}
          {selectedIds.size > 0 && (
            <div className="mx-4 mt-2 flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg flex-wrap">
              <span className="text-sm font-medium text-primary">{selectedIds.size}개 선택됨</span>
              <button onClick={selectAll} className="text-xs text-muted-foreground hover:text-foreground underline">전체 선택</button>
              <button onClick={clearSelection} className="text-xs text-muted-foreground hover:text-foreground underline">선택 해제</button>
              <div className="ml-auto flex items-center gap-1.5">
                {files.some(f => selectedIds.has(f.id) && f.file_type === "document" && !f.indexed) && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={bulkIndex}><RefreshCw className="size-3 mr-1" />인덱싱</Button>
                )}
                <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={bulkDelete}><Trash2 className="size-3 mr-1" />삭제</Button>
              </div>
            </div>
          )}
          <div className="px-4 py-2 text-xs text-muted-foreground border-b border-border shrink-0">
            {loading ? t("loading") : total > LIMIT ? t("fileCountWithTotal", { count: displayedFiles.length, total }) : t("fileCount", { count: displayedFiles.length })}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex items-center justify-center h-40"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>
            ) : displayedFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-3">
                <FolderOpen className="size-12 opacity-30" />
                <p className="text-sm">{searchQuery ? t("noSearchResults") : t("noFiles")}</p>
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {displayedFiles.map(f => (
                  <FileCard key={f.id} file={f} onClick={setSelectedFile} onDelete={confirmDelete}
                    isSelected={selectedIds.has(f.id)} onToggleSelect={toggleSelect} />
                ))}
              </div>
            ) : (
              <div className="space-y-0.5">
                <div className="flex items-center gap-3 px-4 py-1.5 text-xs text-muted-foreground font-medium">
                  <span className="w-5 shrink-0" />
                  <span className="flex-1">{t("colName")}</span>
                  <span className="w-16 text-right shrink-0">{t("colFormat")}</span>
                  <span className="w-16 text-right shrink-0 hidden sm:block">{t("colSize")}</span>
                  <span className="w-20 text-right shrink-0 hidden sm:block">{t("colDate")}</span>
                  <span className="w-16 shrink-0" />
                </div>
                <Separator />
                {displayedFiles.map(f => (
                  <FileRow key={f.id} file={f} onClick={setSelectedFile} onDelete={confirmDelete}
                    isSelected={selectedIds.has(f.id)} onToggleSelect={toggleSelect} />
                ))}
              </div>
            )}
            {total > LIMIT && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <Button variant="outline" size="sm" disabled={page === 1 || loading} onClick={() => fetchFiles(page - 1, typeFilter, searchQuery)}>{t("prev")}</Button>
                <span className="text-sm text-muted-foreground">{page} / {Math.ceil(total / LIMIT)}</span>
                <Button variant="outline" size="sm" disabled={page * LIMIT >= total || loading} onClick={() => fetchFiles(page + 1, typeFilter, searchQuery)}>{t("next")}</Button>
              </div>
            )}
          </div>
        </div>
        {selectedFile && <DetailPanel file={selectedFile} onClose={() => setSelectedFile(null)} onDelete={confirmDelete} onIndex={indexFile} />}
      </div>

      {/* ── Action Modals ── */}
      <DocGenerateModal open={activeAction === "doc-generate"} onClose={() => setActiveAction(null)} onDone={handleActionDone} />
      <ImgActionModal action="img-generate" open={activeAction === "img-generate"} onClose={() => setActiveAction(null)} onDone={handleActionDone} />
      <ImgActionModal action="img-analyze" open={activeAction === "img-analyze"} onClose={() => setActiveAction(null)} onDone={handleActionDone} />
      <ImgActionModal action="img-edit" open={activeAction === "img-edit"} onClose={() => setActiveAction(null)} onDone={handleActionDone} />
      <AudioRecordModal open={activeAction === "audio-record"} onClose={() => setActiveAction(null)} onDone={handleActionDone} />
      <AudioTranscribeModal open={activeAction === "audio-transcribe"} onClose={() => setActiveAction(null)} onDone={handleActionDone} />

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={open => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteConfirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget !== null && deleteFile(deleteTarget)}>{t("delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
