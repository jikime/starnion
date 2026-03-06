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
import { Checkbox } from "@/components/ui/checkbox"
import { Eye, EyeOff, Trash2, Plus, ExternalLink, RefreshCw } from "lucide-react"

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
      // Claude Opus 4.x
      { id: "claude-opus-4-6",             name: "Claude Opus 4.6",         context: "200K" },
      { id: "claude-opus-4-5-20251101",    name: "Claude Opus 4.5 (Nov)",   context: "200K" },
      { id: "claude-opus-4-5",             name: "Claude Opus 4.5",         context: "200K" },
      { id: "claude-opus-4-1-20250805",    name: "Claude Opus 4.1 (Aug)",   context: "200K" },
      { id: "claude-opus-4-1",             name: "Claude Opus 4.1",         context: "200K" },
      { id: "claude-opus-4-20250514",      name: "Claude Opus 4",           context: "200K" },
      { id: "claude-opus-4-0",             name: "Claude Opus 4.0",         context: "200K" },
      // Claude Sonnet 4.x
      { id: "claude-sonnet-4-6",           name: "Claude Sonnet 4.6",       context: "200K" },
      { id: "claude-sonnet-4-5-20250929",  name: "Claude Sonnet 4.5 (Sep)", context: "200K" },
      { id: "claude-sonnet-4-5",           name: "Claude Sonnet 4.5",       context: "200K" },
      { id: "claude-sonnet-4-20250514",    name: "Claude Sonnet 4",         context: "200K" },
      { id: "claude-sonnet-4-0",           name: "Claude Sonnet 4.0",       context: "200K" },
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
      // Gemini 3 (Preview)
      { id: "gemini-3-pro-preview",        name: "Gemini 3 Pro Preview",    context: "1M"   },
      { id: "gemini-3.1-pro-preview",      name: "Gemini 3.1 Pro Preview",  context: "1M"   },
      { id: "gemini-3-flash-preview",      name: "Gemini 3 Flash Preview",  context: "1M"   },
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
      // GPT-5.3
      { id: "gpt-5.3-codex",               name: "GPT-5.3 Codex",           context: "1M"   },
      { id: "gpt-5.3-codex-spark",         name: "GPT-5.3 Codex Spark",     context: "1M"   },
      // GPT-5.2
      { id: "gpt-5.2",                     name: "GPT-5.2",                 context: "1M"   },
      { id: "gpt-5.2-chat-latest",         name: "GPT-5.2 Chat Latest",     context: "1M"   },
      { id: "gpt-5.2-codex",               name: "GPT-5.2 Codex",           context: "1M"   },
      { id: "gpt-5.2-pro",                 name: "GPT-5.2 Pro",             context: "1M"   },
      // GPT-5.1
      { id: "gpt-5.1",                     name: "GPT-5.1",                 context: "1M"   },
      { id: "gpt-5.1-chat-latest",         name: "GPT-5.1 Chat Latest",     context: "1M"   },
      { id: "gpt-5.1-codex",               name: "GPT-5.1 Codex",           context: "1M"   },
      { id: "gpt-5.1-codex-max",           name: "GPT-5.1 Codex Max",       context: "1M"   },
      { id: "gpt-5.1-codex-mini",          name: "GPT-5.1 Codex Mini",      context: "1M"   },
      // GPT-5
      { id: "gpt-5",                       name: "GPT-5",                   context: "1M"   },
      { id: "gpt-5-chat-latest",           name: "GPT-5 Chat Latest",       context: "1M"   },
      { id: "gpt-5-codex",                 name: "GPT-5 Codex",             context: "1M"   },
      { id: "gpt-5-mini",                  name: "GPT-5 Mini",              context: "1M"   },
      { id: "gpt-5-nano",                  name: "GPT-5 Nano",              context: "1M"   },
      { id: "gpt-5-pro",                   name: "GPT-5 Pro",               context: "1M"   },
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

// ── Main component ──────────────────────────────────────────────────────────

export function ModelsView() {
  const t = useTranslations("models")
  const [savedProviders, setSavedProviders] = useState<ProviderState[]>([])
  const [providerLoading, setProviderLoading] = useState(true)

  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [baseUrls, setBaseUrls] = useState<Record<string, string>>({})
  const [enabledModels, setEnabledModels] = useState<Record<string, Set<string>>>({})
  const [customModelInput, setCustomModelInput] = useState("")
  const [customModels, setCustomModels] = useState<string[]>([])
  const [savingProvider, setSavingProvider] = useState<string | null>(null)

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

        const em: Record<string, Set<string>> = {}
        const bu: Record<string, string> = {}
        const cm: string[] = []
        for (const p of list) {
          em[p.provider] = new Set(p.enabledModels)
          if (p.baseUrl) bu[p.provider] = p.baseUrl
          if (p.provider === "custom") {
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

  useEffect(() => {
    fetchProviders()
  }, [fetchProviders])

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
    const newApiKey = apiKeys[provider] ?? ""
    const baseUrl = baseUrls[provider] ?? ""
    const saved = savedFor(provider)
    const providerName = PROVIDER_META[provider]?.name ?? provider

    if (provider === "custom" && !baseUrl.trim()) {
      showToast(t("toast.baseUrlRequired"), false)
      return
    }

    if (provider !== "custom" && !newApiKey && !saved?.hasKey) {
      showToast(t("toast.apiKeyRequired"), false)
      return
    }

    const models = provider === "custom"
      ? customModels
      : [...(enabledModels[provider] ?? [])]

    if (provider !== "custom" && models.length === 0) {
      showToast(t("toast.modelRequired"), false)
      return
    }

    setSavingProvider(provider)
    try {
      if (newApiKey && provider !== "custom") {
        showToast(t("toast.validating", { name: providerName }), true)
        let isValid = false
        let validationError = t("toast.invalidApiKey")
        try {
          const vRes = await fetch("/api/settings/providers/validate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider, apiKey: newApiKey, baseUrl }),
          })
          const vData = await vRes.json().catch(() => ({} as Record<string, unknown>))
          isValid = vRes.ok && (vData as { valid?: boolean }).valid === true
          if (!isValid && (vData as { error?: string }).error) {
            validationError = (vData as { error: string }).error
          }
        } catch {
          validationError = t("toast.networkError")
        }

        if (!isValid) {
          showToast(validationError, false)
          return
        }
      }

      const body: Record<string, unknown> = {
        provider,
        apiKey: newApiKey,
        baseUrl,
        enabledModels: models,
      }
      const res = await fetch("/api/settings/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        showToast(t("toast.saved", { name: providerName }))
        setApiKeys(prev => ({ ...prev, [provider]: "" }))
        fetchProviders()
      } else {
        const data = await res.json().catch(() => ({}))
        showToast((data as { error?: string }).error ?? t("toast.saveFailed"), false)
      }
    } finally {
      setSavingProvider(null)
    }
  }

  const removeProvider = async (provider: string) => {
    const res = await fetch(`/api/settings/providers/${provider}`, { method: "DELETE" })
    if (res.ok) {
      showToast(t("toast.removed", { name: PROVIDER_META[provider]?.name ?? provider }))
      fetchProviders()
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 px-4 py-2 rounded shadow text-sm text-white ${
          toast.ok ? "bg-green-600" : "bg-red-500"
        }`}>
          {toast.msg}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t("subtitle")}
        </p>
      </div>

      {providerLoading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
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
              <Card key={providerKey} className={`shadow-none ${isConnected ? "border-border" : "border-dashed"}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <span className="text-lg">{meta.icon}</span>
                      {meta.name}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {isConnected
                        ? <Badge className="bg-green-500 text-white text-xs">{t("connected")}</Badge>
                        : <Badge variant="outline" className="text-xs">{t("notConnected")}</Badge>}
                      {isConnected && (
                        <Button
                          variant="ghost" size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => removeProvider(providerKey)}
                          title={t("remove")}
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
                          {t("apiKey.label")}{" "}
                          {meta.keyUrl && (
                            <a
                              href={meta.keyUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 text-primary hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {t("apiKey.issue")}
                            </a>
                          )}
                        </Label>
                      </div>
                      <div className="flex gap-1.5">
                        <Input
                          type={showKey ? "text" : "password"}
                          placeholder={isConnected ? t("apiKey.replacePlaceholder") : meta.keyHint}
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
                      <Label className="text-xs">{t("enabledModels")}</Label>
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
                      <Label className="text-xs">{t("customModels")}</Label>
                      <div className="flex gap-1.5">
                        <Input
                          placeholder={t("customModelPlaceholder")}
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
                      <><RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" />{t("saving")}</>
                    ) : isConnected ? t("update") : t("connect")}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
