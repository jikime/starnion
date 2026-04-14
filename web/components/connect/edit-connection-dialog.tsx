'use client'

import { useEffect, useState } from 'react'
import { Loader2, Pencil, Upload, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Category, Connection } from '@/lib/connect-data'
import {
  ConnectApiError,
  attachBusinessCard,
  updateConnection,
  type UpdateConnectionPatch,
} from '@/lib/connect-api'

const CATEGORY_OPTIONS: Category[] = ['business', 'friend', 'family', 'acquaintance']

const FREQUENCY_OPTIONS: { value: number; key: 'weekly' | 'biweekly' | 'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'annual' }[] = [
  { value: 7, key: 'weekly' },
  { value: 14, key: 'biweekly' },
  { value: 30, key: 'monthly' },
  { value: 60, key: 'bimonthly' },
  { value: 90, key: 'quarterly' },
  { value: 180, key: 'semiannual' },
  { value: 365, key: 'annual' },
]

interface EditConnectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connection: Connection
  onUpdated: (connection: Connection) => void
}

export default function EditConnectionDialog({
  open,
  onOpenChange,
  connection,
  onUpdated,
}: EditConnectionDialogProps) {
  const t = useTranslations('connect.editDialog')
  const tc = useTranslations('connect.category')
  const tf = useTranslations('connect.frequency')

  const [name, setName] = useState(connection.name)
  const [category, setCategory] = useState<Category>(connection.category)
  const [role, setRole] = useState(connection.role)
  const [company, setCompany] = useState(connection.company)
  const [email, setEmail] = useState(connection.email)
  const [phone, setPhone] = useState(connection.phone ?? '')
  const [birthday, setBirthday] = useState(connection.birthday ?? '')
  const [meetingLocation, setMeetingLocation] = useState(
    connection.meetingLocation ?? ''
  )
  const [frequencyTarget, setFrequencyTarget] = useState<number>(
    connection.contactFrequencyTarget
  )
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([...connection.tags])

  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-seed state when a different connection is loaded into the dialog.
  useEffect(() => {
    if (!open) return
    setName(connection.name)
    setCategory(connection.category)
    setRole(connection.role)
    setCompany(connection.company)
    setEmail(connection.email)
    setPhone(connection.phone ?? '')
    setBirthday(connection.birthday ?? '')
    setMeetingLocation(connection.meetingLocation ?? '')
    setFrequencyTarget(connection.contactFrequencyTarget)
    setTags([...connection.tags])
    setTagInput('')
    setError(null)
  }, [connection, open])

  const addTag = () => {
    const t = tagInput.trim()
    if (t && !tags.includes(t)) setTags(prev => [...prev, t])
    setTagInput('')
  }

  const handleAttachCard = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError(t('imageOnly'))
      return
    }
    setUploading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? t('uploadFailed', { status: res.status }))
      }
      const data = (await res.json()) as { url?: string }
      if (!data?.url) throw new Error(t('uploadNoUrl'))
      const updated = await attachBusinessCard(connection.id, {
        image_url: data.url,
      })
      onUpdated(updated)
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('attachFailed')
      setError(msg)
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError(t('nameRequired'))
      return
    }
    setSubmitting(true)
    setError(null)

    // Build a minimal patch: only include fields that actually changed.
    const patch: UpdateConnectionPatch = {}
    if (name.trim() !== connection.name) patch.name = name.trim()
    if (category !== connection.category) patch.category = category
    if (role.trim() !== connection.role) patch.role = role.trim()
    if (company.trim() !== connection.company) patch.company = company.trim()
    if (email.trim() !== connection.email) patch.email = email.trim()
    if ((phone.trim() || '') !== (connection.phone ?? ''))
      patch.phone = phone.trim() || undefined
    if ((birthday.trim() || '') !== (connection.birthday ?? ''))
      patch.birthday = birthday.trim() || undefined
    if ((meetingLocation.trim() || '') !== (connection.meetingLocation ?? ''))
      patch.meeting_location = meetingLocation.trim() || undefined
    if (frequencyTarget !== connection.contactFrequencyTarget)
      patch.contact_frequency_target = frequencyTarget
    const sameTags =
      tags.length === connection.tags.length &&
      tags.every((t, i) => t === connection.tags[i])
    if (!sameTags) patch.tags = tags

    // No-op: nothing changed.
    if (Object.keys(patch).length === 0) {
      setSubmitting(false)
      onOpenChange(false)
      return
    }

    try {
      const updated = await updateConnection(connection.id, patch)
      onUpdated(updated)
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ConnectApiError) {
        setError(err.message)
      } else {
        setError(t('updateFailed'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!submitting && !uploading) onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-primary" />
            {t('title')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="edit-name" className="text-xs text-muted-foreground">
              {t('name')}
            </label>
            <Input
              id="edit-name"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              disabled={submitting}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{t('category')}</label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_OPTIONS.map(value => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setCategory(value)}
                  disabled={submitting}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    category === value
                      ? 'border-primary/50 bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                >
                  {tc(value)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="edit-role" className="text-xs text-muted-foreground">
                {t('role')}
              </label>
              <Input
                id="edit-role"
                value={role}
                onChange={e => setRole(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="edit-company" className="text-xs text-muted-foreground">
                {t('company')}
              </label>
              <Input
                id="edit-company"
                value={company}
                onChange={e => setCompany(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="edit-email" className="text-xs text-muted-foreground">
                {t('email')}
              </label>
              <Input
                id="edit-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="edit-phone" className="text-xs text-muted-foreground">
                {t('phone')}
              </label>
              <Input
                id="edit-phone"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="edit-birthday" className="text-xs text-muted-foreground">
                {t('birthday')}
              </label>
              <Input
                id="edit-birthday"
                type="date"
                value={birthday}
                onChange={e => setBirthday(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="edit-meeting" className="text-xs text-muted-foreground">
                {t('meetingLocation')}
              </label>
              <Input
                id="edit-meeting"
                value={meetingLocation}
                onChange={e => setMeetingLocation(e.target.value)}
                placeholder={t('meetingPlaceholder')}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              {t('contactFrequency')}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {FREQUENCY_OPTIONS.map(opt => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => setFrequencyTarget(opt.value)}
                  disabled={submitting}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                    frequencyTarget === opt.value
                      ? 'border-primary/50 bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                >
                  {tf(opt.key)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{t('tags')}</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map(tag => (
                <span
                  key={tag}
                  className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 border border-primary/20 rounded text-xs text-primary"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => setTags(ts => ts.filter(x => x !== tag))}
                    className="hover:text-star-red"
                    aria-label={t('tagRemoveAria', { tag })}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addTag()
                  }
                }}
                placeholder={t('tagPlaceholder')}
                className="h-8 text-xs"
                disabled={submitting}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs px-3"
                onClick={addTag}
                disabled={submitting}
              >
                {t('tagAdd')}
              </Button>
            </div>
          </div>

          {/* Business card attach */}
          <div className="space-y-1.5 border-t border-border pt-4">
            <label className="text-xs text-muted-foreground flex items-center justify-between">
              <span>{t('businessCardLabel')}</span>
              {connection.businessCard?.imageUrl && (
                <span className="text-primary/70 text-xs">{t('alreadyAttached')}</span>
              )}
            </label>
            <label
              className={`flex items-center justify-center gap-2 h-16 border-2 border-dashed rounded-lg text-xs transition-colors ${
                uploading
                  ? 'border-primary bg-primary/5 text-primary cursor-wait'
                  : 'border-border text-muted-foreground hover:border-primary/40 hover:bg-secondary/50 cursor-pointer'
              }`}
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('uploading')}
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  {connection.businessCard?.imageUrl
                    ? t('replaceCard')
                    : t('uploadCard')}
                </>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading || submitting}
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) handleAttachCard(file)
                  e.target.value = ''
                }}
              />
            </label>
          </div>

          {error && (
            <p className="text-xs text-star-red bg-star-red/10 border border-star-red/20 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting || uploading}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={submitting || uploading || !name.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
