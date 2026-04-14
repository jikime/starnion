'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  X,
  Upload,
  Check,
  Loader2,
  CreditCard,
  MapPin,
  AlertCircle,
  Info,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Connection } from '@/lib/connect-data'

export interface ParsedCard {
  name: string
  role: string
  company: string
  email: string
  phone: string
}

export interface ParsedScanResult extends ParsedCard {
  meetingLocation: string
  tags: string[]
  /** URL of the uploaded business card image (from /api/upload). */
  imageUrl?: string
}

type ScanStep = 'upload' | 'uploading' | 'review' | 'saving' | 'done'

const EMPTY_PARSED: ParsedCard = {
  name: '',
  role: '',
  company: '',
  email: '',
  phone: '',
}

interface OcrScannerProps {
  onClose: () => void
  onSubmit: (parsed: ParsedScanResult) => Promise<Connection>
  onSnsPrompt: (connectionId: string, addNow: boolean) => void
}

export default function OcrScanner({
  onClose,
  onSubmit,
  onSnsPrompt,
}: OcrScannerProps) {
  const t = useTranslations('connect.ocrScanner')
  const tSns = useTranslations('connect.sns')

  const [step, setStep] = useState<ScanStep>('upload')
  const [dragOver, setDragOver] = useState(false)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedCard>(EMPTY_PARSED)
  const [meetingLocation, setMeetingLocation] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [createdConnectionId, setCreatedConnectionId] = useState<string | null>(
    null
  )
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview)
    }
  }, [imagePreview])

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        setUploadError(t('imageOnly'))
        return
      }
      setUploadError(null)
      setImagePreview(URL.createObjectURL(file))
      setStep('uploading')

      try {
        const form = new FormData()
        form.append('file', file)
        const res = await fetch('/api/upload', { method: 'POST', body: form })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(body?.error ?? t('uploadFailed', { status: res.status }))
        }
        const data = (await res.json()) as { url: string }
        if (!data?.url) throw new Error(t('uploadNoUrl'))
        setUploadedUrl(data.url)
        setStep('review')
      } catch (err) {
        const msg = err instanceof Error ? err.message : t('uploadFailedGeneric')
        setUploadError(msg)
        setStep('upload')
      }
    },
    [t]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  const handleAddTag = () => {
    const trimmed = tagInput.trim()
    if (trimmed && !tags.includes(trimmed)) {
      setTags(prev => [...prev, trimmed])
    }
    setTagInput('')
  }

  const handleConfirm = async () => {
    if (!parsed.name.trim()) {
      setSubmitError(t('nameRequired'))
      return
    }
    setSubmitError(null)
    setStep('saving')
    try {
      const created = await onSubmit({
        ...parsed,
        meetingLocation,
        tags,
        imageUrl: uploadedUrl ?? undefined,
      })
      setCreatedConnectionId(created.id)
      setStep('done')
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('saveFailed')
      setSubmitError(msg)
      setStep('review')
    }
  }

  const stepLabels: Record<'upload' | 'uploading' | 'review' | 'done', string> = {
    upload: t('steps.image'),
    uploading: t('steps.upload'),
    review: t('steps.input'),
    done: t('steps.done'),
  }

  const fieldDefs: {
    key: keyof ParsedCard
    label: string
    required?: boolean
  }[] = [
    { key: 'name', label: t('fields.name'), required: true },
    { key: 'role', label: t('fields.role') },
    { key: 'company', label: t('fields.company') },
    { key: 'email', label: t('fields.email') },
    { key: 'phone', label: t('fields.phone') },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 sm:p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
      aria-modal="true"
      role="dialog"
      aria-label={t('ariaLabel')}
    >
      <div className="relative w-full sm:max-w-2xl bg-card border border-border rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <CreditCard className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground truncate">{t('title')}</h2>
              <p className="text-xs text-muted-foreground truncate">{t('subtitle')}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('closeAria')} className="shrink-0">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Scrollable content — header / step indicator stay, body scrolls on tall mobile forms. */}
        <div className="overflow-y-auto flex-1">

        {/* OCR hint banner */}
        {(step === 'upload' || step === 'uploading' || step === 'review') && (
          <div className="mx-4 sm:mx-6 mt-3 sm:mt-4 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
            <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t.rich('hint', {
                bold: chunks => (
                  <span className="text-foreground font-medium">{chunks}</span>
                ),
              })}
            </p>
          </div>
        )}

        {/* Step indicators — labels collapse to icons only on mobile, connector lines shrink. */}
        <div className="flex items-center gap-0 px-4 sm:px-6 py-3 border-b border-border overflow-x-auto">
          {(['upload', 'uploading', 'review', 'done'] as const).map((s, i) => {
            const stepOrder: ScanStep[] = ['upload', 'uploading', 'review', 'saving', 'done']
            const current = stepOrder.indexOf(step)
            const thisIndex = stepOrder.indexOf(s)
            const isActive = thisIndex === current || (s === 'review' && step === 'saving')
            const isDone = thisIndex < current
            return (
              <div key={s} className="flex items-center shrink-0">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-mono transition-colors ${
                      isDone
                        ? 'bg-primary text-primary-foreground'
                        : isActive
                        ? 'bg-primary/20 border border-primary text-primary'
                        : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    {isDone ? <Check className="w-3 h-3" /> : i + 1}
                  </div>
                  <span
                    className={`text-xs ${isActive ? 'text-foreground' : 'text-muted-foreground'} ${
                      isActive ? 'inline' : 'hidden sm:inline'
                    }`}
                  >
                    {stepLabels[s]}
                  </span>
                </div>
                {i < 3 && <div className="w-4 sm:w-8 h-px bg-border mx-1.5 sm:mx-2" />}
              </div>
            )
          })}
        </div>

        <div className="p-4 sm:p-6">
          {/* Upload step */}
          {step === 'upload' && (
            <>
              <div
                className={`border-2 border-dashed rounded-xl transition-colors cursor-pointer flex flex-col items-center justify-center py-14 gap-4 ${
                  dragOver
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/40 hover:bg-secondary/30'
                }`}
                onDrop={handleDrop}
                onDragOver={e => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => fileRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label={t('dropAria')}
                onKeyDown={e => e.key === 'Enter' && fileRef.current?.click()}
              >
                <div className="w-14 h-14 rounded-2xl bg-secondary border border-border flex items-center justify-center">
                  <Upload className="w-6 h-6 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">{t('dropTitle')}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t('dropHint')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('dropTypes')}</p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
                  aria-label={t('fileLabel')}
                />
              </div>
              {uploadError && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-star-red/30 bg-star-red/10 px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 text-star-red shrink-0 mt-0.5" />
                  <p className="text-xs text-star-red">{uploadError}</p>
                </div>
              )}
            </>
          )}

          {/* Uploading step */}
          {step === 'uploading' && (
            <div className="flex flex-col items-center justify-center py-14 gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-foreground">{t('uploading')}</p>
              {imagePreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imagePreview}
                  alt={t('preview')}
                  className="max-w-xs max-h-40 rounded-lg border border-border object-contain"
                />
              )}
            </div>
          )}

          {/* Review step */}
          {(step === 'review' || step === 'saving') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-mono mb-3">
                  {t('card')}
                </p>
                <div className="rounded-xl border border-border bg-secondary/40 overflow-hidden aspect-[1.75/1] flex items-center justify-center relative">
                  {imagePreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imagePreview}
                      alt={t('preview')}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <CreditCard className="w-10 h-10 text-muted-foreground" />
                  )}
                  {uploadedUrl && (
                    <div className="absolute top-3 right-3 flex items-center gap-1 bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5">
                      <Check className="w-2.5 h-2.5 text-primary" />
                      <span className="text-xs text-primary font-mono">{t('uploaded')}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4">
                  <label className="text-xs text-muted-foreground uppercase tracking-wider font-mono block mb-2">
                    {t('meetingLocation')}
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      value={meetingLocation}
                      onChange={e => setMeetingLocation(e.target.value)}
                      placeholder={t('meetingPlaceholder')}
                      className="pl-9 h-9 text-sm bg-secondary border-border"
                    />
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-mono mb-3">
                  {t('manualInput')}
                </p>
                <div className="space-y-3">
                  {fieldDefs.map(field => (
                    <div key={field.key}>
                      <label className="text-xs text-muted-foreground block mb-1">
                        {field.label}
                      </label>
                      <Input
                        value={parsed[field.key]}
                        onChange={e =>
                          setParsed(prev => ({ ...prev, [field.key]: e.target.value }))
                        }
                        className="h-8 text-sm bg-secondary border-border"
                        required={field.required}
                      />
                    </div>
                  ))}

                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">
                      {t('tags')}
                    </label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {tags.map(tag => (
                        <span
                          key={tag}
                          className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 border border-primary/20 rounded text-xs text-primary"
                        >
                          {tag}
                          <button
                            onClick={() => setTags(ts => ts.filter(x => x !== tag))}
                            className="hover:text-star-red"
                            aria-label={t('tagRemoveAria', { tag })}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={tagInput}
                        onChange={e => setTagInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddTag()}
                        placeholder={t('tagPlaceholder')}
                        className="h-7 text-xs bg-secondary border-border"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs px-3"
                        onClick={handleAddTag}
                      >
                        {t('tagAdd')}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {submitError && (
                <div className="col-span-2 flex items-start gap-2 rounded-lg border border-star-red/30 bg-star-red/10 px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 text-star-red shrink-0 mt-0.5" />
                  <p className="text-xs text-star-red">{submitError}</p>
                </div>
              )}
            </div>
          )}

          {/* Done step — success with SNS prompt */}
          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-10 gap-5">
              <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
                <Check className="w-7 h-7 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-base font-semibold text-foreground">
                  {t('successTitle')}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('successBody', { name: parsed.name })}
                </p>
              </div>

              <div className="w-full max-w-sm rounded-xl border border-primary/20 bg-primary/5 p-4 text-center">
                <p className="text-sm text-foreground mb-3">{tSns('addPrompt')}</p>
                <div className="flex items-center justify-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => {
                      if (createdConnectionId) {
                        onSnsPrompt(createdConnectionId, false)
                      } else {
                        onClose()
                      }
                    }}
                  >
                    {tSns('later')}
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={() => {
                      if (createdConnectionId) {
                        onSnsPrompt(createdConnectionId, true)
                      }
                    }}
                  >
                    {tSns('addNow')}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
        </div>
        {/* /scrollable content */}

        {/* Footer actions — stays pinned below the scroll area */}
        {(step === 'review' || step === 'saving') && (
          <div className="flex justify-end gap-2 sm:gap-3 px-4 sm:px-6 py-3 sm:py-4 border-t border-border shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStep('upload')
                setParsed(EMPTY_PARSED)
                setTags([])
                setMeetingLocation('')
                setImagePreview(null)
                setUploadedUrl(null)
              }}
              disabled={step === 'saving'}
            >
              {t('restart')}
            </Button>
            <Button
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleConfirm}
              disabled={step === 'saving' || !parsed.name.trim()}
            >
              {step === 'saving' ? (
                <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5 mr-2" />
              )}
              {t('submit')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
