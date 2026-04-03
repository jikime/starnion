"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  BrainCircuit, Eye, EyeOff, Trash2, Plus, ExternalLink, RefreshCw, Download,
  Wrench, AlertTriangle, X, DollarSign, RotateCcw,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { siAnthropic, siGooglegemini, siOllama } from "simple-icons"

// ── Provider brand icons ─────────────────────────────────────────────────────

// OpenAI logo SVG path (official brand mark)
const OPENAI_SVG_PATH =
  "M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"

interface ProviderIconProps { className?: string }

function AnthropicIcon({ className }: ProviderIconProps) {
  return (
    <svg role="img" viewBox="0 0 24 24" className={className} fill="currentColor" aria-label="Anthropic">
      <path d={siAnthropic.path} />
    </svg>
  )
}
function GeminiIcon({ className }: ProviderIconProps) {
  return (
    <svg role="img" viewBox="0 0 24 24" className={className} fill="currentColor" aria-label="Google Gemini">
      <path d={siGooglegemini.path} />
    </svg>
  )
}
function OpenAIIcon({ className }: ProviderIconProps) {
  return (
    <svg role="img" viewBox="0 0 24 24" className={className} fill="currentColor" aria-label="OpenAI">
      <path d={OPENAI_SVG_PATH} />
    </svg>
  )
}
function ZaiIcon({ className }: ProviderIconProps) {
  return (
    <svg role="img" viewBox="0 0 24 24" className={className} fill="currentColor" aria-label="Z.AI">
      <path d="M3 4h18v2.5L7.5 18H21v2H3v-2.5L16.5 6H3V4z" />
    </svg>
  )
}
function OllamaIcon({ className }: ProviderIconProps) {
  return (
    <svg role="img" viewBox="0 0 24 24" className={className} fill="currentColor" aria-label="Ollama">
      <path d={siOllama.path} />
    </svg>
  )
}

const PROVIDER_ICONS: Record<string, React.ComponentType<ProviderIconProps>> = {
  anthropic: AnthropicIcon,
  gemini:    GeminiIcon,
  openai:    OpenAIIcon,
  zai:       ZaiIcon,
  custom:    OllamaIcon,
}

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

/** Embedding models per provider (separate from chat/generation models). */
const EMBEDDING_MODELS: Record<string, { id: string; name: string }[]> = {
  gemini: [
    { id: "text-embedding-004",   name: "Text Embedding 004 (768d)" },
    { id: "text-embedding-005",   name: "Text Embedding 005 (768d)" },
  ],
  openai: [
    { id: "text-embedding-3-small", name: "Text Embedding 3 Small (1536d)" },
    { id: "text-embedding-3-large", name: "Text Embedding 3 Large (3072d)" },
    { id: "text-embedding-ada-002", name: "Text Embedding Ada 002 (1536d)" },
  ],
  custom: [
    { id: "nomic-embed-text",           name: "nomic-embed-text (768d)" },
    { id: "mxbai-embed-large",          name: "mxbai-embed-large (1024d)" },
    { id: "all-minilm",                 name: "all-minilm (384d)" },
    { id: "snowflake-arctic-embed",     name: "snowflake-arctic-embed (1024d)" },
    { id: "bge-large",                  name: "bge-large (1024d)" },
    { id: "bge-m3",                     name: "bge-m3 (1024d)" },
  ],
}

/**
 * System fallback models per use case.
 * These mirror the backend defaults used when no model_assignment is configured.
 * - report/chat/diary/goals/finance: agent grpc.ts → "claude-haiku-4-5"
 * - secondary: title generation, session insights, context compression → "claude-haiku-4-5"
 * - embedding: embeddings.go → provider-specific (gemini: text-embedding-004, etc.)
 */
const SYSTEM_DEFAULTS: Record<string, string> = {
  report:    "claude-haiku-4-5",
  chat:      "claude-haiku-4-5",
  diary:     "claude-haiku-4-5",
  goals:     "claude-haiku-4-5",
  finance:   "claude-haiku-4-5",
  secondary: "claude-haiku-4-5",
  // embedding: provider-dependent, shown separately
}

/** Providers that have per-token pricing (exclude local/custom endpoints). */
const PRICING_PROVIDERS = new Set(["anthropic", "gemini", "openai", "zai"])

// ── Default model pricing (mirrors usage_log.go modelPricingTable) ────────────
// Prices are USD per 1,000,000 tokens. More specific entries first.
const DEFAULT_PRICING: { match: string; input: number; output: number; cached?: number }[] = [
  // Anthropic Claude — 4.x series
  { match: "claude-opus-4",             input: 15.00, output: 75.00, cached:  1.50 },
  { match: "claude-sonnet-4",           input:  3.00, output: 15.00, cached:  0.30 },
  { match: "claude-haiku-4",            input:  0.80, output:  4.00, cached:  0.08 },
  // Anthropic Claude — 3.x series (API IDs use "{ver}-{type}" order)
  { match: "3-7-sonnet",                input:  3.00, output: 15.00, cached:  0.30 },
  { match: "3-5-sonnet",                input:  3.00, output: 15.00, cached:  0.30 },
  { match: "claude-sonnet-3-7",         input:  3.00, output: 15.00, cached:  0.30 },
  { match: "claude-sonnet-3-5",         input:  3.00, output: 15.00, cached:  0.30 },
  { match: "3-5-haiku",                 input:  0.80, output:  4.00, cached:  0.08 },
  { match: "claude-haiku-3-5",          input:  0.80, output:  4.00, cached:  0.08 },
  { match: "3-opus",                    input: 15.00, output: 75.00, cached:  1.50 },
  { match: "claude-opus-3",             input: 15.00, output: 75.00, cached:  1.50 },
  { match: "3-haiku",                   input:  0.25, output:  1.25, cached:  0.03 },
  { match: "claude-haiku-3",            input:  0.25, output:  1.25, cached:  0.03 },
  // Google Gemini — 3.x series (newest, more specific first)
  { match: "gemini-3.1-pro",            input:  2.00, output: 12.00, cached:  0.20 },
  { match: "gemini-3.1-flash",          input:  0.50, output:  3.00, cached:  0.05 },
  { match: "gemini-3-pro",              input:  2.00, output: 12.00, cached:  0.20 },
  { match: "gemini-3-flash",            input:  0.50, output:  3.00, cached:  0.05 },
  // Google Gemini — 2.5 series
  { match: "gemini-2.5-pro",            input:  1.25, output: 10.00, cached:  0.125 },
  { match: "gemini-2.5-flash",          input:  0.30, output:  2.50, cached:  0.03 },
  // Google Gemini — 2.0 series (more specific before generic flash)
  { match: "gemini-2.0-flash-thinking", input:  0.00, output:  3.50 },
  { match: "gemini-2.0-flash-lite",     input: 0.075, output:  0.30 },
  { match: "gemini-2.0-flash",          input:  0.10, output:  0.40, cached:  0.025 },
  // Google Gemini — 1.5 series
  { match: "gemini-1.5-pro",            input:  1.25, output:  5.00, cached:  0.3125 },
  { match: "gemini-1.5-flash",          input: 0.075, output:  0.30, cached:  0.01875 },
  // OpenAI — GPT-5 series (more specific first)
  { match: "gpt-5.3",                   input:  1.75, output: 14.00, cached:  0.175 },
  { match: "gpt-5.2",                   input: 0.875, output:  7.00, cached:  0.175 },
  { match: "gpt-5.1",                   input: 0.625, output:  5.00, cached:  0.125 },
  { match: "gpt-5",                     input: 0.625, output:  5.00, cached:  0.125 },
  // OpenAI — GPT-4.1 series (more specific first)
  { match: "gpt-4.1-nano",              input:  0.10, output:  0.40, cached:  0.025 },
  { match: "gpt-4.1-mini",              input:  0.40, output:  1.60, cached:  0.10 },
  { match: "gpt-4.1",                   input:  2.00, output:  8.00, cached:  0.50 },
  // OpenAI — GPT-4o series
  { match: "gpt-4o-mini",               input:  0.15, output:  0.60, cached:  0.075 },
  { match: "gpt-4o",                    input:  2.50, output: 10.00, cached:  1.25 },
  // OpenAI — legacy
  { match: "gpt-4-turbo",               input: 10.00, output: 30.00 },
  { match: "gpt-4",                     input: 30.00, output: 60.00 },
  { match: "gpt-3.5-turbo",             input:  0.50, output:  1.50 },
  // OpenAI — reasoning models
  { match: "o4-mini",                   input:  1.10, output:  4.40, cached:  0.275 },
  { match: "o3-mini",                   input:  1.10, output:  4.40 },
  { match: "o3",                        input:  2.00, output:  8.00, cached:  0.50 },
  { match: "o1-mini",                   input:  1.10, output:  4.40 },
  { match: "o1",                        input: 15.00, output: 60.00 },
  // Z.AI — GLM series (more specific first)
  { match: "glm-5",                     input:  1.00, output:  3.20 },
  { match: "glm-4.7-flash",             input:  0.00, output:  0.00 },
  { match: "glm-4.7",                   input:  0.60, output:  2.20 },
  { match: "glm-4.6v",                  input:  0.30, output:  0.90 },
  { match: "glm-4.6",                   input:  0.60, output:  2.20 },
  { match: "glm-4.5-flash",             input:  0.00, output:  0.00 },
  { match: "glm-4.5-air",               input:  0.20, output:  1.10 },
  { match: "glm-4.5v",                  input:  0.60, output:  1.80 },
  { match: "glm-4.5",                   input:  0.60, output:  2.20 },
]

function getDefaultPrice(modelId: string): { input: number; output: number; cached?: number } | null {
  const lower = modelId.toLowerCase()
  const entry = DEFAULT_PRICING.find(e => lower.includes(e.match))
  return entry ? { input: entry.input, output: entry.output, cached: entry.cached } : null
}

// ── Use cases ────────────────────────────────────────────────────────────────

type EndpointType = "ollama" | "openai_compatible" | "other"
type AnthropicAccessMethod = "api_key" | "claude_code"

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProviderState {
  provider: string
  apiKeyMasked: string
  hasKey: boolean
  baseUrl: string
  endpointType: string
  enabledModels: string[]
}

interface ModelPricing {
  model: string
  provider: string
  input_usd: number
  output_usd: number
  cache_input_usd: number
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
  const [anthropicAccessMethod, setAnthropicAccessMethod] = useState<AnthropicAccessMethod>("claude_code")
  const [fetchingModels, setFetchingModels] = useState(false)

  // Model pricing state
  const [savedPricing, setSavedPricing] = useState<Record<string, ModelPricing>>({})
  const [pricingEdits, setPricingEdits] = useState<Record<string, { input: string; output: string; cache: string }>>({})
  const [savingPricing, setSavingPricing] = useState<string | null>(null)

  // Model assignments state
  const [savedAssignments, setSavedAssignments] = useState<Record<string, { provider: string; model: string }>>({})
  const [assignmentEdits, setAssignmentEdits] = useState<Record<string, { provider: string; model: string }>>({})
  const [savingAssignment, setSavingAssignment] = useState<string | null>(null)

  // System default models (fetched from gateway, replaces hardcoded SYSTEM_DEFAULTS)
  const [systemDefaults, setSystemDefaults] = useState<Record<string, string>>(SYSTEM_DEFAULTS)

  const [removeTarget, setRemoveTarget] = useState<string | null>(null)
  const [resetPricingTarget, setResetPricingTarget] = useState<string | null>(null)
  const [deleteAssignTarget, setDeleteAssignTarget] = useState<string | null>(null)

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
          if (p.provider === "anthropic") {
            setAnthropicAccessMethod(p.endpointType === "claude_code" ? "claude_code" : "api_key")
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

  // ── Fetch model pricing ────────────────────────────────────────────────────

  const loadPricing = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/model-pricing", { cache: "no-store" })
      if (res.ok) {
        const data = await res.json()
        const map: Record<string, ModelPricing> = {}
        for (const p of (data.pricing ?? [])) {
          map[p.model] = p
        }
        setSavedPricing(map)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadPricing() }, [loadPricing])

  // ── Fetch model assignments ────────────────────────────────────────────────

  const loadAssignments = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/model-assignments", { cache: "no-store" })
      if (res.ok) {
        const data = await res.json()
        const map: Record<string, { provider: string; model: string }> = {}
        for (const a of (data.assignments ?? [])) {
          map[a.use_case] = { provider: a.provider, model: a.model }
        }
        setSavedAssignments(map)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadAssignments() }, [loadAssignments])

  // ── Fetch system defaults ──────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/system/defaults", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setSystemDefaults(d) })
      .catch(() => { /* keep static fallback */ })
  }, [])

  // ── Assignment helpers ─────────────────────────────────────────────────────

  const USE_CASES = [
    { id: "report",    labelKey: "assignments.useCases.report",    isEmbedding: false },
    { id: "chat",      labelKey: "assignments.useCases.chat",      isEmbedding: false },
    { id: "diary",     labelKey: "assignments.useCases.diary",     isEmbedding: false },
    { id: "goals",     labelKey: "assignments.useCases.goals",     isEmbedding: false },
    { id: "finance",   labelKey: "assignments.useCases.finance",   isEmbedding: false },
    { id: "secondary", labelKey: "assignments.useCases.secondary", isEmbedding: false },
    { id: "embedding", labelKey: "assignments.useCases.embedding", isEmbedding: true  },
  ]

  const getAssignmentEdit = (useCase: string) => {
    if (assignmentEdits[useCase]) return assignmentEdits[useCase]
    const saved = savedAssignments[useCase]
    if (saved) return { provider: saved.provider, model: saved.model }
    return { provider: "", model: "" }
  }

  const saveAssignment = async (useCase: string) => {
    const edit = getAssignmentEdit(useCase)
    if (!edit.model) return
    setSavingAssignment(useCase)
    try {
      const res = await fetch("/api/settings/model-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ use_case: useCase, provider: edit.provider, model: edit.model }),
      })
      if (res.ok) {
        toast.success(t("assignments.saved"))
        setAssignmentEdits(prev => { const next = { ...prev }; delete next[useCase]; return next })
        loadAssignments()
      } else {
        toast.error(t("assignments.saveFailed"))
      }
    } finally {
      setSavingAssignment(null)
    }
  }

  const deleteAssignment = async (useCase: string) => {
    const res = await fetch(`/api/settings/model-assignments/${encodeURIComponent(useCase)}`, { method: "DELETE" })
    if (res.ok) {
      toast.success(t("assignments.deleted"))
      setAssignmentEdits(prev => { const next = { ...prev }; delete next[useCase]; return next })
      loadAssignments()
    }
    setDeleteAssignTarget(null)
  }

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
      toast.error(t("toast.baseUrlRequired"))
      return
    }
    if (provider !== "custom" && !newApiKey && !saved?.hasKey) {
      if (!(provider === "anthropic" && anthropicAccessMethod === "claude_code")) {
        toast.error(t("toast.apiKeyRequired"))
        return
      }
    }

    const models = [...(enabledModels[provider] ?? [])]

    if (provider !== "custom" && models.length === 0) {
      toast.error(t("toast.modelRequired"))
      return
    }

    setSavingProvider(provider)
    try {
      if (newApiKey && provider !== "custom") {
        toast.success(t("toast.validating", { name: providerName }))
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
        if (!isValid) { toast.error(validationError); return }
      }

      const body: Record<string, unknown> = {
        provider,
        apiKey: newApiKey,
        baseUrl,
        enabledModels: models,
        ...(provider === "custom" ? { endpointType: customEndpointType } : {}),
        ...(provider === "anthropic" ? { endpointType: anthropicAccessMethod } : {}),
      }
      const res = await fetch("/api/settings/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        toast.success(t("toast.saved", { name: providerName }))
        setApiKeys(prev => ({ ...prev, [provider]: "" }))
        fetchProviders()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error((data as { error?: string }).error ?? t("toast.saveFailed"))
      }
    } finally {
      setSavingProvider(null)
    }
  }

  const removeProvider = async (provider: string) => {
    const res = await fetch(`/api/settings/providers/${provider}`, { method: "DELETE" })
    if (res.ok) {
      toast.success(t("toast.removed", { name: PROVIDER_META[provider]?.name ?? provider }))
      fetchProviders()
    }
    setRemoveTarget(null)
  }

  // ── Fetch custom models ────────────────────────────────────────────────────

  const fetchCustomModels = async () => {
    const baseUrl = baseUrls["custom"] ?? ""
    if (!baseUrl.trim()) { toast.error(t("toast.baseUrlRequired")); return }
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
        toast.success(t("toast.fetchSuccess", { count: fetched.length }))
      } else {
        toast.error((data as { error?: string }).error ?? t("toast.fetchFailed"))
      }
    } finally {
      setFetchingModels(false)
    }
  }

  // ── Pricing helpers ────────────────────────────────────────────────────────

  /** All enabled models across all saved providers, with provider info. */
  const allEnabledModels = useMemo(() => {
    const result: { modelId: string; modelName: string; provider: string; providerName: string }[] = []
    for (const sp of savedProviders) {
      if (sp.enabledModels.length === 0) continue
      const meta = PROVIDER_META[sp.provider]
      const providerName = meta?.name ?? sp.provider
      for (const modelId of sp.enabledModels) {
        const modelMeta = meta?.models.find(m => m.id === modelId)
        result.push({
          modelId,
          modelName: modelMeta?.name ?? modelId,
          provider: sp.provider,
          providerName,
        })
      }
    }
    return result
  }, [savedProviders])

  const getPricingEdit = (modelId: string) => {
    if (pricingEdits[modelId]) return pricingEdits[modelId]
    const saved = savedPricing[modelId]
    if (saved) return { input: String(saved.input_usd), output: String(saved.output_usd), cache: String(saved.cache_input_usd ?? 0) }
    return { input: "", output: "", cache: "" }
  }

  const setPricingEdit = (modelId: string, field: "input" | "output" | "cache", value: string) => {
    setPricingEdits(prev => {
      const cur = getPricingEdit(modelId)
      return { ...prev, [modelId]: { input: cur.input, output: cur.output, cache: cur.cache, [field]: value } }
    })
  }

  const savePricing = async (modelId: string, provider: string) => {
    const edit = getPricingEdit(modelId)
    const inputVal = parseFloat(edit.input)
    const outputVal = parseFloat(edit.output)
    const cacheVal = edit.cache !== "" ? parseFloat(edit.cache) : 0
    if (isNaN(inputVal) || isNaN(outputVal) || inputVal < 0 || outputVal < 0) {
      toast.error(t("pricing.invalidNumber"))
      return
    }
    setSavingPricing(modelId)
    try {
      const res = await fetch("/api/settings/model-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelId, provider, input_usd: inputVal, output_usd: outputVal, cache_input_usd: cacheVal }),
      })
      if (res.ok) {
        toast.success(t("pricing.pricingSaved", { model: modelId }))
        setPricingEdits(prev => { const next = { ...prev }; delete next[modelId]; return next })
        loadPricing()
      } else {
        toast.error(t("toast.saveFailed"))
      }
    } finally {
      setSavingPricing(null)
    }
  }

  const resetPricing = async (modelId: string) => {
    const res = await fetch(`/api/settings/model-pricing/${encodeURIComponent(modelId)}`, { method: "DELETE" })
    if (res.ok) {
      toast.success(t("pricing.pricingReset", { model: modelId }))
      setPricingEdits(prev => { const next = { ...prev }; delete next[modelId]; return next })
      loadPricing()
    }
    setResetPricingTarget(null)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
    <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 sm:space-y-6 w-full">
      <div className="flex items-center gap-2">
        <BrainCircuit className="size-5 sm:size-6 text-primary shrink-0" />
        <div>
          <h1 className="text-lg sm:text-2xl font-bold leading-tight">{t("title")}</h1>
          <p className="text-muted-foreground text-xs sm:text-sm hidden sm:block">{t("subtitle")}</p>
        </div>
      </div>

      <Tabs defaultValue="providers">
        <TabsList className="mb-3 sm:mb-4 w-full sm:w-auto">
          <TabsTrigger value="providers" className="text-xs sm:text-sm flex-1 sm:flex-none">{t("tabs.providers")}</TabsTrigger>
          <TabsTrigger value="pricing" className="text-xs sm:text-sm flex-1 sm:flex-none">
            <DollarSign className="h-3.5 w-3.5 mr-1 hidden sm:inline-block" />
            {t("tabs.pricing")}
          </TabsTrigger>
        </TabsList>

        {/* ── Providers Tab ──────────────────────────────────────────────── */}
        <TabsContent value="providers">
          {providerLoading ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-dashed border-border bg-card overflow-hidden">
                  {/* Card header */}
                  <div className="px-5 py-4 border-b border-border/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Skeleton className="size-6 rounded" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                    <Skeleton className="h-3 w-48" />
                  </div>
                  {/* Card body */}
                  <div className="px-5 py-4 space-y-3">
                    <div className="space-y-1.5">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-9 w-full rounded-md" />
                    </div>
                    <div className="space-y-2">
                      {Array.from({ length: 3 }).map((_, j) => (
                        <div key={j} className="flex items-center gap-2">
                          <Skeleton className="size-4 rounded" />
                          <Skeleton className="h-3 w-36" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {PROVIDER_ORDER.map(providerKey => {
                const meta = PROVIDER_META[providerKey]
                const saved = savedFor(providerKey)
                const isConnected = providerKey === "custom"
                  ? !!saved?.baseUrl
                  : providerKey === "anthropic"
                    ? (!!saved?.hasKey || saved?.endpointType === "claude_code")
                    : !!saved?.hasKey
                const isSaving = savingProvider === providerKey
                const keyVal = apiKeys[providerKey] ?? ""
                const showKey = showKeys[providerKey] ?? false
                const baseUrl = baseUrls[providerKey] ?? ""
                const enabled = enabledModels[providerKey] ?? new Set<string>()

                // Tools note for card header
                const toolsNoteEl = meta.toolsNote === "all" ? (
                  <span className="inline-flex items-center gap-0.5 text-xs text-green-600">
                    <Wrench className="h-2.5 w-2.5" /> {t("toolsNote.all")}
                  </span>
                ) : meta.toolsNote === "unknown" ? (
                  <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                    <Wrench className="h-2.5 w-2.5" /> {t("toolsNote.unknown")}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 text-xs text-amber-500">
                    <AlertTriangle className="h-2.5 w-2.5" /> {t("toolsNote.partial")}
                  </span>
                )

                const ProviderIcon = PROVIDER_ICONS[providerKey]

                return (
                  <div key={providerKey} className={cn(
                    "rounded-xl border bg-card overflow-hidden",
                    isConnected ? "border-border" : "border-dashed border-border"
                  )}>
                    {/* Card Header */}
                    <div className="px-3 py-3 sm:px-5 sm:py-4 border-b border-border/60">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="size-8 flex items-center justify-center shrink-0">
                            {ProviderIcon
                              ? <ProviderIcon className="size-4" />
                              : <span className="text-base leading-none">{meta.icon}</span>
                            }
                          </div>
                          <h2 className="text-sm font-semibold">{meta.name}</h2>
                        </div>
                        <div className="flex items-center gap-2">
                          {isConnected
                            ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-green-100 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800">{t("connected")}</span>
                            : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border border-border text-muted-foreground">{t("notConnected")}</span>}
                          {isConnected && (
                            <Button
                              variant="ghost" size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              onClick={() => setRemoveTarget(providerKey)}
                              title={t("remove")}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5">
                        {toolsNoteEl}
                        {isConnected && saved?.apiKeyMasked && (
                          <span className="text-xs font-mono text-muted-foreground">
                            {saved.apiKeyMasked}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-3 sm:p-5 space-y-3 sm:space-y-4">
                      {/* Anthropic access method toggle — shown first, above API key */}
                      {providerKey === "anthropic" && (
                        <div className="space-y-1.5">
                          <Label className="text-xs">{t("accessMethod.label")}</Label>
                          <div className="flex gap-1">
                            {(["claude_code", "api_key"] as const).map(method => (
                              <button
                                key={method}
                                onClick={() => setAnthropicAccessMethod(method)}
                                className={`flex-1 text-xs py-1 px-2 rounded border transition-colors ${
                                  anthropicAccessMethod === method
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "border-input bg-background hover:bg-accent"
                                }`}
                              >
                                {t(`accessMethod.${method}`)}
                              </button>
                            ))}
                          </div>
                          {anthropicAccessMethod === "claude_code" && (
                            <p className="text-xs text-muted-foreground leading-tight">
                              💡 {t("accessMethod.claudeCodeHint")}
                            </p>
                          )}
                        </div>
                      )}

                      {/* API Key — hidden for Anthropic in Claude Code mode */}
                      {providerKey !== "custom" && !(providerKey === "anthropic" && anthropicAccessMethod === "claude_code") && (
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
                            <p className="text-xs text-muted-foreground leading-tight">
                              💡 tool calling 지원 모델이 먼저 표시돼요. 불러온 후 ✓ 표시를 확인하세요.
                            </p>
                          )}
                          {customEndpointType === "openai_compatible" && (
                            <p className="text-xs text-muted-foreground leading-tight">
                              💡 tool calling 지원 여부는 서버 구현에 따라 다를 수 있어요.
                            </p>
                          )}
                        </div>
                      )}

                      {/* Models — checkbox list (predefined providers) */}
                      {meta.models.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">{t("enabledModels")}</Label>
                            <span className="text-xs text-muted-foreground">{t("modelCount", { selected: enabled.size, total: meta.models.length })}</span>
                          </div>
                          <div className="relative">
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
                            {meta.models.length > 4 && (
                              <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-card to-transparent pointer-events-none" />
                            )}
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
                                        <span className="text-xs text-green-600 font-medium flex items-center gap-0.5 shrink-0">
                                          <Wrench className="h-2.5 w-2.5" /> tools
                                        </span>
                                      )}
                                      {toolsOk === false && (
                                        <span className="text-xs text-amber-500 font-medium flex items-center gap-0.5 shrink-0">
                                          <AlertTriangle className="h-2.5 w-2.5" /> {t("toolsUnsupported")}
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
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Pricing Tab ───────────────────────────────────────────────── */}
        <TabsContent value="pricing">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("pricing.subtitle")}
            </p>

            {allEnabledModels.filter(m => PRICING_PROVIDERS.has(m.provider)).length === 0 ? (
              <div className="rounded-xl border border-dashed border-border py-12 flex flex-col items-center gap-3 text-center">
                <DollarSign className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">{t("pricing.noModels")}</p>
                <p className="text-xs text-muted-foreground/70">{t("pricing.noModelsHint")}</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border overflow-x-auto">
                <div className="min-w-[540px]">
                {/* Header */}
                <div className="grid grid-cols-[1fr_100px_100px_100px_80px] gap-2 px-4 py-2 bg-muted/40 border-b border-border text-xs font-medium text-muted-foreground">
                  <span>{t("pricing.colModel")}</span>
                  <span>{t("pricing.colInput")} <span className="font-normal opacity-60">($/1M)</span></span>
                  <span>{t("pricing.colOutput")} <span className="font-normal opacity-60">($/1M)</span></span>
                  <span>{t("pricing.colCache")} <span className="font-normal opacity-60">($/1M)</span></span>
                  <span></span>
                </div>

                {allEnabledModels.filter(m => PRICING_PROVIDERS.has(m.provider)).map(({ modelId, modelName, provider, providerName }) => {
                  const edit = getPricingEdit(modelId)
                  const isCustom = !!savedPricing[modelId]
                  const isSavingThis = savingPricing === modelId
                  const ProviderIcon = PROVIDER_ICONS[provider]
                  const isClaudeCode = provider === "anthropic" && anthropicAccessMethod === "claude_code"

                  const defaultPrice = getDefaultPrice(modelId)

                  return (
                    <div
                      key={modelId}
                      className={cn(
                        "grid grid-cols-[1fr_100px_100px_100px_80px] gap-2 items-center px-4 py-2 border-b border-border/60 last:border-0",
                        isCustom && !isClaudeCode && "bg-blue-50/30 dark:bg-blue-950/10",
                        isClaudeCode && "bg-violet-50/30 dark:bg-violet-950/10",
                      )}
                    >
                      {/* Model info */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {ProviderIcon
                            ? <ProviderIcon className="size-3 text-muted-foreground shrink-0" />
                            : <span className="text-xs">{PROVIDER_META[provider]?.icon}</span>
                          }
                          <span className="text-xs font-medium truncate">{modelName}</span>
                          {isClaudeCode && (
                            <span className="text-xs bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 px-1.5 py-0.5 rounded font-medium shrink-0">
                              {t("pricing.subscription")}
                            </span>
                          )}
                          {isCustom && (
                            <span className="text-xs text-blue-600 dark:text-blue-400 shrink-0">
                              {t("pricing.custom")}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">{modelId}</p>
                        <p className="text-xs text-muted-foreground">{providerName}</p>
                      </div>

                      {/* Input price */}
                      <div className="relative">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder={defaultPrice != null ? String(defaultPrice.input) : t("pricing.noDefault")}
                          value={edit.input}
                          onChange={e => setPricingEdit(modelId, "input", e.target.value)}
                          className="h-7 text-xs font-mono pr-1"
                        />
                      </div>

                      {/* Output price */}
                      <div className="relative">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder={defaultPrice != null ? String(defaultPrice.output) : t("pricing.noDefault")}
                          value={edit.output}
                          onChange={e => setPricingEdit(modelId, "output", e.target.value)}
                          className="h-7 text-xs font-mono pr-1"
                        />
                      </div>

                      {/* Cache price */}
                      <div className="relative">
                        <Input
                          type="number"
                          min="0"
                          step="0.001"
                          placeholder={defaultPrice?.cached != null ? String(defaultPrice.cached) : t("pricing.noDefault")}
                          value={edit.cache}
                          onChange={e => setPricingEdit(modelId, "cache", e.target.value)}
                          className="h-7 text-xs font-mono pr-1"
                        />
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          disabled={isSavingThis}
                          onClick={() => savePricing(modelId, provider)}
                        >
                          {isSavingThis
                            ? <RefreshCw className="h-3 w-3 animate-spin" />
                            : t("pricing.save")}
                        </Button>
                        {isCustom && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            title={t("pricing.reset")}
                            onClick={() => setResetPricingTarget(modelId)}
                          >
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">{t("pricing.hint")}</p>
          </div>
        </TabsContent>

        {/* Assignments tab removed */}

      </Tabs>

      {/* ── AlertDialog: Remove Provider ───────────────────────────── */}
      <AlertDialog open={!!removeTarget} onOpenChange={open => { if (!open) setRemoveTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("removeDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget && t("removeDialog.description", { name: PROVIDER_META[removeTarget]?.name ?? removeTarget })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("removeDialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => removeTarget && removeProvider(removeTarget)}
            >
              {t("removeDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── AlertDialog: Reset Pricing ────────────────────────────── */}
      <AlertDialog open={!!resetPricingTarget} onOpenChange={open => { if (!open) setResetPricingTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("resetPricingDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {resetPricingTarget && t("resetPricingDialog.description", { model: resetPricingTarget })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("removeDialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => resetPricingTarget && resetPricing(resetPricingTarget)}>
              {t("resetPricingDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


    </div>
    </TooltipProvider>
  )
}
