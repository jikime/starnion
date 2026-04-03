"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { usePlannerStore, type Priority } from "@/lib/planner-store"
import { cn } from "@/lib/utils"
import {
  Zap, Sparkles, X, ChevronRight, Check, ArrowLeft, BookOpen, Target, ListChecks,
} from "lucide-react"
import { Input } from "@/components/ui/input"

// ---------------------------------------------------------------------------
// Parser: "A1 /역할/ 내용 #14:00"
// ---------------------------------------------------------------------------
interface ParsedInput {
  priority: Priority | null
  order: number | null
  roleSlug: string | null   // content between /…/
  title: string
  timeStart: number | null  // decimal hour e.g. 14.5 = 14:30
  timeEnd: number | null
  isVague: boolean          // no priority prefix
}

function parseMagicInput(raw: string): ParsedInput {
  let s = raw.trim()

  // Priority prefix: A1, B2, C, A, b, etc.
  let priority: Priority | null = null
  let order: number | null = null
  const prioMatch = s.match(/^([ABCabc])(\d+)?\s+/)
  if (prioMatch) {
    priority = prioMatch[1].toUpperCase() as Priority
    order = prioMatch[2] ? parseInt(prioMatch[2], 10) : null
    s = s.slice(prioMatch[0].length)
  }

  // Role slug: /전문성/
  let roleSlug: string | null = null
  const roleMatch = s.match(/\/([^/]+)\/\s*/)
  if (roleMatch) {
    roleSlug = roleMatch[1].trim()
    s = s.replace(roleMatch[0], "")
  }

  // Time: #14:00 or #14:00-16:00
  let timeStart: number | null = null
  let timeEnd: number | null = null
  const timeMatch = s.match(/#(\d{1,2}):(\d{2})(?:-(\d{1,2}):(\d{2}))?/)
  if (timeMatch) {
    timeStart = parseInt(timeMatch[1], 10) + parseInt(timeMatch[2], 10) / 60
    if (timeMatch[3] !== undefined) {
      timeEnd = parseInt(timeMatch[3], 10) + parseInt(timeMatch[4], 10) / 60
    } else {
      timeEnd = timeStart + 1 // default 1-hour block
    }
    s = s.replace(timeMatch[0], "").trim()
  }

  const title = s.trim()
  const isVague = !priority && title.length > 0

  return { priority, order, roleSlug, title, timeStart, timeEnd, isVague }
}

// Match roleSlug against role names (fuzzy: contains)
function matchRole(slug: string, roles: { id: string; name: string }[]) {
  const lower = slug.toLowerCase()
  return roles.find(
    (r) =>
      r.name.toLowerCase().includes(lower) ||
      lower.includes(r.name.toLowerCase())
  )
}

// Nion SMART suggestion for vague input
function buildNionSuggestion(title: string): string {
  const lower = title.toLowerCase()
  if (lower.includes("영어") || lower.includes("공부")) {
    return `"${title}"는 너무 막연해요. "오늘 TED 영상 1편 보고 핵심 문장 3개 정리"처럼 구체화하고 A2에 배치할까요?`
  }
  if (lower.includes("운동") || lower.includes("헬스")) {
    return `"${title}"를 "오늘 20분 걷기 + 스쿼트 20개"로 구체화하고 B1에 넣어볼까요?`
  }
  if (lower.includes("독서") || lower.includes("책")) {
    return `"${title}"을 "30분 독서 후 A4 반쪽 요약 메모 작성"으로 구체화하면 어떨까요?`
  }
  return `"${title}"에 우선순위를 붙이지 않으면 실행이 미뤄져요. A1~C3 중 하나를 앞에 붙여볼까요?`
}

// ---------------------------------------------------------------------------
// 3-Step Goal Wizard
// ---------------------------------------------------------------------------
interface WizardProps {
  onClose: () => void
}

function GoalWizard({ onClose }: WizardProps) {
  const { roles, addTask, updateRoleBigRock, selectedDate } = usePlannerStore()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [selectedRoleId, setSelectedRoleId] = useState("")
  const [bigRock, setBigRock] = useState("")
  const [dailyTask, setDailyTask] = useState("")
  const [dailyPriority, setDailyPriority] = useState<Priority>("A")

  const selectedRole = roles.find((r) => r.id === selectedRoleId)

  const handleFinish = () => {
    if (!dailyTask.trim()) return
    addTask(dailyPriority, dailyTask.trim(), selectedRoleId || roles[0]?.id)
    if (selectedRoleId && bigRock.trim()) {
      updateRoleBigRock(selectedRoleId, bigRock.trim())
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div
        className="w-[420px] max-w-[90vw] rounded-xl border border-border bg-card shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="목표 입력 마법사"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-sidebar">
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded flex items-center justify-center"
              style={{ background: "var(--priority-a)", color: "#0d1117" }}
            >
              <Sparkles className="w-3 h-3" />
            </div>
            <span className="text-sm font-semibold text-foreground">목표 설정 마법사</span>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-0 px-5 pt-4 pb-2">
          {([1, 2, 3] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-0 flex-1">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border transition-all",
                    step > s
                      ? "border-transparent text-[#0d1117]"
                      : step === s
                      ? "border-transparent text-[#0d1117]"
                      : "border-border text-muted-foreground bg-muted"
                  )}
                  style={
                    step >= s
                      ? { background: "var(--priority-a)" }
                      : {}
                  }
                >
                  {step > s ? <Check className="w-3 h-3" /> : s}
                </div>
                <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                  {s === 1 ? "Why" : s === 2 ? "What" : "How"}
                </span>
              </div>
              {i < 2 && (
                <div
                  className={cn(
                    "flex-1 h-px mx-1 mb-4 transition-all",
                    step > s ? "" : "bg-border"
                  )}
                  style={step > s ? { background: "var(--priority-a)" } : {}}
                />
              )}
            </div>
          ))}
        </div>

        <div className="px-5 pb-5 space-y-4">
          {/* Step 1: Why — Select role / value */}
          {step === 1 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 shrink-0" style={{ color: "var(--priority-a)" }} />
                <div>
                  <p className="text-sm font-semibold text-foreground">이 목표는 어떤 가치를 위한 것인가요?</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">역할을 선택하면 목표가 가치와 연결됩니다</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {roles.map((role) => (
                  <button
                    key={role.id}
                    onClick={() => setSelectedRoleId(role.id)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left transition-all text-xs",
                      selectedRoleId === role.id
                        ? "border-[var(--priority-a)] bg-[var(--priority-a-bg)] text-foreground"
                        : "border-border bg-muted/40 text-muted-foreground hover:border-border hover:text-foreground hover:bg-accent"
                    )}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: role.color }} />
                    <span className="font-medium truncate">{role.name}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setStep(2)}
                disabled={!selectedRoleId}
                className={cn(
                  "w-full h-9 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-all",
                  selectedRoleId
                    ? "hover:opacity-85"
                    : "opacity-30 cursor-not-allowed bg-muted text-muted-foreground"
                )}
                style={selectedRoleId ? { background: "var(--priority-a)", color: "#0d1117" } : {}}
              >
                다음: 주간 핵심 목표 설정
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Step 2: What — Big Rock */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 shrink-0" style={{ color: "var(--priority-a)" }} />
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    이번 주, &lsquo;{selectedRole?.name}&rsquo; 역할의 핵심 목표는?
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">주간 나침반(Big Rock)에 고정됩니다</p>
                </div>
              </div>
              {selectedRole && (
                <div className="px-3 py-2 rounded-lg bg-muted/50 border border-border text-[10px] text-muted-foreground">
                  현재: <span className="text-foreground">{selectedRole.bigRock}</span>
                </div>
              )}
              <input
                value={bigRock}
                onChange={(e) => setBigRock(e.target.value)}
                placeholder="예: 스타니온 개발 문서 초안 완성"
                className="w-full h-9 px-3 rounded-lg border border-border bg-muted text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
                onKeyDown={(e) => e.key === "Enter" && bigRock.trim() && setStep(3)}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setStep(1)}
                  className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs text-muted-foreground border border-border hover:text-foreground hover:bg-accent transition-colors"
                >
                  <ArrowLeft className="w-3 h-3" />
                  이전
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!bigRock.trim()}
                  className={cn(
                    "flex-1 h-9 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-all",
                    bigRock.trim()
                      ? "hover:opacity-85"
                      : "opacity-30 cursor-not-allowed bg-muted text-muted-foreground"
                  )}
                  style={bigRock.trim() ? { background: "var(--priority-a)", color: "#0d1117" } : {}}
                >
                  다음: 오늘 실행 과업
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: How — Daily ABC task */}
          {step === 3 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <ListChecks className="w-4 h-4 shrink-0" style={{ color: "var(--priority-a)" }} />
                <div>
                  <p className="text-sm font-semibold text-foreground">오늘 당장 실행할 과업은?</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">일일 ABC 리스트에 즉시 배치됩니다</p>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-[10px] text-muted-foreground space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: selectedRole?.color }} />
                  <span className="text-foreground font-medium">{selectedRole?.name}</span>
                </div>
                {bigRock && <p className="pl-4 text-muted-foreground">&rarr; {bigRock}</p>}
              </div>
              {/* Priority picker */}
              <div className="flex gap-2">
                {(["A", "B", "C"] as Priority[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setDailyPriority(p)}
                    className={cn(
                      "flex-1 h-8 rounded-lg text-xs font-bold border transition-all",
                      dailyPriority === p ? "border-transparent" : "border-border bg-muted text-muted-foreground"
                    )}
                    style={
                      dailyPriority === p
                        ? {
                            background:
                              p === "A"
                                ? "var(--priority-a-bg)"
                                : p === "B"
                                ? "var(--priority-b-bg)"
                                : "var(--priority-c-bg)",
                            color:
                              p === "A"
                                ? "var(--priority-a)"
                                : p === "B"
                                ? "var(--priority-b)"
                                : "var(--priority-c)",
                            border:
                              `1px solid ${p === "A" ? "var(--priority-a)" : p === "B" ? "var(--priority-b)" : "var(--priority-c)"}`,
                          }
                        : {}
                    }
                  >
                    {p}
                    <span className="ml-1 text-[9px] font-normal opacity-70">
                      {p === "A" ? "필수" : p === "B" ? "중요" : "선택"}
                    </span>
                  </button>
                ))}
              </div>
              <input
                value={dailyTask}
                onChange={(e) => setDailyTask(e.target.value)}
                placeholder="예: README.md 초안 작성"
                className="w-full h-9 px-3 rounded-lg border border-border bg-muted text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
                onKeyDown={(e) => e.key === "Enter" && dailyTask.trim() && handleFinish()}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setStep(2)}
                  className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs text-muted-foreground border border-border hover:text-foreground hover:bg-accent transition-colors"
                >
                  <ArrowLeft className="w-3 h-3" />
                  이전
                </button>
                <button
                  onClick={handleFinish}
                  disabled={!dailyTask.trim()}
                  className={cn(
                    "flex-1 h-9 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all",
                    dailyTask.trim()
                      ? "hover:opacity-85"
                      : "opacity-30 cursor-not-allowed bg-muted text-muted-foreground"
                  )}
                  style={dailyTask.trim() ? { background: "var(--priority-a)", color: "#0d1117" } : {}}
                >
                  <Check className="w-3.5 h-3.5" />
                  과업 추가하기
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Magic Bar
// ---------------------------------------------------------------------------
export function MagicBar() {
  const { addTask, roles } = usePlannerStore()
  const [value, setValue] = useState("")
  const [focused, setFocused] = useState(false)
  const [nionSuggestion, setNionSuggestion] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [showWizard, setShowWizard] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const parsed = value.trim() ? parseMagicInput(value) : null

  // Live Nion coaching: show after 600ms of idle typing if input is vague
  useEffect(() => {
    if (!value.trim() || !parsed?.isVague) {
      setNionSuggestion(null)
      return
    }
    const timer = setTimeout(() => {
      setNionSuggestion(buildNionSuggestion(parsed.title))
    }, 600)
    return () => clearTimeout(timer)
  }, [value, parsed])

  const commit = useCallback(() => {
    const raw = value.trim()
    if (!raw) return

    const p = parseMagicInput(raw)
    const finalPriority: Priority = p.priority ?? "B"

    // Role matching
    let roleId = roles[0]?.id ?? ""
    if (p.roleSlug) {
      const matched = matchRole(p.roleSlug, roles)
      if (matched) roleId = matched.id
    }

    // Add task via store, then patch time if provided
    const { tasks } = usePlannerStore.getState()
    addTask(finalPriority, p.title || raw, roleId)
    // Patch the newly added task with time if #HH:MM was given
    if (p.timeStart !== null) {
      const newTask = usePlannerStore.getState().tasks.find(
        (t) =>
          !tasks.find((old) => old.id === t.id) &&
          t.title === (p.title || raw)
      )
      if (newTask) {
        usePlannerStore.getState().updateTask(newTask.id, {
          timeStart: Math.round(p.timeStart),
          timeEnd: p.timeEnd ? Math.round(p.timeEnd) : Math.round(p.timeStart) + 1,
        })
      }
    }

    // Feedback label
    const parts: string[] = []
    parts.push(finalPriority)
    if (p.roleSlug) {
      const matched = matchRole(p.roleSlug, roles)
      parts.push(matched ? matched.name : p.roleSlug)
    }
    if (p.timeStart !== null) {
      const h = Math.floor(p.timeStart)
      const m = Math.round((p.timeStart - h) * 60)
      parts.push(`${h}:${String(m).padStart(2, "0")} 블로킹`)
    }
    setFeedback(`[${parts.join(" · ")}] "${p.title || raw}" 추가됨`)
    setValue("")
    setNionSuggestion(null)
    setTimeout(() => setFeedback(null), 2800)
  }, [value, roles, addTask])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") commit()
    if (e.key === "Escape") {
      setValue("")
      setNionSuggestion(null)
      inputRef.current?.blur()
    }
  }

  // Determine hint preview labels from current parse
  const hintParts: { label: string; style?: React.CSSProperties }[] = []
  if (parsed?.priority) {
    hintParts.push({
      label: parsed.priority,
      style: { background: "var(--priority-a-bg)", color: "var(--priority-a)" },
    })
  }
  if (parsed?.roleSlug) {
    const matched = matchRole(parsed.roleSlug, roles)
    hintParts.push({
      label: matched ? matched.name : parsed.roleSlug,
      style: matched ? { background: `${matched.color}22`, color: matched.color } : undefined,
    })
  }
  if (parsed?.timeStart !== null && parsed?.timeStart !== undefined) {
    const h = Math.floor(parsed.timeStart)
    const m = Math.round((parsed.timeStart - h) * 60)
    hintParts.push({
      label: `${h}:${String(m).padStart(2, "0")}`,
      style: { background: "var(--priority-b-bg)", color: "var(--priority-b)" },
    })
  }

  return (
    <>
      <div className="px-4 pt-3 pb-2 shrink-0 space-y-1.5">
        {/* Input row */}
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border transition-all",
            focused
              ? "border-[var(--priority-a)] bg-card shadow-sm"
              : "border-border bg-muted"
          )}
        >
          <Zap
            className="ml-2.5 w-3.5 h-3.5 shrink-0 transition-colors"
            style={{ color: focused ? "var(--priority-a)" : "var(--muted-foreground)" }}
          />
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={handleKeyDown}
            placeholder='A1 /역할/ 내용 #14:00 — 또는 그냥 입력'
            className="flex-1 h-9 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none min-w-0"
            aria-label="매직 입력창"
          />
          {/* Live parse hints */}
          {hintParts.length > 0 && (
            <div className="flex items-center gap-1 pr-1 shrink-0">
              {hintParts.map((h, i) => (
                <span
                  key={i}
                  className="text-[9px] font-medium px-1.5 py-0.5 rounded"
                  style={h.style ?? { background: "var(--muted)", color: "var(--muted-foreground)" }}
                >
                  {h.label}
                </span>
              ))}
            </div>
          )}
          {value && (
            <button
              onMouseDown={(e) => { e.preventDefault(); setValue(""); setNionSuggestion(null) }}
              className="mr-1 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="지우기"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          <button
            onMouseDown={(e) => { e.preventDefault(); setShowWizard(true) }}
            className="mr-2 flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded border border-border hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title="3단계 목표 마법사"
          >
            <Sparkles className="w-3 h-3" />
            마법사
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); commit() }}
            disabled={!value.trim()}
            className="mr-2 h-7 px-3 rounded-md text-[10px] font-bold shrink-0 transition-all hover:opacity-85 disabled:opacity-25 disabled:cursor-not-allowed"
            style={{ background: "var(--priority-a)", color: "#0d1117" }}
          >
            추가
          </button>
        </div>

        {/* Nion coaching suggestion */}
        {nionSuggestion && (
          <div
            className="px-3 py-2 rounded-lg border text-[11px] leading-snug flex items-start gap-2"
            style={{
              background: "var(--priority-b-bg)",
              borderColor: "color-mix(in oklch, var(--priority-b) 30%, transparent)",
              color: "var(--priority-b)",
            }}
          >
            <Sparkles className="w-3 h-3 mt-0.5 shrink-0" />
            <span>{nionSuggestion}</span>
          </div>
        )}

        {/* Feedback toast */}
        {feedback && !nionSuggestion && (
          <p className="text-[10px] pl-1" style={{ color: "var(--status-done)" }}>
            {feedback}
          </p>
        )}

        {/* Syntax hint */}
        {focused && !value && (
          <p className="text-[10px] text-muted-foreground pl-1 opacity-60">
            팁: &ldquo;A1 /역할/ 과업 이름 #14:00&rdquo; 형식으로 한 번에 입력하세요
          </p>
        )}
      </div>

      {/* 3-step wizard modal */}
      {showWizard && <GoalWizard onClose={() => setShowWizard(false)} />}
    </>
  )
}
