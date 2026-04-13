'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Facebook,
  Instagram,
  Linkedin,
  Twitter,
  AtSign,
  Plus,
  Loader2,
  X,
  Check,
} from 'lucide-react'
import {
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_LABELS,
  SOCIAL_PLATFORM_PLACEHOLDER,
  SocialPlatform,
  SocialProfiles,
  validateSocialUrl,
} from '@/lib/connect-data'

interface SnsSectionProps {
  profiles: SocialProfiles
  editOpen: boolean
  onEditOpenChange: (open: boolean) => void
  onSubmit: (patch: Partial<Record<SocialPlatform, string | null>>) => Promise<void>
}

const ICON_MAP: Record<SocialPlatform, typeof Facebook> = {
  facebook: Facebook,
  instagram: Instagram,
  x: Twitter,
  linkedin: Linkedin,
  threads: AtSign,
}

export default function SnsSection({
  profiles,
  editOpen,
  onEditOpenChange,
  onSubmit,
}: SnsSectionProps) {
  return (
    <div className="px-5 pt-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-mono">
          SNS
        </p>
        <button
          type="button"
          onClick={() => onEditOpenChange(!editOpen)}
          className="text-[11px] text-primary/70 hover:text-primary underline underline-offset-2 transition-colors"
        >
          {editOpen ? '닫기' : '편집'}
        </button>
      </div>

      {editOpen ? (
        <SnsEditForm
          profiles={profiles}
          onCancel={() => onEditOpenChange(false)}
          onSubmit={async patch => {
            await onSubmit(patch)
            onEditOpenChange(false)
          }}
        />
      ) : (
        <SnsRows profiles={profiles} onAdd={() => onEditOpenChange(true)} />
      )}
    </div>
  )
}

function SnsRows({
  profiles,
  onAdd,
}: {
  profiles: SocialProfiles
  onAdd: () => void
}) {
  return (
    <div className="flex flex-col divide-y divide-border/60 rounded-lg border border-border bg-secondary/30">
      {SOCIAL_PLATFORMS.map(platform => {
        const url = profiles[platform] ?? null
        const Icon = ICON_MAP[platform]
        if (url) {
          return (
            <a
              key={platform}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 px-3 py-2 hover:bg-secondary/60 transition-colors"
              aria-label={`${SOCIAL_PLATFORM_LABELS[platform]} 프로필 열기`}
            >
              <Icon className="w-3.5 h-3.5 text-foreground shrink-0" />
              <span className="text-xs text-foreground w-16 shrink-0">
                {SOCIAL_PLATFORM_LABELS[platform]}
              </span>
              <span className="text-xs text-primary/80 truncate">{url}</span>
            </a>
          )
        }
        return (
          <button
            key={platform}
            type="button"
            onClick={onAdd}
            className="flex items-center gap-2.5 px-3 py-2 hover:bg-secondary/60 transition-colors text-left"
          >
            <Icon className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
            <span className="text-xs text-muted-foreground/80 w-16 shrink-0">
              {SOCIAL_PLATFORM_LABELS[platform]}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground/60">
              <Plus className="w-3 h-3" />
              추가
            </span>
          </button>
        )
      })}
    </div>
  )
}

function SnsEditForm({
  profiles,
  onCancel,
  onSubmit,
}: {
  profiles: SocialProfiles
  onCancel: () => void
  onSubmit: (patch: Partial<Record<SocialPlatform, string | null>>) => Promise<void>
}) {
  // Current edit values, seeded from loaded profiles. Empty string = removal.
  const initial = useMemo(() => {
    const obj: Record<SocialPlatform, string> = {
      facebook: '',
      instagram: '',
      x: '',
      linkedin: '',
      threads: '',
    }
    for (const p of SOCIAL_PLATFORMS) {
      const v = profiles[p]
      if (v) obj[p] = v
    }
    return obj
  }, [profiles])

  const [values, setValues] = useState<Record<SocialPlatform, string>>(initial)
  const [touched, setTouched] = useState<Record<SocialPlatform, boolean>>({
    facebook: false,
    instagram: false,
    x: false,
    linkedin: false,
    threads: false,
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    setValues(initial)
    setTouched({
      facebook: false,
      instagram: false,
      x: false,
      linkedin: false,
      threads: false,
    })
  }, [initial])

  const errors: Partial<Record<SocialPlatform, string>> = {}
  for (const p of SOCIAL_PLATFORMS) {
    const v = values[p].trim()
    if (v && !validateSocialUrl(p, v)) {
      errors[p] = `${SOCIAL_PLATFORM_LABELS[p]} URL 형식이 올바르지 않습니다`
    }
  }
  const hasErrors = Object.keys(errors).length > 0

  const handleSubmit = async () => {
    if (hasErrors || submitting) return
    setSubmitting(true)
    setSubmitError(null)

    // Build patch with merge-patch semantics:
    //  - field never touched → omit
    //  - field touched, value empty → send null (removal)
    //  - field touched, value set → send string (replace)
    const patch: Partial<Record<SocialPlatform, string | null>> = {}
    for (const p of SOCIAL_PLATFORMS) {
      if (!touched[p]) continue
      const v = values[p].trim()
      patch[p] = v === '' ? null : v
    }

    // Nothing touched → still close silently
    if (Object.keys(patch).length === 0) {
      await onSubmit({})
      setSubmitting(false)
      return
    }

    try {
      await onSubmit(patch)
    } catch (err) {
      if (err instanceof Error) setSubmitError(err.message)
      else setSubmitError('저장에 실패했습니다')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-3">
      {SOCIAL_PLATFORMS.map(platform => {
        const Icon = ICON_MAP[platform]
        const err = errors[platform]
        return (
          <div key={platform}>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Icon className="w-3 h-3" />
              {SOCIAL_PLATFORM_LABELS[platform]}
            </label>
            <input
              type="url"
              value={values[platform]}
              placeholder={SOCIAL_PLATFORM_PLACEHOLDER[platform]}
              onChange={e => {
                const v = e.target.value
                setValues(prev => ({ ...prev, [platform]: v }))
                setTouched(prev => ({ ...prev, [platform]: true }))
              }}
              className={`w-full h-8 px-2 text-xs bg-background border rounded text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 ${
                err
                  ? 'border-star-red/60 focus:ring-star-red/60'
                  : 'border-border focus:ring-primary/50'
              }`}
              aria-invalid={Boolean(err)}
              aria-describedby={err ? `sns-err-${platform}` : undefined}
            />
            {err && (
              <p
                id={`sns-err-${platform}`}
                className="mt-1 text-[11px] text-star-red"
              >
                {err}
              </p>
            )}
          </div>
        )
      })}

      {submitError && (
        <p className="text-[11px] text-star-red">{submitError}</p>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded"
        >
          <X className="w-3 h-3" />
          취소
        </button>
        <button
          type="button"
          disabled={hasErrors || submitting}
          onClick={handleSubmit}
          className="flex items-center gap-1 text-xs text-primary bg-primary/10 border border-primary/30 hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed px-2.5 py-1 rounded"
        >
          {submitting ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Check className="w-3 h-3" />
          )}
          저장
        </button>
      </div>
    </div>
  )
}
