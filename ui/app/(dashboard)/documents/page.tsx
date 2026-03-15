"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Download,
  FileText,
  Trash2,
  Loader2,
  CloudUpload,
  AlertTriangle,
  Files,
  PenLine,
  Upload,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────────────────────

interface Document {
  id: number
  name: string
  mime: string
  url: string
  size: number
  format: string
  size_label: string
  created_at: string
}

// ── Static config ──────────────────────────────────────────────────────────────

const FORMATS = ["PDF", "DOCX", "XLSX", "PPTX", "MD", "TXT"]

const FORMAT_BADGE: Record<string, string> = {
  PDF:  "bg-red-100 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
  DOCX: "bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
  XLSX: "bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  PPTX: "bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800",
  MD:   "bg-violet-100 text-violet-700 border border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800",
  TXT:  "bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700",
  CSV:  "bg-teal-100 text-teal-700 border border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800",
}

const FORMAT_ICON_COLOR: Record<string, string> = {
  PDF:  "text-red-500",
  DOCX: "text-blue-500",
  XLSX: "text-emerald-500",
  PPTX: "text-orange-500",
  MD:   "text-violet-500",
  TXT:  "text-slate-400",
  CSV:  "text-teal-500",
}

const FORMAT_ICON_BG: Record<string, string> = {
  PDF:  "bg-red-100 dark:bg-red-950/50",
  DOCX: "bg-blue-100 dark:bg-blue-950/50",
  XLSX: "bg-emerald-100 dark:bg-emerald-950/50",
  PPTX: "bg-orange-100 dark:bg-orange-950/50",
  MD:   "bg-violet-100 dark:bg-violet-950/50",
  TXT:  "bg-slate-100 dark:bg-slate-800/50",
  CSV:  "bg-teal-100 dark:bg-teal-950/50",
}

const FORMAT_DOT: Record<string, string> = {
  PDF:  "bg-red-500",
  DOCX: "bg-blue-500",
  XLSX: "bg-emerald-500",
  PPTX: "bg-orange-500",
  MD:   "bg-violet-500",
  TXT:  "bg-slate-400",
  CSV:  "bg-teal-500",
}

const ACCEPTED = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv"

// ── Main Component ─────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const t = useTranslations("documents")
  const [documents, setDocuments]     = useState<Document[]>([])
  const [loading, setLoading]         = useState(true)
  const [deletingId, setDeletingId]   = useState<number | null>(null)
  const [uploading, setUploading]     = useState(false)
  const [dragOver, setDragOver]       = useState(false)
  const [uploadError, setUploadError] = useState("")
  const [docFormat, setDocFormat]     = useState("PDF")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchDocuments = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/documents")
      if (!res.ok) throw new Error()
      const data = await res.json()
      setDocuments(Array.isArray(data) ? data : [])
    } catch {
      setDocuments([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchDocuments() }, [fetchDocuments])

  async function handleUpload(file: File) {
    setUploadError("")
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/documents", { method: "POST", body: formData })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setUploadError(err.error ?? t("uploadFailed"))
        return
      }
      await fetchDocuments()
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id)
    try {
      await fetch(`/api/documents/${id}`, { method: "DELETE" })
      setDocuments((prev) => prev.filter((d) => d.id !== id))
    } finally {
      setDeletingId(null)
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleUpload(file)
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <FileText className="size-6 text-primary" />
            {t("title")}
          </h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        {documents.length > 0 && (
          <span className="text-xs text-muted-foreground bg-muted rounded-full px-3 py-1 font-medium">
            {documents.length}
          </span>
        )}
      </div>

      <Tabs defaultValue="documents" className="space-y-6">
        <TabsList>
          <TabsTrigger value="documents" className="gap-1.5">
            <Files className="size-3.5" />
            {t("tabMyDocs")}
          </TabsTrigger>
          <TabsTrigger value="create" className="gap-1.5">
            <PenLine className="size-3.5" />
            {t("tabCreate")}
          </TabsTrigger>
          <TabsTrigger value="upload" className="gap-1.5">
            <Upload className="size-3.5" />
            {t("tabUpload")}
          </TabsTrigger>
        </TabsList>

        {/* ── My Documents ─────────────────────────────────────────────────── */}
        <TabsContent value="documents">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {/* Section header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
              <div className="flex items-center gap-2">
                <div className="rounded-lg p-1.5 bg-primary/10">
                  <Files className="size-4 text-primary" />
                </div>
                <p className="font-semibold text-sm">{t("myDocsTitle")}</p>
              </div>
              {documents.length > 0 && (
                <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                  {documents.length}
                </span>
              )}
            </div>

            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                <div className="rounded-full p-4 bg-muted/50">
                  <FileText className="size-8 opacity-40" />
                </div>
                <p className="text-sm">{t("noDocuments")}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-5">{t("colFilename")}</TableHead>
                    <TableHead className="w-20">{t("colFormat")}</TableHead>
                    <TableHead className="w-24">{t("colSize")}</TableHead>
                    <TableHead className="w-28">{t("colDate")}</TableHead>
                    <TableHead className="w-24 text-right pr-5">{t("colActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => (
                    <TableRow key={doc.id} className="group">
                      <TableCell className="pl-5">
                        <div className="flex items-center gap-2.5">
                          <div className={cn(
                            "rounded-lg p-1.5 shrink-0",
                            FORMAT_ICON_BG[doc.format] ?? "bg-muted"
                          )}>
                            <FileText className={cn(
                              "size-3.5",
                              FORMAT_ICON_COLOR[doc.format] ?? "text-muted-foreground"
                            )} />
                          </div>
                          <span className="font-medium text-sm truncate max-w-xs">{doc.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          "text-xs font-medium px-2 py-0.5 rounded-full",
                          FORMAT_BADGE[doc.format] ?? FORMAT_BADGE.TXT
                        )}>
                          {doc.format}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{doc.size_label}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{doc.created_at}</TableCell>
                      <TableCell className="text-right pr-5">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 opacity-50 group-hover:opacity-100 transition-opacity"
                            asChild
                          >
                            <a href={doc.url} download={doc.name}>
                              <Download className="size-4" />
                              <span className="sr-only">{t("download")}</span>
                            </a>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 opacity-50 group-hover:opacity-100 hover:text-destructive transition-opacity"
                            onClick={() => handleDelete(doc.id)}
                            disabled={deletingId === doc.id}
                          >
                            {deletingId === doc.id
                              ? <Loader2 className="size-4 animate-spin" />
                              : <Trash2 className="size-4" />
                            }
                            <span className="sr-only">{t("delete")}</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* ── Create Document ───────────────────────────────────────────── */}
        <TabsContent value="create">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {/* Section header */}
            <div className="flex items-center gap-2 px-5 py-4 border-b border-border/60">
              <div className="rounded-lg p-1.5 bg-violet-100 dark:bg-violet-950/50">
                <PenLine className="size-4 text-violet-600 dark:text-violet-400" />
              </div>
              <p className="font-semibold text-sm">{t("createTitle")}</p>
              <span className="ml-auto text-xs px-2 py-0.5 rounded-full border font-medium bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800">
                {t("comingSoon")}
              </span>
            </div>

            <div className="p-5 space-y-6">
              {/* Format selector */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">{t("formatLabel")}</Label>
                <div className="flex flex-wrap gap-2">
                  {FORMATS.map((format) => (
                    <button
                      key={format}
                      type="button"
                      onClick={() => setDocFormat(format)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors select-none",
                        docFormat === format
                          ? "border-primary bg-primary/5 text-foreground"
                          : "border-border text-muted-foreground hover:border-primary/50 hover:bg-muted/30"
                      )}
                    >
                      <span className={cn("size-2 rounded-full shrink-0", FORMAT_DOT[format] ?? "bg-muted-foreground")} />
                      {format}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="docTitle" className="text-sm font-medium">{t("docTitleLabel")}</Label>
                <Input id="docTitle" placeholder={t("docTitlePlaceholder")} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="docContent" className="text-sm font-medium">{t("contentLabel")}</Label>
                <Textarea
                  id="docContent"
                  placeholder={t("contentPlaceholder")}
                  className="min-h-[120px]"
                />
              </div>

              <Button className="w-full" disabled>{t("generate")}</Button>
            </div>
          </div>
        </TabsContent>

        {/* ── Upload Document ───────────────────────────────────────────── */}
        <TabsContent value="upload">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {/* Section header */}
            <div className="flex items-center gap-2 px-5 py-4 border-b border-border/60">
              <div className="rounded-lg p-1.5 bg-sky-100 dark:bg-sky-950/50">
                <CloudUpload className="size-4 text-sky-600 dark:text-sky-400" />
              </div>
              <p className="font-semibold text-sm">{t("uploadTitle")}</p>
            </div>

            <div className="p-5 space-y-4">
              {/* Drop zone */}
              <div
                className={cn(
                  "border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer",
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-sky-400/60 hover:bg-sky-50/30 dark:hover:bg-sky-950/10",
                  uploading && "pointer-events-none opacity-60"
                )}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <>
                    <div className="mx-auto size-14 rounded-full bg-sky-100 dark:bg-sky-950/50 flex items-center justify-center mb-4">
                      <Loader2 className="size-7 text-sky-500 animate-spin" />
                    </div>
                    <p className="text-sm text-muted-foreground">{t("uploading")}</p>
                  </>
                ) : (
                  <>
                    <div className={cn(
                      "mx-auto size-14 rounded-full flex items-center justify-center mb-4 transition-colors",
                      dragOver ? "bg-primary/10" : "bg-sky-100 dark:bg-sky-950/50"
                    )}>
                      <CloudUpload className={cn(
                        "size-7 transition-colors",
                        dragOver ? "text-primary" : "text-sky-500"
                      )} />
                    </div>
                    <h3 className="text-base font-medium mb-1">{t("uploadPrompt")}</h3>
                    <p className="text-sm text-muted-foreground">{t("uploadFormats")}</p>
                  </>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleUpload(file)
                }}
              />

              {uploadError && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  <AlertTriangle className="size-4 shrink-0" />
                  {uploadError}
                </div>
              )}

              <p className="text-xs text-muted-foreground text-center">{t("uploadHint")}</p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
