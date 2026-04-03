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

export const PLATFORM_META: Record<string, { icon: string; label: string }> = {
  telegram: { icon: "📱", label: "텔레그램" },
  discord:  { icon: "🎮", label: "디스코드" },
  slack:    { icon: "💬", label: "슬랙" },
  cli:      { icon: "💻", label: "CLI" },
}

export interface ConversationGroup {
  label: string
  items: Conversation[]
}

export function groupByDate(conversations: Conversation[]): ConversationGroup[] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000)

  const groups: Record<string, Conversation[]> = {}
  for (const conv of conversations) {
    const d = new Date(conv.updated_at)
    let label: string
    if (d >= today) label = "오늘"
    else if (d >= yesterday) label = "어제"
    else if (d >= sevenDaysAgo) label = "지난 7일"
    else label = `${d.getFullYear()}년 ${d.getMonth() + 1}월`
    if (!groups[label]) groups[label] = []
    groups[label].push(conv)
  }

  const order = ["오늘", "어제", "지난 7일"]
  const result: ConversationGroup[] = []
  for (const label of order) {
    if (groups[label]) { result.push({ label, items: groups[label] }); delete groups[label] }
  }
  for (const [label, items] of Object.entries(groups)) result.push({ label, items })
  return result
}
