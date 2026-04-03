"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Key, Loader2, Eye, EyeOff, Trash2 } from "lucide-react"
import { toast } from "sonner"
import type { Skill } from "./types"

export function APIKeySection({ skill, onSaved, onDeleted }: {
  skill: Skill
  onSaved: (masked: string) => void
  onDeleted: () => void
}) {
  const tSkills = useTranslations("skills")
  const isDual = skill.api_key_type === "dual" || skill.api_key_type === "google_oauth"

  const [inputVal, setInputVal] = useState("")
  const [inputVal1, setInputVal1] = useState("")
  const [inputVal2, setInputVal2] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const canSave = isDual ? inputVal1.trim() !== "" && inputVal2.trim() !== "" : inputVal.trim() !== ""

  const handleSave = async () => {
    if (!canSave) return
    const apiKey = isDual ? `${inputVal1.trim()}:${inputVal2.trim()}` : inputVal.trim()
    setSaving(true)
    try {
      const res = await fetch(`/api/skills/${skill.id}/api-key`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey }),
      })
      if (res.ok) {
        const data = await res.json()
        onSaved(data.masked_key ?? "***")
        setInputVal(""); setInputVal1(""); setInputVal2("")
        setEditing(false)
        toast.success(tSkills("apiKeySaved"))
      } else {
        toast.error(tSkills("apiKeySaveError"))
      }
    } catch {
      toast.error(tSkills("apiKeySaveError"))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/skills/${skill.id}/api-key`, { method: "DELETE" })
      if (res.ok) {
        onDeleted()
        setEditing(false)
        toast.success(tSkills("apiKeyDeleted"))
      } else {
        toast.error(tSkills("apiKeyDeleteError"))
      }
    } catch {
      toast.error(tSkills("apiKeyDeleteError"))
    } finally {
      setDeleting(false)
    }
  }

  const handleCancel = () => { setEditing(false); setInputVal(""); setInputVal1(""); setInputVal2("") }

  return (
    <>
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tSkills("apiKeyDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{tSkills("apiKeyDeleteDesc", { name: skill.display_name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tSkills("cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleDelete}>
              {deleting ? <Loader2 className="size-3 animate-spin mr-1" /> : null}{tSkills("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Key className="size-3.5 text-amber-500 shrink-0" />
          <span className="text-xs font-semibold text-foreground">{skill.api_key_label ?? "API Key"}</span>
          {!skill.requires_api_key && <span className="text-xs text-muted-foreground">({tSkills("optional")})</span>}
          {skill.has_api_key && !editing && (
            <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30">
              <span className="size-1.5 rounded-full bg-emerald-400" />{tSkills("configured")}
            </span>
          )}
        </div>

        {skill.has_api_key && !editing ? (
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs text-muted-foreground font-mono bg-muted rounded px-2.5 py-1.5 truncate">{skill.masked_key}</code>
            <Button variant="ghost" size="sm" className="shrink-0 h-7 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => setEditing(true)}>
              {tSkills("change")}
            </Button>
            <Button variant="ghost" size="icon" className="shrink-0 size-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteDialogOpen(true)} disabled={deleting}>
              {deleting ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
            </Button>
          </div>
        ) : isDual ? (
          <div className="space-y-2">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">{skill.api_key_label_1 ?? "Key 1"}</label>
              <Input type="text" placeholder={skill.api_key_label_1 ?? "Key 1"} value={inputVal1} onChange={e => setInputVal1(e.target.value)} className="h-8 text-xs font-mono" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">{skill.api_key_label_2 ?? "Key 2"}</label>
              <div className="relative">
                <Input type={showKey ? "text" : "password"} placeholder={skill.api_key_label_2 ?? "Key 2"} value={inputVal2} onChange={e => setInputVal2(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSave()} className="h-8 text-xs pr-8 font-mono" />
                <button type="button" onClick={() => setShowKey(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" className="h-8 px-3 text-xs" onClick={handleSave} disabled={saving || !canSave}>
                {saving ? <Loader2 className="size-3 animate-spin" /> : tSkills("save")}
              </Button>
              {editing && <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground" onClick={handleCancel}>{tSkills("cancel")}</Button>}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input type={showKey ? "text" : "password"} placeholder={skill.api_key_label ?? tSkills("apiKeyInputPlaceholder")} value={inputVal} onChange={e => setInputVal(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSave()} className="h-8 text-xs pr-8 font-mono" />
              <button type="button" onClick={() => setShowKey(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            </div>
            <Button size="sm" className="shrink-0 h-8 px-3 text-xs" onClick={handleSave} disabled={saving || !canSave}>
              {saving ? <Loader2 className="size-3 animate-spin" /> : tSkills("save")}
            </Button>
            {editing && <Button variant="ghost" size="sm" className="shrink-0 h-8 px-2 text-xs text-muted-foreground" onClick={handleCancel}>{tSkills("cancel")}</Button>}
          </div>
        )}
      </div>
    </>
  )
}
