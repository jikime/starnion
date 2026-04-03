/**
 * session-tools.ts — Cross-session full-text search tool.
 *
 * Scans past session JSONL files for messages matching a query string.
 * Works on the same session directory used by SessionSetupMiddleware
 * (~/.starnion/sessions/{userId}/{sessionId}/*.jsonl).
 */

import path from "path";
import fs from "fs";
import os from "os";
import readline from "readline";
import { Type } from "@sinclair/typebox";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

// ── Types ──────────────────────────────────────────────────────────────────────

interface SearchMatch {
  sessionId: string;
  role: string;
  snippet: string;
  timestamp?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const BASE_SESSION_DIR =
  process.env.SESSION_DIR ?? path.join(os.homedir(), ".starnion", "sessions");

/**
 * Parse a JSONL session file and yield text messages.
 * pi-coding-agent JSONL lines contain { type, ... } objects.
 * We extract "user" and "assistant" text messages.
 */
async function* parseJsonl(filePath: string): AsyncGenerator<{ role: string; text: string; timestamp?: string }> {
  let stream: fs.ReadStream;
  try {
    stream = fs.createReadStream(filePath, { encoding: "utf-8" });
  } catch {
    return;
  }

  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      // pi-coding-agent format: { type: "user" | "assistant", message: { ... } }
      if (obj.type === "user" && obj.message?.content) {
        const content = obj.message.content;
        const text = typeof content === "string"
          ? content
          : Array.isArray(content)
            ? content.filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join(" ")
            : "";
        if (text) yield { role: "user", text, timestamp: obj.timestamp };
      } else if (obj.type === "assistant" && obj.message?.content) {
        const content = obj.message.content;
        const text = typeof content === "string"
          ? content
          : Array.isArray(content)
            ? content.filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join(" ")
            : "";
        if (text) yield { role: "assistant", text, timestamp: obj.timestamp };
      }
    } catch {
      // Skip malformed lines
    }
  }
  rl.close();
}

/**
 * Score a text against query terms.
 * Returns number of distinct terms matched (0 = no match).
 */
function scoreText(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  return terms.filter((t) => lower.includes(t)).length;
}

/**
 * Extract a snippet around the first occurrence of any query term.
 * Returns up to ~200 chars centred on the match.
 */
function extractSnippet(text: string, terms: string[], maxLen = 200): string {
  const lower = text.toLowerCase();
  let bestIdx = -1;
  for (const t of terms) {
    const idx = lower.indexOf(t);
    if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) bestIdx = idx;
  }
  if (bestIdx === -1) return text.slice(0, maxLen) + (text.length > maxLen ? "…" : "");

  const half = Math.floor(maxLen / 2);
  const start = Math.max(0, bestIdx - half);
  const end = Math.min(text.length, bestIdx + half);
  const snippet = text.slice(start, end).replace(/\s+/g, " ").trim();
  return (start > 0 ? "…" : "") + snippet + (end < text.length ? "…" : "");
}

/**
 * Search all session JSONL files for a user.
 * Returns up to `limit` ranked results.
 */
async function searchSessions(
  userId: string,
  query: string,
  limit: number,
): Promise<SearchMatch[]> {
  const userDir = path.join(BASE_SESSION_DIR, userId);
  if (!fs.existsSync(userDir)) return [];

  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  if (terms.length === 0) return [];

  const results: Array<SearchMatch & { score: number }> = [];

  // Enumerate all session subdirectories
  let sessionDirs: string[];
  try {
    sessionDirs = fs
      .readdirSync(userDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }

  for (const sessionId of sessionDirs) {
    const sessionDir = path.join(userDir, sessionId);
    let files: string[];
    try {
      files = fs
        .readdirSync(sessionDir)
        .filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }

    for (const file of files) {
      const filePath = path.join(sessionDir, file);
      for await (const msg of parseJsonl(filePath)) {
        const score = scoreText(msg.text, terms);
        if (score > 0) {
          results.push({
            sessionId,
            role: msg.role,
            snippet: extractSnippet(msg.text, terms),
            timestamp: msg.timestamp,
            score,
          });
        }
      }
    }
  }

  // Sort by score descending, then return top `limit`
  results.sort((a, b) => b.score - a.score || (b.timestamp ?? "").localeCompare(a.timestamp ?? ""));
  return results.slice(0, limit).map(({ score: _score, ...rest }) => rest);
}

// ── Schema ────────────────────────────────────────────────────────────────────

const sessionSearchSchema = Type.Object({
  query: Type.String({
    description: "Search query. Space-separated terms are all required (AND logic).",
  }),
  limit: Type.Optional(
    Type.Integer({
      description: "Maximum number of results to return (default 10, max 50).",
      minimum: 1,
      maximum: 50,
    }),
  ),
});

// ── session_search tool factory ───────────────────────────────────────────────

function makeSessionSearchTool(userId: string): ToolDefinition<typeof sessionSearchSchema, null> {
  return {
    name: "session_search",
    label: "Search Past Conversations",
    description:
      "Full-text search across all past conversation sessions for this user. " +
      "Useful for recalling previous topics, decisions, or information. " +
      "Returns ranked snippets from matching messages.",
    promptSnippet: "session_search(query, limit?)",
    promptGuidelines: [
      "Use session_search when the user asks about something from a past conversation.",
      "Space-separated query terms all need to match (AND logic).",
      "Default limit is 10; increase to 50 for broader searches.",
    ],
    parameters: sessionSearchSchema,

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { query, limit = 10 } = params;
      const cap = Math.min(Math.max(1, limit), 50);

      const matches = await searchSessions(userId, query, cap);

      if (matches.length === 0) {
        return {
          content: [{ type: "text" as const, text: `No matches found for: "${query}"` }],
          details: null,
        };
      }

      const lines: string[] = [
        `Found ${matches.length} result(s) for "${query}":`,
        "",
      ];
      for (const m of matches) {
        const ts = m.timestamp ? ` [${m.timestamp.slice(0, 16)}]` : "";
        lines.push(`**Session ${m.sessionId.slice(0, 8)}…** (${m.role})${ts}`);
        lines.push(`> ${m.snippet}`);
        lines.push("");
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
        details: null,
      };
    },
  };
}

// ── Exported factory ──────────────────────────────────────────────────────────

/**
 * Returns session tools scoped to a specific userId.
 * Call this in chat.ts alongside createExecTools().
 *
 * @param userId - The authenticated user ID for scoping session searches.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createSessionTools(userId: string): ToolDefinition<any, any>[] {
  return [makeSessionSearchTool(userId)];
}
