export interface SavedSearch {
  id: number
  query: string
  result: string
  created_at: string
}

export function formatRelativeDate(
  raw: string,
  labels: { justNow: string; minutesAgo: (n: number) => string; hoursAgo: (n: number) => string; daysAgo: (n: number) => string }
): string {
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)
  if (diffMin < 1) return labels.justNow
  if (diffMin < 60) return labels.minutesAgo(diffMin)
  if (diffHour < 24) return labels.hoursAgo(diffHour)
  if (diffDay < 7) return labels.daysAgo(diffDay)
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}
