"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import {
  Cog, Info, Loader2, Copy, Check, Zap, MessageSquare,
  ToggleLeft, ToggleRight,
} from "lucide-react"

interface Skill {
  id: string
  name: string
  description: string
  category: string
  emoji: string
  enabled: boolean
  permission: number  // 0=system, 1=default, 2=opt-in
  sort_order: number
  keywords: string[]
  examples: string[]
}

const CATEGORY_LABELS: Record<string, string> = {
  finance:      "FINANCE",
  productivity: "PRODUCTIVITY",
  media:        "MEDIA",
  integration:  "INTEGRATION",
  information:  "INFORMATION",
  utility:      "UTILITY",
  lifestyle:    "LIFESTYLE",
  analysis:     "ANALYSIS",
  notification: "NOTIFICATION",
  core:         "CORE",
  system:       "SYSTEM",
  development:  "DEVELOPMENT",
}

const CATEGORY_DOT: Record<string, string> = {
  finance:      "bg-emerald-400",
  productivity: "bg-blue-400",
  media:        "bg-violet-400",
  integration:  "bg-orange-400",
  information:  "bg-sky-400",
  utility:      "bg-zinc-400",
  lifestyle:    "bg-pink-400",
  analysis:     "bg-indigo-400",
  notification: "bg-amber-400",
  core:         "bg-slate-400",
  system:       "bg-red-400",
  development:  "bg-cyan-400",
}

// ── CopyButton ──────────────────────────────────────────────────────────────
function CopyButton({ text, label, copiedLabel }: { text: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      onClick={handleCopy}
      className="ml-auto shrink-0 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      title={copied ? copiedLabel : label}
    >
      {copied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
      <span>{copied ? copiedLabel : label}</span>
    </button>
  )
}

// ── SkillDetailSheet ─────────────────────────────────────────────────────────
function SkillDetailSheet({
  skill,
  open,
  onOpenChange,
  onToggle,
  isToggling,
}: {
  skill: Skill | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onToggle: (skillId: string) => void
  isToggling: boolean
}) {
  const t = useTranslations("skills")

  if (!skill) return null

  const isSystem = skill.permission === 0
  const isOptIn = skill.permission === 2

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0 gap-0 overflow-hidden">

        {/* ── Hero header ── */}
        <div className="relative bg-gradient-to-br from-primary/10 via-primary/5 to-background px-6 pt-8 pb-6 border-b border-border/60">
          <div className="flex items-start gap-4 pr-8">
            <div className="flex-shrink-0 size-14 rounded-2xl bg-background border border-border/60 flex items-center justify-center text-3xl">
              {skill.emoji}
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <SheetTitle className="text-xl font-bold leading-tight mb-1">
                {skill.name}
              </SheetTitle>
              <div className="flex items-center gap-1.5 flex-wrap">
                {isOptIn && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30">
                    opt-in
                  </span>
                )}
                {isSystem && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border border-border text-muted-foreground bg-muted">
                    {t("required")}
                  </span>
                )}
                <span className={cn(
                  "inline-flex items-center gap-1 text-xs font-medium",
                  skill.enabled ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                )}>
                  {skill.enabled
                    ? <ToggleRight className="size-3.5" />
                    : <ToggleLeft className="size-3.5" />}
                  {skill.enabled ? "ON" : "OFF"}
                </span>
              </div>
            </div>
          </div>

          <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
            {skill.description}
          </p>

          {!isSystem && (
            <div className="mt-4 flex justify-end">
              <button
                disabled={isToggling}
                onClick={() => onToggle(skill.id)}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold border transition-all",
                  skill.enabled
                    ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
                    : "bg-muted border-border text-muted-foreground hover:bg-muted/80"
                )}
              >
                {isToggling
                  ? <Loader2 className="size-3 animate-spin" />
                  : skill.enabled
                    ? <ToggleRight className="size-3.5" />
                    : <ToggleLeft className="size-3.5" />
                }
                {skill.enabled ? t("disable") : t("enable")}
              </button>
            </div>
          )}
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Trigger keywords */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="size-5 rounded-md bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                <Zap className="size-3 text-blue-500" />
              </div>
              <h3 className="text-sm font-semibold">{t("triggers")}</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-3 pl-7">
              {t("triggersDesc")}
            </p>
            {skill.keywords.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pl-7">
                {skill.keywords.map((kw) => (
                  <span
                    key={kw}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                      bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300
                      border border-blue-200 dark:border-blue-800"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic pl-7">{t("noKeywords")}</p>
            )}
          </div>

          <div className="border-t border-border/50" />

          {/* Usage examples */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="size-5 rounded-md bg-violet-100 dark:bg-violet-950 flex items-center justify-center">
                <MessageSquare className="size-3 text-violet-500" />
              </div>
              <h3 className="text-sm font-semibold">{t("examples")}</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-3 pl-7">
              {t("examplesDesc")}
            </p>
            {skill.examples.length > 0 ? (
              <div className="space-y-2 pl-7">
                {skill.examples.map((ex) => (
                  <div
                    key={ex}
                    className="group flex items-center gap-2 rounded-xl
                      bg-muted/50 hover:bg-muted/80
                      border border-border/60 hover:border-border
                      px-3.5 py-2.5 transition-colors cursor-default"
                  >
                    <span className="text-xs text-foreground flex-1 min-w-0 leading-relaxed">
                      {ex}
                    </span>
                    <CopyButton
                      text={ex}
                      label={t("copy")}
                      copiedLabel={t("copied")}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic pl-7">{t("noExamples")}</p>
            )}
          </div>

        </div>
      </SheetContent>
    </Sheet>
  )
}

// ── SkillsPage ────────────────────────────────────────────────────────────────
export default function SkillsPage() {
  const t = useTranslations("skills")
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const grouped = skills.reduce<Record<string, Skill[]>>((acc, s) => {
    if (!acc[s.category]) acc[s.category] = []
    acc[s.category].push(s)
    return acc
  }, {})

  const fetchSkills = async () => {
    try {
      const res = await fetch("/api/skills")
      if (res.ok) setSkills(await res.json())
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSkills() }, [])

  const toggleSkill = async (skillId: string) => {
    setTogglingId(skillId)
    try {
      const res = await fetch(`/api/skills/${skillId}/toggle`, { method: "POST" })
      if (res.ok) {
        const { enabled } = await res.json()
        setSkills((prev) =>
          prev.map((s) => (s.id === skillId ? { ...s, enabled } : s))
        )
        if (selectedSkill?.id === skillId) {
          setSelectedSkill((prev) => prev ? { ...prev, enabled } : prev)
        }
      }
    } finally {
      setTogglingId(null)
    }
  }

  const openDetail = (skill: Skill) => {
    setSelectedSkill(skill)
    setSheetOpen(true)
  }

  const activeCount = skills.filter((s) => s.enabled).length
  const totalCount = skills.length

  return (
    <div className="p-6 space-y-6">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-violet-100 dark:bg-violet-950/60 flex items-center justify-center shrink-0">
            <Cog className="size-5 text-violet-500" />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
        </div>

        {loading ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/30">
            <span className="size-1.5 rounded-full bg-emerald-400 shrink-0" />
            {t("active", { n: activeCount, total: totalCount })}
          </span>
        )}
      </div>

      {/* ── Main panel ── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Panel header */}
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border bg-muted/30">
          <Cog className="size-4 text-violet-500" />
          <span className="text-sm font-medium">{t("title")}</span>
          {!loading && (
            <span className="ml-auto text-xs text-muted-foreground">
              {totalCount}
            </span>
          )}
        </div>

        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-8">
              {Object.entries(grouped).map(([category, catSkills]) => (
                <div key={category}>
                  {/* Category header */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className={cn(
                      "size-2 rounded-full shrink-0",
                      CATEGORY_DOT[category] ?? "bg-muted-foreground"
                    )} />
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {CATEGORY_LABELS[category] ?? category.toUpperCase()}
                    </h4>
                    <span className="text-xs text-muted-foreground/60">
                      ({catSkills.length})
                    </span>
                    <div className="flex-1 h-px bg-border/50 ml-1" />
                  </div>

                  {/* Skill cards */}
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {catSkills.map((skill) => {
                      const isSystem = skill.permission === 0
                      const isOptIn = skill.permission === 2
                      const isToggling = togglingId === skill.id

                      return (
                        <div
                          key={skill.id}
                          className={cn(
                            "group flex flex-col rounded-xl border bg-background overflow-hidden transition-colors",
                            skill.enabled
                              ? "border-border hover:border-violet-300 dark:hover:border-violet-700"
                              : "border-border/60 opacity-75 hover:opacity-100 hover:border-border"
                          )}
                        >
                          <div className="p-3 flex flex-col gap-2">
                            {/* Top row */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                {/* Emoji box */}
                                <span className="flex-shrink-0 size-8 rounded-lg bg-muted flex items-center justify-center text-base">
                                  {skill.emoji}
                                </span>
                                <div className="min-w-0">
                                  <span className="text-sm font-medium leading-tight line-clamp-1">
                                    {skill.name}
                                  </span>
                                  <div className="flex items-center gap-1 mt-0.5">
                                    {isOptIn && (
                                      <span className="inline-flex items-center px-1.5 py-px rounded text-[10px] font-medium border border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 leading-tight">
                                        opt-in
                                      </span>
                                    )}
                                    {isSystem && (
                                      <span className="inline-flex items-center px-1.5 py-px rounded text-[10px] font-medium border border-border text-muted-foreground bg-muted leading-tight">
                                        {t("required")}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Actions */}
                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                                  onClick={() => openDetail(skill)}
                                >
                                  <Info className="size-3.5" />
                                </Button>
                                {isToggling ? (
                                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                                ) : (
                                  <Switch
                                    checked={skill.enabled}
                                    disabled={isSystem}
                                    onCheckedChange={() => toggleSkill(skill.id)}
                                  />
                                )}
                              </div>
                            </div>

                            {/* Description */}
                            <p className="text-xs text-muted-foreground leading-snug line-clamp-2 pl-10">
                              {skill.description}
                            </p>

                            {/* Footer: enabled status */}
                            <div className="flex items-center gap-1.5 pl-10">
                              <span className={cn(
                                "size-1.5 rounded-full shrink-0",
                                skill.enabled ? "bg-emerald-400" : "bg-muted-foreground/40"
                              )} />
                              <span className={cn(
                                "text-[10px] font-medium",
                                skill.enabled ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/60"
                              )}>
                                {skill.enabled ? "ON" : "OFF"}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <SkillDetailSheet
        skill={selectedSkill}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onToggle={toggleSkill}
        isToggling={selectedSkill ? togglingId === selectedSkill.id : false}
      />
    </div>
  )
}
