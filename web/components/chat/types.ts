export interface Conversation {
  id: string
  title: string
  platform: string
  thread_id?: string
  persona_id?: string
  persona_name?: string
  created_at: string
  updated_at: string
}

export interface Persona {
  id: string
  name: string
  description: string
  isDefault: boolean
}

/** Translation key-based platform metadata. Resolve labels via t(`platform_${key}`) or t(tKey) at render time. */
export const PLATFORM_META: Record<string, { icon: string; tKey: string }> = {
  telegram: { icon: "📱", tKey: "platform_telegram" },
  discord:  { icon: "🎮", tKey: "platform_discord" },
  slack:    { icon: "💬", tKey: "platform_slack" },
  cli:      { icon: "💻", tKey: "platform_cli" },
}

export interface ConversationGroup {
  label: string
  items: Conversation[]
}

/**
 * Groups conversations by date. Labels use translation key tokens
 * ("dateToday", "dateYesterday", "dateLast7Days") or "{year}/{month}" for older dates.
 * Resolve the label at render time via t(label) for known keys, or display as-is for month labels.
 */
export function groupByDate(
  conversations: Conversation[],
  t?: (key: string, params?: Record<string, string | number>) => string,
): ConversationGroup[] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000)

  const todayLabel = t ? t("dateToday") : "Today"
  const yesterdayLabel = t ? t("dateYesterday") : "Yesterday"
  const last7Label = t ? t("dateLast7Days") : "Last 7 days"

  const groups: Record<string, Conversation[]> = {}
  for (const conv of conversations) {
    const d = new Date(conv.updated_at)
    let label: string
    if (d >= today) label = todayLabel
    else if (d >= yesterday) label = yesterdayLabel
    else if (d >= sevenDaysAgo) label = last7Label
    else label = t ? t("dateMonthYear", { year: d.getFullYear(), month: d.getMonth() + 1 }) : `${d.getFullYear()}/${d.getMonth() + 1}`
    if (!groups[label]) groups[label] = []
    groups[label].push(conv)
  }

  const order = [todayLabel, yesterdayLabel, last7Label]
  const result: ConversationGroup[] = []
  for (const label of order) {
    if (groups[label]) { result.push({ label, items: groups[label] }); delete groups[label] }
  }
  for (const [label, items] of Object.entries(groups)) result.push({ label, items })
  return result
}
