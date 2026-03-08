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
import { Bell, Settings, User, Loader2, CheckCircle, AlertCircle } from "lucide-react"

interface Profile {
  name: string
  email: string
}

type SaveStatus = "idle" | "saving" | "saved" | "error"

export default function SettingsPage() {
  const t = useTranslations("settings")

  // ── Account state ──────────────────────────────────────────────────────────
  const [profile, setProfile] = useState<Profile>({ name: "", email: "" })
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
          setProfile({ name: data.name ?? "", email: data.email ?? "" })
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
        body: JSON.stringify({ name: profile.name }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "저장에 실패했어요.")
      }
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 2500)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "저장에 실패했어요.")
      setSaveStatus("error")
    }
  }

  async function handleChangePassword() {
    if (newPassword !== confirmPassword) {
      setPwError("새 비밀번호가 일치하지 않아요.")
      setPwStatus("error")
      return
    }
    if (newPassword.length < 8) {
      setPwError("비밀번호는 8자 이상이어야 해요.")
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
        throw new Error(data.error ?? "비밀번호 변경에 실패했어요.")
      }
      setPwStatus("saved")
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setTimeout(() => setPwStatus("idle"), 2500)
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "비밀번호 변경에 실패했어요.")
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
                    <span className="text-sm">불러오는 중...</span>
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
                      <p className="text-xs text-muted-foreground">이메일은 변경할 수 없어요.</p>
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
                          <CheckCircle className="size-4" /> 저장됐어요
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

            {/* Password change */}
            <Card>
              <CardHeader>
                <CardTitle>비밀번호 변경</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current-pw">현재 비밀번호</Label>
                  <Input
                    id="current-pw"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-pw">새 비밀번호</Label>
                  <Input
                    id="new-pw"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-pw">새 비밀번호 확인</Label>
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
                      <CheckCircle className="size-4" /> 변경됐어요
                    </span>
                  )}
                  <Button
                    onClick={handleChangePassword}
                    disabled={pwStatus === "saving" || !currentPassword || !newPassword || !confirmPassword}
                    variant="outline"
                  >
                    {pwStatus === "saving" && <Loader2 className="size-4 animate-spin mr-2" />}
                    비밀번호 변경
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
