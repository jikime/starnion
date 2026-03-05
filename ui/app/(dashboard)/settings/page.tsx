"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Bell, User } from "lucide-react"

export default function SettingsPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">설정</h1>
        <p className="text-muted-foreground">알림 및 계정 설정</p>
      </div>

      <Tabs defaultValue="notifications" className="space-y-6">
        <TabsList>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="size-4" />
            알림
          </TabsTrigger>
          <TabsTrigger value="account" className="gap-2">
            <User className="size-4" />
            계정
          </TabsTrigger>
        </TabsList>

        {/* ── Notifications ───────────────────────────────────────────────── */}
        <TabsContent value="notifications">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>알림 설정</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <p className="font-medium">예산 경고</p>
                    <div className="flex items-center gap-4 mt-2">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm text-muted-foreground">경고</Label>
                        <Input type="number" defaultValue={70} className="w-16 h-8" />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-sm text-muted-foreground">위험</Label>
                        <Input type="number" defaultValue={90} className="w-16 h-8" />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                    </div>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <p className="font-medium">일간 요약</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Label className="text-sm text-muted-foreground">시간</Label>
                      <Input type="time" defaultValue="20:00" className="w-28 h-8" />
                    </div>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <p className="font-medium">비활성 리마인더</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Input type="number" defaultValue={3} className="w-16 h-8" />
                      <span className="text-sm text-muted-foreground">일 후</span>
                    </div>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>

              <div className="space-y-3">
                <Label>알림 채널</Label>
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-2">
                    <Checkbox id="tg" defaultChecked />
                    <Label htmlFor="tg" className="font-normal">Telegram</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="web" defaultChecked />
                    <Label htmlFor="web" className="font-normal">웹 알림</Label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Account ─────────────────────────────────────────────────────── */}
        <TabsContent value="account">
          <div className="space-y-6">
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle>계정 설정</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name">이름</Label>
                  <Input id="name" defaultValue="사용자" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">이메일</Label>
                  <Input id="email" type="email" defaultValue="user@example.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">시간대</Label>
                  <Input id="timezone" defaultValue="Asia/Seoul" disabled />
                </div>
                <div className="flex justify-end">
                  <Button>저장</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
