"use client"

import { useEffect, useState, Suspense, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
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
import { CheckCircle2, XCircle, Link2, Loader2, ExternalLink, Unlink, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { siGoogle, siNotion, siGithub, siNaver, siGooglegemini } from "simple-icons"

// ── Integration brand icons ──────────────────────────────────────────────────

function SiIcon({ path, className, label }: { path: string; className?: string; label: string }) {
  return (
    <svg role="img" viewBox="0 0 24 24" className={className} fill="currentColor" aria-label={label}>
      <path d={path} />
    </svg>
  )
}

const INTEGRATION_ICONS: Record<string, { icon: React.ReactNode; color: string }> = {
  google:       { icon: <SiIcon path={siGoogle.path}       label="Google"  className="size-4" />, color: "text-blue-500"   },
  notion:       { icon: <SiIcon path={siNotion.path}       label="Notion"  className="size-4" />, color: "text-gray-600 dark:text-gray-300" },
  github:       { icon: <SiIcon path={siGithub.path}       label="GitHub"  className="size-4" />, color: "text-slate-700 dark:text-slate-300" },
  tavily:       { icon: <Search className="size-4" />,                                             color: "text-purple-500" },
  naver_search: { icon: <SiIcon path={siNaver.path}        label="Naver"   className="size-4" />, color: "text-green-500"  },
  gemini:       { icon: <SiIcon path={siGooglegemini.path} label="Gemini"  className="size-4" />, color: "text-violet-500" },
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface IntegrationStatus {
  connected: boolean
  scopes?: string
}

interface AllStatus {
  google?: IntegrationStatus
  notion?: IntegrationStatus
  github?: IntegrationStatus
  tavily?: IntegrationStatus
  naver_search?: IntegrationStatus
  gemini?: IntegrationStatus
}

// ── Component ─────────────────────────────────────────────────────────────────

function IntegrationsPageInner() {
  const t = useTranslations("integrations")

  const INTEGRATIONS = useMemo(() => [
    {
      id: "google" as const,
      name: "Google Workspace",
      logo: "🔵",
      color: "bg-blue-50 dark:bg-blue-950",
      border: "border-blue-200 dark:border-blue-800",
      description: t("google.description"),
      capabilities: [t("google.cap1"), t("google.cap2"), t("google.cap3"), t("google.cap4"), t("google.cap5")],
      authType: "oauth" as const,
    },
    {
      id: "notion" as const,
      name: "Notion",
      logo: "◼",
      color: "bg-gray-50 dark:bg-gray-900",
      border: "border-gray-200 dark:border-gray-700",
      description: t("notion.description"),
      capabilities: [t("notion.cap1"), t("notion.cap2"), t("notion.cap3")],
      authType: "apikey" as const,
      keyLabel: "Internal Integration Token",
      keyPlaceholder: "secret_xxxxxxxxxxxxxxxxxxxxxxxx",
      keyHint: t("notion.keyHint"),
    },
    {
      id: "github" as const,
      name: "GitHub",
      logo: "🐙",
      color: "bg-slate-50 dark:bg-slate-900",
      border: "border-slate-200 dark:border-slate-700",
      description: t("github.description"),
      capabilities: [t("github.cap1"), t("github.cap2"), t("github.cap3"), t("github.cap4")],
      authType: "apikey" as const,
      keyLabel: "Personal Access Token (PAT)",
      keyPlaceholder: "ghp_xxxxxxxxxxxxxxxxxxxx",
      keyHint: t("github.keyHint"),
    },
    {
      id: "tavily" as const,
      name: "Tavily",
      logo: "🔍",
      color: "bg-purple-50 dark:bg-purple-950",
      border: "border-purple-200 dark:border-purple-800",
      description: t("tavily.description"),
      capabilities: [t("tavily.cap1"), t("tavily.cap2"), t("tavily.cap3"), t("tavily.cap4")],
      authType: "apikey" as const,
      keyLabel: "Tavily API Key",
      keyPlaceholder: "tvly-xxxxxxxxxxxxxxxxxxxxxxxx",
      keyHint: t("tavily.keyHint"),
    },
    {
      id: "naver_search" as const,
      name: "네이버 검색",
      logo: "🟢",
      color: "bg-green-50 dark:bg-green-950",
      border: "border-green-200 dark:border-green-800",
      description: t("naver_search.description"),
      capabilities: [t("naver_search.cap1"), t("naver_search.cap2"), t("naver_search.cap3"), t("naver_search.cap4")],
      authType: "naver" as const,
      keyHint: t("naver_search.keyHint"),
    },
    {
      id: "gemini" as const,
      name: "Gemini",
      logo: "✨",
      color: "bg-violet-50 dark:bg-violet-950",
      border: "border-violet-200 dark:border-violet-800",
      description: t("gemini.description"),
      capabilities: [t("gemini.cap1"), t("gemini.cap2"), t("gemini.cap3"), t("gemini.cap4")],
      authType: "apikey" as const,
      keyLabel: "Gemini API Key",
      keyPlaceholder: "AIzaSy...",
      keyHint: t("gemini.keyHint"),
    },
  ], [t])
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<AllStatus>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  // API key dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogProvider, setDialogProvider] = useState<"notion" | "github" | "tavily" | "naver_search" | "gemini" | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState("")
  const [apiKeyError, setApiKeyError] = useState("")

  // Naver Search — two-field dialog
  const [naverClientId, setNaverClientId] = useState("")
  const [naverClientSecret, setNaverClientSecret] = useState("")

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
    if (connected === "google") showToast(t("googleConnected"))
    if (error === "google") showToast(t("googleCancelled"), "error")
    // Clean URL
    if (connected || error) window.history.replaceState({}, "", "/settings/integrations")
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Actions ──────────────────────────────────────────────────────────────

  const connectGoogle = async () => {
    setBusy("google")
    try {
      const res = await fetch("/api/integrations/google/auth-url")
      if (!res.ok) { showToast(t("googleOAuthMissing"), "error"); return }
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
      if (res.ok) { setStatus((s) => ({ ...s, google: { connected: false } })); showToast(t("googleUnlinked")) }
      else showToast(t("disconnectFailed"), "error")
    } finally {
      setBusy(null)
    }
  }

  const openApiKeyDialog = (provider: "notion" | "github" | "tavily" | "naver_search" | "gemini") => {
    setDialogProvider(provider)
    setApiKeyInput("")
    setApiKeyError("")
    setNaverClientId("")
    setNaverClientSecret("")
    setDialogOpen(true)
  }

  const submitApiKey = async () => {
    if (!dialogProvider) return

    // Naver Search uses two separate fields
    if (dialogProvider === "naver_search") {
      if (!naverClientId.trim() || !naverClientSecret.trim()) {
        setApiKeyError(t("apiKeyRequired")); return
      }
      setBusy("naver_search")
      setDialogOpen(false)
      try {
        const res = await fetch("/api/integrations/naver_search", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client_id: naverClientId.trim(), client_secret: naverClientSecret.trim() }),
        })
        if (res.ok) {
          setStatus((s) => ({ ...s, naver_search: { connected: true } }))
          showToast(t("providerConnected", { name: "네이버 검색" }))
        } else {
          showToast(t("saveFailed"), "error")
        }
      } finally {
        setBusy(null)
      }
      return
    }

    if (!apiKeyInput.trim()) { setApiKeyError(t("apiKeyRequired")); return }
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
        const name = dialogProvider === "notion" ? "Notion" : dialogProvider === "github" ? "GitHub" : dialogProvider === "gemini" ? "Gemini" : "Tavily"
        showToast(t("providerConnected", { name }))
      } else {
        showToast(t("saveFailed"), "error")
      }
    } finally {
      setBusy(null)
    }
  }

  const disconnect = async (provider: "notion" | "github" | "tavily" | "naver_search" | "gemini") => {
    setBusy(provider)
    try {
      const res = await fetch(`/api/integrations/${provider}`, { method: "DELETE" })
      if (res.ok) {
        setStatus((s) => ({ ...s, [provider]: { connected: false } }))
        const nameMap: Record<string, string> = {
          notion: "Notion", github: "GitHub", tavily: "Tavily", naver_search: "네이버 검색", gemini: "Gemini"
        }
        showToast(t("providerUnlinked", { name: nameMap[provider] }))
      } else {
        showToast(t("disconnectFailed"), "error")
      }
    } finally {
      setBusy(null)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const dialogIntegration = INTEGRATIONS.find((i) => i.id === dialogProvider)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Link2 className="size-6 text-primary" />
          {t("title")}
        </h1>
        <p className="text-muted-foreground mt-1">
          {t("subtitle")}
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {INTEGRATIONS.map((integration) => {
          const st = status[integration.id]
          const isConnected = st?.connected ?? false
          const isBusy = busy === integration.id

          const iconCfg = INTEGRATION_ICONS[integration.id]
          return (
            <div key={integration.id} className={cn(
              "rounded-xl border bg-card overflow-hidden",
              isConnected ? "border-border" : "border-border"
            )}>
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
                <div className="flex items-center gap-3">
                  <div className={cn("size-8 flex items-center justify-center shrink-0", iconCfg.color)}>
                    {iconCfg.icon}
                  </div>
                  <h3 className="font-semibold text-sm">{integration.name}</h3>
                </div>
                {loading ? (
                  <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                ) : isConnected ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-green-100 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800">
                    <CheckCircle2 className="size-3" /> {t("connected")}
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border border-border text-muted-foreground bg-muted">
                    {t("disconnected")}
                  </span>
                )}
              </div>

              {/* Body */}
              <div className="px-5 py-4 space-y-3">
                <p className="text-sm text-muted-foreground">{integration.description}</p>
                <ul className="flex flex-wrap gap-x-4 gap-y-0.5">
                  {integration.capabilities.map((cap) => (
                    <li key={cap} className="text-xs text-muted-foreground flex items-center gap-1">
                      <span className="size-1 rounded-full bg-muted-foreground/50 shrink-0 inline-block" />
                      {cap}
                    </li>
                  ))}
                </ul>
                <div className="flex justify-end">
                  {isConnected ? (
                    <Button
                      variant="outline" size="sm" className="gap-1.5"
                      disabled={isBusy}
                      onClick={() =>
                        integration.id === "google"
                          ? disconnectGoogle()
                          : disconnect(integration.id as "notion" | "github" | "tavily" | "naver_search" | "gemini")
                      }
                    >
                      {isBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Unlink className="size-3.5" />}
                      {t("disconnect")}
                    </Button>
                  ) : (
                    <Button
                      size="sm" className="gap-1.5"
                      disabled={isBusy || loading}
                      onClick={() =>
                        integration.id === "google"
                          ? connectGoogle()
                          : openApiKeyDialog(integration.id as "notion" | "github" | "tavily" | "naver_search" | "gemini")
                      }
                    >
                      {isBusy ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : integration.authType === "oauth" ? (
                        <ExternalLink className="size-3.5" />
                      ) : null}
                      {t("connect")}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* API Key Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dialogTitle", { name: dialogIntegration?.name ?? "" })}</DialogTitle>
            <DialogDescription>
              {dialogIntegration?.keyHint}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {dialogProvider === "naver_search" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="naver-client-id">{t("naver_search.clientIdLabel")}</Label>
                  <Input
                    id="naver-client-id"
                    type="text"
                    placeholder="XXXXXXXXXXXXXXXXXXXXXXXX"
                    value={naverClientId}
                    onChange={(e) => { setNaverClientId(e.target.value); setApiKeyError("") }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="naver-client-secret">{t("naver_search.clientSecretLabel")}</Label>
                  <Input
                    id="naver-client-secret"
                    type="password"
                    placeholder="XXXXXXXXXX"
                    value={naverClientSecret}
                    onChange={(e) => { setNaverClientSecret(e.target.value); setApiKeyError("") }}
                    onKeyDown={(e) => { if (e.key === "Enter") submitApiKey() }}
                  />
                </div>
                {apiKeyError && <p className="text-xs text-destructive">{apiKeyError}</p>}
              </>
            ) : (
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
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>{t("cancel")}</Button>
            <Button onClick={submitApiKey}>{t("save")}</Button>
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
