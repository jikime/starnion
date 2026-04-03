"use client"

import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { Info, Loader2, Zap, Key, AlertTriangle } from "lucide-react"
import type { Skill } from "./types"
import { isOAuthExpired } from "./types"

export function SkillCard({ skill, isToggling, onToggle, onOpenDetail }: {
  skill: Skill
  isToggling: boolean
  onToggle: (id: string) => void
  onOpenDetail: (s: Skill) => void
}) {
  const t = useTranslations("skills")
  const oauthExpired = skill.api_key_type === "google_oauth" && skill.oauth_connected && isOAuthExpired(skill.oauth_expires_at)

  return (
    <div
      role="button" tabIndex={0}
      onClick={() => onOpenDetail(skill)}
      onKeyDown={e => e.key === "Enter" && onOpenDetail(skill)}
      className={cn(
        "group flex flex-col rounded-xl border bg-background overflow-hidden transition-all cursor-pointer",
        "hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        skill.enabled
          ? "border-border hover:border-violet-300 dark:hover:border-violet-700"
          : "border-border/60 opacity-75 hover:opacity-100 hover:border-border"
      )}
    >
      <div className="p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex-shrink-0 size-8 rounded-lg bg-muted flex items-center justify-center text-base">{skill.emoji}</span>
            <div className="min-w-0">
              <span className="text-sm font-medium leading-tight line-clamp-1">{skill.display_name}</span>
              <div className="flex items-center gap-1 mt-0.5">
                {oauthExpired && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-px rounded text-xs font-medium border leading-tight border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30">
                    <AlertTriangle className="size-2.5" />{t("reconnectNeeded")}
                  </span>
                )}
                {!oauthExpired && (skill.requires_api_key || !!skill.api_key_provider) && (
                  <span className={cn(
                    "inline-flex items-center gap-0.5 px-1.5 py-px rounded text-xs font-medium border leading-tight",
                    skill.has_api_key
                      ? "border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30"
                      : skill.requires_api_key
                        ? "border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30"
                        : "border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900/30"
                  )}>
                    <Key className="size-2.5" />
                    {skill.has_api_key ? t("configured") : skill.requires_api_key ? t("keyNeeded") : t("keyOptional")}
                  </span>
                )}
                {skill.uses_provider && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-px rounded text-xs font-medium border leading-tight border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30">
                    <Zap className="size-2.5" />{t("provider")}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-foreground"
              onClick={e => { e.stopPropagation(); onOpenDetail(skill) }} title={t("detailSettings")}>
              <Info className="size-3.5" />
            </Button>
            {isToggling ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : (
              <Switch checked={skill.enabled} onCheckedChange={() => onToggle(skill.id)} />
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground leading-snug line-clamp-2 pl-10">{skill.description}</p>
      </div>
    </div>
  )
}
