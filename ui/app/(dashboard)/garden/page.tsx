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
  income: number
  meteorCount: number
}

// ── Sky palettes ──────────────────────────────────────────────────────────────

const PALETTES = {
  // 활기 (energetic/vibrant) → 골드/앰버 하늘
  매우좋음: { from: "#1a1200", to: "#5a3a00", accent: "#fbbf24", nebula: "#f59e0b" },
  // 맑음 (clear/pleasant) → 스텔라 블루
  좋음:    { from: "#0f1b3d", to: "#1e3a6b", accent: "#60a5fa", nebula: "#3b82f6" },
  // 보통 (neutral) → 인디고/퍼플
  보통:    { from: "#0f1230", to: "#2d1b69", accent: "#a78bfa", nebula: "#7c3aed" },
  // 우울 (gloomy) → 다크 퍼플
  나쁨:    { from: "#080820", to: "#1a0f3c", accent: "#7c3aed", nebula: "#5b21b6" },
  // 매우 우울 → 칠흑 남색
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

// ── Income Stars (scattered sky) ──────────────────────────────────────────────

function IncomeStars({ income }: { income: number }) {
  // 수입 30만원당 별 1개, 최대 8개 — 하늘 전체에 부유
  const count = Math.min(8, Math.max(0, Math.floor(income / 300_000)))
  const [stars, setStars] = useState<Array<{
    id: number; x: number; y: number; size: number; delay: number; dur: number
  }>>([])

  useEffect(() => {
    if (!count) { setStars([]); return }
    setStars(Array.from({ length: count }, (_, i) => ({
      id: i,
      // 하늘 전체 산포: x 5–88%, y 4–42% (구름·나무 영역 피함)
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
        <div
          key={s.id}
          className="absolute pointer-events-none"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            zIndex: 6,
            animation: `gdn-float ${s.dur}s ${s.delay}s ease-in-out infinite`,
          }}
        >
          <svg
            width={s.size * 2.8} height={s.size * 2.8}
            viewBox={`${-s.size * 1.4} ${-s.size * 1.4} ${s.size * 2.8} ${s.size * 2.8}`}
            style={{ overflow: "visible" }}
          >
            {/* 외곽 글로우 */}
            <polygon points={starPolygon(0, 0, s.size * 1.7, 5)} fill="#fbbf24" opacity="0.12" />
            {/* 중간 글로우 */}
            <polygon points={starPolygon(0, 0, s.size * 1.2, 5)} fill="#fde68a" opacity="0.28" />
            {/* 별 본체 */}
            <polygon points={starPolygon(0, 0, s.size, 5)} fill="#fbbf24" opacity="0.95" />
            {/* 중심 하이라이트 */}
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
  savingsRate, accent, onClick,
}: {
  savingsRate: number
  accent: string
  onClick: () => void
}) {
  // Wither state: < 30% → withering, < 15% → severely withered
  const isWithering = savingsRate < 30
  const isSevere = savingsRate < 15

  // Fruit count based on budget achievement rate (savingsRate)
  // 0-19% → 0, 20-39% → 1, 40-59% → 2, 60-79% → 3, 80-89% → 4, 90-100% → 5
  const fruitCount = isWithering ? 0 : Math.min(5, Math.floor(savingsRate / 20))

  const scale = 0.5 + Math.min(savingsRate, 100) / 100 * 0.58
  const alpha = Math.max(0.35, Math.min(1, savingsRate / 80))

  // Branch color shifts grey/brown when withering
  const branchColor = isWithering
    ? (isSevere ? "#6b5a4e" : "#8a7060")
    : accent
  const branchMidColor = isWithering ? "#a89080" : "#c4b5fd"
  const branchEndColor = isWithering ? "#9a8070" : "#e879f9"

  // Galaxy swirl branches — organic S-curves spreading outward
  const branches = isWithering
    ? [
        // 시든 가지: 아래로 처지는 곡선
        { d: "M200,268 C185,255 155,240 130,220 C108,202 100,182 115,168", delay: "0s" },
        { d: "M200,268 C215,255 245,240 270,220 C292,202 300,182 285,168", delay: "0.9s" },
        { d: "M200,268 C198,248 194,220 197,190 C199,165 205,148 200,138", delay: "1.8s" },
        { d: "M200,268 C178,262 155,254 138,240 C120,226 116,208 128,196", delay: "2.7s" },
        { d: "M200,268 C222,262 245,254 262,240 C280,226 284,208 272,196", delay: "3.6s" },
      ]
    : [
        // 건강한 가지: 은하 소용돌이 S-curve
        { d: "M200,268 C175,245 120,215 85,175 C55,138 68,92 118,82 C148,76 165,95 154,118", delay: "0s" },
        { d: "M200,268 C225,245 280,215 315,175 C345,138 332,92 282,82 C252,76 235,95 246,118", delay: "0.9s" },
        { d: "M200,268 C196,235 182,195 188,152 C194,112 210,78 200,48 C196,32 188,28 200,24", delay: "1.8s" },
        { d: "M200,268 C170,255 138,240 110,215 C82,190 72,158 90,136 C104,118 128,116 140,132", delay: "2.7s" },
        { d: "M200,268 C230,255 262,240 290,215 C318,190 328,158 310,136 C296,118 272,116 260,132", delay: "3.6s" },
      ]

  const fruitPositions = [
    [200, 76], [148, 110], [260, 96], [174, 150], [232, 136],
  ].slice(0, fruitCount) as [number, number][]

  const sparkles = isWithering ? [] : [
    [150, 170], [252, 172], [200, 116], [120, 188], [280, 190], [178, 132], [224, 128],
  ] as [number, number][]

  // Tip positions match new branch endpoints
  const tipPositions = isWithering
    ? [[115, 168], [285, 168], [200, 138], [128, 196], [272, 196]]
    : [[154, 118], [246, 118], [200, 24], [140, 132], [260, 132]]

  return (
    <div
      onClick={onClick}
      className="absolute cursor-pointer select-none"
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
            <stop offset="0%" stopColor={branchColor} stopOpacity="0.95" />
            <stop offset="50%" stopColor={branchMidColor} stopOpacity="0.6" />
            <stop offset="100%" stopColor={branchEndColor} stopOpacity="0.25" />
          </linearGradient>
          <radialGradient id="gdn-orb" cx="50%" cy="38%" r="62%">
            <stop offset="0%" stopColor="white" stopOpacity={isWithering ? "0.6" : "0.95"} />
            <stop offset="30%" stopColor={isWithering ? "#9a8070" : accent} stopOpacity="0.88" />
            <stop offset="70%" stopColor={isWithering ? "#6b5040" : accent} stopOpacity="0.3" />
            <stop offset="100%" stopColor={isWithering ? "#3a2a20" : accent} stopOpacity="0.04" />
          </radialGradient>
        </defs>

        <g
          transform={`translate(200,280) scale(${scale}) translate(-200,-280)`}
          style={{
            opacity: alpha,
            animation: isWithering ? "gdn-wither-droop 5s ease-in-out infinite" : undefined,
            transformOrigin: "200px 272px",
          }}
        >
          {/* Aura — dims when withering */}
          <ellipse cx="200" cy="190" rx="92" ry="115" fill={branchColor}
            opacity={isWithering ? "0.03" : "0.055"} />
          <ellipse cx="200" cy="190" rx="60" ry="78" fill={branchColor}
            opacity={isWithering ? "0.04" : "0.06"} />

          {/* Branch halos */}
          {branches.map(({ d }, i) => (
            <path key={`halo-${i}`} d={d} fill="none" stroke={branchColor}
              strokeWidth={i < 3 ? 14 : 11} strokeOpacity="0.07" strokeLinecap="round" />
          ))}
          {branches.map(({ d }, i) => (
            <path key={`mid-${i}`} d={d} fill="none" stroke={branchColor}
              strokeWidth={i < 3 ? 7 : 5} strokeOpacity="0.13" strokeLinecap="round" />
          ))}

          {/* Animated energy flows (slow/dim when withering) */}
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
                animation: `gdn-flow ${isWithering ? "9s" : "5.2s"} ${delay} ease-in-out infinite`,
                opacity: isWithering ? 0.5 : 1,
              }}
            />
          ))}

          {/* Branch tip glows */}
          {tipPositions.map(([cx, cy], i) => (
            <circle key={`tip-${i}`} cx={cx} cy={cy} r={isWithering ? 3 : 5}
              fill={branchColor} filter="url(#gdn-glow-sm)"
              opacity={isWithering ? 0.35 : 0.7}
              style={{ animation: `gdn-twinkle ${2 + i * 0.4}s ${i * 0.7}s ease-in-out infinite alternate` }} />
          ))}

          {/* Sparkles (hidden when withering) */}
          {sparkles.map(([cx, cy], i) => (
            <circle key={`sp-${i}`} cx={cx} cy={cy} r={2.0} fill="white"
              style={{ animation: `gdn-twinkle ${1.4 + (i % 4) * 0.5}s ${i * 0.55}s ease-in-out infinite alternate` }} />
          ))}

          {/* Star fruits on tree (from budget achievement) */}
          {fruitPositions.map(([px, py], i) => (
            <g key={`fruit-${i}`} filter="url(#gdn-glow-sm)">
              <polygon points={starPolygon(px, py, 9.5, 5)} fill="#fbbf24"
                style={{ animation: `gdn-float ${2.4 + i * 0.35}s ${i * 0.55}s ease-in-out infinite` }} />
              <polygon points={starPolygon(px, py, 13, 5)} fill="#fbbf24" opacity="0.2" />
            </g>
          ))}

          {/* Central orb */}
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

      {/* Wither warning */}
      {isWithering && (
        <div className="absolute left-1/2 -translate-x-1/2 -bottom-6 whitespace-nowrap text-[10px] text-center"
          style={{ color: isSevere ? "#f87171" : "#fb923c" }}>
          {isSevere ? "🥀 나무가 시들고 있어요" : "🍂 나무가 힘을 잃고 있어요"}
        </div>
      )}
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
        <ellipse cx="90" cy="72" rx="72" ry="14" fill="#1a2a5a" opacity="0.35" />

        {/* Bumpy cloud body — single path silhouette */}
        <path
          d="M20,72 C20,72 18,58 28,52 C32,44 44,38 58,42
             C60,32 70,22 84,22 C94,18 106,20 112,28
             C118,20 130,16 142,22 C154,26 160,36 156,46
             C166,42 178,46 180,56 C182,66 174,72 162,72 Z"
          fill="url(#gdn-cloud-fill)"
          filter="url(#gdn-cloud-glow)"
        />
        {/* Inner highlight layer */}
        <path
          d="M36,68 C36,68 34,56 44,50 C50,44 62,40 74,44
             C78,36 86,30 96,30 C106,28 116,32 120,40
             C128,34 140,36 144,44 C148,52 142,60 132,62
             C136,68 Z"
          fill="#7a90c8" opacity="0.55"
        />
        {/* Highlight shimmer */}
        <ellipse cx="82" cy="34" rx="20" ry="9" fill="white" opacity="0.10" />

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

// 색상: 파랑-보라-청록 계열 (레퍼런스 이미지와 유사)
const FLOWER_PALETTES = [
  { p1: "#60a5fa", p2: "#818cf8", p3: "#c4b5fd", leaf: "#34d399", center: "#fbbf24" },
  { p1: "#a78bfa", p2: "#c084fc", p3: "#e9d5ff", leaf: "#4ade80", center: "#fde68a" },
  { p1: "#34d399", p2: "#60a5fa", p3: "#a5f3fc", leaf: "#4ade80", center: "#fbbf24" },
  { p1: "#f472b6", p2: "#a78bfa", p3: "#ddd6fe", leaf: "#34d399", center: "#fef08a" },
]

function TulipSVG({ goal, index }: { goal: Goal; index: number }) {
  const progress = Math.max(0, Math.min(100, goal.progress ?? 0))
  const col = FLOWER_PALETTES[index % FLOWER_PALETTES.length]

  // 성장 단계: 0=씨앗 1=새싹 2=봉오리 3=반개화 4=만개
  const stage = progress >= 80 ? 4 : progress >= 55 ? 3 : progress >= 30 ? 2 : progress >= 10 ? 1 : 0

  // 만개 크기 기준, 진행도에 따라 스케일
  const bloomScale = stage === 4 ? 1 : stage === 3 ? 0.8 : stage === 2 ? 0.6 : 0.4
  const stemH = 62 + bloomScale * 12  // 줄기 길이
  const BY = 118   // 줄기 밑 Y
  const CY = BY - stemH  // 꽃 중심 Y

  // 튤립 꽃잎 경로 (3장: 왼/중/오)
  const P = bloomScale
  const leftPetal  = `M0,${CY + 8 * P} C${-16 * P},${CY + 2 * P} ${-22 * P},${CY - 16 * P} ${-14 * P},${CY - 30 * P} C${-8 * P},${CY - 40 * P} ${-2 * P},${CY - 32 * P} 0,${CY - 18 * P}`
  const rightPetal = `M0,${CY + 8 * P} C${16 * P},${CY + 2 * P} ${22 * P},${CY - 16 * P} ${14 * P},${CY - 30 * P} C${8 * P},${CY - 40 * P} ${2 * P},${CY - 32 * P} 0,${CY - 18 * P}`
  const centerPetal= `M${-6 * P},${CY + 6 * P} C${-12 * P},${CY - 8 * P} ${-10 * P},${CY - 34 * P} 0,${CY - 42 * P} C${10 * P},${CY - 34 * P} ${12 * P},${CY - 8 * P} ${6 * P},${CY + 6 * P}`

  return (
    <g style={{
      transformOrigin: `0px ${BY}px`,
      animation: stage >= 2 ? `gdn-sway ${3.4 + index * 0.6}s ${index * 0.7}s ease-in-out infinite` : undefined,
    }}>
      <defs>
        <filter id={`gdn-fl-glow-${index}`} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b" />
          <feComposite in="b" in2="SourceGraphic" operator="over" />
        </filter>
        <linearGradient id={`gdn-tulip-${index}`} x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor={col.p1} stopOpacity="0.95" />
          <stop offset="50%" stopColor={col.p2} stopOpacity="0.85" />
          <stop offset="100%" stopColor={col.p3} stopOpacity="0.75" />
        </linearGradient>
      </defs>

      {/* 줄기 */}
      {stage >= 1 && (
        <path d={`M0,${BY} C${-4},${BY - stemH * 0.4} ${4},${BY - stemH * 0.7} 0,${CY + 10 * P}`}
          fill="none" stroke={col.leaf} strokeWidth="2.8" strokeLinecap="round" opacity="0.82" />
      )}

      {/* 잎 (채운 leaf shape) */}
      {stage >= 2 && (
        <>
          <path d={`M0,${BY - stemH * 0.32} C${-20},${BY - stemH * 0.45} ${-26},${BY - stemH * 0.62} ${-14},${BY - stemH * 0.64}`}
            fill={col.leaf} opacity="0.72" />
          <path d={`M0,${BY - stemH * 0.48} C${22},${BY - stemH * 0.62} ${28},${BY - stemH * 0.78} ${16},${BY - stemH * 0.80}`}
            fill={col.leaf} opacity="0.72" />
        </>
      )}

      {/* Stage 0: 씨앗 */}
      {stage === 0 && (
        <circle cx="0" cy={BY - 5} r="5" fill={col.p1} opacity="0.7"
          filter={`url(#gdn-fl-glow-${index})`}
          style={{ animation: `gdn-twinkle 2.4s ${index * 0.6}s ease-in-out infinite alternate` }} />
      )}

      {/* Stage 1: 새싹 봉오리 */}
      {stage === 1 && (
        <g filter={`url(#gdn-fl-glow-${index})`}>
          <ellipse cx="0" cy={CY} rx={7 * P} ry={16 * P} fill={`url(#gdn-tulip-${index})`} opacity="0.88" />
        </g>
      )}

      {/* Stage 2+: 꽃잎 */}
      {stage >= 2 && (
        <g filter={`url(#gdn-fl-glow-${index})`}
          style={stage === 4 ? { animation: `gdn-bloom 3.5s ${index * 0.5}s ease-in-out infinite` } : undefined}>

          {/* 외곽 글로우 헤일로 */}
          <ellipse cx="0" cy={CY - 10 * P} rx={28 * P} ry={30 * P}
            fill={col.p2} opacity="0.10" />

          {/* 왼쪽 꽃잎 */}
          <path d={leftPetal}  fill={`url(#gdn-tulip-${index})`} opacity="0.85" />
          {/* 오른쪽 꽃잎 */}
          <path d={rightPetal} fill={`url(#gdn-tulip-${index})`} opacity="0.85" />
          {/* 가운데 꽃잎 (앞) */}
          <path d={centerPetal} fill={`url(#gdn-tulip-${index})`} opacity="0.95" />

          {/* 꽃잎 내측 하이라이트 */}
          <path d={centerPetal} fill={col.p3} opacity="0.18" />

          {/* 중심 별 */}
          <circle cx="0" cy={CY - 4 * P} r={7 * P} fill={col.center} opacity="0.92" />
          <polygon points={starPolygon(0, CY - 4 * P, 4.5 * P, 5)} fill="white" opacity="0.9" />
          <circle cx="0" cy={CY - 4 * P} r={10 * P} fill={col.center} opacity="0.15" />
        </g>
      )}

      {/* 라벨 */}
      <text x="0" y={BY + 15} textAnchor="middle" fontSize="10" fill="white" opacity="0.75">
        {goal.icon} {goal.title.length > 6 ? goal.title.slice(0, 6) + "…" : goal.title}
      </text>
      <text x="0" y={BY + 27} textAnchor="middle" fontSize="9" fill="#c4b5fd" opacity="0.60">
        {progress.toFixed(0)}%
      </text>
    </g>
  )
}

function GoalFlowers({ goals }: { goals: Goal[] }) {
  const displayed = goals.slice(0, 4)
  if (!displayed.length) return null

  const spacing = 86
  const w = spacing * displayed.length + 24

  return (
    <div className="absolute pointer-events-none" style={{ left: "2%", bottom: "9%", zIndex: 9 }}>
      <svg viewBox={`-12 -22 ${w} 180`} width={w} height={180} style={{ overflow: "visible" }}>
        <text x={(w - 24) / 2} y={-8} textAnchor="middle" fontSize="10"
          fill="white" opacity="0.48" letterSpacing="2">목표 꽃</text>
        {displayed.map((goal, i) => (
          <g key={goal.id} transform={`translate(${26 + i * spacing}, 0)`}>
            <TulipSVG goal={goal} index={i} />
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
      fetch("/api/goals"),
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
      income,
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

      {/* Income stars (scattered sky) */}
      {data && <IncomeStars income={data.income} />}

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
