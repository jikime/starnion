'use client'

import { useEffect, useState } from 'react'
import {
  X,
  Mail,
  Phone,
  MapPin,
  Tag,
  Calendar,
  CreditCard,
  Globe,
  Building2,
  Printer,
  ScanLine,
  ZoomIn,
  Trash2,
  Loader2,
  Pencil,
  PhoneCall,
  Save,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import Image from 'next/image'
import {
  Connection,
  getDaysSinceContact,
  isDrifting,
  getScoreKey,
  getCategoryColor,
  SocialPlatform,
} from '@/lib/connect-data'
import SnsSection from '@/components/connect/sns-section'
import ActivityTimeline from '@/components/connect/activity-timeline'
import NionSuggestion from '@/components/connect/nion-suggestion'

interface PersonaCardProps {
  connection: Connection
  onClose: () => void
  onSubmitSocial: (
    patch: Partial<Record<SocialPlatform, string | null>>
  ) => Promise<void>
  onDelete?: (id: string) => Promise<void>
  onEdit?: () => void
  onTouch?: (id: string) => Promise<void>
  onSubmitContextNotes?: (id: string, notes: string) => Promise<void>
  snsEditOpen: boolean
  onSnsEditOpenChange: (open: boolean) => void
}

const CONTEXT_NOTES_MAX = 4096

export default function PersonaCard({
  connection,
  onClose,
  onSubmitSocial,
  onDelete,
  onEdit,
  onTouch,
  onSubmitContextNotes,
  snsEditOpen,
  onSnsEditOpenChange,
}: PersonaCardProps) {
  const t = useTranslations('connect')
  const locale = useLocale()
  const dateLocale = locale === 'ko' ? 'ko-KR' : locale === 'ja' ? 'ja-JP' : locale === 'zh' ? 'zh-CN' : 'en-US'
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [touching, setTouching] = useState(false)

  const [notesEditing, setNotesEditing] = useState(false)
  const [notesDraft, setNotesDraft] = useState(connection.contextNotes)
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesError, setNotesError] = useState<string | null>(null)

  // Re-seed draft when selection changes or edit mode exits.
  useEffect(() => {
    if (!notesEditing) {
      setNotesDraft(connection.contextNotes)
      setNotesError(null)
    }
  }, [connection.id, connection.contextNotes, notesEditing])

  const handleDeleteConfirm = async () => {
    if (!onDelete) return
    setDeleting(true)
    try {
      await onDelete(connection.id)
      setDeleteOpen(false)
    } finally {
      setDeleting(false)
    }
  }

  const handleTouchClick = async () => {
    if (!onTouch) return
    setTouching(true)
    try {
      await onTouch(connection.id)
    } finally {
      setTouching(false)
    }
  }

  const handleNotesSave = async () => {
    if (!onSubmitContextNotes) return
    const draft = notesDraft.trim()
    if (draft.length > CONTEXT_NOTES_MAX) {
      setNotesError(t('personaCard.memoLengthExceeded', { max: CONTEXT_NOTES_MAX }))
      return
    }
    setNotesSaving(true)
    setNotesError(null)
    try {
      await onSubmitContextNotes(connection.id, draft)
      setNotesEditing(false)
    } catch (err) {
      setNotesError(err instanceof Error ? err.message : t('personaCard.memoSaveFailed'))
    } finally {
      setNotesSaving(false)
    }
  }
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const days = getDaysSinceContact(connection.lastContactDate)
  const drift = isDrifting(connection)
  const color = getCategoryColor(connection.category)
  const scorePercent = Math.round(connection.connectionScore * 100)
  const circumference = 2 * Math.PI * 22
  const dashOffset = circumference - connection.connectionScore * circumference

  const initials = connection.name.split('').slice(0, 2).join('')

  return (
    <div className="flex flex-col h-full bg-card border-l border-border overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-5 border-b border-border">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className="relative shrink-0">
            <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
              <circle cx="28" cy="28" r="26" fill="#1a2644" />
              <text
                x="28"
                y="33"
                textAnchor="middle"
                fontSize="16"
                fontWeight="700"
                fill="white"
              >
                {initials}
              </text>
              <circle
                cx="28"
                cy="28"
                r="22"
                fill="none"
                stroke="#1a2644"
                strokeWidth="3"
              />
              <circle
                cx="28"
                cy="28"
                r="22"
                fill="none"
                stroke={color}
                strokeWidth="3"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                transform="rotate(-90 28 28)"
                style={{ transition: 'stroke-dashoffset 0.6s ease' }}
              />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-foreground font-semibold text-lg leading-tight truncate">
              {connection.name}
            </h2>
            {connection.role && (
              <p className="text-muted-foreground text-sm truncate">{connection.role}</p>
            )}
            {connection.company && (
              <p className="text-muted-foreground text-sm truncate">{connection.company}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 -mt-1">
          {onTouch && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleTouchClick}
              disabled={touching}
              className="text-muted-foreground hover:text-primary"
              aria-label={t('personaCard.touch')}
              title={t('personaCard.touch')}
            >
              {touching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <PhoneCall className="w-4 h-4" />
              )}
            </Button>
          )}
          {onEdit && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onEdit}
              className="text-muted-foreground hover:text-foreground"
              aria-label={t('personaCard.edit')}
              title={t('personaCard.edit')}
            >
              <Pencil className="w-4 h-4" />
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDeleteOpen(true)}
              className="text-muted-foreground hover:text-star-red"
              aria-label={t('personaCard.delete')}
              title={t('personaCard.delete')}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label={t('personaCard.close')}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteDialog.title', { name: connection.name })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('deleteDialog.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={e => {
                e.preventDefault()
                handleDeleteConfirm()
              }}
              disabled={deleting}
              className="bg-star-red text-white hover:bg-star-red/90"
            >
              {deleting && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
              {t('deleteDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Connection Score */}
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wider font-mono">
            {t('personaCard.connectionScore')}
          </span>
          <span className="text-sm font-mono" style={{ color }}>
            {scorePercent}
          </span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${scorePercent}%`, backgroundColor: color }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          {t(`scoreLabel.${getScoreKey(connection.connectionScore)}`)}
        </p>
      </div>

      {/* Alert banner */}
      {drift && connection.lastContactDate && (
        <div className="mx-5 mt-4 flex items-start gap-2 rounded-lg border border-star-red/30 bg-star-red/10 px-3 py-2.5">
          <div className="w-1.5 h-1.5 rounded-full bg-star-red mt-1 shrink-0" />
          <div>
            <p className="text-xs text-star-red font-medium">{t('personaCard.driftTitle')}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('personaCard.driftBody', { days, target: connection.contactFrequencyTarget })}
            </p>
          </div>
        </div>
      )}

      {/* Contact info */}
      <div className="px-5 pt-4 space-y-2">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-mono mb-3">
          {t('personaCard.contactInfo')}
        </p>
        {connection.email ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{connection.email}</span>
          </div>
        ) : null}
        {connection.phone && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Phone className="w-3.5 h-3.5 shrink-0" />
            <span>{connection.phone}</span>
          </div>
        )}
        {connection.birthday && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <span>{t('personaCard.birthdayWithDate', { date: connection.birthday })}</span>
          </div>
        )}
        {connection.meetingLocation && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span>{t('personaCard.meetingAt', { place: connection.meetingLocation })}</span>
          </div>
        )}
      </div>

      {/* SNS section */}
      <SnsSection
        profiles={connection.socialProfiles}
        editOpen={snsEditOpen}
        onEditOpenChange={onSnsEditOpenChange}
        onSubmit={onSubmitSocial}
      />

      {/* Category badge */}
      <div className="px-5 pt-4">
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{ backgroundColor: `${color}20`, color }}
        >
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
          {t(`category.${connection.category}`)}
        </span>
      </div>

      {/* Tags */}
      {connection.tags.length > 0 && (
        <div className="px-5 pt-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Tag className="w-3 h-3 text-muted-foreground" />
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-mono">
              {t('personaCard.tags')}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {connection.tags.map(tag => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground text-xs font-mono"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Context memo */}
      <div className="px-5 pt-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-mono">
            {t('personaCard.contextMemo')}
          </p>
          {onSubmitContextNotes && !notesEditing && (
            <button
              type="button"
              onClick={() => setNotesEditing(true)}
              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
              aria-label={t('personaCard.editMemo')}
            >
              <Pencil className="w-3 h-3" />
              {t('personaCard.edit')}
            </button>
          )}
        </div>
        {notesEditing ? (
          <div className="space-y-2">
            <textarea
              value={notesDraft}
              onChange={e => setNotesDraft(e.target.value)}
              maxLength={CONTEXT_NOTES_MAX}
              disabled={notesSaving}
              rows={5}
              placeholder={t('personaCard.memoPlaceholder')}
              className="w-full text-sm text-foreground bg-secondary/50 rounded-lg p-3 border border-border focus:outline-none focus:ring-1 focus:ring-primary/50 resize-y leading-relaxed"
              autoFocus
            />
            <div className="flex items-center justify-between text-xs">
              <span
                className={`font-mono ${
                  notesDraft.length > CONTEXT_NOTES_MAX * 0.9
                    ? 'text-star-red'
                    : 'text-muted-foreground'
                }`}
              >
                {notesDraft.length.toLocaleString()} / {CONTEXT_NOTES_MAX.toLocaleString()}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => {
                    setNotesEditing(false)
                    setNotesDraft(connection.contextNotes)
                    setNotesError(null)
                  }}
                  disabled={notesSaving}
                >
                  {t('personaCard.memoCancel')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={handleNotesSave}
                  disabled={notesSaving}
                >
                  {notesSaving ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <Save className="w-3 h-3 mr-1" />
                  )}
                  {t('personaCard.memoSave')}
                </Button>
              </div>
            </div>
            {notesError && (
              <p className="text-xs text-star-red">{notesError}</p>
            )}
          </div>
        ) : connection.contextNotes ? (
          <p className="text-sm text-foreground/80 leading-relaxed bg-secondary/50 rounded-lg p-3 border border-border whitespace-pre-wrap">
            {connection.contextNotes}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground/60 italic">{t('personaCard.noMemo')}</p>
        )}
      </div>

      {/* Nion Suggestion — data-driven summary above the timeline. */}
      <NionSuggestion connection={connection} />

      {/* Activity Timeline (UC-111/112/113) */}
      <ActivityTimeline connection={connection} />

      {/* Business Card */}
      <div className="px-5 pt-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <CreditCard className="w-3 h-3 text-muted-foreground" />
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-mono">
              {t('personaCard.businessCard')}
            </p>
          </div>
          {connection.businessCard?.scannedAt && (
            <div className="flex items-center gap-1">
              <ScanLine className="w-2.5 h-2.5 text-muted-foreground/50" />
              <span className="text-[10px] text-muted-foreground/50 font-mono">
                {new Date(connection.businessCard.scannedAt).toLocaleDateString(dateLocale)}
              </span>
            </div>
          )}
        </div>

        {connection.businessCard ? (
          <div className="rounded-xl border border-border overflow-hidden bg-secondary/30">
            {connection.businessCard.imageUrl ? (
              <button
                className="group relative w-full block"
                onClick={() => setLightboxOpen(true)}
                aria-label={t('personaCard.cardEnlarge')}
              >
                <div className="relative w-full aspect-[1.75/1] overflow-hidden bg-muted">
                  <Image
                    src={connection.businessCard.imageUrl}
                    alt={`${connection.name} ${t('personaCard.businessCard')}`}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-background/0 group-hover:bg-background/30 transition-colors duration-200 flex items-center justify-center">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-background/80 backdrop-blur-sm rounded-full p-2">
                      <ZoomIn className="w-4 h-4 text-foreground" />
                    </div>
                  </div>
                </div>
              </button>
            ) : (
              <div className="w-full aspect-[1.75/1] bg-muted flex items-center justify-center">
                <div className="text-center space-y-1">
                  <CreditCard className="w-8 h-8 text-muted-foreground/30 mx-auto" />
                  <p className="text-[10px] text-muted-foreground/40">{t('personaCard.noImage')}</p>
                </div>
              </div>
            )}

            <div className="px-3 py-2.5 space-y-1.5 border-t border-border/60">
              {connection.businessCard.companyNameEn && (
                <div className="flex items-center gap-1.5">
                  <Building2 className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground">
                    {connection.businessCard.companyNameEn}
                  </span>
                  {connection.businessCard.department && (
                    <span className="text-xs text-muted-foreground/60">
                      · {connection.businessCard.department}
                    </span>
                  )}
                </div>
              )}
              {connection.businessCard.website && (
                <div className="flex items-center gap-1.5">
                  <Globe className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground">
                    {connection.businessCard.website}
                  </span>
                </div>
              )}
              {connection.businessCard.address && (
                <div className="flex items-start gap-1.5">
                  <MapPin className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                  <span className="text-xs text-muted-foreground leading-relaxed">
                    {connection.businessCard.address}
                  </span>
                </div>
              )}
              {connection.businessCard.fax && (
                <div className="flex items-center gap-1.5">
                  <Printer className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground">
                    {connection.businessCard.fax}
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 py-5 px-3 text-center">
            <CreditCard className="w-6 h-6 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground/60">{t('personaCard.noBusinessCard')}</p>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxOpen && connection.businessCard?.imageUrl && (
        <div
          className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setLightboxOpen(false)}
          role="dialog"
          aria-label={t('personaCard.lightboxAria')}
          aria-modal="true"
        >
          <button
            className="absolute top-4 right-4 p-2 rounded-full bg-secondary border border-border text-foreground hover:bg-muted transition-colors"
            onClick={() => setLightboxOpen(false)}
            aria-label={t('personaCard.close')}
          >
            <X className="w-4 h-4" />
          </button>
          <div
            className="relative max-w-xl w-full rounded-2xl overflow-hidden shadow-2xl border border-border"
            onClick={e => e.stopPropagation()}
          >
            <Image
              src={connection.businessCard.imageUrl}
              alt={t('personaCard.cardAltLarge', { name: connection.name })}
              width={680}
              height={388}
              className="w-full h-auto"
            />
            <div className="px-4 py-3 bg-card/95 border-t border-border">
              <p className="text-sm font-medium text-foreground">{connection.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {connection.role} · {connection.company}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="pb-5" />
    </div>
  )
}
