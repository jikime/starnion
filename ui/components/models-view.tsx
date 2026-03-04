"use client"

import { useEffect, useState, useCallback } from "react"
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Eye, EyeOff, Pencil, Trash2, Plus, Star, ExternalLink, RefreshCw } from "lucide-react"

// ── Provider catalog ────────────────────────────────────────────────────────

interface ModelMeta {
  id: string
  name: string
  context: string
}

interface ProviderMeta {
  name: string
  icon: string
  keyHint: string
  keyUrl?: string
  needsBaseUrl?: boolean
  baseUrlPlaceholder?: string
  models: ModelMeta[]
}

const PROVIDER_META: Record<string, ProviderMeta> = {
  anthropic: {
    name: "Anthropic",
    icon: "🟣",
    keyHint: "sk-ant-api03-...",
    keyUrl: "https://console.anthropic.com/settings/keys",
    models: [
      // Claude 4
      { id: "claude-opus-4-20250514",      name: "Claude Opus 4",           context: "200K" },
      { id: "claude-sonnet-4-20250514",    name: "Claude Sonnet 4",         context: "200K" },
      // Claude 3.7
      { id: "claude-3-7-sonnet-20250219",  name: "Claude 3.7 Sonnet",       context: "200K" },
      { id: "claude-3-7-sonnet-latest",    name: "Claude 3.7 Sonnet Latest", context: "200K" },
      // Claude 3.5
      { id: "claude-3-5-sonnet-20240620",  name: "Claude 3.5 Sonnet (Jun)", context: "200K" },
      { id: "claude-3-5-sonnet-20241022",  name: "Claude 3.5 Sonnet (Oct)", context: "200K" },
      { id: "claude-3-5-haiku-20241022",   name: "Claude 3.5 Haiku",        context: "200K" },
      { id: "claude-3-5-haiku-latest",     name: "Claude 3.5 Haiku Latest", context: "200K" },
      // Claude 3
      { id: "claude-3-haiku-20240307",     name: "Claude 3 Haiku",          context: "200K" },
    ],
  },
  gemini: {
    name: "Google Gemini",
    icon: "🔵",
    keyHint: "AIzaSy...",
    keyUrl: "https://aistudio.google.com/app/apikey",
    models: [
      // Gemini 2.5
      { id: "gemini-2.5-pro",              name: "Gemini 2.5 Pro",          context: "1M"   },
      { id: "gemini-2.5-flash",            name: "Gemini 2.5 Flash",        context: "1M"   },
      // Gemini 2.0
      { id: "gemini-2.0-flash",            name: "Gemini 2.0 Flash",        context: "1M"   },
      { id: "gemini-2.0-flash-lite",       name: "Gemini 2.0 Flash Lite",   context: "1M"   },
      // Gemini 1.5
      { id: "gemini-1.5-pro",              name: "Gemini 1.5 Pro",          context: "2M"   },
      { id: "gemini-1.5-flash",            name: "Gemini 1.5 Flash",        context: "1M"   },
      { id: "gemini-1.5-flash-8b",         name: "Gemini 1.5 Flash 8B",     context: "1M"   },
    ],
  },
  openai: {
    name: "OpenAI",
    icon: "🟢",
    keyHint: "sk-...",
    keyUrl: "https://platform.openai.com/api-keys",
    models: [
      // GPT-4.1
      { id: "gpt-4.1",                     name: "GPT-4.1",                 context: "1M"   },
      { id: "gpt-4.1-mini",                name: "GPT-4.1 Mini",            context: "1M"   },
      { id: "gpt-4.1-nano",                name: "GPT-4.1 Nano",            context: "1M"   },
      // GPT-4o
      { id: "gpt-4o",                      name: "GPT-4o",                  context: "128K" },
      { id: "gpt-4o-mini",                 name: "GPT-4o Mini",             context: "128K" },
      // GPT-4
      { id: "gpt-4-turbo",                 name: "GPT-4 Turbo",             context: "128K" },
      // o-series
      { id: "o4-mini",                     name: "o4 Mini",                 context: "200K" },
      { id: "o3",                          name: "o3",                      context: "200K" },
      { id: "o3-mini",                     name: "o3 Mini",                 context: "200K" },
      { id: "o1",                          name: "o1",                      context: "200K" },
      { id: "o1-mini",                     name: "o1 Mini",                 context: "128K" },
    ],
  },
  zai: {
    name: "Z.AI",
    icon: "💎",
    keyHint: "zai-...",
    keyUrl: "https://platform.z.ai",
    models: [
      // GLM-5
      { id: "glm-5",                       name: "GLM-5",                   context: "128K" },
      // GLM-4.7
      { id: "glm-4.7",                     name: "GLM-4.7",                 context: "128K" },
      { id: "glm-4.7-flash",               name: "GLM-4.7 Flash",           context: "128K" },
      // GLM-4.6
      { id: "glm-4.6",                     name: "GLM-4.6",                 context: "128K" },
      { id: "glm-4.6v",                    name: "GLM-4.6V",                context: "128K" },
      // GLM-4.5
      { id: "glm-4.5",                     name: "GLM-4.5",                 context: "128K" },
      { id: "glm-4.5-air",                 name: "GLM-4.5 Air",             context: "128K" },
      { id: "glm-4.5-flash",               name: "GLM-4.5 Flash",           context: "128K" },
      { id: "glm-4.5v",                    name: "GLM-4.5V",                context: "128K" },
    ],
  },
  custom: {
    name: "Custom Endpoint",
    icon: "⚙️",
    keyHint: "(optional)",
    needsBaseUrl: true,
    baseUrlPlaceholder: "http://localhost:1234/v1",
    models: [],
  },
}

const PROVIDER_ORDER = ["anthropic", "gemini", "openai", "zai", "custom"]

// ── Types ───────────────────────────────────────────────────────────────────

interface ProviderState {
  provider: string
  apiKeyMasked: string
  hasKey: boolean
  baseUrl: string
  enabledModels: string[]
}

interface Persona {
  id: string
  name: string
  description: string
  provider: string
  model: string
  systemPrompt: string
  isDefault: boolean
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
  name: "",
  description: "",
  provider: "",
  model: "",
  systemPrompt: "",
  isDefault: false,
}

// ── Main component ──────────────────────────────────────────────────────────

export function ModelsView() {
  // Providers state
  const [savedProviders, setSavedProviders] = useState<ProviderState[]>([])
  const [providerLoading, setProviderLoading] = useState(true)

  // Per-provider form state
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [baseUrls, setBaseUrls] = useState<Record<string, string>>({})
  const [enabledModels, setEnabledModels] = useState<Record<string, Set<string>>>({})
  const [customModelInput, setCustomModelInput] = useState("")
  const [customModels, setCustomModels] = useState<string[]>([])
  const [savingProvider, setSavingProvider] = useState<string | null>(null)

  // Personas state
  const [personas, setPersonas] = useState<Persona[]>([])
  const [personaLoading, setPersonaLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null)
  const [form, setForm] = useState<PersonaForm>(EMPTY_FORM)
  const [savingPersona, setSavingPersona] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Toast
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  // ── Fetch providers ──────────────────────────────────────────────────────

  const fetchProviders = useCallback(async () => {
    setProviderLoading(true)
    try {
      const res = await fetch("/api/settings/providers", { cache: "no-store" })
      if (res.ok) {
        const data = await res.json()
        const list: ProviderState[] = data.providers ?? []
        setSavedProviders(list)

        // Seed enabledModels from saved data
        const em: Record<string, Set<string>> = {}
        const bu: Record<string, string> = {}
        const cm: string[] = []
        for (const p of list) {
          em[p.provider] = new Set(p.enabledModels)
          if (p.baseUrl) bu[p.provider] = p.baseUrl
          if (p.provider === "custom") {
            // custom models are user-defined
            for (const m of p.enabledModels) cm.push(m)
          }
        }
        setEnabledModels(em)
        setBaseUrls(bu)
        setCustomModels(cm)
      }
    } finally {
      setProviderLoading(false)
    }
  }, [])

  // ── Fetch personas ───────────────────────────────────────────────────────

  const fetchPersonas = useCallback(async () => {
    setPersonaLoading(true)
    try {
      const res = await fetch("/api/settings/personas", { cache: "no-store" })
      if (res.ok) {
        const data = await res.json()
        setPersonas(data.personas ?? [])
      }
    } finally {
      setPersonaLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProviders()
    fetchPersonas()
  }, [fetchProviders, fetchPersonas])

  // ── Provider helpers ─────────────────────────────────────────────────────

  const savedFor = (provider: string) =>
    savedProviders.find(p => p.provider === provider)

  const toggleModel = (provider: string, modelId: string) => {
    setEnabledModels(prev => {
      const next = new Map(Object.entries(prev))
      const set = new Set(next.get(provider) ?? [])
      if (set.has(modelId)) set.delete(modelId)
      else set.add(modelId)
      next.set(provider, set)
      return Object.fromEntries(next)
    })
  }

  const saveProvider = async (provider: string) => {
    setSavingProvider(provider)
    try {
      const models = provider === "custom"
        ? customModels
        : [...(enabledModels[provider] ?? [])]

      const body: Record<string, unknown> = {
        provider,
        apiKey: apiKeys[provider] ?? "",
        baseUrl: baseUrls[provider] ?? "",
        enabledModels: models,
      }
      const res = await fetch("/api/settings/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        showToast(`${PROVIDER_META[provider]?.name ?? provider} 저장됐어요.`)
        // Clear the api key input (keep blank after save for security)
        setApiKeys(prev => ({ ...prev, [provider]: "" }))
        fetchProviders()
      } else {
        const data = await res.json().catch(() => ({}))
        showToast((data as { error?: string }).error ?? "저장에 실패했어요.", false)
      }
    } finally {
      setSavingProvider(null)
    }
  }

  const removeProvider = async (provider: string) => {
    const res = await fetch(`/api/settings/providers/${provider}`, { method: "DELETE" })
    if (res.ok) {
      showToast(`${PROVIDER_META[provider]?.name ?? provider} 제거됐어요.`)
      fetchProviders()
    }
  }

  // ── Persona helpers ──────────────────────────────────────────────────────

  const openCreate = () => {
    setEditingPersona(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  const openEdit = (p: Persona) => {
    setEditingPersona(p)
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

  const savePersona = async () => {
    if (!form.name.trim()) return
    setSavingPersona(true)
    try {
      const url = editingPersona
        ? `/api/settings/personas/${editingPersona.id}`
        : "/api/settings/personas"
      const method = editingPersona ? "PUT" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        showToast(editingPersona ? "페르소나가 수정됐어요." : "페르소나가 추가됐어요.")
        setDialogOpen(false)
        fetchPersonas()
      } else {
        const data = await res.json().catch(() => ({}))
        showToast((data as { error?: string }).error ?? "저장에 실패했어요.", false)
      }
    } finally {
      setSavingPersona(false)
    }
  }

  const deletePersona = async (id: string) => {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/settings/personas/${id}`, { method: "DELETE" })
      if (res.ok) {
        showToast("페르소나가 삭제됐어요.")
        fetchPersonas()
      }
    } finally {
      setDeletingId(null)
    }
  }

  // Models available for selected provider in persona form
  const availableModels = (): ModelMeta[] => {
    if (!form.provider) return []
    const meta = PROVIDER_META[form.provider]
    if (!meta) return []
    if (form.provider === "custom") {
      return customModels.map(m => ({ id: m, name: m, context: "" }))
    }
    const enabled = enabledModels[form.provider]
    return enabled && enabled.size > 0
      ? meta.models.filter(m => enabled.has(m.id))
      : meta.models
  }

  // Connected providers (have API key saved)
  const connectedProviders = PROVIDER_ORDER.filter(p => {
    const s = savedFor(p)
    if (p === "custom") return s && s.baseUrl !== ""
    return s?.hasKey
  })

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 px-4 py-2 rounded shadow text-sm text-white ${
          toast.ok ? "bg-green-600" : "bg-red-500"
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">모델 &amp; 페르소나</h1>
        <p className="text-muted-foreground text-sm mt-1">
          LLM 프로바이더 API 키를 설정하고, 용도별 페르소나를 만들어보세요.
        </p>
      </div>

      <Tabs defaultValue="providers" className="space-y-6">
        <TabsList>
          <TabsTrigger value="providers">프로바이더</TabsTrigger>
          <TabsTrigger value="personas">페르소나</TabsTrigger>
        </TabsList>

        {/* ── Providers Tab ── */}
        <TabsContent value="providers" className="space-y-0">
          {providerLoading ? (
            <p className="text-sm text-muted-foreground">불러오는 중...</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {PROVIDER_ORDER.map(providerKey => {
                const meta = PROVIDER_META[providerKey]
                const saved = savedFor(providerKey)
                const isConnected = providerKey === "custom"
                  ? !!(saved?.baseUrl)
                  : !!saved?.hasKey
                const isSaving = savingProvider === providerKey
                const keyVal = apiKeys[providerKey] ?? ""
                const showKey = showKeys[providerKey] ?? false
                const baseUrl = baseUrls[providerKey] ?? ""
                const enabled = enabledModels[providerKey] ?? new Set<string>()

                return (
                  <Card key={providerKey} className={isConnected ? "border-border" : "border-dashed"}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <span className="text-lg">{meta.icon}</span>
                          {meta.name}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          {isConnected
                            ? <Badge className="bg-green-500 text-white text-xs">연결됨</Badge>
                            : <Badge variant="outline" className="text-xs">미연결</Badge>}
                          {isConnected && (
                            <Button
                              variant="ghost" size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              onClick={() => removeProvider(providerKey)}
                              title="제거"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                      {isConnected && saved?.apiKeyMasked && (
                        <CardDescription className="text-xs font-mono mt-0.5">
                          {saved.apiKeyMasked}
                        </CardDescription>
                      )}
                    </CardHeader>

                    <CardContent className="space-y-4">
                      {/* API Key */}
                      {providerKey !== "custom" && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">
                              API 키{" "}
                              {meta.keyUrl && (
                                <a
                                  href={meta.keyUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-0.5 text-primary hover:underline"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  발급
                                </a>
                              )}
                            </Label>
                          </div>
                          <div className="flex gap-1.5">
                            <Input
                              type={showKey ? "text" : "password"}
                              placeholder={isConnected ? "새 키로 교체하려면 입력" : meta.keyHint}
                              value={keyVal}
                              onChange={e => setApiKeys(prev => ({ ...prev, [providerKey]: e.target.value }))}
                              className="flex-1 font-mono text-xs h-8"
                            />
                            <Button
                              variant="ghost" size="icon"
                              className="h-8 w-8 shrink-0"
                              onClick={() => setShowKeys(prev => ({ ...prev, [providerKey]: !showKey }))}
                            >
                              {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Base URL (custom) */}
                      {meta.needsBaseUrl && (
                        <div className="space-y-1.5">
                          <Label className="text-xs">Base URL</Label>
                          <Input
                            placeholder={meta.baseUrlPlaceholder}
                            value={baseUrl}
                            onChange={e => setBaseUrls(prev => ({ ...prev, [providerKey]: e.target.value }))}
                            className="font-mono text-xs h-8"
                          />
                        </div>
                      )}

                      {/* Models — checkbox list */}
                      {meta.models.length > 0 && (
                        <div className="space-y-1.5">
                          <Label className="text-xs">사용할 모델</Label>
                          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                            {meta.models.map(m => (
                              <div key={m.id} className="flex items-center gap-2">
                                <Checkbox
                                  id={`${providerKey}-${m.id}`}
                                  checked={enabled.has(m.id)}
                                  onCheckedChange={() => toggleModel(providerKey, m.id)}
                                />
                                <label
                                  htmlFor={`${providerKey}-${m.id}`}
                                  className="text-xs cursor-pointer flex items-center gap-1.5"
                                >
                                  {m.name}
                                  <span className="text-muted-foreground">{m.context}</span>
                                </label>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Custom endpoint: user-defined models */}
                      {providerKey === "custom" && (
                        <div className="space-y-1.5">
                          <Label className="text-xs">모델 목록</Label>
                          <div className="flex gap-1.5">
                            <Input
                              placeholder="model-name 입력 후 추가"
                              value={customModelInput}
                              onChange={e => setCustomModelInput(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter" && customModelInput.trim()) {
                                  setCustomModels(prev => [...new Set([...prev, customModelInput.trim()])])
                                  setCustomModelInput("")
                                }
                              }}
                              className="flex-1 font-mono text-xs h-8"
                            />
                            <Button
                              variant="outline" size="sm" className="h-8 px-2"
                              onClick={() => {
                                if (customModelInput.trim()) {
                                  setCustomModels(prev => [...new Set([...prev, customModelInput.trim()])])
                                  setCustomModelInput("")
                                }
                              }}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          {customModels.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {customModels.map(m => (
                                <Badge
                                  key={m} variant="secondary"
                                  className="text-xs gap-1 cursor-pointer hover:bg-destructive/10"
                                  onClick={() => setCustomModels(prev => prev.filter(x => x !== m))}
                                >
                                  {m} ×
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <Button
                        size="sm" className="w-full h-8"
                        disabled={isSaving}
                        onClick={() => saveProvider(providerKey)}
                      >
                        {isSaving ? (
                          <><RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" />저장중...</>
                        ) : isConnected ? "업데이트" : "연결"}
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Personas Tab ── */}
        <TabsContent value="personas" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              용도별 페르소나를 만들고 각각 다른 프로바이더와 모델을 지정하세요.
            </p>
            <Button size="sm" onClick={openCreate} className="gap-1.5">
              <Plus className="h-4 w-4" />
              새 페르소나
            </Button>
          </div>

          {personaLoading ? (
            <p className="text-sm text-muted-foreground">불러오는 중...</p>
          ) : personas.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                <p>아직 페르소나가 없어요.</p>
                <p className="mt-1">위 버튼으로 첫 페르소나를 만들어보세요.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {personas.map(p => {
                const provMeta = PROVIDER_META[p.provider]
                return (
                  <Card key={p.id} className={p.isDefault ? "border-primary/50" : ""}>
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
                    <CardContent className="pt-0">
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
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Persona create / edit dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPersona ? "페르소나 수정" : "새 페르소나"}</DialogTitle>
            <DialogDescription>
              페르소나 이름과 사용할 프로바이더 / 모델을 설정하세요.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label>이름 *</Label>
              <Input
                placeholder="예: 비서, 코드 리뷰어, 번역가"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label>설명</Label>
              <Input
                placeholder="이 페르소나의 역할을 간단히 설명하세요"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

            {/* Provider */}
            <div className="space-y-1.5">
              <Label>프로바이더</Label>
              <Select
                value={form.provider}
                onValueChange={v => setForm(f => ({ ...f, provider: v, model: "" }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="프로바이더 선택" />
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
                            <span className="text-xs text-muted-foreground">(미연결)</span>
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
              <Label>모델</Label>
              <Select
                value={form.model}
                onValueChange={v => setForm(f => ({ ...f, model: v }))}
                disabled={!form.provider}
              >
                <SelectTrigger>
                  <SelectValue placeholder={form.provider ? "모델 선택" : "프로바이더를 먼저 선택하세요"} />
                </SelectTrigger>
                <SelectContent>
                  {availableModels().map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      <span className="flex items-center gap-2">
                        {m.name}
                        {m.context && (
                          <span className="text-xs text-muted-foreground">{m.context}</span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.provider && availableModels().length === 0 && form.provider !== "custom" && (
                <p className="text-xs text-muted-foreground">
                  프로바이더 탭에서 사용할 모델을 먼저 선택하세요.
                </p>
              )}
            </div>

            {/* System prompt */}
            <div className="space-y-1.5">
              <Label>시스템 프롬프트</Label>
              <Textarea
                placeholder="이 페르소나에게 부여할 역할과 지침을 작성하세요."
                value={form.systemPrompt}
                onChange={e => setForm(f => ({ ...f, systemPrompt: e.target.value }))}
                rows={4}
                className="resize-none text-sm"
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
                  기본 페르소나로 설정
                </Label>
                <p className="text-xs text-muted-foreground">채팅 시 이 페르소나를 기본으로 사용해요.</p>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={savePersona} disabled={savingPersona || !form.name.trim()}>
              {savingPersona ? "저장중..." : editingPersona ? "수정" : "추가"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
