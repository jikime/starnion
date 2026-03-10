"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, RefreshCw, X } from "lucide-react"
import { Button } from "@/components/ui/button"

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
  incomeStars: number
  meteorCount: number
}

// ── Sky palettes ──────────────────────────────────────────────────────────────

const PALETTES = {
  매우좋음: { from: "#0a1628", to: "#1a4a8a", accent: "#60a5fa", nebula: "#3b82f6" },
  좋음:    { from: "#0f1b3d", to: "#1e3a6b", accent: "#818cf8", nebula: "#6366f1" },
  보통:    { from: "#0f1230", to: "#2d1b69", accent: "#a78bfa", nebula: "#7c3aed" },
  나쁨:    { from: "#080820", to: "#1a0f3c", accent: "#7c3aed", nebula: "#5b21b6" },
  매우나쁨: { from: "#050514", to: "#0a0820", accent: "#5b21b6", nebula: "#4c1d95" },
} as const

type MoodKey = keyof typeof PALETTES

function getPalette(mood: string) {
  return PALETTES[(mood as MoodKey)] ?? PALETTES["보통"]
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

function shortKRW(n: number) {
  if (Math.abs(n) >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 10_000)}만`
  return n.toLocaleString("ko-KR")
}

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
`

// ── StarField ─────────────────────────────────────────────────────────────────

function StarField() {
  // Stars must only render client-side to avoid SSR/client floating-point
  // precision mismatches in CSS style serialization (hydration error).
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
        <div
          key={s.id}
          className="absolute rounded-full bg-white pointer-events-none"
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

// ── Meteors ───────────────────────────────────────────────────────────────────

function Meteors({ count }: { count: number }) {
  if (!count) return null
  return (
    <>
      {Array.from({ length: Math.min(count, 3) }, (_, i) => (
        <div
          key={i}
          className="absolute pointer-events-none"
          style={{
            width: 88, height: 2,
            top: `${8 + i * 11}%`,
            left: `${8 + i * 18}%`,
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.9) 40%, rgba(200,220,255,0.5) 70%, transparent)",
            transform: "rotate(35deg)",
            animation: `gdn-meteor 4.5s ${i * 2.4}s ease-in infinite`,
          }}
        />
      ))}
    </>
  )
}

// ── Asset Tree ────────────────────────────────────────────────────────────────

function AssetTree({
  savingsRate, incomeStars, accent, onClick,
}: {
  savingsRate: number
  incomeStars: number
  accent: string
  onClick: () => void
}) {
  const scale = 0.5 + Math.min(savingsRate, 100) / 100 * 0.58
  const alpha = Math.max(0.38, Math.min(1, savingsRate / 85))

  const fruitPositions = [
    [200, 76], [148, 110], [260, 96], [174, 150], [232, 136],
  ].slice(0, Math.max(0, incomeStars)) as [number, number][]

  const branches = [
    { d: "M200,272 C178,232 116,192 92,136 C74,94 106,66 154,80", delay: "0s" },
    { d: "M200,272 C222,232 284,192 308,138 C326,96 294,68 246,82", delay: "0.9s" },
    { d: "M200,272 C200,232 186,172 194,108 C198,68 216,50 200,38", delay: "1.8s" },
    { d: "M200,272 C164,262 130,246 106,218 C82,192 78,158 97,140", delay: "2.7s" },
    { d: "M200,272 C236,262 270,246 294,218 C318,192 322,158 303,140", delay: "3.6s" },
  ]

  const sparkles = [
    [150, 170], [252, 172], [200, 116], [120, 188], [280, 190], [178, 132], [224, 128],
  ] as [number, number][]

  return (
    <div
      onClick={onClick}
      className="absolute cursor-pointer select-none"
      style={{
        left: "50%", bottom: "13%",
        transform: "translateX(-50%)",
        zIndex: 10,
        filter: "drop-shadow(0 0 32px " + accent + "55)",
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
            <stop offset="0%" stopColor={accent} stopOpacity="0.95" />
            <stop offset="50%" stopColor="#c4b5fd" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#e879f9" stopOpacity="0.25" />
          </linearGradient>
          <radialGradient id="gdn-orb" cx="50%" cy="38%" r="62%">
            <stop offset="0%" stopColor="white" stopOpacity="0.95" />
            <stop offset="30%" stopColor={accent} stopOpacity="0.88" />
            <stop offset="70%" stopColor={accent} stopOpacity="0.3" />
            <stop offset="100%" stopColor={accent} stopOpacity="0.04" />
          </radialGradient>
        </defs>

        <g
          transform={`translate(200,280) scale(${scale}) translate(-200,-280)`}
          style={{ opacity: alpha }}
        >
          {/* Wide aura glow */}
          <ellipse cx="200" cy="190" rx="92" ry="115" fill={accent} opacity="0.055" />
          <ellipse cx="200" cy="190" rx="60" ry="78" fill={accent} opacity="0.06" />

          {/* Branch shadow halos */}
          {branches.map(({ d }, i) => (
            <path key={`halo-${i}`} d={d} fill="none" stroke={accent}
              strokeWidth={i < 3 ? 14 : 11} strokeOpacity="0.07" strokeLinecap="round" />
          ))}
          {branches.map(({ d }, i) => (
            <path key={`mid-${i}`} d={d} fill="none" stroke={accent}
              strokeWidth={i < 3 ? 7 : 5} strokeOpacity="0.13" strokeLinecap="round" />
          ))}

          {/* Animated energy flows */}
          {branches.map(({ d, delay }, i) => (
            <path
              key={`flow-${i}`}
              d={d}
              fill="none"
              stroke="url(#gdn-branch)"
              strokeWidth={i < 3 ? 2.8 : 2.2}
              strokeLinecap="round"
              filter="url(#gdn-glow-md)"
              style={{
                strokeDasharray: 700,
                animation: `gdn-flow 5.2s ${delay} ease-in-out infinite`,
              }}
            />
          ))}

          {/* Branch tip glows */}
          {[
            [154, 80], [246, 82], [200, 38], [97, 140], [303, 140],
          ].map(([cx, cy], i) => (
            <circle key={`tip-${i}`} cx={cx} cy={cy} r={5} fill={accent}
              filter="url(#gdn-glow-sm)" opacity={0.7}
              style={{ animation: `gdn-twinkle ${2 + i * 0.4}s ${i * 0.7}s ease-in-out infinite alternate` }} />
          ))}

          {/* Sparkles along branches */}
          {sparkles.map(([cx, cy], i) => (
            <circle key={`sp-${i}`} cx={cx} cy={cy} r={2.0} fill="white"
              style={{ animation: `gdn-twinkle ${1.4 + (i % 4) * 0.5}s ${i * 0.55}s ease-in-out infinite alternate` }} />
          ))}

          {/* Star fruits (income) */}
          {fruitPositions.map(([px, py], i) => (
            <g key={`fruit-${i}`} filter="url(#gdn-glow-sm)">
              <polygon
                points={starPolygon(px, py, 9.5, 5)}
                fill="#fbbf24"
                style={{ animation: `gdn-float ${2.4 + i * 0.35}s ${i * 0.55}s ease-in-out infinite` }}
              />
              {/* Star outer glow */}
              <polygon
                points={starPolygon(px, py, 13, 5)}
                fill="#fbbf24"
                opacity="0.2"
              />
            </g>
          ))}

          {/* Central orb — outer glow ring */}
          <circle cx="200" cy="258" r="48" fill={accent} opacity="0.1" filter="url(#gdn-glow-lg)" />
          <circle cx="200" cy="258" r="38" fill={accent} opacity="0.15" />

          {/* Central orb — body */}
          <circle cx="200" cy="258" r="30" fill="url(#gdn-orb)" filter="url(#gdn-glow-lg)"
            style={{ animation: "gdn-orb-pulse 3.5s ease-in-out infinite" }} />

          {/* Orb rings */}
          <circle cx="200" cy="258" r="22" fill="none" stroke={accent} strokeWidth="1.2" strokeOpacity="0.55" />
          <circle cx="200" cy="258" r="15" fill="none" stroke="white" strokeWidth="0.7" strokeOpacity="0.28" />

          {/* ₩ symbol */}
          <text x="200" y="264" textAnchor="middle" fontSize="16" fontWeight="bold"
            fill="white" opacity="0.95" style={{ fontFamily: "system-ui, sans-serif" }}>₩</text>
        </g>
      </svg>
    </div>
  )
}

// ── Spending Cloud ─────────────────────────────────────────────────────────────

function SpendingCloud({ isRaining, categories }: {
  isRaining: boolean
  categories: string[]
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
      <svg viewBox="0 0 180 130" width="180" height="130" style={{ overflow: "visible" }}>
        <defs>
          <filter id="gdn-cloud-glow" x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4.5" result="b" />
            <feComposite in="b" in2="SourceGraphic" operator="over" />
          </filter>
          <radialGradient id="gdn-cloud-fill" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#6b80b8" stopOpacity="0.92" />
            <stop offset="100%" stopColor="#3a4a7a" stopOpacity="0.75" />
          </radialGradient>
        </defs>

        {/* Cloud shadow */}
        <ellipse cx="90" cy="62" rx="72" ry="36" fill="#2a3a6a" opacity="0.4" />

        {/* Cloud body layers */}
        <ellipse cx="90" cy="58" rx="65" ry="32" fill="url(#gdn-cloud-fill)" filter="url(#gdn-cloud-glow)" />
        <ellipse cx="62" cy="50" rx="42" ry="26" fill="#5a70a8" opacity="0.88" filter="url(#gdn-cloud-glow)" />
        <ellipse cx="118" cy="48" rx="36" ry="24" fill="#5a70a8" opacity="0.88" filter="url(#gdn-cloud-glow)" />
        <ellipse cx="88" cy="40" rx="30" ry="24" fill="#6b80c0" opacity="0.95" filter="url(#gdn-cloud-glow)" />

        {/* Highlight shimmer */}
        <ellipse cx="75" cy="33" rx="18" ry="10" fill="white" opacity="0.08" />

        {/* Cloud label */}
        <text x="90" y="56" textAnchor="middle" fontSize="10.5" fill="white" opacity="0.88" fontWeight="600">지출 구름</text>

        {/* Rain drops */}
        {isRaining && drops.map(d => (
          <line key={d.id}
            x1={d.x} y1={72} x2={d.x - 5} y2={90}
            stroke="#93c5fd" strokeWidth="1.8" strokeLinecap="round"
            style={{ animation: `gdn-rain ${d.dur}s ${d.delay}s ease-in infinite`, opacity: 0 }}
          />
        ))}

        {/* Spending Storm label */}
        {isRaining && (
          <text x="90" y="112" textAnchor="middle" fontSize="8.5" fill="#93c5fd" opacity="0.7"
            fontStyle="italic">Spending Storm</text>
        )}
      </svg>

      {/* Over-budget category badges */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1 justify-center mt-0.5 max-w-[180px]">
          {categories.slice(0, 3).map(c => (
            <span key={c} className="text-[10px] px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(239,68,68,0.2)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.3)" }}>
              {c}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Goal Flower ───────────────────────────────────────────────────────────────

const FLOWER_COLORS = [
  { petal: "#7c3aed", inner: "#c4b5fd", center: "#fbbf24" },
  { petal: "#6366f1", inner: "#a5b4fc", center: "#fde68a" },
  { petal: "#8b5cf6", inner: "#ddd6fe", center: "#fbbf24" },
  { petal: "#a855f7", inner: "#e9d5ff", center: "#fef08a" },
]

function FlowerSVG({ goal, index }: { goal: Goal; index: number }) {
  const stage = goal.progress >= 76 ? 3 : goal.progress >= 51 ? 2 : goal.progress >= 26 ? 1 : 0
  const col = FLOWER_COLORS[index % FLOWER_COLORS.length]
  const BY = 108  // base y (stem bottom)
  const TY = BY - 68  // top y (flower center)

  return (
    <g style={{
      transformOrigin: `0px ${BY}px`,
      animation: stage >= 1 ? `gdn-sway ${3.2 + index * 0.5}s ${index * 0.9}s ease-in-out infinite` : undefined,
    }}>
      <defs>
        <filter id={`gdn-fl-glow-${index}`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b" />
          <feComposite in="b" in2="SourceGraphic" operator="over" />
        </filter>
        <radialGradient id={`gdn-petal-${index}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={col.inner} stopOpacity="0.95" />
          <stop offset="100%" stopColor={col.petal} stopOpacity="0.7" />
        </radialGradient>
      </defs>

      {/* Stem */}
      {stage >= 1 && (
        <line x1="0" y1={BY} x2="0" y2={TY + 5}
          stroke="#4ade80" strokeWidth="2.2" strokeLinecap="round" opacity="0.8" />
      )}

      {/* Leaves */}
      {stage >= 2 && <>
        <path d={`M0,${TY + 38} C-17,${TY + 26} -22,${TY + 14} -11,${TY + 8}`}
          fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" opacity="0.72" />
        <path d={`M0,${TY + 48} C17,${TY + 36} 22,${TY + 24} 11,${TY + 18}`}
          fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" opacity="0.72" />
      </>}

      {/* Stage 0: seed glow */}
      {stage === 0 && (
        <circle cx="0" cy={BY} r="5.5" fill={col.petal} opacity="0.8"
          filter={`url(#gdn-fl-glow-${index})`}
          style={{ animation: `gdn-twinkle 2.2s ${index * 0.5}s ease-in-out infinite alternate` }} />
      )}

      {/* Stage 1: sprout bud */}
      {stage === 1 && (
        <g filter={`url(#gdn-fl-glow-${index})`}>
          <ellipse cx="0" cy={TY - 6} rx="6" ry="14"
            fill={col.petal} opacity="0.85" />
          <ellipse cx="0" cy={TY - 6} rx="4" ry="9"
            fill={col.inner} opacity="0.5" />
        </g>
      )}

      {/* Stage 2: half bloom */}
      {stage === 2 && (
        <g filter={`url(#gdn-fl-glow-${index})`}>
          {[0, 72, 144, 216, 288].map(angle => (
            <ellipse key={angle} cx="0" cy={TY - 14}
              rx="6.5" ry="15" fill={`url(#gdn-petal-${index})`} opacity="0.82"
              transform={`rotate(${angle} 0 ${TY})`} />
          ))}
          <circle cx="0" cy={TY} r="7" fill={col.center} opacity="0.9" />
        </g>
      )}

      {/* Stage 3: full bloom */}
      {stage === 3 && (
        <g filter={`url(#gdn-fl-glow-${index})`}
          style={{ animation: `gdn-bloom 3.2s ${index * 0.5}s ease-in-out infinite` }}>
          {/* Outer petals */}
          {[0, 72, 144, 216, 288].map(angle => (
            <ellipse key={`o${angle}`} cx="0" cy={TY - 18}
              rx="9" ry="21" fill={`url(#gdn-petal-${index})`} opacity="0.78"
              transform={`rotate(${angle} 0 ${TY})`} />
          ))}
          {/* Inner petals */}
          {[36, 108, 180, 252, 324].map(angle => (
            <ellipse key={`i${angle}`} cx="0" cy={TY - 14}
              rx="6" ry="14" fill={col.inner} opacity="0.6"
              transform={`rotate(${angle} 0 ${TY})`} />
          ))}
          {/* Center */}
          <circle cx="0" cy={TY} r="9.5" fill={col.center} opacity="0.92" />
          <polygon points={starPolygon(0, TY, 6, 5)} fill="white" opacity="0.85" />
          {/* Center glow ring */}
          <circle cx="0" cy={TY} r="13" fill={col.center} opacity="0.18" />
        </g>
      )}

      {/* Label */}
      <text x="0" y={BY + 16} textAnchor="middle" fontSize="10" fill="white" opacity="0.72">
        {goal.icon} {goal.title.length > 5 ? goal.title.slice(0, 5) + "…" : goal.title}
      </text>
      <text x="0" y={BY + 28} textAnchor="middle" fontSize="9" fill="#c4b5fd" opacity="0.62">
        {goal.progress.toFixed(0)}%
      </text>
    </g>
  )
}

function GoalFlowers({ goals }: { goals: Goal[] }) {
  const displayed = goals.slice(0, 4)
  if (!displayed.length) return null

  const spacing = 78
  const w = spacing * displayed.length + 20

  return (
    <div className="absolute pointer-events-none" style={{ left: "3%", bottom: "10%", zIndex: 9 }}>
      <svg viewBox={`-10 -20 ${w} 160`} width={w} height={160} style={{ overflow: "visible" }}>
        <text x={(w - 20) / 2} y={-6} textAnchor="middle" fontSize="10.5"
          fill="white" opacity="0.58" letterSpacing="1">목표 꽃</text>
        {displayed.map((goal, i) => (
          <g key={goal.id} transform={`translate(${22 + i * spacing}, 0)`}>
            <FlowerSVG goal={goal} index={i} />
          </g>
        ))}
      </svg>
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
            <stop offset="0%" stopColor={accent} stopOpacity="0.14" />
            <stop offset="100%" stopColor="#050514" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id="gdn-hill2" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={accent} stopOpacity="0.07" />
            <stop offset="100%" stopColor="#050514" stopOpacity="0.6" />
          </linearGradient>
        </defs>
        {/* Back hill */}
        <path d="M0,78 C180,16 380,68 580,30 C780,-4 1000,48 1200,26 L1200,130 L0,130 Z"
          fill="url(#gdn-hill1)" />
        {/* Front hill */}
        <path d="M0,98 C140,68 340,105 560,74 C780,46 980,88 1200,64 L1200,130 L0,130 Z"
          fill="url(#gdn-hill2)" />
        {/* Ground line glow */}
        <line x1="0" y1="64" x2="1200" y2="64"
          stroke={accent} strokeWidth="0.6" strokeOpacity="0.15" />
      </svg>
    </div>
  )
}

// ── Budget popup ───────────────────────────────────────────────────────────────

function BudgetPopup({ data, onClose, accent }: {
  data: GardenData
  onClose: () => void
  accent: string
}) {
  const { totalBudget, totalSpent, budgetRemaining, savingsRate } = data
  const isOver = budgetRemaining < 0
  const pct = totalBudget > 0 ? Math.min(100, (totalSpent / totalBudget) * 100) : 0

  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ zIndex: 50, background: "rgba(5,5,20,0.55)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      <div
        className="relative rounded-2xl p-6 shadow-2xl"
        style={{
          background: "rgba(10,14,42,0.94)",
          border: `1px solid ${accent}44`,
          minWidth: 270,
          animation: "gdn-rise 0.28s ease-out",
          backdropFilter: "blur(12px)",
        }}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose}
          className="absolute right-3 top-3 transition-opacity opacity-40 hover:opacity-80 text-white">
          <X size={15} />
        </button>

        {/* Title */}
        <div className="text-center mb-4">
          <div className="text-2xl font-bold" style={{ color: isOver ? "#f87171" : accent }}>
            {isOver ? "+" : ""}{shortKRW(Math.abs(budgetRemaining))}원
          </div>
          <div className="text-xs mt-0.5" style={{ color: isOver ? "#fca5a5" : "#c4b5fd" }}>
            {isOver ? "예산 초과" : "예산 잔여"}
          </div>
        </div>

        {/* Stats */}
        <div className="space-y-2.5 text-sm">
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

          {/* Progress bar */}
          <div className="h-2 rounded-full overflow-hidden mt-2" style={{ background: "rgba(255,255,255,0.1)" }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${pct}%`,
                background: isOver
                  ? "linear-gradient(90deg, #f87171, #ef4444)"
                  : `linear-gradient(90deg, ${accent}, #e879f9)`,
              }}
            />
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-white/38">지출률 {pct.toFixed(1)}%</span>
            <span style={{ color: isOver ? "#f87171" : accent }}>
              절약률 {savingsRate.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Tree health tip */}
        <div className="mt-4 rounded-xl p-3 text-xs text-center"
          style={{ background: `${accent}14`, color: `${accent}cc` }}>
          {savingsRate >= 60
            ? "🌟 나무가 무럭무럭 자라고 있어요!"
            : savingsRate >= 30
            ? "🌿 나무가 조금 더 자랄 수 있어요."
            : isOver
            ? "🌧️ 지출 폭풍이 나무를 흔들고 있어요."
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

    const [budgetRes, goalsRes, diaryRes, summaryRes, ddayRes] = await Promise.allSettled([
      fetch("/api/budget"),
      fetch("/api/goals?status=in_progress"),
      fetch("/api/diary?limit=1"),
      fetch("/api/finance/summary"),
      fetch("/api/dday"),
    ])

    async function json<T>(r: PromiseSettledResult<Response>): Promise<T | null> {
      if (r.status === "fulfilled" && r.value.ok) {
        try { return await r.value.json() } catch { return null }
      }
      return null
    }

    const budgetRaw  = await json<BudgetItem[] | { budgets?: BudgetItem[] }>(budgetRes)
    const goalsRaw   = await json<Goal[] | { goals?: Goal[] }>(goalsRes)
    const diaryRaw   = await json<{ entries?: Array<{ mood: string }> }>(diaryRes)
    const summaryRaw = await json<{ income: number; savings_rate?: number }>(summaryRes)
    const ddayRaw    = await json<DDay[]>(ddayRes)

    const budgets: BudgetItem[] = Array.isArray(budgetRaw)
      ? budgetRaw
      : (budgetRaw as { budgets?: BudgetItem[] })?.budgets ?? []

    const goals: Goal[] = Array.isArray(goalsRaw)
      ? goalsRaw
      : (goalsRaw as { goals?: Goal[] })?.goals ?? []

    const mood = diaryRaw?.entries?.[0]?.mood ?? "보통"
    const income = summaryRaw?.income ?? 0

    const totalBudget = budgets.reduce((s, b) => s + b.budget, 0)
    const totalSpent  = budgets.reduce((s, b) => s + b.spent, 0)
    const budgetRemaining = totalBudget - totalSpent

    const savingsRate = totalBudget > 0
      ? Math.max(0, Math.min(100, (budgetRemaining / totalBudget) * 100))
      : Math.max(0, Math.min(100, summaryRaw?.savings_rate ?? 50))

    const overCategories = budgets.filter(b => b.percent >= 100).map(b => b.category)
    const ddays = Array.isArray(ddayRaw) ? ddayRaw : []
    const meteorCount = ddays.filter(d => d.dday_value >= 0 && d.dday_value <= 7).length

    setData({
      mood,
      savingsRate,
      totalBudget,
      totalSpent,
      budgetRemaining,
      overBudgetCategories: overCategories,
      isRaining: overCategories.length > 0,
      goals: goals.slice(0, 4),
      incomeStars: Math.min(5, Math.max(0, Math.floor(income / 500_000))),
      meteorCount,
    })
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const palette = getPalette(data?.mood ?? "보통")

  return (
    <div
      className="relative w-full overflow-hidden select-none"
      style={{ height: "calc(100vh - 3.5rem)" }}
    >
      {/* Keyframe definitions */}
      <style>{GARDEN_STYLES}</style>

      {/* Sky — radial gradient */}
      <div
        className="absolute inset-0 transition-all duration-1000"
        style={{
          background: `
            radial-gradient(ellipse at 50% -5%, ${palette.to}bb 0%, transparent 58%),
            radial-gradient(ellipse at 20% 50%, ${palette.nebula}22 0%, transparent 45%),
            radial-gradient(ellipse at 80% 40%, ${palette.nebula}18 0%, transparent 40%),
            linear-gradient(180deg, ${palette.from} 0%, ${palette.from}ee 100%)
          `,
        }}
      />

      {/* Stars */}
      <StarField />

      {/* Meteors */}
      {data && <Meteors count={data.meteorCount} />}

      {/* Ground hills */}
      <GroundHills accent={palette.accent} />

      {/* Spending Cloud */}
      {data && (
        <SpendingCloud
          isRaining={data.isRaining}
          categories={data.overBudgetCategories}
        />
      )}

      {/* Goal Flowers */}
      {data && <GoalFlowers goals={data.goals} />}

      {/* Asset Tree */}
      {data && (
        <AssetTree
          savingsRate={data.savingsRate}
          incomeStars={data.incomeStars}
          accent={palette.accent}
          onClick={() => setShowPopup(true)}
        />
      )}

      {/* Budget popup */}
      {showPopup && data && (
        <BudgetPopup data={data} onClose={() => setShowPopup(false)} accent={palette.accent} />
      )}

      {/* Loading overlay */}
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
          <div
            className="rounded-full px-3 py-1.5 text-xs font-medium"
            style={{
              background: "rgba(8,10,32,0.65)",
              border: `1px solid ${palette.accent}44`,
              color: palette.accent,
              backdropFilter: "blur(8px)",
            }}
          >
            {data.mood} · {data.savingsRate.toFixed(0)}% 절약
          </div>
        )}
        <Button
          variant="ghost" size="icon"
          className="size-8 rounded-full text-white/40 hover:text-white/80 hover:bg-white/10"
          style={{ border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(8px)" }}
          onClick={load}
          disabled={loading}
        >
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
        <div
          className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-5 text-[11px]"
          style={{ zIndex: 20, color: "rgba(255,255,255,0.38)" }}
        >
          <span>🌸 목표의 꽃</span>
          <span className="cursor-pointer hover:opacity-70 transition-opacity"
            style={{ color: `${palette.accent}88` }}
            onClick={() => setShowPopup(true)}>
            ✦ 자산의 나무 (터치)
          </span>
          {data.isRaining && <span>☁️ 지출 구름</span>}
          {data.meteorCount > 0 && <span>☄️ 임박 일정</span>}
        </div>
      )}
    </div>
  )
}
