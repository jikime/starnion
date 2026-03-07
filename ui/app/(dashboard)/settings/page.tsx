"use client"

import { useTranslations } from "next-intl"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Bell, Settings, User } from "lucide-react"

export default function SettingsPage() {
  const t = useTranslations("settings")

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
            <Card>
              <CardHeader>
                <CardTitle>{t("accountSettings")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name">{t("name")}</Label>
                  <Input id="name" defaultValue="사용자" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{t("email")}</Label>
                  <Input id="email" type="email" defaultValue="user@example.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">{t("timezone")}</Label>
                  <Input id="timezone" defaultValue="Asia/Seoul" disabled />
                </div>
                <div className="flex justify-end">
                  <Button>{t("save")}</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
