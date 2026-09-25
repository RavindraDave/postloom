/**
 * Error codes that can cross the IPC boundary. The renderer maps each code to a
 * translated, plain-language message (see docs/glossary.md, "Wording rules");
 * technical details never reach the UI.
 */
export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'FORBIDDEN',
  'EMAIL_AUTH_FAILED',
  'EMAIL_CONNECTION_FAILED',
  'TEMPLATE_INVALID',
  'IN_USE',
  'DATABASE_DAMAGED',
  'UNEXPECTED',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface AppErrorShape {
  code: ErrorCode;
  /** i18n key for the user-facing message, e.g. `errors.emailAuthFailed`. */
  messageKey: string;
  /** Safe, non-secret details for diagnostics (never passwords or email bodies). */
  details?: Record<string, string | number | boolean>;
}

export class AppError extends Error implements AppErrorShape {
  readonly code: ErrorCode;
  readonly messageKey: string;
  readonly details?: Record<string, string | number | boolean>;

  constructor(shape: AppErrorShape, options?: { cause?: unknown }) {
    super(shape.messageKey, options);
    this.name = 'AppError';
    this.code = shape.code;
    this.messageKey = shape.messageKey;
    if (shape.details) {
      this.details = shape.details;
    }
  }

  toShape(): AppErrorShape {
    return {
      code: this.code,
      messageKey: this.messageKey,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

/** Converts anything thrown into a shape that is safe to send to the renderer. */
export function toAppErrorShape(error: unknown): AppErrorShape {
  if (error instanceof AppError) {
    return error.toShape();
  }
  return { code: 'UNEXPECTED', messageKey: 'errors.unexpected' };
}
