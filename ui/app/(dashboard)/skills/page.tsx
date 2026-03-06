"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Loader2 } from "lucide-react"

interface Skill {
  id: string
  name: string
  description: string
  category: string
  emoji: string
  enabled: boolean
  permission: number  // 0=system, 1=default, 2=opt-in
  sort_order: number
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
}

export default function SkillsPage() {
  const t = useTranslations("skills")
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [togglingId, setTogglingId] = useState<string | null>(null)

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
      }
    } finally {
      setTogglingId(null)
    }
  }

  const activeCount = skills.filter((s) => s.enabled).length
  const totalCount = skills.length

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        {loading ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : (
          <Badge variant="secondary" className="text-sm">{t("active", { n: activeCount, total: totalCount })}</Badge>
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
                        className="flex items-center justify-between rounded-lg border border-border p-3"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-base">{skill.emoji}</span>
                          <span className="text-sm truncate">{skill.name}</span>
                          {isOptIn && (
                            <Badge variant="outline" className="text-xs shrink-0">
                              opt-in
                            </Badge>
                          )}
                          {isSystem && (
                            <Badge variant="secondary" className="text-xs shrink-0">
                              {t("required")}
                            </Badge>
                          )}
                        </div>
                        {isToggling ? (
                          <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
                        ) : (
                          <Switch
                            checked={skill.enabled}
                            disabled={isSystem}
                            onCheckedChange={() => toggleSkill(skill.id)}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
