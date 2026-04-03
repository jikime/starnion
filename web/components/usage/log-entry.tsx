"use client"

import { memo, useState } from "react"
import { useTranslations } from "next-intl"
import { ChevronDown, ChevronUp } from "lucide-react"
import type { LogRow } from "./types"
import { fmtDate, fmtTokens, fmtCost, providerColor } from "./types"

export const LogEntry = memo(function LogEntry({ row }: { row: LogRow }) {
  const t = useTranslations("usage")
  const [open, setOpen] = useState(false)

  return (
    <div className="border-b border-border last:border-0">
      <button className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors" onClick={() => setOpen(v => !v)}>
        <span className="text-xs text-muted-foreground w-32 shrink-0 truncate">{fmtDate(row.created_at)}</span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border shrink-0 ${row.status === "success" ? "border-emerald-500/40 text-emerald-600" : "border-rose-500/40 text-rose-600"}`}>{row.status}</span>
        <span className="text-xs font-medium truncate flex-1" style={{ color: providerColor(row.provider) }}>{row.model}</span>
        <span className="text-xs text-muted-foreground shrink-0">{fmtTokens(row.input_tokens + row.output_tokens)} tok</span>
        <span className="text-xs font-medium tabular-nums shrink-0 w-20 text-right">{fmtCost(row.cost_usd)}</span>
        {open ? <ChevronUp className="size-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <div className="bg-muted/30 px-4 pb-4 pt-2 grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3 text-xs">
          <div><p className="text-muted-foreground">{t("model")}</p><p className="font-medium">{row.model}</p></div>
          <div><p className="text-muted-foreground">{t("provider")}</p><p className="font-medium capitalize">{row.provider}</p></div>
          <div><p className="text-muted-foreground">{t("callType")}</p><p className="font-medium">{row.call_type}</p></div>
          <div><p className="text-muted-foreground">{t("inputTokens")}</p><p className="font-medium tabular-nums">{row.input_tokens.toLocaleString()}</p></div>
          <div><p className="text-muted-foreground">{t("outputTokens")}</p><p className="font-medium tabular-nums">{row.output_tokens.toLocaleString()}</p></div>
          <div><p className="text-muted-foreground">{t("cachedTokens")}</p><p className="font-medium tabular-nums">{row.cached_tokens.toLocaleString()}</p></div>
          <div><p className="text-muted-foreground">{t("costUsd")}</p><p className="font-medium tabular-nums">{fmtCost(row.cost_usd)}</p></div>
          <div><p className="text-muted-foreground">{t("status")}</p><p className="font-medium">{row.status}</p></div>
          <div><p className="text-muted-foreground">{t("time")}</p><p className="font-medium">{fmtDate(row.created_at)}</p></div>
        </div>
      )}
    </div>
  )
})
