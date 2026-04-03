"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Loader2, Link2, Link2Off, AlertTriangle, Clock } from "lucide-react"
import { toast } from "sonner"
import type { Skill } from "./types"
import { isOAuthExpired } from "./types"

export function GoogleOAuthConnectSection({ skill, onDisconnected, onConnected }: {
  skill: Skill
  onDisconnected: () => void
  onConnected: () => void
}) {
  const tSkills = useTranslations("skills")
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const expired = isOAuthExpired(skill.oauth_expires_at)

  const handleConnect = async () => {
    setConnecting(true)
    try {
      const res = await fetch(`/api/skills/${skill.id}/oauth-url`)
      if (!res.ok) return
      const data = await res.json()
      if (!data.url) return
      const popup = window.open(data.url, "google-oauth", "width=520,height=620,left=200,top=100,resizable=yes,scrollbars=yes")
      if (!popup) return
      const onMessage = (e: MessageEvent) => {
        if (e.data?.type === "google-oauth-success") {
          window.removeEventListener("message", onMessage)
          setConnecting(false)
          onConnected()
          toast.success(tSkills("googleConnected"))
        }
      }
      window.addEventListener("message", onMessage)
      const pollClosed = setInterval(() => {
        if (popup.closed) { clearInterval(pollClosed); window.removeEventListener("message", onMessage); setConnecting(false) }
      }, 500)
    } catch {
      setConnecting(false)
      toast.error(tSkills("connectError"))
    }
  }

  const handleDisconnect = async () => {
    setDisconnecting(true)
    try {
      const res = await fetch(`/api/skills/${skill.id}/oauth-disconnect`, { method: "DELETE" })
      if (res.ok) { onDisconnected(); toast.success(tSkills("googleDisconnected")) }
      else toast.error(tSkills("disconnectError"))
    } finally { setDisconnecting(false) }
  }

  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-base">🔵</span>
        <span className="text-xs font-semibold text-foreground">{tSkills("googleAccountConnect")}</span>
        {skill.oauth_connected && !expired && (
          <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30">
            <span className="size-1.5 rounded-full bg-emerald-400" />{tSkills("connected")}
          </span>
        )}
        {skill.oauth_connected && expired && (
          <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30">
            <AlertTriangle className="size-2.5" />{tSkills("expiredReconnect")}
          </span>
        )}
      </div>
      {skill.oauth_connected && expired && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2">
          <p className="text-xs text-red-700 dark:text-red-300">{tSkills("oauthExpiredDesc")}</p>
        </div>
      )}
      {skill.oauth_connected && !expired ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 space-y-0.5">
            <p className="text-xs text-muted-foreground">{tSkills("googleAccountConnected")}</p>
            {skill.oauth_expires_at && (
              <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                <Clock className="size-2.5" />{tSkills("oauthExpiry", { date: new Date(skill.oauth_expires_at).toLocaleString() })}
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" className="shrink-0 h-7 px-2 text-xs text-muted-foreground hover:text-destructive" onClick={handleDisconnect} disabled={disconnecting}>
            {disconnecting ? <Loader2 className="size-3 animate-spin" /> : <><Link2Off className="size-3 mr-1" />{tSkills("disconnect")}</>}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {!expired && <p className="text-xs text-muted-foreground">{tSkills("oauthSetupHint")}</p>}
          <Button size="sm" className="h-8 px-3 text-xs w-full" onClick={handleConnect} disabled={connecting} variant={expired ? "destructive" : "default"}>
            {connecting ? <Loader2 className="size-3 animate-spin mr-1.5" /> : <Link2 className="size-3 mr-1.5" />}
            {expired ? tSkills("reconnect") : tSkills("googleAccountConnect")}
          </Button>
        </div>
      )}
    </div>
  )
}
