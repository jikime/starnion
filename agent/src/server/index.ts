import { loadStarnionConfig } from "../system/config.js";
loadStarnionConfig();
import { patchConsole } from "./logForwarder.js";
patchConsole();
import { createAgentGrpcServer } from "./grpc.js";
import { startAnalysisScheduler } from "../scheduler/analysis.js";
import { resolveBrowserConfig, startBrowserControlServer, setBrowserUrlForProfile } from "../browser/index.js";
import fs from "fs";
import * as grpc from "@grpc/grpc-js";

const port = process.env.AGENT_GRPC_PORT ?? "50051";
const bindHost = process.env.AGENT_GRPC_BIND_HOST ?? "127.0.0.1";
const bindAddr = `${bindHost}:${port}`;

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
}

function buildServerCredentials(): grpc.ServerCredentials {
  const certPath = process.env.AGENT_GRPC_TLS_CERT?.trim();
  const keyPath = process.env.AGENT_GRPC_TLS_KEY?.trim();
  const caPath = process.env.AGENT_GRPC_TLS_CA?.trim();

  if (certPath && keyPath) {
    const cert = fs.readFileSync(certPath);
    const key = fs.readFileSync(keyPath);
    const rootCerts = caPath ? fs.readFileSync(caPath) : null;
    // When a CA is provided, require and verify the client certificate (mTLS).
    const requireClientCert = rootCerts !== null;
    console.log(`[grpc] TLS enabled (mTLS=${requireClientCert})`);
    return grpc.ServerCredentials.createSsl(
      rootCerts,
      [{ private_key: key, cert_chain: cert }],
      requireClientCert,
    );
  }

  if (!isLoopbackHost(bindHost)) {
    console.error(
      `[grpc] REFUSING to bind ${bindAddr} without TLS — plaintext traffic on a non-loopback interface is unsafe.`,
    );
    console.error(
      `       Either set AGENT_GRPC_TLS_CERT + AGENT_GRPC_TLS_KEY (optionally AGENT_GRPC_TLS_CA for mTLS),`,
    );
    console.error(
      `       or set AGENT_GRPC_BIND_HOST=127.0.0.1 (default) so the agent only accepts local connections.`,
    );
    process.exit(1);
  }

  console.log(`[grpc] INSECURE mode on loopback-only (${bindAddr})`);
  return grpc.ServerCredentials.createInsecure();
}

const server = createAgentGrpcServer();
server.bindAsync(
  bindAddr,
  buildServerCredentials(),
  (error, boundPort) => {
    if (error) {
      console.error("Failed to start gRPC server:", error);
      process.exit(1);
    }
    console.log(`NewStarNion Agent gRPC server running on ${bindHost}:${boundPort}`);
    startAnalysisScheduler();
  }
);

// Browser control server (Chrome DevTools MCP bridge).
//
// The bridge can drive a real Chrome instance, so running it without an
// auth token lets any local process steer the browser — effectively a
// local RCE. Instead of hard-exiting the whole agent when the token is
// missing (which would also take down chat + scheduler), we disable
// just the bridge with a loud warning. Operators who actually need it
// should run `starnion setup` / `starnion start` which auto-generates
// `BROWSER_AUTH_TOKEN` via EnsureSecrets, or set the env var themselves.
const browserUrl = process.env.BROWSER_URL?.trim();
const browserRequested = process.env.BROWSER_ENABLED !== "false";
const browserToken = process.env.BROWSER_AUTH_TOKEN?.trim();
if (browserRequested && !browserToken) {
  console.warn(
    "[browser] BROWSER_AUTH_TOKEN is not set — disabling the browser control bridge. Run `starnion setup` to auto-generate a token, or set BROWSER_ENABLED=false to silence this warning.",
  );
}
const browserCfg = resolveBrowserConfig({
  enabled: browserRequested && !!browserToken,
  evaluateEnabled: process.env.BROWSER_EVALUATE_ENABLED === "true",
  controlPort: Number(process.env.BROWSER_CONTROL_PORT ?? 18793),
  authToken: browserToken,
  defaultProfile: "default",
  profiles: { default: { browserUrl } },
});
if (browserUrl) setBrowserUrlForProfile("default", browserUrl);
startBrowserControlServer(browserCfg).catch((err) => {
  console.error("[browser] Failed to start browser control server:", err);
});
