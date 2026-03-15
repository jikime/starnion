"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Settings, Loader2, CheckCircle, AlertCircle, UserCircle, KeyRound } from "lucide-react"

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

export default function SettingsPage() {
  const t = useTranslations("settings")

  // ── Account state ──────────────────────────────────────────────────────────
  const [profile, setProfile] = useState<Profile>({ name: "", email: "", language: "ko", timezone: "Asia/Seoul" })
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")
  const [saveError, setSaveError] = useState("")

  // Password change
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [pwStatus, setPwStatus] = useState<SaveStatus>("idle")
  const [pwError, setPwError] = useState("")

  useEffect(() => {
    fetch("/api/settings/account")
      .then((r) => r.json())
      .then((data) => {
        if (data.name !== undefined) {
          setProfile({ name: data.name ?? "", email: data.email ?? "", language: data.language ?? "ko", timezone: data.timezone ?? "Asia/Seoul" })
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleSaveProfile() {
    setSaveStatus("saving")
    setSaveError("")
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
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 2500)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t("saveFailed"))
      setSaveStatus("error")
    }
  }

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
      setTimeout(() => setPwStatus("idle"), 2500)
    } catch (err) {
      setPwError(err instanceof Error ? err.message : t("passwordChangeFailed"))
      setPwStatus("error")
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
        {/* Profile info */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
            <div className="size-8 rounded-lg bg-blue-100 dark:bg-blue-950/60 flex items-center justify-center shrink-0">
              <UserCircle className="size-4 text-blue-500" />
            </div>
            <h2 className="text-sm font-semibold">{t("accountSettings")}</h2>
          </div>
          <div className="px-6 py-5 space-y-6">
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-4">
                <Loader2 className="size-4 animate-spin" />
                <span className="text-sm">{t("loading")}</span>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="name">{t("name")}</Label>
                  <Input
                    id="name"
                    value={profile.name}
                    onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{t("email")}</Label>
                  <Input id="email" type="email" value={profile.email} disabled />
                  <p className="text-xs text-muted-foreground">{t("emailReadOnly")}</p>
                </div>
                <div className="space-y-2">
                  <Label>{t("aiLanguage")}</Label>
                  <p className="text-xs text-muted-foreground">{t("aiLanguageDescription")}</p>
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
                <div className="space-y-2">
                  <Label>{t("timezone")}</Label>
                  <p className="text-xs text-muted-foreground">{t("timezoneDescription")}</p>
                  <Select
                    value={profile.timezone}
                    onValueChange={(value) => setProfile((p) => ({ ...p, timezone: value }))}
                  >
                    <SelectTrigger className="w-72">
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
                {saveStatus === "error" && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="size-4" />
                    {saveError}
                  </div>
                )}
                <div className="flex items-center justify-end gap-3">
                  {saveStatus === "saved" && (
                    <span className="flex items-center gap-1 text-sm text-emerald-500">
                      <CheckCircle className="size-4" /> {t("saved")}
                    </span>
                  )}
                  <Button onClick={handleSaveProfile} disabled={saveStatus === "saving"}>
                    {saveStatus === "saving" && <Loader2 className="size-4 animate-spin mr-2" />}
                    {t("save")}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Password change */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
            <div className="size-8 rounded-lg bg-amber-100 dark:bg-amber-950/60 flex items-center justify-center shrink-0">
              <KeyRound className="size-4 text-amber-500" />
            </div>
            <h2 className="text-sm font-semibold">{t("passwordChange")}</h2>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-pw">{t("currentPassword")}</Label>
              <Input
                id="current-pw"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-pw">{t("newPassword")}</Label>
              <Input
                id="new-pw"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-pw">{t("confirmPassword")}</Label>
              <Input
                id="confirm-pw"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            {pwStatus === "error" && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="size-4" />
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
                disabled={pwStatus === "saving" || !currentPassword || !newPassword || !confirmPassword}
                variant="outline"
              >
                {pwStatus === "saving" && <Loader2 className="size-4 animate-spin mr-2" />}
                {t("passwordChange")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
