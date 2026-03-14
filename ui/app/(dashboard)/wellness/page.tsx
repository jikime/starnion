"use client"

import { useCallback, useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Loader2, RefreshCw, BookOpen, MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

// ── Types ──────────────────────────────────────────────────────────────────────

interface DiaryEntry { mood: string; created_at: string; entry_date?: string }
interface Goal { id: number; title: string; icon: string; progress: number; status: string }

interface EmotionStat {
  key: string
  label: string
  count: number
  color: string
  emoji: string
}

interface WellnessData {
  emotions: EmotionStat[]
  totalDiaries: number
  recentMood: string
  goals: Goal[]
  diaryCountThisWeek: number
  goalCompletionRate: number
  entries: DiaryEntry[]
}

// ── Constants ──────────────────────────────────────────────────────────────────

const MOOD_CONFIG: Record<string, { label: string; color: string; emoji: string }> = {
  매우좋음: { label: "Joy",   color: "#fbbf24", emoji: "✨" },
  좋음:    { label: "Peace", color: "#34d399", emoji: "🌿" },
  보통:    { label: "Calm",  color: "#a78bfa", emoji: "💜" },
  나쁨:    { label: "Sad",   color: "#60a5fa", emoji: "💙" },
  매우나쁨: { label: "Down",  color: "#818cf8", emoji: "🌙" },
}

const HEALING_MESSAGES: Record<string, string[]> = {
  매우좋음: [
    "오늘은 정말 빛나는 날이네요! 그 기쁨을 오래 간직하세요 ✨",
    "행복한 에너지가 온 정원에 퍼지고 있어요 🌟",
  ],
  좋음: [
    "마음이 평화롭군요. 이 순간을 충분히 누려요 🌿",
    "따뜻한 하루를 보내고 계시네요. 잘 하고 있어요 💚",
  ],
  보통: [
    "평범한 하루도 소중한 기록이에요. 오늘도 잘 하고 있어요 💜",
    "보통인 날이 쌓여 특별한 삶이 돼요. 함께해요 🌙",
  ],
  나쁨: [
    "힘든 감정도 괜찮아요. 니온이 옆에 있을게요 💙",
    "조금 힘드시죠? 잠시 쉬어가도 돼요. 니온이 지켜볼게요 🌊",
  ],
  매우나쁨: [
    "많이 지쳐있군요. 천천히, 조금씩 나아가요 🌙",
    "오늘은 자신에게 따뜻하게 대해주세요. 니온이 응원해요 ⭐",
  ],
}

// ── CSS keyframes ──────────────────────────────────────────────────────────────

const WELLNESS_STYLES = `
@keyframes ws-orbit {
  from { transform: rotate(0deg) translateX(var(--r, 90px)) rotate(0deg); }
  to   { transform: rotate(360deg) translateX(var(--r, 90px)) rotate(-360deg); }
}
@keyframes ws-orbit-rev {
  from { transform: rotate(0deg) translateX(var(--r, 70px)) rotate(0deg); }
  to   { transform: rotate(-360deg) translateX(var(--r, 70px)) rotate(360deg); }
}
@keyframes ws-glow {
  0%, 100% { filter: drop-shadow(0 0 20px #fbbf24bb) drop-shadow(0 0 40px #f9731633); }
  50%       { filter: drop-shadow(0 0 36px #fbbf24aa) drop-shadow(0 0 60px #f9731655); }
}
@keyframes ws-float {
  0%, 100% { transform: translateY(0px); }
  50%       { transform: translateY(-10px); }
}
@keyframes ws-heart-beat {
  0%, 100% { transform: scale(1);    opacity: 0.85; }
  50%       { transform: scale(1.18); opacity: 1;    }
}
@keyframes ws-bar-grow {
  from { width: 0%; }
}
@keyframes ws-rise {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes ws-twinkle {
  0%   { opacity: 0.2; transform: scale(0.6); }
  100% { opacity: 1;   transform: scale(1.3); }
}
@keyframes ws-sway {
  0%, 100% { transform: rotate(-3.5deg); }
  50%       { transform: rotate(3.5deg);  }
}
@keyframes ws-pulse-ring {
  0%, 100% { opacity: 0.18; }
  50%       { opacity: 0.38; }
}
@keyframes ws-cal-fade {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes ws-dot-pop {
  0%   { transform: scale(0); opacity: 0; }
  70%  { transform: scale(1.3); }
  100% { transform: scale(1); opacity: 1; }
}
`

// ── Helpers ────────────────────────────────────────────────────────────────────

function heartPath(cx: number, cy: number, s: number): string {
  return [
    `M ${cx},${cy + s * 0.28}`,
    `C ${cx - s * 0.45},${cy} ${cx - s},${cy - s * 0.18} ${cx - s},${cy - s * 0.48}`,
    `C ${cx - s},${cy - s} ${cx - s * 0.48},${cy - s * 1.12} ${cx},${cy - s * 0.62}`,
    `C ${cx + s * 0.48},${cy - s * 1.12} ${cx + s},${cy - s} ${cx + s},${cy - s * 0.48}`,
    `C ${cx + s},${cy - s * 0.18} ${cx + s * 0.45},${cy} ${cx},${cy + s * 0.28}`,
    "Z",
  ].join(" ")
}

// ── Background Stars (client-only) ─────────────────────────────────────────────

function BgStars() {
  const [stars, setStars] = useState<Array<{
    id: number; x: number; y: number; s: number; delay: number; dur: number
  }>>([])

  useEffect(() => {
    setStars(Array.from({ length: 55 }, (_, i) => ({
      id: i,
      x: parseFloat(((i * 2.13 + Math.sin(i * 3.7) * 32 + 52) % 100).toFixed(3)),
      y: parseFloat(((i * 1.79 + Math.cos(i * 2.1) * 26 + 18) % 65).toFixed(3)),
      s: 0.4 + (i % 3) * 0.35,
      delay: (i % 7) * 0.55,
      dur: 1.8 + (i % 5) * 0.5,
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
            animation: `ws-twinkle ${s.dur}s ${s.delay}s ease-in-out infinite alternate`,
          }}
        />
      ))}
    </>
  )
}

// ── Mood Calendar ──────────────────────────────────────────────────────────────

const CAL_DAYS = ["일", "월", "화", "수", "목", "금", "토"]

function MoodCalendar({ entries }: { entries: DiaryEntry[] }) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  // Build map: "YYYY-MM-DD" -> mood
  const moodMap = new Map<string, string>()
  entries.forEach(e => {
    const key = e.entry_date ?? e.created_at.slice(0, 10)
    if (!moodMap.has(key)) moodMap.set(key, e.mood)
  })

  const firstDow  = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMon = new Date(viewYear, viewMonth + 1, 0).getDate()
  const todayStr  = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
  const isMaxMonth = viewYear === today.getFullYear() && viewMonth >= today.getMonth()

  const prevMon = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  const nextMon = () => {
    if (isMaxMonth) return
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  // Pad front with empty cells, then day numbers
  const cells: (number | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMon }, (_, i) => i + 1),
  ]
  // Pad end to complete last row
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="rounded-2xl p-3" style={{
      background: "rgba(255,255,255,0.05)",
      border: "1px solid rgba(255,255,255,0.12)",
      animation: "ws-cal-fade 0.35s ease-out",
    }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2.5">
        <Button
          variant="ghost"
          size="icon"
          onClick={prevMon}
          className="w-5 h-5 rounded-full hover:bg-white/10"
          style={{ color: "rgba(255,255,255,0.70)", fontSize: "16px" }}
        >‹</Button>
        <span className="text-[13px] font-semibold tracking-widest"
          style={{ color: "rgba(255,255,255,0.65)" }}>
          {viewYear}년 {viewMonth + 1}월
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={nextMon}
          disabled={isMaxMonth}
          className="w-5 h-5 rounded-full hover:bg-white/10 disabled:opacity-20"
          style={{ color: "rgba(255,255,255,0.70)", fontSize: "16px" }}
        >›</Button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-x-[2px] mb-2">
        {CAL_DAYS.map((d, i) => {
          const isSunH = i === 0
          const isSatH = i === 6
          return (
            <div key={d} className="flex justify-center">
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 18, height: 18, borderRadius: "50%",
                fontSize: "10px", fontWeight: 600,
                background: isSunH ? "rgba(244,114,182,0.22)"
                  : isSatH ? "rgba(96,165,250,0.22)"
                  : "rgba(255,255,255,0.10)",
                border: isSunH ? "1px solid rgba(244,114,182,0.50)"
                  : isSatH ? "1px solid rgba(96,165,250,0.50)"
                  : "1px solid rgba(255,255,255,0.18)",
                color: isSunH ? "#f472b6"
                  : isSatH ? "#60a5fa"
                  : "rgba(255,255,255,0.75)",
              }}>{d}</span>
            </div>
          )
        })}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, idx) => {
          if (!day) return <div key={`e-${idx}`} />
          const mm = String(viewMonth + 1).padStart(2, "0")
          const dd = String(day).padStart(2, "0")
          const dateStr = `${viewYear}-${mm}-${dd}`
          const mood = moodMap.get(dateStr)
          const cfg  = mood ? MOOD_CONFIG[mood] : null
          const isToday = dateStr === todayStr
          const isSun = (firstDow + day - 1) % 7 === 0
          const isSat = (firstDow + day - 1) % 7 === 6

          return (
            <div key={dateStr}
              className="flex flex-col items-center gap-[2px] py-[1px] rounded-lg transition-all"
              style={{
                background: isToday ? "rgba(251,191,36,0.08)" : "transparent",
                outline: isToday ? "1px solid rgba(251,191,36,0.25)" : "none",
              }}>
              <span style={{
                fontSize: "11px",
                fontWeight: isToday ? "700" : "400",
                color: isToday
                  ? "#fbbf24"
                  : cfg ? "rgba(255,255,255,0.88)"
                  : isSun ? "rgba(244,114,182,0.70)"
                  : isSat ? "rgba(96,165,250,0.70)"
                  : "rgba(255,255,255,0.52)",
              }}>
                {day}
              </span>
              <div style={{
                width: 5, height: 5, borderRadius: "50%",
                background: cfg ? cfg.color : "transparent",
                border: !cfg && isToday ? "1px solid #fbbf24bb" : "none",
                boxShadow: cfg ? `0 0 5px ${cfg.color}99` : "none",
                animation: cfg ? `ws-dot-pop 0.4s ${((day - 1) % 7) * 0.03}s ease-out both` : "none",
              }} />
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-2.5 pt-2"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        {Object.entries(MOOD_CONFIG).map(([, cfg]) => (
          <div key={cfg.label} className="flex items-center gap-1">
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.color,
              boxShadow: `0 0 3px ${cfg.color}88` }} />
            <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.65)" }}>{cfg.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Healing Tree ───────────────────────────────────────────────────────────────

function HealingTree({ emotions, totalDiaries, entries }: {
  emotions: EmotionStat[]
  totalDiaries: number
  entries: DiaryEntry[]
}) {
  const maxCount = Math.max(...emotions.map(e => e.count), 1)

  // Memory leaves: 1 per 10 diary entries, max 8
  const leafCount = Math.min(8, Math.floor(totalDiaries / 10))
  const leafPositions = [
    { x: 110, y: 178, color: "#fbbf24", rot: -35 },
    { x: 290, y: 176, color: "#f472b6", rot: 35 },
    { x: 200, y:  92, color: "#34d399", rot: 0 },
    { x:  88, y: 158, color: "#a78bfa", rot: -25 },
    { x: 312, y: 158, color: "#60a5fa", rot: 25 },
    { x: 158, y: 132, color: "#fde68a", rot: -15 },
    { x: 244, y: 130, color: "#86efac", rot: 15 },
    { x: 200, y:  50, color: "#f9a8d4", rot: 0 },
  ].slice(0, leafCount)

  const branches = [
    { d: "M200,268 C175,245 120,215 85,175 C55,138 68,92 118,82 C148,76 165,95 154,118", color: "#fbbf24", delay: "0s" },
    { d: "M200,268 C225,245 280,215 315,175 C345,138 332,92 282,82 C252,76 235,95 246,118", color: "#f472b6", delay: "1s" },
    { d: "M200,268 C196,235 182,195 188,152 C194,112 210,78 200,48",                        color: "#34d399", delay: "2s" },
    { d: "M200,268 C170,255 138,240 110,215 C82,190 72,158 90,136",                         color: "#a78bfa", delay: "3s" },
    { d: "M200,268 C230,255 262,240 290,215 C318,190 328,158 310,136",                      color: "#60a5fa", delay: "4s" },
  ]

  const heartFruits = [
    { x: 154, y: 118, color: "#fbbf24", size: 10, delay: "0s",   dur: "2.2s" },
    { x: 246, y: 118, color: "#f472b6", size: 10, delay: "0.4s", dur: "2.6s" },
    { x: 200, y:  48, color: "#34d399", size: 12, delay: "0.8s", dur: "2.0s" },
    { x:  90, y: 136, color: "#a78bfa", size:  9, delay: "1.2s", dur: "2.4s" },
    { x: 310, y: 136, color: "#60a5fa", size:  9, delay: "1.6s", dur: "2.8s" },
  ]

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Tree label */}
      <div className="text-[12px] tracking-widest uppercase" style={{ color: "#fbbf24bb" }}>
        치유의 나무
      </div>

      {/* Tree SVG */}
      <div className="flex justify-center">
        <svg viewBox="60 20 280 280" width="200" height="200" style={{ overflow: "visible" }}>
          <defs>
            <filter id="ws-glow-sm" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b" />
              <feComposite in="b" in2="SourceGraphic" operator="over" />
            </filter>
            <filter id="ws-glow-md" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="b" />
              <feComposite in="b" in2="SourceGraphic" operator="over" />
            </filter>
            <radialGradient id="ws-orb" cx="50%" cy="38%" r="62%">
              <stop offset="0%"   stopColor="white"   stopOpacity="0.95" />
              <stop offset="35%"  stopColor="#fbbf24" stopOpacity="0.78" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.08" />
            </radialGradient>
          </defs>

          {/* Branch halos */}
          {branches.map(({ d, color }, i) => (
            <path key={`h-${i}`} d={d} fill="none" stroke={color}
              strokeWidth={10} strokeOpacity="0.07" strokeLinecap="round" />
          ))}

          {/* Branch energy flows */}
          {branches.map(({ d, color, delay }, i) => (
            <path key={`f-${i}`} d={d} fill="none" stroke={color}
              strokeWidth={2.4} strokeLinecap="round" filter="url(#ws-glow-sm)"
              style={{ strokeDasharray: 700, animation: `gdn-flow 5.5s ${delay} ease-in-out infinite` }} />
          ))}

          {/* Branch tip sparkles */}
          {[
            [130, 165, "#fbbf24"], [170, 128, "#f472b6"], [200, 88, "#34d399"],
            [102, 180, "#a78bfa"], [298, 180, "#60a5fa"],
          ].map(([x, y, c], i) => (
            <circle key={`sp-${i}`} cx={x as number} cy={y as number} r={2}
              fill={c as string}
              style={{ animation: `ws-twinkle ${1.6 + i * 0.4}s ${i * 0.55}s ease-in-out infinite alternate` }} />
          ))}

          {/* Heart fruits */}
          {heartFruits.map((h, i) => (
            <g key={`heart-${i}`} filter="url(#ws-glow-sm)">
              <circle cx={h.x} cy={h.y} r={h.size * 1.9} fill={h.color} opacity="0.10" />
              <path
                d={heartPath(h.x, h.y - 2, h.size * 0.88)}
                fill={h.color} opacity="0.94"
                style={{ animation: `ws-heart-beat ${h.dur} ${h.delay} ease-in-out infinite` }}
              />
            </g>
          ))}

          {/* Memory leaves (from diary count) */}
          {leafPositions.map((lp, i) => (
            <g key={`leaf-${i}`}>
              <ellipse
                cx={lp.x} cy={lp.y} rx={8} ry={5}
                fill={lp.color} opacity="0.12"
                transform={`rotate(${lp.rot} ${lp.x} ${lp.y})`}
              />
              <ellipse
                cx={lp.x} cy={lp.y} rx={5.5} ry={3.5}
                fill={lp.color} opacity="0.72"
                transform={`rotate(${lp.rot} ${lp.x} ${lp.y})`}
                style={{ animation: `ws-twinkle ${1.8 + i * 0.3}s ${i * 0.4}s ease-in-out infinite alternate` }}
              />
            </g>
          ))}

          {/* Central orb */}
          <circle cx="200" cy="258" r="30" fill="#fbbf24" opacity="0.08" filter="url(#ws-glow-md)" />
          <circle cx="200" cy="258" r="22" fill="url(#ws-orb)" filter="url(#ws-glow-md)"
            style={{ animation: "gdn-orb-pulse 3s ease-in-out infinite" }} />
          <text x="200" y="264" textAnchor="middle" fontSize="13" fontWeight="bold"
            fill="white" opacity="0.9" style={{ fontFamily: "system-ui" }}>₩</text>
        </svg>
      </div>

      {/* Emotion layer chart */}
      <div className="flex-1 rounded-2xl p-3" style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}>
        <div className="text-[11px] tracking-widest uppercase mb-2.5" style={{ color: "rgba(255,255,255,0.70)" }}>
          FRUITS · 감정 레이어
        </div>

        {emotions.length === 0 ? (
          <div className="text-[13px] text-center py-4" style={{ color: "rgba(255,255,255,0.62)" }}>
            일기를 쓰면 감정이 채워져요
          </div>
        ) : (
          <div className="space-y-2">
            {emotions.slice(0, 5).map((e, i) => (
              <div key={e.key} className="flex items-center gap-2">
                <span className="text-[12px] w-11 text-right shrink-0 font-medium" style={{ color: e.color + "cc" }}>
                  {e.label}
                </span>
                <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(e.count / maxCount) * 100}%`,
                      background: `linear-gradient(90deg, ${e.color}66, ${e.color})`,
                      animation: `ws-bar-grow 0.9s ${i * 0.12}s ease-out both`,
                    }}
                  />
                </div>
                <span className="text-[12px] w-4 shrink-0 text-right" style={{ color: "rgba(255,255,255,0.62)" }}>
                  {e.count}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-2.5 pt-2 text-[12px]" style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          color: "rgba(255,255,255,0.62)",
        }}>
          총 {totalDiaries}개의 기억
        </div>
      </div>

      {/* Monthly mood calendar */}
      <MoodCalendar entries={entries} />
    </div>
  )
}

// ── Nion Center ────────────────────────────────────────────────────────────────

function NionCenter({
  recentMood, nionState, activeMood, onMoodSelect,
}: {
  recentMood: string
  nionState: string
  activeMood: string
  onMoodSelect: (mood: string) => void
}) {
  const displayMood = activeMood || recentMood
  const moodCfg = MOOD_CONFIG[displayMood] ?? MOOD_CONFIG["보통"]
  const healingMsg =
    HEALING_MESSAGES[displayMood]?.[new Date().getMinutes() % 2] ??
    HEALING_MESSAGES["보통"][0]

  // Orbiting hearts & stars
  const orbitItems = [
    { r: 96, dur: "8s",    delay: "0s",    size: 16, shape: "heart", color: "#fbbf24", rev: false },
    { r: 96, dur: "8s",    delay: "2s",    size: 11, shape: "star",  color: "#f472b6", rev: false },
    { r: 96, dur: "8s",    delay: "4s",    size: 11, shape: "heart", color: "#34d399", rev: false },
    { r: 96, dur: "8s",    delay: "6s",    size: 10, shape: "star",  color: "#a78bfa", rev: false },
    { r: 68, dur: "5.5s",  delay: "0s",    size: 8,  shape: "dot",   color: "#fde68a", rev: true },
    { r: 68, dur: "5.5s",  delay: "2.75s", size: 8,  shape: "dot",   color: "#60a5fa", rev: true },
  ]

  const nionImages: Record<string, string> = {
    healing: "/nion-healing.png",
    plant:   "/nion-plant.png",
    watch:   "/nion-watch.png",
    polish:  "/nion-polish.png",
    sweep:   "/nion-sweep.png",
    default: "/nion-default.png",
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 h-full">
      {/* Orbital system */}
      <div className="relative flex items-center justify-center" style={{ width: 224, height: 224 }}>
        {/* Orbit ring decorations */}
        <svg className="absolute inset-0 pointer-events-none" width="224" height="224" viewBox="0 0 224 224">
          <ellipse cx="112" cy="112" rx="96" ry="38" fill="none"
            stroke="#fbbf2220" strokeWidth="1.5" transform="rotate(-20 112 112)"
            style={{ animation: "ws-pulse-ring 3s ease-in-out infinite" }} />
          <ellipse cx="112" cy="112" rx="68" ry="27" fill="none"
            stroke="#f472b618" strokeWidth="1" transform="rotate(15 112 112)"
            style={{ animation: "ws-pulse-ring 4s 1s ease-in-out infinite" }} />
        </svg>

        {/* Nion image */}
        <div style={{
          position: "relative", zIndex: 10,
          animation: "ws-float 4s ease-in-out infinite",
        }}>
          <Image
            src={nionImages[nionState] ?? "/nion-healing.png"}
            alt="Nion"
            width={148} height={148}
            style={{ animation: "ws-glow 4s ease-in-out infinite" }}
            priority
          />
        </div>

        {/* Orbiting items */}
        {orbitItems.map((item, i) => (
          <div
            key={i}
            className="absolute pointer-events-none"
            style={{
              top: "50%", left: "50%",
              width: item.size, height: item.size,
              marginTop: -item.size / 2, marginLeft: -item.size / 2,
              ["--r" as string]: `${item.r}px`,
              animation: `${item.rev ? "ws-orbit-rev" : "ws-orbit"} ${item.dur} ${item.delay} linear infinite`,
            } as React.CSSProperties}
          >
            {item.shape === "heart" ? (
              <svg width={item.size} height={item.size} viewBox="-7 -7 14 14" style={{ overflow: "visible" }}>
                <path d={heartPath(0, 1, 5.5)} fill={item.color} opacity="0.92" />
              </svg>
            ) : item.shape === "star" ? (
              <svg width={item.size} height={item.size} viewBox="-7 -7 14 14" style={{ overflow: "visible" }}>
                <polygon points="0,-5.5 1.6,-1.6 5.5,-1.6 2.8,1 3.8,5.2 0,2.8 -3.8,5.2 -2.8,1 -5.5,-1.6 -1.6,-1.6"
                  fill={item.color} opacity="0.92" />
              </svg>
            ) : (
              <div className="rounded-full w-full h-full" style={{ background: item.color, opacity: 0.7 }} />
            )}
          </div>
        ))}
      </div>

      {/* Mood indicator */}
      <div className="text-center space-y-1">
        <div className="text-[12px] tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.65)" }}>
          오늘의 마음
        </div>
        <div className="flex items-center gap-2 justify-center">
          <span className="text-lg">{moodCfg.emoji}</span>
          <span className="text-base font-medium" style={{ color: moodCfg.color }}>{displayMood}</span>
        </div>
      </div>

      {/* Healing message */}
      <div className="text-[15px] italic text-center px-3 leading-relaxed min-h-[2.8rem] flex items-center justify-center"
        style={{ color: "rgba(255,255,255,0.78)", fontFamily: "Georgia, serif" }}>
        {healingMsg}
      </div>

      {/* Mood selector */}
      <div className="flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-1.5">
          {Object.entries(MOOD_CONFIG).map(([key, cfg]) => (
            <Button
              key={key}
              variant="ghost"
              size="icon"
              onClick={() => onMoodSelect(key)}
              className="w-9 h-9 rounded-full transition-all hover:scale-110 active:scale-95"
              style={{
                background: displayMood === key ? `${cfg.color}28` : "transparent",
                border: `1.5px solid ${displayMood === key ? cfg.color + "99" : "rgba(255,255,255,0.12)"}`,
                boxShadow: displayMood === key ? `0 0 10px ${cfg.color}33` : "none",
              }}
              title={key}
            >
              <span className="text-base leading-none">{cfg.emoji}</span>
            </Button>
          ))}
        </div>
        <div className="text-[11px] tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.52)" }}>
          오늘의 감정 선택
        </div>
      </div>
    </div>
  )
}

// ── Donut Chart ────────────────────────────────────────────────────────────────

function DonutChart({ rate, color }: { rate: number; color: string }) {
  const R = 26
  const circ = 2 * Math.PI * R
  const dash = (rate / 100) * circ
  return (
    <svg width="68" height="68" viewBox="0 0 68 68">
      <circle cx="34" cy="34" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6.5" />
      <circle cx="34" cy="34" r={R} fill="none" stroke={color} strokeWidth="6.5"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        strokeDashoffset={circ * 0.25}
        style={{ transition: "stroke-dasharray 1.2s ease-out" }}
      />
      <text x="34" y="39" textAnchor="middle" fontSize="11" fontWeight="bold" fill={color}>
        {rate}%
      </text>
    </svg>
  )
}

// ── Mind Flower Button ─────────────────────────────────────────────────────────

function MindFlower({ label, href, color, children }: {
  label: string
  href: string
  color: string
  children: React.ReactNode
}) {
  return (
    <Link href={href} className="flex flex-col items-center gap-1.5 group">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center transition-transform group-hover:scale-110"
        style={{
          background: `radial-gradient(circle, ${color}22 0%, ${color}08 100%)`,
          border: `1.5px solid ${color}44`,
          boxShadow: `0 0 14px ${color}22`,
        }}
      >
        <div style={{ color }}>{children}</div>
      </div>
      <span className="text-[12px]" style={{ color: "rgba(255,255,255,0.75)" }}>{label}</span>
    </Link>
  )
}

// ── Counseling Space ───────────────────────────────────────────────────────────

function CounselingSpace({ goals, diaryCountThisWeek, goalCompletionRate }: {
  goals: Goal[]
  diaryCountThisWeek: number
  goalCompletionRate: number
}) {
  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="text-[12px] tracking-widest uppercase" style={{ color: "#fbbf24bb" }}>
        상담 공간
      </div>

      {/* Session card */}
      <div className="rounded-2xl p-3" style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}>
        <div className="flex items-center justify-center gap-4">
          {/* 커피 */}
          <div className="flex flex-col items-center gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/wellness-coffee.png" alt="커피" width={52} height={52}
              style={{ objectFit: "contain", filter: "drop-shadow(0 0 8px #fbbf2433)" }} />
          </div>

          {/* 의자 */}
          <div className="flex flex-col items-center gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/wellness-chair.png" alt="의자" width={72} height={72}
              style={{ objectFit: "contain", filter: "drop-shadow(0 0 10px #fbbf2444)" }} />
          </div>

          {/* 상담 세션 통계 */}
          <div className="flex flex-col items-center">
            <DonutChart rate={goalCompletionRate} color="#fbbf24" />
            <div className="text-[11px] mt-0.5 text-center" style={{ color: "rgba(255,255,255,0.62)" }}>
              상담 세션 통계
            </div>
          </div>

          {/* 이번 주 기록 */}
          <div className="flex flex-col items-center gap-1">
            <div className="text-xl font-bold" style={{ color: "#f472b6" }}>{diaryCountThisWeek}</div>
            <div className="text-[11px] text-center" style={{ color: "rgba(255,255,255,0.62)" }}>이번 주<br/>기록</div>
          </div>
        </div>
      </div>

      {/* Mind flowers */}
      <div className="rounded-2xl p-3" style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}>
        <div className="text-[11px] tracking-widest uppercase mb-3" style={{ color: "rgba(255,255,255,0.70)" }}>
          마음의 꽃
        </div>
        <div className="flex justify-around">
          <MindFlower label="명상" href="/diary" color="#34d399">
            <span className="text-xl">🧘</span>
          </MindFlower>
          <MindFlower label="일기" href="/diary" color="#a78bfa">
            <BookOpen size={20} />
          </MindFlower>
          <MindFlower label="대화" href="/chat" color="#f472b6">
            <MessageCircle size={20} />
          </MindFlower>
        </div>
      </div>

      {/* In-progress goals */}
      {goals.length > 0 && (
        <div className="flex-1 rounded-2xl p-3" style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.07)",
        }}>
          <div className="text-[11px] tracking-widest uppercase mb-2.5" style={{ color: "rgba(255,255,255,0.70)" }}>
            진행 중 목표
          </div>
          <div className="space-y-2.5">
            {goals.slice(0, 3).map(g => (
              <div key={g.id} className="flex items-center gap-2">
                <span className="text-sm">{g.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] truncate" style={{ color: "rgba(255,255,255,0.72)" }}>
                    {g.title}
                  </div>
                  <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
                    <div className="h-full rounded-full" style={{
                      width: `${g.progress}%`,
                      background: "linear-gradient(90deg, #a78bfa, #f472b6)",
                    }} />
                  </div>
                </div>
                <span className="text-[12px] shrink-0" style={{ color: "#a78bfa" }}>
                  {g.progress.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

const NION_STATES = ["healing", "plant", "watch", "polish", "sweep"]

export default function WellnessPage() {
  const [data, setData] = useState<WellnessData | null>(null)
  const [loading, setLoading] = useState(true)
  const [nionState, setNionState] = useState(() => NION_STATES[new Date().getHours() % NION_STATES.length])

  useEffect(() => {
    const update = () => setNionState(NION_STATES[new Date().getHours() % NION_STATES.length])
    const now = new Date()
    const msUntilNextHour =
      (60 - now.getMinutes()) * 60 * 1000 - now.getSeconds() * 1000 - now.getMilliseconds()
    let intervalId: ReturnType<typeof setInterval>
    const timeoutId = setTimeout(() => {
      update()
      intervalId = setInterval(update, 60 * 60 * 1000)
    }, msUntilNextHour)
    return () => { clearTimeout(timeoutId); clearInterval(intervalId) }
  }, [])
  const [activeMood, setActiveMood] = useState("")

  const load = useCallback(async () => {
    setLoading(true)

    const [diaryRes, goalsRes] = await Promise.allSettled([
      fetch("/api/diary?limit=100"),
      fetch("/api/goals"),
    ])

    async function json<T>(r: PromiseSettledResult<Response>): Promise<T | null> {
      if (r.status === "fulfilled" && r.value.ok) {
        try { return await r.value.json() } catch { return null }
      }
      return null
    }

    const diaryRaw = await json<{ entries?: DiaryEntry[] } | DiaryEntry[]>(diaryRes)
    const goalsRaw = await json<Goal[] | { goals?: Goal[] }>(goalsRes)

    const entries: DiaryEntry[] = Array.isArray(diaryRaw)
      ? diaryRaw
      : (diaryRaw as { entries?: DiaryEntry[] })?.entries ?? []

    const goals: Goal[] = Array.isArray(goalsRaw)
      ? goalsRaw
      : (goalsRaw as { goals?: Goal[] })?.goals ?? []

    // Count emotions
    const moodCounts = new Map<string, number>()
    entries.forEach(e => moodCounts.set(e.mood, (moodCounts.get(e.mood) ?? 0) + 1))

    const emotions: EmotionStat[] = Object.entries(MOOD_CONFIG)
      .map(([key, cfg]) => ({
        key,
        label: cfg.label,
        count: moodCounts.get(key) ?? 0,
        color: cfg.color,
        emoji: cfg.emoji,
      }))
      .filter(e => e.count > 0)
      .sort((a, b) => b.count - a.count)

    // This week
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const diaryCountThisWeek = entries.filter(e => new Date(e.created_at) >= weekAgo).length

    // Goal rate
    const completed = goals.filter(g => g.status === "completed").length
    const goalCompletionRate = goals.length > 0
      ? Math.round((completed / goals.length) * 100)
      : 0

    setData({
      emotions,
      totalDiaries: entries.length,
      recentMood: entries[0]?.mood ?? "보통",
      goals: goals.filter(g => g.status === "in_progress"),
      diaryCountThisWeek,
      goalCompletionRate,
      entries,
    })
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div
      className="relative flex flex-col overflow-hidden"
      style={{ minHeight: "calc(100vh - 3.5rem)" }}
    >
      <style>{WELLNESS_STYLES}</style>

      {/* Background */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse at 50% -10%, #4a2d6655 0%, transparent 55%),
            radial-gradient(ellipse at 20% 60%, #f9731614 0%, transparent 40%),
            radial-gradient(ellipse at 80% 40%, #fbbf2410 0%, transparent 40%),
            linear-gradient(135deg, #1a0f2e 0%, #2d1b4e 45%, #1a1040 75%, #0f0820 100%)
          `,
        }}
      />
      <div className="absolute inset-0 pointer-events-none">
        <BgStars />
      </div>

      {/* Header */}
      <div className="relative flex items-center justify-between px-6 pt-5 pb-1" style={{ zIndex: 10 }}>
        <div>
          <div className="text-[12px] tracking-widest uppercase mb-0.5" style={{ color: "#fbbf24bb" }}>
            ✦ Mental Wellness
          </div>
          <div className="text-xl font-semibold" style={{ color: "rgba(255,255,255,0.92)" }}>
            마음을 돌보는 시간
          </div>
        </div>
        <Button
          variant="ghost" size="icon"
          className="size-8 rounded-full text-white/30 hover:text-white/70 hover:bg-white/5"
          style={{ border: "1px solid rgba(255,255,255,0.1)" }}
          onClick={load} disabled={loading}
        >
          {loading
            ? <Loader2 className="size-3.5 animate-spin" />
            : <RefreshCw className="size-3.5" />}
        </Button>
      </div>

      {/* Main 3-column grid */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center relative" style={{ zIndex: 10 }}>
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="size-8 animate-spin" style={{ color: "#fbbf24" }} />
            <span className="text-base" style={{ color: "#fbbf2488" }}>
              니온이 정원을 준비하는 중…
            </span>
          </div>
        </div>
      ) : data ? (
        <div
          className="relative flex-1 grid gap-4 px-5 py-3"
          style={{ gridTemplateColumns: "1fr 1.1fr 1fr", zIndex: 10, animation: "ws-rise 0.4s ease-out" }}
        >
          {/* Left: Healing Tree + Emotion chart + Calendar */}
          <HealingTree emotions={data.emotions} totalDiaries={data.totalDiaries} entries={data.entries} />

          {/* Center: Nion */}
          <NionCenter
            recentMood={data.recentMood}
            nionState={nionState}
            activeMood={activeMood}
            onMoodSelect={setActiveMood}
          />

          {/* Right: Counseling space */}
          <CounselingSpace
            goals={data.goals}
            diaryCountThisWeek={data.diaryCountThisWeek}
            goalCompletionRate={data.goalCompletionRate}
          />
        </div>
      ) : null}

      {/* Bottom: Chat CTA */}
      <div className="relative px-5 pb-5 pt-1" style={{ zIndex: 10 }}>
        <Link href="/chat">
          <div
            className="flex items-center gap-3 rounded-2xl px-5 py-3.5 cursor-pointer transition-all hover:bg-white/5"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(251,191,36,0.18)",
              backdropFilter: "blur(12px)",
            }}
          >
            <Image
              src="/nion-default.png" alt="Nion" width={32} height={32}
              style={{ filter: "drop-shadow(0 0 8px #fbbf24bb)" }}
            />
            <span className="flex-1 text-base italic" style={{
              color: "rgba(255,255,255,0.60)",
              fontFamily: "Georgia, serif",
            }}>
              니온에게 마음을 털어놓으세요…
            </span>
            <div className="rounded-full p-1.5" style={{ background: "#fbbf2418" }}>
              <MessageCircle size={16} style={{ color: "#fbbf24" }} />
            </div>
          </div>
        </Link>
      </div>
    </div>
  )
}
