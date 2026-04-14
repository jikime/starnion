export type Category = 'family' | 'business' | 'friend' | 'acquaintance'

export type SocialPlatform = 'facebook' | 'instagram' | 'x' | 'linkedin' | 'threads'
export type SocialProfiles = Partial<Record<SocialPlatform, string | null>>

export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  'facebook',
  'instagram',
  'x',
  'linkedin',
  'threads',
]

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  x: 'X',
  linkedin: 'LinkedIn',
  threads: 'Threads',
}

export const SOCIAL_PLATFORM_REGEX: Record<SocialPlatform, RegExp> = {
  facebook: /^https?:\/\/(www\.)?(facebook|fb)\.com\/[\w.\-/?=&]+$/,
  instagram: /^https?:\/\/(www\.)?instagram\.com\/[\w.\-/?=&]+$/,
  x: /^https?:\/\/(www\.)?(x|twitter)\.com\/[\w.\-/?=&]+$/,
  linkedin: /^https?:\/\/(www\.)?linkedin\.com\/(in|company)\/[\w.\-/?=&]+$/,
  threads: /^https?:\/\/(www\.)?threads\.(net|com)\/@?[\w.\-/?=&]+$/,
}

export const SOCIAL_PLATFORM_PLACEHOLDER: Record<SocialPlatform, string> = {
  facebook: 'https://facebook.com/username',
  instagram: 'https://instagram.com/username',
  x: 'https://x.com/username',
  linkedin: 'https://linkedin.com/in/username',
  threads: 'https://threads.net/@username',
}

export interface BusinessCard {
  imageUrl?: string
  companyNameEn?: string
  address?: string
  website?: string
  department?: string
  fax?: string
  scannedAt?: string
  ocrRawText?: string
}

export interface Connection {
  id: string
  name: string
  role: string
  company: string
  category: Category
  connectionScore: number // 0.0 ~ 1.0 — Phase 1 placeholder
  lastContactDate: string | null // ISO string; null if never contacted
  contactFrequencyTarget: number // days
  tags: string[]
  contextNotes: string
  email: string
  phone?: string
  birthday?: string
  meetingLocation?: string
  group?: string
  businessCard?: BusinessCard | null
  socialProfiles: SocialProfiles
  createdAt?: string
  updatedAt?: string
}

export function getDaysSinceContact(lastContactDate: string | null | undefined): number {
  if (!lastContactDate) return Number.POSITIVE_INFINITY
  const last = new Date(lastContactDate)
  const now = new Date()
  return Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24))
}

export function isDrifting(conn: Connection): boolean {
  if (!conn.lastContactDate) return true
  return getDaysSinceContact(conn.lastContactDate) > conn.contactFrequencyTarget
}

/** Translation key (connect.scoreLabel.*) for a numeric connection score. */
export type ScoreKey = 'veryClose' | 'close' | 'normal' | 'drifting'

// ── Activity Timeline ─────────────────────────────────────────────

/** Source classification for a connection_activities row. */
export type ActivityKind = 'email' | 'calendar' | 'manual' | 'telegram'

/** One row of the per-connection activity timeline. */
export interface ConnectionActivity {
  id: number
  connectionId: string
  kind: ActivityKind
  /** User-visible category chip (미팅, 통화, 식사, ...) — nullable. */
  label: string | null
  /** ISO 8601 UTC timestamp of when the interaction happened. */
  occurredAt: string
  durationMin: number
  weight: number
  note: string | null
  createdAt: string
}

/** Suggested category chip tokens for the add-activity form.
 *  These are translation keys under `connect.activity.form.labelSuggestions.*`.
 *  Users can type custom labels freeform — the chip list is just a helper. */
export const ACTIVITY_LABEL_SUGGESTIONS = [
  'meeting',
  'call',
  'meal',
  'work',
  'message',
  'other',
] as const

export type ActivityLabelSuggestion = (typeof ACTIVITY_LABEL_SUGGESTIONS)[number]

/** Reminder row for the RemindersPanel (UC-204). */
export interface ReminderItem {
  id: string
  name: string
  company: string | null
  category: Category
  lastContactAt: string | null
  daysOverdue: number
}

export function getScoreKey(score: number): ScoreKey {
  if (score >= 0.8) return 'veryClose'
  if (score >= 0.6) return 'close'
  if (score >= 0.4) return 'normal'
  return 'drifting'
}

export function getCategoryColor(category: Category): string {
  switch (category) {
    case 'family':
      return '#f5c842'
    case 'business':
      return '#4b9ef5'
    case 'friend':
      return '#4ade80'
    case 'acquaintance':
      return '#a78bfa'
  }
}

export function validateSocialUrl(platform: SocialPlatform, url: string): boolean {
  return SOCIAL_PLATFORM_REGEX[platform].test(url)
}
