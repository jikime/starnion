'use client'

import { useState } from 'react'
import { X, Mail, Phone, MapPin, Tag, Clock, Sparkles, Calendar, CreditCard, Globe, Building2, Printer, ScanLine, ZoomIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Image from 'next/image'
import {
  Connection,
  getDaysSinceContact,
  isDrifting,
  getScoreLabel,
  getCategoryColor,
  CATEGORY_LABELS,
} from '@/lib/connect-data'

interface PersonaCardProps {
  connection: Connection
  onClose: () => void
}

const ACTIVITY_TIMELINE = [
  { type: 'email', label: '이메일 회신', detail: '프로젝트 제안서 검토 완료', daysAgo: 3 },
  { type: 'meeting', label: '화상 미팅', detail: '분기 전략 검토 미팅 (45분)', daysAgo: 14 },
  { type: 'message', label: '메시지', detail: '안부 인사 및 세미나 일정 공유', daysAgo: 28 },
]

export default function PersonaCard({ connection, onClose }: PersonaCardProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const days = getDaysSinceContact(connection.lastContactDate)
  const drift = isDrifting(connection)
  const color = getCategoryColor(connection.category)
  const scorePercent = Math.round(connection.connectionScore * 100)
  const circumference = 2 * Math.PI * 22
  const dashOffset = circumference - (connection.connectionScore * circumference)

  const initials = connection.name
    .split('')
    .slice(0, 2)
    .join('')

  return (
    <div className="flex flex-col h-full bg-card border-l border-border overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between p-5 border-b border-border">
        <div className="flex items-center gap-4">
          {/* Avatar with score ring */}
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
              {/* Score ring */}
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
          <div>
            <h2 className="text-foreground font-semibold text-lg leading-tight">
              {connection.name}
            </h2>
            <p className="text-muted-foreground text-sm">{connection.role}</p>
            <p className="text-muted-foreground text-sm">{connection.company}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground shrink-0 -mt-1"
          aria-label="닫기"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Connection Score */}
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wider font-mono">
            Connection Score
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
        <p className="text-xs text-muted-foreground mt-1.5">{getScoreLabel(connection.connectionScore)}</p>
      </div>

      {/* Alert banner */}
      {drift && (
        <div className="mx-5 mt-4 flex items-start gap-2 rounded-lg border border-star-red/30 bg-star-red/10 px-3 py-2.5">
          <div className="w-1.5 h-1.5 rounded-full bg-star-red mt-1 shrink-0" />
          <div>
            <p className="text-xs text-star-red font-medium">연락이 멀어지고 있어요</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              마지막 연락 {days}일 전 · 목표 {connection.contactFrequencyTarget}일 주기
            </p>
          </div>
        </div>
      )}

      {/* Contact info */}
      <div className="px-5 pt-4 space-y-2">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-mono mb-3">연락처</p>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Mail className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{connection.email}</span>
        </div>
        {connection.phone && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Phone className="w-3.5 h-3.5 shrink-0" />
            <span>{connection.phone}</span>
          </div>
        )}
        {connection.birthday && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <span>생일: {connection.birthday}</span>
          </div>
        )}
        {connection.meetingLocation && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span>{connection.meetingLocation}에서 만남</span>
          </div>
        )}
      </div>

      {/* Category badge */}
      <div className="px-5 pt-4">
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{ backgroundColor: `${color}20`, color }}
        >
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
          {CATEGORY_LABELS[connection.category]}
        </span>
      </div>

      {/* Tags */}
      {connection.tags.length > 0 && (
        <div className="px-5 pt-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Tag className="w-3 h-3 text-muted-foreground" />
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-mono">태그</p>
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
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-mono mb-2">Context Memo</p>
        <p className="text-sm text-foreground/80 leading-relaxed bg-secondary/50 rounded-lg p-3 border border-border">
          {connection.contextNotes}
        </p>
      </div>

      {/* Activity timeline */}
      <div className="px-5 pt-4">
        <div className="flex items-center gap-1.5 mb-3">
          <Clock className="w-3 h-3 text-muted-foreground" />
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-mono">Activity Timeline</p>
        </div>
        <div className="space-y-3">
          {ACTIVITY_TIMELINE.map((item, i) => (
            <div key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                {i < ACTIVITY_TIMELINE.length - 1 && (
                  <div className="w-px flex-1 bg-border mt-1" />
                )}
              </div>
              <div className="pb-3">
                <p className="text-sm text-foreground font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5 font-mono">{item.daysAgo}일 전</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Business Card */}
      <div className="px-5 pt-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <CreditCard className="w-3 h-3 text-muted-foreground" />
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-mono">명함</p>
          </div>
          {connection.businessCard?.scannedAt && (
            <div className="flex items-center gap-1">
              <ScanLine className="w-2.5 h-2.5 text-muted-foreground/50" />
              <span className="text-[10px] text-muted-foreground/50 font-mono">
                {new Date(connection.businessCard.scannedAt).toLocaleDateString('ko-KR')}
              </span>
            </div>
          )}
        </div>

        {connection.businessCard ? (
          <div className="rounded-xl border border-border overflow-hidden bg-secondary/30">
            {/* Card image */}
            {connection.businessCard.imageUrl ? (
              <button
                className="group relative w-full block"
                onClick={() => setLightboxOpen(true)}
                aria-label="명함 이미지 크게 보기"
              >
                <div className="relative w-full aspect-[1.75/1] overflow-hidden bg-muted">
                  <Image
                    src={connection.businessCard.imageUrl}
                    alt={`${connection.name} 명함`}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  {/* Hover overlay */}
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
                  <p className="text-[10px] text-muted-foreground/40">이미지 없음</p>
                </div>
              </div>
            )}

            {/* Parsed info below image */}
            <div className="px-3 py-2.5 space-y-1.5 border-t border-border/60">
              {connection.businessCard.companyNameEn && (
                <div className="flex items-center gap-1.5">
                  <Building2 className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground">{connection.businessCard.companyNameEn}</span>
                  {connection.businessCard.department && (
                    <span className="text-xs text-muted-foreground/60">· {connection.businessCard.department}</span>
                  )}
                </div>
              )}
              {connection.businessCard.website && (
                <div className="flex items-center gap-1.5">
                  <Globe className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground">{connection.businessCard.website}</span>
                </div>
              )}
              {connection.businessCard.address && (
                <div className="flex items-start gap-1.5">
                  <MapPin className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                  <span className="text-xs text-muted-foreground leading-relaxed">{connection.businessCard.address}</span>
                </div>
              )}
              {connection.businessCard.fax && (
                <div className="flex items-center gap-1.5">
                  <Printer className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground">{connection.businessCard.fax}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 py-5 px-3 text-center">
            <CreditCard className="w-6 h-6 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground/60">등록된 명함이 없습니다</p>
            <button className="text-[11px] text-primary/70 hover:text-primary underline underline-offset-2 transition-colors">
              명함 스캔으로 추가하기
            </button>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxOpen && connection.businessCard?.imageUrl && (
        <div
          className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setLightboxOpen(false)}
          role="dialog"
          aria-label="명함 이미지 확대"
          aria-modal="true"
        >
          <button
            className="absolute top-4 right-4 p-2 rounded-full bg-secondary border border-border text-foreground hover:bg-muted transition-colors"
            onClick={() => setLightboxOpen(false)}
            aria-label="닫기"
          >
            <X className="w-4 h-4" />
          </button>
          <div
            className="relative max-w-xl w-full rounded-2xl overflow-hidden shadow-2xl border border-border"
            onClick={e => e.stopPropagation()}
          >
            <Image
              src={connection.businessCard.imageUrl}
              alt={`${connection.name} 명함 확대`}
              width={680}
              height={388}
              className="w-full h-auto"
            />
            <div className="px-4 py-3 bg-card/95 border-t border-border">
              <p className="text-sm font-medium text-foreground">{connection.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{connection.role} · {connection.company}</p>
            </div>
          </div>
        </div>
      )}

      {/* AI Suggestion */}
      <div className="px-5 pt-4 pb-5">
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <p className="text-xs text-primary font-medium">Nion의 제안</p>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">
            {drift
              ? `${connection.name}님과 연락이 ${days}일째 끊겼습니다. 가벼운 안부 인사를 건네보는 건 어떨까요?`
              : `${connection.name}님은 ${connection.role} 분야의 핵심 인연입니다. 다가오는 AI 관련 세미나 정보를 공유해보세요.`}
          </p>
          <Button
            size="sm"
            className="mt-3 h-7 text-xs bg-primary/15 hover:bg-primary/25 text-primary border border-primary/20"
            variant="ghost"
          >
            안부 메시지 초안 생성
          </Button>
        </div>
      </div>
    </div>
  )
}
