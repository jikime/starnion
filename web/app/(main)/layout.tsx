"use client"

import { useEffect, useState } from "react"
import { GlobalNav } from "@/components/global-nav"

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  if (!mounted) {
    return (
      <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
        <div className="h-11 border-b border-border bg-card/80 shrink-0" />
        <div className="flex flex-1 overflow-hidden" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <GlobalNav />
      <div className="flex flex-1 overflow-hidden min-h-0">
        {children}
      </div>
    </div>
  )
}
