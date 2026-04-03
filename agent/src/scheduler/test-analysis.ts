/**
 * Manual test runner for analysis jobs.
 * Usage: tsx src/scheduler/test-analysis.ts [userId]
 */
import "dotenv/config";
import { loadStarnionConfig } from "../system/config.js";
loadStarnionConfig();
import { triggerAnalysis } from "./analysis.js";

const userId = process.argv[2] ?? "9a06357c-51b1-4f7b-b882-08f39b1dc30f"; // test@example.com

console.log(`\n=== Analysis Test (user=${userId}) ===\n`);

async function run() {
  console.log("── 1. conversation_analysis ──────────────────");
  await triggerAnalysis("conversation", userId);

  console.log("\n── 2. pattern_analysis ───────────────────────");
  await triggerAnalysis("patterns", userId);

  console.log("\n── 3. memory_compaction ──────────────────────");
  await triggerAnalysis("compact", userId);

  console.log("\n=== Done ===");
  process.exit(0);
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
