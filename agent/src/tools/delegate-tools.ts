/**
 * delegate-tools.ts — Sub-agent delegation tool.
 *
 * Allows the main agent to spin up an isolated child agent session to execute
 * a focused sub-task and return its text output. Useful for:
 *   • Parallel research on independent sub-questions
 *   • Isolated analysis that shouldn't pollute the main context
 *   • Long-running summarisation tasks
 *
 * Each delegated call creates a fresh, ephemeral session (temp dir, no
 * conversation history) so sub-agents start from a clean slate.
 */

import path from "path";
import fs from "fs";
import os from "os";
import { AsyncLocalStorage } from "async_hooks";
import { Type } from "@sinclair/typebox";
import {
  createAgentSession,
  SettingsManager,
  SessionManager,
  DefaultResourceLoader,
  ModelRegistry,
  AuthStorage,
  type AgentSessionEvent,
} from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

// ── Depth guard ───────────────────────────────────────────────────────────────
// Prevents infinite sub-agent recursion. Tracked per async call chain via
// AsyncLocalStorage so concurrent delegates don't interfere with each other.
const MAX_DELEGATE_DEPTH = 2;
const _delegateDepthStorage = new AsyncLocalStorage<number>();

// ── Paths ──────────────────────────────────────────────────────────────────────
const AGENT_DIR = path.resolve(process.env.AGENT_DIR ?? process.cwd());
const SKILLS_DIR = path.resolve(
  process.env.SKILLS_DIR ?? path.join(AGENT_DIR, "skills"),
);

// ── Schema ────────────────────────────────────────────────────────────────────

const delegateSchema = Type.Object({
  task: Type.String({
    description:
      "The complete, self-contained task description for the sub-agent. " +
      "Include all necessary context since the sub-agent has no access to " +
      "the current conversation history.",
  }),
  model: Type.Optional(
    Type.String({
      description:
        "Model to use for the sub-agent. Defaults to the same model as the " +
        "main agent. Use a cheaper model (e.g. claude-haiku-4-5-20251001) " +
        "for simple summarisation tasks.",
    }),
  ),
  systemPrompt: Type.Optional(
    Type.String({
      description:
        "Optional system prompt override for the sub-agent. If omitted the " +
        "sub-agent uses a minimal default.",
    }),
  ),
  timeoutMs: Type.Optional(
    Type.Integer({
      description: "Timeout in milliseconds (default 60 000, max 300 000).",
      minimum: 1_000,
      maximum: 300_000,
    }),
  ),
});

// ── Sub-agent runner ──────────────────────────────────────────────────────────

interface SubAgentOptions {
  provider: string;
  apiKey: string;
  model: string;
  systemPrompt?: string;
  task: string;
  timeoutMs: number;
}

async function runSubAgent(opts: SubAgentOptions): Promise<string> {
  const { provider, apiKey, model, systemPrompt, task, timeoutMs } = opts;

  const sessionDir = path.join(os.tmpdir(), `starnion-delegate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await fs.promises.mkdir(sessionDir, { recursive: true });

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resolvedModel = getModel(provider as any, model as any);

    const authStorage = AuthStorage.inMemory({});
    const modelRegistry = new ModelRegistry(authStorage);
    modelRegistry.registerProvider(provider, { apiKey });

    const settingsManager = SettingsManager.inMemory({});
    const sessionManager = SessionManager.create(SKILLS_DIR, sessionDir);

    // Minimal resource loader — no skills, just the system prompt
    const resourceLoader = new DefaultResourceLoader({
      cwd: SKILLS_DIR,
      agentDir: AGENT_DIR,
      ...(systemPrompt ? { systemPromptOverride: () => systemPrompt } : {}),
    });
    await resourceLoader.reload();

    const { session } = await createAgentSession({
      cwd: SKILLS_DIR,
      model: resolvedModel,
      settingsManager,
      sessionManager,
      modelRegistry,
      resourceLoader,
    });

    const chunks: string[] = [];
    let unsubscribe: (() => void) | undefined;

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
        session.prompt(task).catch(reject);
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Sub-agent timeout after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);

    unsubscribe?.();
    return chunks.join("").trim() || "(sub-agent produced no output)";
  } finally {
    unsubscribe?.();
    fs.promises.rm(sessionDir, { recursive: true, force: true }).catch(() => {});
  }
}

// Declare unsubscribe at module level to allow cleanup in finally
let unsubscribe: (() => void) | undefined;

// ── delegate tool factory ─────────────────────────────────────────────────────

function makeDelegateTool(
  provider: string,
  apiKey: string,
  defaultModel: string,
): ToolDefinition<typeof delegateSchema, null> {
  return {
    name: "delegate",
    label: "Delegate Sub-Task",
    description:
      "Delegate a self-contained sub-task to an isolated child agent and " +
      "return its response. Use this to run independent analysis in parallel, " +
      "or to keep focused work out of the main conversation context. " +
      "The sub-agent starts fresh — provide all necessary context in the task.",
    promptSnippet: "delegate(task, model?, systemPrompt?, timeoutMs?)",
    promptGuidelines: [
      "Use delegate for independent sub-tasks that don't need the current conversation history.",
      "For simple summarisation, pass model='claude-haiku-4-5-20251001' for speed and cost.",
      "Always include all required context in the task string — sub-agents have no memory.",
      "Default timeout is 60 seconds; increase for complex tasks (max 300 s).",
    ],
    parameters: delegateSchema,

    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const {
        task,
        model = defaultModel,
        systemPrompt,
        timeoutMs = 60_000,
      } = params;
      const cap = Math.min(Math.max(1_000, timeoutMs), 300_000);

      // Abort if the parent was cancelled
      if (signal?.aborted) {
        return {
          content: [{ type: "text" as const, text: "Delegate cancelled (parent aborted)." }],
          details: null,
        };
      }

      // Depth guard: prevent infinite sub-agent recursion
      const currentDepth = _delegateDepthStorage.getStore() ?? 0;
      if (currentDepth >= MAX_DELEGATE_DEPTH) {
        console.warn(
          `[Delegate] ⚠️ Depth limit reached (depth=${currentDepth}, max=${MAX_DELEGATE_DEPTH}). ` +
          `Refusing to spawn further sub-agent.`,
        );
        return {
          content: [{
            type: "text" as const,
            text: `Delegation refused: maximum delegate depth (${MAX_DELEGATE_DEPTH}) reached. ` +
              `Please handle this task directly without further delegation.`,
          }],
          details: null,
        };
      }

      console.log(
        `[Delegate] Starting sub-agent depth=${currentDepth + 1}/${MAX_DELEGATE_DEPTH} ` +
        `model=${model} timeout=${cap}ms task="${task.slice(0, 80)}…"`,
      );

      try {
        const result = await _delegateDepthStorage.run(currentDepth + 1, () =>
          runSubAgent({
            provider,
            apiKey,
            model,
            systemPrompt,
            task,
            timeoutMs: cap,
          }),
        );

        console.log(`[Delegate] Sub-agent complete, output=${result.length} chars`);
        return {
          content: [{ type: "text" as const, text: result }],
          details: null,
        };
      } catch (err) {
        const msg = `Sub-agent error: ${(err as Error).message}`;
        console.error(`[Delegate] ${msg}`);
        return {
          content: [{ type: "text" as const, text: msg }],
          details: null,
        };
      }
    },
  };
}

// ── Exported factory ──────────────────────────────────────────────────────────

/**
 * Returns a delegate tool scoped to the given provider/apiKey/model.
 * Call in chat.ts alongside createExecTools().
 */
export function createDelegateTools(
  provider: string,
  apiKey: string,
  model: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): ToolDefinition<any, any>[] {
  return [makeDelegateTool(provider || "anthropic", apiKey, model || "claude-haiku-4-5-20251001")];
}

// Suppress unused variable warning — unsubscribe is set inside runSubAgent via closure
void (unsubscribe);
