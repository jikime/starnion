"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Settings,
  Loader2,
  CheckCircle,
  AlertCircle,
  UserCircle,
  KeyRound,
  Eye,
  EyeOff,
  ShieldAlert,
  Info,
} from "lucide-react"

// Common IANA timezones with UTC offset labels
const TIMEZONES = [
  { value: "Pacific/Honolulu",    label: "UTC-10  Hawaii" },
  { value: "America/Anchorage",   label: "UTC-9   Alaska" },
  { value: "America/Los_Angeles", label: "UTC-8   Los Angeles / Seattle" },
  { value: "America/Denver",      label: "UTC-7   Denver / Phoenix" },
  { value: "America/Chicago",     label: "UTC-6   Chicago / Mexico City" },
  { value: "America/New_York",    label: "UTC-5   New York / Toronto" },
  { value: "America/Sao_Paulo",   label: "UTC-3   São Paulo / Buenos Aires" },
  { value: "Europe/London",       label: "UTC+0   London / Lisbon" },
  { value: "Europe/Paris",        label: "UTC+1   Paris / Berlin / Rome" },
  { value: "Europe/Helsinki",     label: "UTC+2   Helsinki / Athens / Cairo" },
  { value: "Europe/Moscow",       label: "UTC+3   Moscow / Istanbul" },
  { value: "Asia/Dubai",          label: "UTC+4   Dubai / Abu Dhabi" },
  { value: "Asia/Karachi",        label: "UTC+5   Karachi / Islamabad" },
  { value: "Asia/Kolkata",        label: "UTC+5:30 Mumbai / Delhi" },
  { value: "Asia/Dhaka",          label: "UTC+6   Dhaka / Almaty" },
  { value: "Asia/Bangkok",        label: "UTC+7   Bangkok / Jakarta / Hanoi" },
  { value: "Asia/Shanghai",       label: "UTC+8   Beijing / Shanghai / Singapore" },
  { value: "Asia/Seoul",          label: "UTC+9   Seoul / Tokyo / Pyongyang" },
  { value: "Australia/Sydney",    label: "UTC+10  Sydney / Melbourne" },
  { value: "Pacific/Auckland",    label: "UTC+12  Auckland / Fiji" },
] as const

interface Profile {
  name: string
  email: string
  language: string
  timezone: string
}

type SaveStatus = "idle" | "saving" | "saved" | "error"

// ── #3 비밀번호 강도 계산 ──────────────────────────────────────────────────────
interface PasswordStrength {
  score: number  // 0–4
  labelKey: string
  color: string
  bgColor: string
}

function getPasswordStrength(pw: string): PasswordStrength {
  if (!pw) return { score: 0, labelKey: "", color: "", bgColor: "" }
  let score = 0
  if (pw.length >= 8)  score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  const capped = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4
  const map: Record<0 | 1 | 2 | 3 | 4, Omit<PasswordStrength, "score">> = {
    0: { labelKey: "",                           color: "",                bgColor: "" },
    1: { labelKey: "password.strengthVeryWeak",  color: "text-red-500",    bgColor: "bg-red-500" },
    2: { labelKey: "password.strengthWeak",      color: "text-orange-500", bgColor: "bg-orange-500" },
    3: { labelKey: "password.strengthFair",      color: "text-yellow-500", bgColor: "bg-yellow-500" },
    4: { labelKey: "password.strengthStrong",    color: "text-emerald-500",bgColor: "bg-emerald-500" },
  }
  return { score: capped, ...map[capped] }
}

export default function SettingsPage() {
  const t = useTranslations("settings")

  // ── Account state ──────────────────────────────────────────────────────────
  const [profile, setProfile] = useState<Profile>({ name: "", email: "", language: "ko", timezone: "Asia/Seoul" })
  // #1 변경 감지용 원본값
  const initialProfileRef = useRef<Profile>({ name: "", email: "", language: "ko", timezone: "Asia/Seoul" })
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")

  // #4 비밀번호 show/hide
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw]         = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)

  // Password change
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword]         = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [pwStatus, setPwStatus]               = useState<SaveStatus>("idle")
  const [pwError, setPwError]                 = useState("")

  // #10 계정 삭제
  const [deleteEmail, setDeleteEmail] = useState("")
  const [deleteLoading, setDeleteLoading] = useState(false)

  // #1 변경 감지 — 원본과 다른 경우만 저장 버튼 활성화
  const hasProfileChanged =
    profile.name     !== initialProfileRef.current.name     ||
    profile.language !== initialProfileRef.current.language ||
    profile.timezone !== initialProfileRef.current.timezone

  // #3 비밀번호 강도
  const pwStrength = getPasswordStrength(newPassword)

  // #6 실시간 비밀번호 일치 여부
  const pwMismatch = confirmPassword.length > 0 && confirmPassword !== newPassword

  useEffect(() => {
    fetch("/api/settings/account")
      .then((r) => r.json())
      .then((data) => {
        if (data.name !== undefined) {
          const loaded: Profile = {
            name:     data.name     ?? "",
            email:    data.email    ?? "",
            language: data.language ?? "ko",
            timezone: data.timezone ?? "Asia/Seoul",
          }
          setProfile(loaded)
          initialProfileRef.current = loaded
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // ── #1 + #2 프로필 저장 ──────────────────────────────────────────────────────
  async function handleSaveProfile() {
    setSaveStatus("saving")
    try {
      const res = await fetch("/api/settings/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: profile.name, language: profile.language, timezone: profile.timezone }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? t("saveFailed"))
      }
      initialProfileRef.current = { ...profile }
      setSaveStatus("saved")
      toast.success(t("profileSaved"))
      setTimeout(() => setSaveStatus("idle"), 2500)
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("saveFailed")
      setSaveStatus("error")
      toast.error(msg)
    }
  }

  // ── #2 + #9 비밀번호 변경 ────────────────────────────────────────────────────
  async function handleChangePassword() {
    if (newPassword !== confirmPassword) {
      setPwError(t("passwordMismatch"))
      setPwStatus("error")
      return
    }
    if (newPassword.length < 8) {
      setPwError(t("passwordTooShort"))
      setPwStatus("error")
      return
    }
    setPwStatus("saving")
    setPwError("")
    try {
      const res = await fetch("/api/settings/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? t("passwordChangeFailed"))
      }
      setPwStatus("saved")
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      // #9 비밀번호 변경 후 세션 안내
      toast.success(t("passwordChangedToast"), {
        description: t("passwordChangedDescription"),
        duration: 5000,
      })
      setTimeout(() => setPwStatus("idle"), 2500)
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("passwordChangeFailed")
      setPwError(msg)
      setPwStatus("error")
      toast.error(msg)
    }
  }

  // ── #10 계정 삭제 ────────────────────────────────────────────────────────────
  async function handleDeleteAccount() {
    setDeleteLoading(true)
    try {
      const res = await fetch("/api/settings/account", { method: "DELETE" })
      if (!res.ok) throw new Error(t("dangerZone.deleteFailed"))
      toast.success(t("dangerZone.deleteSuccess"))
      window.location.href = "/auth/login"
    } catch {
      toast.error(t("dangerZone.deleteError"))
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Settings className="size-6 text-primary" />
          {t("title")}
        </h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="space-y-6">
        {/* ── 프로필 섹션 ─────────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
            <div className="size-8 rounded-lg bg-blue-100 dark:bg-blue-950/60 flex items-center justify-center shrink-0">
              <UserCircle className="size-4 text-blue-500" />
            </div>
            <h2 className="text-sm font-semibold">{t("accountSettings")}</h2>
          </div>
          <div className="px-6 py-5 space-y-6">
            {loading ? (
              <div className="space-y-6 py-2">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-9 w-full rounded-md" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-9 w-full rounded-md" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-64" />
                  <Skeleton className="h-9 w-48 rounded-md" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-3 w-56" />
                  <Skeleton className="h-9 w-48 rounded-md" />
                </div>
              </div>
            ) : (
              <>
                {/* 이름 */}
                <div className="space-y-2">
                  <Label htmlFor="name">{t("name")}</Label>
                  <Input
                    id="name"
                    placeholder={t("namePlaceholder")}
                    value={profile.name}
                    onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                  />
                </div>

                {/* 이메일 (읽기 전용) */}
                <div className="space-y-2">
                  <Label htmlFor="email">{t("email")}</Label>
                  <Input id="email" type="email" value={profile.email} disabled />
                  <p className="text-xs text-muted-foreground">{t("emailReadOnly")}</p>
                </div>

                {/* #7 AI 언어 — 용도 명확화 */}
                <div className="space-y-2">
                  <Label>{t("aiLanguage")}</Label>
                  <div className="flex items-start gap-1.5">
                    <Info className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      {t("aiLanguageDetailDescription")}
                    </p>
                  </div>
                  <Select
                    value={profile.language}
                    onValueChange={(value) => setProfile((p) => ({ ...p, language: value }))}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ko">한국어</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="ja">日本語</SelectItem>
                      <SelectItem value="zh">中文</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* #8 타임존 — 반응형 너비 */}
                <div className="space-y-2">
                  <Label>{t("timezone")}</Label>
                  <p className="text-xs text-muted-foreground">{t("timezoneDescription")}</p>
                  <Select
                    value={profile.timezone}
                    onValueChange={(value) => setProfile((p) => ({ ...p, timezone: value }))}
                  >
                    <SelectTrigger className="w-full max-w-xs sm:w-72">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* #5 에러 — 버튼 위 인라인 */}
                {saveStatus === "error" && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="size-4 shrink-0" />
                    <span>{t("saveError")}</span>
                  </div>
                )}

                {/* #1 변경 감지 + #2 toast 연동 */}
                <div className="flex items-center justify-end gap-3">
                  {saveStatus === "saved" && (
                    <span className="flex items-center gap-1 text-sm text-emerald-500">
                      <CheckCircle className="size-4" /> {t("saved")}
                    </span>
                  )}
                  <Button
                    onClick={handleSaveProfile}
                    disabled={saveStatus === "saving" || !hasProfileChanged}
                  >
                    {saveStatus === "saving" && <Loader2 className="size-4 animate-spin mr-2" />}
                    {saveStatus === "saving" ? t("saving") : t("save")}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── 비밀번호 변경 섹션 ──────────────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
            <div className="size-8 rounded-lg bg-amber-100 dark:bg-amber-950/60 flex items-center justify-center shrink-0">
              <KeyRound className="size-4 text-amber-500" />
            </div>
            <h2 className="text-sm font-semibold">{t("passwordChange")}</h2>
          </div>
          <div className="px-6 py-5 space-y-4">
            {/* #4 현재 비밀번호 show/hide */}
            <div className="space-y-2">
              <Label htmlFor="current-pw">{t("currentPassword")}</Label>
              <div className="relative">
                <Input
                  id="current-pw"
                  type={showCurrentPw ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowCurrentPw((v) => !v)}
                  tabIndex={-1}
                  aria-label={showCurrentPw ? t("password.hide") : t("password.show")}
                >
                  {showCurrentPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {/* #4 새 비밀번호 show/hide + #3 강도 게이지 */}
            <div className="space-y-2">
              <Label htmlFor="new-pw">{t("newPassword")}</Label>
              <div className="relative">
                <Input
                  id="new-pw"
                  type={showNewPw ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowNewPw((v) => !v)}
                  tabIndex={-1}
                  aria-label={showNewPw ? t("password.hide") : t("password.show")}
                >
                  {showNewPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {/* #3 강도 게이지 */}
              {newPassword.length > 0 && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                          i <= pwStrength.score ? pwStrength.bgColor : "bg-muted"
                        }`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className={pwStrength.color}>{pwStrength.labelKey ? t(pwStrength.labelKey) : ""}</span>
                    <span className="text-muted-foreground">
                      {pwStrength.score < 3 && t("password.strengthHint")}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* #4 확인 비밀번호 show/hide + #6 실시간 일치 검사 */}
            <div className="space-y-2">
              <Label htmlFor="confirm-pw">{t("confirmPassword")}</Label>
              <div className="relative">
                <Input
                  id="confirm-pw"
                  type={showConfirmPw ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  className={`pr-10 ${pwMismatch ? "border-destructive focus-visible:ring-destructive" : ""}`}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowConfirmPw((v) => !v)}
                  tabIndex={-1}
                  aria-label={showConfirmPw ? t("password.hide") : t("password.show")}
                >
                  {showConfirmPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {/* #6 실시간 일치 여부 */}
              {confirmPassword.length > 0 && (
                <p className={`text-xs flex items-center gap-1 ${pwMismatch ? "text-destructive" : "text-emerald-500"}`}>
                  {pwMismatch
                    ? <><AlertCircle className="size-3" /> {t("password.mismatch")}</>
                    : <><CheckCircle className="size-3" /> {t("password.match")}</>
                  }
                </p>
              )}
            </div>

            {/* #5 에러 — 서버 응답 에러 인라인 표시 */}
            {pwStatus === "error" && pwError && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="size-4 shrink-0" />
                {pwError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              {pwStatus === "saved" && (
                <span className="flex items-center gap-1 text-sm text-emerald-500">
                  <CheckCircle className="size-4" /> {t("passwordChanged")}
                </span>
              )}
              <Button
                onClick={handleChangePassword}
                disabled={
                  pwStatus === "saving" ||
                  !currentPassword ||
                  !newPassword ||
                  !confirmPassword ||
                  pwMismatch
                }
                variant="outline"
              >
                {pwStatus === "saving" && <Loader2 className="size-4 animate-spin mr-2" />}
                {pwStatus === "saving" ? t("changingPassword") : t("passwordChange")}
              </Button>
            </div>
          </div>
        </div>

        {/* ── #10 위험 영역 (계정 삭제) ──────────────────────────────────────── */}
        <div className="rounded-xl border border-destructive/40 bg-card overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-destructive/40">
            <div className="size-8 rounded-lg bg-red-100 dark:bg-red-950/60 flex items-center justify-center shrink-0">
              <ShieldAlert className="size-4 text-destructive" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-destructive">{t("dangerZone.title")}</h2>
            </div>
          </div>
          <div className="px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">{t("dangerZone.deleteAccount")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("dangerZone.deleteAccountDescription")}
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="shrink-0">
                    {t("dangerZone.deleteAccount")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("dangerZone.deleteConfirmTitle")}</AlertDialogTitle>
                    <AlertDialogDescription className="space-y-3">
                      <span className="block">
                        {t("dangerZone.deleteConfirmBody")}
                      </span>
                      <span className="block">
                        {t("dangerZone.deleteConfirmEmailPrompt")}
                      </span>
                      <Input
                        placeholder={profile.email || t("dangerZone.emailPlaceholder")}
                        value={deleteEmail}
                        onChange={(e) => setDeleteEmail(e.target.value)}
                        className="mt-2"
                      />
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setDeleteEmail("")}>{t("dangerZone.cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={deleteEmail !== profile.email || deleteLoading}
                      onClick={handleDeleteAccount}
                    >
                      {deleteLoading && <Loader2 className="size-4 animate-spin mr-2" />}
                      {t("dangerZone.deleteConfirm")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
