import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ChromeMcpSnapshotNode } from "./chrome-mcp.snapshot.js";
import { BrowserProfileUnavailableError, BrowserTabNotFoundError } from "./errors.js";
import type { BrowserTab } from "./types.js";

// ── Internal types ──────────────────────────────────────────────────────────

type ChromeMcpStructuredPage = {
  id: number;
  url?: string;
  selected?: boolean;
};

type ChromeMcpToolResult = {
  structuredContent?: Record<string, unknown>;
  content?: Array<Record<string, unknown>>;
  isError?: boolean;
};

type ChromeMcpSession = {
  client: Client;
  transport: StdioClientTransport;
  ready: Promise<void>;
};

// ── Session cache ────────────────────────────────────────────────────────────

const sessions = new Map<string, ChromeMcpSession>();
const pendingSessions = new Map<string, Promise<ChromeMcpSession>>();

/** Per-profile browserUrl registry — set once at startup via setBrowserUrlForProfile(). */
const profileBrowserUrls = new Map<string, string>();

/**
 * Register a Chrome remote debugging URL for a profile.
 * When set, chrome-devtools-mcp will use --browserUrl instead of --autoConnect.
 * e.g. setBrowserUrlForProfile("default", "http://127.0.0.1:9222")
 */
export function setBrowserUrlForProfile(profileName: string, browserUrl: string): void {
  profileBrowserUrls.set(profileName, browserUrl);
}

// chrome-devtools-mcp launch args
const CHROME_MCP_COMMAND = "npx";
const CHROME_MCP_COMMON_ARGS = [
  "-y",
  "chrome-devtools-mcp@latest",
  "--experimentalStructuredContent",
  "--experimental-page-id-routing",
];

export function buildChromeMcpArgs(userDataDir?: string, browserUrl?: string): string[] {
  if (browserUrl?.trim()) {
    // Connect to an already-running Chrome via its remote debugging URL
    return [...CHROME_MCP_COMMON_ARGS, "--browserUrl", browserUrl.trim()];
  }
  // No browserUrl → let chrome-devtools-mcp launch and manage Chrome itself.
  const args = [...CHROME_MCP_COMMON_ARGS];
  if (process.env.BROWSER_HEADLESS === "true") args.push("--headless");
  const dir = userDataDir?.trim();
  if (dir) args.push("--userDataDir", dir);
  return args;
}

function sessionCacheKey(profileName: string, userDataDir?: string): string {
  return JSON.stringify([profileName, userDataDir?.trim() ?? ""]);
}

function cacheKeyMatchesProfile(key: string, profileName: string): boolean {
  try {
    const parsed = JSON.parse(key);
    return Array.isArray(parsed) && parsed[0] === profileName;
  } catch {
    return false;
  }
}

// ── Result extraction helpers ────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function extractStructuredContent(result: ChromeMcpToolResult): Record<string, unknown> {
  return asRecord(result.structuredContent) ?? {};
}

function extractTextContent(result: ChromeMcpToolResult): string[] {
  return (Array.isArray(result.content) ? result.content : [])
    .map((entry) => {
      const record = asRecord(entry);
      return record && typeof record.text === "string" ? record.text : "";
    })
    .filter(Boolean);
}

function extractTextPages(result: ChromeMcpToolResult): ChromeMcpStructuredPage[] {
  const pages: ChromeMcpStructuredPage[] = [];
  for (const block of extractTextContent(result)) {
    for (const line of block.split(/\r?\n/)) {
      const match = line.match(/^\s*(\d+):\s+(.+?)(?:\s+\[(selected)\])?\s*$/i);
      if (!match) continue;
      pages.push({
        id: Number.parseInt(match[1] ?? "", 10),
        url: match[2]?.trim() || undefined,
        selected: Boolean(match[3]),
      });
    }
  }
  return pages;
}

function extractStructuredPages(result: ChromeMcpToolResult): ChromeMcpStructuredPage[] {
  const structured = (() => {
    const arr = extractStructuredContent(result).pages;
    if (!Array.isArray(arr)) return [];
    return arr
      .map(asRecord)
      .filter((r): r is Record<string, unknown> => r !== null && typeof r.id === "number")
      .map((r) => ({
        id: r.id as number,
        url: typeof r.url === "string" ? r.url : undefined,
        selected: r.selected === true,
      }));
  })();
  return structured.length > 0 ? structured : extractTextPages(result);
}

function extractSnapshot(result: ChromeMcpToolResult): ChromeMcpSnapshotNode {
  const snapshot = asRecord(extractStructuredContent(result).snapshot);
  if (!snapshot) {
    throw new Error("Chrome MCP snapshot response was missing structured snapshot data.");
  }
  return snapshot as unknown as ChromeMcpSnapshotNode;
}

function extractMessageText(result: ChromeMcpToolResult): string {
  const message = extractStructuredContent(result).message;
  if (typeof message === "string" && message.trim()) return message;
  const blocks = extractTextContent(result);
  return blocks.find((b) => b.trim()) ?? "";
}

function extractJsonBlock(text: string): unknown {
  const match = text.match(/```json\s*([\s\S]*?)\s*```/i);
  const raw = match?.[1]?.trim() || text.trim();
  return raw ? JSON.parse(raw) : null;
}

function extractJsonMessage(result: ChromeMcpToolResult): unknown {
  const candidates = [extractMessageText(result), ...extractTextContent(result)].filter((t) =>
    t.trim(),
  );
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return extractJsonBlock(candidate);
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError) throw lastError;
  return null;
}

function toBrowserTabs(pages: ChromeMcpStructuredPage[]): BrowserTab[] {
  return pages.map((p) => ({
    targetId: String(p.id),
    title: "",
    url: p.url ?? "",
    type: "page" as const,
  }));
}

function parsePageId(targetId: string): number {
  const parsed = Number.parseInt(targetId.trim(), 10);
  if (!Number.isFinite(parsed)) throw new BrowserTabNotFoundError();
  return parsed;
}

// ── Session management ───────────────────────────────────────────────────────

async function closeSessions(profileName: string, keepKey?: string): Promise<void> {
  for (const key of [...pendingSessions.keys()]) {
    if (key !== keepKey && cacheKeyMatchesProfile(key, profileName)) {
      pendingSessions.delete(key);
    }
  }
  for (const [key, session] of [...sessions.entries()]) {
    if (key !== keepKey && cacheKeyMatchesProfile(key, profileName)) {
      sessions.delete(key);
      await session.client.close().catch(() => {});
    }
  }
}

async function createSession(
  profileName: string,
  userDataDir?: string,
  browserUrl?: string,
): Promise<ChromeMcpSession> {
  const transport = new StdioClientTransport({
    command: CHROME_MCP_COMMAND,
    args: buildChromeMcpArgs(userDataDir, browserUrl),
    stderr: "pipe",
  });

  const client = new Client({ name: "starnion-browser", version: "1.0.0" }, {});

  const ready = (async () => {
    try {
      await client.connect(transport);
      const tools = await client.listTools();
      if (!tools.tools.some((t: { name: string }) => t.name === "list_pages")) {
        throw new Error("Chrome MCP did not expose expected navigation tools.");
      }
    } catch (err) {
      await client.close().catch(() => {});
      const target = browserUrl
        ? `Chrome at ${browserUrl}`
        : userDataDir
          ? `user data dir (${userDataDir})`
          : "Google Chrome's default profile";
      throw new BrowserProfileUnavailableError(
        `Chrome MCP attach failed for profile "${profileName}". ` +
          `Make sure ${target} is running with remote debugging enabled. Details: ${String(err)}`,
      );
    }
  })();

  return { client, transport, ready };
}

async function getSession(profileName: string, userDataDir?: string): Promise<ChromeMcpSession> {
  const browserUrl = profileBrowserUrls.get(profileName);
  const key = sessionCacheKey(profileName, userDataDir);
  await closeSessions(profileName, key);

  let session = sessions.get(key);
  if (session && session.transport.pid === null) {
    sessions.delete(key);
    session = undefined;
  }

  if (!session) {
    let pending = pendingSessions.get(key);
    if (!pending) {
      pending = (async () => {
        const created = await createSession(profileName, userDataDir, browserUrl);
        if (pendingSessions.get(key) === pending) {
          sessions.set(key, created);
        } else {
          await created.client.close().catch(() => {});
        }
        return created;
      })();
      pendingSessions.set(key, pending);
    }
    try {
      session = await pending;
    } finally {
      if (pendingSessions.get(key) === pending) pendingSessions.delete(key);
    }
  }

  try {
    await session.ready;
    return session;
  } catch (err) {
    if (sessions.get(key)?.transport === session.transport) sessions.delete(key);
    throw err;
  }
}

// ── Tool invocation ──────────────────────────────────────────────────────────

async function callTool(
  profileName: string,
  userDataDir: string | undefined,
  name: string,
  args: Record<string, unknown> = {},
): Promise<ChromeMcpToolResult> {
  const key = sessionCacheKey(profileName, userDataDir);
  const session = await getSession(profileName, userDataDir);
  let result: ChromeMcpToolResult;
  try {
    result = (await session.client.callTool({ name, arguments: args })) as ChromeMcpToolResult;
  } catch (err) {
    sessions.delete(key);
    await session.client.close().catch(() => {});
    throw err;
  }
  if (result.isError) {
    const message = extractMessageText(result).trim() || `Chrome MCP tool "${name}" failed.`;
    throw new Error(message);
  }
  return result;
}

// ── Temp file helper ─────────────────────────────────────────────────────────

async function withTempFile<T>(fn: (filePath: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "starnion-browser-"));
  const filePath = path.join(dir, randomUUID());
  try {
    return await fn(filePath);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function ensureChromeMcpAvailable(
  profileName: string,
  userDataDir?: string,
): Promise<void> {
  await getSession(profileName, userDataDir);
}

export async function closeChromeMcpSession(profileName: string): Promise<void> {
  await closeSessions(profileName);
}

export async function stopAllChromeMcpSessions(): Promise<void> {
  const names = [...new Set([...sessions.keys()].map((k) => JSON.parse(k)[0] as string))];
  for (const name of names) {
    await closeChromeMcpSession(name).catch(() => {});
  }
}

export async function listChromeMcpTabs(
  profileName: string,
  userDataDir?: string,
): Promise<BrowserTab[]> {
  const result = await callTool(profileName, userDataDir, "list_pages");
  return toBrowserTabs(extractStructuredPages(result));
}

export async function openChromeMcpTab(
  profileName: string,
  url: string,
  userDataDir?: string,
): Promise<BrowserTab> {
  const result = await callTool(profileName, userDataDir, "new_page", { url });
  const pages = extractStructuredPages(result);
  const chosen = pages.find((p) => p.selected) ?? pages.at(-1);
  if (!chosen) throw new Error("Chrome MCP did not return the created page.");
  return { targetId: String(chosen.id), title: "", url: chosen.url ?? url, type: "page" };
}

export async function focusChromeMcpTab(
  profileName: string,
  targetId: string,
  userDataDir?: string,
): Promise<void> {
  await callTool(profileName, userDataDir, "select_page", {
    pageId: parsePageId(targetId),
    bringToFront: true,
  });
}

export async function closeChromeMcpTab(
  profileName: string,
  targetId: string,
  userDataDir?: string,
): Promise<void> {
  await callTool(profileName, userDataDir, "close_page", {
    pageId: parsePageId(targetId),
  });
}

export async function navigateChromeMcpPage(params: {
  profileName: string;
  userDataDir?: string;
  targetId: string;
  url: string;
  timeoutMs?: number;
}): Promise<{ url: string }> {
  await callTool(params.profileName, params.userDataDir, "navigate_page", {
    pageId: parsePageId(params.targetId),
    type: "url",
    url: params.url,
    ...(typeof params.timeoutMs === "number" ? { timeout: params.timeoutMs } : {}),
  });
  // Re-fetch page URL after navigation
  const tabs = await listChromeMcpTabs(params.profileName, params.userDataDir);
  const tab = tabs.find((t) => t.targetId === params.targetId);
  return { url: tab?.url ?? params.url };
}

export async function takeChromeMcpSnapshot(params: {
  profileName: string;
  userDataDir?: string;
  targetId: string;
}): Promise<ChromeMcpSnapshotNode> {
  const result = await callTool(params.profileName, params.userDataDir, "take_snapshot", {
    pageId: parsePageId(params.targetId),
  });
  return extractSnapshot(result);
}

export async function takeChromeMcpScreenshot(params: {
  profileName: string;
  userDataDir?: string;
  targetId: string;
  fullPage?: boolean;
  format?: "png" | "jpeg";
}): Promise<Buffer> {
  return withTempFile(async (filePath) => {
    await callTool(params.profileName, params.userDataDir, "take_screenshot", {
      pageId: parsePageId(params.targetId),
      filePath,
      format: params.format ?? "png",
      ...(params.fullPage ? { fullPage: true } : {}),
    });
    return fs.readFile(filePath);
  });
}

export async function clickChromeMcpElement(params: {
  profileName: string;
  userDataDir?: string;
  targetId: string;
  uid: string;
  doubleClick?: boolean;
}): Promise<void> {
  await callTool(params.profileName, params.userDataDir, "click", {
    pageId: parsePageId(params.targetId),
    uid: params.uid,
    ...(params.doubleClick ? { dblClick: true } : {}),
  });
}

export async function fillChromeMcpElement(params: {
  profileName: string;
  userDataDir?: string;
  targetId: string;
  uid: string;
  value: string;
}): Promise<void> {
  await callTool(params.profileName, params.userDataDir, "fill", {
    pageId: parsePageId(params.targetId),
    uid: params.uid,
    value: params.value,
  });
}

export async function fillChromeMcpForm(params: {
  profileName: string;
  userDataDir?: string;
  targetId: string;
  elements: Array<{ uid: string; value: string }>;
}): Promise<void> {
  await callTool(params.profileName, params.userDataDir, "fill_form", {
    pageId: parsePageId(params.targetId),
    elements: params.elements,
  });
}

export async function hoverChromeMcpElement(params: {
  profileName: string;
  userDataDir?: string;
  targetId: string;
  uid: string;
}): Promise<void> {
  await callTool(params.profileName, params.userDataDir, "hover", {
    pageId: parsePageId(params.targetId),
    uid: params.uid,
  });
}

export async function dragChromeMcpElement(params: {
  profileName: string;
  userDataDir?: string;
  targetId: string;
  fromUid: string;
  toUid: string;
}): Promise<void> {
  await callTool(params.profileName, params.userDataDir, "drag", {
    pageId: parsePageId(params.targetId),
    from_uid: params.fromUid,
    to_uid: params.toUid,
  });
}

export async function pressChromeMcpKey(params: {
  profileName: string;
  userDataDir?: string;
  targetId: string;
  key: string;
}): Promise<void> {
  await callTool(params.profileName, params.userDataDir, "press_key", {
    pageId: parsePageId(params.targetId),
    key: params.key,
  });
}

export async function uploadChromeMcpFile(params: {
  profileName: string;
  userDataDir?: string;
  targetId: string;
  uid: string;
  filePath: string;
}): Promise<void> {
  await callTool(params.profileName, params.userDataDir, "upload_file", {
    pageId: parsePageId(params.targetId),
    uid: params.uid,
    filePath: params.filePath,
  });
}

export async function resizeChromeMcpPage(params: {
  profileName: string;
  userDataDir?: string;
  targetId: string;
  width: number;
  height: number;
}): Promise<void> {
  await callTool(params.profileName, params.userDataDir, "resize_page", {
    pageId: parsePageId(params.targetId),
    width: params.width,
    height: params.height,
  });
}

export async function evaluateChromeMcpScript(params: {
  profileName: string;
  userDataDir?: string;
  targetId: string;
  fn: string;
  args?: string[];
}): Promise<unknown> {
  const result = await callTool(params.profileName, params.userDataDir, "evaluate_script", {
    pageId: parsePageId(params.targetId),
    function: params.fn,
    ...(params.args?.length ? { args: params.args } : {}),
  });
  return extractJsonMessage(result);
}

export async function waitForChromeMcpText(params: {
  profileName: string;
  userDataDir?: string;
  targetId: string;
  text: string[];
  timeoutMs?: number;
}): Promise<void> {
  await callTool(params.profileName, params.userDataDir, "wait_for", {
    pageId: parsePageId(params.targetId),
    text: params.text,
    ...(typeof params.timeoutMs === "number" ? { timeout: params.timeoutMs } : {}),
  });
}
