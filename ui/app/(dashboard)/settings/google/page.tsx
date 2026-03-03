"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Calendar,
  FileText,
  CheckSquare,
  Mail,
  HardDrive,
  ExternalLink,
  Link2Off,
} from "lucide-react"

const googleServices = [
  {
    id: "calendar",
    name: "Google Calendar",
    icon: Calendar,
    active: false,
    description: "일정 조회/생성",
  },
  {
    id: "docs",
    name: "Google Docs & Drive",
    icon: FileText,
    active: false,
    description: "문서 생성/읽기, 파일 업로드",
  },
  {
    id: "tasks",
    name: "Google Tasks",
    icon: CheckSquare,
    active: false,
    description: "할일 관리",
  },
  {
    id: "gmail",
    name: "Gmail",
    icon: Mail,
    active: false,
    description: "이메일 조회/발송",
  },
]

export default function GoogleSettingsPage() {
  const isConnected = false

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">구글 연동</h1>
        <p className="text-muted-foreground">
          Google 서비스와 연동하여 더 많은 기능을 사용하세요
        </p>
      </div>

      {!isConnected ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mx-auto mb-6 size-16 rounded-full bg-muted flex items-center justify-center">
              <HardDrive className="size-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">구글 계정 연동</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              구글 계정을 연동하면 캘린더 일정 조회/생성, Google Docs 생성/읽기,
              Gmail 조회/발송, Tasks 관리, Drive 파일 업로드 기능을 사용할 수 있어요.
            </p>
            <ul className="text-left max-w-sm mx-auto mb-8 space-y-2">
              {googleServices.map((service) => (
                <li key={service.id} className="flex items-center gap-2 text-sm">
                  <service.icon className="size-4 text-primary" />
                  <span>{service.description}</span>
                </li>
              ))}
            </ul>
            <Button size="lg" className="gap-2">
              <ExternalLink className="size-4" />
              구글 계정 연동하기
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>연동 상태</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  hong@gmail.com
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge className="bg-success text-success-foreground">
                  연결됨
                </Badge>
                <Button variant="outline" size="sm" className="gap-2">
                  <Link2Off className="size-4" />
                  연동 해제
                </Button>
              </div>
            </CardHeader>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {googleServices.map((service) => (
              <Card key={service.id}>
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center">
                    <div className="mb-3 size-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <service.icon className="size-6 text-primary" />
                    </div>
                    <h4 className="font-medium">{service.name}</h4>
                    <Badge variant="default" className="mt-2">
                      활성
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">최근 캘린더 이벤트</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span>2026-03-04 09:00</span>
                  <span>팀 미팅</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>2026-03-05 14:00</span>
                  <span>치과 예약</span>
                </div>
                <Button variant="outline" size="sm" className="w-full gap-2">
                  <ExternalLink className="size-4" />
                  Google 캘린더 열기
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">최근 이메일</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  받은 메일함 5개 미읽음
                </p>
                <Button variant="outline" size="sm" className="w-full gap-2">
                  <ExternalLink className="size-4" />
                  Gmail에서 열기
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">권한 스코프</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Calendar (읽기/쓰기)</Badge>
                <Badge variant="secondary">Drive (읽기/쓰기)</Badge>
                <Badge variant="secondary">Docs (읽기/쓰기)</Badge>
                <Badge variant="secondary">Gmail (읽기/전송)</Badge>
                <Badge variant="secondary">Tasks (읽기/쓰기)</Badge>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
