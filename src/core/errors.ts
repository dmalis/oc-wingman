export type WingmanErrorCode =
  | "config.invalid"
  | "config.missing"
  | "reviewer.none"
  | "reviewer.ambiguous"
  | "reviewer.unavailable"
  | "artifact.failed"
  | "opencode.failed";

export class WingmanError extends Error {
  readonly code: WingmanErrorCode;
  readonly path?: string;
  readonly field?: string;

  constructor(code: WingmanErrorCode, message: string, input: { path?: string; field?: string } = {}) {
    super(message);
    this.name = "WingmanError";
    this.code = code;
    if (input.path !== undefined) this.path = input.path;
    if (input.field !== undefined) this.field = input.field;
  }
}

export function configError(message: string, path: string, field?: string): WingmanError {
  return new WingmanError("config.invalid", `${message} at ${path}${field ? ` field ${field}` : ""}`, field === undefined ? { path } : { path, field });
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
