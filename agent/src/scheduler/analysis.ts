// Background analysis scheduler.
//
// Job schedules and enabled/disabled state are kept in sync with the
// gateway's builtinSystemJobs (cron.go):
//
//   conversation_analysis : every 10 min  — skips if no new diary entries today
//   pattern_analysis      : 0 6 * * *     — daily 06:00
//   memory_compaction     : 0 5 * * 1     — Monday 05:00
//
// Per-user enabled state is read from users.preferences.scheduler.disabled_jobs
// before each run, matching the ToggleSystemJob API in the gateway.

import path from "path";
import os from "os";
import fs from "fs";
import pg from "pg";
import {
  createAgentSession,
  SettingsManager,
  SessionManager,
  DefaultResourceLoader,
  type AgentSessionEvent,
} from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";

const { Pool } = pg;

// ── DB pool ───────────────────────────────────────────────────────────────────

let _pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!_pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL not set");
    _pool = new Pool({
      connectionString,
      max: 10,
      connectionTimeoutMillis: 5_000,  // fail fast if DB is unreachable
      idleTimeoutMillis: 30_000,        // release idle connections after 30 s
    });
  }
  return _pool;
}

async function query<T extends pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(sql, params);
  return result.rows;
}

// ── Cron expression parser ────────────────────────────────────────────────────
// Supports the subset used in builtinSystemJobs:
//   */N * * * *          every N minutes
//   0 H * * *            daily at H:00
//   0 H * * D            weekly on day D at H:00  (D=0 Sun … 6 Sat)
//   0 H D1-D2 * *        monthly on day range at H:00

function cronMatches(expr: string, now: Date): boolean {
  const [minPart, hourPart, domPart, , dowPart] = expr.trim().split(/\s+/);

  // minute
  if (minPart.startsWith("*/")) {
    const n = parseInt(minPart.slice(2), 10);
    if (now.getMinutes() % n !== 0) return false;
  } else if (minPart !== "*") {
    if (now.getMinutes() !== parseInt(minPart, 10)) return false;
  }

  // hour
  if (hourPart.startsWith("*/")) {
    const n = parseInt(hourPart.slice(2), 10);
    if (now.getHours() % n !== 0) return false;
  } else if (hourPart !== "*") {
    if (now.getHours() !== parseInt(hourPart, 10)) return false;
  }

  // day of month (range like 28-31)
  if (domPart !== "*") {
    const d = now.getDate();
    if (domPart.includes("-")) {
      const [lo, hi] = domPart.split("-").map(Number);
      if (d < lo || d > hi) return false;
    } else {
      if (d !== parseInt(domPart, 10)) return false;
    }
  }

  // day of week (0=Sun … 6=Sat)
  if (dowPart !== "*") {
    if (now.getDay() !== parseInt(dowPart, 10)) return false;
  }

  return true;
}

// ── pi-coding-agent setup ─────────────────────────────────────────────────────
// Auth is read automatically from ~/.pi/agent/auth.json (synced by auth.ts).
// We use a minimal resource loader (no skills/tools) so the model acts as a
// pure text generator — appropriate for background analysis jobs.

const AGENT_DIR = path.resolve(process.env.AGENT_DIR ?? process.cwd());
const SKILLS_DIR = path.resolve(
  process.env.SKILLS_DIR ?? path.join(AGENT_DIR, "skills"),
);

// Cache the resource loader — scans disk once and reuses across calls.
// We use a minimal loader: no skills, no AGENTS.md context.
// Analysis jobs are pure text-generation tasks — loading 30+ skills and routing
// guidelines into context wastes tokens without any benefit.
let _resourceLoader: DefaultResourceLoader | null = null;

async function getResourceLoader(): Promise<DefaultResourceLoader> {
  if (_resourceLoader) return _resourceLoader;
  const loader = new DefaultResourceLoader({
    cwd: SKILLS_DIR,
    agentDir: AGENT_DIR,
    // noSkills: exclude <available_skills> XML (unneeded for JSON-only output).
    // Confirmed as an official API in resource-loader.d.ts line 61.
    noSkills: true,
    // Override system prompt to a minimal analyst identity — prevents AGENTS.md
    // and SOUL.md persona from being injected into every analysis call.
    systemPromptOverride: () =>
      "You are a concise data analyst. " +
      "Output only valid JSON with no additional text or explanation.",
  });
  await loader.reload();
  _resourceLoader = loader;
  return loader;
}

// Maximum wall-clock time allowed for a single callClaude() invocation.
// If the agent session doesn't fire agent_end within this window, the call
// rejects so the background job can log the failure and move on.
const CALL_CLAUDE_TIMEOUT_MS = 90_000;

// Each callClaude() creates a fresh, isolated session (no accumulated history).
// Sessions are written to a temp dir and cleaned up afterward.
async function callClaude(prompt: string, _maxTokens = 1024): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = getModel("anthropic" as any, "claude-sonnet-4-5" as any);
  const settingsManager = SettingsManager.inMemory({});

  const sessionDir = path.join(os.tmpdir(), `starnion-analysis-${Date.now()}`);
  await fs.promises.mkdir(sessionDir, { recursive: true });
  const sessionManager = SessionManager.create(SKILLS_DIR, sessionDir);

  const resourceLoader = await getResourceLoader();

  const { session } = await createAgentSession({
    cwd: SKILLS_DIR,
    model,
    settingsManager,
    sessionManager,
    resourceLoader,
  });

  const chunks: string[] = [];
  let unsubscribe: (() => void) | undefined;

  try {
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        unsubscribe = session.subscribe((event: AgentSessionEvent) => {
          if (event.type === "message_update") {
            const ae = event.assistantMessageEvent;
            if (ae.type === "text_delta") chunks.push(ae.delta);
          } else if (event.type === "agent_end") {
            resolve();
          }
        });
        session.prompt(prompt).catch(reject);
      }),
      // Hard timeout: reject if the agent session never fires agent_end.
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`callClaude timed out after ${CALL_CLAUDE_TIMEOUT_MS / 1000}s`)),
          CALL_CLAUDE_TIMEOUT_MS,
        ),
      ),
    ]);
  } finally {
    unsubscribe?.();
    // Clean up temp session dir (best-effort)
    fs.promises.rm(sessionDir, { recursive: true, force: true }).catch(() => {});
  }

  return chunks.join("").trim();
}

// ── JSON extraction ───────────────────────────────────────────────────────────

function extractJson(text: string): Record<string, unknown> | null {
  try { return JSON.parse(text) as Record<string, unknown>; } catch { /* continue */ }
  const blockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (blockMatch) {
    try { return JSON.parse(blockMatch[1]) as Record<string, unknown>; } catch { /* continue */ }
  }
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]) as Record<string, unknown>; } catch { /* continue */ }
  }
  return null;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(`[Scheduler] ${new Date().toISOString()} ${msg}`);
}

function isoWeekLabel(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// ── Per-user job enabled check ────────────────────────────────────────────────
// Mirrors isJobDisabled() in gateway/internal/adapter/handler/cron.go

async function isJobDisabledForUser(userId: string, jobId: string): Promise<boolean> {
  const rows = await query<{ preferences: string | null }>(
    `SELECT preferences FROM users WHERE id = $1`,
    [userId],
  );
  const raw = rows[0]?.preferences;
  if (!raw) return false;
  try {
    const prefs = JSON.parse(raw) as Record<string, unknown>;
    const scheduler = prefs?.scheduler as Record<string, unknown> | undefined;
    const disabled = scheduler?.disabled_jobs as unknown[];
    return Array.isArray(disabled) && disabled.includes(jobId);
  } catch {
    return false;
  }
}

// ── Active users ──────────────────────────────────────────────────────────────

async function getActiveUserIds(): Promise<string[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    const rows = await query<{ user_id: string }>(`
      SELECT DISTINCT user_id::text FROM (
        SELECT user_id FROM finances       WHERE created_at > NOW() - INTERVAL '30 days'
        UNION
        SELECT user_id FROM conversations  WHERE created_at > NOW() - INTERVAL '30 days'
        UNION
        SELECT user_id FROM planner_tasks  WHERE created_at > NOW() - INTERVAL '30 days'
      ) t
    `);
    return rows.map((r) => r.user_id);
  } catch (err) {
    log(`ERROR fetching active users: ${err}`);
    return [];
  }
}

// ── knowledge_base upsert ─────────────────────────────────────────────────────

async function kbUpsert(userId: string, key: string, value: string, source: string): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM knowledge_base WHERE user_id = $1 AND key = $2`, [userId, key]);
    await client.query(
      `INSERT INTO knowledge_base (user_id, key, value, source) VALUES ($1, $2, $3, $4)`,
      [userId, key, value, source],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Job 1: Conversation analysis ──────────────────────────────────────────────
// Runs on "*/10 * * * *" — returns early if no new diary entries (cheap DB check)

async function analyzeConversation(userId: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  const entries = await query<{
    entry_date: string; title: string; content: string; mood: string;
  }>(
    `SELECT entry_date::text, one_liner AS title, COALESCE(full_note, '') AS content, mood
     FROM planner_diary WHERE user_id = $1 AND entry_date = $2 AND archived_at IS NULL
     ORDER BY created_at`,
    [userId, today],
  );
  if (entries.length === 0) return; // no diary today — skip silently

  // Skip if today's analysis already exists
  const existing = await query<{ id: string }>(
    `SELECT id FROM knowledge_base WHERE user_id = $1 AND key = $2 LIMIT 1`,
    [userId, `conversation:analysis:${today}`],
  );
  if (existing.length > 0) return; // already ran today

  const logsText = entries
    .map((e) => `  [${e.mood}] ${e.title || "(제목 없음)"}: ${e.content.slice(0, 300)}`)
    .join("\n");

  const prompt =
    "당신은 사용자 기록 분석 전문가입니다. " +
    "아래 오늘의 기록을 분석하여 핵심 인사이트를 추출하세요.\n\n" +
    "반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):\n" +
    "```json\n{\n" +
    '  "insights": [{"type": "spending_intent|emotional_state|key_decision|life_event|financial_concern", ' +
    '"summary": "한국어 요약 (1문장)", "detail": "상세 내용 (2-3문장)", "confidence": 0.85}],\n' +
    '  "overall_mood": "positive|neutral|negative|mixed",\n' +
    '  "topics": ["주제1", "주제2"]\n}\n```\n\n' +
    "규칙: confidence 0.5 미만 제외, 최대 5개, topics 최대 3개\n\n" +
    `데이터:\n[${today} 기록]\n${logsText}`;

  const response = await callClaude(prompt, 1024);
  const result = extractJson(response);
  if (!result) { log(`conversation_analysis: JSON parse failed (user=${userId.slice(0, 8)}…)`); return; }

  await kbUpsert(userId, `conversation:analysis:${today}`, JSON.stringify(result), "conversation_analyzer");
  const count = (result.insights as unknown[])?.length ?? 0;
  log(`conversation_analysis: ${count} insights, mood=${result.overall_mood} (user=${userId.slice(0, 8)}…)`);
}

// ── Job 2: Pattern analysis ───────────────────────────────────────────────────

async function analyzePatterns(userId: string): Promise<void> {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const days30 = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const days60 = new Date(today.getTime() - 60 * 86400000).toISOString().slice(0, 10);
  const thisMonth = today.toISOString().slice(0, 7);

  // Skip if today's pattern analysis already ran
  const existingPattern = await query<{ id: string }>(
    `SELECT id FROM knowledge_base WHERE user_id = $1 AND key = $2 LIMIT 1`,
    [userId, `pattern:analysis:${todayStr}`],
  );
  if (existingPattern.length > 0) {
    log(`pattern_analysis: already ran today (user=${userId.slice(0, 8)}…)`);
    return;
  }

  const [{ cnt }] = await query<{ cnt: string }>(
    `SELECT COUNT(DISTINCT DATE(created_at))::text AS cnt FROM finances
     WHERE user_id = $1 AND amount < 0 AND created_at >= $2`,
    [userId, days30],
  );
  if (parseInt(cnt) < 3) {
    log(`pattern_analysis: insufficient data (${cnt} days) (user=${userId.slice(0, 8)}…)`);
    return;
  }

  const dailyTotals = await query<{ d: string; total: string }>(
    `SELECT DATE(created_at)::text AS d, SUM(ABS(amount))::text AS total
     FROM finances WHERE user_id = $1 AND amount < 0 AND created_at >= $2
     GROUP BY d ORDER BY d DESC LIMIT 30`,
    [userId, days30],
  );
  const catTotals = await query<{ category: string; total: string; cnt: string }>(
    `SELECT category, SUM(ABS(amount))::text AS total, COUNT(*)::text AS cnt
     FROM finances WHERE user_id = $1 AND amount < 0 AND TO_CHAR(created_at,'YYYY-MM') = $2
     GROUP BY category ORDER BY total::numeric DESC LIMIT 10`,
    [userId, thisMonth],
  );
  const WEEKDAYS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  const weekdayRows = await query<{ dow: string; category: string; avg_amt: string; cnt: string }>(
    `SELECT EXTRACT(DOW FROM created_at)::int::text AS dow, category,
            AVG(ABS(amount))::int::text AS avg_amt, COUNT(*)::text AS cnt
     FROM finances WHERE user_id = $1 AND amount < 0 AND created_at >= $2
     GROUP BY dow, category HAVING COUNT(*) >= 2
     ORDER BY dow, avg_amt::numeric DESC LIMIT 20`,
    [userId, days60],
  );
  const recent = await query<{ d: string; category: string; amount: string; description: string }>(
    `SELECT created_at::date::text AS d, category, amount::text, COALESCE(description,'') AS description
     FROM finances WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [userId],
  );
  const diaryMoods = await query<{ entry_date: string; mood: string; content: string }>(
    `SELECT entry_date::text, mood, LEFT(COALESCE(full_note, one_liner), 80) AS content
     FROM planner_diary WHERE user_id = $1 ORDER BY entry_date DESC LIMIT 10`,
    [userId],
  );
  const insights = await query<{ key: string; value: string }>(
    `SELECT key, value FROM knowledge_base
     WHERE user_id = $1 AND key LIKE 'conversation:analysis:%'
     ORDER BY created_at DESC LIMIT 7`,
    [userId],
  );

  const lines: string[] = [];
  lines.push("[최근 30일 일별 지출]");
  dailyTotals.forEach((r) => lines.push(`  ${r.d}: ${parseInt(r.total).toLocaleString()}원`));
  lines.push(`\n[이번달(${thisMonth}) 카테고리별 지출]`);
  catTotals.forEach((r) => lines.push(`  ${r.category}: ${parseInt(r.total).toLocaleString()}원 (${r.cnt}건)`));
  lines.push("\n[요일별 카테고리 평균 지출 (60일, 2회 이상)]");
  weekdayRows.forEach((r) =>
    lines.push(`  ${WEEKDAYS[parseInt(r.dow)]} - ${r.category}: 평균 ${parseInt(r.avg_amt).toLocaleString()}원 (${r.cnt}건)`),
  );
  lines.push("\n[최근 거래 20건]");
  recent.forEach((r) => lines.push(`  ${r.d} ${r.category} ${parseInt(r.amount).toLocaleString()}원 ${r.description}`));
  lines.push("\n[최근 한마디/감정 (10건)]");
  diaryMoods.forEach((r) => lines.push(`  ${r.entry_date} [${r.mood}]: ${r.content}`));
  if (insights.length > 0) {
    lines.push("\n[최근 대화 분석 인사이트]");
    for (const row of insights) {
      try {
        const d = JSON.parse(row.value) as { overall_mood?: string; topics?: string[] };
        lines.push(`  ${row.key.replace("conversation:analysis:", "")} (${d.overall_mood ?? ""}): ${(d.topics ?? []).join(", ")}`);
      } catch { /* skip */ }
    }
  }

  const prompt =
    "당신은 재정 패턴 분석 전문가입니다. 아래 사용자의 지출 및 행동 데이터를 분석하여 반복 패턴을 감지하세요.\n\n" +
    "반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):\n" +
    '```json\n{\n  "patterns": [{"type": "day_of_week_spending|recurring_payment|spending_velocity|emotional_trend|temporal_comparison", ' +
    '"description": "사용자에게 보낼 한국어 설명 (1-2문장)", "category": "관련 카테고리", "confidence": 0.85}]\n}\n```\n\n' +
    `규칙: confidence 0.6 미만 제외, 최대 5개\n\n데이터:\n${lines.join("\n")}`;

  const response = await callClaude(prompt, 1024);
  const result = extractJson(response);
  if (!result) { log(`pattern_analysis: JSON parse failed (user=${userId.slice(0, 8)}…)`); return; }

  await kbUpsert(userId, `pattern:analysis:${todayStr}`, JSON.stringify(result), "pattern_analyzer");
  log(`pattern_analysis: ${(result.patterns as unknown[])?.length ?? 0} patterns (user=${userId.slice(0, 8)}…)`);
}

// ── Job 3: Memory compaction ──────────────────────────────────────────────────

async function compactMemory(userId: string): Promise<void> {
  const today = new Date();
  const cutoff = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const veryOld = new Date(today.getTime() - 365 * 86400000).toISOString().slice(0, 10);

  const entries = await query<{
    id: string; entry_date: string; title: string; content: string; mood: string;
  }>(
    `SELECT id::text, entry_date::text, one_liner AS title, COALESCE(full_note, '') AS content, mood
     FROM planner_diary WHERE user_id = $1 AND entry_date < $2 AND entry_date >= $3
     AND archived_at IS NULL
     ORDER BY entry_date`,
    [userId, cutoff, veryOld],
  );
  if (entries.length < 7) {
    log(`memory_compaction: only ${entries.length} old entries (need 7) (user=${userId.slice(0, 8)}…)`);
    return;
  }

  const weekly = new Map<string, typeof entries>();
  for (const e of entries) {
    const label = isoWeekLabel(new Date(e.entry_date));
    if (!weekly.has(label)) weekly.set(label, []);
    weekly.get(label)!.push(e);
  }

  const summaries: { key: string; value: string; ids: string[] }[] = [];

  for (const [weekLabel, weekEntries] of [...weekly.entries()].sort()) {
    if (weekEntries.length < 2) continue;
    const logsText = weekEntries
      .map((e) => `  ${e.entry_date} [${e.mood}] ${e.title || "(제목 없음)"}: ${e.content.slice(0, 200)}`)
      .join("\n");
    const prompt =
      "당신은 개인 기록 요약 전문가입니다. 아래의 1주일간 일기 기록을 요약하세요.\n\n" +
      "반드시 아래 JSON 형식으로만 응답하세요:\n```json\n{\n" +
      `  "week": "${weekLabel}", "summary": "이 주의 전체 요약 (2-3문장)",\n` +
      '  "key_events": ["이벤트1"], "emotional_trend": "positive|neutral|negative|mixed",\n' +
      '  "financial_context": "", "topics": ["주제1"]\n}\n```\n\n' +
      `규칙: key_events 최대 5개, topics 최대 3개\n\n데이터:\n[${weekLabel}]\n${logsText}`;
    const response = await callClaude(prompt, 512);
    const summary = extractJson(response);
    if (!summary) { log(`memory_compaction: parse failed for ${weekLabel}, skipping`); continue; }
    summaries.push({ key: `memory:weekly_summary:${weekLabel}`, value: JSON.stringify(summary), ids: weekEntries.map((e) => e.id) });
  }

  if (summaries.length === 0) {
    log(`memory_compaction: no eligible weeks (user=${userId.slice(0, 8)}…)`);
    return;
  }

  for (const s of summaries) await kbUpsert(userId, s.key, s.value, "memory_compactor");

  // Soft-delete: stamp archived_at instead of hard-deleting.
  // Originals are preserved for recovery if an LLM summary contains hallucinations.
  // The partial index on (user_id, entry_date WHERE archived_at IS NULL) keeps
  // active-record queries fast even as the archive grows.
  const allIds = summaries.flatMap((s) => s.ids);
  await query(
    `UPDATE planner_diary SET archived_at = NOW()
     WHERE user_id = $1 AND id = ANY($2::bigint[]) AND archived_at IS NULL`,
    [userId, allIds],
  );
  log(`memory_compaction: ${summaries.length} weeks, ${allIds.length} entries archived (user=${userId.slice(0, 8)}…)`);
}

// ── Job 4: User Schedules ──────────────────────────────────────────────────────
// Runs on "*/15 * * * *" — checks all user-created schedules with task_prompt
// and executes them when due, storing the AI output and optionally delivering via Telegram.

interface SchedTime {
  hour: number;
  minute: number;
  day_of_week?: string; // "0"=Sun … "6"=Sat; empty = every day
  date?: string;        // "YYYY-MM-DD" for one-shot schedules
}

interface ScheduleEntry {
  title: string;
  type: string;
  status: string;
  task_prompt?: string;
  last_output?: string;
  deliver_to?: string;
  schedule: SchedTime;
  last_sent?: string;
}

/**
 * Returns true if the given schedTime is due within the current 15-minute window.
 * "Due" means: the scheduled hour:minute falls in [now-14min, now] and has not
 * already been sent in the current hour:minute slot.
 */
function isScheduleDue(s: SchedTime, now: Date, lastSent: string | undefined): boolean {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const schedMin = s.hour * 60 + s.minute;

  // Must fall within the current 15-minute polling window
  const delta = nowMin - schedMin;
  if (delta < 0 || delta >= 15) return false;

  // Day-of-week filter
  if (s.day_of_week !== undefined && s.day_of_week !== "") {
    if (now.getDay() !== parseInt(s.day_of_week, 10)) return false;
  }

  // One-shot date filter
  if (s.date) {
    const today = now.toISOString().slice(0, 10);
    if (s.date !== today) return false;
  }

  // Dedup: skip if last_sent is within the same hour:minute slot today
  if (lastSent) {
    const ls = new Date(lastSent);
    if (
      ls.getFullYear() === now.getFullYear() &&
      ls.getMonth() === now.getMonth() &&
      ls.getDate() === now.getDate() &&
      ls.getHours() === s.hour &&
      ls.getMinutes() === s.minute
    ) {
      return false;
    }
  }

  return true;
}

// Gateway internal notify endpoint — delegates Telegram delivery to the gateway
// so that encrypted bot tokens are decrypted server-side, never in the agent.
const GATEWAY_HTTP_URL = process.env.GATEWAY_HTTP_URL ?? "http://localhost:8080";
const INTERNAL_SECRET = process.env.INTERNAL_LOG_SECRET ?? "";
const NOTIFY_ENDPOINT = `${GATEWAY_HTTP_URL}/api/v1/internal/notify`;

/** Send a message via the gateway's internal /notify endpoint.
 *  The gateway resolves the user's Telegram chat_id and decrypts the bot token. */
async function sendViaTelegram(userId: string, message: string): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (INTERNAL_SECRET) headers["X-Internal-Secret"] = INTERNAL_SECRET;

  try {
    const resp = await fetch(NOTIFY_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({ user_id: userId, message }),
      signal: AbortSignal.timeout(10_000), // 10-second timeout — prevents stalled jobs
    });
    if (!resp.ok) {
      log(`user_schedules: notify gateway returned ${resp.status} for user=${userId.slice(0, 8)}…`);
    }
  } catch (err) {
    log(`user_schedules: notify gateway error for user=${userId.slice(0, 8)}…: ${err}`);
  }
}

/**
 * Per-tick runner for user_schedules. Called directly from tick() instead of
 * through runJobForAllUsers() — scans all users' schedules in one DB query.
 */
async function tickUserSchedules(): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  const now = new Date();

  // Fetch all active schedules that have a task_prompt across all users
  let rows: Array<{ user_id: string; key: string; value: string }>;
  try {
    rows = await query<{ user_id: string; key: string; value: string }>(
      `SELECT user_id::text, key, value FROM knowledge_base
       WHERE key LIKE 'schedule:%'`,
    );
  } catch (err) {
    log(`user_schedules: DB query failed: ${err}`);
    return;
  }

  let ran = 0;

  for (const row of rows) {
    let entry: ScheduleEntry;
    try {
      entry = JSON.parse(row.value) as ScheduleEntry;
    } catch {
      continue;
    }

    // Only process active AI-task schedules
    if (entry.status !== "active") continue;
    if (!entry.task_prompt || entry.task_prompt.trim() === "") continue;

    if (!isScheduleDue(entry.schedule, now, entry.last_sent)) continue;

    const userId = row.user_id;
    const schedId = row.key.replace("schedule:", "");

    log(`user_schedules: running "${entry.title}" (id=${schedId.slice(0, 8)}…, user=${userId.slice(0, 8)}…)`);

    try {
      const taskPrompt = entry.task_prompt.length > 4000
        ? entry.task_prompt.slice(0, 4000)
        : entry.task_prompt;
      const output = await callClaude(taskPrompt, 1024);

      // Write last_output and last_sent back to knowledge_base
      entry.last_output = output;
      entry.last_sent = now.toISOString();
      await query(
        `UPDATE knowledge_base SET value = $1 WHERE user_id = $2::uuid AND key = $3`,
        [JSON.stringify(entry), userId, row.key],
      );

      // Deliver if configured
      if (entry.deliver_to === "telegram") {
        const msg = `📅 *${entry.title}*\n\n${output}`;
        await sendViaTelegram(userId, msg);
      }

      ran++;
    } catch (err) {
      log(`user_schedules: ERROR for schedule ${schedId.slice(0, 8)}… user=${userId.slice(0, 8)}…: ${err}`);
    }
  }

  if (ran > 0) log(`user_schedules: ${ran} schedule(s) executed`);
}

// ── Job runner (with per-user disabled check) ─────────────────────────────────

type JobFn = (userId: string) => Promise<void>;

async function runJobForAllUsers(jobId: string, fn: JobFn): Promise<void> {
  const users = await getActiveUserIds();
  if (users.length === 0) { log(`${jobId}: no active users`); return; }

  let ran = 0;
  for (const uid of users) {
    // Respect the notification center's enabled/disabled toggle per user
    const disabled = await isJobDisabledForUser(uid, jobId);
    if (disabled) { log(`${jobId}: skipped (disabled by user ${uid.slice(0, 8)}…)`); continue; }
    try {
      await fn(uid);
      ran++;
    } catch (err) {
      log(`ERROR ${jobId} user=${uid.slice(0, 8)}…: ${err}`);
    }
  }
  if (ran > 0) log(`${jobId}: done (${ran}/${users.length} users)`);
}

// ── Job definitions — cron expressions MUST match builtinSystemJobs in cron.go ─

interface Job {
  /** Must match the ID in builtinSystemJobs (cron.go) */
  id: string;
  fn: JobFn;
  /** Cron expression — keep in sync with cron.go builtinSystemJobs[].Schedule */
  cronExpr: string;
}

const JOBS: Job[] = [
  {
    id: "conversation_analysis",
    fn: analyzeConversation,
    cronExpr: "*/10 * * * *", // every 10 min; fn exits early if no new entries
  },
  {
    id: "pattern_analysis",
    fn: analyzePatterns,
    cronExpr: "0 6 * * *", // daily 06:00
  },
  {
    id: "memory_compaction",
    fn: compactMemory,
    cronExpr: "0 5 * * 1", // Monday 05:00
  },
];

// user_schedules runs every 15 min but uses a custom tick function (not per-user)
const USER_SCHEDULES_CRON = "*/15 * * * *";

// ── Tick ──────────────────────────────────────────────────────────────────────

const _ranInMinute = new Set<string>();

function tick(): void {
  const now = new Date();
  const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;

  for (const job of JOBS) {
    const jobKey = `${job.id}:${minuteKey}`;
    if (_ranInMinute.has(jobKey)) continue;
    if (!cronMatches(job.cronExpr, now)) continue;

    _ranInMinute.add(jobKey);
    if (_ranInMinute.size > 500) {
      [..._ranInMinute].slice(0, 200).forEach((k) => _ranInMinute.delete(k));
    }

    runJobForAllUsers(job.id, job.fn).catch((err) =>
      log(`UNHANDLED ERROR in ${job.id}: ${err}`),
    );
  }

  // user_schedules: runs every 15 min with a dedicated scanner (not per-user)
  const usKey = `user_schedules:${minuteKey}`;
  if (!_ranInMinute.has(usKey) && cronMatches(USER_SCHEDULES_CRON, now)) {
    _ranInMinute.add(usKey);
    tickUserSchedules().catch((err) =>
      log(`UNHANDLED ERROR in user_schedules: ${err}`),
    );
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

let _intervalId: ReturnType<typeof setInterval> | null = null;

/** Start the analysis scheduler. Call once at agent startup. */
export function startAnalysisScheduler(): void {
  if (_intervalId) return;
  log("Analysis scheduler started");
  _intervalId = setInterval(tick, 60_000);
}

/** Stop the scheduler (tests / graceful shutdown). */
export function stopAnalysisScheduler(): void {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
    log("Analysis scheduler stopped");
  }
}

/**
 * Manually trigger a specific analysis job for a single user.
 * Bypasses the cron schedule and disabled check (admin/test use).
 */
export async function triggerAnalysis(
  type: "conversation" | "patterns" | "compact",
  userId: string,
): Promise<string> {
  const fnMap: Record<string, JobFn> = {
    conversation: analyzeConversation,
    patterns: analyzePatterns,
    compact: compactMemory,
  };
  const fn = fnMap[type];
  if (!fn) return `Unknown analysis type: ${type}`;
  log(`Manual trigger: ${type} for user ${userId.slice(0, 8)}…`);
  await fn(userId);
  return "OK";
}
