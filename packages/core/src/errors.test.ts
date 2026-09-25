import { describe, expect, it } from 'vitest';
import { AppError, toAppErrorShape } from './errors';

describe('toAppErrorShape', () => {
  it('keeps code, message key and safe details of an AppError', () => {
    const error = new AppError({
      code: 'EMAIL_AUTH_FAILED',
      messageKey: 'errors.emailAuthFailed',
      details: { provider: 'gmail' },
    });

    expect(toAppErrorShape(error)).toEqual({
      code: 'EMAIL_AUTH_FAILED',
      messageKey: 'errors.emailAuthFailed',
      details: { provider: 'gmail' },
    });
  });

  it('hides the message of unexpected errors, which may contain secrets', () => {
    const shape = toAppErrorShape(new Error('connect failed for user:password@host'));

    expect(shape).toEqual({ code: 'UNEXPECTED', messageKey: 'errors.unexpected' });
    expect(JSON.stringify(shape)).not.toContain('password');
  });
});
