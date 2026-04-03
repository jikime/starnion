import http from "node:http";
import express from "express";
import type { BrowserConfig } from "./config.js";
import { stopAllChromeMcpSessions } from "./chrome-mcp.js";
import { registerAgentRoutes } from "./routes/agent.js";
import { registerTabRoutes } from "./routes/tabs.js";

function authMiddleware(token: string | undefined) {
  return (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ): void => {
    if (!token) { next(); return; }
    const header = req.headers.authorization ?? "";
    const queryToken = typeof req.query.token === "string" ? req.query.token : "";
    const provided = header.startsWith("Bearer ")
      ? header.slice(7)
      : queryToken;
    if (provided !== token) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    next();
  };
}

export type BrowserControlServer = {
  port: number;
  close: () => Promise<void>;
};

export async function startBrowserControlServer(
  cfg: BrowserConfig,
): Promise<BrowserControlServer | null> {
  if (!cfg.enabled) return null;

  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use(authMiddleware(cfg.authToken));

  // ── Status ──
  app.get("/", (_req, res) => {
    res.json({
      ok: true,
      service: "starnion-browser-control",
      defaultProfile: cfg.defaultProfile,
      profiles: Object.keys(cfg.profiles),
      evaluateEnabled: cfg.evaluateEnabled,
    });
  });

  // ── Routes ──
  registerTabRoutes(app, cfg);
  registerAgentRoutes(app, cfg);

  const server = await new Promise<http.Server>((resolve, reject) => {
    const s = app.listen(cfg.controlPort, "127.0.0.1", () => resolve(s));
    s.once("error", reject);
  }).catch((err: unknown) => {
    console.error(
      `[browser] Failed to bind 127.0.0.1:${cfg.controlPort}: ${String(err)}`,
    );
    return null;
  });

  if (!server) return null;

  console.log(`[browser] Control server listening on http://127.0.0.1:${cfg.controlPort}/`);

  return {
    port: cfg.controlPort,
    close: async () => {
      await stopAllChromeMcpSessions();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
