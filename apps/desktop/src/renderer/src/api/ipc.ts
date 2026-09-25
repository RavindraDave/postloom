import type { AppErrorShape } from '@postloom/core';
import type { IpcResult } from '@postloom/contracts';

/** An IPC failure, carrying the safe error shape from the main process. */
export class IpcError extends Error {
  readonly shape: AppErrorShape;

  constructor(shape: AppErrorShape) {
    super(shape.messageKey);
    this.name = 'IpcError';
    this.shape = shape;
  }
}

/** Turns an IPC result into a value, or throws an `IpcError` for React Query. */
export async function unwrap<T>(result: Promise<IpcResult<T>>): Promise<T> {
  const settled = await result;
  if (settled.ok) return settled.data;
  throw new IpcError(settled.error);
}

/** The translation key for any error, falling back to a generic message. */
export function errorKey(error: unknown): string {
  return error instanceof IpcError ? error.shape.messageKey : 'errors.unexpected';
}
