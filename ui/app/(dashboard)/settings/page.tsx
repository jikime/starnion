"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Cog, Sparkles, Bell, User, Link, Loader2 } from "lucide-react"

const skillCategories = {
  FINANCE: [
    { id: "finance", name: "가계부", active: true },
    { id: "budget", name: "예산관리", active: true },
    { id: "currency", name: "환율", active: true },
  ],
  PRODUCTIVITY: [
    { id: "goals", name: "목표관리", active: true },
    { id: "schedule", name: "일정", active: true },
    { id: "reminder", name: "알림", active: true },
  ],
  MEDIA: [
    { id: "documents", name: "문서", active: true },
    { id: "image", name: "이미지", active: true },
    { id: "audio", name: "오디오", active: true },
    { id: "video", name: "비디오", active: false, optIn: true },
  ],
  INTEGRATION: [
    { id: "google", name: "구글", active: false },
  ],
  SYSTEM: [
    { id: "memory", name: "메모리압축", active: true, locked: true },
  ],
}

const personas = [
  { id: "jiki", name: "지키 (기본)", description: "친근하고 실용적인 AI 비서" },
  { id: "buddy", name: "버디", description: "캐주얼하고 유머러스한 친구 스타일" },
  { id: "assistant", name: "어시스턴트", description: "전문적이고 격식체 비서" },
]

export default function SettingsPage() {
  const { update } = useSession()
  const [linkCode, setLinkCode] = useState("")
  const [linking, setLinking] = useState(false)
  const [linkError, setLinkError] = useState("")
  const [linkSuccess, setLinkSuccess] = useState(false)

  const handleLink = async () => {
    const code = linkCode.trim()
    if (!code) return

    setLinking(true)
    setLinkError("")
    setLinkSuccess(false)

    try {
      const res = await fetch("/api/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setLinkError(data.error ?? "계정 연결에 실패했어요")
        return
      }

      // Refresh session JWT with the new canonical userId.
      await update({ userId: data.userId })
      setLinkSuccess(true)
      setLinkCode("")
    } catch {
      setLinkError("오류가 발생했어요. 잠시 후 다시 시도해 주세요.")
    } finally {
      setLinking(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">설정</h1>
        <p className="text-muted-foreground">스킬, 페르소나, 알림 설정</p>
      </div>

      <Tabs defaultValue="skills" className="space-y-6">
        <TabsList>
          <TabsTrigger value="skills" className="gap-2">
            <Cog className="size-4" />
            스킬 관리
          </TabsTrigger>
          <TabsTrigger value="persona" className="gap-2">
            <Sparkles className="size-4" />
            페르소나
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="size-4" />
            알림
          </TabsTrigger>
          <TabsTrigger value="account" className="gap-2">
            <User className="size-4" />
            계정
          </TabsTrigger>
        </TabsList>

        <TabsContent value="skills">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>스킬 관리</CardTitle>
              <Badge variant="secondary">활성: 28/33</Badge>
            </CardHeader>
            <CardContent className="space-y-8">
              {Object.entries(skillCategories).map(([category, skills]) => (
                <div key={category}>
                  <h4 className="font-medium mb-4">{category}</h4>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {skills.map((skill) => (
                      <div
                        key={skill.id}
                        className="flex items-center justify-between rounded-lg border border-border p-3"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{skill.name}</span>
                          {skill.optIn && (
                            <Badge variant="outline" className="text-xs">
                              opt-in
                            </Badge>
                          )}
                          {skill.locked && (
                            <Badge variant="secondary" className="text-xs">
                              필수
                            </Badge>
                          )}
                        </div>
                        <Switch
                          checked={skill.active}
                          disabled={skill.locked}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="persona">
          <Card>
            <CardHeader>
              <CardTitle>페르소나 설정</CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup defaultValue="jiki" className="space-y-4">
                {personas.map((persona) => (
                  <div
                    key={persona.id}
                    className="flex items-start gap-4 rounded-lg border border-border p-4"
                  >
                    <RadioGroupItem
                      value={persona.id}
                      id={persona.id}
                      className="mt-1"
                    />
                    <div>
                      <Label htmlFor={persona.id} className="font-medium">
                        {persona.name}
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {persona.description}
                      </p>
                    </div>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
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
                        <Label className="text-sm text-muted-foreground">
                          경고
                        </Label>
                        <Input
                          type="number"
                          defaultValue={70}
                          className="w-16 h-8"
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-sm text-muted-foreground">
                          위험
                        </Label>
                        <Input
                          type="number"
                          defaultValue={90}
                          className="w-16 h-8"
                        />
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
                      <Label className="text-sm text-muted-foreground">
                        시간
                      </Label>
                      <Input type="time" defaultValue="20:00" className="w-28 h-8" />
                    </div>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <p className="font-medium">비활성 리마인더</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Input
                        type="number"
                        defaultValue={3}
                        className="w-16 h-8"
                      />
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
                    <Label htmlFor="tg" className="font-normal">
                      Telegram
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="web" defaultChecked />
                    <Label htmlFor="web" className="font-normal">
                      웹 알림
                    </Label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="account">
          <div className="space-y-6">
            <Card>
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

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Link className="size-4" />
                  계정 연결
                </CardTitle>
                <CardDescription>
                  텔레그램에서 <code className="bg-muted px-1 rounded text-xs">/link</code> 명령어를 입력해 코드를 받아 입력하세요.
                  연결 후 텔레그램과 웹에서 동일한 데이터를 사용할 수 있어요.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {linkSuccess ? (
                  <Alert className="border-green-500">
                    <AlertDescription className="text-green-600">
                      계정이 연결되었어요! 이제 텔레그램과 웹에서 동일한 데이터를 사용해요.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    {linkError && (
                      <Alert variant="destructive">
                        <AlertDescription>{linkError}</AlertDescription>
                      </Alert>
                    )}
                    <div className="flex gap-2">
                      <Input
                        placeholder="JIKI-XXXXXX"
                        value={linkCode}
                        onChange={(e) => setLinkCode(e.target.value.toUpperCase())}
                        onKeyDown={(e) => e.key === "Enter" && handleLink()}
                        maxLength={11}
                        className="font-mono"
                      />
                      <Button onClick={handleLink} disabled={linking || !linkCode.trim()}>
                        {linking && <Loader2 className="mr-2 size-4 animate-spin" />}
                        연결하기
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
