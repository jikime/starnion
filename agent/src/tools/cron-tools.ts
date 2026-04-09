/**
 * cron-tools.ts — Natural-language cron schedule creation tool.
 *
 * Parses human-readable schedules (English & Korean) and creates a persistent
 * cron schedule in the gateway's knowledge_base via the internal API.
 *
 * Examples:
 *   "every day at 9am"        → hour:9  minute:0
 *   "every Monday at 6:30pm"  → hour:18 minute:30  day_of_week:"monday"
 *   "매일 오전 9시"             → hour:9  minute:0
 *   "매주 월요일 저녁 6시 30분"  → hour:18 minute:30  day_of_week:"monday"
 */

import http from "http";
import https from "https";
import { URL } from "url";
import { Type } from "@sinclair/typebox";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

// ── Schemas ───────────────────────────────────────────────────────────────────

const cronCreateSchema = Type.Object({
  description: Type.String({
    description:
      "Natural-language description of when and what to do. " +
      "Examples: 'every day at 9am send me a weather summary', " +
      "'매주 월요일 아침 9시에 주간 목표 확인해줘'.",
  }),
  deliver_to: Type.Optional(
    Type.Union([Type.Literal("telegram"), Type.Literal("")], {
      description: "Delivery channel: 'telegram' to send via Telegram, empty for store-only.",
    }),
  ),
});

// ── NL → schedTime parser ─────────────────────────────────────────────────────

interface SchedTime {
  hour: number;
  minute: number;
  day_of_week?: string;
}

interface ParseResult {
  sched: SchedTime;
  title: string;
  taskPrompt: string;
}

const DAY_NAMES: Record<string, string> = {
  // English
  monday: "monday", mon: "monday",
  tuesday: "tuesday", tue: "tuesday",
  wednesday: "wednesday", wed: "wednesday",
  thursday: "thursday", thu: "thursday",
  friday: "friday", fri: "friday",
  saturday: "saturday", sat: "saturday",
  sunday: "sunday", sun: "sunday",
  weekday: "weekday", weekdays: "weekday",
  weekend: "weekend", weekends: "weekend",
  // Korean day names
  월요일: "monday", 월: "monday",
  화요일: "tuesday", 화: "tuesday",
  수요일: "wednesday", 수: "wednesday",
  목요일: "thursday", 목: "thursday",
  금요일: "friday", 금: "friday",
  토요일: "saturday", 토: "saturday",
  일요일: "sunday", 일: "sunday",
  평일: "weekday",
  주말: "weekend",
};

/** Parse hour + minute from text. Returns undefined if no time found. */
function parseTime(text: string): { hour: number; minute: number } | undefined {
  const lower = text.toLowerCase();

  // Korean: "오전 9시", "오후 6시 30분", "오전 9시 30분"
  const koMatch = lower.match(/(?:(오전|오후)\s*)?(\d{1,2})시(?:\s*(\d{1,2})분)?/);
  if (koMatch) {
    let hour = parseInt(koMatch[2], 10);
    const minute = koMatch[3] ? parseInt(koMatch[3], 10) : 0;
    if (koMatch[1] === "오후" && hour < 12) hour += 12;
    if (koMatch[1] === "오전" && hour === 12) hour = 0;
    if (hour >= 0 && hour < 24) return { hour, minute: minute % 60 };
  }

  // English 12-hour: "9am", "9:30pm", "9:00 AM"
  const en12 = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (en12) {
    let hour = parseInt(en12[1], 10);
    const minute = en12[2] ? parseInt(en12[2], 10) : 0;
    const ampm = en12[3];
    if (ampm === "pm" && hour < 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
    if (hour >= 0 && hour < 24) return { hour, minute: minute % 60 };
  }

  // English 24-hour: "21:00", "at 21"
  const en24 = lower.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\b/);
  if (en24) {
    const hour = parseInt(en24[1], 10);
    const minute = en24[2] ? parseInt(en24[2], 10) : 0;
    if (hour >= 0 && hour < 24) return { hour, minute: minute % 60 };
  }

  // Named times
  if (/\b(morning|아침)\b/.test(lower))  return { hour: 9,  minute: 0 };
  if (/\b(noon|정오)\b/.test(lower))     return { hour: 12, minute: 0 };
  if (/\b(afternoon|오후)\b/.test(lower) && !koMatch) return { hour: 14, minute: 0 };
  if (/\b(evening|저녁)\b/.test(lower))  return { hour: 18, minute: 0 };
  if (/\b(night|밤)\b/.test(lower))      return { hour: 21, minute: 0 };
  if (/\b(midnight|자정)\b/.test(lower)) return { hour: 0,  minute: 0 };

  return undefined;
}

/** Parse day-of-week from text. Returns undefined for "every day" / "daily". */
function parseDayOfWeek(text: string): string | undefined {
  const lower = text.toLowerCase();

  // Check each Korean/English day name
  for (const [token, value] of Object.entries(DAY_NAMES)) {
    const re = new RegExp(`\\b${token}\\b`);
    if (re.test(lower)) return value;
  }

  return undefined;
}

function parseNL(description: string): ParseResult {
  const time = parseTime(description) ?? { hour: 9, minute: 0 };
  const dayOfWeek = parseDayOfWeek(description);

  // Strip time/day words from description to extract the "what to do" part.
  let taskPrompt = description
    .replace(/매주\s*(월|화|수|목|금|토|일)요일/g, "")
    .replace(/매일|every\s+day|daily|hourly|매시간/gi, "")
    .replace(/every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekday|weekend|mon|tue|wed|thu|fri|sat|sun)/gi, "")
    .replace(/오전|오후/g, "")
    .replace(/\d{1,2}시\s*(\d{1,2}분)?/g, "")
    .replace(/\d{1,2}(:\d{2})?\s*(am|pm)/gi, "")
    .replace(/at\s+\d{1,2}(:\d{2})?/gi, "")
    .replace(/morning|afternoon|evening|night|noon|midnight|아침|저녁|밤|정오|자정/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!taskPrompt) taskPrompt = description;

  // Build a short title (first 80 chars of description)
  const title = description.slice(0, 80).trim();

  const sched: SchedTime = { hour: time.hour, minute: time.minute };
  if (dayOfWeek) sched.day_of_week = dayOfWeek;

  return { sched, title, taskPrompt };
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

function httpPost(url: string, body: unknown, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = JSON.stringify(body);
    const opts: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        ...headers,
      },
    };

    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ── Tool factory ──────────────────────────────────────────────────────────────

function makeCronCreateTool(userId: string, timezone: string): ToolDefinition<typeof cronCreateSchema, null> {
  return {
    name: "cron_create",
    label: "Create Scheduled Task",
    description:
      "Create a recurring scheduled task from a natural-language description. " +
      "The task will be executed by the AI agent on the specified schedule. " +
      "Supports English and Korean time expressions.",
    promptSnippet: "cron_create(description, deliver_to?)",
    promptGuidelines: [
      "Use cron_create when the user asks to run something on a schedule.",
      "Examples: 'every Monday at 9am send me a summary', '매일 저녁 9시에 지출 확인해줘'.",
      "Set deliver_to='telegram' if the user wants results sent via Telegram.",
      "Use checkpoint_list() to see already-created schedules.",
    ],
    parameters: cronCreateSchema,

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { description, deliver_to = "" } = params;

      // Parse natural language
      const { sched, title, taskPrompt } = parseNL(description);

      // Call gateway internal endpoint
      const gatewayBase = (process.env.GATEWAY_URL ?? "http://localhost:8080").replace(/\/$/, "");
      const internalSecret = process.env.INTERNAL_LOG_SECRET ?? "";
      const url = `${gatewayBase}/api/v1/internal/cron-schedule`;

      const reqBody = {
        user_id: userId,
        title,
        task_prompt: taskPrompt,
        schedule: {
          hour: sched.hour,
          minute: sched.minute,
          day_of_week: sched.day_of_week ?? "",
          timezone,
        },
        deliver_to: deliver_to ?? "",
      };

      let result: { status: number; body: string };
      try {
        result = await httpPost(url, reqBody, {
          "X-Internal-Secret": internalSecret,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Failed to create schedule: ${msg}` }],
          details: null,
        };
      }

      if (result.status < 200 || result.status >= 300) {
        return {
          content: [{ type: "text" as const, text: `Gateway returned ${result.status}: ${result.body}` }],
          details: null,
        };
      }

      let parsed: { id?: string };
      try { parsed = JSON.parse(result.body); } catch { parsed = {}; }

      const dayStr = sched.day_of_week ? ` on ${sched.day_of_week}` : " every day";
      const timeStr = `${String(sched.hour).padStart(2, "0")}:${String(sched.minute).padStart(2, "0")}`;
      const deliverStr = deliver_to === "telegram" ? " (via Telegram)" : "";

      const text =
        `✅ Schedule created!\n` +
        `ID: ${parsed.id ?? "unknown"}\n` +
        `Title: ${title}\n` +
        `Schedule: ${timeStr}${dayStr}\n` +
        `Task: ${taskPrompt}${deliverStr}`;

      return { content: [{ type: "text" as const, text }], details: null };
    },
  };
}

// ── Exported factory ──────────────────────────────────────────────────────────

/**
 * Returns cron tools scoped to a specific user.
 *
 * @param taskId - Unique session identifier: "{userId}:{sessionId}"
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createCronTools(taskId: string, timezone = "UTC"): ToolDefinition<any, any>[] {
  const colonIdx = taskId.indexOf(":");
  const userId = taskId.slice(0, colonIdx);
  return [makeCronCreateTool(userId, timezone)];
}
