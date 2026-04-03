import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

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
 * Minimal two-level YAML parser for ~/.starnion/starnion.yaml.
 * Supports only the flat key: value and section: / key: value patterns used by starnion.
 */
function loadStarnionYaml(): Record<string, Record<string, string> | string> {
  if (!fs.existsSync(STARNION_YAML)) return {};

  const config: Record<string, Record<string, string> | string> = {};
  let section: string | null = null;

  const lines = fs.readFileSync(STARNION_YAML, "utf-8").split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line || line.trimStart().startsWith("#")) continue;
    if (!line.includes(":")) continue;

    const indent = line.length - line.trimStart().length;
    const stripped = line.trimStart();
    const colonIdx = stripped.indexOf(":");
    const key = stripped.slice(0, colonIdx).trim();
    const val = stripped.slice(colonIdx + 1).trim();

    if (indent === 0) {
      if (val) {
        config[key] = val;
        section = null;
      } else {
        config[key] = {};
        section = key;
      }
    } else if (section !== null) {
      (config[section] as Record<string, string>)[key] = val;
    }
  }

  return config;
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
