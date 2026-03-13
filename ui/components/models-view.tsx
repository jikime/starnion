"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { useTranslations } from "next-intl"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  BrainCircuit, Eye, EyeOff, Trash2, Plus, ExternalLink, RefreshCw, Download,
  Wrench, AlertTriangle, X,
} from "lucide-react"

// ── Tool calling support registry ───────────────────────────────────────────

// Ollama model base-name prefixes confirmed to support tool calling.
// Source: https://ollama.com/search?c=tools (2025-03)
const OLLAMA_TOOLS_PREFIXES = [
  "llama3.1", "llama3.2", "llama3.3",
  "qwen2.5", "qwen3",
  "mistral-nemo", "mistral-small",
  "firefunction-v2",
  "command-r",
  "granite3", "granite4",
  "hermes3",
  "nemotron-mini",
  "phi4",
  "deepseek-r1",
  "aya-expanse",
  "smollm2",
]

/** Returns true/false for Ollama, null = unknown (custom/other endpoint). */
function ollamaModelSupportsTools(modelName: string): boolean {
  const base = modelName.split(":")[0].toLowerCase()
  return OLLAMA_TOOLS_PREFIXES.some(
    p => base === p || base.startsWith(p + "-") || base.startsWith(p + "."),
  )
}

/**
 * Returns whether a provider+model supports tool calling.
 * - true  = confirmed supported
 * - false = confirmed NOT supported
 * - null  = unknown (custom endpoint)
 */
function modelSupportsTools(provider: string, modelId: string): boolean | null {
  switch (provider) {
    case "anthropic":
    case "openai":
    case "gemini":
    case "zai":       // GLM-4.5+ all support tools
      return true
    case "ollama":
      return ollamaModelSupportsTools(modelId)
    case "custom":
      return null     // can't know without probing
    default:
      return null
  }
}

// ── Provider catalog ─────────────────────────────────────────────────────────

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
  /** Human-readable tool calling support note shown on the card. */
  toolsNote: string
}

const PROVIDER_META: Record<string, ProviderMeta> = {
  anthropic: {
    name: "Anthropic",
    icon: "🟣",
    keyHint: "sk-ant-api03-...",
    keyUrl: "https://console.anthropic.com/settings/keys",
    toolsNote: "all",
    models: [
      { id: "claude-opus-4-6",             name: "Claude Opus 4.6",          context: "200K" },
      { id: "claude-opus-4-5-20251101",    name: "Claude Opus 4.5 (Nov)",    context: "200K" },
      { id: "claude-opus-4-5",             name: "Claude Opus 4.5",          context: "200K" },
      { id: "claude-opus-4-1-20250805",    name: "Claude Opus 4.1 (Aug)",    context: "200K" },
      { id: "claude-opus-4-1",             name: "Claude Opus 4.1",          context: "200K" },
      { id: "claude-opus-4-20250514",      name: "Claude Opus 4",            context: "200K" },
      { id: "claude-opus-4-0",             name: "Claude Opus 4.0",          context: "200K" },
      { id: "claude-sonnet-4-6",           name: "Claude Sonnet 4.6",        context: "200K" },
      { id: "claude-sonnet-4-5-20250929",  name: "Claude Sonnet 4.5 (Sep)",  context: "200K" },
      { id: "claude-sonnet-4-5",           name: "Claude Sonnet 4.5",        context: "200K" },
      { id: "claude-sonnet-4-20250514",    name: "Claude Sonnet 4",          context: "200K" },
      { id: "claude-sonnet-4-0",           name: "Claude Sonnet 4.0",        context: "200K" },
      { id: "claude-3-7-sonnet-20250219",  name: "Claude 3.7 Sonnet",        context: "200K" },
      { id: "claude-3-7-sonnet-latest",    name: "Claude 3.7 Sonnet Latest", context: "200K" },
      { id: "claude-3-5-sonnet-20240620",  name: "Claude 3.5 Sonnet (Jun)",  context: "200K" },
      { id: "claude-3-5-sonnet-20241022",  name: "Claude 3.5 Sonnet (Oct)",  context: "200K" },
      { id: "claude-3-5-haiku-20241022",   name: "Claude 3.5 Haiku",         context: "200K" },
      { id: "claude-3-5-haiku-latest",     name: "Claude 3.5 Haiku Latest",  context: "200K" },
      { id: "claude-3-haiku-20240307",     name: "Claude 3 Haiku",           context: "200K" },
    ],
  },
  gemini: {
    name: "Google Gemini",
    icon: "🔵",
    keyHint: "AIzaSy...",
    keyUrl: "https://aistudio.google.com/app/apikey",
    toolsNote: "all",
    models: [
      { id: "gemini-3-pro-preview",        name: "Gemini 3 Pro Preview",     context: "1M"   },
      { id: "gemini-3.1-pro-preview",      name: "Gemini 3.1 Pro Preview",   context: "1M"   },
      { id: "gemini-3-flash-preview",      name: "Gemini 3 Flash Preview",   context: "1M"   },
      { id: "gemini-2.5-pro",              name: "Gemini 2.5 Pro",           context: "1M"   },
      { id: "gemini-2.5-flash",            name: "Gemini 2.5 Flash",         context: "1M"   },
      { id: "gemini-2.0-flash",            name: "Gemini 2.0 Flash",         context: "1M"   },
      { id: "gemini-2.0-flash-lite",       name: "Gemini 2.0 Flash Lite",    context: "1M"   },
      { id: "gemini-1.5-pro",              name: "Gemini 1.5 Pro",           context: "2M"   },
      { id: "gemini-1.5-flash",            name: "Gemini 1.5 Flash",         context: "1M"   },
      { id: "gemini-1.5-flash-8b",         name: "Gemini 1.5 Flash 8B",      context: "1M"   },
      { id: "gemini-3.1-flash-image-preview", name: "Gemini 3.1 Flash Image (Gen)", context: "—" },
      { id: "gemini-2.5-flash-preview-tts",   name: "Gemini 2.5 Flash TTS",     context: "—" },
    ],
  },
  openai: {
    name: "OpenAI",
    icon: "🟢",
    keyHint: "sk-...",
    keyUrl: "https://platform.openai.com/api-keys",
    toolsNote: "all",
    models: [
      { id: "gpt-5.3-codex",               name: "GPT-5.3 Codex",            context: "1M"   },
      { id: "gpt-5.3-codex-spark",         name: "GPT-5.3 Codex Spark",      context: "1M"   },
      { id: "gpt-5.2",                     name: "GPT-5.2",                  context: "1M"   },
      { id: "gpt-5.2-chat-latest",         name: "GPT-5.2 Chat Latest",      context: "1M"   },
      { id: "gpt-5.2-codex",               name: "GPT-5.2 Codex",            context: "1M"   },
      { id: "gpt-5.2-pro",                 name: "GPT-5.2 Pro",              context: "1M"   },
      { id: "gpt-5.1",                     name: "GPT-5.1",                  context: "1M"   },
      { id: "gpt-5.1-chat-latest",         name: "GPT-5.1 Chat Latest",      context: "1M"   },
      { id: "gpt-5.1-codex",               name: "GPT-5.1 Codex",            context: "1M"   },
      { id: "gpt-5.1-codex-max",           name: "GPT-5.1 Codex Max",        context: "1M"   },
      { id: "gpt-5.1-codex-mini",          name: "GPT-5.1 Codex Mini",       context: "1M"   },
      { id: "gpt-5",                       name: "GPT-5",                    context: "1M"   },
      { id: "gpt-5-chat-latest",           name: "GPT-5 Chat Latest",        context: "1M"   },
      { id: "gpt-5-codex",                 name: "GPT-5 Codex",              context: "1M"   },
      { id: "gpt-5-mini",                  name: "GPT-5 Mini",               context: "1M"   },
      { id: "gpt-5-nano",                  name: "GPT-5 Nano",               context: "1M"   },
      { id: "gpt-5-pro",                   name: "GPT-5 Pro",                context: "1M"   },
      { id: "gpt-4.1",                     name: "GPT-4.1",                  context: "1M"   },
      { id: "gpt-4.1-mini",                name: "GPT-4.1 Mini",             context: "1M"   },
      { id: "gpt-4.1-nano",                name: "GPT-4.1 Nano",             context: "1M"   },
      { id: "gpt-4o",                      name: "GPT-4o",                   context: "128K" },
      { id: "gpt-4o-mini",                 name: "GPT-4o Mini",              context: "128K" },
      { id: "gpt-4-turbo",                 name: "GPT-4 Turbo",              context: "128K" },
      { id: "o4-mini",                     name: "o4 Mini",                  context: "200K" },
      { id: "o3",                          name: "o3",                       context: "200K" },
      { id: "o3-mini",                     name: "o3 Mini",                  context: "200K" },
      { id: "o1",                          name: "o1",                       context: "200K" },
      { id: "o1-mini",                     name: "o1 Mini",                  context: "128K" },
    ],
  },
  zai: {
    name: "Z.AI",
    icon: "💎",
    keyHint: "zai-...",
    keyUrl: "https://platform.z.ai",
    toolsNote: "all",
    models: [
      { id: "glm-5",                       name: "GLM-5",                    context: "128K" },
      { id: "glm-4.7",                     name: "GLM-4.7",                  context: "128K" },
      { id: "glm-4.7-flash",               name: "GLM-4.7 Flash",            context: "128K" },
      { id: "glm-4.6",                     name: "GLM-4.6",                  context: "128K" },
      { id: "glm-4.6v",                    name: "GLM-4.6V",                 context: "128K" },
      { id: "glm-4.5",                     name: "GLM-4.5",                  context: "128K" },
      { id: "glm-4.5-air",                 name: "GLM-4.5 Air",              context: "128K" },
      { id: "glm-4.5-flash",               name: "GLM-4.5 Flash",            context: "128K" },
      { id: "glm-4.5v",                    name: "GLM-4.5V",                 context: "128K" },
    ],
  },
  custom: {
    name: "Custom Endpoint",
    icon: "⚙️",
    keyHint: "(optional)",
    needsBaseUrl: true,
    baseUrlPlaceholder: "http://localhost:11434",
    toolsNote: "unknown",
    models: [],
  },
}

const PROVIDER_ORDER = ["anthropic", "gemini", "openai", "zai", "custom"]

// ── Use cases ────────────────────────────────────────────────────────────────

const USE_CASES = [
  { key: "image",     icon: "🖼️" },
  { key: "audio",     icon: "🎤" },
  { key: "report",    icon: "📊" },
  { key: "image_gen", icon: "🎨" },
  { key: "audio_gen", icon: "🔊" },
] as const

type EndpointType = "ollama" | "openai_compatible" | "other"

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProviderState {
  provider: string
  apiKeyMasked: string
  hasKey: boolean
  baseUrl: string
  endpointType: string
  enabledModels: string[]
}

interface Assignment {
  provider: string
  model: string
}

// ── Main component ────────────────────────────────────────────────────────────

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

  const [customEndpointType, setCustomEndpointType] = useState<EndpointType>("other")
  const [fetchingModels, setFetchingModels] = useState(false)

  const [assignments, setAssignments] = useState<Record<string, Assignment>>({})
  const [assignmentsLoading, setAssignmentsLoading] = useState(true)
  const [savingAssignments, setSavingAssignments] = useState(false)

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  // ── Fetch providers ────────────────────────────────────────────────────────

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
            if (p.endpointType) setCustomEndpointType(p.endpointType as EndpointType)
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

  useEffect(() => { fetchProviders() }, [fetchProviders])

  // ── Fetch model assignments ────────────────────────────────────────────────

  const loadAssignments = useCallback(async () => {
    setAssignmentsLoading(true)
    try {
      const res = await fetch("/api/settings/model-assignments", { cache: "no-store" })
      if (res.ok) {
        const data = await res.json()
        const map: Record<string, Assignment> = {}
        for (const a of (data.assignments ?? [])) {
          map[a.useCase] = { provider: a.provider, model: a.model }
        }
        setAssignments(map)
      }
    } finally {
      setAssignmentsLoading(false)
    }
  }, [])

  useEffect(() => { loadAssignments() }, [loadAssignments])

  // ── Provider helpers ───────────────────────────────────────────────────────

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

    const models = [...(enabledModels[provider] ?? [])]

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
        if (!isValid) { showToast(validationError, false); return }
      }

      const body: Record<string, unknown> = {
        provider,
        apiKey: newApiKey,
        baseUrl,
        enabledModels: models,
        ...(provider === "custom" ? { endpointType: customEndpointType } : {}),
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

  // ── Fetch custom models ────────────────────────────────────────────────────

  const fetchCustomModels = async () => {
    const baseUrl = baseUrls["custom"] ?? ""
    if (!baseUrl.trim()) { showToast(t("toast.baseUrlRequired"), false); return }
    setFetchingModels(true)
    try {
      const res = await fetch("/api/settings/providers/custom/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, endpointType: customEndpointType, apiKey: apiKeys["custom"] ?? "" }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        const fetched: string[] = data.models ?? []
        // For Ollama: sort tool-supported models first
        const sorted = customEndpointType === "ollama"
          ? [
              ...fetched.filter(m => ollamaModelSupportsTools(m)),
              ...fetched.filter(m => !ollamaModelSupportsTools(m)),
            ]
          : fetched
        setCustomModels(sorted)
        // Auto-check all fetched models
        setEnabledModels(prev => ({ ...prev, custom: new Set(sorted) }))
        showToast(t("toast.fetchSuccess", { count: fetched.length }))
      } else {
        showToast((data as { error?: string }).error ?? t("toast.fetchFailed"), false)
      }
    } finally {
      setFetchingModels(false)
    }
  }

  // ── Model assignment helpers ───────────────────────────────────────────────
  const ASSIGNMENT_DEFAULT = "__default__"

  const modelOptions = useMemo(() => {
    const opts: {
      value: string
      label: string
      group: string
      toolsSupported: boolean | null
    }[] = []
    for (const sp of savedProviders) {
      if (sp.enabledModels.length === 0) continue
      const meta = PROVIDER_META[sp.provider]
      const groupName = meta?.name ?? sp.provider
      // Determine effective provider key for tool support lookup
      const providerKey = sp.provider === "custom"
        ? (sp.endpointType === "ollama" ? "ollama" : "custom")
        : sp.provider
      for (const modelId of sp.enabledModels) {
        const modelMeta = meta?.models.find(m => m.id === modelId)
        const label = modelMeta?.name ?? modelId
        const toolsSupported = modelSupportsTools(providerKey, modelId)
        opts.push({ value: `${sp.provider}::${modelId}`, label, group: groupName, toolsSupported })
      }
    }
    return opts
  }, [savedProviders])

  const getAssignmentValue = (useCase: string): string => {
    const a = assignments[useCase]
    if (!a || (!a.provider && !a.model)) return ASSIGNMENT_DEFAULT
    return `${a.provider}::${a.model}`
  }

  const setAssignment = (useCase: string, value: string) => {
    if (!value || value === ASSIGNMENT_DEFAULT) {
      setAssignments(prev => { const next = { ...prev }; delete next[useCase]; return next })
    } else {
      const idx = value.indexOf("::")
      const provider = idx >= 0 ? value.slice(0, idx) : value
      const model = idx >= 0 ? value.slice(idx + 2) : ""
      setAssignments(prev => ({ ...prev, [useCase]: { provider, model } }))
    }
  }

  const saveAssignments = async () => {
    setSavingAssignments(true)
    try {
      const body = {
        assignments: USE_CASES.map(uc => ({
          useCase: uc.key,
          provider: assignments[uc.key]?.provider ?? "",
          model: assignments[uc.key]?.model ?? "",
        })),
      }
      const res = await fetch("/api/settings/model-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      showToast(res.ok ? t("assignments.saved") : t("assignments.saveFailed"), res.ok)
    } finally {
      setSavingAssignments(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

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
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <BrainCircuit className="size-6 text-primary" />
          {t("title")}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">{t("subtitle")}</p>
      </div>

      <Tabs defaultValue="providers">
        <TabsList className="mb-4">
          <TabsTrigger value="providers">{t("tabs.providers")}</TabsTrigger>
          <TabsTrigger value="assignments">{t("tabs.assignments")}</TabsTrigger>
        </TabsList>

        {/* ── Providers Tab ──────────────────────────────────────────────── */}
        <TabsContent value="providers">
          {providerLoading ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {PROVIDER_ORDER.map(providerKey => {
                const meta = PROVIDER_META[providerKey]
                const saved = savedFor(providerKey)
                const isConnected = providerKey === "custom" ? !!saved?.baseUrl : !!saved?.hasKey
                const isSaving = savingProvider === providerKey
                const keyVal = apiKeys[providerKey] ?? ""
                const showKey = showKeys[providerKey] ?? false
                const baseUrl = baseUrls[providerKey] ?? ""
                const enabled = enabledModels[providerKey] ?? new Set<string>()

                // Tools note for card header
                const toolsNoteEl = meta.toolsNote === "all" ? (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-green-600">
                    <Wrench className="h-2.5 w-2.5" /> tool calling 전체 지원
                  </span>
                ) : meta.toolsNote === "unknown" ? (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <Wrench className="h-2.5 w-2.5" /> tool calling 미확인
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-500">
                    <AlertTriangle className="h-2.5 w-2.5" /> tool calling 모델별 상이
                  </span>
                )

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
                      <div className="flex items-center gap-3 mt-0.5">
                        {toolsNoteEl}
                        {isConnected && saved?.apiKeyMasked && (
                          <CardDescription className="text-xs font-mono">
                            {saved.apiKeyMasked}
                          </CardDescription>
                        )}
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      {/* API Key */}
                      {providerKey !== "custom" && (
                        <div className="space-y-1.5">
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
                          <div className="flex gap-1.5">
                            <Input
                              type={showKey ? "text" : "password"}
                              placeholder={isConnected ? t("apiKey.replacePlaceholder") : meta.keyHint}
                              value={keyVal}
                              onChange={e => setApiKeys(prev => ({ ...prev, [providerKey]: e.target.value }))}
                              className="flex-1 font-mono text-xs h-8"
                            />
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8 shrink-0"
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

                      {/* Endpoint type (custom only) */}
                      {providerKey === "custom" && (
                        <div className="space-y-1.5">
                          <Label className="text-xs">{t("endpointType.label")}</Label>
                          <div className="flex gap-1">
                            {(["ollama", "openai_compatible", "other"] as EndpointType[]).map(et => (
                              <button
                                key={et}
                                onClick={() => setCustomEndpointType(et)}
                                className={`flex-1 text-xs py-1 px-2 rounded border transition-colors ${
                                  customEndpointType === et
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "border-input bg-background hover:bg-accent"
                                }`}
                              >
                                {t(`endpointType.${et}`)}
                              </button>
                            ))}
                          </div>
                          {/* Ollama tool calling info */}
                          {customEndpointType === "ollama" && (
                            <p className="text-[11px] text-muted-foreground leading-tight">
                              💡 tool calling 지원 모델이 먼저 표시돼요. 불러온 후 ✓ 표시를 확인하세요.
                            </p>
                          )}
                          {customEndpointType === "openai_compatible" && (
                            <p className="text-[11px] text-muted-foreground leading-tight">
                              💡 tool calling 지원 여부는 서버 구현에 따라 다를 수 있어요.
                            </p>
                          )}
                        </div>
                      )}

                      {/* Models — checkbox list (predefined providers) */}
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

                      {/* Custom endpoint: fetch or manual model entry */}
                      {providerKey === "custom" && (
                        <div className="space-y-1.5">
                          <Label className="text-xs">{t("customModels")}</Label>

                          {customEndpointType !== "other" ? (
                            <Button
                              variant="outline" size="sm"
                              className="w-full h-8 gap-1.5"
                              disabled={fetchingModels || !baseUrls["custom"]?.trim()}
                              onClick={fetchCustomModels}
                            >
                              {fetchingModels
                                ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />{t("fetching")}</>
                                : <><Download className="h-3.5 w-3.5" />{t("fetchModels")}</>}
                            </Button>
                          ) : (
                            <div className="flex gap-1.5">
                              <Input
                                placeholder={t("customModelPlaceholder")}
                                value={customModelInput}
                                onChange={e => setCustomModelInput(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === "Enter" && customModelInput.trim()) {
                                    const m = customModelInput.trim()
                                    setCustomModels(prev => [...new Set([...prev, m])])
                                    setEnabledModels(prev => ({ ...prev, custom: new Set([...(prev["custom"] ?? []), m]) }))
                                    setCustomModelInput("")
                                  }
                                }}
                                className="flex-1 font-mono text-xs h-8"
                              />
                              <Button
                                variant="outline" size="sm" className="h-8 px-2"
                                onClick={() => {
                                  if (customModelInput.trim()) {
                                    const m = customModelInput.trim()
                                    setCustomModels(prev => [...new Set([...prev, m])])
                                    setEnabledModels(prev => ({ ...prev, custom: new Set([...(prev["custom"] ?? []), m]) }))
                                    setCustomModelInput("")
                                  }
                                }}
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}

                          {customModels.length > 0 && (
                            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 mt-1">
                              {customModels.map(m => {
                                const toolsOk = customEndpointType === "ollama"
                                  ? ollamaModelSupportsTools(m)
                                  : null
                                const enabled = enabledModels["custom"] ?? new Set<string>()
                                return (
                                  <div key={m} className="flex items-center gap-2">
                                    <Checkbox
                                      id={`custom-${m}`}
                                      checked={enabled.has(m)}
                                      onCheckedChange={() => toggleModel("custom", m)}
                                    />
                                    <label
                                      htmlFor={`custom-${m}`}
                                      className="text-xs cursor-pointer flex items-center gap-1.5 flex-1 min-w-0"
                                    >
                                      <span className="font-mono truncate">{m}</span>
                                      {toolsOk === true && (
                                        <span className="text-[10px] text-green-600 font-medium flex items-center gap-0.5 shrink-0">
                                          <Wrench className="h-2.5 w-2.5" /> tools
                                        </span>
                                      )}
                                      {toolsOk === false && (
                                        <span className="text-[10px] text-amber-500 font-medium flex items-center gap-0.5 shrink-0">
                                          <AlertTriangle className="h-2.5 w-2.5" /> tools 불가
                                        </span>
                                      )}
                                    </label>
                                    {customEndpointType === "other" && (
                                      <button
                                        className="text-muted-foreground hover:text-destructive shrink-0"
                                        onClick={() => {
                                          setCustomModels(prev => prev.filter(x => x !== m))
                                          setEnabledModels(prev => {
                                            const s = new Set(prev["custom"] ?? [])
                                            s.delete(m)
                                            return { ...prev, custom: s }
                                          })
                                        }}
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      <Button
                        size="sm" className="w-full h-8"
                        disabled={isSaving}
                        onClick={() => saveProvider(providerKey)}
                      >
                        {isSaving
                          ? <><RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" />{t("saving")}</>
                          : isConnected ? t("update") : t("connect")}
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Model Assignments Tab ──────────────────────────────────────── */}
        <TabsContent value="assignments">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("assignments.subtitle")}</p>

            {/* Legend */}
            <div className="text-xs text-muted-foreground border rounded-md px-3 py-2 bg-muted/30 space-y-0.5">
              <p>🖼️ <strong>{t("assignments.useCases.image")}</strong> — 비전 지원 모델 (미설정 시 페르소나 모델 사용)</p>
              <p>🎤 <strong>{t("assignments.useCases.audio")}</strong> — 음성 인식 지원 모델 (미설정 시 페르소나 모델 사용)</p>
              <p>📊 <strong>{t("assignments.useCases.report")}</strong> — 자동 리포트·인사이트 전용 (미설정 시 페르소나 모델 사용)</p>
              <p>🎨 <strong>{t("assignments.useCases.image_gen")}</strong> — 이미지 생성 전용 · 미설정 시 <code className="text-[10px]">gemini-3.1-flash-image-preview</code> 사용 · Ollama <code className="text-[10px]">x/z-image-turbo</code> 지원</p>
              <p>🔊 <strong>{t("assignments.useCases.audio_gen")}</strong> — TTS 음성 생성 전용 · 미설정 시 <code className="text-[10px]">gemini-2.5-flash-preview-tts</code> 사용</p>
            </div>

            {assignmentsLoading ? (
              <p className="text-sm text-muted-foreground">{t("loading")}</p>
            ) : modelOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("assignments.noModels")}</p>
            ) : (
              <div className="space-y-2">
                {USE_CASES.map(({ key, icon }) => {
                  const currentVal = getAssignmentValue(key)
                  return (
                    <div key={key} className="rounded-lg border p-3">
                      <div className="flex items-center gap-3">
                        <span className="text-base w-6 text-center shrink-0">{icon}</span>
                        <p className="text-sm font-medium flex-1 min-w-0">
                          {t(`assignments.useCases.${key}`)}
                        </p>
                        <Select
                          value={currentVal}
                          onValueChange={v => setAssignment(key, v)}
                        >
                          <SelectTrigger className="w-56 h-8 text-xs">
                            <SelectValue placeholder={t("assignments.serverDefault")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={ASSIGNMENT_DEFAULT}>
                              {t("assignments.serverDefault")}
                            </SelectItem>
                            {(() => {
                              const groups: Record<string, typeof modelOptions> = {}
                              for (const opt of modelOptions) {
                                if (!groups[opt.group]) groups[opt.group] = []
                                groups[opt.group].push(opt)
                              }
                              return Object.entries(groups).map(([group, opts]) => (
                                <SelectGroup key={group}>
                                  <SelectLabel className="text-xs">{group}</SelectLabel>
                                  {opts.map(opt => (
                                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                      {opt.label}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              ))
                            })()}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )
                })}

                <Button
                  size="sm" className="w-full mt-2"
                  disabled={savingAssignments}
                  onClick={saveAssignments}
                >
                  {savingAssignments
                    ? <><RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" />{t("saving")}</>
                    : t("assignments.save")}
                </Button>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
