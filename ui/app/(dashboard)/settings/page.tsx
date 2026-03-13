"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Bell, Settings, User, Loader2, CheckCircle, AlertCircle } from "lucide-react"

interface Profile {
  name: string
  email: string
  language: string
}

type SaveStatus = "idle" | "saving" | "saved" | "error"

export default function SettingsPage() {
  const t = useTranslations("settings")

  // ── Account state ──────────────────────────────────────────────────────────
  const [profile, setProfile] = useState<Profile>({ name: "", email: "", language: "ko" })
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
          setProfile({ name: data.name ?? "", email: data.email ?? "", language: data.language ?? "ko" })
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
        body: JSON.stringify({ name: profile.name, language: profile.language }),
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

      <Tabs defaultValue="notifications" className="space-y-6">
        <TabsList>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="size-4" />
            {t("notifications")}
          </TabsTrigger>
          <TabsTrigger value="account" className="gap-2">
            <User className="size-4" />
            {t("account")}
          </TabsTrigger>
        </TabsList>

        {/* ── Notifications ───────────────────────────────────────────────── */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>{t("notifications")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <p className="font-medium">{t("budgetAlert")}</p>
                    <div className="flex items-center gap-4 mt-2">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm text-muted-foreground">{t("warning")}</Label>
                        <Input type="number" defaultValue={70} className="w-16 h-8" />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-sm text-muted-foreground">{t("danger")}</Label>
                        <Input type="number" defaultValue={90} className="w-16 h-8" />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                    </div>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <p className="font-medium">{t("dailySummary")}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Label className="text-sm text-muted-foreground">{t("time")}</Label>
                      <Input type="time" defaultValue="20:00" className="w-28 h-8" />
                    </div>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <p className="font-medium">{t("inactiveReminder")}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Input type="number" defaultValue={3} className="w-16 h-8" />
                      <span className="text-sm text-muted-foreground">{t("daysLater")}</span>
                    </div>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>

              <div className="space-y-3">
                <Label>{t("channels")}</Label>
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-2">
                    <Checkbox id="tg" defaultChecked />
                    <Label htmlFor="tg" className="font-normal">Telegram</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="web" defaultChecked />
                    <Label htmlFor="web" className="font-normal">{t("webNotification")}</Label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Account ─────────────────────────────────────────────────────── */}
        <TabsContent value="account">
          <div className="space-y-6">
            {/* Profile info */}
            <Card>
              <CardHeader>
                <CardTitle>{t("accountSettings")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
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
                      <Button
                        onClick={handleSaveProfile}
                        disabled={saveStatus === "saving"}
                      >
                        {saveStatus === "saving" && <Loader2 className="size-4 animate-spin mr-2" />}
                        {t("save")}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* AI language selector */}
            <Card>
              <CardHeader>
                <CardTitle>{t("aiLanguage")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">{t("aiLanguageDescription")}</p>
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
              </CardContent>
            </Card>

            {/* Password change */}
            <Card>
              <CardHeader>
                <CardTitle>{t("passwordChange")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
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
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
