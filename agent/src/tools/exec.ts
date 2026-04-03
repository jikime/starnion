import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { Type } from "@sinclair/typebox";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { processRegistry } from "./process-registry.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExecDetails {
  command: string;
  exitCode: number | null;
  background: boolean;
  processId?: string;
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const execSchema = Type.Object({
  command: Type.String({ description: "Shell command to execute." }),
  workdir: Type.Optional(
    Type.String({ description: "Working directory (absolute or relative to session cwd)." }),
  ),
  env: Type.Optional(
    Type.Record(Type.String(), Type.String(), {
      description: "Extra environment variables for this command.",
    }),
  ),
  timeout: Type.Optional(
    Type.Number({ description: "Foreground timeout in ms (default 30 000). Ignored for background." }),
  ),
  background: Type.Optional(
    Type.Boolean({ description: "Run in background. Returns immediately with a processId." }),
  ),
  yieldMs: Type.Optional(
    Type.Number({
      description: "With background=true: wait this many ms before returning, collecting initial output.",
    }),
  ),
});

const execStatusSchema = Type.Object({
  processId: Type.String({ description: "Process ID returned by exec with background=true." }),
});

const execKillSchema = Type.Object({
  processId: Type.String({ description: "Process ID to terminate." }),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function nanoid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function resolveWorkdir(workdir: string | undefined, cwd: string): string {
  if (!workdir) return cwd;
  return path.isAbsolute(workdir) ? workdir : path.resolve(cwd, workdir);
}

// Cap foreground stdout+stderr at 256 KB each (same limit as background processes).
const MAX_FOREGROUND_OUTPUT_BYTES = 256 * 1024;

function capOutput(current: string, chunk: string): string {
  const combined = current + chunk;
  if (combined.length > MAX_FOREGROUND_OUTPUT_BYTES) {
    return combined.slice(combined.length - MAX_FOREGROUND_OUTPUT_BYTES);
  }
  return combined;
}

function runForeground(
  command: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeout: number,
  signal: AbortSignal | undefined,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    const proc = spawn(command, { shell: true, cwd, env });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d: Buffer) => { stdout = capOutput(stdout, d.toString()); });
    proc.stderr.on("data", (d: Buffer) => { stderr = capOutput(stderr, d.toString()); });

    const timer = timeout > 0 ? setTimeout(() => proc.kill("SIGTERM"), timeout) : null;
    const onAbort = () => proc.kill("SIGTERM");
    signal?.addEventListener("abort", onAbort);

    proc.on("close", (code) => {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve({ stdout, stderr, exitCode: code });
    });

    proc.on("error", (err) => {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve({ stdout, stderr: stderr + `\nProcess error: ${err.message}`, exitCode: 1 });
    });
  });
}

function runBackground(
  command: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
  yieldMs: number,
  sessionKey: object,
): Promise<{ processId: string; initialOutput: string; exitedImmediately: boolean; exitCode: number | null }> {
  return new Promise((resolve) => {
    const processId = nanoid();
    const proc = spawn(command, { shell: true, cwd, env, detached: false });

    const bgProc = {
      pid: proc.pid ?? 0,
      command,
      startedAt: new Date(),
      output: "",
      process: proc,
      exitCode: null as number | null,
      running: true,
    };

    processRegistry.register(sessionKey, processId, bgProc);

    proc.stdout.on("data", (d: Buffer) => processRegistry.append(sessionKey, processId, d.toString()));
    proc.stderr.on("data", (d: Buffer) => processRegistry.append(sessionKey, processId, d.toString()));

    proc.on("close", (code) => {
      bgProc.exitCode = code;
      bgProc.running = false;
    });

    proc.on("error", (err) => {
      processRegistry.append(sessionKey, processId, `\nProcess error: ${err.message}`);
      bgProc.running = false;
    });

    if (yieldMs > 0) {
      setTimeout(() => {
        const snap = processRegistry.get(sessionKey, processId);
        resolve({
          processId,
          initialOutput: snap?.output ?? "",
          exitedImmediately: !(snap?.running ?? true),
          exitCode: snap?.exitCode ?? null,
        });
      }, yieldMs);
    } else {
      resolve({ processId, initialOutput: "", exitedImmediately: false, exitCode: null });
    }
  });
}

// ── Security: blocked env var keys ────────────────────────────────────────────
// Prevent tool callers from hijacking the process environment via PATH, SHELL, etc.
const BLOCKED_ENV_KEYS = new Set([
  "SHELL", "PATH", "LD_PRELOAD", "LD_LIBRARY_PATH",
  "DYLD_INSERT_LIBRARIES", "DYLD_LIBRARY_PATH",
  "NODE_OPTIONS", "NODE_PATH", "PYTHONPATH",
]);

// ── Dangerous command detection ────────────────────────────────────────────────

interface DangerousPattern {
  pattern: RegExp;
  reason: string;
}

const DANGEROUS_PATTERNS: DangerousPattern[] = [
  { pattern: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*|-r\b|--recursive\b)/, reason: "recursive file deletion (rm -r/-rf)" },
  { pattern: /\bsudo\b/,                                            reason: "privileged command execution (sudo)" },
  { pattern: /\bdd\s+if=/,                                          reason: "disk imaging/overwrite (dd)" },
  { pattern: /\bmkfs\b/,                                            reason: "filesystem formatting (mkfs)" },
];

function detectDangerous(command: string): DangerousPattern | undefined {
  return DANGEROUS_PATTERNS.find((p) => p.pattern.test(command));
}

interface PendingCommand {
  command: string;
  workdir?: string;
  env?: Record<string, string>;
  timeout: number;
  background: boolean;
  yieldMs: number;
  storedAt: number;
}

/** Module-level store: pending dangerous commands awaiting user approval, keyed by taskId. */
const pendingDangerousCommands = new Map<string, PendingCommand>();

const APPROVAL_TTL_MS = 120_000; // 2 minutes

// ── Per-task skill environment (updated on every request, not cached) ─────────
// Stored outside the session cache so API key changes take effect immediately.
const _taskSkillEnv = new Map<string, Record<string, string>>();

export function setTaskSkillEnv(taskId: string, env: Record<string, string>): void {
  _taskSkillEnv.set(taskId, env);
}

function getTaskSkillEnv(taskId: string): Record<string, string> {
  return _taskSkillEnv.get(taskId) ?? {};
}

// ── venv python resolution ────────────────────────────────────────────────────
// Resolve "python3 ..." commands to use the StarNion venv python if available.
// This ensures skill scripts use the isolated environment regardless of the
// user's system python installation.
const _venvPython = (() => {
  const venv = path.join(os.homedir(), ".starnion", "venv", "bin", "python3");
  return fs.existsSync(venv) ? venv : null;
})();

function resolveVenvPython(command: string): string {
  if (!_venvPython) return command;
  // Replace "python3 " at the start of the command
  if (command.startsWith("python3 ")) {
    return _venvPython + command.slice(7);
  }
  // Replace "python " at the start
  if (command.startsWith("python ")) {
    return _venvPython + command.slice(6);
  }
  return command;
}

// ── exec tool ─────────────────────────────────────────────────────────────────

export const execTool: ToolDefinition<typeof execSchema, ExecDetails> = {
  name: "exec",
  label: "Execute Shell Command",
  description:
    "Run shell commands in the workspace. Supports foreground and background execution.\n" +
    "- Foreground (default): runs synchronously, returns stdout/stderr.\n" +
    "- Background (background=true): spawns process, returns processId immediately.\n" +
    "- yieldMs with background: waits N ms to collect initial output before returning.\n" +
    "- Use exec_status to poll a running background process.\n" +
    "- Use exec_kill to terminate a background process.",
  promptSnippet: "exec(command, workdir?, env?, timeout?, background?, yieldMs?)",
  promptGuidelines: [
    "Use exec for shell commands, scripts, and process execution.",
    "Prefer background=true for long-running tasks (servers, watchers, builds).",
    "Use yieldMs (e.g. 3000) with background to verify the process started correctly.",
    "Check background process output with exec_status(processId).",
    "Stop a background process with exec_kill(processId).",
  ],
  parameters: execSchema,

  async execute(_toolCallId, params, signal, _onUpdate, ctx) {
    let { command, workdir, env: extraEnv, timeout = 30_000, background = false, yieldMs = 0 } = params;
    const cwd = resolveWorkdir(workdir, ctx.cwd);
    const filteredEnv = extraEnv
      ? Object.fromEntries(
          Object.entries(extraEnv).filter(([k]) => !BLOCKED_ENV_KEYS.has(k.toUpperCase())),
        )
      : {};
    const env: NodeJS.ProcessEnv = { ...process.env, ...filteredEnv };

    // Use StarNion venv python if available (isolates from system python)
    command = resolveVenvPython(command);

    if (background) {
      const { processId, initialOutput, exitedImmediately, exitCode } =
        await runBackground(command, cwd, env, yieldMs, ctx.sessionManager);

      let text: string;
      if (exitedImmediately) {
        text = `Process exited immediately (exitCode=${exitCode ?? "null"}).\nOutput:\n${initialOutput || "(empty)"}`;
      } else if (yieldMs > 0) {
        text = `Background process started. Process ID: ${processId}\nInitial output (${yieldMs}ms):\n${initialOutput || "(no output yet)"}`;
      } else {
        text = `Background process started. Process ID: ${processId}\nUse exec_status("${processId}") to read output.`;
      }

      return {
        content: [{ type: "text" as const, text }],
        details: { command, exitCode: null, background: true, processId },
      };
    }

    // Foreground
    const { stdout, stderr, exitCode } = await runForeground(command, cwd, env, timeout, signal);
    const parts: string[] = [];
    if (stdout) parts.push(stdout.trimEnd());
    if (stderr) parts.push(`[stderr]\n${stderr.trimEnd()}`);
    if (parts.length === 0) parts.push("(no output)");
    const text = parts.join("\n") + `\n[exitCode: ${exitCode ?? "null"}]`;

    return {
      content: [{ type: "text" as const, text }],
      details: { command, exitCode, background: false },
    };
  },
};

// ── exec_status tool ──────────────────────────────────────────────────────────

export const execStatusTool: ToolDefinition<typeof execStatusSchema, null> = {
  name: "exec_status",
  label: "Background Process Status",
  description: "Check the status and accumulated output of a background process started with exec.",
  promptSnippet: "exec_status(processId)",
  parameters: execStatusSchema,

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const proc = processRegistry.get(ctx.sessionManager, params.processId);
    if (!proc) {
      return {
        content: [{ type: "text" as const, text: `No process found with ID: ${params.processId}` }],
        details: null,
      };
    }

    const status = proc.running ? "running" : `exited (code=${proc.exitCode ?? "null"})`;
    const elapsed = Math.round((Date.now() - proc.startedAt.getTime()) / 1000);
    const text =
      `Process ID: ${params.processId}\n` +
      `Status: ${status}\n` +
      `Running for: ${elapsed}s\n` +
      `Command: ${proc.command}\n` +
      `Output (last 256KB):\n${proc.output || "(no output)"}`;

    return {
      content: [{ type: "text" as const, text }],
      details: null,
    };
  },
};

// ── exec_kill tool ────────────────────────────────────────────────────────────

export const execKillTool: ToolDefinition<typeof execKillSchema, null> = {
  name: "exec_kill",
  label: "Kill Background Process",
  description: "Terminate a background process started with exec.",
  promptSnippet: "exec_kill(processId)",
  parameters: execKillSchema,

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const killed = processRegistry.kill(ctx.sessionManager, params.processId);
    const text = killed
      ? `Process ${params.processId} terminated.`
      : `Process ${params.processId} not found or already exited.`;

    return {
      content: [{ type: "text" as const, text }],
      details: null,
    };
  },
};

// ── Exported tool set ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const execTools: ToolDefinition<any, any>[] = [execTool, execStatusTool, execKillTool];

// ── exec_approve schema ───────────────────────────────────────────────────────

const execApproveSchema = Type.Object({});

/**
 * Returns session-scoped exec tools that pre-inject TASK_ID into every
 * subprocess environment. This provides per-session isolation for tools
 * (e.g. browser profiles, temp directories) without requiring the LLM to
 * manually pass the session key.
 *
 * Also includes dangerous-command detection: rm -r, sudo, dd, mkfs will be
 * held for user approval before execution. Call exec_approve() after the user
 * confirms to run the pending command.
 *
 * @param taskId - Unique session identifier: "{userId}:{sessionId}"
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createExecTools(taskId: string, skillEnv?: Record<string, string>): ToolDefinition<any, any>[] {
  // Store initial skillEnv; it will be updated on every request via setTaskSkillEnv().
  if (skillEnv && Object.keys(skillEnv).length > 0) {
    setTaskSkillEnv(taskId, skillEnv);
  }
  const scopedExecTool: ToolDefinition<typeof execSchema, ExecDetails> = {
    ...execTool,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const { command, workdir, env: extraEnv, timeout = 30_000, background = false, yieldMs = 0 } = params;

      // ── Dangerous command gate ──────────────────────────────────────────────
      const danger = detectDangerous(command);
      if (danger) {
        // Store for approval (overwrite any previous pending command).
        pendingDangerousCommands.set(taskId, {
          command, workdir, env: extraEnv, timeout, background, yieldMs, storedAt: Date.now(),
        });
        const text =
          `⚠️ APPROVAL REQUIRED\n\n` +
          `Command: \`${command}\`\n` +
          `Reason: ${danger.reason}\n\n` +
          `This command could be destructive. Please show this to the user and ask for explicit confirmation.\n` +
          `After the user approves, call exec_approve() to execute. The approval expires in 2 minutes.`;
        return {
          content: [{ type: "text" as const, text }],
          details: { command, exitCode: null, background: false },
        };
      }

      // Inject TASK_ID + pre-resolved skill API keys (dynamically read, not from closure).
      const currentSkillEnv = getTaskSkillEnv(taskId);
      const mergedParams = {
        ...params,
        env: { TASK_ID: taskId, ...currentSkillEnv, ...(params.env ?? {}) },
      };
      return execTool.execute(toolCallId, mergedParams, signal, onUpdate, ctx);
    },
  };

  // ── exec_approve tool ───────────────────────────────────────────────────────
  const execApproveTool: ToolDefinition<typeof execApproveSchema, ExecDetails | null> = {
    name: "exec_approve",
    label: "Execute Approved Dangerous Command",
    description:
      "Execute the dangerous command that was held for user approval. " +
      "Only call this after the user has explicitly confirmed the operation shown by exec().",
    promptSnippet: "exec_approve()",
    promptGuidelines: [
      "Call exec_approve() only after the user has explicitly said yes/confirmed/approved.",
      "The approval expires after 2 minutes — if expired, re-run exec() to queue again.",
    ],
    parameters: execApproveSchema,

    async execute(_toolCallId, _params, signal, onUpdate, ctx) {
      const pending = pendingDangerousCommands.get(taskId);
      if (!pending) {
        return {
          content: [{ type: "text" as const, text: "No pending command to approve. Run exec() first to queue a command." }],
          details: null,
        };
      }
      if (Date.now() - pending.storedAt > APPROVAL_TTL_MS) {
        pendingDangerousCommands.delete(taskId);
        return {
          content: [{ type: "text" as const, text: "Approval expired (>2 min). Please re-run the original command." }],
          details: null,
        };
      }

      pendingDangerousCommands.delete(taskId);

      // Execute the approved command via the base execTool.
      const mergedParams = {
        command: pending.command,
        workdir: pending.workdir,
        env: { TASK_ID: taskId, ...(pending.env ?? {}) },
        timeout: pending.timeout,
        background: pending.background,
        yieldMs: pending.yieldMs,
      };
      return execTool.execute("approved", mergedParams, signal, onUpdate, ctx);
    },
  };

  return [scopedExecTool, execApproveTool, execStatusTool, execKillTool];
}
