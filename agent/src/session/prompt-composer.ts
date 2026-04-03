import path from "path";
import fs from "fs";
import { DefaultResourceLoader } from "@mariozechner/pi-coding-agent";
import {
  type SkillMeta,
  loadAllSkillMeta,
  buildSkillIndex,
} from "./skill-meta.js";
import { PromptInjectionMiddleware } from "./middleware.js";

// ── Paths ─────────────────────────────────────────────────────────────────────
const AGENT_DIR = path.resolve(process.env.AGENT_DIR ?? process.cwd());
const SKILLS_DIR = path.resolve(
  process.env.SKILLS_DIR ?? path.join(AGENT_DIR, "skills"),
);
const SOUL_MD_PATH = path.join(AGENT_DIR, "SOUL.md");
const FALLBACK_IDENTITY =
  "You are StarNion, a personal AI assistant. " +
  "You help users manage their daily life including finances, diary entries, goals, and general tasks.";

/** Options controlling per-user skill visibility. */
export interface SkillVisibilityOptions {
  /** API providers the user has configured (from integration_keys table).
   *  Skills that require an API key whose provider is NOT in this list are hidden. */
  configuredProviders?: string[];
  /**
   * Current platform identifier (e.g. "web", "telegram", "api").
   * Skills that list platforms in their frontmatter are hidden when the current
   * platform is not in that list. Skills with an empty platforms list are shown
   * on all platforms.
   */
  platform?: string;
  /**
   * Skill IDs (dirName) that the user has explicitly disabled via the user_skills table.
   * Disabled skills are excluded from the system prompt and tool list.
   */
  disabledSkillIds?: string[];
}

/**
 * PromptComposer — identity resolution + ResourceLoader construction.
 *
 * Benefits over the previous module-level functions:
 *  1. SOUL.md hot-reload: checks file mtime on every call → no server restart
 *     needed when the persona file is edited.
 *  2. All prompt-related state in one place: easy to extend with per-user
 *     identity overrides, memory injection, or skill composition later.
 *  3. Skill index (Phase 1): compact category-grouped guide appended to the
 *     system prompt via appendSystemPromptOverride.
 *  4. Per-user skill filtering (Phase 2): hides skills whose required API
 *     provider is not in the user's configuredProviders list.
 */
export class PromptComposer {
  private _identityText: string | undefined;
  private _identityMtime = 0;

  // Frozen snapshot per sessionId — prevents cache breaks mid-conversation.
  private _sessionSnapshots = new Map<string, string>();

  private _loaderCache = new Map<string, DefaultResourceLoader>();
  private _loaderReady = new Map<string, Promise<DefaultResourceLoader>>();

  // Skill metadata cache — reloaded when any SKILL.md file changes (mtime-based).
  private _skillMetas: SkillMeta[] | null = null;
  private _skillIndex: string | null = null;
  private _skillsMtime = 0;   // latest mtime across all SKILL.md files in SKILLS_DIR

  /**
   * Releases the frozen snapshot for a completed session (GC helper).
   * Call this when a session ends to avoid unbounded map growth.
   */
  releaseSession(sessionId: string): void {
    this._sessionSnapshots.delete(sessionId);
  }

  /**
   * Returns the effective system-prompt identity for this request.
   *
   * Priority:
   *   1. Explicit `systemPrompt` from the caller (per-request persona)
   *   2. Frozen snapshot for `sessionId` — loaded once, then immutable
   *   3. SOUL.md on disk — re-read if the file was modified (hot-reload)
   *   4. Hardcoded fallback if SOUL.md does not exist
   */
  getIdentity(systemPrompt?: string, sessionId?: string): string {
    if (systemPrompt) return systemPrompt;

    // Return frozen snapshot if this session has already been initialised
    if (sessionId && this._sessionSnapshots.has(sessionId)) {
      return this._sessionSnapshots.get(sessionId)!;
    }

    const identity = this._loadIdentityFromDisk();

    // Freeze for this session so mid-session SOUL.md edits never break cache
    if (sessionId) {
      this._sessionSnapshots.set(sessionId, identity);
      console.log(
        `[PromptComposer] Frozen snapshot for session=${sessionId.slice(0, 8)}… (${identity.length} chars)`,
      );
    }

    return identity;
  }

  /** Load SOUL.md from disk with mtime-based hot-reload (no sessionId path). */
  private _loadIdentityFromDisk(): string {
    try {
      const mtime = fs.statSync(SOUL_MD_PATH).mtimeMs;
      if (this._identityText === undefined || mtime > this._identityMtime) {
        const text = fs.readFileSync(SOUL_MD_PATH, "utf-8").trim();
        // Scan for prompt injection in SOUL.md before committing to cache
        const injectionPattern = PromptInjectionMiddleware.scan(text);
        if (injectionPattern) {
          console.warn(
            `[PromptComposer] ⚠️ SOUL.md contains a potential prompt-injection pattern: ` +
            `pattern=${injectionPattern}. Content loaded but review is recommended.`,
          );
        }
        this._identityText = text;
        this._identityMtime = mtime;
        console.log(
          `[PromptComposer] Loaded SOUL.md (${text.length} chars, ` +
          `mtime=${new Date(mtime).toISOString()})`,
        );
      }
    } catch {
      if (this._identityText === undefined) {
        this._identityText = FALLBACK_IDENTITY;
        console.warn(
          `[PromptComposer] SOUL.md not found at ${SOUL_MD_PATH}, using fallback identity`,
        );
      }
    }
    return this._identityText!;
  }

  /**
   * Returns cached skill metadata + index string.
   * Reloads automatically when any SKILL.md file is modified (mtime hot-reload),
   * so no server restart is needed after skill updates.
   */
  private _getSkillIndex(): { metas: SkillMeta[]; index: string } {
    // Compute the latest mtime across all SKILL.md files in SKILLS_DIR
    const latestMtime = this._latestSkillMtime();

    if (this._skillMetas === null || latestMtime > this._skillsMtime) {
      const prev = this._skillMetas?.length ?? 0;
      this._skillMetas = loadAllSkillMeta(SKILLS_DIR);
      this._skillIndex = buildSkillIndex(this._skillMetas);
      this._skillsMtime = latestMtime;
      if (prev > 0) {
        console.log(
          `[PromptComposer] Skill index reloaded (mtime change): ${this._skillMetas.length} skills`,
        );
      } else {
        console.log(
          `[PromptComposer] Skill index loaded: ${this._skillMetas.length} skills, ` +
          `${this._skillIndex.length} chars`,
        );
      }
      // Scan each skill's SKILL.md for prompt-injection patterns.
      for (const meta of this._skillMetas) {
        const skillMdPath = path.join(SKILLS_DIR, meta.dirName, "SKILL.md");
        try {
          const skillContent = fs.readFileSync(skillMdPath, "utf-8");
          const injectionPattern = PromptInjectionMiddleware.scan(skillContent);
          if (injectionPattern) {
            console.warn(
              `[PromptComposer] ⚠️ Skill file contains a potential prompt-injection pattern: ` +
              `skill=${meta.name} file=${skillMdPath} pattern=${injectionPattern}`,
            );
          }
        } catch {
          // File read error is non-fatal — skill loading continues
        }
      }
    }
    return { metas: this._skillMetas, index: this._skillIndex! };
  }

  /** Returns the maximum mtime (ms) of all SKILL.md files under SKILLS_DIR. */
  private _latestSkillMtime(): number {
    try {
      let latest = 0;
      for (const entry of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
        try {
          const mtime = fs.statSync(
            path.join(SKILLS_DIR, entry.name, "SKILL.md"),
          ).mtimeMs;
          if (mtime > latest) latest = mtime;
        } catch {
          // missing SKILL.md is fine — just skip
        }
      }
      return latest;
    } catch {
      return 0;
    }
  }

  /**
   * Returns a DefaultResourceLoader for the given identity / history.
   *
   * Caching behaviour:
   *  - appendHistory provided  → non-cached (unique per session)
   *  - configuredProviders set → non-cached (unique per user)
   *  - neither                 → cached by systemPrompt key (shared across users)
   *
   * Phase 1: appendSystemPromptOverride appends a compact skill category index.
   * Phase 2: skillsOverride filters out skills whose API provider is not
   *          in configuredProviders (requires API key but user hasn't set it up).
   */
  async getResourceLoader(
    systemPrompt: string,
    appendHistory?: string,
    sessionId?: string,
    skillOpts?: SkillVisibilityOptions,
  ): Promise<DefaultResourceLoader> {
    const identity = this.getIdentity(systemPrompt || undefined, sessionId);
    const { metas, index: skillIndex } = this._getSkillIndex();
    const { configuredProviders, platform, disabledSkillIds } = skillOpts ?? {};

    // Phase 1: append compact skill index to system prompt.
    const appendSkillOverride = skillIndex
      ? (base: string[]) => [...base, skillIndex]
      : undefined;

    // Phase 2, 3 & user_skills: hide skills whose required API provider is not configured,
    // OR whose platform list excludes the current platform,
    // OR which the user has explicitly disabled via the user_skills table.
    const disabledSet = disabledSkillIds?.length ? new Set(disabledSkillIds) : undefined;
    const needsFilter = !!(configuredProviders?.length || platform || disabledSet);
    const skillsOverrideFn = needsFilter
      ? (base: { skills: any[]; diagnostics: any }) => {
          const filtered = base.skills.filter((skill: any) => {
            const dirName = path.basename(path.dirname(skill.filePath ?? ""));
            const meta = metas.find((m) => m.dirName === dirName);

            // user_skills filter — user explicitly disabled this skill
            if (disabledSet && (disabledSet.has(dirName) || (meta && disabledSet.has(meta.name)))) {
              return false;
            }

            // Phase 2: API key filter
            if (meta?.requiresApiKey && meta.apiKeyProvider && configuredProviders?.length) {
              if (!configuredProviders.includes(meta.apiKeyProvider)) return false;
            }

            // Phase 3: Platform filter — skip if skill declares platforms and
            // the current platform is not listed.
            if (meta?.platforms.length && platform) {
              if (!meta.platforms.includes(platform.toLowerCase())) return false;
            }

            return true;
          });
          return { skills: filtered, diagnostics: base.diagnostics };
        }
      : undefined;

    // Non-cacheable path: per-session history or per-user skill filtering.
    if (appendHistory || skillsOverrideFn) {
      const loader = new DefaultResourceLoader({
        cwd: SKILLS_DIR,
        agentDir: AGENT_DIR,
        systemPromptOverride: () => identity,
        appendSystemPrompt: appendHistory,
        ...(appendSkillOverride ? { appendSystemPromptOverride: appendSkillOverride } : {}),
        ...(skillsOverrideFn ? { skillsOverride: skillsOverrideFn } : {}),
      });
      await loader.reload();
      console.log(
        `[PromptComposer] Non-cached loader ` +
        `history=${appendHistory?.length ?? 0}chars ` +
        `providers=${configuredProviders?.join(",") ?? "all"} ` +
        `disabled=${disabledSet?.size ?? 0}`,
      );
      return loader;
    }

    // Shared-cache path: no per-user state, key by systemPrompt.
    const key = systemPrompt || "__default__";
    if (this._loaderCache.has(key)) return this._loaderCache.get(key)!;
    if (this._loaderReady.has(key)) return this._loaderReady.get(key)!;

    const p = (async () => {
      const preview = identity.slice(0, 80) + (identity.length > 80 ? "..." : "");
      console.log(
        `[PromptComposer] key="${key.slice(0, 32)}" ` +
        `persona=${!!systemPrompt} identity="${preview}"`,
      );
      const loader = new DefaultResourceLoader({
        cwd: SKILLS_DIR,
        agentDir: AGENT_DIR,
        systemPromptOverride: () => identity,
        ...(appendSkillOverride ? { appendSystemPromptOverride: appendSkillOverride } : {}),
      });
      await loader.reload();
      this._loaderCache.set(key, loader);
      this._loaderReady.delete(key);
      return loader;
    })();

    this._loaderReady.set(key, p);
    return p;
  }
}
