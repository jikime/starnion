'use client'

/**
 * NionSuggestion — data-driven "why this card matters" header for a
 * connection's persona card. Replaces the hardcoded two-template
 * Phase 1 placeholder that was deleted in 5e301fb. Now that Phase 2
 * gives us real activity rows, drift detection, and per-connection
 * scores, we can compose a meaningful summary entirely client-side
 * without any LLM round-trip:
 *
 *   - drift line (days since contact vs target cadence)
 *   - 90-day activity counts split by kind
 *   - last activity preview (date + label + duration)
 *   - one-sentence action prompt tailored by category + severity
 *
 * 100% client-side after a single listActivities() call. Renders
 * directly above ActivityTimeline so the user sees "what" (timeline)
 * grounded in "why" (this summary).
 */

import { useEffect, useMemo, useState } from 'react'
import { Sparkles, Mail, Calendar, Clock, Send } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  type Connection,
  type ConnectionActivity,
  type ActivityKind,
  getDaysSinceContact,
  isDrifting,
} from '@/lib/connect-data'
import { listActivities } from '@/lib/connect-api'

interface NionSuggestionProps {
  connection: Connection
}

const RECENT_WINDOW_DAYS = 90
const FETCH_LIMIT = 50

interface ComputedStats {
  daysSinceContact: number | null
  daysOverdue: number
  drifting: boolean
  severity: 0 | 1 | 2 | 3
  counts90d: Record<ActivityKind, number>
  totalRecent: number
  lastActivity: ConnectionActivity | null
}

const KIND_ICON: Record<ActivityKind, typeof Mail> = {
  email: Mail,
  calendar: Calendar,
  manual: Clock,
  telegram: Send,
}

export default function NionSuggestion({ connection }: NionSuggestionProps) {
  const t = useTranslations('connect.suggestion')
  const [activities, setActivities] = useState<ConnectionActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    listActivities(connection.id, { limit: FETCH_LIMIT })
      .then(res => {
        if (cancelled) return
        setActivities(res.items)
      })
      .catch(() => {
        if (cancelled) return
        setError(true)
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [connection.id])

  const stats = useMemo(
    () => computeStats(connection, activities),
    [connection, activities],
  )

  const target = connection.contactFrequencyTarget ?? 30

  // Drift line copy.
  let driftLine: string
  if (stats.daysSinceContact === null) {
    driftLine = t('neverContacted')
  } else if (!stats.drifting) {
    if (stats.daysSinceContact < target / 3) {
      driftLine = t('recentlyContacted', { days: stats.daysSinceContact })
    } else {
      driftLine = t('withinTarget', {
        days: stats.daysSinceContact,
        target,
      })
    }
  } else {
    driftLine = t('overdue', {
      days: stats.daysSinceContact,
      target,
    })
  }

  // Action prompt key — picked by category + severity + ever-contacted.
  const actionKey = pickActionKey(
    connection.category,
    stats.severity,
    stats.daysSinceContact === null,
  )

  return (
    <div className="px-5 pt-4">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <p className="text-xs text-primary font-medium uppercase tracking-wider">
            {t('title')}
          </p>
        </div>

        {/* Drift line */}
        <p className="text-sm text-foreground font-medium mb-2">{driftLine}</p>

        {/* Activity counts (90 days) */}
        {!loading && !error && (
          <div className="text-xs text-muted-foreground mb-2">
            <span className="mr-2">{t('counts.label')}:</span>
            {stats.totalRecent === 0 ? (
              <span>{t('counts.none')}</span>
            ) : (
              <span className="inline-flex items-center gap-2.5">
                {(['email', 'calendar', 'manual', 'telegram'] as ActivityKind[])
                  .filter(k => stats.counts90d[k] > 0)
                  .map(k => {
                    const Icon = KIND_ICON[k]
                    return (
                      <span key={k} className="inline-flex items-center gap-1">
                        <Icon className="w-3 h-3" />
                        {t(`counts.${k}`, { n: stats.counts90d[k] })}
                      </span>
                    )
                  })}
              </span>
            )}
          </div>
        )}

        {/* Last activity preview */}
        {!loading && !error && stats.lastActivity && (
          <p className="text-xs text-muted-foreground mb-3">
            {t('lastActivity.label')}:{' '}
            {formatLastActivity(stats.lastActivity, t)}
          </p>
        )}

        {/* Loading / error fallbacks */}
        {loading && (
          <p className="text-xs text-muted-foreground italic mb-2">
            {t('loading')}
          </p>
        )}
        {error && (
          <p className="text-xs text-muted-foreground italic mb-2">
            {t('loadFailed')}
          </p>
        )}

        {/* Action prompt */}
        <p className="text-sm text-foreground/80 leading-relaxed border-t border-primary/10 pt-3 mt-2">
          → {t(`actions.${actionKey}`)}
        </p>
      </div>
    </div>
  )
}

// ── helpers ──────────────────────────────────────────────────────────

function computeStats(
  conn: Connection,
  activities: ConnectionActivity[],
): ComputedStats {
  const target = conn.contactFrequencyTarget ?? 30
  const daysSinceContact = conn.lastContactDate
    ? getDaysSinceContact(conn.lastContactDate)
    : null
  const drifting = isDrifting(conn)
  const daysOverdue =
    drifting && daysSinceContact !== null
      ? Math.max(0, daysSinceContact - target)
      : 0

  // Severity tiers — drives the action-prompt copy choice.
  // 0 = within target (healthy)
  // 1 = 0..target/2 days overdue (early drift)
  // 2 = target/2..target days overdue (mid drift)
  // 3 = > target days overdue (long-form drift)
  let severity: 0 | 1 | 2 | 3 = 0
  if (drifting) {
    if (daysOverdue <= target / 2) severity = 1
    else if (daysOverdue <= target) severity = 2
    else severity = 3
  }

  // 90-day activity counts.
  const since = Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000
  const recent = activities.filter(a => {
    const t = new Date(a.occurredAt).getTime()
    return Number.isFinite(t) && t >= since
  })
  const counts90d: Record<ActivityKind, number> = {
    email: 0,
    calendar: 0,
    manual: 0,
    telegram: 0,
  }
  for (const a of recent) {
    counts90d[a.kind]++
  }

  return {
    daysSinceContact,
    daysOverdue,
    drifting,
    severity,
    counts90d,
    totalRecent: recent.length,
    lastActivity: activities.length > 0 ? activities[0] : null,
  }
}

function pickActionKey(
  category: Connection['category'],
  severity: 0 | 1 | 2 | 3,
  neverContacted: boolean,
): string {
  if (neverContacted) return 'neverContacted'
  if (severity === 0) return 'healthy'

  // Family always gets a stronger nudge regardless of severity tier.
  if (category === 'family') return 'familyOverdue'

  switch (severity) {
    case 1:
      return category === 'business' ? 'businessLight' : 'friendLight'
    case 2:
      return category === 'business' ? 'businessOverdue' : 'friendOverdue'
    case 3:
    default:
      return 'longDrift'
  }
}

function formatLastActivity(
  activity: ConnectionActivity,
  t: ReturnType<typeof useTranslations>,
): string {
  const occurred = new Date(activity.occurredAt)
  const days = Math.floor((Date.now() - occurred.getTime()) / (1000 * 60 * 60 * 24))

  // Reuse the same relative-date format as ActivityTimeline.
  let when: string
  if (days === 0) when = t('today')
  else if (days === 1) when = t('yesterday')
  else if (days < 30) when = t('daysAgo', { days })
  else
    when = occurred.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })

  const label = activity.label?.trim() || t(`kind.${activity.kind}`)
  const duration =
    activity.durationMin > 0 ? ` (${activity.durationMin}분)` : ''
  return `${when} · ${label}${duration}`
}
