import path from "path";
import fs from "fs";
import { Type } from "@sinclair/typebox";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { loadAllSkillMeta, type SkillMeta } from "../session/skill-meta.js";

// ── Paths ──────────────────────────────────────────────────────────────────────
const AGENT_DIR = path.resolve(process.env.AGENT_DIR ?? process.cwd());
const SKILLS_DIR = path.resolve(
  process.env.SKILLS_DIR ?? path.join(AGENT_DIR, "skills"),
);

// ── Schemas ───────────────────────────────────────────────────────────────────

const skillListSchema = Type.Object({});

const skillViewSchema = Type.Object({
  name: Type.String({
    description:
      "Skill directory name (e.g. \"weather\") or full name (e.g. \"starnion-weather\").",
  }),
  file: Type.Optional(
    Type.String({
      description:
        "Relative path within the skill directory to read instead of SKILL.md. " +
        "E.g. \"references/api.md\" for Level-3 content.",
    }),
  ),
});

// ── skill_list cache ───────────────────────────────────────────────────────────

const SKILL_LIST_CACHE_TTL_MS = 30_000; // 30 seconds

interface SkillListCache {
  metas: SkillMeta[];
  latestMtime: number;
  expiresAt: number;
}

let _skillListCache: SkillListCache | null = null;

/** Returns the maximum mtime (ms) of all SKILL.md files under dir. */
function _latestSkillMtime(dir: string): number {
  try {
    let latest = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
      try {
        const mtime = fs.statSync(path.join(dir, entry.name, "SKILL.md")).mtimeMs;
        if (mtime > latest) latest = mtime;
      } catch {
        // missing SKILL.md — skip
      }
    }
    return latest;
  } catch {
    return 0;
  }
}

/** Returns cached skill metadata, reloading when SKILL.md files change or TTL expires. */
function getCachedSkillMetas(): SkillMeta[] {
  const now = Date.now();
  const latestMtime = _latestSkillMtime(SKILLS_DIR);

  if (
    _skillListCache &&
    now < _skillListCache.expiresAt &&
    latestMtime <= _skillListCache.latestMtime
  ) {
    return _skillListCache.metas;
  }

  const metas = loadAllSkillMeta(SKILLS_DIR);
  _skillListCache = { metas, latestMtime, expiresAt: now + SKILL_LIST_CACHE_TTL_MS };
  return metas;
}

// ── skill_list tool ────────────────────────────────────────────────────────────

function makeSkillListTool(
  disabledSkillIds?: string[],
): ToolDefinition<typeof skillListSchema, null> {
  const disabledSet = disabledSkillIds?.length ? new Set(disabledSkillIds) : undefined;
  return {
    name: "skill_list",
    label: "List Available Skills",
    description:
      "Returns metadata for every skill the agent has access to, " +
      "grouped by category. Useful for discovering which skills are available " +
      "before deciding whether to invoke one.",
    promptSnippet: "skill_list()",
    promptGuidelines: [
      "Call skill_list when you are unsure which skills are available.",
      "The response lists each skill's name, category, emoji, and trigger keywords.",
      "Use skill_view to read a skill's full documentation before using it.",
    ],
    parameters: skillListSchema,

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      let metas: SkillMeta[] = getCachedSkillMetas();

      // Filter out skills the user has disabled
      if (disabledSet) {
        metas = metas.filter(
          (m) => !disabledSet.has(m.dirName) && !disabledSet.has(m.name),
        );
      }

      if (metas.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No skills found." }],
          details: null,
        };
      }

      // Group by category
      const byCategory = new Map<string, SkillMeta[]>();
      for (const m of metas) {
        if (!byCategory.has(m.category)) byCategory.set(m.category, []);
        byCategory.get(m.category)!.push(m);
      }

      const lines: string[] = [`Skills directory: ${SKILLS_DIR}`, ""];
      for (const [cat, skills] of byCategory) {
        lines.push(`## ${cat}`);
        for (const s of skills) {
          const kw = s.keywords.length ? ` — keywords: ${s.keywords.join(", ")}` : "";
          const apiNote = s.requiresApiKey ? ` [requires API key: ${s.apiKeyProvider}]` : "";
          lines.push(`  ${s.emoji || "•"} **${s.dirName}** (${s.name})${kw}${apiNote}`);
        }
        lines.push("");
      }
      lines.push(`Total: ${metas.length} skill(s)`);

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
        details: null,
      };
    },
  };
}

// ── skill_view tool ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const skillViewTool: ToolDefinition<typeof skillViewSchema, null> = {
  name: "skill_view",
  label: "View Skill Documentation",
  description:
    "Reads and returns the full documentation for a specific skill. " +
    "By default returns the SKILL.md file (Level-2 content). " +
    "Pass the `file` parameter to read a linked reference file (Level-3 content), " +
    "e.g. file=\"references/api.md\".",
  promptSnippet: "skill_view(name, file?)",
  promptGuidelines: [
    "Use skill_view to read a skill's full SKILL.md before using it.",
    "For additional reference files, pass the relative file path in the `file` parameter.",
    "The name parameter accepts the directory name (e.g. \"weather\") or the full skill name.",
  ],
  parameters: skillViewSchema,

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
    const { name, file } = params;

    // Resolve skill directory: match by dirName or by name frontmatter field
    const metas = getCachedSkillMetas();
    const meta = metas.find((m) => m.dirName === name || m.name === name);

    let skillDir: string;
    if (meta) {
      skillDir = path.join(SKILLS_DIR, meta.dirName);
    } else {
      // Fallback: try treating name as a directory name directly
      const candidate = path.join(SKILLS_DIR, name);
      if (!fs.existsSync(candidate)) {
        const known = metas.map((m) => m.dirName).join(", ");
        return {
          content: [
            {
              type: "text" as const,
              text: `Skill not found: "${name}". Known skills: ${known || "(none)"}`,
            },
          ],
          details: null,
        };
      }
      skillDir = candidate;
    }

    // Determine which file to read
    const targetFile = file ? file : "SKILL.md";
    const targetPath = path.join(skillDir, targetFile);

    // Security: ensure the resolved path stays within SKILLS_DIR
    const resolved = path.resolve(targetPath);
    if (!resolved.startsWith(path.resolve(SKILLS_DIR) + path.sep)) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Access denied: path "${targetFile}" escapes the skills directory.`,
          },
        ],
        details: null,
      };
    }

    if (!fs.existsSync(resolved)) {
      return {
        content: [
          {
            type: "text" as const,
            text: `File not found: ${targetFile} in skill "${name}".`,
          },
        ],
        details: null,
      };
    }

    try {
      const content = fs.readFileSync(resolved, "utf-8");
      const header = `# ${name}/${targetFile}\n\n`;
      return {
        content: [{ type: "text" as const, text: header + content }],
        details: null,
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error reading ${targetFile}: ${(err as Error).message}`,
          },
        ],
        details: null,
      };
    }
  },
};

// ── Exported tool set ─────────────────────────────────────────────────────────

/**
 * Creates the skill tool set for a session.
 * @param disabledSkillIds - Skill IDs (dirName or name) the user has disabled.
 *        Disabled skills are hidden from skill_list output.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createSkillTools(disabledSkillIds?: string[]): ToolDefinition<any, any>[] {
  return [makeSkillListTool(disabledSkillIds), skillViewTool];
}

/** @deprecated Use createSkillTools() instead. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const skillTools: ToolDefinition<any, any>[] = [makeSkillListTool(), skillViewTool];
