"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Mic, Upload, FileAudio, Play, Download } from "lucide-react"

const audioFiles = [
  { id: 1, name: "회의 녹음 2026-03-03.mp3", duration: "15:32", date: "2026-03-03" },
  { id: 2, name: "메모 2026-03-02.m4a", duration: "02:45", date: "2026-03-02" },
  { id: 3, name: "인터뷰.mp3", duration: "45:10", date: "2026-02-28" },
]

export default function AudioPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">오디오</h1>
        <p className="text-muted-foreground">음성 녹음 및 텍스트 변환</p>
      </div>

      <Tabs defaultValue="record" className="space-y-6">
        <TabsList>
          <TabsTrigger value="record" className="gap-2">
            <Mic className="size-4" />
            녹음
          </TabsTrigger>
          <TabsTrigger value="transcribe" className="gap-2">
            <FileAudio className="size-4" />
            텍스트 변환
          </TabsTrigger>
          <TabsTrigger value="files" className="gap-2">
            <Upload className="size-4" />
            파일 목록
          </TabsTrigger>
        </TabsList>

        <TabsContent value="record">
          <Card>
            <CardHeader>
              <CardTitle>음성 녹음</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center py-12">
              <div className="size-32 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                <Mic className="size-16 text-primary" />
              </div>
              <p className="text-muted-foreground mb-6">
                녹음 버튼을 눌러 시작하세요
              </p>
              <div className="flex gap-4">
                <Button size="lg" className="gap-2">
                  <Mic className="size-5" />
                  녹음 시작
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transcribe">
          <Card>
            <CardHeader>
              <CardTitle>텍스트 변환 (STT)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                <Upload className="mx-auto size-12 text-muted-foreground mb-4" />
                <h3 className="font-medium mb-2">오디오 파일 업로드</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  MP3, M4A, WAV, OGG 지원
                </p>
                <Button variant="outline">파일 선택</Button>
              </div>

              <div className="rounded-lg border border-border p-4">
                <h4 className="font-medium mb-2">변환 결과</h4>
                <p className="text-sm text-muted-foreground">
                  오디오 파일을 업로드하면 텍스트로 변환된 결과가 여기에 표시됩니다.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="files">
          <Card>
            <CardHeader>
              <CardTitle>오디오 파일</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {audioFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between rounded-lg border border-border p-4"
                >
                  <div className="flex items-center gap-3">
                    <FileAudio className="size-5 text-primary" />
                    <div>
                      <p className="font-medium">{file.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {file.duration} | {file.date}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm">
                      <Play className="size-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Download className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
