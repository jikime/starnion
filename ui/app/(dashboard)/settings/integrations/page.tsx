"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CheckCircle2, XCircle, Loader2, ExternalLink, Unlink } from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

interface IntegrationStatus {
  connected: boolean
  scopes?: string
}

interface AllStatus {
  google?: IntegrationStatus
  notion?: IntegrationStatus
  github?: IntegrationStatus
}

// ── Integration definitions ───────────────────────────────────────────────────

const INTEGRATIONS = [
  {
    id: "google" as const,
    name: "Google Workspace",
    logo: "🔵",
    color: "bg-blue-50 dark:bg-blue-950",
    border: "border-blue-200 dark:border-blue-800",
    description: "캘린더, Gmail, Drive, Docs, Tasks를 Jiki에서 직접 제어합니다.",
    capabilities: ["Google Calendar 조회/생성", "Gmail 읽기/발송", "Google Drive 파일 업로드", "Google Docs 생성/편집", "Google Tasks 관리"],
    authType: "oauth" as const,
  },
  {
    id: "notion" as const,
    name: "Notion",
    logo: "◼",
    color: "bg-gray-50 dark:bg-gray-900",
    border: "border-gray-200 dark:border-gray-700",
    description: "Notion 워크스페이스의 페이지, 데이터베이스를 조회하고 생성합니다.",
    capabilities: ["페이지 읽기/생성", "데이터베이스 조회", "블록 추가/수정"],
    authType: "apikey" as const,
    keyLabel: "Internal Integration Token",
    keyPlaceholder: "secret_xxxxxxxxxxxxxxxxxxxxxxxx",
    keyHint: "Notion 설정 → 연동 → 새 API 통합에서 생성할 수 있습니다.",
  },
  {
    id: "github" as const,
    name: "GitHub",
    logo: "🐙",
    color: "bg-slate-50 dark:bg-slate-900",
    border: "border-slate-200 dark:border-slate-700",
    description: "레포지토리, 이슈, PR을 Jiki에서 조회하고 관리합니다.",
    capabilities: ["레포지토리 조회", "이슈 읽기/생성", "PR 조회", "코드 검색"],
    authType: "apikey" as const,
    keyLabel: "Personal Access Token (PAT)",
    keyPlaceholder: "ghp_xxxxxxxxxxxxxxxxxxxx",
    keyHint: "GitHub 설정 → Developer settings → Personal access tokens에서 생성할 수 있습니다.",
  },
]

// ── Component ─────────────────────────────────────────────────────────────────

function IntegrationsPageInner() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<AllStatus>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  // API key dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogProvider, setDialogProvider] = useState<"notion" | "github" | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState("")
  const [apiKeyError, setApiKeyError] = useState("")

  // Toast-like notification
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3500)
  }

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/integrations/status")
      if (res.ok) setStatus(await res.json())
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus()
    // Handle redirect-back from Google OAuth
    const connected = searchParams.get("connected")
    const error = searchParams.get("error")
    if (connected === "google") showToast("Google 계정 연동이 완료됐어요!")
    if (error === "google") showToast("Google 연동이 취소됐어요.", "error")
    // Clean URL
    if (connected || error) window.history.replaceState({}, "", "/settings/integrations")
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Actions ──────────────────────────────────────────────────────────────

  const connectGoogle = async () => {
    setBusy("google")
    try {
      const res = await fetch("/api/integrations/google/auth-url")
      if (!res.ok) { showToast("Google OAuth 설정이 되어있지 않아요.", "error"); return }
      const { url } = await res.json()
      window.location.href = url
    } finally {
      setBusy(null)
    }
  }

  const disconnectGoogle = async () => {
    setBusy("google")
    try {
      const res = await fetch("/api/integrations/google", { method: "DELETE" })
      if (res.ok) { setStatus((s) => ({ ...s, google: { connected: false } })); showToast("Google 연동이 해제됐어요.") }
      else showToast("해제에 실패했어요.", "error")
    } finally {
      setBusy(null)
    }
  }

  const openApiKeyDialog = (provider: "notion" | "github") => {
    setDialogProvider(provider)
    setApiKeyInput("")
    setApiKeyError("")
    setDialogOpen(true)
  }

  const submitApiKey = async () => {
    if (!dialogProvider) return
    if (!apiKeyInput.trim()) { setApiKeyError("API 키를 입력해주세요."); return }
    setBusy(dialogProvider)
    setDialogOpen(false)
    try {
      const res = await fetch(`/api/integrations/${dialogProvider}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKeyInput.trim() }),
      })
      if (res.ok) {
        setStatus((s) => ({ ...s, [dialogProvider]: { connected: true } }))
        showToast(`${dialogProvider === "notion" ? "Notion" : "GitHub"} 연동이 완료됐어요!`)
      } else {
        showToast("저장에 실패했어요.", "error")
      }
    } finally {
      setBusy(null)
    }
  }

  const disconnect = async (provider: "notion" | "github") => {
    setBusy(provider)
    try {
      const res = await fetch(`/api/integrations/${provider}`, { method: "DELETE" })
      if (res.ok) {
        setStatus((s) => ({ ...s, [provider]: { connected: false } }))
        showToast(`${provider === "notion" ? "Notion" : "GitHub"} 연동이 해제됐어요.`)
      } else {
        showToast("해제에 실패했어요.", "error")
      }
    } finally {
      setBusy(null)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const dialogIntegration = INTEGRATIONS.find((i) => i.id === dialogProvider)

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">연동</h1>
        <p className="text-muted-foreground mt-1">
          외부 서비스를 연결하면 Jiki가 대신 작업을 수행할 수 있어요.
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium ${
          toast.type === "success"
            ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
            : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
        }`}>
          {toast.type === "success"
            ? <CheckCircle2 className="size-4 shrink-0" />
            : <XCircle className="size-4 shrink-0" />}
          {toast.message}
        </div>
      )}

      {/* Integration cards */}
      <div className="space-y-4">
        {INTEGRATIONS.map((integration) => {
          const st = status[integration.id]
          const isConnected = st?.connected ?? false
          const isBusy = busy === integration.id

          return (
            <Card key={integration.id} className={`border ${integration.border} ${integration.color}`}>
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  {/* Logo */}
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white dark:bg-white/10 text-2xl shadow-sm border border-black/5">
                    {integration.logo}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{integration.name}</h3>
                      {loading ? (
                        <Loader2 className="size-3 animate-spin text-muted-foreground" />
                      ) : isConnected ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-0 text-xs gap-1">
                          <CheckCircle2 className="size-3" /> 연결됨
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">미연결</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{integration.description}</p>
                    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5">
                      {integration.capabilities.map((cap) => (
                        <li key={cap} className="text-xs text-muted-foreground flex items-center gap-1">
                          <span className="size-1 rounded-full bg-muted-foreground/50 shrink-0 inline-block" />
                          {cap}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 flex-col gap-2 items-end">
                    {isConnected ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={isBusy}
                        onClick={() =>
                          integration.id === "google"
                            ? disconnectGoogle()
                            : disconnect(integration.id as "notion" | "github")
                        }
                      >
                        {isBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Unlink className="size-3.5" />}
                        해제
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="gap-1.5"
                        disabled={isBusy || loading}
                        onClick={() =>
                          integration.id === "google"
                            ? connectGoogle()
                            : openApiKeyDialog(integration.id as "notion" | "github")
                        }
                      >
                        {isBusy ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : integration.authType === "oauth" ? (
                          <ExternalLink className="size-3.5" />
                        ) : null}
                        연결하기
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* API Key Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogIntegration?.name} 연동</DialogTitle>
            <DialogDescription>
              {dialogIntegration?.keyHint}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="apikey">{dialogIntegration?.keyLabel}</Label>
              <Input
                id="apikey"
                type="password"
                placeholder={dialogIntegration?.keyPlaceholder}
                value={apiKeyInput}
                onChange={(e) => { setApiKeyInput(e.target.value); setApiKeyError("") }}
                onKeyDown={(e) => { if (e.key === "Enter") submitApiKey() }}
              />
              {apiKeyError && <p className="text-xs text-destructive">{apiKeyError}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={submitApiKey}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function IntegrationsPage() {
  return (
    <Suspense>
      <IntegrationsPageInner />
    </Suspense>
  )
}
