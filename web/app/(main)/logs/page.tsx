"use client"

import { useTranslations } from "next-intl"
import { ScrollText, Terminal } from "lucide-react"
import { LogPanel } from "@/components/logs/log-panel"

export default function LogsPage() {
  const tl = useTranslations("logs")

  return (
    <div className="flex h-full flex-col gap-0 w-full">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg border bg-muted/50">
            <Terminal className="size-4 text-muted-foreground" />
          </div>
          <div>
            <h1 className="flex items-center gap-2 text-base font-semibold">
              <ScrollText className="size-5 text-primary" />
              Logs
            </h1>
            <p className="text-sm text-muted-foreground">{tl("subtitle")}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex min-h-0 flex-1 flex-col p-5">
        <LogPanel key="unified" apiPath="/api/logs/app" streamPath="/api/logs/gateway/stream" useSSE />
      </div>
    </div>
  )
}
