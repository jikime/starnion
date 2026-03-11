"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, RefreshCw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

// ── Types ─────────────────────────────────────────────────────────────────────

interface BudgetItem { category: string; budget: number; spent: number; percent: number }
interface Goal { id: number; title: string; icon: string; progress: number; category: string; status: string }
interface DDay { id: number; title: string; dday_value: number }

interface GardenData {
  mood: string
  savingsRate: number
  totalBudget: number
  totalSpent: number
  budgetRemaining: number
  overBudgetCategories: string[]
  isRaining: boolean
  goals: Goal[]
  income: number
  meteorCount: number
  diaryMoods: string[]
  // ── Phase 2 ──
  ddays: DDay[]           // 타임캡슐
  budgetItems: BudgetItem[] // 별자리 예산 리포트
  docCount: number        // 지식 배낭
  audioCount: number      // 풍경
  imageCount: number      // 마법 호수
  skillCount: number      // 마법 지팡이
  tokenUsagePct: number   // 에너지 충전기 (0-100)
  activePersona: string   // 니온 오라
  integrationCount: number // 은하수 길
}

// ── Sky palettes ──────────────────────────────────────────────────────────────

const PALETTES = {
  매우좋음: { from: "#1a1200", to: "#5a3a00", accent: "#fbbf24", nebula: "#f59e0b" },
  좋음:    { from: "#0f1b3d", to: "#1e3a6b", accent: "#60a5fa", nebula: "#3b82f6" },
  보통:    { from: "#0f1230", to: "#2d1b69", accent: "#a78bfa", nebula: "#7c3aed" },
  나쁨:    { from: "#080820", to: "#1a0f3c", accent: "#7c3aed", nebula: "#5b21b6" },
  매우나쁨: { from: "#050514", to: "#0a0820", accent: "#5b21b6", nebula: "#4c1d95" },
} as const

type MoodKey = keyof typeof PALETTES

function getPalette(mood: string) {
  return PALETTES[(mood as MoodKey)] ?? PALETTES["보통"]
}

// ── Persona aura colors ────────────────────────────────────────────────────────

const PERSONA_AURA: Record<string, string> = {
  assistant: "#e2e8f0",
  finance:   "#34d399",
  buddy:     "#f472b6",
  coach:     "#fb923c",
  analyst:   "#60a5fa",
  counselor: "#c084fc",
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function starPolygon(cx: number, cy: number, outerR: number, n = 5): string {
  const innerR = outerR * 0.42
  return Array.from({ length: n * 2 }, (_, i) => {
    const angle = (Math.PI / n) * i - Math.PI / 2
    const r = i % 2 === 0 ? outerR : innerR
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`
  }).join(" ")
}

function shortKRW(n: number) { return n.toLocaleString("ko-KR") }

// ── CSS keyframes ─────────────────────────────────────────────────────────────

const GARDEN_STYLES = `
@keyframes gdn-twinkle {
  0%   { opacity: 0.12; transform: scale(0.65); }
  100% { opacity: 0.98; transform: scale(1.35); }
}
@keyframes gdn-flow {
  0%   { stroke-dashoffset: 800; opacity: 0.35; }
  45%  { opacity: 0.95; }
  100% { stroke-dashoffset: 0;   opacity: 0.35; }
}
@keyframes gdn-orb-pulse {
  0%, 100% { opacity: 0.85; }
  50%       { opacity: 1; }
}
@keyframes gdn-meteor {
  0%   { transform: translate(0,0)       opacity(1); }
  100% { transform: translate(260px,260px); opacity: 0; }
}
@keyframes gdn-rain {
  0%   { transform: translateY(-14px); opacity: 0; }
  18%  { opacity: 0.72; }
  100% { transform: translateY(96px);  opacity: 0; }
}
@keyframes gdn-float {
  0%, 100% { transform: translateY(0);   }
  50%       { transform: translateY(-9px); }
}
@keyframes gdn-sway {
  0%, 100% { transform: rotate(-4.5deg); }
  50%       { transform: rotate(4.5deg);  }
}
@keyframes gdn-bloom {
  0%, 100% { transform: scale(0.92); opacity: 0.82; }
  50%       { transform: scale(1.08); opacity: 1;    }
}
@keyframes gdn-rise {
  from { opacity: 0; transform: translateY(28px); }
  to   { opacity: 1; transform: translateY(0);    }
}
@keyframes gdn-sparkle-orbit {
  from { transform: rotate(0deg)   translateX(52px) rotate(0deg); }
  to   { transform: rotate(360deg) translateX(52px) rotate(-360deg); }
}
@keyframes gdn-star-fall {
  0%   { transform: translateY(-20px) scale(0.4) rotate(0deg);   opacity: 0; }
  15%  { opacity: 1; }
  80%  { opacity: 0.9; }
  100% { transform: translateY(60px)  scale(1.1) rotate(180deg); opacity: 0; }
}
@keyframes gdn-star-land {
  0%   { transform: scale(0) rotate(-30deg); opacity: 0; }
  40%  { transform: scale(1.4) rotate(10deg); opacity: 1; }
  70%  { transform: scale(0.9) rotate(-5deg); opacity: 1; }
  100% { transform: scale(1)   rotate(0deg);  opacity: 0.85; }
}
@keyframes gdn-wither-droop {
  0%, 100% { transform: rotate(-2deg) translateY(0); }
  50%       { transform: rotate(-6deg) translateY(4px); }
}
/* ── Phase 2 ── */
@keyframes gdn-dust-fall {
  0%   { transform: translateY(-10px) rotate(0deg);   opacity: 0; }
  12%  { opacity: 0.9; }
  88%  { opacity: 0.6; }
  100% { transform: translateY(80px)  rotate(360deg); opacity: 0; }
}
@keyframes gdn-capsule-glow {
  0%, 100% { opacity: 0.55; transform: scale(1); }
  50%       { opacity: 1;    transform: scale(1.06); }
}
@keyframes gdn-lake-ripple {
  0%   { transform: scale(1);   opacity: 0.45; }
  100% { transform: scale(2.4); opacity: 0; }
}
@keyframes gdn-bell-swing {
  0%, 100% { transform: rotate(-14deg) translateX(0); }
  50%       { transform: rotate(14deg)  translateX(0); }
}
@keyframes gdn-gem-sparkle {
  0%, 100% { opacity: 0.55; transform: scale(0.88); }
  50%       { opacity: 1;   transform: scale(1.18); }
}
@keyframes gdn-scout-fly {
  0%   { transform: translateY(0)    scale(1);   opacity: 1; }
  35%  { transform: translateY(-52px) scale(0.65); opacity: 0.7; }
  65%  { transform: translateY(-52px) scale(0.65); opacity: 0.7; }
  100% { transform: translateY(0)    scale(1);   opacity: 1; }
}
@keyframes gdn-galaxy-shimmer {
  0%, 100% { opacity: 0.18; }
  50%       { opacity: 0.45; }
}
@keyframes gdn-charger-pulse {
  0%, 100% { opacity: 0.65; }
  50%       { opacity: 1; }
}
@keyframes gdn-prune {
  0%   { transform: rotate(0deg)   translate(0,0);     opacity: 0; }
  18%  { opacity: 0.9; }
  55%  { transform: rotate(-40deg) translate(-6px,5px); opacity: 0.9; }
  82%  { opacity: 0.9; }
  100% { transform: rotate(0deg)   translate(0,0);     opacity: 0; }
}
@keyframes gdn-aura-pulse {
  0%, 100% { transform: scale(1);    opacity: 0.18; }
  50%       { transform: scale(1.08); opacity: 0.32; }
}
`

// ── Garden Popover ─────────────────────────────────────────────────────────────

function GardenPopover({
  children, title, icon, description, stats, accent, side = "top", align = "center",
}: {
  children: React.ReactNode
  title: string
  icon: string
  description: string
  stats?: Array<{ label: string; value: string | number; color?: string }>
  accent?: string
  side?: "top" | "bottom" | "left" | "right"
  align?: "start" | "center" | "end"
}) {
  const accentColor = accent ?? "#a78bfa"
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        sideOffset={10}
        className="w-60 p-0 border shadow-2xl outline-none"
        style={{
          background: "rgba(5,8,30,0.96)",
          backdropFilter: "blur(18px)",
          border: `1px solid ${accentColor}50`,
          zIndex: 200,
        }}
      >
        <div className="p-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xl">{icon}</span>
            <span className="text-sm font-bold text-white tracking-wide">{title}</span>
          </div>
          {stats && stats.length > 0 && (
            <div
              className="space-y-1.5 py-2 border-y"
              style={{ borderColor: `${accentColor}25` }}
            >
              {stats.map((s, i) => (
                <div key={i} className="flex justify-between items-center text-xs">
                  <span className="text-white/50">{s.label}</span>
                  <span className="font-semibold" style={{ color: s.color ?? accentColor }}>
                    {s.value}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
            {description}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ── StarField ─────────────────────────────────────────────────────────────────

function StarField() {
  const [stars, setStars] = useState<Array<{
    id: number; x: number; y: number; s: number; delay: number; dur: number
  }>>([])

  useEffect(() => {
    setStars(Array.from({ length: 100 }, (_, i) => ({
      id: i,
      x: parseFloat(((i * 1.13 + Math.sin(i * 2.37) * 32 + 52) % 100).toFixed(4)),
      y: parseFloat(((i * 0.79 + Math.cos(i * 1.71) * 26 + 28) % 74).toFixed(4)),
      s: 0.45 + (i % 4) * 0.45,
      delay: (i % 7) * 0.65,
      dur: 1.8 + (i % 5) * 0.6,
    })))
  }, [])

  return (
    <>
      {stars.map(s => (
        <div key={s.id} className="absolute rounded-full bg-white pointer-events-none"
          style={{
            left: `${s.x}%`, top: `${s.y}%`,
            width: `${s.s}px`, height: `${s.s}px`,
            animation: `gdn-twinkle ${s.dur}s ${s.delay}s ease-in-out infinite alternate`,
          }}
        />
      ))}
    </>
  )
}

// ── Gold Star Dust (수입 발생 시 골드 더스트가 나무로 내려옴) ─────────────────

function GoldStarDust({ income }: { income: number }) {
  const count = Math.min(12, Math.max(0, Math.floor(income / 200_000)))
  const [particles, setParticles] = useState<Array<{
    id: number; x: number; size: number; delay: number; dur: number
  }>>([])

  useEffect(() => {
    if (!count) { setParticles([]); return }
    setParticles(Array.from({ length: count }, (_, i) => ({
      id: i,
      x: 35 + (i * 3.2 + Math.sin(i * 1.7) * 12) % 30,
      size: 3 + (i % 3) * 2,
      delay: parseFloat((i * 0.55).toFixed(2)),
      dur: parseFloat((2.2 + (i % 4) * 0.4).toFixed(2)),
    })))
  }, [count])

  if (!particles.length) return null

  return (
    <>
      {particles.map(p => (
        <div key={p.id} className="absolute pointer-events-none" style={{
          left: `${p.x}%`, top: "5%", zIndex: 7,
          animation: `gdn-dust-fall ${p.dur}s ${p.delay}s ease-in infinite`,
        }}>
          <svg width={p.size * 3} height={p.size * 3}
            viewBox={`${-p.size * 1.5} ${-p.size * 1.5} ${p.size * 3} ${p.size * 3}`}
            style={{ overflow: "visible" }}>
            <polygon points={starPolygon(0, 0, p.size, 5)} fill="#fbbf24" opacity="0.88" />
            <circle cx="0" cy="0" r={p.size * 0.25} fill="white" opacity="0.5" />
          </svg>
        </div>
      ))}
    </>
  )
}

// ── Income Stars (scattered sky, 수입 규모 표시) ──────────────────────────────

function IncomeStars({ income }: { income: number }) {
  const count = Math.min(8, Math.max(0, Math.floor(income / 300_000)))
  const [stars, setStars] = useState<Array<{
    id: number; x: number; y: number; size: number; delay: number; dur: number
  }>>([])

  useEffect(() => {
    if (!count) { setStars([]); return }
    setStars(Array.from({ length: count }, (_, i) => ({
      id: i,
      x: parseFloat((5 + (i * 12.4 + Math.sin(i * 2.7) * 28) % 83).toFixed(2)),
      y: parseFloat((4 + (i * 6.8 + Math.cos(i * 1.9) * 11) % 38).toFixed(2)),
      size: 9 + (i % 3) * 4,
      delay: parseFloat((i * 0.85).toFixed(2)),
      dur: parseFloat((2.6 + (i % 4) * 0.55).toFixed(2)),
    })))
  }, [count])

  if (!stars.length) return null

  return (
    <>
      {stars.map(s => (
        <div key={s.id} className="absolute pointer-events-none" style={{
          left: `${s.x}%`, top: `${s.y}%`, zIndex: 6,
          animation: `gdn-float ${s.dur}s ${s.delay}s ease-in-out infinite`,
        }}>
          <svg width={s.size * 2.8} height={s.size * 2.8}
            viewBox={`${-s.size * 1.4} ${-s.size * 1.4} ${s.size * 2.8} ${s.size * 2.8}`}
            style={{ overflow: "visible" }}>
            <polygon points={starPolygon(0, 0, s.size * 1.7, 5)} fill="#fbbf24" opacity="0.12" />
            <polygon points={starPolygon(0, 0, s.size * 1.2, 5)} fill="#fde68a" opacity="0.28" />
            <polygon points={starPolygon(0, 0, s.size, 5)}        fill="#fbbf24" opacity="0.95" />
            <circle cx="0" cy="0" r={s.size * 0.28} fill="white" opacity="0.55" />
          </svg>
        </div>
      ))}
    </>
  )
}

// ── Meteors ───────────────────────────────────────────────────────────────────

function Meteors({ count }: { count: number }) {
  if (!count) return null
  return (
    <>
      {Array.from({ length: Math.min(count, 3) }, (_, i) => (
        <div key={i} className="absolute pointer-events-none" style={{
          width: 88, height: 2,
          top: `${8 + i * 11}%`, left: `${8 + i * 18}%`,
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.9) 40%, rgba(200,220,255,0.5) 70%, transparent)",
          transform: "rotate(35deg)",
          animation: `gdn-meteor 4.5s ${i * 2.4}s ease-in infinite`,
        }} />
      ))}
    </>
  )
}

// ── D-Day 타임캡슐 ─────────────────────────────────────────────────────────────

function TimeCapsule({ ddays, accent: _accent }: { ddays: DDay[]; accent: string }) {
  const upcoming = ddays
    .filter(d => d.dday_value >= 0)
    .sort((a, b) => a.dday_value - b.dday_value)[0]

  if (!upcoming) return null

  const isImminent = upcoming.dday_value <= 3
  const isClose = upcoming.dday_value <= 7
  const capColor = isImminent ? "#f87171" : isClose ? "#fbbf24" : "#a78bfa"
  const animDur = isImminent ? "1s" : isClose ? "2s" : "3.5s"
  const urgencyLabel = isImminent ? "🚨 임박!" : isClose ? "⚡ 곧 다가와요" : "📅 예정됨"
  const allUpcoming = ddays.filter(d => d.dday_value >= 0).sort((a, b) => a.dday_value - b.dday_value)

  return (
    <div className="absolute" style={{ right: "4%", top: "38%", zIndex: 8 }}>
      <GardenPopover
        icon="💊"
        title="타임 캡슐"
        accent={capColor}
        side="left"
        align="center"
        stats={[
          { label: "제목", value: upcoming.title, color: capColor },
          { label: "D-Day", value: `D-${upcoming.dday_value}`, color: capColor },
          { label: "긴급도", value: urgencyLabel },
          ...(allUpcoming.length > 1
            ? [{ label: "전체 일정", value: `${allUpcoming.length}개` }]
            : []),
        ]}
        description="중요한 날까지 카운트다운 중이에요. D-Day가 가까워질수록 캡슐이 더 밝게 빛납니다."
      >
        <div className="flex flex-col items-center gap-1 cursor-pointer hover:scale-105 transition-transform">
          <svg width="52" height="82" viewBox="0 0 52 82" style={{ overflow: "visible" }}>
            <ellipse cx="26" cy="44" rx="20" ry="30" fill={capColor} opacity="0.08"
              style={{ animation: `gdn-capsule-glow ${animDur} ease-in-out infinite` }} />
            <rect x="6" y="14" width="40" height="54" rx="20"
              fill={capColor} opacity="0.12"
              style={{ filter: `drop-shadow(0 0 ${isImminent ? 16 : isClose ? 10 : 6}px ${capColor})` }} />
            <rect x="7" y="15" width="38" height="52" rx="19"
              fill="none" stroke={capColor} strokeWidth="1.4" opacity="0.7" />
            <rect x="11" y="19" width="30" height="44" rx="15" fill={capColor} opacity="0.07" />
            <ellipse cx="19" cy="27" rx="5" ry="8" fill="white" opacity="0.12" />
            <text x="26" y="38" textAnchor="middle" fontSize="11" fontWeight="bold"
              fill={capColor} opacity="0.95" style={{ fontFamily: "system-ui" }}>
              D-{upcoming.dday_value}
            </text>
            <text x="26" y="53" textAnchor="middle" fontSize="9" fill="white" opacity="0.6">
              {upcoming.title.length > 6 ? upcoming.title.slice(0, 6) + "…" : upcoming.title}
            </text>
            {isImminent && (
              <polygon points={starPolygon(26, 6, 7, 5)} fill={capColor} opacity="0.9"
                style={{ animation: `gdn-twinkle 0.7s ease-in-out infinite alternate` }} />
            )}
            {isClose && (
              <text x="46" y="58" fontSize="11" opacity="0.7">🧑</text>
            )}
          </svg>
          <span className="text-xs tracking-wider font-medium" style={{ color: `${capColor}bb` }}>
            타임 캡슐
          </span>
        </div>
      </GardenPopover>
    </div>
  )
}

// ── Asset Tree (with persona aura + prune animation) ──────────────────────────

function AssetTree({
  savingsRate, accent, isRaining, onClick, activePersona,
}: {
  savingsRate: number
  accent: string
  isRaining: boolean
  onClick: () => void
  activePersona: string
}) {
  const isWithering = savingsRate < 30
  const isSevere    = savingsRate < 15
  const fruitCount  = isWithering ? 0 : Math.min(5, Math.floor(savingsRate / 20))
  const scale       = 0.5 + Math.min(savingsRate, 100) / 100 * 0.58
  const alpha       = Math.max(0.35, Math.min(1, savingsRate / 80))

  const branchColor    = isWithering ? (isSevere ? "#6b5a4e" : "#8a7060") : accent
  const branchMidColor = isWithering ? "#a89080" : "#c4b5fd"
  const branchEndColor = isWithering ? "#9a8070" : "#e879f9"

  const auraColor = PERSONA_AURA[activePersona] ?? "#e2e8f0"

  const branches = isWithering
    ? [
        { d: "M200,268 C185,255 155,240 130,220 C108,202 100,182 115,168", delay: "0s" },
        { d: "M200,268 C215,255 245,240 270,220 C292,202 300,182 285,168", delay: "0.9s" },
        { d: "M200,268 C198,248 194,220 197,190 C199,165 205,148 200,138", delay: "1.8s" },
        { d: "M200,268 C178,262 155,254 138,240 C120,226 116,208 128,196", delay: "2.7s" },
        { d: "M200,268 C222,262 245,254 262,240 C280,226 284,208 272,196", delay: "3.6s" },
      ]
    : [
        { d: "M200,268 C175,245 120,215 85,175 C55,138 68,92 118,82 C148,76 165,95 154,118", delay: "0s" },
        { d: "M200,268 C225,245 280,215 315,175 C345,138 332,92 282,82 C252,76 235,95 246,118", delay: "0.9s" },
        { d: "M200,268 C196,235 182,195 188,152 C194,112 210,78 200,48 C196,32 188,28 200,24", delay: "1.8s" },
        { d: "M200,268 C170,255 138,240 110,215 C82,190 72,158 90,136 C104,118 128,116 140,132", delay: "2.7s" },
        { d: "M200,268 C230,255 262,240 290,215 C318,190 328,158 310,136 C296,118 272,116 260,132", delay: "3.6s" },
      ]

  const fruitPositions = ([
    [200, 76], [148, 110], [260, 96], [174, 150], [232, 136],
  ] as [number, number][]).slice(0, fruitCount)

  const sparkles = isWithering ? [] : [
    [150, 170], [252, 172], [200, 116], [120, 188], [280, 190], [178, 132], [224, 128],
  ] as [number, number][]

  const tipPositions = isWithering
    ? [[115, 168], [285, 168], [200, 138], [128, 196], [272, 196]]
    : [[154, 118], [246, 118], [200, 24], [140, 132], [260, 132]]

  return (
    <div onClick={onClick} className="absolute cursor-pointer select-none"
      style={{
        left: "50%", bottom: "13%",
        transform: "translateX(-50%)",
        zIndex: 10,
        filter: isWithering
          ? "drop-shadow(0 0 16px #6b504488) saturate(0.4)"
          : `drop-shadow(0 0 32px ${accent}55)`,
      }}
      title="터치하여 예산 현황 보기"
    >
      <svg viewBox="0 0 400 320" width="400" height="320" style={{ overflow: "visible" }}>
        <defs>
          <filter id="gdn-glow-md" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b" />
            <feComposite in="b" in2="SourceGraphic" operator="over" />
          </filter>
          <filter id="gdn-glow-lg" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="14" result="b" />
            <feComposite in="b" in2="SourceGraphic" operator="over" />
          </filter>
          <filter id="gdn-glow-sm" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="b" />
            <feComposite in="b" in2="SourceGraphic" operator="over" />
          </filter>
          <linearGradient id="gdn-branch" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor={branchColor}    stopOpacity="0.95" />
            <stop offset="50%"  stopColor={branchMidColor} stopOpacity="0.6" />
            <stop offset="100%" stopColor={branchEndColor} stopOpacity="0.25" />
          </linearGradient>
          <radialGradient id="gdn-orb" cx="50%" cy="38%" r="62%">
            <stop offset="0%"   stopColor="white" stopOpacity={isWithering ? "0.6" : "0.95"} />
            <stop offset="30%"  stopColor={isWithering ? "#9a8070" : accent} stopOpacity="0.88" />
            <stop offset="70%"  stopColor={isWithering ? "#6b5040" : accent} stopOpacity="0.3" />
            <stop offset="100%" stopColor={isWithering ? "#3a2a20" : accent} stopOpacity="0.04" />
          </radialGradient>
        </defs>

        {/* Persona aura ring */}
        <ellipse cx="200" cy="230" rx="70" ry="55" fill="none"
          stroke={auraColor} strokeWidth="1.2" strokeOpacity="0.35"
          style={{ animation: "gdn-aura-pulse 3s ease-in-out infinite" }} />
        <ellipse cx="200" cy="230" rx="85" ry="68" fill={auraColor} opacity="0.04"
          style={{ animation: "gdn-aura-pulse 3s 1s ease-in-out infinite" }} />

        <g
          transform={`translate(200,280) scale(${scale}) translate(-200,-280)`}
          style={{
            opacity: alpha,
            animation: isWithering ? "gdn-wither-droop 5s ease-in-out infinite" : undefined,
            transformOrigin: "200px 272px",
          }}
        >
          <ellipse cx="200" cy="190" rx="92" ry="115" fill={branchColor}
            opacity={isWithering ? "0.03" : "0.055"} />
          <ellipse cx="200" cy="190" rx="60" ry="78" fill={branchColor}
            opacity={isWithering ? "0.04" : "0.06"} />

          {branches.map(({ d }, i) => (
            <path key={`halo-${i}`} d={d} fill="none" stroke={branchColor}
              strokeWidth={i < 3 ? 14 : 11} strokeOpacity="0.07" strokeLinecap="round" />
          ))}
          {branches.map(({ d }, i) => (
            <path key={`mid-${i}`} d={d} fill="none" stroke={branchColor}
              strokeWidth={i < 3 ? 7 : 5} strokeOpacity="0.13" strokeLinecap="round" />
          ))}
          {branches.map(({ d, delay }, i) => (
            <path key={`flow-${i}`} d={d} fill="none" stroke="url(#gdn-branch)"
              strokeWidth={i < 3 ? 2.8 : 2.2} strokeLinecap="round" filter="url(#gdn-glow-md)"
              style={{
                strokeDasharray: 700,
                animation: `gdn-flow ${isWithering ? "9s" : "5.2s"} ${delay} ease-in-out infinite`,
                opacity: isWithering ? 0.5 : 1,
              }} />
          ))}

          {tipPositions.map(([cx, cy], i) => (
            <circle key={`tip-${i}`} cx={cx} cy={cy} r={isWithering ? 3 : 5}
              fill={branchColor} filter="url(#gdn-glow-sm)"
              opacity={isWithering ? 0.35 : 0.7}
              style={{ animation: `gdn-twinkle ${2 + i * 0.4}s ${i * 0.7}s ease-in-out infinite alternate` }} />
          ))}

          {sparkles.map(([cx, cy], i) => (
            <circle key={`sp-${i}`} cx={cx} cy={cy} r={2.0} fill="white"
              style={{ animation: `gdn-twinkle ${1.4 + (i % 4) * 0.5}s ${i * 0.55}s ease-in-out infinite alternate` }} />
          ))}

          {fruitPositions.map(([px, py], i) => (
            <g key={`fruit-${i}`} filter="url(#gdn-glow-sm)">
              <polygon points={starPolygon(px, py, 9.5, 5)} fill="#fbbf24"
                style={{ animation: `gdn-float ${2.4 + i * 0.35}s ${i * 0.55}s ease-in-out infinite` }} />
              <polygon points={starPolygon(px, py, 13, 5)} fill="#fbbf24" opacity="0.2" />
            </g>
          ))}

          {/* 전지 모션 — 지출 초과 시 가위 */}
          {isRaining && (
            <text x="260" y="160" fontSize="18" opacity="0.75"
              style={{ animation: "gdn-prune 3.5s 0.5s ease-in-out infinite" }}>
              ✂️
            </text>
          )}

          <circle cx="200" cy="258" r="48" fill={isWithering ? "#6b5040" : accent}
            opacity={isWithering ? "0.06" : "0.1"} filter="url(#gdn-glow-lg)" />
          <circle cx="200" cy="258" r="38" fill={isWithering ? "#6b5040" : accent}
            opacity={isWithering ? "0.08" : "0.15"} />
          <circle cx="200" cy="258" r="30" fill="url(#gdn-orb)" filter="url(#gdn-glow-lg)"
            style={{ animation: "gdn-orb-pulse 3.5s ease-in-out infinite" }} />
          <circle cx="200" cy="258" r="22" fill="none"
            stroke={isWithering ? "#9a8070" : accent} strokeWidth="1.2" strokeOpacity="0.55" />
          <circle cx="200" cy="258" r="15" fill="none"
            stroke="white" strokeWidth="0.7" strokeOpacity="0.28" />
          <text x="200" y="264" textAnchor="middle" fontSize="16" fontWeight="bold"
            fill={isWithering ? "#d4b896" : "white"}
            opacity={isWithering ? "0.65" : "0.95"}
            style={{ fontFamily: "system-ui, sans-serif" }}>₩</text>
        </g>
      </svg>

      {isWithering && (
        <div className="absolute left-1/2 -translate-x-1/2 -bottom-6 whitespace-nowrap text-xs text-center"
          style={{ color: isSevere ? "#f87171" : "#fb923c" }}>
          {isSevere ? "🥀 나무가 시들고 있어요" : "🍂 나무가 힘을 잃고 있어요"}
        </div>
      )}
    </div>
  )
}

// ── Spending Cloud ─────────────────────────────────────────────────────────────

function SpendingCloud({ isRaining, categories, accent }: {
  isRaining: boolean; categories: string[]; accent: string
}) {
  const drops = useMemo(() =>
    Array.from({ length: 18 }, (_, i) => ({
      id: i, x: 10 + (i % 9) * 15,
      delay: ((i * 0.22) % 2.1).toFixed(2),
      dur: (0.9 + (i % 4) * 0.28).toFixed(2),
    }))
  , [])

  return (
    <div className="absolute" style={{ right: "6%", top: "11%", zIndex: 8 }}>
      <GardenPopover
        icon="☁️"
        title="지출 구름"
        accent={isRaining ? "#f87171" : accent}
        side="bottom"
        align="end"
        stats={[
          { label: "상태", value: isRaining ? "🌧 지출 초과" : "☀️ 양호", color: isRaining ? "#f87171" : "#34d399" },
          ...(categories.length > 0
            ? [{ label: "초과 카테고리", value: `${categories.length}개`, color: "#fca5a5" }]
            : []),
          ...categories.slice(0, 3).map(c => ({ label: "  •", value: c, color: "#fca5a5" })),
        ]}
        description={
          isRaining
            ? "예산을 초과한 카테고리가 있어요. 지출 패턴을 확인하고 조절해보세요. 구름이 걷히면 나무가 더 무성해져요."
            : "지출이 예산 범위 안에 있어요. 이 상태를 유지하면 나무에 열매가 맺혀요."
        }
      >
        <div className="cursor-pointer hover:scale-105 transition-transform">
          <svg viewBox="0 0 180 130" width="180" height="130" style={{ overflow: "visible" }}>
            <defs>
              <filter id="gdn-cloud-glow" x="-25%" y="-25%" width="150%" height="150%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="4.5" result="b" />
                <feComposite in="b" in2="SourceGraphic" operator="over" />
              </filter>
              <radialGradient id="gdn-cloud-fill" cx="50%" cy="40%" r="60%">
                <stop offset="0%"   stopColor="#6b80b8" stopOpacity="0.92" />
                <stop offset="100%" stopColor="#3a4a7a" stopOpacity="0.75" />
              </radialGradient>
            </defs>
            <ellipse cx="90" cy="72" rx="72" ry="14" fill="#1a2a5a" opacity="0.35" />
            <path d="M20,72 C20,72 18,58 28,52 C32,44 44,38 58,42 C60,32 70,22 84,22 C94,18 106,20 112,28 C118,20 130,16 142,22 C154,26 160,36 156,46 C166,42 178,46 180,56 C182,66 174,72 162,72 Z"
              fill="url(#gdn-cloud-fill)" filter="url(#gdn-cloud-glow)" />
            <path d="M36,68 C36,68 34,56 44,50 C50,44 62,40 74,44 C78,36 86,30 96,30 C106,28 116,32 120,40 C128,34 140,36 144,44 C148,52 142,60 132,62 C136,68 Z"
              fill="#7a90c8" opacity="0.55" />
            <ellipse cx="82" cy="34" rx="20" ry="9" fill="white" opacity="0.10" />
            <text x="90" y="55" textAnchor="middle" fontSize="12" fill="white" opacity="0.88" fontWeight="600">
              지출 구름
            </text>
            {isRaining && drops.map(d => (
              <line key={d.id} x1={d.x} y1={72} x2={d.x - 5} y2={90}
                stroke="#93c5fd" strokeWidth="1.8" strokeLinecap="round"
                style={{ animation: `gdn-rain ${d.dur}s ${d.delay}s ease-in infinite`, opacity: 0 }} />
            ))}
            {isRaining && (
              <text x="90" y="112" textAnchor="middle" fontSize="10" fill="#93c5fd" opacity="0.7" fontStyle="italic">
                Spending Storm
              </text>
            )}
          </svg>
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1 justify-center mt-0.5 max-w-[180px]">
              {categories.slice(0, 3).map(c => (
                <span key={c} className="text-[11px] px-1.5 py-0.5 rounded-full"
                  style={{ background: "rgba(239,68,68,0.2)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.3)" }}>
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
      </GardenPopover>
    </div>
  )
}

// ── Goal Flowers ──────────────────────────────────────────────────────────────

const FLOWER_PALETTES = [
  { p1: "#60a5fa", p2: "#818cf8", p3: "#c4b5fd", leaf: "#34d399", center: "#fbbf24" },
  { p1: "#a78bfa", p2: "#c084fc", p3: "#e9d5ff", leaf: "#4ade80", center: "#fde68a" },
  { p1: "#34d399", p2: "#60a5fa", p3: "#a5f3fc", leaf: "#4ade80", center: "#fbbf24" },
  { p1: "#f472b6", p2: "#a78bfa", p3: "#ddd6fe", leaf: "#34d399", center: "#fef08a" },
]

function TulipSVG({ goal, index }: { goal: Goal; index: number }) {
  const progress = Math.max(0, Math.min(100, goal.progress ?? 0))
  const col = FLOWER_PALETTES[index % FLOWER_PALETTES.length]
  const stage = progress >= 80 ? 4 : progress >= 55 ? 3 : progress >= 30 ? 2 : progress >= 10 ? 1 : 0
  const bloomScale = stage === 4 ? 1 : stage === 3 ? 0.8 : stage === 2 ? 0.6 : 0.4
  const stemH = 62 + bloomScale * 12
  const BY = 118
  const CY = BY - stemH
  const P = bloomScale
  const leftPetal   = `M0,${CY + 8*P} C${-16*P},${CY + 2*P} ${-22*P},${CY - 16*P} ${-14*P},${CY - 30*P} C${-8*P},${CY - 40*P} ${-2*P},${CY - 32*P} 0,${CY - 18*P}`
  const rightPetal  = `M0,${CY + 8*P} C${16*P},${CY + 2*P} ${22*P},${CY - 16*P} ${14*P},${CY - 30*P} C${8*P},${CY - 40*P} ${2*P},${CY - 32*P} 0,${CY - 18*P}`
  const centerPetal = `M${-6*P},${CY + 6*P} C${-12*P},${CY - 8*P} ${-10*P},${CY - 34*P} 0,${CY - 42*P} C${10*P},${CY - 34*P} ${12*P},${CY - 8*P} ${6*P},${CY + 6*P}`

  return (
    <g style={{ transformOrigin: `0px ${BY}px`, animation: stage >= 2 ? `gdn-sway ${3.4 + index * 0.6}s ${index * 0.7}s ease-in-out infinite` : undefined }}>
      <defs>
        <filter id={`gdn-fl-glow-${index}`} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b" />
          <feComposite in="b" in2="SourceGraphic" operator="over" />
        </filter>
        <linearGradient id={`gdn-tulip-${index}`} x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%"   stopColor={col.p1} stopOpacity="0.95" />
          <stop offset="50%"  stopColor={col.p2} stopOpacity="0.85" />
          <stop offset="100%" stopColor={col.p3} stopOpacity="0.75" />
        </linearGradient>
      </defs>
      {stage >= 1 && (
        <path d={`M0,${BY} C${-4},${BY - stemH*0.4} ${4},${BY - stemH*0.7} 0,${CY + 10*P}`}
          fill="none" stroke={col.leaf} strokeWidth="2.8" strokeLinecap="round" opacity="0.82" />
      )}
      {stage >= 2 && (
        <>
          <path d={`M0,${BY - stemH*0.32} C${-20},${BY - stemH*0.45} ${-26},${BY - stemH*0.62} ${-14},${BY - stemH*0.64}`} fill={col.leaf} opacity="0.72" />
          <path d={`M0,${BY - stemH*0.48} C${22},${BY - stemH*0.62} ${28},${BY - stemH*0.78} ${16},${BY - stemH*0.80}`}  fill={col.leaf} opacity="0.72" />
        </>
      )}
      {stage === 0 && (
        <circle cx="0" cy={BY - 5} r="5" fill={col.p1} opacity="0.7"
          filter={`url(#gdn-fl-glow-${index})`}
          style={{ animation: `gdn-twinkle 2.4s ${index * 0.6}s ease-in-out infinite alternate` }} />
      )}
      {stage === 1 && (
        <g filter={`url(#gdn-fl-glow-${index})`}>
          <ellipse cx="0" cy={CY} rx={7*P} ry={16*P} fill={`url(#gdn-tulip-${index})`} opacity="0.88" />
        </g>
      )}
      {stage >= 2 && (
        <g filter={`url(#gdn-fl-glow-${index})`}
          style={stage === 4 ? { animation: `gdn-bloom 3.5s ${index * 0.5}s ease-in-out infinite` } : undefined}>
          <ellipse cx="0" cy={CY - 10*P} rx={28*P} ry={30*P} fill={col.p2} opacity="0.10" />
          <path d={leftPetal}   fill={`url(#gdn-tulip-${index})`} opacity="0.85" />
          <path d={rightPetal}  fill={`url(#gdn-tulip-${index})`} opacity="0.85" />
          <path d={centerPetal} fill={`url(#gdn-tulip-${index})`} opacity="0.95" />
          <path d={centerPetal} fill={col.p3} opacity="0.18" />
          <circle cx="0" cy={CY - 4*P} r={7*P} fill={col.center} opacity="0.92" />
          <polygon points={starPolygon(0, CY - 4*P, 4.5*P, 5)} fill="white" opacity="0.9" />
          <circle cx="0" cy={CY - 4*P} r={10*P} fill={col.center} opacity="0.15" />
        </g>
      )}
      <text x="0" y={BY + 16} textAnchor="middle" fontSize="11" fill="white" opacity="0.80">
        {goal.icon} {goal.title.length > 6 ? goal.title.slice(0, 6) + "…" : goal.title}
      </text>
      <text x="0" y={BY + 29} textAnchor="middle" fontSize="10" fill="#c4b5fd" opacity="0.70">
        {progress.toFixed(0)}%
      </text>
    </g>
  )
}

function GoalFlowers({ goals, accent }: { goals: Goal[]; accent: string }) {
  const displayed = goals.slice(0, 4)
  if (!displayed.length) return null
  const spacing = 86
  const w = spacing * displayed.length + 24
  return (
    <div className="absolute" style={{ left: "2%", bottom: "9%", zIndex: 9 }}>
      <GardenPopover
        icon="🌸"
        title="목표 꽃"
        accent={accent}
        side="top"
        align="start"
        stats={[
          { label: "전체 목표", value: `${goals.length}개` },
          ...displayed.map(g => ({
            label: `${g.icon} ${g.title.length > 8 ? g.title.slice(0, 8) + "…" : g.title}`,
            value: `${(g.progress ?? 0).toFixed(0)}%`,
            color: g.progress >= 80 ? "#34d399" : g.progress >= 50 ? "#fbbf24" : accent,
          })),
        ]}
        description="목표 달성률에 따라 꽃이 피어나요. 80% 이상이면 활짝 핀 꽃이 돼요. 꾸준히 목표를 달성할수록 정원이 풍성해집니다."
      >
        <div className="cursor-pointer hover:brightness-110 transition-all">
          <svg viewBox={`-12 -22 ${w} 180`} width={w} height={180} style={{ overflow: "visible" }}>
            <text x={(w - 24) / 2} y={-8} textAnchor="middle" fontSize="11"
              fill="white" opacity="0.55" letterSpacing="2">목표 꽃</text>
            {displayed.map((goal, i) => (
              <g key={goal.id} transform={`translate(${26 + i * spacing}, 0)`}>
                <TulipSVG goal={goal} index={i} />
              </g>
            ))}
          </svg>
        </div>
      </GardenPopover>
    </div>
  )
}

// ── Emotion Seeds ─────────────────────────────────────────────────────────────

const SEED_COLORS: Record<string, string> = {
  매우좋음: "#fbbf24", 좋음: "#34d399", 보통: "#a78bfa", 나쁨: "#60a5fa", 매우나쁨: "#818cf8",
}

const MOOD_LABELS: Record<string, string> = {
  매우좋음: "😄 매우 좋음", 좋음: "🙂 좋음", 보통: "😐 보통", 나쁨: "😔 나쁨", 매우나쁨: "😢 매우 나쁨",
}

function EmotionSeeds({ diaryMoods, accent }: { diaryMoods: string[]; accent: string }) {
  if (!diaryMoods.length) return null
  const seeds = diaryMoods.slice(0, 7)
  const moodCounts = seeds.reduce<Record<string, number>>((acc, m) => {
    acc[m] = (acc[m] ?? 0) + 1; return acc
  }, {})
  return (
    <div className="absolute" style={{ bottom: "14%", right: "9%", zIndex: 7 }}>
      <GardenPopover
        icon="🌱"
        title="감정의 씨앗"
        accent={accent}
        side="top"
        align="end"
        stats={[
          { label: "기록 수", value: `${seeds.length}개` },
          ...Object.entries(moodCounts).map(([mood, cnt]) => ({
            label: MOOD_LABELS[mood] ?? mood,
            value: `${cnt}일`,
            color: SEED_COLORS[mood] ?? accent,
          })),
        ]}
        description="일기를 기록할 때마다 감정 씨앗이 심어져요. 감정 색상이 정원의 분위기를 만들어냅니다."
      >
        <div className="cursor-pointer hover:brightness-110 transition-all">
          <svg width="130" height="78" viewBox="0 0 130 78" style={{ overflow: "visible" }}>
            <text x="65" y="10" textAnchor="middle" fontSize="10" fill="white" opacity="0.40" letterSpacing="1.5">
              감정의 씨앗
            </text>
            {seeds.map((mood, i) => {
              const color = SEED_COLORS[mood] ?? "#a78bfa"
              const x = 8 + ((i * 17.6 + Math.sin(i * 2.1) * 8) % 114)
              const y = 26 + Math.abs(Math.cos(i * 1.9)) * 28
              return (
                <g key={i}>
                  <circle cx={x} cy={y} r={8} fill={color} opacity="0.08" />
                  <ellipse cx={x} cy={y} rx={4.5} ry={6} fill={color} opacity="0.75"
                    style={{ animation: `gdn-bloom ${2.4 + i * 0.4}s ${i * 0.45}s ease-in-out infinite` }} />
                  <ellipse cx={x - 1} cy={y - 2} rx={1.5} ry={2.2} fill="white" opacity="0.30" />
                  <path d={`M${x},${y - 6} C${x - 3},${y - 12} ${x + 3},${y - 13} ${x},${y - 16}`}
                    fill="none" stroke="#4ade80" strokeWidth="1.2" strokeLinecap="round" opacity="0.55" />
                </g>
              )
            })}
          </svg>
        </div>
      </GardenPopover>
    </div>
  )
}

// ── 마법 호수 (Magic Lake) — 이미지 파일 수 ──────────────────────────────────

function MagicLake({ imageCount, accent: _accent }: { imageCount: number; accent: string }) {
  if (!imageCount) return null
  const reflections = Math.min(5, imageCount)
  return (
    <div className="absolute" style={{ left: "24%", bottom: "9%", zIndex: 6 }}>
      <GardenPopover
        icon="🌊"
        title="마법 호수"
        accent="#60a5fa"
        side="top"
        align="center"
        stats={[
          { label: "저장된 이미지", value: `${imageCount}장`, color: "#93c5fd" },
          { label: "수면 반영", value: `${reflections}개`, color: "#60a5fa" },
        ]}
        description="업로드한 이미지들이 호수에 반영돼요. 호수는 당신의 기억 거울이에요. 이미지가 많을수록 호수가 더 풍성해집니다."
      >
        <div className="cursor-pointer hover:scale-105 transition-transform">
          <svg width="100" height="54" viewBox="0 0 100 54" style={{ overflow: "visible" }}>
            <ellipse cx="50" cy="38" rx="46" ry="14" fill="#1a3a6a" opacity="0.55" />
            <ellipse cx="50" cy="36" rx="44" ry="12" fill="#1e4080" opacity="0.45" />
            <ellipse cx="36" cy="30" rx="14" ry="5" fill="white" opacity="0.07" />
            {[0, 1, 2].map(i => (
              <ellipse key={i} cx="50" cy="38" rx={16 + i * 10} ry={5 + i * 3}
                fill="none" stroke="#60a5fa" strokeWidth="0.8" strokeOpacity="0.25"
                style={{ animation: `gdn-lake-ripple ${2.5 + i * 0.8}s ${i * 0.9}s ease-out infinite` }} />
            ))}
            {Array.from({ length: reflections }, (_, i) => {
              const x = 14 + i * 18
              return (
                <g key={i}>
                  <rect x={x} y={28} width={12} height={8} rx={2}
                    fill="#60a5fa" opacity="0.28"
                    style={{ animation: `gdn-bloom ${2 + i * 0.4}s ${i * 0.35}s ease-in-out infinite` }} />
                </g>
              )
            })}
            <text x="50" y="12" textAnchor="middle" fontSize="10" fill="white" opacity="0.45" letterSpacing="1">
              마법 호수
            </text>
            <text x="50" y="22" textAnchor="middle" fontSize="10" fill="#93c5fd" opacity="0.60">
              {imageCount}장
            </text>
          </svg>
        </div>
      </GardenPopover>
    </div>
  )
}

// ── 풍경 Wind Bell — 오디오 파일 수 ──────────────────────────────────────────

function WindBell({ audioCount, accent: _accent }: { audioCount: number; accent: string }) {
  if (!audioCount) return null
  return (
    <div className="absolute" style={{ left: "5%", top: "16%", zIndex: 8 }}>
      <GardenPopover
        icon="🔔"
        title="풍경"
        accent="#a78bfa"
        side="right"
        align="start"
        stats={[
          { label: "오디오 파일", value: `${audioCount}개`, color: "#c4b5fd" },
        ]}
        description="저장된 오디오 파일이 풍경을 울려요. 소리를 기록할수록 정원에 멜로디가 가득 찹니다."
      >
        <div
          className="flex flex-col items-center gap-1 cursor-pointer hover:scale-110 transition-transform"
          style={{ animation: `gdn-bell-swing 2.8s ease-in-out infinite`, transformOrigin: "center top" }}
        >
          <svg width="36" height="60" viewBox="0 0 36 60" style={{ overflow: "visible" }}>
            <line x1="18" y1="0" x2="18" y2="10" stroke="#a78bfa" strokeWidth="1" opacity="0.5" />
            <path d="M6,12 C6,8 8,6 18,6 C28,6 30,8 30,12 L30,36 C30,42 26,46 18,48 C10,46 6,42 6,36 Z"
              fill="#a78bfa" opacity="0.2" />
            <path d="M7,13 C7,9 9,7 18,7 C27,7 29,9 29,13 L29,35 C29,41 25,45 18,47"
              fill="none" stroke="#a78bfa" strokeWidth="1.2" opacity="0.55" />
            <ellipse cx="13" cy="16" rx="3" ry="7" fill="white" opacity="0.12" />
            <circle cx="18" cy="48" r="3.5" fill="#a78bfa" opacity="0.6" />
            <line x1="18" y1="46" x2="18" y2="42" stroke="#a78bfa" strokeWidth="1" opacity="0.4" />
            {[0, 1].map(i => (
              <path key={i}
                d={`M${26 + i * 6},${22 + i * 4} C${30 + i * 6},${26 + i * 4} ${30 + i * 6},${30 + i * 4} ${26 + i * 6},${34 + i * 4}`}
                fill="none" stroke="#c4b5fd" strokeWidth="1"
                strokeOpacity={0.3 - i * 0.1}
                style={{ animation: `gdn-charger-pulse ${1.8 + i * 0.4}s ${i * 0.3}s ease-in-out infinite` }} />
            ))}
          </svg>
          <span className="text-xs font-medium" style={{ color: "#a78bfacc" }}>{audioCount}개</span>
        </div>
      </GardenPopover>
    </div>
  )
}

// ── 지식 배낭 Knowledge Backpack — 문서 수 ───────────────────────────────────

function KnowledgeBackpack({ docCount, accent: _accent }: { docCount: number; accent: string }) {
  if (!docCount) return null
  return (
    <div className="absolute" style={{ left: "5%", top: "44%", zIndex: 8 }}>
      <GardenPopover
        icon="🎒"
        title="지식 배낭"
        accent="#fbbf24"
        side="right"
        align="center"
        stats={[
          { label: "저장된 문서", value: `${docCount}개`, color: "#fde68a" },
        ]}
        description="업로드한 문서들이 배낭 속에 담겨 있어요. 니온이 이 지식을 활용해 더 똑똑하게 답변해 드립니다."
      >
        <div
          className="flex flex-col items-center gap-1 cursor-pointer hover:scale-110 transition-transform"
          style={{ animation: "gdn-float 4s ease-in-out infinite" }}
        >
          <svg width="40" height="46" viewBox="0 0 40 46" style={{ overflow: "visible" }}>
            <path d="M14,4 C14,0 26,0 26,4" fill="none" stroke="#fbbf24" strokeWidth="2" opacity="0.55" />
            <rect x="4" y="8" width="32" height="30" rx="6" fill="#fbbf24" opacity="0.15" />
            <rect x="5" y="9" width="30" height="28" rx="5" fill="none" stroke="#fbbf24" strokeWidth="1.2" opacity="0.5" />
            <rect x="10" y="24" width="20" height="10" rx="3" fill="#fbbf24" opacity="0.1" />
            <rect x="11" y="25" width="18" height="8"  rx="2" fill="none" stroke="#fbbf24" strokeWidth="0.8" opacity="0.4" />
            <line x1="8" y1="18" x2="32" y2="18" stroke="#fde68a" strokeWidth="1" strokeOpacity="0.35" />
            <circle cx="20" cy="18" r="2.5" fill="#fbbf24" opacity="0.6" />
            <circle cx="34" cy="10" r="8" fill="#f59e0b" opacity="0.9" />
            <text x="34" y="14.5" textAnchor="middle" fontSize="9" fill="white" fontWeight="bold">{docCount}</text>
          </svg>
          <span className="text-xs font-medium" style={{ color: "#fbbf24bb" }}>지식 배낭</span>
        </div>
      </GardenPopover>
    </div>
  )
}

// ── 마법 지팡이 Magic Wand — 스킬 수 ─────────────────────────────────────────

const GEM_COLORS = ["#f472b6", "#60a5fa", "#34d399", "#fbbf24", "#a78bfa", "#fb923c"]

function MagicWand({ skillCount, accent: _accent }: { skillCount: number; accent: string }) {
  if (!skillCount) return null
  const gems = Math.min(6, skillCount)
  return (
    <div className="absolute" style={{ right: "22%", bottom: "24%", zIndex: 8 }}>
      <GardenPopover
        icon="🪄"
        title="마법 지팡이"
        accent="#e879f9"
        side="top"
        align="center"
        stats={[
          { label: "활성 스킬", value: `${skillCount}개`, color: "#e879f9" },
          { label: "젬 장착", value: `${gems}개`, color: "#c084fc" },
        ]}
        description="활성화된 스킬이 많을수록 지팡이가 강해져요. 니온이 더 다양한 일을 도와줄 수 있어요."
      >
        <div
          className="flex flex-col items-center gap-1 cursor-pointer hover:scale-110 transition-transform"
          style={{ animation: "gdn-float 3.5s 0.5s ease-in-out infinite" }}
        >
          <svg width="28" height="90" viewBox="0 0 28 90" style={{ overflow: "visible" }}>
            <line x1="14" y1="80" x2="14" y2="28" stroke="#e2d5b0" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
            <circle cx="14" cy="24" r="6" fill="white" opacity="0.2"
              style={{ animation: "gdn-orb-pulse 2s ease-in-out infinite" }} />
            <circle cx="14" cy="24" r="4" fill="white" opacity="0.7" />
            {Array.from({ length: gems }, (_, i) => {
              const y = 32 + i * 8
              const color = GEM_COLORS[i % GEM_COLORS.length]
              return (
                <g key={i}>
                  <circle cx="14" cy={y} r="3.5" fill={color} opacity="0.85"
                    style={{ animation: `gdn-gem-sparkle ${1.6 + i * 0.3}s ${i * 0.35}s ease-in-out infinite` }} />
                  <circle cx="13" cy={y - 1} r="1.2" fill="white" opacity="0.4" />
                </g>
              )
            })}
            {[[8, 10], [20, 10], [6, 18], [22, 18]].map(([x2, y2], i) => (
              <line key={i} x1="14" y1="24" x2={x2} y2={y2}
                stroke="white" strokeWidth="0.8" strokeOpacity="0.35"
                style={{ animation: `gdn-twinkle ${1.2 + i * 0.4}s ${i * 0.3}s ease-in-out infinite alternate` }} />
            ))}
          </svg>
          <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>마법 지팡이</span>
        </div>
      </GardenPopover>
    </div>
  )
}

// ── 에너지 충전기 Energy Charger — 토큰 사용량 ───────────────────────────────

function EnergyCharger({ tokenUsagePct, accent: _accent }: { tokenUsagePct: number; accent: string }) {
  const fillColor = tokenUsagePct >= 80 ? "#f87171"
    : tokenUsagePct >= 60 ? "#fb923c"
    : tokenUsagePct >= 40 ? "#fbbf24"
    : "#34d399"
  const isHot = tokenUsagePct >= 60
  const statusLabel = tokenUsagePct >= 80 ? "🔴 과부하" : tokenUsagePct >= 60 ? "🟠 높음" : tokenUsagePct >= 40 ? "🟡 보통" : "🟢 여유"
  return (
    <div className="absolute" style={{ right: "4%", bottom: "8%", zIndex: 8 }}>
      <GardenPopover
        icon="🔋"
        title="에너지 충전기"
        accent={fillColor}
        side="top"
        align="end"
        stats={[
          { label: "토큰 사용량", value: `${Math.round(tokenUsagePct)}%`, color: fillColor },
          { label: "상태", value: statusLabel },
        ]}
        description="이번 달 AI 에너지(토큰) 사용량이에요. 사용량이 높으면 니온이 피로해질 수 있어요. 80% 이상이면 쉬게 해주세요."
      >
        <div className="flex flex-col items-center gap-1 cursor-pointer hover:scale-110 transition-transform">
          <svg width="32" height="68" viewBox="0 0 32 68" style={{ overflow: "visible" }}>
            <rect x="10" y="0" width="12" height="6" rx="2" fill="#9ca3af" opacity="0.5" />
            <line x1="12" y1="6" x2="12" y2="10" stroke="#9ca3af" strokeWidth="1.5" opacity="0.4" />
            <line x1="20" y1="6" x2="20" y2="10" stroke="#9ca3af" strokeWidth="1.5" opacity="0.4" />
            <rect x="4" y="10" width="24" height="54" rx="4" fill="rgba(255,255,255,0.06)" />
            <rect x="5" y="11" width="22" height="52" rx="3" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
            <rect x="6" y={12 + 50 * (1 - tokenUsagePct / 100)}
              width="20" height={50 * tokenUsagePct / 100} rx="2"
              fill={fillColor} opacity="0.75"
              style={{ animation: `gdn-charger-pulse 2s ease-in-out infinite` }} />
            <text x="16" y="40" textAnchor="middle" fontSize="9" fill="white" fontWeight="bold" opacity="0.85">
              {Math.round(tokenUsagePct)}%
            </text>
            {isHot && (
              <>
                <text x="30" y="20" fontSize="10" opacity="0.6" style={{ animation: "gdn-float 1.5s ease-in-out infinite" }}>🔥</text>
                <text x="-4" y="35" fontSize="10" opacity="0.55">🪭</text>
              </>
            )}
          </svg>
          <span className="text-xs font-medium" style={{ color: `${fillColor}cc` }}>에너지</span>
        </div>
      </GardenPopover>
    </div>
  )
}

// ── 정찰용 별 Scout Star — 웹검색 ────────────────────────────────────────────

function ScoutStar({ accent: _accent }: { accent: string }) {
  return (
    <div className="absolute" style={{ left: "46%", top: "6%", zIndex: 7 }}>
      <GardenPopover
        icon="⭐"
        title="정찰용 별"
        accent="#fde68a"
        side="bottom"
        align="center"
        stats={[
          { label: "상태", value: "🟢 활성", color: "#34d399" },
        ]}
        description="웹 검색 기능의 상징이에요. 니온이 인터넷을 탐색하며 최신 정보를 가져옵니다. 별이 높이 날수록 더 넓게 탐색해요."
      >
        <div className="cursor-pointer hover:scale-110 transition-transform">
          <div style={{ animation: "gdn-scout-fly 5s ease-in-out infinite" }}>
            <svg width="24" height="24" viewBox="-12 -12 24 24" style={{ overflow: "visible" }}>
              <polygon points={starPolygon(0, 0, 9, 5)} fill="#fde68a" opacity="0.88" />
              <circle cx="0" cy="0" r="3" fill="white" opacity="0.6" />
              <line x1="0" y1="9" x2="0" y2="22" stroke="#fde68a" strokeWidth="1.5"
                strokeOpacity="0.3" strokeLinecap="round"
                style={{ animation: "gdn-charger-pulse 5s ease-in-out infinite" }} />
            </svg>
          </div>
          <div className="text-center mt-1">
            <span className="text-[11px] font-medium" style={{ color: "#fde68a88" }}>정찰 별</span>
          </div>
        </div>
      </GardenPopover>
    </div>
  )
}

// ── 은하수 길 Galaxy Path — 연동 서비스 수 ───────────────────────────────────

function GalaxyPath({ integrationCount, accent: _accent }: { integrationCount: number; accent: string }) {
  if (!integrationCount) return null
  const brightness = Math.min(integrationCount / 5, 1)
  return (
    <div className="absolute bottom-0 left-0 right-0" style={{ zIndex: 4 }}>
      <svg viewBox="0 0 1200 32" preserveAspectRatio="none" width="100%" height="32">
        <defs>
          <linearGradient id="gdn-galaxy" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#312e81" stopOpacity="0" />
            <stop offset="20%"  stopColor="#4f46e5" stopOpacity={0.4 * brightness} />
            <stop offset="50%"  stopColor="#818cf8" stopOpacity={0.7 * brightness} />
            <stop offset="80%"  stopColor="#4f46e5" stopOpacity={0.4 * brightness} />
            <stop offset="100%" stopColor="#312e81" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="0" y="8" width="1200" height="14" fill="url(#gdn-galaxy)"
          style={{ animation: "gdn-galaxy-shimmer 3s ease-in-out infinite" }} />
        {Array.from({ length: Math.min(integrationCount * 4, 20) }, (_, i) => (
          <circle key={i} cx={60 + i * 56} cy={15} r={1.4}
            fill="white" opacity={0.3 + (i % 3) * 0.2}
            style={{ animation: `gdn-twinkle ${1.5 + (i % 4) * 0.4}s ${i * 0.25}s ease-in-out infinite alternate` }} />
        ))}
        <text x="600" y="12" textAnchor="middle" fontSize="8" fill="white" opacity={0.30 * brightness} letterSpacing="3">
          은하수 길 · {integrationCount}개 연동
        </text>
      </svg>
      {/* Clickable info button */}
      <div className="absolute right-4 bottom-1" style={{ zIndex: 10 }}>
        <GardenPopover
          icon="🌌"
          title="은하수 길"
          accent="#818cf8"
          side="top"
          align="end"
          stats={[
            { label: "연동 서비스", value: `${integrationCount}개`, color: "#818cf8" },
            { label: "은하 밝기", value: `${Math.round(brightness * 100)}%`, color: "#a5b4fc" },
          ]}
          description="연동된 AI 서비스가 많을수록 은하수가 더 밝게 빛나요. 설정에서 API 키를 추가하면 은하가 넓어집니다."
        >
          <button
            className="text-[11px] font-medium px-2 py-0.5 rounded-full cursor-pointer hover:opacity-80 transition-opacity"
            style={{
              background: "rgba(79,70,229,0.25)",
              border: "1px solid rgba(129,140,248,0.4)",
              color: `rgba(165,180,252,${0.5 + brightness * 0.5})`,
            }}
          >
            🌌 {integrationCount}개 연동
          </button>
        </GardenPopover>
      </div>
    </div>
  )
}

// ── Ground hills ──────────────────────────────────────────────────────────────

function GroundHills({ accent }: { accent: string }) {
  return (
    <div className="absolute bottom-0 left-0 right-0 pointer-events-none" style={{ zIndex: 5 }}>
      <svg viewBox="0 0 1200 130" preserveAspectRatio="none" width="100%" height="130">
        <defs>
          <linearGradient id="gdn-hill1" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor={accent} stopOpacity="0.14" />
            <stop offset="100%" stopColor="#050514"  stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id="gdn-hill2" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor={accent} stopOpacity="0.07" />
            <stop offset="100%" stopColor="#050514"  stopOpacity="0.6" />
          </linearGradient>
        </defs>
        <path d="M0,78 C180,16 380,68 580,30 C780,-4 1000,48 1200,26 L1200,130 L0,130 Z" fill="url(#gdn-hill1)" />
        <path d="M0,98 C140,68 340,105 560,74 C780,46 980,88 1200,64 L1200,130 L0,130 Z" fill="url(#gdn-hill2)" />
        <line x1="0" y1="64" x2="1200" y2="64" stroke={accent} strokeWidth="0.6" strokeOpacity="0.15" />
      </svg>
    </div>
  )
}

// ── Budget popup (별자리 예산 리포트) ─────────────────────────────────────────

function BudgetPopup({ data, onClose, accent }: {
  data: GardenData; onClose: () => void; accent: string
}) {
  const { totalBudget, totalSpent, budgetRemaining, savingsRate, budgetItems } = data
  const isOver = budgetRemaining < 0
  const pct = totalBudget > 0 ? Math.min(100, (totalSpent / totalBudget) * 100) : 0

  const maxSpent = Math.max(...budgetItems.map(b => b.spent), 1)
  const starPositions = budgetItems.slice(0, 6).map((b, i) => {
    const angle = (i / Math.max(budgetItems.slice(0, 6).length, 1)) * Math.PI * 2 - Math.PI / 2
    const r = 52
    return {
      x: 90 + r * Math.cos(angle),
      y: 70 + r * Math.sin(angle),
      size: 5 + (b.spent / maxSpent) * 10,
      color: b.percent >= 100 ? "#f87171" : b.percent >= 80 ? "#fbbf24" : "#60a5fa",
      label: b.category.length > 4 ? b.category.slice(0, 4) + "…" : b.category,
      pct: b.percent,
    }
  })

  return (
    <div className="absolute inset-0 flex items-center justify-center"
      style={{ zIndex: 50, background: "rgba(5,5,20,0.55)", backdropFilter: "blur(2px)" }}
      onClick={onClose}>
      <div className="relative rounded-2xl p-6 shadow-2xl"
        style={{
          background: "rgba(10,14,42,0.94)",
          border: `1px solid ${accent}44`,
          minWidth: 300,
          animation: "gdn-rise 0.28s ease-out",
          backdropFilter: "blur(12px)",
        }}
        onClick={e => e.stopPropagation()}>
        <button onClick={onClose}
          className="absolute right-3 top-3 transition-opacity opacity-40 hover:opacity-80 text-white">
          <X size={15} />
        </button>

        <div className="text-center mb-3">
          <div className="text-2xl font-bold" style={{ color: isOver ? "#f87171" : accent }}>
            {isOver ? "+" : ""}{shortKRW(Math.abs(budgetRemaining))}원
          </div>
          <div className="text-xs mt-0.5" style={{ color: isOver ? "#fca5a5" : "#c4b5fd" }}>
            {isOver ? "예산 초과" : "예산 잔여"}
          </div>
        </div>

        {/* 별자리 예산 차트 */}
        {starPositions.length > 0 && (
          <div className="mb-3">
            <div className="text-[9px] text-center tracking-widest mb-1" style={{ color: "rgba(255,255,255,0.3)" }}>
              ✦ BUDGET CONSTELLATION ✦
            </div>
            <svg width="180" height="140" viewBox="0 0 180 140" className="mx-auto" style={{ overflow: "visible" }}>
              {starPositions.map((s, i) => {
                const next = starPositions[(i + 1) % starPositions.length]
                return (
                  <line key={i} x1={s.x} y1={s.y} x2={next.x} y2={next.y}
                    stroke={accent} strokeWidth="0.5" strokeOpacity="0.2" />
                )
              })}
              <circle cx="90" cy="70" r="4" fill={accent} opacity="0.3" />
              {starPositions.map((s, i) => (
                <line key={`hub-${i}`} x1="90" y1="70" x2={s.x} y2={s.y}
                  stroke={accent} strokeWidth="0.3" strokeOpacity="0.1" />
              ))}
              {starPositions.map((s, i) => (
                <g key={i}>
                  <circle cx={s.x} cy={s.y} r={s.size * 1.8} fill={s.color} opacity="0.08" />
                  <polygon points={starPolygon(s.x, s.y, s.size, 5)} fill={s.color} opacity="0.88"
                    style={{ animation: `gdn-twinkle ${1.5 + i * 0.3}s ${i * 0.4}s ease-in-out infinite alternate` }} />
                  <text x={s.x} y={s.y + s.size + 10} textAnchor="middle" fontSize="8" fill="white" opacity="0.60">
                    {s.label}
                  </text>
                  <text x={s.x} y={s.y + s.size + 20} textAnchor="middle" fontSize="7.5" fill={s.color} opacity="0.75">
                    {s.pct.toFixed(0)}%
                  </text>
                </g>
              ))}
            </svg>
          </div>
        )}

        <div className="space-y-2 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-white/55">총 예산</span>
            <span className="font-semibold text-white">{shortKRW(totalBudget)}원</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-white/55">총 지출</span>
            <span className={`font-semibold ${isOver ? "text-red-400" : "text-white"}`}>
              {shortKRW(totalSpent)}원
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden mt-2" style={{ background: "rgba(255,255,255,0.1)" }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${pct}%`,
                background: isOver
                  ? "linear-gradient(90deg, #f87171, #ef4444)"
                  : `linear-gradient(90deg, ${accent}, #e879f9)`,
              }} />
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-white/38">지출률 {pct.toFixed(1)}%</span>
            <span style={{ color: isOver ? "#f87171" : accent }}>절약률 {savingsRate.toFixed(1)}%</span>
          </div>
        </div>

        <div className="mt-3 rounded-xl p-2.5 text-xs text-center"
          style={{ background: `${accent}14`, color: `${accent}cc` }}>
          {savingsRate >= 60 ? "🌟 나무가 무럭무럭 자라고 있어요!"
            : savingsRate >= 30 ? "🌿 나무가 조금 더 자랄 수 있어요."
            : isOver ? "🌧️ 지출 폭풍이 나무를 흔들고 있어요."
            : "💧 절약하면 나무에 열매가 열려요!"}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function GardenPage() {
  const [data, setData] = useState<GardenData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPopup, setShowPopup] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)

    const [budgetRes, goalsRes, diaryRes, summaryRes, ddayRes,
           imagesRes, audiosRes, docsRes, skillsRes, usageRes, personaRes, providersRes] =
      await Promise.allSettled([
        fetch("/api/budget"),
        fetch("/api/goals"),
        fetch("/api/diary?limit=7"),
        fetch("/api/finance/summary"),
        fetch("/api/dday"),
        // Phase 2
        fetch("/api/images?limit=50"),
        fetch("/api/audios?limit=50"),
        fetch("/api/documents"),
        fetch("/api/skills"),
        fetch("/api/usage?days=30&limit=1"),
        fetch("/api/profile/persona"),
        fetch("/api/settings/providers"),
      ])

    async function json<T>(r: PromiseSettledResult<Response>): Promise<T | null> {
      if (r.status === "fulfilled" && r.value.ok) {
        try { return await r.value.json() } catch { return null }
      }
      return null
    }

    const budgetRaw   = await json<BudgetItem[] | { budgets?: BudgetItem[] }>(budgetRes)
    const goalsRaw    = await json<Goal[] | { goals?: Goal[] }>(goalsRes)
    const diaryRaw    = await json<{ entries?: Array<{ mood: string }> }>(diaryRes)
    const summaryRaw  = await json<{ income: number; savings_rate?: number }>(summaryRes)
    const ddayRaw     = await json<DDay[] | { ddays?: DDay[] }>(ddayRes)
    const imagesRaw   = await json<unknown[] | { images?: unknown[] }>(imagesRes)
    const audiosRaw   = await json<unknown[] | { audios?: unknown[] }>(audiosRes)
    const docsRaw     = await json<unknown[] | { documents?: unknown[] }>(docsRes)
    const skillsRaw   = await json<Array<{ is_enabled?: boolean }> | { skills?: Array<{ is_enabled?: boolean }> }>(skillsRes)
    const usageRaw    = await json<{ total_tokens?: number; summary?: { total_tokens?: number }; items?: unknown[] }>(usageRes)
    const personaRaw  = await json<{ persona?: string }>(personaRes)
    const providersRaw = await json<{ providers?: Array<{ hasKey?: boolean; baseUrl?: string; provider?: string }> }>(providersRes)

    const budgets: BudgetItem[] = Array.isArray(budgetRaw)
      ? budgetRaw
      : (budgetRaw as { budgets?: BudgetItem[] })?.budgets ?? []

    const goals: Goal[] = Array.isArray(goalsRaw)
      ? goalsRaw
      : (goalsRaw as { goals?: Goal[] })?.goals ?? []

    const diaryEntries = diaryRaw?.entries ?? []
    const mood = diaryEntries[0]?.mood ?? "보통"
    const diaryMoods = diaryEntries.map(e => e.mood)
    const income = summaryRaw?.income ?? 0

    const totalBudget = budgets.reduce((s, b) => s + b.budget, 0)
    const totalSpent  = budgets.reduce((s, b) => s + b.spent, 0)
    const budgetRemaining = totalBudget - totalSpent
    const savingsRate = totalBudget > 0
      ? Math.max(0, Math.min(100, (budgetRemaining / totalBudget) * 100))
      : Math.max(0, Math.min(100, summaryRaw?.savings_rate ?? 50))
    const overCategories = budgets.filter(b => b.percent >= 100).map(b => b.category)

    const ddays: DDay[] = Array.isArray(ddayRaw)
      ? ddayRaw
      : (ddayRaw as { ddays?: DDay[] })?.ddays ?? []
    const meteorCount = ddays.filter(d => d.dday_value >= 0 && d.dday_value <= 7).length

    // Phase 2 data
    const imageList = Array.isArray(imagesRaw) ? imagesRaw : (imagesRaw as { images?: unknown[] })?.images ?? []
    const audioList = Array.isArray(audiosRaw) ? audiosRaw : (audiosRaw as { audios?: unknown[] })?.audios ?? []
    const docList   = Array.isArray(docsRaw)   ? docsRaw   : (docsRaw   as { documents?: unknown[] })?.documents ?? []
    const skillList = Array.isArray(skillsRaw) ? skillsRaw : (skillsRaw as { skills?: Array<{ is_enabled?: boolean }> })?.skills ?? []

    const imageCount = imageList.length
    const audioCount = audioList.length
    const docCount   = docList.length
    const skillCount = skillList.filter((s) => s.is_enabled !== false).length

    const rawTokens = usageRaw?.total_tokens ?? usageRaw?.summary?.total_tokens ?? 0
    const tokenUsagePct = Math.min(100, (rawTokens / 500_000) * 100)

    const activePersona = personaRaw?.persona ?? "assistant"

    const providerList = providersRaw?.providers ?? []
    const integrationCount = providerList.filter(p =>
      p.provider === "custom" ? !!p.baseUrl : !!p.hasKey
    ).length

    setData({
      mood, savingsRate, totalBudget, totalSpent, budgetRemaining,
      overBudgetCategories: overCategories,
      isRaining: overCategories.length > 0,
      goals: goals.slice(0, 4),
      income, meteorCount, diaryMoods,
      ddays, budgetItems: budgets,
      docCount, audioCount, imageCount, skillCount,
      tokenUsagePct, activePersona, integrationCount,
    })
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const palette = getPalette(data?.mood ?? "보통")

  return (
    <div className="relative w-full overflow-hidden select-none"
      style={{ height: "calc(100vh - 3.5rem)" }}>
      <style>{GARDEN_STYLES}</style>

      {/* Sky */}
      <div className="absolute inset-0 transition-all duration-1000"
        style={{
          background: `
            radial-gradient(ellipse at 50% -5%, ${palette.to}bb 0%, transparent 58%),
            radial-gradient(ellipse at 20% 50%, ${palette.nebula}22 0%, transparent 45%),
            radial-gradient(ellipse at 80% 40%, ${palette.nebula}18 0%, transparent 40%),
            linear-gradient(180deg, ${palette.from} 0%, ${palette.from}ee 100%)
          `,
        }} />

      {/* Background stars */}
      <StarField />

      {/* 골드 스타 더스트 */}
      {data && <GoldStarDust income={data.income} />}

      {/* 수입 별 (하늘 산포) */}
      {data && <IncomeStars income={data.income} />}

      {/* 유성 (임박 일정) */}
      {data && <Meteors count={data.meteorCount} />}

      {/* 정찰용 별 */}
      <ScoutStar accent={palette.accent} />

      {/* 풍경 Wind Bell */}
      {data && <WindBell audioCount={data.audioCount} accent={palette.accent} />}

      {/* 지식 배낭 */}
      {data && <KnowledgeBackpack docCount={data.docCount} accent={palette.accent} />}

      {/* Ground hills */}
      <GroundHills accent={palette.accent} />

      {/* 은하수 길 */}
      {data && <GalaxyPath integrationCount={data.integrationCount} accent={palette.accent} />}

      {/* 지출 구름 */}
      {data && (
        <SpendingCloud
          isRaining={data.isRaining}
          categories={data.overBudgetCategories}
          accent={palette.accent}
        />
      )}

      {/* 목표 꽃 */}
      {data && <GoalFlowers goals={data.goals} accent={palette.accent} />}

      {/* 마법 호수 */}
      {data && <MagicLake imageCount={data.imageCount} accent={palette.accent} />}

      {/* 감정 씨앗 */}
      {data && <EmotionSeeds diaryMoods={data.diaryMoods} accent={palette.accent} />}

      {/* 마법 지팡이 */}
      {data && <MagicWand skillCount={data.skillCount} accent={palette.accent} />}

      {/* 에너지 충전기 */}
      {data && <EnergyCharger tokenUsagePct={data.tokenUsagePct} accent={palette.accent} />}

      {/* 타임 캡슐 */}
      {data && <TimeCapsule ddays={data.ddays} accent={palette.accent} />}

      {/* 자산의 나무 */}
      {data && (
        <AssetTree
          savingsRate={data.savingsRate}
          accent={palette.accent}
          isRaining={data.isRaining}
          onClick={() => setShowPopup(true)}
          activePersona={data.activePersona}
        />
      )}

      {/* 예산 팝업 */}
      {showPopup && data && (
        <BudgetPopup data={data} onClose={() => setShowPopup(false)} accent={palette.accent} />
      )}

      {/* Loading */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 60 }}>
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="size-8 animate-spin" style={{ color: palette.accent }} />
            <span className="text-sm" style={{ color: `${palette.accent}88` }}>가든 불러오는 중…</span>
          </div>
        </div>
      )}

      {/* Header controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2" style={{ zIndex: 20 }}>
        {data && (
          <div className="rounded-full px-3 py-1.5 text-xs font-medium"
            style={{
              background: "rgba(8,10,32,0.65)",
              border: `1px solid ${palette.accent}44`,
              color: palette.accent,
              backdropFilter: "blur(8px)",
            }}>
            {data.mood} · {data.savingsRate.toFixed(0)}% 절약
          </div>
        )}
        <Button variant="ghost" size="icon"
          className="size-8 rounded-full text-white/40 hover:text-white/80 hover:bg-white/10"
          style={{ border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(8px)" }}
          onClick={load} disabled={loading}>
          {loading
            ? <Loader2 className="size-3.5 animate-spin" />
            : <RefreshCw className="size-3.5" />}
        </Button>
      </div>

      {/* Page title */}
      <div className="absolute top-4 left-4" style={{ zIndex: 20 }}>
        <span className="text-xs font-semibold tracking-widest uppercase"
          style={{ color: `${palette.accent}99` }}>
          🌱 Emotional Data Garden
        </span>
      </div>

      {/* Bottom legend */}
      {data && !showPopup && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-3 text-xs flex-wrap justify-center"
          style={{ zIndex: 20, color: "rgba(255,255,255,0.40)", maxWidth: "90%" }}>
          {data.goals.length > 0 && <span>🌸 목표 꽃</span>}
          <span className="cursor-pointer hover:opacity-70 transition-opacity font-medium"
            style={{ color: `${palette.accent}aa` }}
            onClick={() => setShowPopup(true)}>
            ✦ 자산의 나무 (터치)
          </span>
          {data.isRaining && <span>☁️ 지출 구름</span>}
          {data.meteorCount > 0 && <span>☄️ 임박 일정</span>}
          {data.diaryMoods.length > 0 && <span>🌱 감정 씨앗</span>}
          {data.ddays.filter(d => d.dday_value >= 0).length > 0 && <span>💊 타임 캡슐</span>}
          {data.imageCount > 0 && <span>🌊 마법 호수</span>}
          {data.audioCount > 0 && <span>🔔 풍경</span>}
          {data.docCount > 0 && <span>🎒 지식 배낭</span>}
          {data.skillCount > 0 && <span>🪄 마법 지팡이</span>}
          {data.integrationCount > 0 && <span>🌌 은하수 길</span>}
          <span>⭐ 정찰 별</span>
          <span>⚡ 에너지</span>
        </div>
      )}
    </div>
  )
}
