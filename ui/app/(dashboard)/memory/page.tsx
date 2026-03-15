"use client"

import { useState, useEffect, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
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
} from "lucide-react"

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
  positive:
    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  neutral: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  negative: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  mixed:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
}

const INSIGHT_TYPE_COLOR: Record<string, string> = {
  spending_intent: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  emotional_state: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  key_decision: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  life_event: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  financial_concern: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
}

const PATTERN_TYPE_COLOR: Record<string, string> = {
  day_of_week_spending: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  recurring_payment: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  spending_velocity: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  emotional_trend: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  temporal_comparison: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
}

function MoodIcon({ mood }: { mood: string }) {
  if (mood === "positive") return <Smile className="size-4" />
  if (mood === "negative") return <Frown className="size-4" />
  return <Meh className="size-4" />
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color =
    pct >= 80 ? "bg-green-500" : pct >= 60 ? "bg-yellow-500" : "bg-orange-500"
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
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

function formatDateKey(key: string) {
  // "conversation:analysis:2026-03-15" → "2026-03-15"
  const parts = key.split(":")
  return parts[parts.length - 1]
}

function formatWeekLabel(key: string) {
  // "memory:weekly_summary:2026-W10" → "2026-W10"
  const parts = key.split(":")
  return parts[parts.length - 1]
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EmptyState({ icon: Icon, message }: { icon: React.ComponentType<{ className?: string }>; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
      <Icon className="size-10 opacity-30" />
      <p className="text-sm text-center max-w-xs">{message}</p>
    </div>
  )
}

// ─── Tab 1: 대화 인사이트 ──────────────────────────────────────────────────

function InsightsTab({ items }: { items: KnowledgeItem[] }) {
  const t = useTranslations("memory")
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  useEffect(() => {
    if (items.length > 0 && !selectedKey) {
      setSelectedKey(items[0].key)
    }
  }, [items, selectedKey])

  if (items.length === 0) {
    return <EmptyState icon={MessageSquare} message={t("emptyInsights")} />
  }

  const selected = items.find((i) => i.key === selectedKey)
  const analysis = selected ? parseSafe<ConversationAnalysis>(selected.value) : null

  const insightTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      spending_intent: t("insightTypeSpendingIntent"),
      emotional_state: t("insightTypeEmotionalState"),
      key_decision: t("insightTypeKeyDecision"),
      life_event: t("insightTypeLifeEvent"),
      financial_concern: t("insightTypeFinancialConcern"),
    }
    return map[type] ?? type
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* Date list — horizontal scroll on mobile, vertical on desktop */}
      <div className="lg:w-44 shrink-0">
        <ScrollArea className="lg:h-[480px]">
          <div className="flex gap-2 pb-2 lg:flex-col lg:pb-0">
            {items.map((item) => {
              const dateKey = formatDateKey(item.key)
              const data = parseSafe<ConversationAnalysis>(item.value)
              return (
                <button
                  key={item.key}
                  onClick={() => setSelectedKey(item.key)}
                  className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors text-left
                    lg:w-full
                    ${selectedKey === item.key
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-transparent hover:bg-muted text-muted-foreground"
                    }`}
                >
                  <CalendarDays className="size-3.5 shrink-0" />
                  <span className="truncate">{dateKey}</span>
                  {data?.overall_mood && (
                    <span className={`ml-auto shrink-0 text-xs rounded-full px-1.5 py-0.5 ${MOOD_COLOR[data.overall_mood]}`}>
                      {data.overall_mood === "positive" ? "😊" : data.overall_mood === "negative" ? "😞" : "😐"}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Detail panel */}
      <div className="flex-1 min-w-0">
        {!analysis ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              날짜를 선택하세요
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {/* Header */}
            <div className="flex flex-wrap items-center gap-2">
              <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${MOOD_COLOR[analysis.overall_mood]}`}>
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

            {/* Insights */}
            <div className="space-y-2">
              {analysis.insights.map((insight, idx) => (
                <Card key={idx} className="border-l-4" style={{ borderLeftColor: "var(--primary)" }}>
                  <CardContent className="py-3 px-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                      <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${INSIGHT_TYPE_COLOR[insight.type] ?? "bg-muted text-muted-foreground"}`}>
                        {insightTypeLabel(insight.type)}
                      </span>
                      <div className="flex items-center gap-1.5 w-28">
                        <span className="text-xs text-muted-foreground">{t("confidence")}</span>
                        <ConfidenceBar value={insight.confidence} />
                      </div>
                    </div>
                    <p className="text-sm font-medium">{insight.summary}</p>
                    {insight.detail && (
                      <p className="text-xs text-muted-foreground mt-1">{insight.detail}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tab 2: 행동 패턴 ─────────────────────────────────────────────────────

function PatternsTab({ items }: { items: KnowledgeItem[] }) {
  const t = useTranslations("memory")

  if (items.length === 0) {
    return <EmptyState icon={TrendingUp} message={t("emptyPatterns")} />
  }

  const latest = items[0]
  const data = parseSafe<PatternAnalysis>(latest.value)

  if (!data || data.patterns.length === 0) {
    return <EmptyState icon={TrendingUp} message={t("emptyPatterns")} />
  }

  const patternTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      day_of_week_spending: t("patternTypeDayOfWeek"),
      recurring_payment: t("patternTypeRecurring"),
      spending_velocity: t("patternTypeVelocity"),
      emotional_trend: t("patternTypeEmotional"),
      temporal_comparison: t("patternTypeTemporal"),
    }
    return map[type] ?? type
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Sparkles className="size-3.5" />
        {t("lastAnalyzed")}: {latest.created_at.slice(0, 10)}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {data.patterns.map((pattern, idx) => (
          <Card key={idx}>
            <CardContent className="py-4 px-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${PATTERN_TYPE_COLOR[pattern.type] ?? "bg-muted text-muted-foreground"}`}>
                  {patternTypeLabel(pattern.type)}
                </span>
                {pattern.category && (
                  <Badge variant="outline" className="text-xs">{pattern.category}</Badge>
                )}
              </div>
              <p className="text-sm">{pattern.description}</p>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{t("confidence")}</span>
                <ConfidenceBar value={pattern.confidence} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ─── Tab 3: 주간 기억 ─────────────────────────────────────────────────────

function WeeklyTab({
  items,
  onDelete,
  deletingId,
}: {
  items: KnowledgeItem[]
  onDelete: (id: number) => void
  deletingId: number | null
}) {
  const t = useTranslations("memory")
  const [expanded, setExpanded] = useState<Set<number>>(new Set([items[0]?.id]))

  if (items.length === 0) {
    return <EmptyState icon={BookMarked} message={t("emptyWeekly")} />
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
        const weekLabel = formatWeekLabel(item.key)

        return (
          <Card key={item.id} className="overflow-hidden">
            {/* Collapsible header */}
            <button
              className="w-full text-left"
              onClick={() => toggle(item.id)}
            >
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <CalendarDays className="size-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm">{weekLabel}</span>
                    <span className={`text-xs rounded-full px-2 py-0.5 ${MOOD_COLOR[data.emotional_trend]}`}>
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
              </CardHeader>
            </button>

            {/* Expanded content */}
            {isOpen && (
              <CardContent className="px-4 pb-4 space-y-3 border-t pt-3">
                <p className="text-sm">{data.summary}</p>

                {data.key_events.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">{t("keyEvents")}</p>
                    <ul className="space-y-1">
                      {data.key_events.map((event, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="text-primary mt-0.5">•</span>
                          {event}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {data.financial_context && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">{t("financialContext")}</p>
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

                <div className="flex justify-end pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive gap-1.5"
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
              </CardContent>
            )}
          </Card>
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
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null)

  const fetchTab = useCallback(async (tab: string) => {
    setLoading((prev) => ({ ...prev, [tab]: true }))
    try {
      const prefixMap: Record<string, string> = {
        insights: "conversation:analysis:",
        patterns: "pattern:analysis_result",
        weekly: "memory:weekly_summary:",
      }
      const prefix = prefixMap[tab]
      if (!prefix) return

      const res = await fetch(`/api/knowledge?prefix=${encodeURIComponent(prefix)}`)
      if (!res.ok) return
      const data: KnowledgeItem[] = await res.json()

      if (tab === "insights") setInsightItems(data)
      else if (tab === "patterns") setPatternItems(data)
      else if (tab === "weekly") setWeeklyItems(data)
    } finally {
      setLoading((prev) => ({ ...prev, [tab]: false }))
    }
  }, [])

  // Load initial tab
  useEffect(() => {
    fetchTab("insights")
  }, [fetchTab])

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    const hasData =
      (tab === "insights" && insightItems.length > 0) ||
      (tab === "patterns" && patternItems.length > 0) ||
      (tab === "weekly" && weeklyItems.length > 0)
    if (!hasData) {
      fetchTab(tab)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    setDeletingId(deleteTarget)
    setDeleteTarget(null)
    try {
      await fetch(`/api/knowledge/${deleteTarget}`, { method: "DELETE" })
      setWeeklyItems((prev) => prev.filter((i) => i.id !== deleteTarget))
    } finally {
      setDeletingId(null)
    }
  }

  const isLoading = (tab: string) => loading[tab] === true

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <BrainCircuit className="size-6 text-primary" />
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="insights" className="flex-1 sm:flex-none gap-1.5">
            <MessageSquare className="size-4" />
            <span className="hidden sm:inline">{t("tabInsights")}</span>
            <span className="sm:hidden">인사이트</span>
          </TabsTrigger>
          <TabsTrigger value="patterns" className="flex-1 sm:flex-none gap-1.5">
            <TrendingUp className="size-4" />
            <span className="hidden sm:inline">{t("tabPatterns")}</span>
            <span className="sm:hidden">패턴</span>
          </TabsTrigger>
          <TabsTrigger value="weekly" className="flex-1 sm:flex-none gap-1.5">
            <BookMarked className="size-4" />
            <span className="hidden sm:inline">{t("tabWeekly")}</span>
            <span className="sm:hidden">주간</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="insights" className="mt-6">
          {isLoading("insights") ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <InsightsTab items={insightItems} />
          )}
        </TabsContent>

        <TabsContent value="patterns" className="mt-6">
          {isLoading("patterns") ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <PatternsTab items={patternItems} />
          )}
        </TabsContent>

        <TabsContent value="weekly" className="mt-6">
          {isLoading("weekly") ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <WeeklyTab
              items={weeklyItems}
              onDelete={(id) => setDeleteTarget(id)}
              deletingId={deletingId}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Delete confirmation */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={() => setDeleteTarget(null)}>
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
