import type { PauseReason, Repositories } from '@postloom/db';
import type { Mailer, RenewAccessToken, SmtpAccountConfig } from '@postloom/email';
import {
  createControl,
  runJob,
  type Outcome,
  type Progress,
  type SendControl,
  type SendJob,
} from '@postloom/sending';

/** What the sending process reports back. */
export type RunnerResult = Outcome | { status: 'crashed' };

export interface RunnerEvents {
  onProgress: (sendId: string, progress: Progress) => void;
  onDone: (sendId: string, result: RunnerResult) => void;
}

/** Runs sends somewhere (the sending process, or in-process for tests). */
export interface SendRunner {
  start(job: SendJob): void;
  /** Pause after the email going out now; false if not running. */
  pause(sendId: string, reason: PauseReason): boolean;
  stop(sendId: string): boolean;
  isRunning(sendId: string): boolean;
  running(): string[];
}

// ----------------------------------------------- Messages to and from the sending process

export type ToSender =
  | { type: 'start'; job: SendJob; dbFile: string }
  | { type: 'pause'; reason: PauseReason }
  | { type: 'stop' }
  /** A fresh sign-in token (or why there isn't one), answering a token request. */
  | {
      type: 'token';
      requestId: number;
      token?: { accessToken: string; expiresAt: number };
      error?: string;
    };

export type FromSender =
  | { type: 'progress'; progress: Progress }
  | { type: 'done'; outcome: Outcome }
  /** A Google or Microsoft token ran out part-way through a long send. */
  | { type: 'token-request'; requestId: number; renew: boolean };

/** Fresh sign-in tokens for an account (kept in the main process, where the refresh token is). */
export type RenewForAccount = (accountId: string, renew: boolean) => ReturnType<RenewAccessToken>;

/** Runs sends inside this process. Used by tests (and as a fallback). */
export function createInProcessRunner(
  deps: {
    repos: Repositories;
    openMailer: (config: SmtpAccountConfig, renew?: RenewAccessToken) => Mailer;
    renewAccessToken?: RenewForAccount | undefined;
  },
  events: RunnerEvents,
): SendRunner {
  const active = new Map<string, SendControl>();
  return {
    start(job) {
      if (active.has(job.sendId)) return;
      const control = createControl();
      active.set(job.sendId, control);
      const renewFor = deps.renewAccessToken;
      void runJob(job, {
        repos: deps.repos,
        openMailer: deps.openMailer,
        ...(renewFor && {
          renewAccessToken: (renew: boolean) => renewFor(job.accountId, renew),
        }),
        control,
        onProgress: (progress) => {
          events.onProgress(job.sendId, progress);
        },
      })
        .catch((): RunnerResult => ({ status: 'crashed' }))
        .then((result: RunnerResult) => {
          active.delete(job.sendId);
          events.onDone(job.sendId, result);
        });
    },
    pause: (sendId, reason) => {
      active.get(sendId)?.pause(reason);
      return active.has(sendId);
    },
    stop: (sendId) => {
      active.get(sendId)?.stop();
      return active.has(sendId);
    },
    isRunning: (sendId) => active.has(sendId),
    running: () => [...active.keys()],
  };
}

/** The bit of Electron's utility process the runner uses (so it can be faked). */
export interface ChildProcessLike {
  postMessage(message: ToSender): void;
  on(event: 'message', listener: (message: FromSender) => void): unknown;
  on(event: 'exit', listener: (code: number) => void): unknown;
  kill(): boolean;
}

/**
 * Runs each send in its own utility process (PLAN.md §9), so sending never
 * slows the app down and a crash while sending can't take the app with it.
 */
export function createProcessRunner(
  deps: {
    fork: () => ChildProcessLike;
    dbFile: string;
    renewAccessToken?: RenewForAccount | undefined;
  },
  events: RunnerEvents,
): SendRunner {
  const active = new Map<string, ChildProcessLike>();
  return {
    start(job) {
      if (active.has(job.sendId)) return;
      const child = deps.fork();
      active.set(job.sendId, child);
      let finished = false;
      child.on('message', (message) => {
        if (message.type === 'progress') events.onProgress(job.sendId, message.progress);
        if (message.type === 'token-request') {
          const { requestId } = message;
          const renew = deps.renewAccessToken;
          if (!renew) {
            child.postMessage({ type: 'token', requestId, error: 'errors.signInUnavailable' });
            return;
          }
          renew(job.accountId, message.renew).then(
            (token) => {
              child.postMessage({ type: 'token', requestId, token });
            },
            (error: unknown) => {
              const key =
                typeof error === 'object' && error !== null && 'messageKey' in error
                  ? String(error.messageKey)
                  : 'errors.signInExpired';
              child.postMessage({ type: 'token', requestId, error: key });
            },
          );
        }
        if (message.type === 'done') {
          finished = true;
          active.delete(job.sendId);
          events.onDone(job.sendId, message.outcome);
        }
      });
      child.on('exit', () => {
        if (finished) return;
        active.delete(job.sendId);
        events.onDone(job.sendId, { status: 'crashed' });
      });
      child.postMessage({ type: 'start', job, dbFile: deps.dbFile });
    },
    pause(sendId, reason) {
      active.get(sendId)?.postMessage({ type: 'pause', reason });
      return active.has(sendId);
    },
    stop(sendId) {
      active.get(sendId)?.postMessage({ type: 'stop' });
      return active.has(sendId);
    },
    isRunning: (sendId) => active.has(sendId),
    running: () => [...active.keys()],
  };
}
