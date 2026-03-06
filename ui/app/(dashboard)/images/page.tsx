"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Wand2,
  Edit,
  Scan,
  Images,
  Upload,
  Download,
  Trash2,
  Loader2,
  X,
  RefreshCw,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────────────────────

interface ImageItem {
  id: number
  url: string
  name: string
  mime: string
  size: number
  source: string
  type: string
  prompt: string
  size_label: string
  created_at: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ASPECT_RATIOS = ["1:1", "3:4", "4:3", "9:16", "16:9"]

const SOURCE_LABELS: Record<string, string> = {
  web: "웹",
  telegram: "텔레그램",
  webchat: "웹챗",
}

const TYPE_LABELS: Record<string, string> = {
  generated: "생성",
  edited: "편집",
  analyzed: "분석",
}

const TYPE_COLORS: Record<string, string> = {
  generated: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  edited:    "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  analyzed:  "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
}

// ── SSE helper ────────────────────────────────────────────────────────────────

interface StreamResult {
  imageUrl?: string
  text?: string
}

async function callImageStream(
  formData: FormData,
  onText: (chunk: string) => void,
): Promise<StreamResult> {
  const res = await fetch("/api/images/action", {
    method: "POST",
    body: formData,
  })

  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? "요청에 실패했습니다.")
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ""
  let imageUrl: string | undefined
  let text = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })

    const lines = buf.split("\n")
    buf = lines.pop() ?? ""

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue
      const raw = line.slice(6).trim()
      if (raw === "[DONE]") break
      try {
        const event = JSON.parse(raw)
        if (event.type === "text-delta" && typeof event.delta === "string") {
          text += event.delta
          onText(event.delta)
        }
        if (event.type === "file" && typeof event.url === "string") {
          imageUrl = event.url as string
        }
        if (event.type === "error") {
          throw new Error(event.errorText ?? "오류가 발생했습니다.")
        }
      } catch {
        // skip non-JSON lines
      }
    }
  }

  return { imageUrl, text }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ImageDropZone({
  preview,
  onFile,
  onClear,
  disabled,
}: {
  preview: string | null
  onFile: (f: File) => void
  onClear: () => void
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)

  const handleFile = (f: File) => {
    if (!f.type.startsWith("image/")) return
    onFile(f)
  }

  return (
    <div
      className={cn(
        "relative border-2 border-dashed rounded-lg transition-colors",
        drag ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
        disabled && "pointer-events-none opacity-60",
        preview ? "p-2" : "p-8 text-center cursor-pointer",
      )}
      onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault(); setDrag(false)
        const f = e.dataTransfer.files[0]
        if (f) handleFile(f)
      }}
      onClick={() => !preview && inputRef.current?.click()}
    >
      {preview ? (
        <>
          <img src={preview} alt="preview" className="max-h-64 mx-auto rounded object-contain" />
          <button
            onClick={(e) => { e.stopPropagation(); onClear() }}
            className="absolute top-1 right-1 bg-background border rounded-full p-0.5 hover:bg-muted"
          >
            <X className="size-3" />
          </button>
        </>
      ) : (
        <>
          <Upload className="mx-auto size-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium mb-1">이미지 업로드</p>
          <p className="text-xs text-muted-foreground">드래그앤드롭 또는 클릭 (JPG, PNG, WEBP)</p>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />
    </div>
  )
}

function ResultImage({ url }: { url: string }) {
  return (
    <div className="mt-4 space-y-2">
      <p className="text-sm font-medium text-muted-foreground">생성된 이미지</p>
      <div className="rounded-lg overflow-hidden border border-border">
        <img src={url} alt="result" className="w-full object-contain max-h-96" />
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" asChild>
          <a href={url} download>
            <Download className="size-4 mr-1" />
            다운로드
          </a>
        </Button>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ImagesPage() {
  // ── Generate tab state ──────────────────────────────────────────────────────
  const [genPrompt, setGenPrompt]       = useState("")
  const [genRatio, setGenRatio]         = useState("1:1")
  const [genLoading, setGenLoading]     = useState(false)
  const [genResult, setGenResult]       = useState<string | null>(null)
  const [genText, setGenText]           = useState("")
  const [genError, setGenError]         = useState("")

  // ── Edit tab state ──────────────────────────────────────────────────────────
  const [editFile, setEditFile]         = useState<File | null>(null)
  const [editPreview, setEditPreview]   = useState<string | null>(null)
  const [editPrompt, setEditPrompt]     = useState("")
  const [editLoading, setEditLoading]   = useState(false)
  const [editResult, setEditResult]     = useState<string | null>(null)
  const [editText, setEditText]         = useState("")
  const [editError, setEditError]       = useState("")

  // ── Analyze tab state ───────────────────────────────────────────────────────
  const [anaFile, setAnaFile]           = useState<File | null>(null)
  const [anaPreview, setAnaPreview]     = useState<string | null>(null)
  const [anaQuery, setAnaQuery]         = useState("")
  const [anaLoading, setAnaLoading]     = useState(false)
  const [anaResult, setAnaResult]       = useState("")
  const [anaError, setAnaError]         = useState("")

  // ── Gallery tab state ───────────────────────────────────────────────────────
  const [gallery, setGallery]           = useState<ImageItem[]>([])
  const [galleryLoading, setGalleryLoading] = useState(true)
  const [galleryFilter, setGalleryFilter]   = useState("all")
  const [deletingId, setDeletingId]         = useState<number | null>(null)

  // ── Load gallery ────────────────────────────────────────────────────────────

  const fetchGallery = useCallback(async () => {
    setGalleryLoading(true)
    try {
      const qs = galleryFilter !== "all" ? `?type=${galleryFilter}` : ""
      const res = await fetch(`/api/images${qs}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setGallery(Array.isArray(data) ? data : [])
    } catch {
      setGallery([])
    } finally {
      setGalleryLoading(false)
    }
  }, [galleryFilter])

  useEffect(() => { fetchGallery() }, [fetchGallery])

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (!genPrompt.trim()) return
    setGenLoading(true)
    setGenError("")
    setGenResult(null)
    setGenText("")

    const fd = new FormData()
    fd.append("action", "generate")
    fd.append("message", `이미지를 생성해줘: ${genPrompt.trim()} (비율: ${genRatio})`)

    try {
      const { imageUrl, text } = await callImageStream(fd, (chunk) => {
        setGenText((prev) => prev + chunk)
      })
      if (imageUrl) {
        setGenResult(imageUrl)
      } else {
        setGenText(text || "이미지를 생성하지 못했습니다.")
      }
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "오류가 발생했습니다.")
    } finally {
      setGenLoading(false)
    }
  }

  function handleEditFileSelect(f: File) {
    setEditFile(f)
    const url = URL.createObjectURL(f)
    setEditPreview(url)
    setEditResult(null)
    setEditText("")
    setEditError("")
  }

  function clearEditFile() {
    setEditFile(null)
    if (editPreview) URL.revokeObjectURL(editPreview)
    setEditPreview(null)
  }

  async function handleEdit() {
    if (!editFile || !editPrompt.trim()) return
    setEditLoading(true)
    setEditError("")
    setEditResult(null)
    setEditText("")

    const fd = new FormData()
    fd.append("action", "edit")
    fd.append("message", `이미지를 편집해줘: ${editPrompt.trim()}`)
    fd.append("file", editFile)

    try {
      const { imageUrl, text } = await callImageStream(fd, (chunk) => {
        setEditText((prev) => prev + chunk)
      })
      if (imageUrl) {
        setEditResult(imageUrl)
      } else {
        setEditText(text || "이미지를 편집하지 못했습니다.")
      }
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "오류가 발생했습니다.")
    } finally {
      setEditLoading(false)
    }
  }

  function handleAnaFileSelect(f: File) {
    setAnaFile(f)
    const url = URL.createObjectURL(f)
    setAnaPreview(url)
    setAnaResult("")
    setAnaError("")
  }

  function clearAnaFile() {
    setAnaFile(null)
    if (anaPreview) URL.revokeObjectURL(anaPreview)
    setAnaPreview(null)
  }

  async function handleAnalyze() {
    if (!anaFile) return
    setAnaLoading(true)
    setAnaError("")
    setAnaResult("")

    const fd = new FormData()
    fd.append("action", "analyze")
    fd.append("message", anaQuery.trim())
    fd.append("file", anaFile)

    try {
      const { text } = await callImageStream(fd, (chunk) => {
        setAnaResult((prev) => prev + chunk)
      })
      if (!text) setAnaResult("분석 결과가 없습니다.")
    } catch (e) {
      setAnaError(e instanceof Error ? e.message : "오류가 발생했습니다.")
    } finally {
      setAnaLoading(false)
    }
  }

  async function handleDeleteGallery(id: number) {
    setDeletingId(id)
    try {
      await fetch(`/api/images/${id}`, { method: "DELETE" })
      setGallery((prev) => prev.filter((img) => img.id !== id))
    } finally {
      setDeletingId(null)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">이미지</h1>
        <p className="text-muted-foreground">AI 이미지 생성, 편집 및 분석</p>
      </div>

      <Tabs defaultValue="generate" className="space-y-6">
        <TabsList>
          <TabsTrigger value="generate" className="gap-2">
            <Wand2 className="size-4" />
            이미지 생성
          </TabsTrigger>
          <TabsTrigger value="edit" className="gap-2">
            <Edit className="size-4" />
            이미지 편집
          </TabsTrigger>
          <TabsTrigger value="analyze" className="gap-2">
            <Scan className="size-4" />
            이미지 분석
          </TabsTrigger>
          <TabsTrigger value="gallery" className="gap-2">
            <Images className="size-4" />
            갤러리
          </TabsTrigger>
        </TabsList>

        {/* ── 이미지 생성 ──────────────────────────────────────────────────── */}
        <TabsContent value="generate">
          <Card>
            <CardHeader>
              <CardTitle>이미지 생성</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="gen-prompt">프롬프트</Label>
                <Textarea
                  id="gen-prompt"
                  value={genPrompt}
                  onChange={(e) => setGenPrompt(e.target.value)}
                  placeholder="귀여운 고양이가 창가에 앉아있는 수채화 스타일 그림"
                  className="min-h-[100px]"
                  disabled={genLoading}
                />
              </div>

              <div className="space-y-2">
                <Label>비율</Label>
                <RadioGroup
                  value={genRatio}
                  onValueChange={setGenRatio}
                  className="flex flex-wrap gap-4"
                  disabled={genLoading}
                >
                  {ASPECT_RATIOS.map((ratio) => (
                    <div key={ratio} className="flex items-center gap-2">
                      <RadioGroupItem value={ratio} id={`ratio-${ratio}`} />
                      <Label htmlFor={`ratio-${ratio}`}>{ratio}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>모델:</span>
                <span className="font-mono">gemini-3.1-flash-image-preview</span>
              </div>

              <Button
                className="w-full gap-2"
                onClick={handleGenerate}
                disabled={genLoading || !genPrompt.trim()}
              >
                {genLoading
                  ? <><Loader2 className="size-4 animate-spin" />생성 중...</>
                  : <><Wand2 className="size-4" />생성하기</>
                }
              </Button>

              {genError && <p className="text-sm text-destructive">{genError}</p>}

              {genLoading && genText && (
                <div className="rounded-lg bg-muted p-4 text-sm whitespace-pre-wrap">{genText}</div>
              )}

              {!genLoading && genResult && <ResultImage url={genResult} />}
              {!genLoading && !genResult && genText && (
                <div className="rounded-lg bg-muted p-4 text-sm whitespace-pre-wrap">{genText}</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 이미지 편집 ──────────────────────────────────────────────────── */}
        <TabsContent value="edit">
          <Card>
            <CardHeader>
              <CardTitle>이미지 편집</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <ImageDropZone
                preview={editPreview}
                onFile={handleEditFileSelect}
                onClear={clearEditFile}
                disabled={editLoading}
              />

              <div className="space-y-2">
                <Label htmlFor="edit-prompt">편집 요청</Label>
                <Textarea
                  id="edit-prompt"
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  placeholder="배경을 파란 하늘로 바꿔줘"
                  className="min-h-[80px]"
                  disabled={editLoading}
                />
                <p className="text-xs text-muted-foreground">
                  예시: 배경 변경 / 스타일 변환 / 객체 추가 또는 제거
                </p>
              </div>

              <Button
                className="w-full gap-2"
                onClick={handleEdit}
                disabled={editLoading || !editFile || !editPrompt.trim()}
              >
                {editLoading
                  ? <><Loader2 className="size-4 animate-spin" />편집 중...</>
                  : <><Edit className="size-4" />편집하기</>
                }
              </Button>

              {editError && <p className="text-sm text-destructive">{editError}</p>}

              {editLoading && editText && (
                <div className="rounded-lg bg-muted p-4 text-sm whitespace-pre-wrap">{editText}</div>
              )}

              {!editLoading && editResult && <ResultImage url={editResult} />}
              {!editLoading && !editResult && editText && (
                <div className="rounded-lg bg-muted p-4 text-sm whitespace-pre-wrap">{editText}</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 이미지 분석 ──────────────────────────────────────────────────── */}
        <TabsContent value="analyze">
          <Card>
            <CardHeader>
              <CardTitle>이미지 분석</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-5 lg:grid-cols-2">
                {/* Left: upload */}
                <div className="space-y-4">
                  <ImageDropZone
                    preview={anaPreview}
                    onFile={handleAnaFileSelect}
                    onClear={clearAnaFile}
                    disabled={anaLoading}
                  />

                  <div className="space-y-2">
                    <Label htmlFor="ana-query">질문 (선택)</Label>
                    <Textarea
                      id="ana-query"
                      value={anaQuery}
                      onChange={(e) => setAnaQuery(e.target.value)}
                      placeholder="영수증의 총 금액은 얼마야?"
                      className="min-h-[80px]"
                      disabled={anaLoading}
                    />
                    <p className="text-xs text-muted-foreground">
                      비워두면 전체 내용을 분석합니다.
                    </p>
                  </div>

                  <Button
                    className="w-full gap-2"
                    onClick={handleAnalyze}
                    disabled={anaLoading || !anaFile}
                  >
                    {anaLoading
                      ? <><Loader2 className="size-4 animate-spin" />분석 중...</>
                      : <><Scan className="size-4" />분석하기</>
                    }
                  </Button>

                  {anaError && <p className="text-sm text-destructive">{anaError}</p>}
                </div>

                {/* Right: result */}
                <div className="rounded-lg border border-border p-5">
                  <h4 className="font-medium mb-3 text-sm">AI 분석 결과</h4>
                  {anaLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      <span>분석 중...</span>
                    </div>
                  ) : anaResult ? (
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{anaResult}</p>
                  ) : (
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <p>이미지를 업로드하면 AI가 분석 결과를 표시합니다.</p>
                      <ul className="list-disc pl-4 space-y-1">
                        <li>영수증: 품목, 금액 자동 추출</li>
                        <li>사진: 내용 설명, 텍스트 인식</li>
                        <li>스크린샷: 정보 요약</li>
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 갤러리 ──────────────────────────────────────────────────────── */}
        <TabsContent value="gallery">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>갤러리</CardTitle>
                <div className="flex items-center gap-2">
                  <Select value={galleryFilter} onValueChange={setGalleryFilter}>
                    <SelectTrigger className="w-28 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체</SelectItem>
                      <SelectItem value="generated">생성</SelectItem>
                      <SelectItem value="edited">편집</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={fetchGallery}
                    disabled={galleryLoading}
                  >
                    <RefreshCw className={cn("size-4", galleryLoading && "animate-spin")} />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {galleryLoading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              ) : gallery.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                  <Images className="size-10" />
                  <p className="text-sm">이미지가 없습니다.</p>
                  <p className="text-xs">생성, 편집 또는 텔레그램/웹챗에서 이미지를 만들어보세요.</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {gallery.map((img) => (
                    <div key={img.id} className="group relative">
                      <div className="aspect-square rounded-lg overflow-hidden bg-muted">
                        <img
                          src={img.url}
                          alt={img.prompt || img.name}
                          className="size-full object-cover"
                        />
                      </div>

                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex flex-col items-center justify-center gap-2 p-3">
                        {img.prompt && (
                          <p className="text-xs text-center line-clamp-3 text-foreground">
                            {img.prompt}
                          </p>
                        )}
                        <div className="flex gap-1.5">
                          <Button variant="secondary" size="sm" asChild>
                            <a href={img.url} download={img.name}>
                              <Download className="size-3.5" />
                            </a>
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleDeleteGallery(img.id)}
                            disabled={deletingId === img.id}
                          >
                            {deletingId === img.id
                              ? <Loader2 className="size-3.5 animate-spin" />
                              : <Trash2 className="size-3.5 text-destructive" />
                            }
                          </Button>
                        </div>
                      </div>

                      {/* Meta */}
                      <div className="mt-1.5 flex items-center justify-between px-0.5">
                        <span className={cn(
                          "text-xs font-medium px-1.5 py-0.5 rounded-full",
                          TYPE_COLORS[img.type] ?? TYPE_COLORS.generated
                        )}>
                          {TYPE_LABELS[img.type] ?? img.type}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {SOURCE_LABELS[img.source] ?? img.source} · {img.created_at.slice(0, 10)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
