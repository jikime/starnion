"use client"

import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { Info, Loader2, Zap, MessageSquare, ToggleLeft, ToggleRight, Key, AlertTriangle } from "lucide-react"
import type { Skill } from "./types"
import { isOAuthExpired } from "./types"
import { APIKeySection } from "./api-key-section"
import { GoogleOAuthConnectSection } from "./google-oauth-section"

export function SkillDetailSheet({
  skill, open, onOpenChange, onToggle, isToggling,
  onAPIKeySaved, onAPIKeyDeleted, onOAuthDisconnected, onOAuthConnected,
}: {
  skill: Skill | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onToggle: (skillId: string) => void
  isToggling: boolean
  onAPIKeySaved: (skillId: string, masked: string) => void
  onAPIKeyDeleted: (skillId: string) => void
  onOAuthDisconnected: (skillId: string) => void
  onOAuthConnected: (skillId: string) => void
}) {
  const t = useTranslations("skills")
  if (!skill) return null
  const oauthExpired = isOAuthExpired(skill.oauth_expires_at)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0 gap-0 overflow-hidden">
        {/* Hero header */}
        <div className="relative bg-gradient-to-br from-primary/10 via-primary/5 to-background px-6 pt-8 pb-6 border-b border-border/60">
          <div className="flex items-start gap-4 pr-8">
            <div className="flex-shrink-0 size-14 rounded-2xl bg-background border border-border/60 flex items-center justify-center text-3xl">{skill.emoji}</div>
            <div className="flex-1 min-w-0 pt-1">
              <SheetTitle className="text-xl font-bold leading-tight mb-1">{skill.display_name}</SheetTitle>
              <SheetDescription className="sr-only">{skill.description}</SheetDescription>
              <div className="flex items-center gap-1.5 flex-wrap">
                {(skill.requires_api_key || !!skill.api_key_provider) && (
                  <span className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border",
                    skill.api_key_type === "google_oauth"
                      ? skill.oauth_connected && !oauthExpired
                        ? "border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30"
                        : oauthExpired
                          ? "border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30"
                          : skill.has_api_key
                            ? "border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30"
                            : "border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900/30"
                      : skill.has_api_key
                        ? "border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30"
                        : skill.requires_api_key
                          ? "border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30"
                          : "border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900/30"
                  )}>
                    <Key className="size-2.5" />
                    {skill.api_key_type === "google_oauth"
                      ? skill.oauth_connected && !oauthExpired ? t("googleLinked") : oauthExpired ? t("reconnectNeeded") : skill.has_api_key ? t("connectNeeded") : t("keyNeeded")
                      : skill.has_api_key ? t("keyConfigured") : skill.requires_api_key ? t("keyNeeded") : t("keyOptional")}
                  </span>
                )}
                {skill.uses_provider && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30">
                    <Zap className="size-2.5" />{t("provider")}
                  </span>
                )}
                <button disabled={isToggling} onClick={() => onToggle(skill.id)}
                  className={cn("inline-flex items-center gap-1 text-xs font-medium transition-opacity",
                    isToggling && "opacity-50 cursor-not-allowed",
                    skill.enabled ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                  )}>
                  {isToggling ? <Loader2 className="size-3.5 animate-spin" /> : skill.enabled ? <ToggleRight className="size-3.5" /> : <ToggleLeft className="size-3.5" />}
                  {skill.enabled ? "ON" : "OFF"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {(skill.requires_api_key || !!skill.api_key_provider) && (
            <>
              <APIKeySection skill={skill} onSaved={masked => onAPIKeySaved(skill.id, masked)} onDeleted={() => onAPIKeyDeleted(skill.id)} />
              {skill.api_key_type === "google_oauth" && skill.has_api_key && (
                <GoogleOAuthConnectSection skill={skill} onDisconnected={() => onOAuthDisconnected(skill.id)} onConnected={() => onOAuthConnected(skill.id)} />
              )}
              <div className="border-t border-border/50" />
            </>
          )}
          {skill.uses_provider && (
            <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 flex items-start gap-3">
              <Zap className="size-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">{t("usesProviderNote")}</p>
            </div>
          )}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="size-5 rounded-md bg-violet-100 dark:bg-violet-950 flex items-center justify-center"><MessageSquare className="size-3 text-violet-500" /></div>
              <h3 className="text-sm font-semibold">{t("about")}</h3>
            </div>
            <p className="text-xs text-muted-foreground pl-7 leading-relaxed">{skill.description}</p>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="size-5 rounded-md bg-amber-100 dark:bg-amber-950 flex items-center justify-center"><Info className="size-3 text-amber-500" /></div>
              <h3 className="text-sm font-semibold">{t("howToUse")}</h3>
            </div>
            <div className="pl-7 space-y-2">
              <p className="text-xs text-muted-foreground leading-relaxed">{t("howToUseDesc")}</p>
              <div className="rounded-lg bg-muted/50 border border-border/50 px-3 py-2 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">{t("examplePrompt")}</p>
                <div className="space-y-1">
                  <p className="text-xs text-foreground font-mono bg-background rounded px-2 py-1 border border-border/50">
                    &quot;{t("examplePrompt1", { name: skill.display_name })}&quot;
                  </p>
                  <p className="text-xs text-foreground font-mono bg-background rounded px-2 py-1 border border-border/50">
                    &quot;{t("examplePrompt2", { emoji: skill.emoji, name: skill.display_name })}&quot;
                  </p>
                </div>
              </div>
              {skill.requires_api_key && !skill.has_api_key && (
                <div className="flex items-start gap-1.5 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="size-3 shrink-0 mt-0.5" /><p className="text-xs">{t("apiKeyRequired")}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
