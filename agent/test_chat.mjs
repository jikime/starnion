// Test the actual handleChat function from dist
import { handleChat } from "./dist/session/chat.js";

console.log("[test] calling handleChat...");
await handleChat({
  userId: "test-user-123",
  sessionId: "test-session-456",
  message: "Say hi in 5 words",
  model: "claude-sonnet-4-5",
  onEvent: (event) => {
    const keys = Object.keys(event);
    if (keys.includes("text_delta")) {
      process.stdout.write(event.text_delta.text);
    } else {
      console.log("[event]", keys[0]);
    }
  },
  onDone: () => {
    console.log("\n[test] onDone called - success!");
    process.exit(0);
  },
  onError: (err) => {
    console.error("[test] onError:", err.message);
    process.exit(1);
  },
});
