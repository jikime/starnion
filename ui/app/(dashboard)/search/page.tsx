"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, ExternalLink, Globe } from "lucide-react"

const sampleResults = [
  {
    id: 1,
    title: "Next.js 16 새로운 기능",
    url: "https://nextjs.org/blog",
    snippet:
      "Next.js 16에서는 Turbopack이 기본 번들러로 채택되었으며, React Compiler 지원이 안정화되었습니다...",
  },
  {
    id: 2,
    title: "AI SDK 6.0 릴리즈 노트",
    url: "https://sdk.vercel.ai/docs",
    snippet:
      "AI SDK 6.0은 스트리밍 응답, 구조화된 데이터 생성, 도구 호출 등 다양한 AI 기능을 제공합니다...",
  },
  {
    id: 3,
    title: "shadcn/ui 최신 컴포넌트",
    url: "https://ui.shadcn.com",
    snippet:
      "shadcn/ui에 새롭게 추가된 컴포넌트들: button-group, empty, field, input-group, item, kbd, spinner...",
  },
]

export default function SearchPage() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState(sampleResults)

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    // TODO: Implement actual search
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">웹검색</h1>
        <p className="text-muted-foreground">웹에서 정보를 검색하세요</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="검색어를 입력하세요..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="submit">검색</Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {results.map((result) => (
          <Card key={result.id}>
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Globe className="mt-1 size-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary hover:underline flex items-center gap-1"
                  >
                    {result.title}
                    <ExternalLink className="size-3" />
                  </a>
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    {result.url}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {result.snippet}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
