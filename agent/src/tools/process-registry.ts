import { ChildProcess } from "child_process";

export interface BackgroundProcess {
  pid: number;
  command: string;
  startedAt: Date;
  /** Accumulated stdout + stderr output (capped at MAX_OUTPUT_BYTES) */
  output: string;
  process: ChildProcess;
  exitCode: number | null;
  running: boolean;
}

const MAX_OUTPUT_BYTES = 256 * 1024; // 256 KB per process

/**
 * Background process registry scoped per agent session.
 * Uses WeakMap so entries are GC-cleaned when the session manager is released.
 */
const _registry = new WeakMap<object, Map<string, BackgroundProcess>>();

function getMap(sessionKey: object): Map<string, BackgroundProcess> {
  if (!_registry.has(sessionKey)) {
    _registry.set(sessionKey, new Map());
  }
  return _registry.get(sessionKey)!;
}

export const processRegistry = {
  register(sessionKey: object, processId: string, proc: BackgroundProcess): void {
    getMap(sessionKey).set(processId, proc);
  },

  get(sessionKey: object, processId: string): BackgroundProcess | undefined {
    return getMap(sessionKey).get(processId);
  },

  list(sessionKey: object): Array<{ id: string } & BackgroundProcess> {
    return [...getMap(sessionKey).entries()].map(([id, p]) => ({ id, ...p }));
  },

  kill(sessionKey: object, processId: string): boolean {
    const proc = getMap(sessionKey).get(processId);
    if (!proc || !proc.running) return false;
    proc.process.kill("SIGTERM");
    return true;
  },

  append(sessionKey: object, processId: string, chunk: string): void {
    const proc = getMap(sessionKey).get(processId);
    if (!proc) return;
    proc.output += chunk;
    // Keep last MAX_OUTPUT_BYTES
    if (proc.output.length > MAX_OUTPUT_BYTES) {
      proc.output = proc.output.slice(proc.output.length - MAX_OUTPUT_BYTES);
    }
  },
};
