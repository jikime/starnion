"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { usePlannerStore } from "@/lib/planner-store"
import { useShallow } from "zustand/react/shallow"
import { cn } from "@/lib/utils"
import { Pencil, Check, Plus, Trash2 } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

const ROLE_COLORS = [
  "#58A6FF", "#3FB950", "#E3A948", "#BC8CFF",
  "#FF7B72", "#79C0FF", "#56D364", "#FFA657",
]

export function GuideTab() {
  const t = useTranslations("planner")
  const {
    missionStatement, setMissionStatement,
    roles, addRole, updateRole, deleteRole,
  } = usePlannerStore()

  const [editingMission, setEditingMission] = useState(false)
  const [missionDraft, setMissionDraft] = useState(missionStatement)
  const [addingRole, setAddingRole] = useState(false)
  const [newName, setNewName] = useState("")
  const [newColor, setNewColor] = useState(ROLE_COLORS[0])
  const [newMission, setNewMission] = useState("")
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
  const [roleDraft, setRoleDraft] = useState<{ name: string; mission: string }>({ name: "", mission: "" })

  const handleSaveMission = () => {
    setMissionStatement(missionDraft)
    setEditingMission(false)
  }

  const handleAddRole = () => {
    if (!newName.trim()) return
    addRole(newName.trim(), newColor, "", newMission.trim() || undefined)
    setNewName(""); setNewMission(""); setNewColor(ROLE_COLORS[0]); setAddingRole(false)
  }

  const startEditRole = (id: string, name: string, mission?: string) => {
    setEditingRoleId(id)
    setRoleDraft({ name, mission: mission ?? "" })
  }

  const saveEditRole = (id: string) => {
    updateRole?.(id, { name: roleDraft.name, mission: roleDraft.mission || undefined })
    setEditingRoleId(null)
  }

  return (
    <div className="flex flex-col sm:flex-row h-full overflow-hidden">
      {/* Mission column */}
      <div className="sm:w-80 shrink-0 border-b sm:border-b-0 sm:border-r border-border flex flex-col overflow-hidden">
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/40 shrink-0">
          <h2 className="text-lg font-bold text-foreground">{t("guide.missionTitle")}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t("guide.missionSubtitle")}</p>
        </div>
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4">
          {editingMission ? (
            <div className="space-y-3">
              <Textarea
                autoFocus
                value={missionDraft}
                onChange={(e) => setMissionDraft(e.target.value)}
                rows={8}
                className="text-sm bg-muted border-border resize-none"
                placeholder={t("guide.missionPlaceholder")}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSaveMission}
                  style={{ background: "var(--priority-a)", color: "#ffffff" }}
                  className="text-xs"
                >
                  {t("guide.save")}
                </Button>
                <Button
                  size="sm" variant="ghost"
                  onClick={() => { setMissionDraft(missionStatement); setEditingMission(false) }}
                  className="text-xs text-muted-foreground"
                >
                  {t("guide.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <blockquote
                className="border-l-2 pl-4 py-1 text-sm leading-relaxed text-foreground italic"
                style={{ borderColor: "var(--primary)" }}
              >
                {missionStatement || t("guide.missionEmpty")}
              </blockquote>
              <button
                onClick={() => { setMissionDraft(missionStatement); setEditingMission(true) }}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Pencil className="w-3 h-3" />
                {t("guide.editMission")}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Roles column */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/40 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-foreground">{t("guide.rolesTitle")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t("guide.rolesSubtitle")}</p>
          </div>
          <button
            onClick={() => setAddingRole(!addingRole)}
            className="flex items-center gap-1.5 h-8 px-3 rounded text-xs font-medium hover:opacity-80 transition-opacity"
            style={{ background: "var(--priority-a)", color: "#ffffff" }}
          >
            <Plus className="w-3.5 h-3.5" />
            {t("guide.addRole")}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4 space-y-3">
          {/* Add form */}
          {addingRole && (
            <div className="rounded-xl border border-border p-4 space-y-3 bg-card">
              <p className="text-xs font-semibold text-foreground">{t("guide.newRole")}</p>
              <div className="flex gap-2">
                <Input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t("guide.roleNamePlaceholder")}
                  className="h-8 text-sm bg-muted border-border flex-1"
                  onKeyDown={(e) => e.key === "Enter" && handleAddRole()}
                />
                <div className="flex gap-1">
                  {ROLE_COLORS.slice(0, 4).map((c) => (
                    <button
                      key={c}
                      onClick={() => setNewColor(c)}
                      className={cn(
                        "w-6 h-6 rounded-full transition-transform",
                        newColor === c && "scale-125 ring-2 ring-offset-1 ring-offset-background ring-white/40"
                      )}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
              <Input
                value={newMission}
                onChange={(e) => setNewMission(e.target.value)}
                placeholder={t("guide.roleMissionPlaceholder")}
                className="h-8 text-sm bg-muted border-border"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleAddRole} style={{ background: "var(--priority-a)", color: "#ffffff" }} className="text-xs">{t("guide.add")}</Button>
                <Button size="sm" variant="ghost" onClick={() => setAddingRole(false)} className="text-xs text-muted-foreground">{t("guide.cancel")}</Button>
              </div>
            </div>
          )}

          {/* Role cards */}
          {roles.map((role) => (
            <div
              key={role.id}
              className="group rounded-xl border border-border p-4 space-y-2 bg-card hover:bg-accent/10 transition-colors"
              style={{ borderLeftWidth: 3, borderLeftColor: role.color }}
            >
              {editingRoleId === role.id ? (
                <div className="space-y-2">
                  <Input
                    autoFocus
                    value={roleDraft.name}
                    onChange={(e) => setRoleDraft((d) => ({ ...d, name: e.target.value }))}
                    className="h-7 text-sm bg-muted border-border"
                  />
                  <Input
                    value={roleDraft.mission}
                    onChange={(e) => setRoleDraft((d) => ({ ...d, mission: e.target.value }))}
                    placeholder={t("guide.editRoleMissionPlaceholder")}
                    className="h-7 text-sm bg-muted border-border"
                  />
                  <div className="flex gap-1.5">
                    <Button size="sm" onClick={() => saveEditRole(role.id)} className="h-6 text-xs px-2" style={{ background: "var(--priority-a)", color: "#ffffff" }}>{t("guide.save")}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingRoleId(null)} className="h-6 text-xs px-2 text-muted-foreground">{t("guide.cancel")}</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: role.color }} />
                      <span className="text-sm font-semibold text-foreground">{role.name}</span>
                    </div>
                    <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => startEditRole(role.id, role.name, role.mission)}
                        className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
                        aria-label={t("guide.editLabel")}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => deleteRole?.(role.id)}
                        className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors"
                        aria-label={t("guide.deleteLabel")}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  {role.mission && (
                    <p className="text-xs text-muted-foreground leading-snug pl-4 italic">
                      {role.mission}
                    </p>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
