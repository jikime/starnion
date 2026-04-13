'use client'

import { useState, useRef, useCallback } from 'react'
import {
  X,
  Upload,
  Scan,
  Check,
  Loader2,
  CreditCard,
  MapPin,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Connection } from '@/lib/connect-data'

export interface ParsedCard {
  name: string
  role: string
  company: string
  email: string
  phone: string
  address: string
}

export interface ParsedScanResult extends ParsedCard {
  meetingLocation: string
  tags: string[]
}

type ScanStep = 'upload' | 'scanning' | 'review' | 'saving' | 'done'

const MOCK_PARSED: ParsedCard = {
  name: '홍길동',
  role: 'Head of AI Strategy',
  company: 'Hyundai Motor Company',
  email: 'gildong.hong@hyundai.com',
  phone: '010-9876-5432',
  address: '서울시 강남구 테헤란로 231',
}

interface OcrScannerProps {
  onClose: () => void
  /**
   * Called when the user confirms the parsed card. Returns the newly created
   * Connection on success (so the scanner can show the SNS follow-up prompt
   * scoped to the new id). Throws to surface an error state in the modal.
   */
  onSubmit: (parsed: ParsedScanResult) => Promise<Connection>
  /**
   * Called when the user responds to the post-scan SNS prompt. If the user
   * clicks "추가하기", `addNow` is true and the parent should route them into
   * the SNS edit flow. If "나중에", `addNow` is false.
   */
  onSnsPrompt: (connectionId: string, addNow: boolean) => void
}

export default function OcrScanner({
  onClose,
  onSubmit,
  onSnsPrompt,
}: OcrScannerProps) {
  const [step, setStep] = useState<ScanStep>('upload')
  const [dragOver, setDragOver] = useState(false)
  const [, setImageUrl] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedCard>(MOCK_PARSED)
  const [meetingLocation, setMeetingLocation] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>(['비즈니스', '현대차'])
  const [createdConnectionId, setCreatedConnectionId] = useState<string | null>(
    null
  )
  const [submitError, setSubmitError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return
    const url = URL.createObjectURL(file)
    setImageUrl(url)
    setStep('scanning')
    setTimeout(() => {
      setStep('review')
    }, 2200)
  }, [])

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
    const t = tagInput.trim()
    if (t && !tags.includes(t)) {
      setTags(prev => [...prev, t])
    }
    setTagInput('')
  }

  const handleConfirm = async () => {
    setSubmitError(null)
    setStep('saving')
    try {
      const created = await onSubmit({ ...parsed, meetingLocation, tags })
      setCreatedConnectionId(created.id)
      setStep('done')
    } catch (err) {
      const msg = err instanceof Error ? err.message : '저장에 실패했습니다'
      setSubmitError(msg)
      setStep('review')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={e => e.target === e.currentTarget && onClose()}
      aria-modal="true"
      role="dialog"
      aria-label="명함 스캐너"
    >
      <div className="relative w-full max-w-2xl mx-4 bg-card border border-border rounded-2xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">명함 스캐너</h2>
              <p className="text-xs text-muted-foreground">Smart Business Card OCR</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="닫기">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-0 px-6 py-3 border-b border-border">
          {(['upload', 'scanning', 'review', 'done'] as const).map((s, i) => {
            const labels = ['업로드', '분석 중', '검토', '완료']
            const stepOrder: ScanStep[] = ['upload', 'scanning', 'review', 'saving', 'done']
            const current = stepOrder.indexOf(step)
            const thisIndex = stepOrder.indexOf(s)
            const isActive = thisIndex === current || (s === 'review' && step === 'saving')
            const isDone = thisIndex < current
            return (
              <div key={s} className="flex items-center">
                <div className="flex items-center gap-2">
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
                    className={`text-xs ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}
                  >
                    {labels[i]}
                  </span>
                </div>
                {i < 3 && <div className="w-8 h-px bg-border mx-2" />}
              </div>
            )
          })}
        </div>

        <div className="p-6">
          {/* Upload step */}
          {step === 'upload' && (
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
              aria-label="명함 이미지 업로드"
              onKeyDown={e => e.key === 'Enter' && fileRef.current?.click()}
            >
              <div className="w-14 h-14 rounded-2xl bg-secondary border border-border flex items-center justify-center">
                <Upload className="w-6 h-6 text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  명함 이미지를 업로드하세요
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  드래그 & 드롭 또는 클릭하여 파일 선택
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  PNG, JPG, HEIC 지원
                </p>
              </div>
              <Button
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={e => {
                  e.stopPropagation()
                  handleFile(new File([''], 'demo.jpg', { type: 'image/jpeg' }))
                }}
              >
                <Scan className="w-3.5 h-3.5 mr-2" />
                데모 스캔 시작
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
                aria-label="파일 선택"
              />
            </div>
          )}

          {/* Scanning step */}
          {step === 'scanning' && (
            <div className="flex flex-col items-center justify-center py-14 gap-6">
              <div className="relative w-48 h-28 bg-secondary rounded-xl border border-border overflow-hidden">
                <div
                  className="absolute inset-x-0 h-0.5 bg-primary/80"
                  style={{
                    animation: 'scanLine 1.5s ease-in-out infinite',
                  }}
                />
                <div className="absolute inset-4 space-y-2">
                  <div className="h-2.5 bg-muted rounded w-20" />
                  <div className="h-2 bg-muted/60 rounded w-32" />
                  <div className="h-2 bg-muted/40 rounded w-24" />
                  <div className="h-2 bg-muted/40 rounded w-28" />
                </div>
                {['top-1 left-1', 'top-1 right-1', 'bottom-1 left-1', 'bottom-1 right-1'].map(
                  (pos, i) => (
                    <div
                      key={i}
                      className={`absolute ${pos} w-3 h-3 border-primary`}
                      style={{
                        borderTopWidth: i < 2 ? 2 : 0,
                        borderBottomWidth: i >= 2 ? 2 : 0,
                        borderLeftWidth: i % 2 === 0 ? 2 : 0,
                        borderRightWidth: i % 2 === 1 ? 2 : 0,
                      }}
                    />
                  )
                )}
              </div>
              <div className="flex items-center gap-3 text-sm text-foreground">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                AI가 명함을 분석하고 있습니다...
              </div>
              <div className="text-xs text-muted-foreground font-mono space-y-1 text-center">
                <p className="opacity-80">Vision API → 텍스트 추출 완료</p>
                <p className="opacity-60">LLM 파싱 → 구조화 중...</p>
              </div>
              <style>{`
                @keyframes scanLine {
                  0% { top: 0; opacity: 0; }
                  10% { opacity: 1; }
                  90% { opacity: 1; }
                  100% { top: 100%; opacity: 0; }
                }
              `}</style>
            </div>
          )}

          {/* Review step */}
          {(step === 'review' || step === 'saving') && (
            <div className="grid grid-cols-2 gap-5">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-mono mb-3">
                  원본 명함
                </p>
                <div className="rounded-xl border border-border bg-secondary/40 overflow-hidden aspect-[1.75/1] flex flex-col justify-center p-5 relative">
                  <div className="space-y-1.5">
                    <div className="text-base font-bold text-foreground">{parsed.name}</div>
                    <div className="text-xs text-muted-foreground">{parsed.role}</div>
                    <div className="text-xs text-primary/80 font-medium">
                      {parsed.company}
                    </div>
                    <div className="mt-3 space-y-0.5">
                      <div className="text-xs text-muted-foreground">{parsed.email}</div>
                      <div className="text-xs text-muted-foreground">{parsed.phone}</div>
                    </div>
                  </div>
                  <div className="absolute top-3 right-3 flex items-center gap-1 bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5">
                    <Check className="w-2.5 h-2.5 text-primary" />
                    <span className="text-xs text-primary font-mono">OCR 완료</span>
                  </div>
                </div>

                <div className="mt-4">
                  <label className="text-xs text-muted-foreground uppercase tracking-wider font-mono block mb-2">
                    만난 장소 / 상황
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      value={meetingLocation}
                      onChange={e => setMeetingLocation(e.target.value)}
                      placeholder="예: COEX AI 컨퍼런스 2026"
                      className="pl-9 h-9 text-sm bg-secondary border-border"
                    />
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-mono mb-3">
                  AI 분석 결과 (수정 가능)
                </p>
                <div className="space-y-3">
                  {(
                    [
                      { key: 'name', label: '이름' },
                      { key: 'role', label: '직함' },
                      { key: 'company', label: '회사' },
                      { key: 'email', label: '이메일' },
                      { key: 'phone', label: '전화번호' },
                    ] as { key: keyof ParsedCard; label: string }[]
                  ).map(field => (
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
                      />
                    </div>
                  ))}

                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">태그</label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {tags.map(t => (
                        <span
                          key={t}
                          className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 border border-primary/20 rounded text-xs text-primary"
                        >
                          {t}
                          <button
                            onClick={() => setTags(ts => ts.filter(x => x !== t))}
                            className="hover:text-star-red"
                            aria-label={`${t} 태그 제거`}
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
                        placeholder="태그 추가..."
                        className="h-7 text-xs bg-secondary border-border"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs px-3"
                        onClick={handleAddTag}
                      >
                        추가
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
                  새로운 인연이 추가되었습니다
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {parsed.name}님의 정보가 저장되었어요
                </p>
              </div>

              <div className="w-full max-w-sm rounded-xl border border-primary/20 bg-primary/5 p-4 text-center">
                <p className="text-sm text-foreground mb-3">
                  이 분의 SNS 계정을 추가하시겠어요?
                </p>
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
                    나중에
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
                    추가하기
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        {(step === 'review' || step === 'saving') && (
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep('upload')}
              disabled={step === 'saving'}
            >
              다시 스캔
            </Button>
            <Button
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleConfirm}
              disabled={step === 'saving'}
            >
              {step === 'saving' ? (
                <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5 mr-2" />
              )}
              인연 추가
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
