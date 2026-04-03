"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  BrainCircuit,
  MessageSquare,
  TrendingUp,
  BookMarked,
  Trash2,
  Loader2,
  Smile,
  Meh,
  Frown,
  Tag,
  ChevronDown,
  ChevronUp,
  CalendarDays,
  Sparkles,
  RefreshCw,
  ExternalLink,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

// ─── Types ───────────────────────────────────────────────────────────────────

interface KnowledgeItem {
  id: number
  key: string
  value: string
  source: string
  created_at: string
}

interface ConversationInsight {
  type:
    | "spending_intent"
    | "emotional_state"
    | "key_decision"
    | "life_event"
    | "financial_concern"
  summary: string
  detail: string
  confidence: number
}

interface ConversationAnalysis {
  insights: ConversationInsight[]
  overall_mood: "positive" | "neutral" | "negative" | "mixed"
  topics: string[]
}

interface BehaviorPattern {
  type: string
  description: string
  category?: string
  confidence: number
  trigger?: {
    day_of_week?: string
    always?: boolean
  }
}

interface PatternAnalysis {
  patterns: BehaviorPattern[]
}

interface WeeklySummary {
  week: string
  summary: string
  key_events: string[]
  emotional_trend: "positive" | "neutral" | "negative" | "mixed"
  financial_context: string
  topics: string[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MOOD_COLOR: Record<string, string> = {
  positive: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  neutral:  "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  negative: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  mixed:    "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
}

const INSIGHT_TYPE_COLOR: Record<string, string> = {
  spending_intent:  "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800",
  emotional_state:  "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-800",
  key_decision:     "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800",
  life_event:       "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800",
  financial_concern:"bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800",
}

const PATTERN_TYPE_COLOR: Record<string, string> = {
  day_of_week_spending: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300",
  recurring_payment:    "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300",
  spending_velocity:    "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300",
  emotional_trend:      "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300",
  temporal_comparison:  "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/40 dark:text-teal-300",
}

function formatDateKey(key: string): string {
  const raw = key.split(":").pop() ?? key
  const dateMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateMatch) {
    const d = new Date(raw + "T00:00:00")
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString(undefined, { month: "long", day: "numeric", weekday: "short" })
    }
  }
  return raw
}

function formatWeekLabel(key: string, weekLabel: string): string {
  const raw = key.split(":").pop() ?? key
  // ISO week: YYYY-Www
  const weekMatch = raw.match(/^(\d{4})-W(\d{2})$/)
  if (weekMatch) {
    return `${weekMatch[1]} ${weekLabel} ${parseInt(weekMatch[2])}`
  }
  // Date-based week
  const dateMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateMatch) {
    const d = new Date(raw + "T00:00:00")
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) + " " + weekLabel
    }
  }
  return raw
}

function formatKoreanDate(raw: string): string {
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw.slice(0, 10)
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
}

function MoodIcon({ mood }: { mood: string }) {
  if (mood === "positive") return <Smile className="size-4" />
  if (mood === "negative") return <Frown className="size-4" />
  return <Meh className="size-4" />
}

// #5: 신뢰도 레이블 추가
function ConfidenceBar({ value, tFn }: { value: number; tFn: (key: string) => string }) {
  const pct = Math.round(value * 100)
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-yellow-500" : "bg-orange-500"
  const label = pct >= 80 ? tFn("confidenceHigh") : pct >= 60 ? tFn("confidenceMid") : tFn("confidenceLow")
  const labelColor = pct >= 80 ? "text-emerald-600 dark:text-emerald-400" : pct >= 60 ? "text-yellow-600 dark:text-yellow-400" : "text-orange-600 dark:text-orange-400"
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn("text-xs font-medium w-8 text-right", labelColor)}>{label}</span>
    </div>
  )
}

function parseSafe<T>(json: string): T | null {
  try {
    return JSON.parse(json) as T
  } catch {
    return null
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// #3: 온보딩 설명이 포함된 EmptyState
function EmptyState({
  icon: Icon,
  message,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>
  message: string
  hint?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 border-2 border-dashed border-border rounded-xl text-muted-foreground">
      <Icon className="size-10 opacity-30" />
      <p className="text-sm text-center max-w-xs font-medium">{message}</p>
      {hint && (
        <p className="text-xs text-center max-w-sm text-muted-foreground/70 leading-relaxed">{hint}</p>
      )}
    </div>
  )
}

// ─── Tab 1: 대화 인사이트 ──────────────────────────────────────────────────

function InsightsTab({
  items: rawItems,
  onDelete,
  deletingId,
}: {
  items: KnowledgeItem[]
  onDelete: (id: number) => void
  deletingId: number | null
}) {
  const t = useTranslations("memory")
  const items = Array.isArray(rawItems) ? rawItems : []
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  useEffect(() => {
    if (items.length > 0 && (!selectedKey || !items.find((i) => i.key === selectedKey))) {
      setSelectedKey(items[0].key)
    }
  }, [items, selectedKey])

  if (items.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        message={t("emptyInsights")}
        hint={t("insightsHint")}
      />
    )
  }

  const selected = items.find((i) => i.key === selectedKey)
  const analysis = selected ? parseSafe<ConversationAnalysis>(selected.value) : null

  const insightTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      spending_intent:   t("insightTypeSpendingIntent"),
      emotional_state:   t("insightTypeEmotionalState"),
      key_decision:      t("insightTypeKeyDecision"),
      life_event:        t("insightTypeLifeEvent"),
      financial_concern: t("insightTypeFinancialConcern"),
    }
    return map[type] ?? type
  }

  // #7: 모바일은 Select, 데스크탑은 사이드 목록
  const DateSelector = () => (
    <div className="sm:hidden mb-4">
      <Select value={selectedKey ?? ""} onValueChange={setSelectedKey}>
        <SelectTrigger className="w-full">
          <CalendarDays className="size-4 mr-2 text-muted-foreground" />
          <SelectValue placeholder={t("selectDate")} />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => {
            const data = parseSafe<ConversationAnalysis>(item.value)
            return (
              <SelectItem key={item.key} value={item.key}>
                <span className="flex items-center gap-2">
                  {formatDateKey(item.key)}
                  {data?.overall_mood && (
                    <span>
                      {data.overall_mood === "positive" ? "😊" : data.overall_mood === "negative" ? "😞" : "😐"}
                    </span>
                  )}
                </span>
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
    </div>
  )

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* #7: 모바일 날짜 선택 드롭다운 */}
      <div className="sm:hidden">
        <DateSelector />
      </div>

      {/* #7: 데스크탑 사이드 날짜 목록 */}
      <div className="hidden sm:block lg:w-48 shrink-0">
        <ScrollArea className="lg:h-[480px]">
          <div className="flex gap-2 pb-2 sm:flex-col sm:pb-0">
            {items.map((item) => {
              const data = parseSafe<ConversationAnalysis>(item.value)
              const isSelected = selectedKey === item.key
              // #8: 인사이트 개수 표시
              const insightCount = data?.insights?.length ?? 0
              return (
                <button
                  key={item.key}
                  onClick={() => setSelectedKey(item.key)}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors text-left w-full",
                    isSelected
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-transparent hover:bg-muted text-muted-foreground"
                  )}
                >
                  <CalendarDays className="size-3.5 shrink-0" />
                  <span className="truncate flex-1">{formatDateKey(item.key)}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* #8: insight count badge */}
                    {insightCount > 0 && (
                      <span className={cn(
                        "text-xs rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center",
                        isSelected ? "bg-primary/20" : "bg-muted"
                      )}>
                        {insightCount}
                      </span>
                    )}
                    {data?.overall_mood && (
                      <span className={cn("text-xs rounded-full px-1 py-0.5", MOOD_COLOR[data.overall_mood])}>
                        {data.overall_mood === "positive" ? "😊" : data.overall_mood === "negative" ? "😞" : "😐"}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Detail panel */}
      <div className="flex-1 min-w-0">
        {!analysis ? (
          <div className="rounded-xl border border-border bg-card py-8 text-center text-muted-foreground text-sm">
            {t("selectDate")}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Mood + topics header */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className={cn("flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium", MOOD_COLOR[analysis.overall_mood])}>
                  <MoodIcon mood={analysis.overall_mood} />
                  {t(`mood${analysis.overall_mood.charAt(0).toUpperCase() + analysis.overall_mood.slice(1)}` as Parameters<typeof t>[0])}
                </div>
                {analysis.topics.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {analysis.topics.map((topic) => (
                      <Badge key={topic} variant="secondary" className="text-xs">
                        <Tag className="size-3 mr-1" />
                        {topic}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              {/* #6: 인사이트 삭제 */}
              {selected && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive gap-1.5 opacity-60 hover:opacity-100 transition-opacity shrink-0"
                  onClick={() => onDelete(selected.id)}
                  disabled={deletingId === selected.id}
                >
                  {deletingId === selected.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                  {t("deleteThisDay")}
                </Button>
              )}
            </div>

            {/* Insight cards */}
            <div className="space-y-2">
              {analysis.insights.map((insight, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-border bg-card overflow-hidden"
                >
                  <div className="py-3 px-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <span className={cn("text-xs rounded-full px-2 py-0.5 border font-medium", INSIGHT_TYPE_COLOR[insight.type] ?? "bg-muted text-muted-foreground border-border")}>
                        {insightTypeLabel(insight.type)}
                      </span>
                      <div className="flex items-center gap-1.5 w-32">
                        <span className="text-xs text-muted-foreground shrink-0">{t("confidence")}</span>
                        <ConfidenceBar value={insight.confidence} tFn={t} />
                      </div>
                    </div>
                    <p className="text-sm font-medium">{insight.summary}</p>
                    {insight.detail && (
                      <p className="text-xs text-muted-foreground mt-1">{insight.detail}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tab 2: 행동 패턴 ─────────────────────────────────────────────────────

function PatternsTab({
  items: rawItems,
  onDelete,
  deletingId,
}: {
  items: KnowledgeItem[]
  onDelete: (id: number) => void
  deletingId: number | null
}) {
  const t = useTranslations("memory")
  const items = Array.isArray(rawItems) ? rawItems : []

  // #2: 히스토리 - 날짜 선택 state
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  useEffect(() => {
    if (items.length > 0 && (!selectedKey || !items.find((i) => i.key === selectedKey))) {
      setSelectedKey(items[0].key)
    }
  }, [items, selectedKey])

  if (items.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        message={t("emptyPatterns")}
        hint={t("patternsHint")}
      />
    )
  }

  const selected = items.find((i) => i.key === selectedKey) ?? items[0]
  const data = parseSafe<PatternAnalysis>(selected.value)

  const patternTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      day_of_week_spending: t("patternTypeDayOfWeek"),
      recurring_payment:    t("patternTypeRecurring"),
      spending_velocity:    t("patternTypeVelocity"),
      emotional_trend:      t("patternTypeEmotional"),
      temporal_comparison:  t("patternTypeTemporal"),
    }
    return map[type] ?? type
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {t("analyzedOn", { date: formatKoreanDate(selected.created_at) })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* #2: 히스토리 날짜 선택 */}
          {items.length > 1 && (
            <Select value={selectedKey ?? ""} onValueChange={setSelectedKey}>
              <SelectTrigger className="h-8 text-xs w-44">
                <CalendarDays className="size-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder={t("selectAnalysis")} />
              </SelectTrigger>
              <SelectContent>
                {items.map((item, idx) => (
                  <SelectItem key={item.key} value={item.key} className="text-xs">
                    {formatKoreanDate(item.created_at)}
                    {idx === 0 && <span className="ml-1.5 text-primary">({t("latest")})</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {/* #6: 패턴 삭제 */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-destructive hover:text-destructive gap-1 opacity-60 hover:opacity-100 transition-opacity"
            onClick={() => onDelete(selected.id)}
            disabled={deletingId === selected.id}
          >
            {deletingId === selected.id ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Trash2 className="size-3" />
            )}
            {t("delete")}
          </Button>
        </div>
      </div>

      {!data || data.patterns.length === 0 ? (
        <EmptyState icon={TrendingUp} message={t("noPatternData")} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.patterns.map((pattern, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-border bg-card overflow-hidden"
            >
              <div className="py-4 px-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={cn("text-xs rounded-full px-2 py-0.5 border font-medium", PATTERN_TYPE_COLOR[pattern.type] ?? "bg-muted text-muted-foreground border-border")}>
                    {patternTypeLabel(pattern.type)}
                  </span>
                  {pattern.category && (
                    <Badge variant="outline" className="text-xs">{pattern.category}</Badge>
                  )}
                </div>
                <p className="text-sm leading-relaxed">{pattern.description}</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground shrink-0">{t("confidence")}</span>
                  <ConfidenceBar value={pattern.confidence} tFn={t} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Tab 3: 주간 기억 ─────────────────────────────────────────────────────

function WeeklyTab({
  items: rawItems,
  onDelete,
  deletingId,
  onViewInsights,
}: {
  items: KnowledgeItem[]
  onDelete: (id: number) => void
  deletingId: number | null
  onViewInsights: () => void  // #9: 크로스 링크
}) {
  const t = useTranslations("memory")
  const items = Array.isArray(rawItems) ? rawItems : []
  const [expanded, setExpanded] = useState<Set<number>>(new Set([items[0]?.id]))

  if (items.length === 0) {
    return (
      <EmptyState
        icon={BookMarked}
        message={t("emptyWeekly")}
        hint={t("weeklyHint")}
      />
    )
  }

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const data = parseSafe<WeeklySummary>(item.value)
        if (!data) return null
        const isOpen = expanded.has(item.id)
        const weekLabel = formatWeekLabel(item.key, t("weekLabel"))

        return (
          <div
            key={item.id}
            className="rounded-xl border border-border bg-card overflow-hidden"
          >
            {/* Collapsible header */}
            <button className="w-full text-left" onClick={() => toggle(item.id)}>
              <div className="py-3 px-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <CalendarDays className="size-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm">{weekLabel}</span>
                    <span className={cn("text-xs rounded-full px-2 py-0.5", MOOD_COLOR[data.emotional_trend])}>
                      {t(`mood${data.emotional_trend.charAt(0).toUpperCase() + data.emotional_trend.slice(1)}` as Parameters<typeof t>[0])}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isOpen ? (
                      <ChevronUp className="size-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="size-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
                {!isOpen && (
                  <p className="text-xs text-muted-foreground line-clamp-1 mt-1">{data.summary}</p>
                )}
              </div>
            </button>

            {/* Expanded content */}
            {isOpen && (
              <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
                <p className="text-sm leading-relaxed">{data.summary}</p>

                {data.key_events.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">{t("keyEvents")}</p>
                    <ul className="space-y-1.5">
                      {data.key_events.map((event, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="text-primary mt-0.5 shrink-0">•</span>
                          {event}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {data.financial_context && (
                  <div className="rounded-lg bg-muted/50 px-3 py-2">
                    <p className="text-xs font-medium text-muted-foreground mb-0.5">{t("financialContext")}</p>
                    <p className="text-sm">{data.financial_context}</p>
                  </div>
                )}

                {data.topics.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {data.topics.map((topic) => (
                      <Badge key={topic} variant="secondary" className="text-xs">
                        <Tag className="size-3 mr-1" />
                        {topic}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between pt-1 border-t border-border/40">
                  {/* #9: 크로스 링크 — 인사이트 탭으로 이동 */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                    onClick={onViewInsights}
                  >
                    <ExternalLink className="size-3.5" />
                    {t("viewInsights")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive gap-1.5 opacity-60 hover:opacity-100 transition-opacity text-xs"
                    onClick={() => onDelete(item.id)}
                    disabled={deletingId === item.id}
                  >
                    {deletingId === item.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                    {t("delete")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MemoryPage() {
  const t = useTranslations("memory")

  const [activeTab, setActiveTab] = useState("insights")
  const [insightItems, setInsightItems] = useState<KnowledgeItem[]>([])
  const [patternItems, setPatternItems] = useState<KnowledgeItem[]>([])
  const [weeklyItems, setWeeklyItems] = useState<KnowledgeItem[]>([])
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deleteContext, setDeleteContext] = useState<{ id: number; tab: string } | null>(null)

  // #1: force 파라미터로 강제 새로고침 지원
  const fetchTab = useCallback(async (tab: string, force = false) => {
    const hasData =
      (tab === "insights" && insightItems.length > 0) ||
      (tab === "patterns" && patternItems.length > 0) ||
      (tab === "weekly" && weeklyItems.length > 0)
    if (hasData && !force) return

    setLoading((prev) => ({ ...prev, [tab]: true }))
    try {
      const prefixMap: Record<string, string> = {
        insights: "conversation:analysis:",
        patterns: "pattern:analysis_result",
        weekly:   "memory:weekly_summary:",
      }
      const prefix = prefixMap[tab]
      if (!prefix) return

      const res = await fetch(`/api/knowledge?prefix=${encodeURIComponent(prefix)}`)
      if (!res.ok) return
      const raw = await res.json()
      const data: KnowledgeItem[] = Array.isArray(raw) ? raw : (raw?.items ?? raw?.data ?? [])

      if (tab === "insights") setInsightItems(data)
      else if (tab === "patterns") setPatternItems(data)
      else if (tab === "weekly") setWeeklyItems(data)
    } finally {
      setLoading((prev) => ({ ...prev, [tab]: false }))
    }
  }, [insightItems.length, patternItems.length, weeklyItems.length])

  useEffect(() => {
    fetchTab("insights")
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    fetchTab(tab)
  }

  // #1: 새로고침 버튼 핸들러
  const handleRefresh = () => {
    fetchTab(activeTab, true)
  }

  const handleDeleteRequest = (id: number, tab: string) => {
    setDeleteContext({ id, tab })
  }

  const handleDeleteConfirm = async () => {
    if (!deleteContext) return
    const { id, tab } = deleteContext
    setDeletingId(id)
    setDeleteContext(null)
    try {
      await fetch(`/api/knowledge/${id}`, { method: "DELETE" })
      if (tab === "insights") setInsightItems((prev) => prev.filter((i) => i.id !== id))
      else if (tab === "patterns") setPatternItems((prev) => prev.filter((i) => i.id !== id))
      else if (tab === "weekly") setWeeklyItems((prev) => prev.filter((i) => i.id !== id))
    } finally {
      setDeletingId(null)
    }
  }

  const isLoading = (tab: string) => loading[tab] === true

  // #10: 전체 통계 요약
  const totalInsights = useMemo(() =>
    insightItems.reduce((acc, item) => {
      const d = parseSafe<ConversationAnalysis>(item.value)
      return acc + (d?.insights?.length ?? 0)
    }, 0),
    [insightItems]
  )

  const totalPatterns = useMemo(() => {
    if (patternItems.length === 0) return 0
    const d = parseSafe<PatternAnalysis>(patternItems[0].value)
    return d?.patterns?.length ?? 0
  }, [patternItems])

  const hasAnyData = insightItems.length > 0 || patternItems.length > 0 || weeklyItems.length > 0

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <BrainCircuit className="size-6 text-primary" />
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>
        {/* #1: 새로고침 버튼 */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isLoading(activeTab)}
          className="gap-1.5 self-start"
        >
          {isLoading(activeTab) ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          {t("refresh")}
        </Button>
      </div>

      {/* #10: 전체 통계 요약 */}
      {hasAnyData && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-center">
            <p className="text-2xl font-bold text-primary">{insightItems.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t("statsDaysRemembered")}</p>
          </div>
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-center">
            <p className="text-2xl font-bold text-primary">{totalInsights}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t("statsTotalInsights")}</p>
          </div>
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-center">
            <p className="text-2xl font-bold text-primary">{weeklyItems.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t("statsWeeklyRecords")}</p>
          </div>
        </div>
      )}

      {/* #3: 온보딩 배너 — 데이터 없을 때 */}
      {!hasAnyData && !isLoading("insights") && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-4 flex gap-3">
          <BrainCircuit className="size-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("onboardingTitle")}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t("onboardingDesc")}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="w-full sm:w-auto justify-start">
          <TabsTrigger value="insights" className="flex-1 sm:flex-none gap-1.5">
            <MessageSquare className="size-4" />
            <span className="hidden sm:inline">{t("tabInsights")}</span>
            <span className="sm:hidden">{t("tabInsightsShort")}</span>
            {insightItems.length > 0 && (
              <span className="ml-0.5 text-xs opacity-70">({insightItems.length})</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="patterns" className="flex-1 sm:flex-none gap-1.5">
            <TrendingUp className="size-4" />
            <span className="hidden sm:inline">{t("tabPatterns")}</span>
            <span className="sm:hidden">{t("tabPatternsShort")}</span>
            {totalPatterns > 0 && (
              <span className="ml-0.5 text-xs opacity-70">({totalPatterns})</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="weekly" className="flex-1 sm:flex-none gap-1.5">
            <BookMarked className="size-4" />
            <span className="hidden sm:inline">{t("tabWeekly")}</span>
            <span className="sm:hidden">{t("tabWeeklyShort")}</span>
            {weeklyItems.length > 0 && (
              <span className="ml-0.5 text-xs opacity-70">({weeklyItems.length})</span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="insights" className="mt-6">
          {isLoading("insights") ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="size-5 rounded" />
                    <Skeleton className="h-4 w-40" />
                  </div>
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              ))}
            </div>
          ) : (
            <InsightsTab
              items={insightItems}
              onDelete={(id) => handleDeleteRequest(id, "insights")}
              deletingId={deletingId}
            />
          )}
        </TabsContent>

        <TabsContent value="patterns" className="mt-6">
          {isLoading("patterns") ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="size-5 rounded" />
                    <Skeleton className="h-4 w-36" />
                  </div>
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              ))}
            </div>
          ) : (
            <PatternsTab
              items={patternItems}
              onDelete={(id) => handleDeleteRequest(id, "patterns")}
              deletingId={deletingId}
            />
          )}
        </TabsContent>

        <TabsContent value="weekly" className="mt-6">
          {isLoading("weekly") ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-5/6" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              ))}
            </div>
          ) : (
            <WeeklyTab
              items={weeklyItems}
              onDelete={(id) => handleDeleteRequest(id, "weekly")}
              deletingId={deletingId}
              onViewInsights={() => handleTabChange("insights")}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteContext !== null}
        onOpenChange={(open) => !open && setDeleteContext(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteWeeklyTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteWeeklyDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
