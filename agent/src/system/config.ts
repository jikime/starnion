import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import yaml from "js-yaml";

const STARNION_YAML = path.join(os.homedir(), ".starnion", "starnion.yaml");
const AUTH_JSON_PATH = path.join(os.homedir(), ".pi", "agent", "auth.json");

interface OAuthCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/**
 * Read Claude Code OAuth credentials from platform-specific stores.
 * Returns full credentials (access + refresh + expires) for auth.json sync.
 */
function readClaudeCodeCredentials(): OAuthCredentials | undefined {
  // macOS Keychain
  if (os.platform() === "darwin") {
    try {
      const raw = execSync(
        `security find-generic-password -s "Claude Code-credentials" -a "${os.userInfo().username}" -w`,
        { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
      ).trim();
      const data = JSON.parse(raw);
      const oauth = data?.claudeAiOauth;
      if (oauth?.accessToken && oauth?.refreshToken && oauth?.expiresAt) {
        return { accessToken: oauth.accessToken, refreshToken: oauth.refreshToken, expiresAt: oauth.expiresAt };
      }
    } catch {
      // Keychain access failed — fall through
    }
  }

  // Linux/all platforms: check Claude Code credential file locations
  const candidates = [
    path.join(os.homedir(), ".claude", ".credentials.json"),
    path.join(os.homedir(), ".claude", "credentials.json"),
    path.join(os.homedir(), ".claude", ".credentials"),
    path.join(os.homedir(), ".config", "claude", "credentials.json"),
  ];
  for (const filePath of candidates) {
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const data = JSON.parse(raw);
      const oauth = data?.claudeAiOauth;
      if (oauth?.accessToken && oauth?.refreshToken && oauth?.expiresAt) {
        return { accessToken: oauth.accessToken, refreshToken: oauth.refreshToken, expiresAt: oauth.expiresAt };
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

/**
 * Sync Claude Code credentials to ~/.pi/agent/auth.json so pi-coding-agent
 * can use them for API calls and auto-refresh expired tokens.
 */
function syncAuthJson(creds: OAuthCredentials): void {
  try {
    // If auth.json already exists with a newer token (e.g. auto-refreshed by
    // pi-coding-agent), don't overwrite it with an older token from credentials.json.
    try {
      const existing = JSON.parse(fs.readFileSync(AUTH_JSON_PATH, "utf8"));
      const existingExpires = existing?.anthropic?.expires ?? 0;
      if (existingExpires > creds.expiresAt) {
        console.log("[config] auth.json has a newer token — skipping sync");
        return;
      }
    } catch {
      // auth.json doesn't exist or is invalid — proceed with sync
    }

    const authData = {
      anthropic: {
        type: "oauth",
        access: creds.accessToken,
        refresh: creds.refreshToken,
        expires: creds.expiresAt,
      },
    };
    fs.mkdirSync(path.dirname(AUTH_JSON_PATH), { recursive: true, mode: 0o700 });
    fs.writeFileSync(AUTH_JSON_PATH, JSON.stringify(authData, null, 2), "utf8");
    fs.chmodSync(AUTH_JSON_PATH, 0o600);

    const expiresIn = Math.round((creds.expiresAt - Date.now()) / 1000 / 60);
    console.log(`[config] Synced OAuth credentials to auth.json (expires in ${expiresIn}m)`);
  } catch (err) {
    console.warn("[config] Failed to sync auth.json:", (err as Error).message);
  }
}

/**
 * Parse ~/.starnion/starnion.yaml using js-yaml. Previously this was a
 * hand-rolled two-level parser that silently dropped anything it did not
 * recognise (quoted strings, escapes, multi-line values), meaning a
 * secret containing a colon could be loaded with the wrong value. The
 * canonical YAML parser fixes that and matches the gateway's parsing.
 *
 * Returns an empty object when the file does not exist or the content
 * fails to parse so callers can fall back to environment variables.
 */
function loadStarnionYaml(): Record<string, Record<string, string> | string> {
  if (!fs.existsSync(STARNION_YAML)) return {};

  try {
    const raw = fs.readFileSync(STARNION_YAML, "utf-8");
    const parsed = yaml.load(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      // Coerce nested scalars to strings so downstream code can keep
      // using `cfg.auth.internal_log_secret` without type-gymnastics.
      const out: Record<string, Record<string, string> | string> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (v == null) continue;
        if (typeof v === "object" && !Array.isArray(v)) {
          const sub: Record<string, string> = {};
          for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
            if (sv == null) continue;
            sub[sk] = typeof sv === "string" ? sv : String(sv);
          }
          out[k] = sub;
        } else if (typeof v === "string") {
          out[k] = v;
        } else {
          out[k] = String(v);
        }
      }
      return out;
    }
  } catch (err) {
    console.warn("[config] failed to parse starnion.yaml:", (err as Error).message);
  }
  return {};
}

/**
 * Load ~/.starnion/starnion.yaml and inject values into process.env.
 * Priority: existing env vars > starnion.yaml values.
 * Called once at startup before anything else.
 */
export function loadStarnionConfig(): void {
  // Always apply prompt caching default regardless of yaml presence
  if (!process.env.PI_CACHE_RETENTION) {
    process.env.PI_CACHE_RETENTION = "long";
  }

  // Prepend the starnion Python venv to PATH so skill scripts can
  // resolve `python3` (and pip-installed modules like `requests`,
  // `psycopg2`, `google-api-python-client`) even when the agent was
  // launched from a shell that has no venv in its PATH. This matters
  // for every non-CLI entry point — `pnpm dev`, `tsx watch`, direct
  // `node dist/server/index.js`, VS Code's debug launcher, etc.
  // `starnion start` and `starnion dev` do the same at the Go-CLI
  // layer, but duplicating it here makes the agent robust to any
  // launch path. The prepend is idempotent: once venvBin is in
  // PATH, the block is a no-op.
  const venvBin = path.join(os.homedir(), ".starnion", "venv", "bin");
  if (fs.existsSync(venvBin)) {
    const pathParts = (process.env.PATH ?? "").split(path.delimiter);
    if (!pathParts.includes(venvBin)) {
      process.env.PATH = venvBin + path.delimiter + (process.env.PATH ?? "");
    }
  }

  const yaml = loadStarnionYaml();
  if (Object.keys(yaml).length === 0) {
    console.warn("[config] ~/.starnion/starnion.yaml not found, using env vars / defaults");
    return;
  }

  const db = (yaml.database ?? {}) as Record<string, string>;
  const gw = (yaml.gateway ?? {}) as Record<string, string>;
  const mn = (yaml.minio ?? {}) as Record<string, string>;
  const auth = (yaml.auth ?? {}) as Record<string, string>;
  const br = (yaml.browser ?? {}) as Record<string, string>;
  const lg = (yaml.log ?? {}) as Record<string, string>;
  // Build DATABASE_URL from yaml if not already set in env
  if (!process.env.DATABASE_URL && db.host) {
    const sslMode = db.ssl_mode ?? "disable";
    process.env.DATABASE_URL =
      `postgresql://${db.user ?? "postgres"}:${db.password ?? ""}` +
      `@${db.host ?? "localhost"}:${db.port ?? "5432"}` +
      `/${db.name ?? "starnion"}?sslmode=${sslMode}`;
  }

  // gRPC port
  if (!process.env.AGENT_GRPC_PORT && gw.grpc_port) {
    process.env.AGENT_GRPC_PORT = gw.grpc_port;
  }

  // MinIO
  if (!process.env.MINIO_ENDPOINT && mn.endpoint)   process.env.MINIO_ENDPOINT   = mn.endpoint;
  if (!process.env.MINIO_ACCESS_KEY && mn.access_key) process.env.MINIO_ACCESS_KEY = mn.access_key;
  if (!process.env.MINIO_SECRET_KEY && mn.secret_key) process.env.MINIO_SECRET_KEY = mn.secret_key;
  if (!process.env.MINIO_BUCKET && mn.bucket)       process.env.MINIO_BUCKET     = mn.bucket;
  if (!process.env.MINIO_USE_SSL && mn.use_ssl)     process.env.MINIO_USE_SSL    = mn.use_ssl;

  // Gateway internal URL (for browser screenshot upload)
  if (!process.env.GATEWAY_INTERNAL_URL) {
    const gwHost = gw.host ?? "127.0.0.1";
    const gwPort = gw.port ?? "8080";
    process.env.GATEWAY_INTERNAL_URL = `http://${gwHost}:${gwPort}`;
  }

  // Internal log secret (reused for screenshot upload auth)
  if (!process.env.INTERNAL_LOG_SECRET && auth.internal_log_secret) {
    process.env.INTERNAL_LOG_SECRET = auth.internal_log_secret;
  }

  // JWT secret
  if (!process.env.JWT_SECRET && auth.jwt_secret) process.env.JWT_SECRET = auth.jwt_secret;

  // Encryption key (for skill scripts that decrypt DB-stored tokens)
  if (!process.env.ENCRYPTION_KEY && auth.encryption_key) process.env.ENCRYPTION_KEY = auth.encryption_key;

  // gRPC shared secret — the agent's sharedSecretInterceptor rejects every
  // incoming call when this is unset, so it must be populated from the yaml
  // when running the agent outside `starnion start` (e.g. `node dist/server/index.js`).
  if (!process.env.GRPC_SHARED_SECRET && auth.grpc_shared_secret) {
    process.env.GRPC_SHARED_SECRET = auth.grpc_shared_secret;
  }

  // Default LLM OAuth token + auth.json sync for pi-coding-agent
  // 1. Set ANTHROPIC_OAUTH_TOKEN env var
  // 2. Sync credentials to ~/.pi/agent/auth.json for auto-refresh
  const creds = readClaudeCodeCredentials();
  if (creds) {
    if (!process.env.ANTHROPIC_OAUTH_TOKEN) {
      process.env.ANTHROPIC_OAUTH_TOKEN = creds.accessToken;
    }
    // Sync to auth.json so pi-coding-agent can auto-refresh expired tokens
    syncAuthJson(creds);
  } else if (!process.env.ANTHROPIC_OAUTH_TOKEN) {
    if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
      process.env.ANTHROPIC_OAUTH_TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    }
  }

  // Log level
  if (!process.env.LOG_LEVEL && lg.level) process.env.LOG_LEVEL = lg.level;

  // Gateway public URL (for resolving relative image URLs in chat responses)
  if (!process.env.GATEWAY_URL && gw.url) process.env.GATEWAY_URL = gw.url;

  // Browser control server
  if (!process.env.BROWSER_ENABLED && br.enabled)           process.env.BROWSER_ENABLED           = br.enabled;
  if (!process.env.BROWSER_CONTROL_PORT && br.control_port) process.env.BROWSER_CONTROL_PORT       = br.control_port;
  if (!process.env.BROWSER_HEADLESS && br.headless)         process.env.BROWSER_HEADLESS           = br.headless;
  if (!process.env.BROWSER_EVALUATE_ENABLED && br.evaluate_enabled) process.env.BROWSER_EVALUATE_ENABLED = br.evaluate_enabled;
  if (!process.env.BROWSER_URL && br.url)                   process.env.BROWSER_URL                = br.url;
  // Browser control bridge auth token (auto-generated by `starnion setup`
  // / `starnion start` / `starnion dev` via EnsureSecrets). Without this
  // the agent disables its browser bridge on boot; with it any local
  // process still needs to present the token to drive Chrome.
  //
  // The token now lives under auth.browser_auth_token alongside the
  // other shared secrets (jwt_secret, encryption_key, ...). The old
  // browser.auth_token path is kept as a fallback so yamls written by
  // older starnion-cli versions continue to work; the next `starnion
  // start|dev|setup` run will migrate the value to the new location.
  const browserAuthToken = auth.browser_auth_token || br.auth_token;
  if (!process.env.BROWSER_AUTH_TOKEN && browserAuthToken) process.env.BROWSER_AUTH_TOKEN = browserAuthToken;

  // Naver Search API (used by finance skill for Korean geocoding)
  const nv = (yaml.naver ?? {}) as Record<string, string>;
  if (!process.env.NAVER_SEARCH_CLIENT_ID && nv.search_client_id)
    process.env.NAVER_SEARCH_CLIENT_ID = nv.search_client_id;
  if (!process.env.NAVER_SEARCH_CLIENT_SECRET && nv.search_client_secret)
    process.env.NAVER_SEARCH_CLIENT_SECRET = nv.search_client_secret;

  const dbUrl = process.env.DATABASE_URL ?? "(not set)";
  const dbPreview = dbUrl.replace(/:([^:@]+)@/, ":***@"); // mask password
  console.log(`[config] Loaded ~/.starnion/starnion.yaml — DATABASE_URL=${dbPreview}`);
}
