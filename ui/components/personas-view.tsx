"use client"

import { useEffect, useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Pencil, Trash2, Plus, Star, PenLine, UserCircle } from "lucide-react"

// ── Provider catalog (fallback when no models are enabled in DB) ─────────────

const PROVIDER_META: Record<string, { name: string; icon: string; models: { id: string; name: string }[] }> = {
  anthropic: {
    name: "Anthropic", icon: "🟣",
    models: [
      { id: "claude-opus-4-6",            name: "Claude Opus 4.6" },
      { id: "claude-opus-4-5",            name: "Claude Opus 4.5" },
      { id: "claude-opus-4-0",            name: "Claude Opus 4.0" },
      { id: "claude-sonnet-4-6",          name: "Claude Sonnet 4.6" },
      { id: "claude-sonnet-4-5",          name: "Claude Sonnet 4.5" },
      { id: "claude-sonnet-4-0",          name: "Claude Sonnet 4.0" },
      { id: "claude-3-7-sonnet-20250219", name: "Claude 3.7 Sonnet" },
      { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
      { id: "claude-3-5-haiku-20241022",  name: "Claude 3.5 Haiku" },
      { id: "claude-3-haiku-20240307",    name: "Claude 3 Haiku" },
    ],
  },
  gemini: {
    name: "Google Gemini", icon: "🔵",
    models: [
      { id: "gemini-2.5-pro",   name: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
      { id: "gemini-1.5-pro",   name: "Gemini 1.5 Pro" },
      { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash" },
    ],
  },
  openai: {
    name: "OpenAI", icon: "🟢",
    models: [
      { id: "gpt-5",       name: "GPT-5" },
      { id: "gpt-4.1",     name: "GPT-4.1" },
      { id: "gpt-4.1-mini",name: "GPT-4.1 Mini" },
      { id: "gpt-4o",      name: "GPT-4o" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini" },
      { id: "o3",          name: "o3" },
      { id: "o3-mini",     name: "o3 Mini" },
      { id: "o1",          name: "o1" },
    ],
  },
  zai: {
    name: "Z.AI", icon: "💎",
    models: [
      { id: "glm-5",        name: "GLM-5" },
      { id: "glm-4.7",      name: "GLM-4.7" },
      { id: "glm-4.6",      name: "GLM-4.6" },
      { id: "glm-4.5",      name: "GLM-4.5" },
      { id: "glm-4.5-air",  name: "GLM-4.5 Air" },
      { id: "glm-4.5-flash",name: "GLM-4.5 Flash" },
    ],
  },
  custom: {
    name: "Custom", icon: "⚙️",
    models: [],
  },
}

const PROVIDER_ORDER = ["anthropic", "gemini", "openai", "zai", "custom"]

// ── Types ───────────────────────────────────────────────────────────────────

interface Persona {
  id: string
  name: string
  description: string
  provider: string
  model: string
  systemPrompt: string
  isDefault: boolean
}

interface ProviderData {
  provider: string
  hasKey: boolean
  baseUrl: string
  enabledModels: string[]
}

interface PersonaForm {
  name: string
  description: string
  provider: string
  model: string
  systemPrompt: string
  isDefault: boolean
}

const EMPTY_FORM: PersonaForm = {
  name: "", description: "", provider: "", model: "", systemPrompt: "", isDefault: false,
}

const CUSTOM_MODEL_VALUE = "__custom__"

// ── Main component ──────────────────────────────────────────────────────────

export function PersonasView() {
  const t = useTranslations("personas")
  const [personas, setPersonas] = useState<Persona[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Persona | null>(null)
  const [form, setForm] = useState<PersonaForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  // Provider data from DB (for dynamic model lists)
  const [providerData, setProviderData] = useState<ProviderData[]>([])

  // Whether model is being entered manually (free-form)
  const [customModelMode, setCustomModelMode] = useState(false)

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const fetchPersonas = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/settings/personas", { cache: "no-store" })
      if (res.ok) {
        const data = await res.json()
        setPersonas(data.personas ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchProviders = useCallback(async () => {
    const res = await fetch("/api/settings/providers", { cache: "no-store" })
    if (res.ok) {
      const data = await res.json()
      setProviderData(data.providers ?? [])
    }
  }, [])

  useEffect(() => {
    fetchPersonas()
    fetchProviders()
  }, [fetchPersonas, fetchProviders])

  // ── Model helpers ─────────────────────────────────────────────────────────

  // Returns models available for the selected provider:
  // 1. Uses enabled models from DB if configured
  // 2. Falls back to PROVIDER_META catalog
  const availableModels = (): { id: string; name: string }[] => {
    const prov = form.provider
    if (!prov || prov === "custom") return []

    const dbProvider = providerData.find(p => p.provider === prov)
    const enabledIds = dbProvider?.enabledModels ?? []
    const catalogModels = PROVIDER_META[prov]?.models ?? []

    if (enabledIds.length > 0) {
      return enabledIds.map(id => {
        const found = catalogModels.find(m => m.id === id)
        return found ?? { id, name: id }
      })
    }

    return catalogModels
  }

  // Derived: connected providers (have key or baseUrl)
  const connectedProviders = providerData
    .filter(p => p.provider === "custom" ? !!p.baseUrl : p.hasKey)
    .map(p => p.provider)

  // ── Dialog helpers ────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setCustomModelMode(false)
    setDialogOpen(true)
  }

  const openEdit = (p: Persona) => {
    setEditing(p)
    // If model is not in the catalog for the provider, switch to custom mode
    const models = p.provider === "custom"
      ? []
      : availableModelsForProvider(p.provider)
    const inCatalog = models.some(m => m.id === p.model)
    setCustomModelMode(p.provider === "custom" || !inCatalog)
    setForm({
      name: p.name,
      description: p.description,
      provider: p.provider,
      model: p.model,
      systemPrompt: p.systemPrompt,
      isDefault: p.isDefault,
    })
    setDialogOpen(true)
  }

  // Helper: models for a given provider (for openEdit)
  const availableModelsForProvider = (prov: string): { id: string; name: string }[] => {
    if (!prov || prov === "custom") return []
    const dbProvider = providerData.find(p => p.provider === prov)
    const enabledIds = dbProvider?.enabledModels ?? []
    const catalogModels = PROVIDER_META[prov]?.models ?? []
    if (enabledIds.length > 0) {
      return enabledIds.map(id => {
        const found = catalogModels.find(m => m.id === id)
        return found ?? { id, name: id }
      })
    }
    return catalogModels
  }

  const handleProviderChange = (v: string) => {
    setForm(f => ({ ...f, provider: v, model: "" }))
    setCustomModelMode(v === "custom")
  }

  const handleModelSelect = (v: string) => {
    if (v === CUSTOM_MODEL_VALUE) {
      setCustomModelMode(true)
      setForm(f => ({ ...f, model: "" }))
    } else {
      setCustomModelMode(false)
      setForm(f => ({ ...f, model: v }))
    }
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  const savePersona = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const url = editing ? `/api/settings/personas/${editing.id}` : "/api/settings/personas"
      const method = editing ? "PUT" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        showToast(editing ? t("toast.updated") : t("toast.created"))
        setDialogOpen(false)
        fetchPersonas()
      } else {
        const data = await res.json().catch(() => ({}))
        showToast((data as { error?: string }).error ?? t("toast.saveFailed"), false)
      }
    } finally {
      setSaving(false)
    }
  }

  const setAsDefault = async (p: Persona) => {
    setSettingDefaultId(p.id)
    try {
      const res = await fetch(`/api/settings/personas/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: p.name,
          description: p.description,
          provider: p.provider,
          model: p.model,
          systemPrompt: p.systemPrompt,
          isDefault: true,
        }),
      })
      if (res.ok) {
        showToast(t("toast.defaultSet", { name: p.name }))
        fetchPersonas()
      } else {
        showToast(t("toast.defaultFailed"), false)
      }
    } finally {
      setSettingDefaultId(null)
    }
  }

  const deletePersona = async (id: string) => {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/settings/personas/${id}`, { method: "DELETE" })
      if (res.ok) {
        showToast(t("toast.deleted"))
        fetchPersonas()
      }
    } finally {
      setDeletingId(null)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const models = availableModels()
  // Determine dropdown value — if in custom mode show sentinel value
  const selectModelValue = customModelMode && form.provider !== "custom"
    ? CUSTOM_MODEL_VALUE
    : form.model

  return (
    <div className="p-6 space-y-6">
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 px-4 py-2 rounded shadow text-sm text-white ${
          toast.ok ? "bg-green-600" : "bg-red-500"
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <UserCircle className="size-6 text-primary" />
            {t("title")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t("subtitle")}
          </p>
        </div>
        <Button size="sm" onClick={openCreate} className="gap-1.5 shrink-0">
          <Plus className="h-4 w-4" />
          {t("newPersona")}
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : personas.length === 0 ? (
        <Card className="shadow-none border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <p>{t("empty")}</p>
            <p className="mt-1">{t("emptyHint")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {personas.map(p => {
            const provMeta = PROVIDER_META[p.provider]
            return (
              <Card key={p.id} className={`shadow-none ${p.isDefault ? "border-primary/50" : ""}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="flex items-center gap-1.5 text-sm">
                        {p.isDefault && (
                          <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400 shrink-0" />
                        )}
                        <span className="truncate">{p.name}</span>
                      </CardTitle>
                      {p.description && (
                        <CardDescription className="text-xs mt-0.5 truncate">
                          {p.description}
                        </CardDescription>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {!p.isDefault && (
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                          disabled={settingDefaultId === p.id}
                          onClick={() => setAsDefault(p)}
                          title={t("setDefaultTitle")}
                        >
                          <Star className="h-3.5 w-3.5" />
                          {t("setDefault")}
                        </Button>
                      )}
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => openEdit(p)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        disabled={deletingId === p.id}
                        onClick={() => deletePersona(p.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {p.provider && (
                      <Badge variant="secondary" className="text-xs gap-1">
                        {provMeta ? <span>{provMeta.icon}</span> : null}
                        {provMeta?.name ?? p.provider}
                      </Badge>
                    )}
                    {p.model && (
                      <Badge variant="outline" className="text-xs font-mono">
                        {p.model}
                      </Badge>
                    )}
                    {p.isDefault && (
                      <Badge className="text-xs bg-primary/10 text-primary border-primary/20">
                        {t("defaultBadge")}
                      </Badge>
                    )}
                  </div>
                  {p.systemPrompt && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {p.systemPrompt}
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg flex flex-col max-h-[90vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editing ? t("dialog.editTitle") : t("dialog.createTitle")}</DialogTitle>
            <DialogDescription>
              {t("dialog.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1 scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {/* Name */}
            <div className="space-y-1.5">
              <Label>{t("dialog.nameLabel")}</Label>
              <Input
                placeholder={t("dialog.namePlaceholder")}
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label>{t("dialog.descriptionLabel")}</Label>
              <Input
                placeholder={t("dialog.descriptionPlaceholder")}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

            {/* Provider */}
            <div className="space-y-1.5">
              <Label>{t("dialog.providerLabel")}</Label>
              <Select value={form.provider} onValueChange={handleProviderChange}>
                <SelectTrigger>
                  <SelectValue placeholder={t("dialog.providerPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_ORDER.map(pk => {
                    const m = PROVIDER_META[pk]
                    const connected = connectedProviders.includes(pk)
                    return (
                      <SelectItem key={pk} value={pk}>
                        <span className="flex items-center gap-2">
                          {m.icon} {m.name}
                          {!connected && (
                            <span className="text-xs text-muted-foreground">{t("notConnected")}</span>
                          )}
                        </span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Model */}
            <div className="space-y-1.5">
              <Label>{t("dialog.modelLabel")}</Label>

              {/* Custom provider → always text input */}
              {form.provider === "custom" ? (
                <Input
                  placeholder={t("dialog.customModelPlaceholder")}
                  value={form.model}
                  onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                  className="font-mono text-xs"
                />
              ) : (
                <>
                  <Select
                    value={selectModelValue}
                    onValueChange={handleModelSelect}
                    disabled={!form.provider}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={form.provider ? t("dialog.modelSelectPlaceholder") : t("dialog.modelProviderFirst")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map(m => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                          {m.name !== m.id && (
                            <span className="ml-1 text-xs text-muted-foreground font-mono">
                              {m.id}
                            </span>
                          )}
                        </SelectItem>
                      ))}
                      {/* Always offer free-form entry */}
                      <SelectItem value={CUSTOM_MODEL_VALUE}>
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <PenLine className="h-3.5 w-3.5" />
                          {t("dialog.modelCustom")}
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Free-form model text input */}
                  {customModelMode && (
                    <Input
                      autoFocus
                      placeholder={t("dialog.modelIdPlaceholder")}
                      value={form.model}
                      onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                      className="font-mono text-xs mt-1.5"
                    />
                  )}

                  {form.provider && models.length === 0 && !customModelMode && (
                    <p className="text-xs text-muted-foreground">
                      {t("dialog.noModelsHint")}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* System prompt */}
            <div className="space-y-1.5">
              <Label>{t("dialog.systemPromptLabel")}</Label>
              <Textarea
                placeholder={t("dialog.systemPromptPlaceholder")}
                value={form.systemPrompt}
                onChange={e => setForm(f => ({ ...f, systemPrompt: e.target.value }))}
                className="resize-none text-sm h-[180px]"
              />
            </div>

            {/* Default */}
            <div className="flex items-center gap-3 rounded-lg border border-border p-3">
              <Switch
                id="persona-default"
                checked={form.isDefault}
                onCheckedChange={v => setForm(f => ({ ...f, isDefault: v }))}
              />
              <div>
                <Label htmlFor="persona-default" className="text-sm font-medium cursor-pointer">
                  {t("dialog.defaultLabel")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("dialog.defaultHint")}
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 shrink-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("dialog.cancel")}
            </Button>
            <Button onClick={savePersona} disabled={saving || !form.name.trim()}>
              {saving ? t("dialog.saving") : editing ? t("dialog.update") : t("dialog.add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
