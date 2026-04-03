import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import os from "os";
import { spawn } from "child_process";
import { handleChat } from "../session/chat.js";
import { completeSimple, getModel } from "@mariozechner/pi-ai";
import { parseFallbackChain } from "../session/llm-fallback.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROTO_PATH = path.resolve(__dirname, "../../../proto/agent.proto");

// Directory where skills live (agent/skills/)
const AGENT_DIR = path.resolve(__dirname, "../../");
const SKILLS_DIR = process.env.SKILLS_DIR ?? path.join(AGENT_DIR, "skills");

const ANALYZE_TIMEOUT_MS = 8_000;   // per-image timeout (reduced from 15s)
const TOTAL_IMAGE_TIMEOUT_MS = 20_000; // hard cap for all images combined
const GENERATE_TIMEOUT_MS = 30_000;

/** Run analyze.py for a single image URL and return the Gemini analysis text. */
function analyzeImageWithGemini(
  userId: string,
  imageUrl: string,
  query: string = "이 이미지를 자세히 분석해주세요."
): Promise<string> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(SKILLS_DIR, "image", "scripts", "analyze.py");
    const args = [
      scriptPath,
      "--user-id", userId,
      "analyze",
      "--file-url", imageUrl,
      "--query", query,
    ];
    const proc = spawn("python3", args, {
      env: { ...process.env },
    });

    // Kill the subprocess if it does not finish within the timeout.
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`analyze.py timed out after ${ANALYZE_TIMEOUT_MS / 1000}s`));
    }, ANALYZE_TIMEOUT_MS);

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && stdout.trim()) {
        resolve(stdout.trim());
      } else {
        const errMsg = stderr.trim() || `analyze.py exited with code ${code}`;
        reject(new Error(errMsg));
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn analyze.py: ${err.message}`));
    });
  });
}

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const proto = grpc.loadPackageDefinition(packageDefinition) as any;


function chat(
  call: grpc.ServerWritableStream<any, any>
): void {
  const { user_id, session_id, message, model, metadata } = call.request;
  const provider: string = metadata?.provider ?? "";
  const apiKey: string = metadata?.api_key ?? "";
  const systemPrompt: string = metadata?.system_prompt ?? "";
  const timezone: string = metadata?.timezone ?? "";
  const previousMessagesRaw: string = metadata?.previous_messages ?? "";
  let previousMessages: Array<{ role: string; content: string }> = [];
  if (previousMessagesRaw) {
    try {
      previousMessages = JSON.parse(previousMessagesRaw);
    } catch {
      // ignore malformed JSON
    }
  }
  const imagesRaw: string = metadata?.images ?? "";
  const imageURLsRaw: string = metadata?.image_urls ?? "";
  const configuredProvidersRaw: string = metadata?.configured_providers ?? "";
  let configuredProviders: string[] | undefined;
  if (configuredProvidersRaw) {
    try {
      const parsed = JSON.parse(configuredProvidersRaw);
      if (Array.isArray(parsed)) configuredProviders = parsed;
    } catch {
      // ignore malformed JSON
    }
  }
  const skillEnvRaw: string = metadata?.skill_env_json ?? "";
  let skillEnv: Record<string, string> = {};
  if (skillEnvRaw) {
    try {
      const parsed = JSON.parse(skillEnvRaw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        skillEnv = parsed as Record<string, string>;
      }
    } catch {
      // ignore malformed JSON
    }
  }
  const disabledSkillsRaw: string = metadata?.disabled_skills_json ?? "";
  let disabledSkillIds: string[] | undefined;
  if (disabledSkillsRaw) {
    try {
      const parsed = JSON.parse(disabledSkillsRaw);
      if (Array.isArray(parsed)) disabledSkillIds = parsed;
    } catch {
      // ignore malformed JSON
    }
  }
  const platform: string | undefined = metadata?.platform || undefined;
  const secondaryModel: string | undefined = metadata?.secondary_model || undefined;
  const fallbackProvidersRaw: string = metadata?.fallback_providers ?? "";
  const fallbackProviders = parseFallbackChain(fallbackProvidersRaw);

  console.log(`[grpc] chat called: user=${user_id} session=${session_id} model=${model} provider=${provider}`);
  console.log(`[Persona] grpc received: system_prompt_set=${systemPrompt !== ""}`);

  // Track liveness so cancelled-client callbacks are no-ops.
  let active = true;
  let completed = false;
  call.on("cancelled", () => {
    active = false;
    // Only log if the stream was not already finished normally.
    // gRPC fires "cancelled" even after call.end() on some transports.
    if (!completed) {
      console.log(`[grpc] chat cancelled: user=${user_id} session=${session_id}`);
    }
  });

  // Resolve images: base64 (Path 1, Telegram) or analyze via Gemini Vision skill (Path 2, web chat).
  (async () => {
    // Path 1: base64-encoded images passed directly (Telegram).
    let images: Array<{ type: "image"; data: string; mimeType: string }> | undefined;
    if (imagesRaw) {
      try {
        const parsed = JSON.parse(imagesRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          images = parsed.map((img: { Data: string; MimeType: string }) => ({
            type: "image" as const,
            data: img.Data,
            mimeType: img.MimeType,
          }));
        }
      } catch {
        // ignore malformed JSON
      }
    }

    // Path 2: web chat image URLs — analyze each with Gemini Vision skill (analyze.py)
    // and inject the analysis results into the message text.
    // [image:URL] markers are already in the message (added by ws.go).
    let enrichedMessage = message as string;
    if (imageURLsRaw) {
      try {
        const urlList = JSON.parse(imageURLsRaw) as Array<{ URL: string; MimeType: string }>;
        if (Array.isArray(urlList) && urlList.length > 0) {
          const gatewayBase = (process.env.GATEWAY_URL ?? "http://localhost:8080").replace(/\/$/, "");
          console.log(`[image-skill] START: ${urlList.length} image(s) — user=${user_id.slice(0, 8)}… session=${session_id}`);
          console.log(`[image-skill] skill path: ${path.join(SKILLS_DIR, "image", "scripts", "analyze.py")}`);

          // Partial-result strategy: each image mutates its slot in-place; we
          // wait for all to settle OR for the total deadline — whichever comes first.
          // This guarantees we never block for more than TOTAL_IMAGE_TIMEOUT_MS
          // regardless of how many images are being analysed in parallel.
          const analyses: Array<{ url: string; analysis: string | null }> =
            urlList.slice(0, 4).map((img) => ({ url: img.URL, analysis: null }));

          const imagePromises = urlList.slice(0, 4).map(async (img, idx) => {
            const url = img.URL.startsWith("http") ? img.URL : `${gatewayBase}${img.URL}`;
            const fileName = url.split("/").pop() ?? url;
            console.log(`[image-skill] [${idx + 1}/${urlList.length}] analyzing: ${fileName}`);
            const startMs = Date.now();
            try {
              const analysis = await analyzeImageWithGemini(user_id, url);
              const elapsed = Date.now() - startMs;
              console.log(`[image-skill] [${idx + 1}/${urlList.length}] ✅ done in ${elapsed}ms — ${fileName} (${analysis.length} chars)`);
              analyses[idx].analysis = analysis;
            } catch (err) {
              const elapsed = Date.now() - startMs;
              const errMsg = err instanceof Error ? err.message.split("\n")[0] : String(err);
              console.error(`[image-skill] [${idx + 1}/${urlList.length}] ❌ failed in ${elapsed}ms — ${fileName}: ${errMsg}`);
            }
          });

          await Promise.race([
            Promise.allSettled(imagePromises),
            new Promise<void>((resolve) =>
              setTimeout(() => {
                console.warn(`[image-skill] total timeout (${TOTAL_IMAGE_TIMEOUT_MS}ms) — using partial results`);
                resolve();
              }, TOTAL_IMAGE_TIMEOUT_MS),
            ),
          ]);

          const successCount = analyses.filter((a) => a.analysis !== null).length;
          console.log(`[image-skill] END: ${successCount}/${urlList.length} succeeded`);

          // If ALL images failed to analyze, send error to client — do NOT let LLM hallucinate.
          if (successCount === 0) {
            console.error(`[image-skill] all analyses failed — returning error to client`);
            if (active) {
              try {
                call.write({ error: { message: "이미지 분석에 실패했습니다. Gemini API 키가 설정되어 있는지 확인해주세요.", code: "IMAGE_ANALYSIS_FAILED" } });
                completed = true;
                call.end();
              } catch { /* stream already closed */ }
            }
            return;
          }

          // Replace [image:URL] markers with Gemini analysis results.
          // Remove markers whose analysis failed so LLM doesn't see raw [image:URL] and hallucinate.
          for (const { url, analysis } of analyses) {
            const marker = `[image:${url}]`;
            if (analysis) {
              const replacement = `[이미지 분석 결과]\n${analysis}\n[/이미지 분석 결과]`;
              enrichedMessage = enrichedMessage.replace(marker, replacement);
            } else {
              // Strip failed marker — do not expose raw URL to LLM
              enrichedMessage = enrichedMessage.replace(marker, "");
            }
          }
          enrichedMessage = enrichedMessage.trim();
        }
      } catch {
        // ignore malformed imageURLsRaw — proceed with original message
      }
    }

    handleChat({
      userId: user_id,
      sessionId: session_id,
      message: enrichedMessage,
      model: model || "claude-sonnet-4-5",
      provider,
      apiKey,
      systemPrompt,
      timezone,
      previousMessages,
      images,
      configuredProviders,
      platform,
      secondaryModel,
      skillEnv,
      disabledSkillIds,
      fallbackProviders: fallbackProviders.length > 0 ? fallbackProviders : undefined,
      onEvent: (event) => {
        if (!active) return;
        try {
          call.write(event);
        } catch {
          active = false;
        }
      },
      onDone: () => {
        if (active) {
          completed = true;
          call.end();
        }
      },
      onError: (err) => {
        if (!active) return;
        try {
          call.write({ error: { message: err.message, code: "AGENT_ERROR" } });
          completed = true;
          call.end();
        } catch {
          // stream already closed
        }
      },
    }).catch((err: unknown) => {
      if (!active) return;
      console.error("[grpc] unhandled error in handleChat:", err);
      try {
        call.write({ error: { message: "Internal error", code: "INTERNAL" } });
        completed = true;
        call.end();
      } catch {
        // stream already closed
      }
    });
  })();
}

async function generate(
  call: grpc.ServerUnaryCall<any, any>,
  callback: grpc.sendUnaryData<any>
): Promise<void> {
  const { prompt, model } = call.request;
  const modelId = (model as string) || "claude-haiku-4-5";
  console.log(`[grpc] generate called: model=${modelId}`);
  try {
    const resolvedModel = getModel("anthropic", modelId as any);
    if (!resolvedModel) {
      callback(null, { text: "", error: `unknown model: ${modelId}` });
      return;
    }
    const result = await Promise.race([
      completeSimple(
        resolvedModel,
        {
          messages: [
            { role: "user" as const, content: prompt as string, timestamp: Date.now() },
          ],
        },
        { maxTokens: 2048 }
      ),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`generate timed out after ${GENERATE_TIMEOUT_MS / 1000}s`)),
          GENERATE_TIMEOUT_MS
        )
      ),
    ]);
    const text = result.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");
    callback(null, { text, error: "" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.error("[grpc] generate error:", msg);
    callback(null, { text: "", error: msg });
  }
}

// ── Session directory helpers ─────────────────────────────────────────────────

const SESSION_BASE_DIR = process.env.SESSION_DIR ?? path.join(os.homedir(), ".starnion", "sessions");

/** Extract the first user message text from a JSONL session file. */
async function extractSessionTitle(jsonlPath: string): Promise<string> {
  try {
    const content = await fs.promises.readFile(jsonlPath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());
    for (const line of lines.slice(0, 10)) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === "user") {
          const c = parsed.message?.content;
          if (typeof c === "string" && c.trim()) return c.slice(0, 80);
          if (Array.isArray(c)) {
            const txt = c.find((b: { type: string }) => b.type === "text") as { text?: string } | undefined;
            if (txt?.text) return txt.text.slice(0, 80);
          }
        }
      } catch { /* skip malformed line */ }
    }
  } catch { /* unreadable */ }
  return "";
}

/** Extract the last assistant message text from a JSONL session file. */
async function extractLastMessage(jsonlPath: string): Promise<string> {
  try {
    const content = await fs.promises.readFile(jsonlPath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());
    for (const line of [...lines].reverse().slice(0, 20)) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === "assistant") {
          const c = parsed.message?.content;
          if (typeof c === "string" && c.trim()) return c.slice(0, 200);
          if (Array.isArray(c)) {
            const txt = c.find((b: { type: string }) => b.type === "text") as { text?: string } | undefined;
            if (txt?.text) return txt.text.slice(0, 200);
          }
        }
      } catch { /* skip */ }
    }
  } catch { /* unreadable */ }
  return "";
}

// ── Concurrency helper ────────────────────────────────────────────────────────

/** Map over `items` calling `fn` with at most `limit` concurrent promises. */
async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ── GetSessions ───────────────────────────────────────────────────────────────

function getSessions(
  call: grpc.ServerUnaryCall<any, any>,
  callback: grpc.sendUnaryData<any>
): void {
  const { user_id } = call.request;
  const rawLimit = typeof call.request.limit === "number" ? call.request.limit : 20;
  const rawOffset = typeof call.request.offset === "number" ? call.request.offset : 0;
  const limit = Math.min(Math.max(rawLimit, 1), 200);
  const offset = Math.max(rawOffset, 0);
  if (!user_id) {
    callback(null, { sessions: [], total: 0 });
    return;
  }

  const userDir = path.join(SESSION_BASE_DIR, user_id);

  (async () => {
    try {
      const accessible = await fs.promises.access(userDir).then(() => true).catch(() => false);
      if (!accessible) {
        callback(null, { sessions: [], total: 0 });
        return;
      }

      const entries = await fs.promises.readdir(userDir, { withFileTypes: true });
      const sessionIds = entries.filter((e) => e.isDirectory()).map((e) => e.name);

      const sessions = await mapConcurrent(
        sessionIds, 20,
        async (sessionId) => {
          const sessionDir = path.join(userDir, sessionId);
          try {
            const files = await fs.promises.readdir(sessionDir);
            const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

            let updatedAt = 0;
            let title = "";
            let lastMessage = "";

            if (jsonlFiles.length > 0) {
              // Pick most-recently-modified JSONL as representative file.
              const stats = await Promise.all(
                jsonlFiles.map(async (f) => {
                  const st = await fs.promises.stat(path.join(sessionDir, f));
                  return { name: f, mtimeMs: st.mtimeMs };
                })
              );
              stats.sort((a, b) => b.mtimeMs - a.mtimeMs);
              updatedAt = stats[0].mtimeMs;
              const jsonlPath = path.join(sessionDir, stats[0].name);
              [title, lastMessage] = await Promise.all([
                extractSessionTitle(jsonlPath),
                extractLastMessage(jsonlPath),
              ]);
            } else {
              const st = await fs.promises.stat(sessionDir);
              updatedAt = st.mtimeMs;
            }

            return {
              session_id: sessionId,
              title: title || sessionId.slice(0, 8),
              last_message: lastMessage,
              updated_at: Math.floor(updatedAt / 1000),
            };
          } catch {
            return null;
          }
        }
      );

      const valid = sessions
        .filter((s): s is NonNullable<typeof s> => s !== null)
        .sort((a, b) => b.updated_at - a.updated_at);

      const paginated = valid.slice(offset, offset + limit);
      callback(null, { sessions: paginated, total: valid.length });
    } catch (err) {
      console.error("[grpc] getSessions error:", err instanceof Error ? err.message : err);
      callback(null, { sessions: [], total: 0 });
    }
  })();
}

// ── DeleteSession ─────────────────────────────────────────────────────────────

function deleteSession(
  call: grpc.ServerUnaryCall<any, any>,
  callback: grpc.sendUnaryData<any>
): void {
  const { user_id, session_id } = call.request;
  if (!user_id || !session_id) {
    callback(null, { success: false, error: "user_id and session_id are required" });
    return;
  }

  const sessionDir = path.join(SESSION_BASE_DIR, user_id, session_id);

  // Security: path must stay within SESSION_BASE_DIR.
  const resolvedSession = path.resolve(sessionDir);
  const resolvedBase = path.resolve(SESSION_BASE_DIR);
  if (!resolvedSession.startsWith(resolvedBase + path.sep)) {
    callback(null, { success: false, error: "invalid session path" });
    return;
  }

  (async () => {
    try {
      await fs.promises.rm(sessionDir, { recursive: true, force: true });
      console.log(`[grpc] deleteSession: removed ${resolvedSession}`);
      callback(null, { success: true, error: "" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[grpc] deleteSession error:", msg);
      callback(null, { success: false, error: msg });
    }
  })();
}

function healthCheck(
  _call: grpc.ServerUnaryCall<any, any>,
  callback: grpc.sendUnaryData<any>
): void {
  callback(null, { status: "ok", version: "1.0.0" });
}

/** Server interceptor that validates the x-shared-secret metadata header. */
function sharedSecretInterceptor(
  _methodDescriptor: grpc.ServerMethodDefinition<unknown, unknown>,
  call: grpc.ServerInterceptingCall
): grpc.ServerInterceptingCall {
  const expectedSecret = process.env["GRPC_SHARED_SECRET"];
  if (!expectedSecret) {
    // Secret not configured — allow all (backwards-compat with local dev).
    return call;
  }
  return new grpc.ServerInterceptingCall(call, {
    start(next: (listener: grpc.ServerListener) => void) {
      next({
        onReceiveMetadata(metadata: grpc.Metadata, metadataNext: (m: grpc.Metadata) => void) {
          const provided = metadata.get("x-shared-secret");
          if (!provided.length || provided[0] !== expectedSecret) {
            call.sendStatus({
              code: grpc.status.UNAUTHENTICATED,
              details: "invalid or missing shared secret",
            });
            return;
          }
          metadataNext(metadata);
        },
      });
    },
  });
}

export function createAgentGrpcServer(): grpc.Server {
  const server = new grpc.Server({
    interceptors: [sharedSecretInterceptor as unknown as grpc.ServerInterceptor],
  });
  server.addService(proto.agent.AgentService.service, {
    Chat: chat,
    Generate: generate,
    GetSessions: getSessions,
    DeleteSession: deleteSession,
    HealthCheck: healthCheck,
  });
  return server;
}
