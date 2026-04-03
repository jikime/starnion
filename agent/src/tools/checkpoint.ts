/**
 * checkpoint.ts — Filesystem snapshot & rollback tools.
 *
 * Before running destructive operations (rm, overwrite, etc.), the agent can
 * create a checkpoint that copies the target files/directories to a safe
 * location.  If something goes wrong, checkpoint_rollback restores them.
 *
 * Storage layout:
 *   ~/.starnion/checkpoints/{userId}/{sessionId}/{checkpointId}/
 *     metadata.json   — { id, description, entries[], createdAt }
 *     files/          — mirrored file content (absolute paths flattened)
 */

import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { Type } from "@sinclair/typebox";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

// ── Constants ─────────────────────────────────────────────────────────────────

const BASE_CHECKPOINT_DIR =
  process.env.CHECKPOINT_DIR ?? path.join(os.homedir(), ".starnion", "checkpoints");

// Maximum total size per checkpoint (64 MB).
const MAX_CHECKPOINT_BYTES = 64 * 1024 * 1024;

// Maximum number of checkpoints retained per session.
const MAX_CHECKPOINTS_PER_SESSION = 10;

// ── Schemas ───────────────────────────────────────────────────────────────────

const checkpointCreateSchema = Type.Object({
  paths: Type.Array(Type.String(), {
    description: "Absolute or relative file/directory paths to snapshot. Relative paths resolve from session cwd.",
  }),
  description: Type.Optional(
    Type.String({ description: "Human-readable label for this checkpoint." }),
  ),
});

const checkpointRollbackSchema = Type.Object({
  id: Type.String({ description: "Checkpoint ID returned by checkpoint_create." }),
});

const checkpointListSchema = Type.Object({});

// ── Metadata ──────────────────────────────────────────────────────────────────

interface CheckpointEntry {
  originalPath: string;   // absolute original path
  storedPath: string;     // relative path under checkpoint dir
  type: "file" | "dir";
}

interface CheckpointMetadata {
  id: string;
  description: string;
  entries: CheckpointEntry[];
  createdAt: string;
  sizeBytes: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function nanoid(): string {
  return crypto.randomBytes(6).toString("hex");
}

/** Flatten an absolute path into a safe filename for the stored copy. */
function flattenPath(absPath: string): string {
  // Replace leading slash and path separators with underscores.
  return absPath.replace(/^\//, "").replace(/\//g, "__");
}

/** Recursively get the total size (bytes) of a path. */
function dirSize(p: string): number {
  const stat = fs.statSync(p, { throwIfNoEntry: false });
  if (!stat) return 0;
  if (stat.isFile()) return stat.size;
  let total = 0;
  for (const entry of fs.readdirSync(p)) {
    total += dirSize(path.join(p, entry));
  }
  return total;
}

/** Copy a file or directory recursively to dst. */
function copyRecursive(src: string, dst: string): void {
  const stat = fs.statSync(src);
  if (stat.isFile()) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  } else if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dst, entry));
    }
  }
}

/** Prune oldest checkpoints if session exceeds MAX_CHECKPOINTS_PER_SESSION. */
function pruneOldCheckpoints(sessionDir: string): void {
  let entries: string[];
  try {
    entries = fs
      .readdirSync(sessionDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return;
  }
  if (entries.length <= MAX_CHECKPOINTS_PER_SESSION) return;

  // Sort by metadata.createdAt ascending, remove oldest.
  const withTime = entries
    .map((id) => {
      try {
        const meta = JSON.parse(
          fs.readFileSync(path.join(sessionDir, id, "metadata.json"), "utf-8"),
        ) as CheckpointMetadata;
        return { id, createdAt: meta.createdAt };
      } catch {
        return { id, createdAt: "0" };
      }
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const toRemove = withTime.slice(0, withTime.length - MAX_CHECKPOINTS_PER_SESSION);
  for (const { id } of toRemove) {
    try {
      fs.rmSync(path.join(sessionDir, id), { recursive: true, force: true });
    } catch { /* ignore */ }
  }
}

// ── Tool factories ────────────────────────────────────────────────────────────

function makeCheckpointCreateTool(
  userId: string,
  sessionId: string,
): ToolDefinition<typeof checkpointCreateSchema, null> {
  return {
    name: "checkpoint_create",
    label: "Create Filesystem Checkpoint",
    description:
      "Snapshot files or directories before a potentially destructive operation. " +
      "Returns a checkpoint ID that can be used with checkpoint_rollback to restore.",
    promptSnippet: "checkpoint_create(paths, description?)",
    promptGuidelines: [
      "Call checkpoint_create before rm -r, overwriting files, or other destructive operations.",
      "Pass all paths that will be modified or deleted.",
      "Use checkpoint_rollback(id) to restore if the operation goes wrong.",
    ],
    parameters: checkpointCreateSchema,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { paths, description = "" } = params;
      if (!paths || paths.length === 0) {
        return { content: [{ type: "text" as const, text: "No paths specified." }], details: null };
      }

      const checkpointId = nanoid();
      const sessionDir = path.join(BASE_CHECKPOINT_DIR, userId, sessionId);
      const cpDir = path.join(sessionDir, checkpointId);
      const filesDir = path.join(cpDir, "files");

      fs.mkdirSync(filesDir, { recursive: true });
      pruneOldCheckpoints(sessionDir);

      const entries: CheckpointEntry[] = [];
      let totalBytes = 0;
      const errors: string[] = [];

      for (const p of paths) {
        const absPath = path.isAbsolute(p) ? p : path.resolve(ctx.cwd, p);
        const stat = fs.statSync(absPath, { throwIfNoEntry: false });
        if (!stat) {
          errors.push(`${absPath}: not found (skipped)`);
          continue;
        }

        const size = dirSize(absPath);
        if (totalBytes + size > MAX_CHECKPOINT_BYTES) {
          errors.push(`${absPath}: skipped (would exceed 64 MB checkpoint limit)`);
          continue;
        }
        totalBytes += size;

        const stored = flattenPath(absPath);
        const dstPath = path.join(filesDir, stored);

        try {
          copyRecursive(absPath, dstPath);
          entries.push({
            originalPath: absPath,
            storedPath: stored,
            type: stat.isDirectory() ? "dir" : "file",
          });
        } catch (err) {
          errors.push(`${absPath}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (entries.length === 0) {
        fs.rmSync(cpDir, { recursive: true, force: true });
        return {
          content: [{ type: "text" as const, text: `Checkpoint failed: no files could be copied.\n${errors.join("\n")}` }],
          details: null,
        };
      }

      const meta: CheckpointMetadata = {
        id: checkpointId,
        description: description || `checkpoint of ${entries.length} path(s)`,
        entries,
        createdAt: new Date().toISOString(),
        sizeBytes: totalBytes,
      };
      fs.writeFileSync(path.join(cpDir, "metadata.json"), JSON.stringify(meta, null, 2));

      const sizeKb = Math.round(totalBytes / 1024);
      let text = `✅ Checkpoint created: \`${checkpointId}\`\n`;
      text += `Paths snapshotted: ${entries.map((e) => e.originalPath).join(", ")}\n`;
      text += `Size: ${sizeKb} KB\n`;
      if (errors.length) text += `Warnings:\n${errors.map((e) => `  - ${e}`).join("\n")}`;
      text += `\nUse checkpoint_rollback("${checkpointId}") to restore if needed.`;

      return { content: [{ type: "text" as const, text }], details: null };
    },
  };
}

function makeCheckpointListTool(
  userId: string,
  sessionId: string,
): ToolDefinition<typeof checkpointListSchema, null> {
  return {
    name: "checkpoint_list",
    label: "List Filesystem Checkpoints",
    description: "List all available filesystem checkpoints for the current session.",
    promptSnippet: "checkpoint_list()",
    parameters: checkpointListSchema,

    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const sessionDir = path.join(BASE_CHECKPOINT_DIR, userId, sessionId);
      let ids: string[];
      try {
        ids = fs
          .readdirSync(sessionDir, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name);
      } catch {
        return { content: [{ type: "text" as const, text: "No checkpoints found for this session." }], details: null };
      }

      if (ids.length === 0) {
        return { content: [{ type: "text" as const, text: "No checkpoints found for this session." }], details: null };
      }

      const metas: CheckpointMetadata[] = [];
      for (const id of ids) {
        try {
          const meta = JSON.parse(
            fs.readFileSync(path.join(sessionDir, id, "metadata.json"), "utf-8"),
          ) as CheckpointMetadata;
          metas.push(meta);
        } catch { /* skip malformed */ }
      }
      metas.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      const lines = metas.map((m) => {
        const sizeKb = Math.round(m.sizeBytes / 1024);
        const paths = m.entries.map((e) => e.originalPath).join(", ");
        return `- \`${m.id}\` — ${m.description} (${sizeKb} KB) — ${m.createdAt.slice(0, 19)} — paths: ${paths}`;
      });

      return {
        content: [{ type: "text" as const, text: `Checkpoints (${metas.length}):\n${lines.join("\n")}` }],
        details: null,
      };
    },
  };
}

function makeCheckpointRollbackTool(
  userId: string,
  sessionId: string,
): ToolDefinition<typeof checkpointRollbackSchema, null> {
  return {
    name: "checkpoint_rollback",
    label: "Rollback to Filesystem Checkpoint",
    description: "Restore files/directories from a previously created checkpoint.",
    promptSnippet: "checkpoint_rollback(id)",
    promptGuidelines: [
      "Use the checkpoint ID returned by checkpoint_create.",
      "This overwrites current files with the snapshotted versions.",
      "Use checkpoint_list() to see available checkpoints.",
    ],
    parameters: checkpointRollbackSchema,

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { id } = params;
      const cpDir = path.join(BASE_CHECKPOINT_DIR, userId, sessionId, id);
      const metaPath = path.join(cpDir, "metadata.json");

      if (!fs.existsSync(metaPath)) {
        return {
          content: [{ type: "text" as const, text: `Checkpoint \`${id}\` not found.` }],
          details: null,
        };
      }

      let meta: CheckpointMetadata;
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      } catch {
        return {
          content: [{ type: "text" as const, text: `Checkpoint \`${id}\` metadata is corrupted.` }],
          details: null,
        };
      }

      const filesDir = path.join(cpDir, "files");
      const restored: string[] = [];
      const errors: string[] = [];

      for (const entry of meta.entries) {
        const srcPath = path.join(filesDir, entry.storedPath);
        try {
          // Remove current version, then restore from checkpoint.
          if (fs.existsSync(entry.originalPath)) {
            fs.rmSync(entry.originalPath, { recursive: true, force: true });
          }
          fs.mkdirSync(path.dirname(entry.originalPath), { recursive: true });
          copyRecursive(srcPath, entry.originalPath);
          restored.push(entry.originalPath);
        } catch (err) {
          errors.push(`${entry.originalPath}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      let text = `✅ Rollback complete from checkpoint \`${id}\`\n`;
      text += `Restored: ${restored.join(", ")}`;
      if (errors.length) text += `\nErrors:\n${errors.map((e) => `  - ${e}`).join("\n")}`;

      return { content: [{ type: "text" as const, text }], details: null };
    },
  };
}

// ── Exported factory ──────────────────────────────────────────────────────────

/**
 * Returns filesystem checkpoint tools scoped to a specific user+session.
 *
 * @param taskId - Unique session identifier: "{userId}:{sessionId}"
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createCheckpointTools(taskId: string): ToolDefinition<any, any>[] {
  const colonIdx = taskId.indexOf(":");
  const userId = taskId.slice(0, colonIdx);
  const sessionId = taskId.slice(colonIdx + 1);
  return [
    makeCheckpointCreateTool(userId, sessionId),
    makeCheckpointListTool(userId, sessionId),
    makeCheckpointRollbackTool(userId, sessionId),
  ];
}
