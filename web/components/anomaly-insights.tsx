"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Target,
  ShoppingCart,
  CheckCircle2,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"

type Anomaly = {
  domain: string
  signal: string
  label: string
  current: number
  baseline: number
  std_dev: number
  z_score: number
  severity: "mild" | "moderate" | "high"
  direction: "up" | "down"
  message: string
}

type AnomalyData = {
  anomalies: Anomaly[]
  count: number
  computed_at: string
}

const SEVERITY_STYLES = {
  high:     { badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",     bar: "bg-rose-500",   border: "border-rose-200 dark:border-rose-800" },
  moderate: { badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", bar: "bg-amber-500",  border: "border-amber-200 dark:border-amber-800" },
  mild:     { badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",     bar: "bg-blue-500",   border: "border-blue-200 dark:border-blue-800" },
}

const DOMAIN_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  spending: ShoppingCart,
  category: TrendingUp,
  goals:    Target,
}

function ZScoreBar({ z, severity }: { z: number; severity: string }) {
  const styles = SEVERITY_STYLES[severity as keyof typeof SEVERITY_STYLES]
  // Map |z| to 0-100%: 1.5 → ~50%, 2.0 → ~67%, 3.0 → 100%
  const pct = Math.min((Math.abs(z) / 3) * 100, 100)
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700", styles?.bar)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
        z={Math.abs(z).toFixed(2)}
      </span>
    </div>
  )
}

function AnomalyCard({ anomaly }: { anomaly: Anomaly }) {
  const t = useTranslations("analytics")
  const styles = SEVERITY_STYLES[anomaly.severity]
  const Icon = DOMAIN_ICON[anomaly.domain] ?? AlertTriangle
  const DirectionIcon = anomaly.direction === "up" ? TrendingUp : TrendingDown

  return (
    <div className={cn(
      "rounded-xl border p-4 space-y-3 transition-colors",
      styles?.border
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className={cn("rounded-lg p-1.5", styles?.badge)}>
            <Icon className="size-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {t(`domain_${anomaly.domain}` as Parameters<typeof t>[0])}
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-xs text-muted-foreground">{anomaly.label}</span>
            </div>
            <p className="text-sm font-medium mt-0.5">{anomaly.message}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <DirectionIcon className={cn(
            "size-3.5",
            anomaly.direction === "up" ? "text-rose-500" : "text-emerald-500"
          )} />
          <span className={cn(
            "text-xs font-semibold px-2 py-0.5 rounded-full",
            styles?.badge
          )}>
            {t(`severity_${anomaly.severity}` as Parameters<typeof t>[0])}
          </span>
        </div>
      </div>

      <ZScoreBar z={anomaly.z_score} severity={anomaly.severity} />

      {anomaly.domain !== "goals" && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{t("anomalyCurrent")} <span className="font-medium text-foreground">{anomaly.current.toLocaleString("ko-KR")}</span></span>
          <span>{t("anomalyBaseline")} <span className="font-medium text-foreground">{anomaly.baseline.toLocaleString("ko-KR")}</span></span>
          {anomaly.std_dev > 0 && (
            <span>{t("anomalyStdDev")} <span className="font-medium text-foreground">{anomaly.std_dev.toLocaleString("ko-KR")}</span></span>
          )}
        </div>
      )}
    </div>
  )
}

export function AnomalyInsights({ className }: { className?: string }) {
  const t = useTranslations("analytics")
  const [data, setData] = useState<AnomalyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchAnomalies = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const res = await fetch("/api/anomalies")
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { fetchAnomalies() }, [])

  if (loading) {
    return (
      <div className={cn("rounded-2xl border p-6 space-y-4", className)}>
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="size-7 rounded-lg" />
              <div className="space-y-1 flex-1">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-48" />
              </div>
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
            <div className="flex gap-4">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  const anomalies = data?.anomalies ?? []
  const highCount = anomalies.filter(a => a.severity === "high").length
  const moderateCount = anomalies.filter(a => a.severity === "moderate").length

  return (
    <div className={cn("rounded-2xl border p-6 space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-base">{t("anomalyDetection")}</h3>
          {anomalies.length > 0 && (
            <span className={cn(
              "text-xs font-medium px-2 py-0.5 rounded-full",
              highCount > 0
                ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                : moderateCount > 0
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
            )}>
              {t("anomalyCount", { count: anomalies.length })}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => fetchAnomalies(true)}
          disabled={refreshing}
        >
          <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
        </Button>
      </div>

      {/* Subtitle */}
      <p className="text-xs text-muted-foreground -mt-2">
        {t("anomalySubtitle")}
      </p>

      {/* Empty state */}
      {anomalies.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
          <CheckCircle2 className="size-8 text-emerald-500" />
          <p className="text-sm font-medium">{t("noAnomalies")}</p>
          <p className="text-xs text-muted-foreground">{t("allPatternsNormal")}</p>
        </div>
      )}

      {/* Anomaly cards — high first, then moderate, then mild */}
      {(["high", "moderate", "mild"] as const)
        .flatMap(sev => anomalies.filter(a => a.severity === sev))
        .map((anomaly, i) => (
          <AnomalyCard key={`${anomaly.signal}-${i}`} anomaly={anomaly} />
        ))}

      {/* Footer timestamp */}
      {data?.computed_at && (
        <p className="text-xs text-muted-foreground/60 text-right">
          {t("lastAnalysis", { time: new Date(data.computed_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) })}
        </p>
      )}
    </div>
  )
}
