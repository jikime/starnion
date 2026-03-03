"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

const tools = [
  { id: "calculator", name: "계산기", icon: "🧮" },
  { id: "currency", name: "환율", icon: "💱" },
  { id: "unit", name: "단위변환", icon: "📐" },
  { id: "translate", name: "번역", icon: "🌐" },
  { id: "timezone", name: "시간", icon: "🕐" },
  { id: "qrcode", name: "QR코드", icon: "🔲" },
  { id: "summarize", name: "요약", icon: "📝" },
  { id: "charcount", name: "글자수", icon: "✏️" },
  { id: "encoding", name: "인코딩", icon: "🔐" },
  { id: "hash", name: "해시", icon: "🔑" },
  { id: "color", name: "색상", icon: "🎨" },
  { id: "ip", name: "IP조회", icon: "📡" },
  { id: "random", name: "랜덤", icon: "🎲" },
]

export default function UtilitiesPage() {
  const [selectedTool, setSelectedTool] = useState("currency")

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">유틸리티 도구</h1>
        <p className="text-muted-foreground">13개의 편리한 도구 모음</p>
      </div>

      <div className="grid gap-2 grid-cols-5 sm:grid-cols-7 lg:grid-cols-13">
        {tools.map((tool) => (
          <Button
            key={tool.id}
            variant={selectedTool === tool.id ? "default" : "outline"}
            className={cn(
              "flex-col h-auto py-3 gap-1",
              selectedTool === tool.id && "ring-2 ring-primary"
            )}
            onClick={() => setSelectedTool(tool.id)}
          >
            <span className="text-xl">{tool.icon}</span>
            <span className="text-xs">{tool.name}</span>
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {tools.find((t) => t.id === selectedTool)?.icon}{" "}
            {tools.find((t) => t.id === selectedTool)?.name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {selectedTool === "currency" && <CurrencyTool />}
          {selectedTool === "calculator" && <CalculatorTool />}
          {selectedTool === "unit" && <UnitTool />}
          {selectedTool === "charcount" && <CharCountTool />}
          {selectedTool === "qrcode" && <QRCodeTool />}
          {selectedTool === "color" && <ColorTool />}
          {selectedTool === "random" && <RandomTool />}
          {selectedTool === "translate" && <TranslateTool />}
          {selectedTool === "timezone" && <TimezoneTool />}
          {selectedTool === "summarize" && <SummarizeTool />}
          {selectedTool === "encoding" && <EncodingTool />}
          {selectedTool === "hash" && <HashTool />}
          {selectedTool === "ip" && <IPTool />}
        </CardContent>
      </Card>
    </div>
  )
}

function CurrencyTool() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="flex-1 space-y-2">
          <Label htmlFor="amount">금액</Label>
          <Input id="amount" type="number" defaultValue={100} />
        </div>
        <div className="space-y-2">
          <Label>통화</Label>
          <Select defaultValue="USD">
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="USD">USD 달러</SelectItem>
              <SelectItem value="EUR">EUR 유로</SelectItem>
              <SelectItem value="JPY">JPY 엔</SelectItem>
              <SelectItem value="CNY">CNY 위안</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <span className="mt-6">→</span>
        <div className="space-y-2">
          <Label>변환</Label>
          <Select defaultValue="KRW">
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="KRW">KRW 원</SelectItem>
              <SelectItem value="USD">USD 달러</SelectItem>
              <SelectItem value="EUR">EUR 유로</SelectItem>
              <SelectItem value="JPY">JPY 엔</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="rounded-lg bg-muted p-4">
        <p className="text-lg font-semibold">100 USD = 133,600 KRW</p>
        <p className="text-sm text-muted-foreground">기준: 2026-03-03</p>
      </div>
      <div className="flex gap-4 text-sm text-muted-foreground">
        <span>USD 1,336</span>
        <span>EUR 1,456</span>
        <span>JPY 8.92</span>
      </div>
    </div>
  )
}

function CalculatorTool() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="expression">수식</Label>
        <Input id="expression" placeholder="(100 + 50) * 2" />
      </div>
      <div className="rounded-lg bg-muted p-4">
        <p className="text-lg font-semibold">결과: 300</p>
      </div>
    </div>
  )
}

function UnitTool() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1 space-y-2">
          <Label htmlFor="unitValue">값</Label>
          <Input id="unitValue" type="number" defaultValue={100} />
        </div>
        <div className="space-y-2">
          <Label>단위</Label>
          <Select defaultValue="km">
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="km">km</SelectItem>
              <SelectItem value="mile">mile</SelectItem>
              <SelectItem value="m">m</SelectItem>
              <SelectItem value="ft">ft</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <span className="mt-6">→</span>
        <div className="space-y-2">
          <Label>변환</Label>
          <Select defaultValue="mile">
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="km">km</SelectItem>
              <SelectItem value="mile">mile</SelectItem>
              <SelectItem value="m">m</SelectItem>
              <SelectItem value="ft">ft</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="rounded-lg bg-muted p-4">
        <p className="text-lg font-semibold">100 km = 62.14 mile</p>
      </div>
    </div>
  )
}

function CharCountTool() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="text">텍스트</Label>
        <textarea
          id="text"
          className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="글자 수를 세고 싶은 텍스트를 입력하세요"
          defaultValue="안녕하세요, JIKI입니다!"
        />
      </div>
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg bg-muted p-3 text-center">
          <p className="text-2xl font-bold">14</p>
          <p className="text-xs text-muted-foreground">글자</p>
        </div>
        <div className="rounded-lg bg-muted p-3 text-center">
          <p className="text-2xl font-bold">2</p>
          <p className="text-xs text-muted-foreground">단어</p>
        </div>
        <div className="rounded-lg bg-muted p-3 text-center">
          <p className="text-2xl font-bold">1</p>
          <p className="text-xs text-muted-foreground">문장</p>
        </div>
        <div className="rounded-lg bg-muted p-3 text-center">
          <p className="text-2xl font-bold">32</p>
          <p className="text-xs text-muted-foreground">바이트</p>
        </div>
      </div>
    </div>
  )
}

function QRCodeTool() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="qrInput">URL 또는 텍스트</Label>
        <Input id="qrInput" placeholder="https://example.com" />
      </div>
      <div className="flex justify-center">
        <div className="size-48 bg-muted rounded-lg flex items-center justify-center">
          <span className="text-muted-foreground text-sm">QR 코드 미리보기</span>
        </div>
      </div>
      <Button className="w-full">다운로드</Button>
    </div>
  )
}

function ColorTool() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="hex">HEX</Label>
          <Input id="hex" defaultValue="#6d28d9" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rgb">RGB</Label>
          <Input id="rgb" defaultValue="109, 40, 217" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hsl">HSL</Label>
          <Input id="hsl" defaultValue="263, 70%, 50%" />
        </div>
      </div>
      <div
        className="h-20 rounded-lg"
        style={{ backgroundColor: "#6d28d9" }}
      />
    </div>
  )
}

function RandomTool() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>모드</Label>
        <Select defaultValue="number">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="number">숫자</SelectItem>
            <SelectItem value="dice">주사위</SelectItem>
            <SelectItem value="choice">선택</SelectItem>
            <SelectItem value="uuid">UUID</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-4">
        <div className="flex-1 space-y-2">
          <Label htmlFor="min">최소</Label>
          <Input id="min" type="number" defaultValue={1} />
        </div>
        <div className="flex-1 space-y-2">
          <Label htmlFor="max">최대</Label>
          <Input id="max" type="number" defaultValue={100} />
        </div>
      </div>
      <Button className="w-full">생성</Button>
      <div className="rounded-lg bg-muted p-4 text-center">
        <p className="text-3xl font-bold">42</p>
      </div>
    </div>
  )
}

function TranslateTool() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>원본 언어</Label>
          <Select defaultValue="ko">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ko">한국어</SelectItem>
              <SelectItem value="en">영어</SelectItem>
              <SelectItem value="ja">일본어</SelectItem>
              <SelectItem value="zh">중국어</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>번역 언어</Label>
          <Select defaultValue="en">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ko">한국어</SelectItem>
              <SelectItem value="en">영어</SelectItem>
              <SelectItem value="ja">일본어</SelectItem>
              <SelectItem value="zh">중국어</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>텍스트</Label>
        <textarea
          className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="번역할 텍스트"
          defaultValue="안녕하세요"
        />
      </div>
      <Button className="w-full">번역</Button>
      <div className="rounded-lg bg-muted p-4">
        <p>Hello</p>
      </div>
    </div>
  )
}

function TimezoneTool() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>도시</Label>
        <Select defaultValue="nyc">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nyc">뉴욕</SelectItem>
            <SelectItem value="london">런던</SelectItem>
            <SelectItem value="tokyo">도쿄</SelectItem>
            <SelectItem value="sydney">시드니</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-lg bg-muted p-4">
        <p className="text-2xl font-bold">03:15 AM</p>
        <p className="text-sm text-muted-foreground">2026년 3월 3일 (EST)</p>
      </div>
    </div>
  )
}

function SummarizeTool() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>URL 또는 텍스트</Label>
        <textarea
          className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="요약할 URL 또는 텍스트를 입력하세요"
        />
      </div>
      <Button className="w-full">요약하기</Button>
      <div className="rounded-lg bg-muted p-4">
        <p className="text-sm text-muted-foreground">AI 요약 결과가 여기에 표시됩니다.</p>
      </div>
    </div>
  )
}

function EncodingTool() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>방식</Label>
        <Select defaultValue="base64">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="base64">Base64</SelectItem>
            <SelectItem value="url">URL</SelectItem>
            <SelectItem value="html">HTML</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>텍스트</Label>
        <Input defaultValue="Hello, World!" />
      </div>
      <div className="flex gap-2">
        <Button className="flex-1">인코딩</Button>
        <Button variant="outline" className="flex-1">디코딩</Button>
      </div>
      <div className="rounded-lg bg-muted p-4">
        <p className="font-mono text-sm break-all">SGVsbG8sIFdvcmxkIQ==</p>
      </div>
    </div>
  )
}

function HashTool() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>알고리즘</Label>
        <Select defaultValue="sha256">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="md5">MD5</SelectItem>
            <SelectItem value="sha1">SHA-1</SelectItem>
            <SelectItem value="sha256">SHA-256</SelectItem>
            <SelectItem value="sha512">SHA-512</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>텍스트</Label>
        <Input defaultValue="password123" />
      </div>
      <Button className="w-full">해시 생성</Button>
      <div className="rounded-lg bg-muted p-4">
        <p className="font-mono text-xs break-all">
          ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f
        </p>
      </div>
    </div>
  )
}

function IPTool() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>IP 주소</Label>
        <Input placeholder="8.8.8.8" />
      </div>
      <Button className="w-full">조회</Button>
      <div className="rounded-lg bg-muted p-4 space-y-2">
        <div className="flex justify-between">
          <span className="text-muted-foreground">위치</span>
          <span>미국, 캘리포니아</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">ISP</span>
          <span>Google LLC</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">ASN</span>
          <span>AS15169</span>
        </div>
      </div>
    </div>
  )
}
