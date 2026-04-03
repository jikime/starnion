import type { Request, Response } from "express";
import {
  buildAiSnapshotFromChromeMcpSnapshot,
  flattenChromeMcpSnapshotToAriaNodes,
} from "../chrome-mcp.snapshot.js";
import {
  clickChromeMcpElement,
  dragChromeMcpElement,
  evaluateChromeMcpScript,
  fillChromeMcpElement,
  fillChromeMcpForm,
  focusChromeMcpTab,
  hoverChromeMcpElement,
  listChromeMcpTabs,
  navigateChromeMcpPage,
  pressChromeMcpKey,
  resizeChromeMcpPage,
  takeChromeMcpScreenshot,
  takeChromeMcpSnapshot,
  uploadChromeMcpFile,
  waitForChromeMcpText,
} from "../chrome-mcp.js";
import type { BrowserConfig } from "../config.js";
import { BrowserEvaluateDisabledError, toBrowserErrorResponse } from "../errors.js";

function profileName(req: Request, cfg: BrowserConfig): string {
  const fromQuery = typeof req.query.profile === "string" ? req.query.profile : "";
  const fromBody = typeof req.body?.profile === "string" ? req.body.profile : "";
  return fromQuery || fromBody || cfg.defaultProfile;
}

function userDataDir(profileName: string, cfg: BrowserConfig): string | undefined {
  return cfg.profiles[profileName]?.userDataDir;
}

function handleError(res: Response, err: unknown): void {
  const mapped = toBrowserErrorResponse(err);
  if (mapped) {
    res.status(mapped.status).json({ ok: false, error: mapped.message });
  } else {
    res.status(500).json({ ok: false, error: String(err) });
  }
}

export function registerAgentRoutes(
  app: { get: Function; post: Function },
  cfg: BrowserConfig,
): void {
  // ── GET /agent/snapshot ─────────────────────────────────────────────────
  // format=ai (default) → AI 친화적 텍스트 스냅샷 + refs
  // format=aria         → 플랫 aria 노드 배열
  app.get("/agent/snapshot", async (req: Request, res: Response) => {
    try {
      const profile = profileName(req, cfg);
      const udd = userDataDir(profile, cfg);
      const format = req.query.format === "aria" ? "aria" : "ai";
      const targetId = typeof req.query.targetId === "string" ? req.query.targetId : "";

      // targetId 없으면 현재 선택된 탭 자동 결정
      let resolvedTargetId = targetId;
      if (!resolvedTargetId) {
        const tabs = await listChromeMcpTabs(profile, udd);
        if (tabs.length === 0) {
          res.status(404).json({ ok: false, error: "No open tabs found." });
          return;
        }
        resolvedTargetId = tabs[0].targetId;
      }

      const root = await takeChromeMcpSnapshot({
        profileName: profile,
        userDataDir: udd,
        targetId: resolvedTargetId,
      });

      if (format === "aria") {
        const nodes = flattenChromeMcpSnapshotToAriaNodes(root);
        res.json({ ok: true, format: "aria", targetId: resolvedTargetId, nodes });
      } else {
        const { snapshot, truncated, refs, stats } = buildAiSnapshotFromChromeMcpSnapshot({
          root,
          options: { compact: true },
        });
        res.json({ ok: true, format: "ai", targetId: resolvedTargetId, snapshot, truncated, refs, stats });
      }
    } catch (err) {
      handleError(res, err);
    }
  });

  // ── POST /agent/act ─────────────────────────────────────────────────────
  // kind: navigate | click | fill | fill_form | hover | drag | press |
  //       screenshot | upload | resize | wait | evaluate
  app.post("/agent/act", async (req: Request, res: Response) => {
    try {
      const profile = profileName(req, cfg);
      const udd = userDataDir(profile, cfg);
      const body = req.body ?? {};
      const kind: string = typeof body.kind === "string" ? body.kind : "";
      const targetId: string = typeof body.targetId === "string" ? body.targetId : "";

      if (!kind) {
        res.status(400).json({ ok: false, error: "Missing required field: kind" });
        return;
      }

      switch (kind) {
        case "navigate": {
          const url: string = body.url ?? "";
          if (!url) { res.status(400).json({ ok: false, error: "Missing: url" }); return; }
          const result = await navigateChromeMcpPage({
            profileName: profile, userDataDir: udd, targetId,
            url,
            timeoutMs: typeof body.timeoutMs === "number" ? body.timeoutMs : undefined,
          });
          res.json({ ok: true, url: result.url });
          return;
        }

        case "click": {
          await clickChromeMcpElement({
            profileName: profile, userDataDir: udd, targetId,
            uid: body.uid ?? body.ref ?? "",
            doubleClick: body.doubleClick === true,
          });
          break;
        }

        case "fill": {
          await fillChromeMcpElement({
            profileName: profile, userDataDir: udd, targetId,
            uid: body.uid ?? body.ref ?? "",
            value: String(body.value ?? ""),
          });
          break;
        }

        case "fill_form": {
          await fillChromeMcpForm({
            profileName: profile, userDataDir: udd, targetId,
            elements: body.elements ?? [],
          });
          break;
        }

        case "hover": {
          await hoverChromeMcpElement({
            profileName: profile, userDataDir: udd, targetId,
            uid: body.uid ?? body.ref ?? "",
          });
          break;
        }

        case "drag": {
          await dragChromeMcpElement({
            profileName: profile, userDataDir: udd, targetId,
            fromUid: body.fromUid ?? body.from ?? "",
            toUid: body.toUid ?? body.to ?? "",
          });
          break;
        }

        case "press": {
          await pressChromeMcpKey({
            profileName: profile, userDataDir: udd, targetId,
            key: body.key ?? "",
          });
          break;
        }

        case "screenshot": {
          const buf = await takeChromeMcpScreenshot({
            profileName: profile, userDataDir: udd, targetId,
            fullPage: body.fullPage === true,
            format: body.format === "jpeg" ? "jpeg" : "png",
          });
          const base64 = buf.toString("base64");
          const fmt = body.format === "jpeg" ? "jpeg" : "png";

          // Try to upload to gateway so Telegram can send the image as a photo.
          let fileUrl: string | undefined;
          const gatewayUrl = process.env.GATEWAY_INTERNAL_URL?.trim();
          const internalSecret = process.env.INTERNAL_LOG_SECRET?.trim();
          const sessionId = typeof req.body?.session_id === "string" ? req.body.session_id : undefined;
          if (gatewayUrl) {
            try {
              const uploadResp = await fetch(`${gatewayUrl}/api/v1/internal/upload-screenshot`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(internalSecret ? { "X-Internal-Secret": internalSecret } : {}),
                },
                body: JSON.stringify({ data: base64, format: fmt, ...(sessionId ? { session_id: sessionId } : {}) }),
              });
              if (uploadResp.ok) {
                const data = (await uploadResp.json()) as { url?: string };
                if (data.url) fileUrl = data.url;
              }
            } catch {
              // Upload failed — return base64 only, agent can still describe it
            }
          }

          res.json({ ok: true, screenshot: base64, format: fmt, ...(fileUrl ? { url: fileUrl } : {}) });
          return;
        }

        case "upload": {
          await uploadChromeMcpFile({
            profileName: profile, userDataDir: udd, targetId,
            uid: body.uid ?? body.ref ?? "",
            filePath: body.filePath ?? "",
          });
          break;
        }

        case "resize": {
          await resizeChromeMcpPage({
            profileName: profile, userDataDir: udd, targetId,
            width: Number(body.width ?? 1280),
            height: Number(body.height ?? 720),
          });
          break;
        }

        case "focus": {
          await focusChromeMcpTab(profile, targetId, udd);
          break;
        }

        case "wait": {
          const text: string[] = Array.isArray(body.text)
            ? body.text
            : typeof body.text === "string"
            ? [body.text]
            : [];
          await waitForChromeMcpText({
            profileName: profile, userDataDir: udd, targetId,
            text,
            timeoutMs: typeof body.timeoutMs === "number" ? body.timeoutMs : undefined,
          });
          break;
        }

        case "evaluate": {
          if (!cfg.evaluateEnabled) throw new BrowserEvaluateDisabledError();
          const result = await evaluateChromeMcpScript({
            profileName: profile, userDataDir: udd, targetId,
            fn: body.fn ?? "",
            args: Array.isArray(body.args) ? body.args : undefined,
          });
          res.json({ ok: true, result });
          return;
        }

        default:
          res.status(400).json({ ok: false, error: `Unknown action kind: ${kind}` });
          return;
      }

      res.json({ ok: true });
    } catch (err) {
      handleError(res, err);
    }
  });
}
