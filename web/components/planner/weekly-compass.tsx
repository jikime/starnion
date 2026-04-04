"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { usePlannerStore, type Priority } from "@/lib/planner-store"
import { cn } from "@/lib/utils"
import {
  Check, Plus, Trash2, ChevronDown, ChevronUp,
  Compass, Zap, AlertCircle,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

// ── Balance bar ─────────────────────────────────────────────────────────────

function BalanceBar({
  roleId,
  color,
  count,
  total,
}: {
  roleId: string
  color: string
  count: number
  total: number
}) {
  const pct = total === 0 ? 0 : Math.round((count / total) * 100)
  return (
    <div className="h-1 rounded-full bg-muted overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  )
}

// ── Nion coaching tip ────────────────────────────────────────────────────────

function NionCoachingTip({ unassigned, t }: { unassigned: string[]; t: ReturnType<typeof useTranslations> }) {
  if (unassigned.length === 0) return null
  return (
    <div
      className="flex items-start gap-2 px-2.5 py-2 rounded-md text-xs leading-snug"
      style={{
        background: "color-mix(in oklch, var(--priority-b) 12%, transparent)",
        border: "1px solid color-mix(in oklch, var(--priority-b) 30%, var(--border))",
        color: "var(--priority-b)",
      }}
    >
      <AlertCircle className="w-3 h-3 shrink-0 mt-px" />
      <span>
        <strong>&apos;{unassigned[0]}&apos;</strong> {t("compassStopped")}
        {" "}{t("compassHint")}
      </span>
    </div>
  )
}

// ── Role card ────────────────────────────────────────────────────────────────

function RoleCard({
  roleId,
  weekStart,
  urgentGoalTitle,
}: {
  roleId: string
  weekStart: string
  urgentGoalTitle?: string
}) {
  const t = useTranslations("planner.weeklyCompass")
  const tTask = useTranslations("planner.task")
  const {
    roles,
    weeklyGoals,
    addWeeklyGoal,
    toggleWeeklyGoal,
    deleteWeeklyGoal,
    addWeeklyGoalAsTask,
    getDdayGoals,
  } = usePlannerStore()

  const role = roles.find((r) => r.id === roleId)
  if (!role) return null

  const goals = weeklyGoals.filter(
    (g) => g.roleId === roleId && g.weekStart === weekStart
  )
  const doneCount = goals.filter((g) => g.done).length

  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState("")
  const [expandPriority, setExpandPriority] = useState<string | null>(null)

  const handleAdd = () => {
    if (!draft.trim()) return
    addWeeklyGoal(roleId, draft.trim(), weekStart)
    setDraft("")
    setAdding(false)
  }

  const ddayForRole = getDdayGoals().find(
    (g) => g.roleId === roleId && g.urgent
  )

  return (
    <div
      className="rounded-lg border p-3 space-y-2.5 transition-all"
      style={{
        borderColor: ddayForRole
          ? "color-mix(in oklch, var(--status-cancelled) 50%, var(--border))"
          : urgentGoalTitle
          ? "color-mix(in oklch, var(--priority-a) 30%, var(--border))"
          : "var(--border)",
        background: ddayForRole
          ? "color-mix(in oklch, var(--status-cancelled) 5%, var(--card))"
          : "var(--card)",
        boxShadow: ddayForRole ? `0 0 0 1px color-mix(in oklch, var(--status-cancelled) 20%, transparent)` : undefined,
      }}
    >
      {/* Role header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: role.color }}
          />
          <span className="text-xs font-semibold text-foreground uppercase tracking-wide truncate">
            {role.name}
          </span>
          {ddayForRole && (
            <span
              className="text-xs font-bold px-1 rounded shrink-0"
              style={{ background: "var(--status-cancelled)", color: "#fff" }}
            >
              D-{ddayForRole.daysLeft}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-muted-foreground tabular-nums">
            {doneCount}/{goals.length}
          </span>
          <button
            onClick={() => setAdding(!adding)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Add key goal"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Role mission */}
      {role.mission && (
        <p className="text-xs text-muted-foreground italic leading-relaxed line-clamp-2 border-l-2 pl-2"
          style={{ borderColor: role.color + "60" }}>
          {role.mission}
        </p>
      )}

      {/* Key goals list */}
      <div className="space-y-1">
        {goals.length === 0 && !adding && (
          <p className="text-xs text-muted-foreground italic text-center py-1">
            {/* TODO: i18n */}
          </p>
        )}
        {goals.map((g) => (
          <div
            key={g.id}
            className={cn(
              "group flex items-start gap-2 rounded px-2 py-1.5 transition-colors",
              g.done ? "opacity-50" : "hover:bg-accent/40"
            )}
          >
            {/* Checkbox */}
            <button
              onClick={() => toggleWeeklyGoal(g.id)}
              className={cn(
                "w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 mt-px transition-colors",
                g.done
                  ? "border-transparent"
                  : "border-muted-foreground hover:border-foreground"
              )}
              style={g.done ? { background: role.color } : undefined}
              aria-label={g.done ? t("undone") : t("markDone")}
            >
              {g.done && <Check className="w-2 h-2 text-background" />}
            </button>

            {/* Title */}
            <span
              className={cn(
                "text-xs flex-1 leading-snug",
                g.done ? "line-through text-muted-foreground" : "text-foreground"
              )}
            >
              {g.title}
            </span>

            {/* Actions on hover */}
            {!g.done && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                {/* Add as A task */}
                <button
                  onClick={() => addWeeklyGoalAsTask(g.id, "A")}
                  className="flex items-center gap-0.5 rounded px-1 py-0.5 text-xs font-bold transition-colors hover:opacity-80"
                  style={{
                    background: "var(--priority-a-bg)",
                    color: "var(--priority-a)",
                  }}
                  title={t("addAsATask")}
                >
                  <Zap className="w-2 h-2" />
                  A
                </button>
                {/* Delete */}
                <button
                  onClick={() => deleteWeeklyGoal(g.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  aria-label={tTask("delete")}
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add key goal input */}
      {adding && (
        <div className="flex gap-1.5">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("addBigRockPlaceholder")}
            className="h-7 text-xs bg-muted border-border flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd()
              if (e.key === "Escape") { setAdding(false); setDraft("") }
            }}
            autoFocus
          />
          <Button
            size="sm"
            className="h-7 text-xs px-2 shrink-0"
            onClick={handleAdd}
            style={{ background: role.color, color: "#ffffff" }}
          >
            {t("add")}
          </Button>
        </div>
      )}

      {/* Progress bar */}
      {goals.length > 0 && (
        <div className="h-0.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${goals.length === 0 ? 0 : (doneCount / goals.length) * 100}%`,
              background: role.color,
            }}
          />
        </div>
      )}
    </div>
  )
}

// ── Main export ──────────────────────────────────────────────────────────────

export function WeeklyCompass() {
  const t = useTranslations("planner.weeklyCompass")
  const { roles, getWeekBalance, getUnassignedRoles, weeklyGoals } = usePlannerStore()
  const [open, setOpen] = useState(true)

  // Get current week's Monday
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  const weekStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

  const weekBalance = getWeekBalance(weekStart)
  const unassignedRoles = getUnassignedRoles(weekStart)
  const totalWeekGoals = Object.values(weekBalance).reduce((a, b) => a + b, 0)

  return (
    <div className="px-4 py-3 flex-1">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <Compass className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            {t("weeklyCompassTitle")}
          </span>
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label={open ? t("foldCompass") : t("unfoldCompass")}
        >
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {open && (
        <div className="space-y-3">
          {/* Balance mini-bar for each role */}
          {totalWeekGoals > 0 && (
            <div className="space-y-1.5 mb-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                {t("roleBalance")}
              </p>
              {roles.map((role) => {
                const count = weekBalance[role.id] ?? 0
                return (
                  <div key={role.id} className="flex items-center gap-2">
                    <div className="flex items-center gap-1 w-16 shrink-0">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: role.color }}
                      />
                      <span className="text-xs text-muted-foreground truncate">
                        {role.name}
                      </span>
                    </div>
                    <div className="flex-1">
                      <BalanceBar
                        roleId={role.id}
                        color={role.color}
                        count={count}
                        total={totalWeekGoals}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums w-4 text-right shrink-0">
                      {count}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Nion coaching tip */}
          <NionCoachingTip unassigned={unassignedRoles.map((r) => r.name)} t={t} />

          {/* Role cards */}
          <div className="space-y-2.5 pb-4">
            {roles.map((role) => (
              <RoleCard
                key={role.id}
                roleId={role.id}
                weekStart={weekStart}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
