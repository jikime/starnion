'use client'

import { useEffect, useState } from 'react'
import { Loader2, Pencil, Upload, X } from 'lucide-react'
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

const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
  { value: 'business', label: '비즈니스' },
  { value: 'friend', label: '친구' },
  { value: 'family', label: '가족' },
  { value: 'acquaintance', label: '지인' },
]

const FREQUENCY_OPTIONS = [
  { value: 7, label: '매주' },
  { value: 14, label: '2주마다' },
  { value: 30, label: '월 1회' },
  { value: 60, label: '2개월마다' },
  { value: 90, label: '분기별' },
  { value: 180, label: '반년에 한 번' },
  { value: 365, label: '연 1회' },
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
      setError('이미지 파일만 업로드할 수 있습니다')
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
        throw new Error(body?.error ?? `업로드 실패 (${res.status})`)
      }
      const data = (await res.json()) as { url?: string }
      if (!data?.url) throw new Error('업로드 응답에 URL이 없습니다')
      const updated = await attachBusinessCard(connection.id, {
        image_url: data.url,
      })
      onUpdated(updated)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '명함 첨부 실패'
      setError(msg)
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('이름은 필수 입력입니다')
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
        setError('수정에 실패했습니다')
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
            인연 정보 편집
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="edit-name" className="text-xs text-muted-foreground">
              이름 *
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
            <label className="text-xs text-muted-foreground">카테고리</label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_OPTIONS.map(opt => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => setCategory(opt.value)}
                  disabled={submitting}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    category === opt.value
                      ? 'border-primary/50 bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="edit-role" className="text-xs text-muted-foreground">
                직함
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
                회사
              </label>
              <Input
                id="edit-company"
                value={company}
                onChange={e => setCompany(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="edit-email" className="text-xs text-muted-foreground">
                이메일
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
                전화번호
              </label>
              <Input
                id="edit-phone"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="edit-birthday" className="text-xs text-muted-foreground">
                생일
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
                만난 장소
              </label>
              <Input
                id="edit-meeting"
                value={meetingLocation}
                onChange={e => setMeetingLocation(e.target.value)}
                placeholder="예: COEX 컨퍼런스"
                disabled={submitting}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              연락 주기 목표
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
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">태그</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map(t => (
                <span
                  key={t}
                  className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 border border-primary/20 rounded text-xs text-primary"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => setTags(ts => ts.filter(x => x !== t))}
                    className="hover:text-star-red"
                    aria-label={`${t} 태그 제거`}
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
                placeholder="태그 추가..."
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
                추가
              </Button>
            </div>
          </div>

          {/* Business card attach */}
          <div className="space-y-1.5 border-t border-border pt-4">
            <label className="text-xs text-muted-foreground flex items-center justify-between">
              <span>명함 이미지</span>
              {connection.businessCard?.imageUrl && (
                <span className="text-primary/70 text-xs">이미 첨부됨</span>
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
                  업로드 중...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  {connection.businessCard?.imageUrl
                    ? '명함 이미지 교체'
                    : '명함 이미지 업로드'}
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
              취소
            </Button>
            <Button
              type="submit"
              disabled={submitting || uploading || !name.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
              저장
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
