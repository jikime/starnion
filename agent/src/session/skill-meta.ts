/**
 * skill-meta.ts — shared Level-1 skill metadata utilities.
 *
 * Imported by:
 *  - prompt-composer.ts  (builds skill index for system prompt)
 *  - skill-tools.ts      (skill_list / skill_view native tools)
 */

import path from "path";
import fs from "fs";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SkillMeta {
  dirName: string;        // directory name, e.g. "weather"
  name: string;           // from name frontmatter, e.g. "starnion-weather"
  displayName: string;    // from display_name frontmatter
  category: string;       // from category frontmatter
  emoji: string;          // from emoji frontmatter
  keywords: string[];     // extracted from "Use for: ..." in description
  enabledByDefault: boolean;
  requiresApiKey: boolean;
  apiKeyProvider: string; // e.g. "tavily", "gemini" — empty if not required
  /** Platforms this skill supports. Empty array = unrestricted (all platforms). */
  platforms: string[];    // e.g. ["web", "telegram"]; [] = all platforms
}

// ── Frontmatter parser ────────────────────────────────────────────────────────

/** Parse a single SKILL.md file and extract Level-1 metadata fields. */
export function parseSkillMeta(skillDir: string): SkillMeta | null {
  const skillMdPath = path.join(skillDir, "SKILL.md");
  if (!fs.existsSync(skillMdPath)) return null;
  try {
    const content = fs.readFileSync(skillMdPath, "utf-8");
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) return null;
    const fm = fmMatch[1];
    const get = (key: string): string => {
      const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
      return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
    };
    const description = get("description");
    const useForMatch = description.match(/Use for:\s*(.+)/);
    const keywords = useForMatch
      ? useForMatch[1].split(",").map((k) => k.trim()).filter(Boolean)
      : [];
    return {
      dirName: path.basename(skillDir),
      name: get("name"),
      displayName: get("display_name"),
      category: get("category") || "other",
      emoji: get("emoji"),
      keywords,
      enabledByDefault: get("enabled_by_default") !== "false",
      requiresApiKey: get("requires_api_key") === "true",
      apiKeyProvider: get("api_key_provider"),
      platforms: get("platforms")
        .split(",")
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean),
    };
  } catch {
    return null;
  }
}

/** Scan skillsDir and return Level-1 metadata for every skill subdirectory. */
export function loadAllSkillMeta(skillsDir: string): SkillMeta[] {
  try {
    return fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
      .map((e) => parseSkillMeta(path.join(skillsDir, e.name)))
      .filter((m): m is SkillMeta => m !== null);
  } catch {
    return [];
  }
}

/**
 * Build a compact category-grouped skill index string for the system prompt.
 * ~200 tokens for ~20 skills.
 *
 * Example:
 *   ## Available Skills
 *   **utility**: weather(날씨, 기온, 비, 눈) | currency(환율, 달러, 환전, 원)
 *   **search**: websearch(검색해줘, 찾아줘, 최신 정보, 인터넷에서) | ...
 */
export function buildSkillIndex(metas: SkillMeta[]): string {
  if (metas.length === 0) return "";
  const byCategory = new Map<string, SkillMeta[]>();
  for (const m of metas) {
    if (!byCategory.has(m.category)) byCategory.set(m.category, []);
    byCategory.get(m.category)!.push(m);
  }
  const lines: string[] = ["## Available Skills"];
  for (const [cat, skills] of byCategory) {
    const entries = skills.map((s) => {
      const kw = s.keywords.slice(0, 4).join(", ");
      return kw ? `${s.dirName}(${kw})` : s.dirName;
    }).join(" | ");
    lines.push(`**${cat}**: ${entries}`);
  }
  return lines.join("\n");
}

/**
 * Build a compact skill index filtered by the user's message.
 *
 * Filtering rules:
 *  - Skills with NO keywords → always included (general-purpose)
 *  - Skills WITH keywords → included only if at least one keyword appears in the message
 *  - If ZERO keyword-bearing skills match → fall back to full index (no false negatives)
 */
export function buildFilteredSkillIndex(metas: SkillMeta[], message: string): string {
  const lower = message.toLowerCase();
  const filtered = metas.filter((m) => {
    if (m.keywords.length === 0) return true;  // no keywords = always show
    return m.keywords.some((kw) => lower.includes(kw.toLowerCase()));
  });

  // Fallback: if filtering removed all keyword-bearing skills, show everything
  const keywordSkills = metas.filter((m) => m.keywords.length > 0);
  const anyMatched = keywordSkills.some((m) =>
    m.keywords.some((kw) => lower.includes(kw.toLowerCase())),
  );
  if (!anyMatched) return buildSkillIndex(metas);

  return buildSkillIndex(filtered);
}
