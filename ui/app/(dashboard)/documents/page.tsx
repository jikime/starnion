"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Plus, Download, Eye, Upload, FileText } from "lucide-react"

const documents = [
  {
    id: 1,
    name: "3월_지출_보고서.pdf",
    format: "PDF",
    size: "245KB",
    date: "2026-03-02",
  },
  {
    id: 2,
    name: "2월_목표_현황.docx",
    format: "DOCX",
    size: "89KB",
    date: "2026-03-01",
  },
  {
    id: 3,
    name: "가계부_데이터.xlsx",
    format: "XLSX",
    size: "156KB",
    date: "2026-02-28",
  },
  {
    id: 4,
    name: "발표자료.pptx",
    format: "PPTX",
    size: "2.1MB",
    date: "2026-02-25",
  },
]

const formats = ["PDF", "DOCX", "XLSX", "PPTX", "MD", "TXT"]

export default function DocumentsPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">문서</h1>
          <p className="text-muted-foreground">문서 관리 및 생성</p>
        </div>
        <Button className="gap-2">
          <Plus className="size-4" />
          문서 생성
        </Button>
      </div>

      <Tabs defaultValue="documents" className="space-y-6">
        <TabsList>
          <TabsTrigger value="documents">내 문서</TabsTrigger>
          <TabsTrigger value="create">문서 생성</TabsTrigger>
          <TabsTrigger value="upload">문서 업로드</TabsTrigger>
        </TabsList>

        <TabsContent value="documents">
          <Card>
            <CardHeader>
              <CardTitle>내 문서</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>파일명</TableHead>
                    <TableHead>형식</TableHead>
                    <TableHead>크기</TableHead>
                    <TableHead>날짜</TableHead>
                    <TableHead className="text-right">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="size-4 text-primary" />
                          <span className="font-medium">{doc.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{doc.format}</TableCell>
                      <TableCell>{doc.size}</TableCell>
                      <TableCell>{doc.date}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="sm">
                            <Download className="size-4" />
                            <span className="sr-only">다운로드</span>
                          </Button>
                          <Button variant="ghost" size="sm">
                            <Eye className="size-4" />
                            <span className="sr-only">보기</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="create">
          <Card>
            <CardHeader>
              <CardTitle>문서 생성</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>형식</Label>
                <RadioGroup defaultValue="PDF" className="flex flex-wrap gap-4">
                  {formats.map((format) => (
                    <div key={format} className="flex items-center gap-2">
                      <RadioGroupItem value={format} id={format} />
                      <Label htmlFor={format}>{format}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="docTitle">제목</Label>
                <Input id="docTitle" placeholder="이번달 지출 보고서" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="docContent">내용 (자연어로 요청)</Label>
                <Textarea
                  id="docContent"
                  placeholder="이번달 지출 내역을 카테고리별로 정리하고, 예산 대비 현황 차트를 포함한 PDF 보고서를 만들어줘"
                  className="min-h-[120px]"
                />
              </div>

              <Button className="w-full">생성하기</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="upload">
          <Card>
            <CardHeader>
              <CardTitle>문서 업로드 (파싱)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
                <Upload className="mx-auto size-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">
                  파일을 이곳에 드래그하거나 클릭하여 업로드
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  지원 형식: PDF / DOCX / DOC / XLSX / XLS / PPTX / PPT / HWP /
                  MD / TXT / CSV
                </p>
                <Button variant="outline">파일 선택</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
