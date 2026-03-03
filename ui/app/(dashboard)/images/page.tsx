"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Wand2, Edit, Scan, Images, Upload, Download } from "lucide-react"

const aspectRatios = ["1:1", "3:4", "4:3", "9:16", "16:9"]

const galleryImages = [
  { id: 1, src: "/placeholder.svg?height=200&width=200", date: "2026-03-03" },
  { id: 2, src: "/placeholder.svg?height=200&width=200", date: "2026-03-02" },
  { id: 3, src: "/placeholder.svg?height=200&width=200", date: "2026-03-01" },
  { id: 4, src: "/placeholder.svg?height=200&width=200", date: "2026-02-28" },
]

export default function ImagesPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">이미지</h1>
        <p className="text-muted-foreground">
          AI 이미지 생성, 편집 및 분석
        </p>
      </div>

      <Tabs defaultValue="generate" className="space-y-6">
        <TabsList>
          <TabsTrigger value="generate" className="gap-2">
            <Wand2 className="size-4" />
            이미지 생성
          </TabsTrigger>
          <TabsTrigger value="edit" className="gap-2">
            <Edit className="size-4" />
            이미지 편집
          </TabsTrigger>
          <TabsTrigger value="analyze" className="gap-2">
            <Scan className="size-4" />
            이미지 분석
          </TabsTrigger>
          <TabsTrigger value="gallery" className="gap-2">
            <Images className="size-4" />
            갤러리
          </TabsTrigger>
        </TabsList>

        <TabsContent value="generate">
          <Card>
            <CardHeader>
              <CardTitle>이미지 생성</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="prompt">프롬프트</Label>
                <Textarea
                  id="prompt"
                  placeholder="귀여운 고양이가 창가에 앉아있는 수채화 스타일 그림"
                  className="min-h-[100px]"
                />
              </div>

              <div className="space-y-2">
                <Label>비율</Label>
                <RadioGroup defaultValue="1:1" className="flex flex-wrap gap-4">
                  {aspectRatios.map((ratio) => (
                    <div key={ratio} className="flex items-center gap-2">
                      <RadioGroupItem value={ratio} id={`ratio-${ratio}`} />
                      <Label htmlFor={`ratio-${ratio}`}>{ratio}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label>모델</Label>
                <p className="text-sm text-muted-foreground">
                  gemini-3.1-flash-image-preview
                </p>
              </div>

              <Button className="w-full gap-2">
                <Wand2 className="size-4" />
                생성하기
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="edit">
          <Card>
            <CardHeader>
              <CardTitle>이미지 편집</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                <Upload className="mx-auto size-12 text-muted-foreground mb-4" />
                <h3 className="font-medium mb-2">이미지 업로드</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  드래그앤드롭 또는 클릭
                </p>
                <Button variant="outline">파일 선택</Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="editPrompt">편집 요청</Label>
                <Textarea
                  id="editPrompt"
                  placeholder="배경을 파란 하늘로 바꿔줘"
                  className="min-h-[80px]"
                />
                <p className="text-xs text-muted-foreground">
                  예시: 배경 변경 / 스타일 변환 / 객체 추가 또는 제거
                </p>
              </div>

              <Button className="w-full gap-2">
                <Edit className="size-4" />
                편집하기
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analyze">
          <Card>
            <CardHeader>
              <CardTitle>이미지 분석</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                  <Upload className="mx-auto size-12 text-muted-foreground mb-4" />
                  <h3 className="font-medium mb-2">이미지 업로드</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    영수증, 사진, 스크린샷 등
                  </p>
                  <Button variant="outline">파일 선택</Button>
                </div>

                <div className="rounded-lg border border-border p-6">
                  <h4 className="font-medium mb-4">AI 분석 결과</h4>
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <p>이미지를 업로드하면 AI가 분석 결과를 표시합니다.</p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li>영수증: 품목, 금액 자동 추출</li>
                      <li>사진: 내용 설명, 텍스트 인식</li>
                      <li>스크린샷: 정보 요약</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gallery">
          <Card>
            <CardHeader>
              <CardTitle>갤러리</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {galleryImages.map((image) => (
                  <div key={image.id} className="group relative">
                    <div className="aspect-square rounded-lg overflow-hidden bg-muted">
                      <img
                        src={image.src}
                        alt={`Gallery image ${image.id}`}
                        className="size-full object-cover"
                      />
                    </div>
                    <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                      <Button variant="secondary" size="sm">
                        <Download className="size-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 text-center">
                      {image.date}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
