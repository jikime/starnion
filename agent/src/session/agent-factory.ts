import fs from "fs";
import path from "path";
import {
  createAgentSession,
  SettingsManager,
  SessionManager,
  ModelRegistry,
  AuthStorage,
  type AgentSession,
  type DefaultResourceLoader,
} from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { type FallbackProvider, resolveProviderModel } from "./llm-fallback.js";

// ── Paths ─────────────────────────────────────────────────────────────────────
const AGENT_DIR = path.resolve(process.env.AGENT_DIR ?? process.cwd());
const SKILLS_DIR = path.resolve(
  process.env.SKILLS_DIR ?? path.join(AGENT_DIR, "skills"),
);

/**
 * Rewrite any stale absolute paths in a pi-coding-agent session jsonl
 * file so that resumed sessions don't feed the LLM an old project
 * root. The session file records `cwd` on its first line AND replays
 * tool_use / tool_result entries verbatim — when the project is moved
 * or renamed, those frozen absolute paths leak back into the LLM's
 * context and the model dutifully mimics them in new bash commands
 * (e.g. `cd /old/path/skills && python3 weather/...`).
 *
 * This helper is defensive and surgical:
 *
 *   - It looks for the substring form of SKILLS_DIR without the final
 *     "/skills" segment (i.e. the agent root) and compares against
 *     whatever the session thinks its cwd is.
 *   - When a mismatch is detected, the entire file is streamed through
 *     a single search/replace that swaps the stale agent root for the
 *     current one. No JSON parsing — we don't want to corrupt any
 *     exotic fields the pi-coding-agent SDK writes.
 *   - A `.bak` backup is kept on the first rewrite of each file.
 *
 * Safe to call on every session load: returns immediately when the
 * file does not exist, when it's empty, or when the session already
 * references the current path.
 */
function rewriteStaleSessionPaths(sessionDir: string): void {
  try {
    if (!fs.existsSync(sessionDir)) return;
    const entries = fs.readdirSync(sessionDir, { withFileTypes: true });
    const currentAgentRoot = path.dirname(SKILLS_DIR); // .../agent
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
      const filePath = path.join(sessionDir, entry.name);
      let raw: string;
      try {
        raw = fs.readFileSync(filePath, "utf8");
      } catch {
        continue;
      }
      if (!raw) continue;

      // Grab the session header's cwd (first line, if it is a JSON
      // object with a cwd field). We only need the prefix to identify
      // the stale agent root.
      const firstLineEnd = raw.indexOf("\n");
      const firstLine = firstLineEnd >= 0 ? raw.slice(0, firstLineEnd) : raw;
      let staleCwd: string | undefined;
      try {
        const header = JSON.parse(firstLine) as { cwd?: string };
        if (typeof header.cwd === "string") staleCwd = header.cwd;
      } catch {
        // First line isn't JSON (corrupt file) — bail rather than
        // guess at the stale prefix.
        continue;
      }
      if (!staleCwd) continue;

      // Derive the stale agent root from the stored cwd. We strip the
      // trailing "/skills" (or whatever component the session was
      // created under) so paths like `skills/weather/scripts/...`
      // inside bash commands also get rewritten.
      const staleAgentRoot = path.dirname(staleCwd);
      if (staleAgentRoot === currentAgentRoot) continue; // already current

      // Prefer rewriting whole "agent" parents so nested subpaths
      // (skills/, SOUL.md, sessions/, etc.) all come along for the
      // ride. If that can't match the whole file, fall back to
      // rewriting just the skills directory.
      const replacements: Array<[string, string]> = [
        [staleAgentRoot, currentAgentRoot],
        [staleCwd, SKILLS_DIR],
      ];
      let rewritten = raw;
      for (const [from, to] of replacements) {
        if (!from || from === to) continue;
        rewritten = rewritten.split(from).join(to);
      }
      if (rewritten === raw) continue;

      // Keep a one-time backup the first time we touch this file.
      const backupPath = filePath + ".bak.stalepath";
      if (!fs.existsSync(backupPath)) {
        try {
          fs.copyFileSync(filePath, backupPath);
        } catch {
          // Non-fatal: proceed without the backup rather than fail
          // the whole session load.
        }
      }
      fs.writeFileSync(filePath, rewritten, "utf8");
      console.log(
        `[AgentFactory] Migrated stale session paths: ${filePath} ` +
          `(${staleAgentRoot} → ${currentAgentRoot})`,
      );
    }
  } catch (err) {
    console.warn(
      "[AgentFactory] rewriteStaleSessionPaths: failed to sweep " +
        `${sessionDir}: ${(err as Error).message}`,
    );
  }
}

const MODEL_ALIAS_MAP: Record<string, string> = {
  "claude-sonnet-4-5": "claude-sonnet-4-5",
  "claude-sonnet-4-5-20251001": "claude-sonnet-4-5",
  "claude-sonnet-4-6": "claude-sonnet-4-6",
  "claude-opus-4": "claude-opus-4-5",
  "claude-haiku-4": "claude-haiku-4-5",
};

const MAX_CACHED_SESSIONS = 200;

interface CachedSession {
  session: AgentSession;
  lastUsed: number;
}

export interface AgentFactoryOptions {
  userId: string;
  sessionId: string;
  sessionFilePath: string;
  provider: string;
  model: string;
  apiKey: string;
  systemPrompt: string;
  resourceLoader: DefaultResourceLoader;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: ToolDefinition<any, any>[];
  /**
   * Optional ordered list of fallback providers to try if the primary
   * provider+model cannot be resolved. Entries are tried in array order.
   */
  fallbackChain?: FallbackProvider[];
}

/**
 * AgentFactory — session lifecycle management.
 *
 * Benefits over previous module-level caches:
 *  1. All session state (LRU cache, registry cache) is owned by one object —
 *     easy to test, reset, or scope per-tenant if needed.
 *  2. Explicit `resolveModelId` is no longer scattered; one place owns the
 *     alias map.
 *  3. Future: add config-version field to cache key to invalidate sessions
 *     automatically when persona/settings change.
 */
export class AgentFactory {
  private _sessionCache = new Map<string, CachedSession>();
  private _registryCache = new Map<string, ModelRegistry>();

  resolveModelId(modelAlias: string): string {
    return MODEL_ALIAS_MAP[modelAlias] ?? modelAlias;
  }

  getModelRegistry(provider: string, apiKey: string): ModelRegistry | undefined {
    if (!apiKey) {
      // No per-user API key — don't create a registry.
      // pi-coding-agent will fall back to env vars (ANTHROPIC_OAUTH_TOKEN, ANTHROPIC_API_KEY).
      // No per-user API key — pi-coding-agent falls back to env vars.
      return undefined;
    }
    const key = `${provider}:${apiKey.slice(0, 24)}`;
    if (this._registryCache.has(key)) return this._registryCache.get(key)!;

    const authStorage = AuthStorage.inMemory({});
    const registry = new ModelRegistry(authStorage);
    registry.registerProvider(provider, { apiKey });
    this._registryCache.set(key, registry);
    return registry;
  }

  private evict(): void {
    if (this._sessionCache.size < MAX_CACHED_SESSIONS) return;
    const entries = [...this._sessionCache.entries()].sort(
      (a, b) => a[1].lastUsed - b[1].lastUsed,
    );
    for (let i = 0; i < 10 && i < entries.length; i++) {
      this._sessionCache.delete(entries[i][0]);
    }
  }

  /**
   * Returns a cached AgentSession or creates a new one.
   *
   * Cache key: `userId:sessionId:loaderKey` where loaderKey is the first 32
   * chars of systemPrompt (or "__default__").  Different personas for the same
   * session will therefore get separate agent sessions — preventing context
   * bleed between persona switches.
   */
  async getOrCreate(opts: AgentFactoryOptions): Promise<AgentSession> {
    const {
      userId, sessionId, sessionFilePath,
      provider, model, apiKey, systemPrompt,
      resourceLoader, tools, fallbackChain,
    } = opts;

    const loaderKey = systemPrompt ? systemPrompt.slice(0, 32) : "__default__";
    const cacheKey = `${userId}:${sessionId}:${loaderKey}`;

    const cached = this._sessionCache.get(cacheKey);
    if (cached) {
      cached.lastUsed = Date.now();
      console.log(`[AgentFactory] Reusing cached session cacheKey=${cacheKey}`);
      return cached.session;
    }

    // ── Provider selection with fallback ──────────────────────────────────────
    // Try the primary provider first. If its model cannot be resolved by pi-ai,
    // walk the fallback chain until we find a working provider+model pair.
    let resolvedProvider = provider || "anthropic";
    let resolvedApiKey = apiKey;
    let modelId = this.resolveModelId(model || "claude-sonnet-4-5");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let resolvedModel = getModel(resolvedProvider as any, modelId as any);

    if (!resolvedModel && fallbackChain?.length) {
      console.log(
        `[AgentFactory] Primary provider=${resolvedProvider} model=${modelId} not resolvable — trying fallback chain (${fallbackChain.length} entries)`
      );
      for (const fb of fallbackChain) {
        const fbModel = resolveProviderModel(fb.provider, fb.model);
        if (fbModel) {
          resolvedProvider = fb.provider;
          resolvedApiKey   = fb.api_key;
          modelId          = fb.model;
          resolvedModel    = fbModel;
          console.log(
            `[AgentFactory] Fallback selected: provider=${resolvedProvider} model=${modelId}`
          );
          break;
        }
        console.log(
          `[AgentFactory] Fallback provider=${fb.provider} model=${fb.model} not resolvable — skipping`
        );
      }
    }

    console.log(
      `[AgentFactory] provider=${resolvedProvider} modelId=${modelId} resolved=${resolvedModel?.id ?? "null"}`
    );

    // Only create a registry when there's a per-user API key.
    // Without it, pi-coding-agent uses env vars (ANTHROPIC_OAUTH_TOKEN) directly.
    const modelRegistry = this.getModelRegistry(resolvedProvider, resolvedApiKey);

    const settingsManager = SettingsManager.inMemory({});
    // sessionFilePath is now a session-specific directory
    // (e.g. ~/.starnion/sessions/{userId}/{sessionId}/).
    // continueRecent() opens the most recent JSONL in that dir (resuming after
    // restart) or creates a new one if the directory is empty.
    //
    // Defensive: when the agent binary is moved (fresh clone, rename, or the
    // user switched between project checkouts), resumed sessions still carry
    // the old absolute cwd in their header + every historical tool_use entry.
    // The LLM mimics those absolute paths in new bash commands, producing
    // "No such file or directory" errors pointing at the previous project
    // location. Sweep the session directory before handing it to
    // continueRecent() so any jsonl that predates the move has its stale
    // paths rewritten in place.
    rewriteStaleSessionPaths(sessionFilePath);
    const sessionManager = SessionManager.continueRecent(SKILLS_DIR, sessionFilePath);

    console.log(`[AgentFactory] Creating new session cwd=${SKILLS_DIR}`);
    const created = await createAgentSession({
      cwd: SKILLS_DIR,
      model: resolvedModel,
      settingsManager,
      sessionManager,
      ...(modelRegistry ? { modelRegistry } : {}),
      resourceLoader,
      customTools: tools,
    });

    this.evict();
    this._sessionCache.set(cacheKey, { session: created.session, lastUsed: Date.now() });
    console.log(`[AgentFactory] Session created and cached cacheKey=${cacheKey}`);
    return created.session;
  }
}
