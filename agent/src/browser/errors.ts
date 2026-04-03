export class BrowserProfileUnavailableError extends Error {
  readonly status = 503;
  constructor(message: string) {
    super(message);
    this.name = "BrowserProfileUnavailableError";
  }
}

export class BrowserTabNotFoundError extends Error {
  readonly status = 404;
  constructor(message = "Browser tab not found.") {
    super(message);
    this.name = "BrowserTabNotFoundError";
  }
}

export class BrowserEvaluateDisabledError extends Error {
  readonly status = 403;
  constructor() {
    super("evaluate is disabled by config (browser.evaluateEnabled=false).");
    this.name = "BrowserEvaluateDisabledError";
  }
}

export function toBrowserErrorResponse(
  err: unknown,
): { status: number; message: string } | null {
  if (err instanceof BrowserProfileUnavailableError) {
    return { status: err.status, message: err.message };
  }
  if (err instanceof BrowserTabNotFoundError) {
    return { status: err.status, message: err.message };
  }
  if (err instanceof BrowserEvaluateDisabledError) {
    return { status: err.status, message: err.message };
  }
  return null;
}
