"use client"

import { useState, useMemo } from "react"
import { useTranslations } from "next-intl"
import { ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"

interface Skill {
  categoryKey: string
  icon: string
  exampleKeys: string[]
}

// Skill categories with translation keys
const SKILLS: Skill[] = [
  {
    categoryKey: "skillWeather",
    icon: "🌤️",
    exampleKeys: [
      "skillWeatherEx1",
      "skillWeatherEx2",
      "skillWeatherEx3",
      "skillWeatherEx4",
    ],
  },
  {
    categoryKey: "skillFinance",
    icon: "💰",
    exampleKeys: [
      "skillFinanceEx1",
      "skillFinanceEx2",
      "skillFinanceEx3",
      "skillFinanceEx4",
    ],
  },
  {
    categoryKey: "skillWebSearch",
    icon: "🔍",
    exampleKeys: [
      "skillWebSearchEx1",
      "skillWebSearchEx2",
      "skillWebSearchEx3",
      "skillWebSearchEx4",
    ],
  },
  {
    categoryKey: "skillPlanner",
    icon: "📋",
    exampleKeys: [
      "skillPlannerEx1",
      "skillPlannerEx2",
      "skillPlannerEx3",
      "skillPlannerEx4",
    ],
  },
  {
    categoryKey: "skillExchange",
    icon: "💱",
    exampleKeys: [
      "skillExchangeEx1",
      "skillExchangeEx2",
      "skillExchangeEx3",
      "skillExchangeEx4",
    ],
  },
  {
    categoryKey: "skillBudget",
    icon: "📊",
    exampleKeys: [
      "skillBudgetEx1",
      "skillBudgetEx2",
      "skillBudgetEx3",
      "skillBudgetEx4",
    ],
  },
  {
    categoryKey: "skillAssets",
    icon: "💎",
    exampleKeys: [
      "skillAssetsEx1",
      "skillAssetsEx2",
      "skillAssetsEx3",
      "skillAssetsEx4",
    ],
  },
  {
    categoryKey: "skillImage",
    icon: "🖼️",
    exampleKeys: [
      "skillImageEx1",
      "skillImageEx2",
      "skillImageEx3",
      "skillImageEx4",
    ],
  },
  {
    categoryKey: "skillDocument",
    icon: "📄",
    exampleKeys: [
      "skillDocumentEx1",
      "skillDocumentEx2",
      "skillDocumentEx3",
      "skillDocumentEx4",
    ],
  },
  {
    categoryKey: "skillVoice",
    icon: "🎤",
    exampleKeys: [
      "skillVoiceEx1",
      "skillVoiceEx2",
      "skillVoiceEx3",
      "skillVoiceEx4",
    ],
  },
  {
    categoryKey: "skillNaverSearch",
    icon: "🇰🇷",
    exampleKeys: [
      "skillNaverSearchEx1",
      "skillNaverSearchEx2",
      "skillNaverSearchEx3",
      "skillNaverSearchEx4",
    ],
  },
  {
    categoryKey: "skillBrowser",
    icon: "🌐",
    exampleKeys: [
      "skillBrowserEx1",
      "skillBrowserEx2",
      "skillBrowserEx3",
      "skillBrowserEx4",
    ],
  },
  {
    categoryKey: "skillGitHub",
    icon: "🐙",
    exampleKeys: [
      "skillGitHubEx1",
      "skillGitHubEx2",
      "skillGitHubEx3",
      "skillGitHubEx4",
    ],
  },
  {
    categoryKey: "skillNotion",
    icon: "📋",
    exampleKeys: [
      "skillNotionEx1",
      "skillNotionEx2",
      "skillNotionEx3",
      "skillNotionEx4",
    ],
  },
  {
    categoryKey: "skillGoogleCalendar",
    icon: "📆",
    exampleKeys: [
      "skillGoogleCalendarEx1",
      "skillGoogleCalendarEx2",
      "skillGoogleCalendarEx3",
      "skillGoogleCalendarEx4",
    ],
  },
  {
    categoryKey: "skillGoogleMail",
    icon: "✉️",
    exampleKeys: [
      "skillGoogleMailEx1",
      "skillGoogleMailEx2",
      "skillGoogleMailEx3",
      "skillGoogleMailEx4",
    ],
  },
]

const DEFAULT_COUNT = 6

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

interface Props {
  onSuggest: (text: string) => void
}

export function ChatEmptyState({ onSuggest }: Props) {
  const t = useTranslations("chat")
  const [expanded, setExpanded] = useState(false)

  // Pick one example key per skill at mount time — stable across re-renders
  const picked = useMemo(
    () => SKILLS.map((s) => ({ categoryKey: s.categoryKey, icon: s.icon, exampleKey: pickRandom(s.exampleKeys) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const visible = expanded ? picked : picked.slice(0, DEFAULT_COUNT)
  const hiddenCount = picked.length - DEFAULT_COUNT

  return (
    <div className="flex flex-col items-center gap-6 px-4 py-10 w-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-2xl">
          ✨
        </div>
        <h2 className="text-xl font-semibold tracking-tight">{t("emptyStateTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("emptyStateSubtitle")}
        </p>
      </div>

      {/* Suggestion grid */}
      <div className="grid grid-cols-2 gap-2 w-full">
        {visible.map((s, i) => (
          <button
            key={i}
            onClick={() => onSuggest(t(s.exampleKey as Parameters<typeof t>[0]))}
            className={cn(
              "group flex flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3",
              "text-left transition-colors hover:bg-accent hover:border-primary/30",
            )}
          >
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span>{s.icon}</span>
              {t(s.categoryKey as Parameters<typeof t>[0])}
            </span>
            <span className="text-sm text-foreground leading-snug">
              {t(s.exampleKey as Parameters<typeof t>[0])}
            </span>
          </button>
        ))}
      </div>

      {/* Show more / collapse toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? (
          <>{t("collapse")} <ChevronUp className="size-3.5" /></>
        ) : (
          <>{t("showMore", { count: hiddenCount })} <ChevronDown className="size-3.5" /></>
        )}
      </button>
    </div>
  )
}
