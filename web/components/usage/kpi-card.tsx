import { TrendingUp, TrendingDown } from "lucide-react"
import { cn } from "@/lib/utils"

export function KpiCard({ label, sub, value, icon: Icon, iconBg, trend }: {
  label: string; sub: string; value: string; icon: React.ElementType; iconBg: string; trend?: number | null
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">{sub}</p>
          <p className="mt-0.5 text-2xl font-bold tracking-tight">{value}</p>
        </div>
        <div className={`rounded-lg p-2 ${iconBg} shrink-0`}><Icon className="size-4" /></div>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        {trend !== null && trend !== undefined && (
          <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium",
            trend > 0 ? "text-emerald-500" : trend < 0 ? "text-red-500" : "text-muted-foreground")}>
            {trend > 0 ? <TrendingUp className="size-3" /> : trend < 0 ? <TrendingDown className="size-3" /> : null}
            {trend > 0 ? "+" : ""}{trend}%
          </span>
        )}
      </div>
    </div>
  )
}

export function Panel({ title, sub, icon: Icon, iconBg, children }: {
  title: string; sub?: string; icon: React.ElementType; iconBg: string; children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card flex flex-col">
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <div className={`rounded-lg p-2 ${iconBg}`}><Icon className="size-4" /></div>
        <div><p className="text-sm font-semibold">{title}</p>{sub && <p className="text-xs text-muted-foreground">{sub}</p>}</div>
      </div>
      <div className="px-5 pb-5 flex-1">{children}</div>
    </div>
  )
}
