"use client"

import { useEffect, useState, useMemo } from "react"
import { useTranslations } from "next-intl"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import {
  Cog, Info, Loader2, Zap, MessageSquare,
  ToggleLeft, ToggleRight, Key, Eye, EyeOff, Trash2,
  Link2, Link2Off, Search, AlertTriangle, Clock,
} from "lucide-react"

interface Skill {
  id: string
  display_name: string
  description: string
  category: string
  emoji: string
  enabled: boolean
  // key / provider fields
  requires_api_key: boolean
  api_key_provider: string | null
  api_key_type: string | null        // "dual" | "google_oauth" | null
  api_key_label: string | null
  api_key_label_1: string | null     // label for first field (dual/google_oauth)
  api_key_label_2: string | null     // label for second field (dual/google_oauth)
  has_api_key: boolean
  masked_key: string | null
  uses_provider: boolean             // uses providers table (e.g. audio → OpenAI/Groq)
  // google_oauth fields
  oauth_connected: boolean
  oauth_expires_at: string | null
}

const CATEGORY_KEYS: Record<string, string> = {
  personal:     "categoryPersonal",
  finance:      "categoryFinance",
  productivity: "categoryProductivity",
  utility:      "categoryUtility",
  search:       "categorySearch",
  creative:     "categoryCreative",
}

const CATEGORY_DOT: Record<string, string> = {
  personal:     "bg-pink-400",
  finance:      "bg-emerald-400",
  productivity: "bg-blue-400",
  utility:      "bg-zinc-400",
  search:       "bg-sky-400",
  creative:     "bg-violet-400",
}

// #10 OAuth 만료 여부 체크
function isOAuthExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt) < new Date()
}

// ── APIKeySection ─────────────────────────────────────────────────────────────
function APIKeySection({
  skill,
  onSaved,
  onDeleted,
}: {
  skill: Skill
  onSaved: (masked: string) => void
  onDeleted: () => void
}) {
  const tSkills = useTranslations("skills")
  const isDual = skill.api_key_type === "dual" || skill.api_key_type === "google_oauth"

  const [inputVal, setInputVal]   = useState("")
  const [inputVal1, setInputVal1] = useState("")   // dual: Client ID
  const [inputVal2, setInputVal2] = useState("")   // dual: Client Secret
  const [showKey, setShowKey]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [deleting, setDeleting]   = useState(false)
  const [editing, setEditing]     = useState(false)
  // #2 삭제 확인 AlertDialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const canSave = isDual
    ? inputVal1.trim() !== "" && inputVal2.trim() !== ""
    : inputVal.trim() !== ""

  const handleSave = async () => {
    if (!canSave) return
    const apiKey = isDual
      ? `${inputVal1.trim()}:${inputVal2.trim()}`
      : inputVal.trim()
    setSaving(true)
    try {
      const res = await fetch(`/api/skills/${skill.id}/api-key`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey }),
      })
      if (res.ok) {
        const data = await res.json()
        onSaved(data.masked_key ?? "***")
        setInputVal(""); setInputVal1(""); setInputVal2("")
        setEditing(false)
        // #3 저장 성공 toast
        toast.success(tSkills("apiKeySaved"))
      } else {
        toast.error(tSkills("apiKeySaveError"))
      }
    } catch {
      toast.error(tSkills("apiKeySaveError"))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/skills/${skill.id}/api-key`, { method: "DELETE" })
      if (res.ok) {
        onDeleted()
        setEditing(false)
        toast.success(tSkills("apiKeyDeleted"))
      } else {
        toast.error(tSkills("apiKeyDeleteError"))
      }
    } catch {
      toast.error(tSkills("apiKeyDeleteError"))
    } finally {
      setDeleting(false)
    }
  }

  const handleCancel = () => {
    setEditing(false)
    setInputVal(""); setInputVal1(""); setInputVal2("")
  }

  return (
    <>
      {/* #2 삭제 확인 AlertDialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tSkills("apiKeyDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tSkills("apiKeyDeleteDesc", { name: skill.display_name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tSkills("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDelete}
            >
              {deleting ? <Loader2 className="size-3 animate-spin mr-1" /> : null}
              {tSkills("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Key className="size-3.5 text-amber-500 shrink-0" />
          <span className="text-xs font-semibold text-foreground">{skill.api_key_label ?? "API Key"}</span>
          {!skill.requires_api_key && (
            <span className="text-[10px] text-muted-foreground">({tSkills("optional")})</span>
          )}
          {skill.has_api_key && !editing && (
            <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              {tSkills("configured")}
            </span>
          )}
        </div>

        {skill.has_api_key && !editing ? (
          /* Key is set — show masked + action buttons */
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs text-muted-foreground font-mono bg-muted rounded px-2.5 py-1.5 truncate">
              {skill.masked_key}
            </code>
            <Button
              variant="ghost" size="sm"
              className="shrink-0 h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setEditing(true)}
            >
              {tSkills("change")}
            </Button>
            <Button
              variant="ghost" size="icon"
              className="shrink-0 size-7 text-muted-foreground hover:text-destructive"
              onClick={() => setDeleteDialogOpen(true)}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
            </Button>
          </div>
        ) : isDual ? (
          /* Dual mode — Client ID + Client Secret as separate fields */
          <div className="space-y-2">
            <div className="space-y-1.5">
              <label className="text-[11px] text-muted-foreground font-medium">
                {skill.api_key_label_1 ?? "Key 1"}
              </label>
              <Input
                type="text"
                placeholder={skill.api_key_label_1 ?? "Key 1"}
                value={inputVal1}
                onChange={(e) => setInputVal1(e.target.value)}
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] text-muted-foreground font-medium">
                {skill.api_key_label_2 ?? "Key 2"}
              </label>
              <div className="relative">
                <Input
                  type={showKey ? "text" : "password"}
                  placeholder={skill.api_key_label_2 ?? "Key 2"}
                  value={inputVal2}
                  onChange={(e) => setInputVal2(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                  className="h-8 text-xs pr-8 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={handleSave}
                disabled={saving || !canSave}
              >
                {saving ? <Loader2 className="size-3 animate-spin" /> : tSkills("save")}
              </Button>
              {editing && (
                <Button
                  variant="ghost" size="sm"
                  className="h-8 px-2 text-xs text-muted-foreground"
                  onClick={handleCancel}
                >
                  {tSkills("cancel")}
                </Button>
              )}
            </div>
          </div>
        ) : (
          /* Single key mode */
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                type={showKey ? "text" : "password"}
                placeholder={skill.api_key_label ?? tSkills("apiKeyInputPlaceholder")}
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                className="h-8 text-xs pr-8 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            </div>
            <Button
              size="sm"
              className="shrink-0 h-8 px-3 text-xs"
              onClick={handleSave}
              disabled={saving || !canSave}
            >
              {saving ? <Loader2 className="size-3 animate-spin" /> : tSkills("save")}
            </Button>
            {editing && (
              <Button
                variant="ghost" size="sm"
                className="shrink-0 h-8 px-2 text-xs text-muted-foreground"
                onClick={handleCancel}
              >
                {tSkills("cancel")}
              </Button>
            )}
          </div>
        )}
      </div>
    </>
  )
}

// ── GoogleOAuthConnectSection ─────────────────────────────────────────────────
function GoogleOAuthConnectSection({
  skill,
  onDisconnected,
  onConnected,
}: {
  skill: Skill
  onDisconnected: () => void
  onConnected: () => void
}) {
  const tSkills = useTranslations("skills")
  const [connecting, setConnecting]       = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  // #10 만료 여부
  const expired = isOAuthExpired(skill.oauth_expires_at)

  const handleConnect = async () => {
    setConnecting(true)
    try {
      const res = await fetch(`/api/skills/${skill.id}/oauth-url`)
      if (!res.ok) return
      const data = await res.json()
      if (!data.url) return

      const popup = window.open(
        data.url,
        "google-oauth",
        "width=520,height=620,left=200,top=100,resizable=yes,scrollbars=yes",
      )
      if (!popup) return

      const onMessage = (e: MessageEvent) => {
        if (e.data?.type === "google-oauth-success") {
          window.removeEventListener("message", onMessage)
          setConnecting(false)
          onConnected()
          // #3 연결 성공 toast
          toast.success(tSkills("googleConnected"))
        }
      }
      window.addEventListener("message", onMessage)

      const pollClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(pollClosed)
          window.removeEventListener("message", onMessage)
          setConnecting(false)
        }
      }, 500)
    } catch {
      setConnecting(false)
      toast.error(tSkills("connectError"))
    }
  }

  const handleDisconnect = async () => {
    setDisconnecting(true)
    try {
      const res = await fetch(`/api/skills/${skill.id}/oauth-disconnect`, { method: "DELETE" })
      if (res.ok) {
        onDisconnected()
        toast.success(tSkills("googleDisconnected"))
      } else {
        toast.error(tSkills("disconnectError"))
      }
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-base">🔵</span>
        <span className="text-xs font-semibold text-foreground">{tSkills("googleAccountConnect")}</span>
        {skill.oauth_connected && !expired && (
          <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            {tSkills("connected")}
          </span>
        )}
        {/* #10 만료 경고 배지 */}
        {skill.oauth_connected && expired && (
          <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30">
            <AlertTriangle className="size-2.5" />
            {tSkills("expiredReconnect")}
          </span>
        )}
      </div>

      {/* #10 만료 시 재연결 안내 */}
      {skill.oauth_connected && expired && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2">
          <p className="text-xs text-red-700 dark:text-red-300">
            {tSkills("oauthExpiredDesc")}
          </p>
        </div>
      )}

      {skill.oauth_connected && !expired ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 space-y-0.5">
            <p className="text-xs text-muted-foreground">{tSkills("googleAccountConnected")}</p>
            {skill.oauth_expires_at && (
              <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                <Clock className="size-2.5" />
                {tSkills("oauthExpiry", { date: new Date(skill.oauth_expires_at).toLocaleString() })}
              </p>
            )}
          </div>
          <Button
            variant="ghost" size="sm"
            className="shrink-0 h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
            onClick={handleDisconnect}
            disabled={disconnecting}
          >
            {disconnecting
              ? <Loader2 className="size-3 animate-spin" />
              : <><Link2Off className="size-3 mr-1" />{tSkills("disconnect")}</>}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {!expired && (
            <p className="text-xs text-muted-foreground">
              {tSkills("oauthSetupHint")}
            </p>
          )}
          <Button
            size="sm"
            className="h-8 px-3 text-xs w-full"
            onClick={handleConnect}
            disabled={connecting}
            variant={expired ? "destructive" : "default"}
          >
            {connecting
              ? <Loader2 className="size-3 animate-spin mr-1.5" />
              : <Link2 className="size-3 mr-1.5" />}
            {expired ? tSkills("reconnect") : tSkills("googleAccountConnect")}
          </Button>
        </div>
      )}
    </div>
  )
}

// ── SkillDetailSheet ──────────────────────────────────────────────────────────
function SkillDetailSheet({
  skill,
  open,
  onOpenChange,
  onToggle,
  isToggling,
  onAPIKeySaved,
  onAPIKeyDeleted,
  onOAuthDisconnected,
  onOAuthConnected,
}: {
  skill: Skill | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onToggle: (skillId: string) => void
  isToggling: boolean
  onAPIKeySaved: (skillId: string, masked: string) => void
  onAPIKeyDeleted: (skillId: string) => void
  onOAuthDisconnected: (skillId: string) => void
  onOAuthConnected: (skillId: string) => void
}) {
  const t = useTranslations("skills")

  if (!skill) return null

  // #10 만료 여부
  const oauthExpired = isOAuthExpired(skill.oauth_expires_at)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0 gap-0 overflow-hidden">

        {/* ── Hero header ── */}
        <div className="relative bg-gradient-to-br from-primary/10 via-primary/5 to-background px-6 pt-8 pb-6 border-b border-border/60">
          <div className="flex items-start gap-4 pr-8">
            <div className="flex-shrink-0 size-14 rounded-2xl bg-background border border-border/60 flex items-center justify-center text-3xl">
              {skill.emoji}
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <SheetTitle className="text-xl font-bold leading-tight mb-1">
                {skill.display_name}
              </SheetTitle>
              <div className="flex items-center gap-1.5 flex-wrap">
                {(skill.requires_api_key || !!skill.api_key_provider) && (
                  <span className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border",
                    skill.api_key_type === "google_oauth"
                      ? skill.oauth_connected && !oauthExpired
                        ? "border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30"
                        : oauthExpired
                          ? "border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30"
                          : skill.has_api_key
                            ? "border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30"
                            : "border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900/30"
                      : skill.has_api_key
                        ? "border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30"
                        : skill.requires_api_key
                          ? "border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30"
                          : "border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900/30"
                  )}>
                    <Key className="size-2.5" />
                    {skill.api_key_type === "google_oauth"
                      ? skill.oauth_connected && !oauthExpired ? t("googleLinked") : oauthExpired ? t("reconnectNeeded") : skill.has_api_key ? t("connectNeeded") : t("keyNeeded")
                      : skill.has_api_key ? t("keyConfigured") : skill.requires_api_key ? t("keyNeeded") : t("keyOptional")}
                  </span>
                )}
                {skill.uses_provider && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30">
                    <Zap className="size-2.5" />
                    {t("provider")}
                  </span>
                )}
                <button
                  disabled={isToggling}
                  onClick={() => onToggle(skill.id)}
                  className={cn(
                    "inline-flex items-center gap-1 text-xs font-medium transition-opacity",
                    isToggling && "opacity-50 cursor-not-allowed",
                    skill.enabled ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                  )}
                >
                  {isToggling
                    ? <Loader2 className="size-3.5 animate-spin" />
                    : skill.enabled
                      ? <ToggleRight className="size-3.5" />
                      : <ToggleLeft className="size-3.5" />}
                  {skill.enabled ? "ON" : "OFF"}
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* API Key section (required or optional) */}
          {(skill.requires_api_key || !!skill.api_key_provider) && (
            <>
              <APIKeySection
                skill={skill}
                onSaved={(masked) => onAPIKeySaved(skill.id, masked)}
                onDeleted={() => onAPIKeyDeleted(skill.id)}
              />
              {/* Google OAuth connect button — shown only after credentials are saved */}
              {skill.api_key_type === "google_oauth" && skill.has_api_key && (
                <GoogleOAuthConnectSection
                  skill={skill}
                  onDisconnected={() => onOAuthDisconnected(skill.id)}
                  onConnected={() => onOAuthConnected(skill.id)}
                />
              )}
              <div className="border-t border-border/50" />
            </>
          )}

          {/* Provider notice */}
          {skill.uses_provider && (
            <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 flex items-start gap-3">
              <Zap className="size-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                {t("usesProviderNote")}
              </p>
            </div>
          )}

          {/* Description detail */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="size-5 rounded-md bg-violet-100 dark:bg-violet-950 flex items-center justify-center">
                <MessageSquare className="size-3 text-violet-500" />
              </div>
              <h3 className="text-sm font-semibold">{t("about")}</h3>
            </div>
            <p className="text-xs text-muted-foreground pl-7 leading-relaxed">
              {skill.description}
            </p>
          </div>

          {/* #8 예시 프롬프트 가이드 */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="size-5 rounded-md bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
                <Info className="size-3 text-amber-500" />
              </div>
              <h3 className="text-sm font-semibold">{t("howToUse")}</h3>
            </div>
            <div className="pl-7 space-y-2">
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t("howToUseDesc")}
              </p>
              <div className="rounded-lg bg-muted/50 border border-border/50 px-3 py-2 space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground">{t("examplePrompt")}</p>
                <div className="space-y-1">
                  <p className="text-xs text-foreground font-mono bg-background rounded px-2 py-1 border border-border/50">
                    "{t("examplePrompt1", { name: skill.display_name })}"
                  </p>
                  <p className="text-xs text-foreground font-mono bg-background rounded px-2 py-1 border border-border/50">
                    "{t("examplePrompt2", { emoji: skill.emoji, name: skill.display_name })}"
                  </p>
                </div>
              </div>
              {skill.requires_api_key && !skill.has_api_key && (
                <div className="flex items-start gap-1.5 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="size-3 shrink-0 mt-0.5" />
                  <p className="text-[11px]">{t("apiKeyRequired")}</p>
                </div>
              )}
            </div>
          </div>

        </div>
      </SheetContent>
    </Sheet>
  )
}

// ── SkillsPage ────────────────────────────────────────────────────────────────
export default function SkillsPage() {
  const t = useTranslations("skills")
  const [skills, setSkills]           = useState<Skill[]>([])
  const [loading, setLoading]         = useState(true)
  const [togglingId, setTogglingId]   = useState<string | null>(null)
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
  const [sheetOpen, setSheetOpen]     = useState(false)
  // #6 검색 상태
  const [searchQuery, setSearchQuery] = useState("")

  // #6 검색 필터링 + 그룹핑
  const filteredSkills = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return skills
    return skills.filter(
      (s) =>
        s.display_name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
    )
  }, [skills, searchQuery])

  const grouped = useMemo(() =>
    filteredSkills.reduce<Record<string, Skill[]>>((acc, s) => {
      if (!acc[s.category]) acc[s.category] = []
      acc[s.category].push(s)
      return acc
    }, {}),
    [filteredSkills]
  )

  const fetchSkills = async () => {
    try {
      const res = await fetch("/api/skills")
      if (res.ok) {
        const data = await res.json()
        setSkills(Array.isArray(data) ? data : (data.skills ?? []))
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSkills() }, [])

  const toggleSkill = async (skillId: string) => {
    const target = skills.find((s) => s.id === skillId)
    if (!target) return

    // #5 Key 미설정 스킬 활성화 시 경고
    if (!target.enabled && target.requires_api_key && !target.has_api_key) {
      toast.warning(t("apiKeyWarning", { name: target.display_name }), {
        description: t("apiKeyWarningDesc"),
        action: {
          label: t("openSettings"),
          onClick: () => openDetail(target),
        },
      })
      return
    }

    setTogglingId(skillId)
    try {
      const res = await fetch(`/api/skills/${skillId}/toggle`, { method: "POST" })
      if (res.ok) {
        const { enabled } = await res.json()
        setSkills((prev) =>
          prev.map((s) => (s.id === skillId ? { ...s, enabled } : s))
        )
        if (selectedSkill?.id === skillId) {
          setSelectedSkill((prev) => prev ? { ...prev, enabled } : prev)
        }
        // #3 토글 피드백
        toast.success(enabled ? t("skillEnabled", { name: target.display_name }) : t("skillDisabled", { name: target.display_name }))
      } else {
        toast.error(t("skillToggleError"))
      }
    } catch {
      toast.error(t("skillToggleError"))
    } finally {
      setTogglingId(null)
    }
  }

  const handleAPIKeySaved = (skillId: string, masked: string) => {
    const update = (s: Skill) =>
      s.id === skillId ? { ...s, has_api_key: true, masked_key: masked } : s
    setSkills((prev) => prev.map(update))
    setSelectedSkill((prev) => prev ? update(prev) : prev)
  }

  const handleAPIKeyDeleted = (skillId: string) => {
    const update = (s: Skill) =>
      s.id === skillId ? { ...s, has_api_key: false, masked_key: null } : s
    setSkills((prev) => prev.map(update))
    setSelectedSkill((prev) => prev ? update(prev) : prev)
  }

  const handleOAuthDisconnected = (skillId: string) => {
    const update = (s: Skill) =>
      s.id === skillId ? { ...s, oauth_connected: false, oauth_expires_at: null } : s
    setSkills((prev) => prev.map(update))
    setSelectedSkill((prev) => prev ? update(prev) : prev)
  }

  const handleOAuthConnected = (skillId: string) => {
    const update = (s: Skill) =>
      s.id === skillId ? { ...s, oauth_connected: true } : s
    setSkills((prev) => prev.map(update))
    setSelectedSkill((prev) => prev ? update(prev) : prev)
  }

  const openDetail = (skill: Skill) => {
    setSelectedSkill(skill)
    setSheetOpen(true)
  }

  const activeCount = skills.filter((s) => s.enabled).length
  const totalCount  = skills.length

  return (
    <div className="p-6 space-y-6">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-violet-100 dark:bg-violet-950/60 flex items-center justify-center shrink-0">
            <Cog className="size-5 text-violet-500" />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
        </div>

        {loading ? (
          <Skeleton className="h-6 w-24 rounded-full" />
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/30">
            <span className="size-1.5 rounded-full bg-emerald-400 shrink-0" />
            {t("active", { n: activeCount, total: totalCount })}
          </span>
        )}
      </div>

      {/* ── Main panel ── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-5">

          {/* #6 검색 바 */}
          {!loading && (
            <div className="relative mb-5">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder={t("searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
          )}

          {loading ? (
            <div className="space-y-8">
              {Array.from({ length: 2 }).map((_, gi) => (
                <div key={gi}>
                  <div className="flex items-center gap-2 mb-3">
                    <Skeleton className="size-2 rounded-full shrink-0" />
                    <Skeleton className="h-3 w-20" />
                    <div className="flex-1 h-px bg-border/50 ml-1" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="flex flex-col rounded-xl border border-border/60 bg-background overflow-hidden">
                        <div className="p-3 flex flex-col gap-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Skeleton className="size-8 rounded-lg shrink-0" />
                              <Skeleton className="h-4 w-28" />
                            </div>
                            <Skeleton className="h-5 w-8 rounded-full shrink-0" />
                          </div>
                          <Skeleton className="h-3 w-full" />
                          <Skeleton className="h-3 w-4/5" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : Object.keys(grouped).length === 0 ? (
            /* 검색 결과 없음 */
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Search className="size-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">{t("noSearchResults")}</p>
              <p className="text-xs text-muted-foreground/60 mt-1">{t("noSearchResultsHint", { query: searchQuery })}</p>
              <Button
                variant="ghost" size="sm"
                className="mt-3 text-xs"
                onClick={() => setSearchQuery("")}
              >
                {t("clearSearch")}
              </Button>
            </div>
          ) : (
            <div className="space-y-8">
              {/* #6 검색 중일 때 결과 수 표시 */}
              {searchQuery.trim() && (
                <p className="text-xs text-muted-foreground -mb-4">
                  {t("searchResultCount", { query: searchQuery, n: filteredSkills.length })}
                </p>
              )}
              {Object.entries(grouped).map(([category, catSkills]) => (
                <div key={category}>
                  {/* Category header */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className={cn(
                      "size-2 rounded-full shrink-0",
                      CATEGORY_DOT[category] ?? "bg-muted-foreground"
                    )} />
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {CATEGORY_KEYS[category] ? t(CATEGORY_KEYS[category]) : category.toUpperCase()}
                    </h4>
                    <span className="text-xs text-muted-foreground/60">
                      ({catSkills.length})
                    </span>
                    <div className="flex-1 h-px bg-border/50 ml-1" />
                  </div>

                  {/* Skill cards */}
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {catSkills.map((skill) => {
                      const isToggling = togglingId === skill.id
                      // #10 OAuth 만료 여부
                      const oauthExpired = skill.api_key_type === "google_oauth" &&
                        skill.oauth_connected && isOAuthExpired(skill.oauth_expires_at)

                      return (
                        /* #1 + #4 카드 전체 클릭 가능 */
                        <div
                          key={skill.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => openDetail(skill)}
                          onKeyDown={(e) => e.key === "Enter" && openDetail(skill)}
                          className={cn(
                            "group flex flex-col rounded-xl border bg-background overflow-hidden transition-all cursor-pointer",
                            "hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            skill.enabled
                              ? "border-border hover:border-violet-300 dark:hover:border-violet-700"
                              : "border-border/60 opacity-75 hover:opacity-100 hover:border-border"
                          )}
                        >
                          <div className="p-3 flex flex-col gap-2">
                            {/* Top row */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="flex-shrink-0 size-8 rounded-lg bg-muted flex items-center justify-center text-base">
                                  {skill.emoji}
                                </span>
                                <div className="min-w-0">
                                  <span className="text-sm font-medium leading-tight line-clamp-1">
                                    {skill.display_name}
                                  </span>
                                  <div className="flex items-center gap-1 mt-0.5">
                                    {/* #10 OAuth 만료 배지 */}
                                    {oauthExpired && (
                                      <span className="inline-flex items-center gap-0.5 px-1.5 py-px rounded text-[10px] font-medium border leading-tight border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30">
                                        <AlertTriangle className="size-2.5" />
                                        {t("reconnectNeeded")}
                                      </span>
                                    )}
                                    {/* API key badge */}
                                    {!oauthExpired && (skill.requires_api_key || !!skill.api_key_provider) && (
                                      <span className={cn(
                                        "inline-flex items-center gap-0.5 px-1.5 py-px rounded text-[10px] font-medium border leading-tight",
                                        skill.has_api_key
                                          ? "border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30"
                                          : skill.requires_api_key
                                            ? "border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30"
                                            : "border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900/30"
                                      )}>
                                        <Key className="size-2.5" />
                                        {skill.has_api_key ? t("configured") : skill.requires_api_key ? t("keyNeeded") : t("keyOptional")}
                                      </span>
                                    )}
                                    {/* Provider badge */}
                                    {skill.uses_provider && (
                                      <span className="inline-flex items-center gap-0.5 px-1.5 py-px rounded text-[10px] font-medium border leading-tight border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30">
                                        <Zap className="size-2.5" />
                                        {t("provider")}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Actions — Switch만 남김 (#7 하단 dot 제거) */}
                              <div
                                className="flex items-center gap-1 shrink-0"
                                onClick={(e) => e.stopPropagation()} // 카드 클릭 버블링 방지
                              >
                                {/* #1 Info 버튼: 항상 표시 (모바일 접근성) */}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-6 text-muted-foreground hover:text-foreground"
                                  onClick={(e) => { e.stopPropagation(); openDetail(skill) }}
                                  title={t("detailSettings")}
                                >
                                  <Info className="size-3.5" />
                                </Button>
                                {isToggling ? (
                                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                                ) : (
                                  <Switch
                                    checked={skill.enabled}
                                    onCheckedChange={() => toggleSkill(skill.id)}
                                  />
                                )}
                              </div>
                            </div>

                            {/* Description */}
                            <p className="text-xs text-muted-foreground leading-snug line-clamp-2 pl-10">
                              {skill.description}
                            </p>

                            {/* #7 하단 ON/OFF dot 제거 — 카드 footer 제거됨 */}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <SkillDetailSheet
        skill={selectedSkill}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onToggle={toggleSkill}
        isToggling={selectedSkill ? togglingId === selectedSkill.id : false}
        onAPIKeySaved={handleAPIKeySaved}
        onAPIKeyDeleted={handleAPIKeyDeleted}
        onOAuthDisconnected={handleOAuthDisconnected}
        onOAuthConnected={handleOAuthConnected}
      />
    </div>
  )
}
