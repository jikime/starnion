"use client"

import { useEffect, useState, useCallback } from "react"
import { useSession } from "next-auth/react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
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
  const { data: session, update } = useSession()

  const [status, setStatus] = useState<TelegramStatus | null>(null)
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
    try {
      const res = await fetch("/api/channels/telegram", { cache: "no-store" })
      if (res.ok) {
        const data: TelegramStatus = await res.json()
        setStatus(data)
        setDmPolicy(data.dmPolicy ?? "allow")
        setGroupPolicy(data.groupPolicy ?? "allow")
      }
    } catch {
      // ignore
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
        showToast("봇 토큰이 저장됐어요.")
        fetchStatus()
      } else {
        const data = await res.json().catch(() => ({}))
        showToast((data as { error?: string }).error ?? "저장에 실패했어요.", "error")
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
        showToast(enabled ? "봇이 시작됐어요." : "봇이 중지됐어요.")
        fetchStatus()
      } else {
        setStatus(prev)
        const data = await res.json().catch(() => ({}))
        showToast((data as { error?: string }).error ?? "설정 변경에 실패했어요.", "error")
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
        showToast("정책이 저장됐어요.")
      } else {
        setStatus(prev)
        const data = await res.json().catch(() => ({}))
        showToast((data as { error?: string }).error ?? "저장에 실패했어요.", "error")
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
        showToast("계정이 연결됐어요!")
        fetchStatus()
      } else {
        showToast((data as { error?: string }).error ?? "연결에 실패했어요.", "error")
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
        showToast(action === "approve" ? "승인했어요." : "거부했어요.")
      } else {
        const data = await res.json().catch(() => ({}))
        showToast((data as { error?: string }).error ?? "처리에 실패했어요.", "error")
      }
    } catch {
      showToast("처리에 실패했어요.", "error")
    }
  }

  // ── Status badge ───────────────────────────────────────────────────────

  const statusBadge = () => {
    if (!status) return null
    if (status.status === "running") return <Badge className="bg-green-500 text-white">실행중</Badge>
    if (status.status === "configured") return <Badge variant="secondary">설정됨</Badge>
    return <Badge variant="outline">미설정</Badge>
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

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold">채널</h1>
        <p className="text-muted-foreground text-sm mt-1">
          외부 메시징 채널을 연결하여 어디서든 지키와 대화하세요.
        </p>
      </div>

      {/* Responsive grid: 1 col → 2 col (lg) — each channel card is one cell */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* ── Telegram Card ── */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <span>Telegram</span>
                  {statusBadge()}
                </CardTitle>
                <CardDescription className="mt-1">
                  개인 텔레그램 봇을 연결하여 대화하세요.
                </CardDescription>
              </div>
              {status?.configured && (
                <div className="flex items-center gap-2 shrink-0">
                  <Label htmlFor="bot-enabled" className="text-sm">
                    {status.enabled ? "실행중" : "중지됨"}
                  </Label>
                  <Switch
                    id="bot-enabled"
                    checked={status.enabled}
                    disabled={togglingEnabled}
                    onCheckedChange={toggleEnabled}
                  />
                </div>
              )}
            </CardHeader>

            <CardContent className="space-y-5">
              {loading ? (
                <p className="text-sm text-muted-foreground">불러오는 중...</p>
              ) : (
                <>
                  {/* ── Bot Token ── */}
                  <div className="space-y-2">
                    <Label htmlFor="bot-token">
                      봇 토큰{" "}
                      {status?.configured && (
                        <span className="text-green-600 text-xs ml-1">✓ 설정됨</span>
                      )}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      @BotFather에서 발급받은 봇 토큰을 입력하세요.
                    </p>
                    <div className="flex gap-2">
                      <Input
                        id="bot-token"
                        type="password"
                        placeholder={
                          status?.configured
                            ? "새 토큰으로 교체하려면 입력하세요"
                            : "1234567890:ABCDEFGhijklmnopqrstuvwxyz"
                        }
                        value={tokenInput}
                        onChange={e => setTokenInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveToken() }}
                        className="flex-1 font-mono text-sm"
                      />
                      <Button onClick={saveToken} disabled={savingToken || !tokenInput.trim()} size="sm">
                        {savingToken ? "저장중..." : "저장"}
                      </Button>
                    </div>
                  </div>

                  {/* ── Linked Accounts ── */}
                  {status?.accounts && status.accounts.length > 0 && (
                    <div className="space-y-1">
                      <Label>연결된 텔레그램 계정</Label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {status.accounts.map(a => (
                          <Badge key={a} variant="secondary">{a}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Channel Settings (collapsible) ── */}
                  {status?.configured && (
                    <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
                      <CollapsibleTrigger asChild>
                        <Button variant="outline" className="w-full justify-between">
                          채널 설정
                          {settingsOpen
                            ? <ChevronUp className="h-4 w-4" />
                            : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-3 space-y-5 border rounded-md p-4">

                        {/* DM Policy */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <Label>DM 정책</Label>
                            <p className="text-xs text-muted-foreground">
                              개인 DM 처리 방식
                            </p>
                            <Select value={dmPolicy} onValueChange={setDmPolicy}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="allow">허용 — 누구나 DM 가능</SelectItem>
                                <SelectItem value="pairing">페어링 — 승인된 사용자만</SelectItem>
                                <SelectItem value="deny">거부 — DM 차단</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Group Policy */}
                          <div className="space-y-1">
                            <Label>그룹 정책</Label>
                            <p className="text-xs text-muted-foreground">
                              그룹 채팅 응답 방식
                            </p>
                            <Select value={groupPolicy} onValueChange={setGroupPolicy}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="allow">허용 — 모든 메시지에 응답</SelectItem>
                                <SelectItem value="mention">멘션 — @봇이름 호출 시만</SelectItem>
                                <SelectItem value="deny">거부 — 그룹 무시</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <Button onClick={savePolicy} disabled={savingPolicy} size="sm">
                          {savingPolicy ? "저장중..." : "정책 저장"}
                        </Button>

                        {/* Account Link */}
                        <div className="border-t pt-4 space-y-2">
                          <Label className="flex items-center gap-1">
                            <Link2 className="h-4 w-4" />
                            계정 연결
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            텔레그램에서{" "}
                            <code className="font-mono">/link</code> 명령어로 코드를 받은 후 입력하세요.
                          </p>
                          {linkSuccess ? (
                            <p className="text-sm text-green-600">✓ 계정이 연결됐어요!</p>
                          ) : (
                            <div className="flex gap-2">
                              <Input
                                placeholder="JIKI-XXXXXX"
                                value={linkCode}
                                onChange={e => setLinkCode(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") handleLink() }}
                                className="flex-1 font-mono uppercase"
                              />
                              <Button onClick={handleLink} disabled={linking || !linkCode.trim()} size="sm">
                                {linking ? "연결중..." : "연결"}
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
                      <p className="font-medium text-foreground">봇 설정 방법</p>
                      <ol className="list-decimal list-inside space-y-1">
                        <li>텔레그램에서 <code className="font-mono">@BotFather</code>를 검색하세요.</li>
                        <li><code className="font-mono">/newbot</code> 명령어로 새 봇을 만드세요.</li>
                        <li>발급받은 토큰을 위 입력창에 붙여넣기 하세요.</li>
                        <li>저장 후 토글을 켜면 봇이 시작돼요.</li>
                      </ol>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* ── Pairing Requests Card (별도 카드, lg 이상에서 메인 컬럼 하단) ── */}
          {status?.enabled && dmPolicy === "pairing" && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-base">페어링 요청</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    DM을 보낸 사용자를 승인하거나 거부하세요.
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={fetchPairing} disabled={pairingLoading} className="text-xs h-7">
                  {pairingLoading ? "새로고침중..." : "새로고침"}
                </Button>
              </CardHeader>
              <CardContent>
                {pairingRequests.length === 0 ? (
                  <p className="text-xs text-muted-foreground">대기중인 요청이 없어요.</p>
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
                            onClick={() => resolvePairing(req.id, "approve")} title="승인"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon" variant="ghost"
                            className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => resolvePairing(req.id, "deny")} title="거부"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

      </div>
    </div>
  )
}
