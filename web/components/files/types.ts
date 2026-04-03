export type FileType = "all" | "document" | "image" | "audio"
export type ActionType =
  | "doc-upload" | "doc-generate"
  | "img-generate" | "img-analyze" | "img-edit"
  | "audio-record" | "audio-transcribe"
  | null

export interface FileItem {
  id: number
  name: string
  mime: string
  file_type: "document" | "image" | "audio"
  format: string
  url: string
  object_key: string
  size: number
  size_label: string
  source: string
  sub_type: string
  indexed: boolean
  prompt: string | null
  analysis: string | null
  transcript: string | null
  duration: number
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface SearchResult {
  id: number
  file_id: number
  file_name: string
  file_type: string
  content: string
  similarity: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export const formatBadgeColor = (format: string) => {
  const f = format.toUpperCase()
  if (["PDF"].includes(f)) return "bg-red-100 text-red-700"
  if (["DOCX", "DOC"].includes(f)) return "bg-blue-100 text-blue-700"
  if (["XLSX", "XLS", "CSV"].includes(f)) return "bg-green-100 text-green-700"
  if (["PPTX", "PPT"].includes(f)) return "bg-orange-100 text-orange-700"
  if (["MD", "TXT"].includes(f)) return "bg-gray-100 text-gray-700"
  if (["HWP", "HWPX"].includes(f)) return "bg-teal-100 text-teal-700"
  if (["PNG", "JPG", "JPEG", "WEBP", "GIF"].includes(f)) return "bg-purple-100 text-purple-700"
  if (["MP3", "WAV", "OGG", "M4A", "WEBM"].includes(f)) return "bg-yellow-100 text-yellow-700"
  return "bg-gray-100 text-gray-600"
}

export const subTypeBadgeColor = (subType: string) => {
  switch (subType) {
    case "generated": return "bg-violet-100 text-violet-700"
    case "edited": return "bg-blue-100 text-blue-700"
    case "analyzed": return "bg-emerald-100 text-emerald-700"
    case "recorded": return "bg-rose-100 text-rose-700"
    case "tts": return "bg-indigo-100 text-indigo-700"
    case "uploaded": return "bg-slate-100 text-slate-600"
    default: return "bg-slate-100 text-slate-600"
  }
}

export const fmtDuration = (s: number) => {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, "0")}`
}

export const similarityLabel = (score: number, labels: { high: string; medium: string; low: string }): { label: string; cls: string } => {
  if (score >= 0.8) return { label: labels.high, cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" }
  if (score >= 0.5) return { label: labels.medium, cls: "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" }
  return { label: labels.low, cls: "bg-muted text-muted-foreground" }
}

export const FILE_ACCEPT = {
  document: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.hwp,.hwpx",
  image: ".jpg,.jpeg,.png,.gif,.webp",
  audio: ".mp3,.wav,.ogg,.m4a,.webm,.flac",
}

// ── SSE helper for image actions ──────────────────────────────────────────────

export async function callImageStream(
  formData: FormData,
  onText: (chunk: string) => void,
): Promise<{ imageUrl?: string; text: string }> {
  const res = await fetch("/api/images/action", { method: "POST", body: formData })
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(err.error ?? "request_failed")
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = "", text = "", imageUrl: string | undefined
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split("\n"); buf = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue
      const raw = line.slice(6).trim()
      if (raw === "[DONE]") break
      try {
        const ev = JSON.parse(raw)
        if (ev.type === "text-delta" && typeof ev.delta === "string") { text += ev.delta; onText(ev.delta) }
        if (ev.type === "file" && typeof ev.url === "string") imageUrl = ev.url
        if (ev.type === "error") throw new Error(ev.errorText ?? "agent_error")
      } catch { /* skip */ }
    }
  }
  return { imageUrl, text }
}
