'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Clock,
  Plus,
  Trash2,
  Loader2,
  Save,
  X,
  Mail,
  Calendar as CalIcon,
  Send,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ACTIVITY_LABEL_SUGGESTIONS,
  type ActivityKind,
  type Connection,
  type ConnectionActivity,
} from '@/lib/connect-data'
import {
  ConnectApiError,
  createActivity,
  deleteActivity,
  listActivities,
} from '@/lib/connect-api'

interface Props {
  connection: Connection
}

const PAGE_SIZE = 10
const MAX_LABEL_CHARS = 40
const MAX_NOTE_CHARS = 1000

// Maps `kind` to a lucide icon. `manual` is the default for
// user-entered rows and uses the Clock icon (neutral "it happened").
const KIND_ICON: Record<ActivityKind, typeof Clock> = {
  email: Mail,
  calendar: CalIcon,
  manual: Clock,
  telegram: Send,
}

export default function ActivityTimeline({ connection }: Props) {
  const t = useTranslations('connect.activity')
  const locale = useLocale()
  const dateLocale =
    locale === 'ko'
      ? 'ko-KR'
      : locale === 'ja'
      ? 'ja-JP'
      : locale === 'zh'
      ? 'zh-CN'
      : 'en-US'

  const [items, setItems] = useState<ConnectionActivity[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Add-form state
  const [formOpen, setFormOpen] = useState(false)
  const [formLabel, setFormLabel] = useState('')
  const [formCustomOpen, setFormCustomOpen] = useState(false)
  const [formNote, setFormNote] = useState('')
  const [formOccurredAt, setFormOccurredAt] = useState<string>('')
  const [formDuration, setFormDuration] = useState<string>('')
  const [formError, setFormError] = useState<string | null>(null)
  const [formSubmitting, setFormSubmitting] = useState(false)

  // Reset timeline when the selected connection changes
  const loadFirstPage = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await listActivities(connection.id, { limit: PAGE_SIZE, offset: 0 })
      setItems(res.items)
      setTotal(res.total)
      setOffset(res.items.length)
    } catch (err) {
      if (err instanceof ConnectApiError) setLoadError(err.message)
      else setLoadError(t('errors.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [connection.id, t])

  useEffect(() => {
    loadFirstPage()
  }, [loadFirstPage])

  const loadMore = async () => {
    setLoading(true)
    try {
      const res = await listActivities(connection.id, {
        limit: PAGE_SIZE,
        offset,
      })
      setItems(prev => [...prev, ...res.items])
      setOffset(prev => prev + res.items.length)
      setTotal(res.total)
    } catch (err) {
      if (err instanceof ConnectApiError) setLoadError(err.message)
      else setLoadError(t('errors.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  const openForm = () => {
    setFormOpen(true)
    setFormLabel('')
    setFormCustomOpen(false)
    setFormNote('')
    setFormOccurredAt(toDatetimeLocal(new Date()))
    setFormDuration('')
    setFormError(null)
  }

  const closeForm = () => {
    setFormOpen(false)
    setFormError(null)
  }

  const handleSave = async () => {
    // Client-side validation (server re-validates)
    if (formLabel.length > MAX_LABEL_CHARS) {
      setFormError(t('errors.labelTooLong', { max: MAX_LABEL_CHARS }))
      return
    }
    const note = formNote.trim()
    if (note.length > MAX_NOTE_CHARS) {
      setFormError(t('errors.noteTooLong', { max: MAX_NOTE_CHARS }))
      return
    }
    let occurredAtISO: string | undefined
    if (formOccurredAt) {
      const d = new Date(formOccurredAt)
      if (d.getTime() > Date.now() + 60_000) {
        setFormError(t('errors.futureOccurredAt'))
        return
      }
      occurredAtISO = d.toISOString()
    }
    let durationMin = 0
    if (formDuration) {
      const n = parseInt(formDuration, 10)
      if (!isNaN(n) && n >= 0) durationMin = n
    }
    setFormSubmitting(true)
    setFormError(null)
    try {
      const created = await createActivity(connection.id, {
        kind: 'manual',
        label: formLabel || undefined,
        occurredAt: occurredAtISO,
        durationMin,
        note: note || undefined,
      })
      // Prepend the new row to the list.
      setItems(prev => [created, ...prev])
      setTotal(prev => prev + 1)
      setOffset(prev => prev + 1)
      closeForm()
    } catch (err) {
      if (err instanceof ConnectApiError) setFormError(err.message)
      else setFormError(t('errors.saveFailed'))
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleDelete = async (activityId: number) => {
    // Simple confirm — no modal dialog to keep the component tight.
    if (!window.confirm(t('deleteConfirm'))) return
    try {
      await deleteActivity(connection.id, activityId)
      setItems(prev => prev.filter(a => a.id !== activityId))
      setTotal(prev => Math.max(0, prev - 1))
      setOffset(prev => Math.max(0, prev - 1))
    } catch (err) {
      if (err instanceof ConnectApiError) setLoadError(err.message)
      else setLoadError(t('errors.deleteFailed'))
    }
  }

  const hasMore = offset < total

  return (
    <div className="px-5 pt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-muted-foreground" />
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-mono">
            {t('section')}
          </p>
        </div>
        {!formOpen && (
          <button
            type="button"
            onClick={openForm}
            className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
          >
            <Plus className="w-3 h-3" />
            {t('add')}
          </button>
        )}
      </div>

      {/* Add form */}
      {formOpen && (
        <div className="rounded-lg border border-border bg-secondary/40 p-3 space-y-3 mb-3">
          {/* Label chip picker */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">
              {t('form.label')}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {ACTIVITY_LABEL_SUGGESTIONS.map(key => {
                const label = t(`form.suggestions.${key}`)
                const active = formLabel === label
                return (
                  <button
                    type="button"
                    key={key}
                    onClick={() => {
                      setFormLabel(label)
                      setFormCustomOpen(false)
                    }}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                      active
                        ? 'border-primary/50 bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => {
                  setFormCustomOpen(true)
                  setFormLabel('')
                }}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  formCustomOpen
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
              >
                {t('form.customLabel')}
              </button>
            </div>
            {formCustomOpen && (
              <Input
                value={formLabel}
                onChange={e => setFormLabel(e.target.value)}
                maxLength={MAX_LABEL_CHARS}
                className="mt-2 h-8 text-xs"
                placeholder={t('form.customLabel')}
              />
            )}
          </div>

          {/* Note */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">
              {t('form.note')}
            </label>
            <textarea
              value={formNote}
              onChange={e => setFormNote(e.target.value)}
              maxLength={MAX_NOTE_CHARS}
              rows={3}
              placeholder={t('form.notePlaceholder')}
              className="w-full text-sm text-foreground bg-background rounded-md p-2 border border-border focus:outline-none focus:ring-1 focus:ring-primary/50 resize-y leading-relaxed"
            />
          </div>

          {/* Occurred at + duration */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">
                {t('form.occurredAt')}
              </label>
              <Input
                type="datetime-local"
                value={formOccurredAt}
                onChange={e => setFormOccurredAt(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">
                {t('form.duration')}
              </label>
              <Input
                type="number"
                min={0}
                max={1440}
                value={formDuration}
                onChange={e => setFormDuration(e.target.value)}
                className="h-8 text-xs"
                placeholder="0"
              />
            </div>
          </div>

          {formError && (
            <p className="text-xs text-star-red">{formError}</p>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={closeForm}
              disabled={formSubmitting}
            >
              <X className="w-3 h-3 mr-1" />
              {t('form.cancel')}
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleSave}
              disabled={formSubmitting}
            >
              {formSubmitting ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Save className="w-3 h-3 mr-1" />
              )}
              {t('form.save')}
            </Button>
          </div>
        </div>
      )}

      {/* Timeline list */}
      {items.length === 0 && !loading && !formOpen && (
        <div className="rounded-lg border border-dashed border-border bg-secondary/20 p-4 text-center">
          <p className="text-xs text-muted-foreground/80">{t('empty')}</p>
          <p className="text-[11px] text-muted-foreground/60 mt-1">{t('emptyHint')}</p>
        </div>
      )}

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map(a => {
            const Icon = KIND_ICON[a.kind] || Clock
            return (
              <li
                key={a.id}
                className="group flex items-start gap-2 rounded-md border border-border/60 bg-secondary/20 px-3 py-2"
              >
                <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {a.label && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                        {a.label}
                      </span>
                    )}
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {formatOccurredAt(a.occurredAt, dateLocale, t)}
                    </span>
                    {a.durationMin > 0 && (
                      <span className="text-[11px] text-muted-foreground/70">
                        · {t('duration', { min: a.durationMin })}
                      </span>
                    )}
                  </div>
                  {a.note && (
                    <p className="text-xs text-foreground/80 mt-1 leading-relaxed break-words">
                      {a.note}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(a.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-star-red transition-opacity"
                  aria-label={t('deleteAction')}
                  title={t('deleteAction')}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {hasMore && !loading && (
        <button
          type="button"
          onClick={loadMore}
          className="mt-2 text-[11px] text-primary/70 hover:text-primary underline underline-offset-2 transition-colors"
        >
          {t('loadMore')} ({total - offset})
        </button>
      )}

      {loading && items.length > 0 && (
        <div className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          {t('loading')}
        </div>
      )}

      {loadError && !formOpen && (
        <p className="mt-2 text-[11px] text-star-red">{loadError}</p>
      )}
    </div>
  )
}

// Format an ISO timestamp as "오늘", "어제", "N일 전", or locale-aware
// short date depending on how far in the past it is.
function formatOccurredAt(
  iso: string,
  dateLocale: string,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  const d = new Date(iso)
  const now = new Date()
  const msDay = 86_400_000
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.floor((startOfDay(now) - startOfDay(d)) / msDay)
  if (diffDays === 0) return t('today')
  if (diffDays === 1) return t('yesterday')
  if (diffDays > 1 && diffDays <= 30) return t('daysAgo', { days: diffDays })
  return d.toLocaleDateString(dateLocale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// Convert a Date to the string shape accepted by <input type="datetime-local">,
// using the user's local timezone (the browser's toISOString() returns UTC
// which would shift the default value in the form).
function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
