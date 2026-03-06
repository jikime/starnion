"use client"

import { useEffect, useState, Suspense, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
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
  tavily?: IntegrationStatus
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
  ], [t])
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<AllStatus>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  // API key dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogProvider, setDialogProvider] = useState<"notion" | "github" | "tavily" | null>(null)
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

  const openApiKeyDialog = (provider: "notion" | "github" | "tavily") => {
    setDialogProvider(provider)
    setApiKeyInput("")
    setApiKeyError("")
    setDialogOpen(true)
  }

  const submitApiKey = async () => {
    if (!dialogProvider) return
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
        const name = dialogProvider === "notion" ? "Notion" : dialogProvider === "github" ? "GitHub" : "Tavily"
        showToast(t("providerConnected", { name }))
      } else {
        showToast(t("saveFailed"), "error")
      }
    } finally {
      setBusy(null)
    }
  }

  const disconnect = async (provider: "notion" | "github" | "tavily") => {
    setBusy(provider)
    try {
      const res = await fetch(`/api/integrations/${provider}`, { method: "DELETE" })
      if (res.ok) {
        setStatus((s) => ({ ...s, [provider]: { connected: false } }))
        const name = provider === "notion" ? "Notion" : provider === "github" ? "GitHub" : "Tavily"
        showToast(t("providerUnlinked", { name }))
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
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
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
                          <CheckCircle2 className="size-3" /> {t("connected")}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">{t("disconnected")}</Badge>
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
                            : disconnect(integration.id as "notion" | "github" | "tavily")
                        }
                      >
                        {isBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Unlink className="size-3.5" />}
                        {t("disconnect")}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="gap-1.5"
                        disabled={isBusy || loading}
                        onClick={() =>
                          integration.id === "google"
                            ? connectGoogle()
                            : openApiKeyDialog(integration.id as "notion" | "github" | "tavily")
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
              </CardContent>
            </Card>
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
