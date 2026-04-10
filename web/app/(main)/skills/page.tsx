"use client"

import { useEffect, useState, useMemo } from "react"
import { useTranslations, useLocale } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Cog, Search } from "lucide-react"
import type { Skill } from "@/components/skills/types"
import { CATEGORY_KEYS, CATEGORY_DOT } from "@/components/skills/types"
import { SkillCard } from "@/components/skills/skill-card"
import { SkillDetailSheet } from "@/components/skills/skill-detail-sheet"

export default function SkillsPage() {
  const t = useTranslations("skills")
  const locale = useLocale()
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const filteredSkills = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return skills
    return skills.filter(s => s.display_name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.category.toLowerCase().includes(q))
  }, [skills, searchQuery])

  const grouped = useMemo(() =>
    filteredSkills.reduce<Record<string, Skill[]>>((acc, s) => {
      if (!acc[s.category]) acc[s.category] = []
      acc[s.category].push(s)
      return acc
    }, {}),
  [filteredSkills])

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/skills?lang=${locale}`)
        if (res.ok) {
          const data = await res.json()
          setSkills(Array.isArray(data) ? data : (data.skills ?? []))
        }
      } catch { /* ignore */ }
      finally { setLoading(false) }
    })()
  }, [locale])

  const toggleSkill = async (skillId: string) => {
    const target = skills.find(s => s.id === skillId)
    if (!target) return
    if (!target.enabled && target.requires_api_key && !target.has_api_key) {
      toast.warning(t("apiKeyWarning", { name: target.display_name }), {
        description: t("apiKeyWarningDesc"),
        action: { label: t("openSettings"), onClick: () => openDetail(target) },
      })
      return
    }
    setTogglingId(skillId)
    try {
      const res = await fetch(`/api/skills/${skillId}/toggle`, { method: "POST" })
      if (res.ok) {
        const { enabled } = await res.json()
        setSkills(prev => prev.map(s => s.id === skillId ? { ...s, enabled } : s))
        if (selectedSkill?.id === skillId) setSelectedSkill(prev => prev ? { ...prev, enabled } : prev)
        toast.success(enabled ? t("skillEnabled", { name: target.display_name }) : t("skillDisabled", { name: target.display_name }))
      } else {
        toast.error(t("skillToggleError"))
      }
    } catch { toast.error(t("skillToggleError")) }
    finally { setTogglingId(null) }
  }

  const handleAPIKeySaved = (skillId: string, masked: string) => {
    const update = (s: Skill) => s.id === skillId ? { ...s, has_api_key: true, masked_key: masked } : s
    setSkills(prev => prev.map(update))
    setSelectedSkill(prev => prev ? update(prev) : prev)
  }
  const handleAPIKeyDeleted = (skillId: string) => {
    const update = (s: Skill) => s.id === skillId ? { ...s, has_api_key: false, masked_key: null } : s
    setSkills(prev => prev.map(update))
    setSelectedSkill(prev => prev ? update(prev) : prev)
  }
  const handleOAuthDisconnected = (skillId: string) => {
    const update = (s: Skill) => s.id === skillId ? { ...s, oauth_connected: false, oauth_expires_at: null } : s
    setSkills(prev => prev.map(update))
    setSelectedSkill(prev => prev ? update(prev) : prev)
  }
  const handleOAuthConnected = (skillId: string) => {
    const update = (s: Skill) => s.id === skillId ? { ...s, oauth_connected: true } : s
    setSkills(prev => prev.map(update))
    setSelectedSkill(prev => prev ? update(prev) : prev)
  }

  const openDetail = (skill: Skill) => { setSelectedSkill(skill); setSheetOpen(true) }
  const activeCount = skills.filter(s => s.enabled).length
  const totalCount = skills.length

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Header */}
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
          <Skeleton className="h-6 w-24 rounded-full" />
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/30">
            <span className="size-1.5 rounded-full bg-emerald-400 shrink-0" />
            {t("active", { n: activeCount, total: totalCount })}
          </span>
        )}
      </div>

      {/* Main panel */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-5">
          {!loading && (
            <div className="relative mb-5">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder={t("searchPlaceholder")} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 h-9 text-sm" />
            </div>
          )}

          {loading ? (
            <div className="space-y-8">
              {Array.from({ length: 2 }).map((_, gi) => (
                <div key={gi}>
                  <div className="flex items-center gap-2 mb-3">
                    <Skeleton className="size-2 rounded-full shrink-0" />
                    <Skeleton className="h-3 w-20" />
                    <div className="flex-1 h-px bg-border/50 ml-1" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="flex flex-col rounded-xl border border-border/60 bg-background overflow-hidden">
                        <div className="p-3 flex flex-col gap-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Skeleton className="size-8 rounded-lg shrink-0" />
                              <Skeleton className="h-4 w-28" />
                            </div>
                            <Skeleton className="h-5 w-8 rounded-full shrink-0" />
                          </div>
                          <Skeleton className="h-3 w-full" />
                          <Skeleton className="h-3 w-4/5" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Search className="size-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">{t("noSearchResults")}</p>
              <p className="text-xs text-muted-foreground/60 mt-1">{t("noSearchResultsHint", { query: searchQuery })}</p>
              <Button variant="ghost" size="sm" className="mt-3 text-xs" onClick={() => setSearchQuery("")}>{t("clearSearch")}</Button>
            </div>
          ) : (
            <div className="space-y-8">
              {searchQuery.trim() && (
                <p className="text-xs text-muted-foreground -mb-4">{t("searchResultCount", { query: searchQuery, n: filteredSkills.length })}</p>
              )}
              {Object.entries(grouped).map(([category, catSkills]) => (
                <div key={category}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={cn("size-2 rounded-full shrink-0", CATEGORY_DOT[category] ?? "bg-muted-foreground")} />
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {CATEGORY_KEYS[category] ? t(CATEGORY_KEYS[category]) : category.toUpperCase()}
                    </h4>
                    <span className="text-xs text-muted-foreground/60">({catSkills.length})</span>
                    <div className="flex-1 h-px bg-border/50 ml-1" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {catSkills.map(skill => (
                      <SkillCard key={skill.id} skill={skill} isToggling={togglingId === skill.id}
                        onToggle={toggleSkill} onOpenDetail={openDetail} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <SkillDetailSheet skill={selectedSkill} open={sheetOpen} onOpenChange={setSheetOpen}
        onToggle={toggleSkill} isToggling={selectedSkill ? togglingId === selectedSkill.id : false}
        onAPIKeySaved={handleAPIKeySaved} onAPIKeyDeleted={handleAPIKeyDeleted}
        onOAuthDisconnected={handleOAuthDisconnected} onOAuthConnected={handleOAuthConnected} />
    </div>
  )
}
