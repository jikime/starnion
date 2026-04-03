import type { AgentSessionEvent } from "@mariozechner/pi-coding-agent";
import { createExecTools, setTaskSkillEnv } from "../tools/exec.js";
import { createSkillTools } from "../tools/skill-tools.js";
import { createSessionTools } from "../tools/session-tools.js";
import { createDelegateTools } from "../tools/delegate-tools.js";
import { createCheckpointTools } from "../tools/checkpoint.js";
import { createCronTools } from "../tools/cron-tools.js";
import {
  type ChatContext,
  type ChatMiddleware,
  SessionSetupMiddleware,
  UserMemoryMiddleware,
  ProjectContextMiddleware,
  SessionTitleMiddleware,
  SessionInsightsMiddleware,
  ContextMessageMiddleware,
  ContextReferencesMiddleware,
  TextStreamMiddleware,
  SkillTrackingMiddleware,
  ContextCompressionMiddleware,
  PromptInjectionMiddleware,
  TokenUsageMiddleware,
  SmartModelRoutingMiddleware,
  ToolCallRepairMiddleware,
  IterationBudgetMiddleware,
  ContextLengthProbingMiddleware,
} from "./middleware.js";
import { PromptComposer, type SkillVisibilityOptions } from "./prompt-composer.js";
import { AgentFactory } from "./agent-factory.js";
import type { FallbackProvider } from "./llm-fallback.js";

export interface ChatOptions {
  userId: string;
  sessionId: string;
  message: string;
  model: string;
  provider: string;
  apiKey: string;
  systemPrompt: string;
  timezone?: string;  // IANA timezone e.g. "Asia/Seoul", "America/New_York" — from client
  previousMessages?: Array<{ role: string; content: string }>;
  images?: Array<{ type: "image"; data: string; mimeType: string }>;
  configuredProviders?: string[];  // API providers the user has configured (for skill filtering)
  platform?: string;               // Client platform: "web" | "telegram" | "api" | …
  secondaryModel?: string;         // Model for utility tasks: title, insights, context compression
  skillEnv?: Record<string, string>; // Pre-resolved API keys from gateway (injected into skill subprocess env)
  disabledSkillIds?: string[];     // Skills the user has disabled via user_skills table (excluded from system prompt)
  /**
   * Ordered fallback provider chain. If the primary provider+model cannot be
   * resolved by pi-ai, providers are tried in array order (Groq → OpenRouter →
   * OpenAI → Anthropic). Built by the gateway from the user's providers table.
   */
  fallbackProviders?: FallbackProvider[];
  onEvent: (event: Record<string, unknown>) => void;
  onDone: () => void;
  onError: (err: Error) => void;
}

// ── Middleware chain ──────────────────────────────────────────────────────────
// Add / remove / reorder middlewares here. Order matters:
//   1. SessionSetup        — must run first to populate sessionFilePath / appendHistory
//   2. SmartModelRouting   — new session model downgrade (must follow SessionSetup)
//   3. ContextMessage      — transforms outgoing message (prepend user context)
//   4. TextStream          — text_delta → client
//   5. SkillTracking       — tool_use / tool_result + skill logging
//   6. TokenUsage          — agent_end → done event
//   7. ToolCallRepair      — consecutive tool error detection + abort
//   8. IterationBudget     — per-turn tool call limit + abort
//   9. ContextLengthProbing — probe & cache model context window
const MIDDLEWARES: ChatMiddleware[] = [
  new SessionSetupMiddleware(),
  new SmartModelRoutingMiddleware(),       // must run after SessionSetup (needs sessionFilePath)
  new ProjectContextMiddleware(),
  new UserMemoryMiddleware(),
  new SessionTitleMiddleware(),
  new SessionInsightsMiddleware(),
  new ContextReferencesMiddleware(),
  new ContextMessageMiddleware(),
  new PromptInjectionMiddleware(),
  new TextStreamMiddleware(),
  new SkillTrackingMiddleware(),
  new ContextCompressionMiddleware(),
  new TokenUsageMiddleware(),
  new ToolCallRepairMiddleware(),          // safety: abort on consecutive tool errors
  new IterationBudgetMiddleware(),         // safety: abort on excessive tool call loops
  new ContextLengthProbingMiddleware(),    // probe model context window size
];

// ── Harness singletons ────────────────────────────────────────────────────────
// PromptComposer: identity resolution + ResourceLoader (with SOUL.md hot-reload)
// AgentFactory:   pi-coding-agent session lifecycle + LRU cache
const promptComposer = new PromptComposer();
const agentFactory = new AgentFactory();

// ── Main handler ──────────────────────────────────────────────────────────────
export async function handleChat(options: ChatOptions): Promise<void> {
  const { userId, sessionId, provider, apiKey, systemPrompt, fallbackProviders, onDone, onError } = options;
  console.log(
    `[handleChat] START user=${userId} session=${sessionId} ` +
    `provider=${provider || "anthropic"}`,
  );

  // Build shared context passed to all middlewares
  const ctx: ChatContext = {
    ...options,
    sessionFilePath: "",         // populated by SessionSetupMiddleware
    appendHistory: undefined,    // populated by SessionSetupMiddleware
    taskId: "",                  // populated by SessionSetupMiddleware
    resolvedMessage: options.message, // transformed by ContextMessageMiddleware
    session: undefined,
    pendingSkillCalls: new Map(),
  };

  try {
    // ── Phase 1: beforeSession ────────────────────────────────────────────────
    for (const mw of MIDDLEWARES) {
      try {
        await mw.beforeSession(ctx);
      } catch (mwErr) {
        console.error(`[handleChat] middleware ${mw.name}.beforeSession error (continuing):`, mwErr);
      }
    }

    // ── Session creation via harness components ───────────────────────────────
    const skillOpts: SkillVisibilityOptions | undefined =
      (options.configuredProviders?.length || options.platform || options.disabledSkillIds?.length)
        ? {
            configuredProviders: options.configuredProviders,
            platform: options.platform,
            disabledSkillIds: options.disabledSkillIds,
          }
        : undefined;
    const resourceLoader = await promptComposer.getResourceLoader(
      systemPrompt,
      ctx.appendHistory,
      sessionId,
      skillOpts,
    );

    // Inject skill API keys into process.env so both custom exec tool AND
    // pi-coding-agent's built-in bash tool can access them.
    const skillEnvKeys = ctx.skillEnv ? Object.keys(ctx.skillEnv) : [];
    if (skillEnvKeys.length > 0) {
      setTaskSkillEnv(ctx.taskId, ctx.skillEnv!);
      for (const [k, v] of Object.entries(ctx.skillEnv!)) {
        process.env[k] = v;
      }
    }
    console.log(`[handleChat] skillEnv keys=[${skillEnvKeys.join(",")}] taskId=${ctx.taskId}`);

    ctx.session = await agentFactory.getOrCreate({
      userId,
      sessionId,
      sessionFilePath: ctx.sessionFilePath,
      provider: provider || "anthropic",
      model: options.model || "claude-sonnet-4-5",
      apiKey,
      systemPrompt,
      resourceLoader,
      fallbackChain: fallbackProviders,
      tools: [
        ...createExecTools(ctx.taskId, ctx.skillEnv ?? {}),
        ...createCheckpointTools(ctx.taskId),
        ...createCronTools(ctx.taskId),
        ...createSkillTools(options.disabledSkillIds),
        ...createSessionTools(userId),
        ...createDelegateTools(provider || "anthropic", apiKey, options.model),
      ],
    });

    // ── Phase 2: transformMessage ─────────────────────────────────────────────
    for (const mw of MIDDLEWARES) {
      try {
        ctx.resolvedMessage = await mw.transformMessage(ctx, ctx.resolvedMessage);
      } catch (mwErr) {
        console.error(`[handleChat] middleware ${mw.name}.transformMessage error (continuing):`, mwErr);
      }
    }
    console.log(`[handleChat] calling session.prompt`);

    // ── Phase 3: event loop ───────────────────────────────────────────────────
    let unsubscribe: (() => void) | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        unsubscribe = ctx.session!.subscribe(async (event: AgentSessionEvent) => {
          // Each middleware processes the event and may emit output events
          for (const mw of MIDDLEWARES) {
            try {
              const outEvents = await mw.onEvent(ctx, event);
              for (const e of outEvents) ctx.onEvent(e);
            } catch (mwErr) {
              console.error(`[handleChat] middleware ${mw.name}.onEvent error (continuing):`, mwErr);
            }
          }
          // agent_end signals the end of this turn
          if (event.type === "agent_end") {
            resolve();
          }
        });

        // 'followUp': queue after any in-flight request to prevent concurrent conflicts
        ctx.session!.prompt(ctx.resolvedMessage, {
          streamingBehavior: "followUp",
          ...(ctx.images && ctx.images.length > 0 ? { images: ctx.images } : {}),
        }).catch(reject);
      });
    } finally {
      unsubscribe?.();
    }

    // ── Phase 4: afterComplete ────────────────────────────────────────────────
    for (const mw of MIDDLEWARES) {
      try {
        await mw.afterComplete(ctx);
      } catch (mwErr) {
        console.error(`[handleChat] middleware ${mw.name}.afterComplete error (continuing):`, mwErr);
      }
    }

    onDone();
  } catch (err) {
    console.error(`[handleChat] ERROR:`, err);
    onError(err instanceof Error ? err : new Error(String(err)));
  } finally {
    // Release frozen snapshot for this session regardless of success or error (prevents LRU leak).
    promptComposer.releaseSession(sessionId);
  }
}
