import type { Request, Response } from "express";
import {
  closeChromeMcpTab,
  focusChromeMcpTab,
  listChromeMcpTabs,
  openChromeMcpTab,
} from "../chrome-mcp.js";
import type { BrowserConfig } from "../config.js";
import { toBrowserErrorResponse } from "../errors.js";

function profileName(req: Request, cfg: BrowserConfig): string {
  return typeof req.query.profile === "string" ? req.query.profile : cfg.defaultProfile;
}

function handleError(res: Response, err: unknown): void {
  const mapped = toBrowserErrorResponse(err);
  if (mapped) {
    res.status(mapped.status).json({ ok: false, error: mapped.message });
  } else {
    res.status(500).json({ ok: false, error: String(err) });
  }
}

export function registerTabRoutes(
  app: { get: Function; post: Function; delete: Function },
  cfg: BrowserConfig,
): void {
  // GET /tabs — list open tabs
  app.get("/tabs", async (req: Request, res: Response) => {
    try {
      const profile = profileName(req, cfg);
      const tabs = await listChromeMcpTabs(
        profile,
        cfg.profiles[profile]?.userDataDir,
      );
      res.json({ ok: true, tabs });
    } catch (err) {
      handleError(res, err);
    }
  });

  // POST /tabs — open new tab
  app.post("/tabs", async (req: Request, res: Response) => {
    try {
      const profile = profileName(req, cfg);
      const url = typeof req.body?.url === "string" ? req.body.url : "about:blank";
      const tab = await openChromeMcpTab(
        profile,
        url,
        cfg.profiles[profile]?.userDataDir,
      );
      res.status(201).json({ ok: true, tab });
    } catch (err) {
      handleError(res, err);
    }
  });

  // POST /tabs/:targetId/focus — bring tab to front
  app.post("/tabs/:targetId/focus", async (req: Request, res: Response) => {
    try {
      const profile = profileName(req, cfg);
      const tid = Array.isArray(req.params.targetId) ? req.params.targetId[0] : req.params.targetId;
      await focusChromeMcpTab(profile, tid ?? "", cfg.profiles[profile]?.userDataDir);
      res.json({ ok: true });
    } catch (err) {
      handleError(res, err);
    }
  });

  // DELETE /tabs/:targetId — close tab
  app.delete("/tabs/:targetId", async (req: Request, res: Response) => {
    try {
      const profile = profileName(req, cfg);
      const tid = Array.isArray(req.params.targetId) ? req.params.targetId[0] : req.params.targetId;
      await closeChromeMcpTab(profile, tid ?? "", cfg.profiles[profile]?.userDataDir);
      res.json({ ok: true });
    } catch (err) {
      handleError(res, err);
    }
  });
}
