"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Cloud,
  Sun,
  CloudRain,
  Wind,
  Droplets,
  Thermometer,
  Search,
} from "lucide-react"

const forecast = [
  { day: "오늘", icon: Sun, temp: "12°", desc: "맑음" },
  { day: "내일", icon: Cloud, temp: "10°", desc: "구름 많음" },
  { day: "수", icon: CloudRain, temp: "8°", desc: "비" },
  { day: "목", icon: Sun, temp: "14°", desc: "맑음" },
  { day: "금", icon: Sun, temp: "15°", desc: "맑음" },
]

export default function WeatherPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">날씨</h1>
        <p className="text-muted-foreground">현재 날씨와 예보</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="도시 검색..."
          className="pl-9"
          defaultValue="서울"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card>
          <CardHeader>
            <CardTitle>서울</CardTitle>
            <p className="text-sm text-muted-foreground">
              2026년 3월 3일 월요일
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-4">
                <Sun className="size-24 text-yellow-500" />
                <div>
                  <p className="text-6xl font-light">12°</p>
                  <p className="text-muted-foreground">맑음</p>
                </div>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <Thermometer className="size-4 text-muted-foreground" />
                  <span>체감온도: 10°</span>
                </div>
                <div className="flex items-center gap-2">
                  <Droplets className="size-4 text-muted-foreground" />
                  <span>습도: 45%</span>
                </div>
                <div className="flex items-center gap-2">
                  <Wind className="size-4 text-muted-foreground" />
                  <span>바람: 3.2 m/s</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">5일 예보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {forecast.map((day) => (
              <div
                key={day.day}
                className="flex items-center justify-between"
              >
                <span className="w-12 text-sm font-medium">{day.day}</span>
                <day.icon className="size-5 text-muted-foreground" />
                <span className="w-12 text-sm text-right">{day.temp}</span>
                <span className="w-20 text-sm text-muted-foreground text-right">
                  {day.desc}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Thermometer className="size-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">최고/최저</p>
                <p className="font-semibold">14° / 5°</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
                <CloudRain className="size-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">강수확률</p>
                <p className="font-semibold">0%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Sun className="size-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">자외선</p>
                <p className="font-semibold">보통 (5)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Cloud className="size-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">미세먼지</p>
                <p className="font-semibold">좋음</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
