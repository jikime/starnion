"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet"
import { Cog, Info, Loader2, Copy, Check, Zap, MessageSquare, ToggleLeft, ToggleRight } from "lucide-react"

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
          {/* Emoji + title row */}
          <div className="flex items-start gap-4 pr-8">
            <div className="flex-shrink-0 size-14 rounded-2xl bg-background shadow-sm border border-border/60 flex items-center justify-center text-3xl">
              {skill.emoji}
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <SheetTitle className="text-xl font-bold leading-tight mb-1">
                {skill.name}
              </SheetTitle>
              <div className="flex items-center gap-1.5 flex-wrap">
                {isOptIn && (
                  <Badge variant="outline" className="text-xs border-amber-400/60 text-amber-600 bg-amber-50 dark:bg-amber-950/30">
                    opt-in
                  </Badge>
                )}
                {isSystem && (
                  <Badge variant="secondary" className="text-xs">
                    {t("required")}
                  </Badge>
                )}
                {/* Enabled indicator */}
                <span className={`inline-flex items-center gap-1 text-xs font-medium ${skill.enabled ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                  {skill.enabled
                    ? <ToggleRight className="size-3.5" />
                    : <ToggleLeft className="size-3.5" />}
                  {skill.enabled ? "ON" : "OFF"}
                </span>
              </div>
            </div>
          </div>

          {/* Description */}
          <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
            {skill.description}
          </p>

          {/* Toggle button — bottom right of hero, only if not system */}
          {!isSystem && (
            <div className="mt-4 flex justify-end">
              <button
                disabled={isToggling}
                onClick={() => onToggle(skill.id)}
                className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold border transition-all
                  ${skill.enabled
                    ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
                    : "bg-muted border-border text-muted-foreground hover:bg-muted/80"
                  }`}
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

          {/* Trigger keywords section */}
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

          {/* Divider */}
          <div className="border-t border-border/50" />

          {/* Usage examples section */}
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
        // Sync selected skill state if sheet is open
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Cog className="size-6 text-primary" />
            {t("title")}
          </h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        {loading ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : (
          <Badge variant="secondary" className="text-sm">
            {t("active", { n: activeCount, total: totalCount })}
          </Badge>
        )}
      </div>

      <Card>
        <CardContent className="pt-6 space-y-8">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            Object.entries(grouped).map(([category, catSkills]) => (
              <div key={category}>
                <h4 className="font-medium mb-4 text-xs text-muted-foreground uppercase tracking-wider">
                  {CATEGORY_LABELS[category] ?? category.toUpperCase()}
                </h4>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {catSkills.map((skill) => {
                    const isSystem = skill.permission === 0
                    const isOptIn = skill.permission === 2
                    const isToggling = togglingId === skill.id

                    return (
                      <div
                        key={skill.id}
                        className="flex flex-col rounded-lg border border-border p-3 gap-2"
                      >
                        {/* Top row: emoji + name + badges + toggle */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-base shrink-0">{skill.emoji}</span>
                            <span className="text-sm font-medium truncate">{skill.name}</span>
                            {isOptIn && (
                              <Badge variant="outline" className="text-xs shrink-0">opt-in</Badge>
                            )}
                            {isSystem && (
                              <Badge variant="secondary" className="text-xs shrink-0">
                                {t("required")}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-6 text-muted-foreground hover:text-foreground"
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

                        {/* Description row */}
                        <p className="text-xs text-muted-foreground leading-snug line-clamp-2 pl-6">
                          {skill.description}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

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
