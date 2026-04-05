"use client"

import { useEffect, useState, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { siTelegram } from "@/lib/simple-icons"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ChevronDown, ChevronUp, Check, X, Link2 } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"

// ── Types ──────────────────────────────────────────────────────────────────

interface TelegramStatus {
  configured: boolean
  enabled: boolean
  botUsername?: string
  accounts: string[]
  status: string // "not-configured" | "configured" | "running"
  dmPolicy: string
  groupPolicy: string
}

interface PairingRequest {
  id: string
  telegramId: string
  displayName: string
  messageText: string
  requestedAt: string
}

interface ToastState {
  message: string
  type: "success" | "error"
}

// ── Main component ─────────────────────────────────────────────────────────

export function ChannelsView() {
  const t = useTranslations("channels")
  const { data: session, update } = useSession()

  const [status, setStatus] = useState<TelegramStatus | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Token setup
  const [tokenInput, setTokenInput] = useState("")
  const [savingToken, setSavingToken] = useState(false)

  // Enable/disable
  const [togglingEnabled, setTogglingEnabled] = useState(false)

  // Policy
  const [dmPolicy, setDmPolicy] = useState("allow")
  const [groupPolicy, setGroupPolicy] = useState("allow")
  const [savingPolicy, setSavingPolicy] = useState(false)

  // Account link
  const [linkCode, setLinkCode] = useState("")
  const [linking, setLinking] = useState(false)
  const [linkSuccess, setLinkSuccess] = useState(false)

  // Pairing requests
  const [pairingRequests, setPairingRequests] = useState<PairingRequest[]>([])
  const [pairingLoading, setPairingLoading] = useState(false)

  // Collapsible
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Toast
  const [toast, setToast] = useState<ToastState | null>(null)

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ── Fetch status ───────────────────────────────────────────────────────

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch("/api/channels/telegram", { cache: "no-store" })
      if (res.ok) {
        const data: TelegramStatus = await res.json()
        setStatus(data)
        setDmPolicy(data.dmPolicy ?? "allow")
        setGroupPolicy(data.groupPolicy ?? "allow")
      } else {
        const errData = await res.json().catch(() => ({}))
        setFetchError(errData.error ?? t("fetchError"))
      }
    } catch {
      setFetchError(t("fetchError"))
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Fetch pairing requests ─────────────────────────────────────────────

  const fetchPairing = useCallback(async () => {
    if (!status?.enabled) return
    setPairingLoading(true)
    try {
      const res = await fetch("/api/channels/telegram/pairing", { cache: "no-store" })
      if (res.ok) {
        const data = await res.json()
        setPairingRequests(data.requests ?? [])
      }
    } catch {
      // ignore
    } finally {
      setPairingLoading(false)
    }
  }, [status?.enabled])

  useEffect(() => { fetchStatus() }, [fetchStatus])
  useEffect(() => { fetchPairing() }, [fetchPairing])

  // ── Save bot token ─────────────────────────────────────────────────────

  const saveToken = async () => {
    if (!tokenInput.trim()) return
    setSavingToken(true)
    try {
      const res = await fetch("/api/channels/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-token", botToken: tokenInput.trim() }),
      })
      if (res.ok) {
        setTokenInput("")
        showToast(t("toast.tokenSaved"))
        fetchStatus()
      } else {
        const data = await res.json().catch(() => ({}))
        showToast((data as { error?: string }).error ?? t("toast.saveFailed"), "error")
      }
    } finally {
      setSavingToken(false)
    }
  }

  // ── Toggle enabled ─────────────────────────────────────────────────────

  const toggleEnabled = async (enabled: boolean) => {
    setTogglingEnabled(true)
    const prev = status
    setStatus(s => s ? { ...s, enabled } : s)
    try {
      const res = await fetch("/api/channels/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-enabled", enabled }),
      })
      if (res.ok) {
        showToast(enabled ? t("toast.botStarted") : t("toast.botStopped"))
        fetchStatus()
      } else {
        setStatus(prev)
        const data = await res.json().catch(() => ({}))
        showToast((data as { error?: string }).error ?? t("toast.settingFailed"), "error")
      }
    } finally {
      setTogglingEnabled(false)
    }
  }

  // ── Save policy ────────────────────────────────────────────────────────

  const savePolicy = async () => {
    setSavingPolicy(true)
    const prev = status
    setStatus(s => s ? { ...s, dmPolicy, groupPolicy } : s)
    try {
      const res = await fetch("/api/channels/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-policy", dmPolicy, groupPolicy }),
      })
      if (res.ok) {
        showToast(t("toast.policySaved"))
      } else {
        setStatus(prev)
        const data = await res.json().catch(() => ({}))
        showToast((data as { error?: string }).error ?? t("toast.saveFailed"), "error")
      }
    } finally {
      setSavingPolicy(false)
    }
  }

  // ── Account link ───────────────────────────────────────────────────────

  const handleLink = async () => {
    if (!linkCode.trim()) return
    setLinking(true)
    try {
      const token = (session as { token?: string })?.token
      const res = await fetch("/api/link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ code: linkCode.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        await update({ userId: (data as { userId?: string }).userId })
        setLinkSuccess(true)
        setLinkCode("")
        showToast(t("toast.accountLinked"))
        fetchStatus()
      } else {
        showToast((data as { error?: string }).error ?? t("toast.linkFailed"), "error")
      }
    } finally {
      setLinking(false)
    }
  }

  // ── Pairing actions ────────────────────────────────────────────────────

  const resolvePairing = async (id: string, action: "approve" | "deny") => {
    try {
      const res = await fetch(`/api/channels/telegram/pairing/${id}/${action}`, { method: "POST" })
      if (res.ok) {
        setPairingRequests(prev => prev.filter(r => r.id !== id))
        showToast(action === "approve" ? t("toast.approved") : t("toast.denied"))
      } else {
        const data = await res.json().catch(() => ({}))
        showToast((data as { error?: string }).error ?? t("toast.processFailed"), "error")
      }
    } catch {
      showToast(t("toast.processFailed"), "error")
    }
  }

  // ── Status badge ───────────────────────────────────────────────────────

  const statusBadge = () => {
    if (!status) return null
    if (status.status === "running")
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-green-100 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800">{t("statusRunning")}</span>
    if (status.status === "configured")
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-secondary text-secondary-foreground border-border">{t("statusConfigured")}</span>
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border border-border text-muted-foreground">{t("statusNotConfigured")}</span>
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 px-4 py-2 rounded shadow text-sm text-white ${
            toast.type === "error" ? "bg-red-500" : "bg-green-600"
          }`}
        >
          {toast.message}
        </div>
      )}

      <p className="text-muted-foreground text-sm">{t("subtitle")}</p>

      {/* Single column layout for sheet */}
      <div className="grid grid-cols-1 gap-6">

        {/* ── Telegram Card ── */}
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
              <div className="flex items-center gap-3">
                <svg role="img" viewBox="0 0 24 24" className="size-5 text-sky-500" fill="currentColor" aria-label="Telegram">
                  <path d={siTelegram.path} />
                </svg>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold">Telegram</h2>
                    {statusBadge()}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("telegram.description")}</p>
                </div>
              </div>
              {status?.configured && (
                <div className="flex items-center gap-2 shrink-0">
                  <Label htmlFor="bot-enabled" className="text-sm">
                    {status.enabled ? t("enabled") : t("disabled")}
                  </Label>
                  <Switch
                    id="bot-enabled"
                    checked={status.enabled}
                    disabled={togglingEnabled}
                    onCheckedChange={toggleEnabled}
                  />
                </div>
              )}
            </div>

            <div className="px-5 py-5 space-y-5">
              {loading ? (
                <div className="space-y-5">
                  {/* Bot Token 섹션 */}
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-64" />
                    <div className="flex gap-2">
                      <Skeleton className="h-9 flex-1 rounded-md" />
                      <Skeleton className="h-9 w-16 rounded-md" />
                    </div>
                  </div>
                  {/* Linked Accounts 섹션 */}
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <div className="flex gap-2">
                      <Skeleton className="h-6 w-28 rounded-full" />
                      <Skeleton className="h-6 w-20 rounded-full" />
                    </div>
                  </div>
                  {/* 채널 설정 버튼 */}
                  <Skeleton className="h-9 w-full rounded-md" />
                </div>
              ) : fetchError ? (
                <p className="text-sm text-red-500">{fetchError}</p>
              ) : (
                <>
                  {/* ── Bot Token ── */}
                  <div className="space-y-2">
                    <Label htmlFor="bot-token">
                      {t("botToken.label")}{" "}
                      {status?.configured && (
                        <span className="text-green-600 text-xs ml-1">{t("botToken.set")}</span>
                      )}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t("botToken.hint")}
                    </p>
                    <div className="flex gap-2">
                      <Input
                        id="bot-token"
                        type="password"
                        placeholder={
                          status?.configured
                            ? t("botToken.replacePlaceholder")
                            : t("botToken.placeholder")
                        }
                        value={tokenInput}
                        onChange={e => setTokenInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveToken() }}
                        className="flex-1 font-mono text-sm"
                      />
                      <Button onClick={saveToken} disabled={savingToken || !tokenInput.trim()} size="sm">
                        {savingToken ? t("botToken.saving") : t("botToken.save")}
                      </Button>
                    </div>
                  </div>

                  {/* ── Linked Accounts ── */}
                  {status?.accounts && status.accounts.length > 0 && (
                    <div className="space-y-1">
                      <Label>{t("linkedAccounts")}</Label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {status.accounts.map(a => (
                          <span key={a} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-secondary text-secondary-foreground border-border">{a}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Channel Settings (collapsible) ── */}
                  {status?.configured && (
                    <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
                      <CollapsibleTrigger asChild>
                        <Button variant="outline" className="w-full justify-between">
                          {t("channelSettings")}
                          {settingsOpen
                            ? <ChevronUp className="h-4 w-4" />
                            : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-3 space-y-5 border rounded-md p-4">

                        {/* DM Policy */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <Label>{t("dmPolicy.label")}</Label>
                            <p className="text-xs text-muted-foreground">
                              {t("dmPolicy.hint")}
                            </p>
                            <Select value={dmPolicy} onValueChange={setDmPolicy}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="allow">{t("dmPolicy.allow")}</SelectItem>
                                <SelectItem value="pairing">{t("dmPolicy.pairing")}</SelectItem>
                                <SelectItem value="deny">{t("dmPolicy.deny")}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Group Policy */}
                          <div className="space-y-1">
                            <Label>{t("groupPolicy.label")}</Label>
                            <p className="text-xs text-muted-foreground">
                              {t("groupPolicy.hint")}
                            </p>
                            <Select value={groupPolicy} onValueChange={setGroupPolicy}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="allow">{t("groupPolicy.allow")}</SelectItem>
                                <SelectItem value="mention">{t("groupPolicy.mention")}</SelectItem>
                                <SelectItem value="deny">{t("groupPolicy.deny")}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <Button onClick={savePolicy} disabled={savingPolicy} size="sm">
                          {savingPolicy ? t("savingPolicy") : t("savePolicy")}
                        </Button>

                        {/* Account Link */}
                        <div className="border-t pt-4 space-y-2">
                          <Label className="flex items-center gap-1">
                            <Link2 className="h-4 w-4" />
                            {t("accountLink.label")}
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            {t("accountLink.hint")}
                          </p>
                          {linkSuccess ? (
                            <p className="text-sm text-green-600">{t("accountLink.success")}</p>
                          ) : (
                            <div className="flex gap-2">
                              <Input
                                placeholder={t("accountLink.placeholder")}
                                value={linkCode}
                                onChange={e => setLinkCode(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") handleLink() }}
                                className="flex-1 font-mono uppercase"
                              />
                              <Button onClick={handleLink} disabled={linking || !linkCode.trim()} size="sm">
                                {linking ? t("accountLink.linking") : t("accountLink.link")}
                              </Button>
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {/* Setup guide */}
                  {!status?.configured && (
                    <div className="rounded-md bg-muted/50 p-4 text-sm space-y-2 text-muted-foreground">
                      <p className="font-medium text-foreground">{t("setup.title")}</p>
                      <ol className="list-decimal list-inside space-y-1">
                        <li>{t("setup.step1")}</li>
                        <li>{t("setup.step2")}</li>
                        <li>{t("setup.step3")}</li>
                        <li>{t("setup.step4")}</li>
                      </ol>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── Pairing Requests Card ── */}
          {status?.enabled && dmPolicy === "pairing" && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
                <div className="flex items-center gap-3">
                  <svg role="img" viewBox="0 0 24 24" className={cn("size-4 text-sky-500")} fill="currentColor" aria-label="Telegram">
                    <path d={siTelegram.path} />
                  </svg>
                  <div>
                    <p className="text-sm font-semibold">{t("pairing.title")}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t("pairing.description")}</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={fetchPairing} disabled={pairingLoading} className="text-xs h-7">
                  {pairingLoading ? t("pairing.refreshing") : t("pairing.refresh")}
                </Button>
              </div>
              <div className="px-5 py-4">
                {pairingRequests.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("pairing.empty")}</p>
                ) : (
                  <div className="space-y-2">
                    {pairingRequests.map(req => (
                      <div
                        key={req.id}
                        className="flex items-center justify-between rounded-lg border border-border p-3 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="font-medium truncate">{req.displayName || req.telegramId}</p>
                          {req.messageText && (
                            <p className="text-muted-foreground text-xs truncate">{req.messageText}</p>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0 ml-3">
                          <Button
                            size="icon" variant="ghost"
                            className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                            onClick={() => resolvePairing(req.id, "approve")} title={t("pairing.approve")}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon" variant="ghost"
                            className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => resolvePairing(req.id, "deny")} title={t("pairing.deny")}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
