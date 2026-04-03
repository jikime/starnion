import { loadStarnionConfig } from "../system/config.js";
loadStarnionConfig();
import { patchConsole } from "./logForwarder.js";
patchConsole();
import { createAgentGrpcServer } from "./grpc.js";
import { startAnalysisScheduler } from "../scheduler/analysis.js";
import { resolveBrowserConfig, startBrowserControlServer, setBrowserUrlForProfile } from "../browser/index.js";

const port = process.env.AGENT_GRPC_PORT ?? "50051";

import * as grpc from "@grpc/grpc-js";

const server = createAgentGrpcServer();
server.bindAsync(
  `0.0.0.0:${port}`,
  grpc.ServerCredentials.createInsecure(),
  (error, boundPort) => {
    if (error) {
      console.error("Failed to start gRPC server:", error);
      process.exit(1);
    }
    console.log(`NewStarNion Agent gRPC server running on port ${boundPort}`);
    startAnalysisScheduler();
  }
);

// Browser control server (Chrome DevTools MCP bridge)
const browserUrl = process.env.BROWSER_URL?.trim();
const browserCfg = resolveBrowserConfig({
  enabled: process.env.BROWSER_ENABLED !== "false",
  evaluateEnabled: process.env.BROWSER_EVALUATE_ENABLED === "true",
  controlPort: Number(process.env.BROWSER_CONTROL_PORT ?? 18793),
  authToken: process.env.BROWSER_AUTH_TOKEN,
  defaultProfile: "default",
  profiles: { default: { browserUrl } },
});
if (browserUrl) setBrowserUrlForProfile("default", browserUrl);
startBrowserControlServer(browserCfg).catch((err) => {
  console.error("[browser] Failed to start browser control server:", err);
});
