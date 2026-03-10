"use client"

import dynamic from "next/dynamic"

// SSR 비활성화로 Radix UI DropdownMenu의 ID hydration 불일치 방지
const AppHeader = dynamic(
  () => import("@/components/app-header").then((m) => m.AppHeader),
  { ssr: false }
)

export function AppHeaderClient() {
  return <AppHeader />
}
