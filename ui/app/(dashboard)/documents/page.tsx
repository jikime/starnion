"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useTranslations } from "next-intl"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Download, Eye, Upload, FileText, Trash2, Loader2, CloudUpload } from "lucide-react"
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

// ── Helpers ───────────────────────────────────────────────────────────────────

const FORMATS = ["PDF", "DOCX", "XLSX", "PPTX", "MD", "TXT"]

const FORMAT_COLORS: Record<string, string> = {
  PDF:  "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  DOCX: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  XLSX: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  PPTX: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  MD:   "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  TXT:  "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  CSV:  "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300",
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
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <FileText className="size-6 text-primary" />
          {t("title")}
        </h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Tabs defaultValue="documents" className="space-y-6">
        <TabsList>
          <TabsTrigger value="documents">{t("tabMyDocs")}</TabsTrigger>
          <TabsTrigger value="create">{t("tabCreate")}</TabsTrigger>
          <TabsTrigger value="upload">{t("tabUpload")}</TabsTrigger>
        </TabsList>

        {/* ── My Documents ─────────────────────────────────────────────────── */}
        <TabsContent value="documents">
          <Card>
            <CardHeader>
              <CardTitle>{t("myDocsTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              ) : documents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                  <FileText className="size-10" />
                  <p className="text-sm">{t("noDocuments")}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("colFilename")}</TableHead>
                      <TableHead className="w-20">{t("colFormat")}</TableHead>
                      <TableHead className="w-24">{t("colSize")}</TableHead>
                      <TableHead className="w-28">{t("colDate")}</TableHead>
                      <TableHead className="w-24 text-right">{t("colActions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileText className="size-4 shrink-0 text-primary" />
                            <span className="font-medium truncate max-w-xs">{doc.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={cn(
                            "text-xs font-medium px-2 py-0.5 rounded-full",
                            FORMAT_COLORS[doc.format] ?? FORMAT_COLORS.TXT
                          )}>
                            {doc.format}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{doc.size_label}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{doc.created_at}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="size-8" asChild>
                              <a href={doc.url} target="_blank" rel="noopener noreferrer">
                                <Eye className="size-4" />
                                <span className="sr-only">{t("view")}</span>
                              </a>
                            </Button>
                            <Button variant="ghost" size="icon" className="size-8" asChild>
                              <a href={doc.url} download={doc.name}>
                                <Download className="size-4" />
                                <span className="sr-only">{t("download")}</span>
                              </a>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-destructive hover:text-destructive"
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
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Create Document ───────────────────────────────────────────── */}
        <TabsContent value="create">
          <Card>
            <CardHeader>
              <CardTitle>{t("createTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>{t("formatLabel")}</Label>
                <RadioGroup defaultValue="PDF" className="flex flex-wrap gap-4">
                  {FORMATS.map((format) => (
                    <div key={format} className="flex items-center gap-2">
                      <RadioGroupItem value={format} id={format} />
                      <Label htmlFor={format}>{format}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="docTitle">{t("docTitleLabel")}</Label>
                <Input id="docTitle" placeholder={t("docTitlePlaceholder")} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="docContent">{t("contentLabel")}</Label>
                <Textarea
                  id="docContent"
                  placeholder={t("contentPlaceholder")}
                  className="min-h-[120px]"
                />
              </div>

              <div className="flex items-center gap-3">
                <Button className="flex-1" disabled>{t("generate")}</Button>
                <Badge variant="secondary" className="shrink-0">{t("comingSoon")}</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Upload Document ───────────────────────────────────────────── */}
        <TabsContent value="upload">
          <Card>
            <CardHeader>
              <CardTitle>{t("uploadTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer",
                  dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
                  uploading && "pointer-events-none opacity-60"
                )}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <>
                    <Loader2 className="mx-auto size-12 text-primary mb-4 animate-spin" />
                    <p className="text-sm text-muted-foreground">{t("uploading")}</p>
                  </>
                ) : (
                  <>
                    <CloudUpload className="mx-auto size-12 text-muted-foreground mb-4" />
                    <h3 className="text-base font-medium mb-1">
                      {t("uploadPrompt")}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {t("uploadFormats")}
                    </p>
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
                <p className="text-sm text-destructive">{uploadError}</p>
              )}

              <p className="text-xs text-muted-foreground text-center">
                {t("uploadHint")}
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
