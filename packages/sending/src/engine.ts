import type { PauseReason, RecipientCounts, SendRecipient } from '@postloom/db';
import {
  classifyFailure,
  type OutgoingEmail,
  type SendFailure,
  type SendResult,
} from '@postloom/email';

/** What the engine needs from the database; each call is its own committed write. */
export interface EngineStore {
  nextPending(): Promise<SendRecipient | null>;
  claim(recipientId: string): Promise<boolean>;
  markSent(recipientId: string, messageId: string): Promise<unknown>;
  markFailed(recipientId: string, errorCode: string): Promise<unknown>;
  markUncertain(recipientId: string, errorCode: string): Promise<unknown>;
  release(recipientId: string): Promise<unknown>;
  setStatus(
    status: 'sending' | 'paused' | 'stopped' | 'finished',
    reason?: PauseReason,
  ): Promise<void>;
  /** Emails this account has sent today, across all sends. */
  sentToday(): Promise<number>;
  recordSent(): Promise<void>;
  counts(): Promise<RecipientCounts>;
}

export interface Progress {
  counts: RecipientCounts;
  /** The person being emailed now. */
  current: { rowNo: number; to: string } | null;
  /** Rough time left, in milliseconds. */
  etaMs: number;
}

export type Outcome =
  { status: 'finished' } | { status: 'stopped' } | { status: 'paused'; reason: PauseReason };

export interface EngineOptions {
  store: EngineStore;
  send: (email: OutgoingEmail) => Promise<SendResult>;
  /** Builds one person's email (personal details, addresses, pictures). */
  build: (person: SendRecipient) => Promise<OutgoingEmail>;
  delayMs: number;
  dailyLimit: number;
  /** Asked between emails (and while waiting): has Pause (and why) or Stop been asked for? */
  requested: () => PauseReason | 'stop' | null;
  /** Waits; may return early when Pause or Stop is pressed. */
  sleep: (ms: number) => Promise<void>;
  onProgress?: (progress: Progress) => void;
  now?: () => number;
  random?: () => number;
  /** Waits before the 2nd and 3rd tries after a "try again later". */
  retryDelaysMs?: number[];
  /** Pause after this many people in a row whose emails may not have gone through. */
  circuitAfter?: number;
  /** Progress updates at most this often. */
  progressEveryMs?: number;
}

export const RETRY_DELAYS_MS = [5_000, 30_000];
export const CIRCUIT_AFTER = 3;

/**
 * Sends to everyone still pending, one at a time (PLAN.md §9). The rules
 * that keep people from getting an email twice:
 * - a person is claimed (`sending`, committed) before the server is contacted;
 * - only failures where the server certainly took nothing are retried
 *   (it said "not now", or we couldn't connect at all);
 * - a connection lost part-way marks the person `uncertain`, never retried
 *   automatically;
 * - Pause and Stop take effect between emails, never during one.
 */
export async function runSend(options: EngineOptions): Promise<Outcome> {
  const {
    store,
    requested,
    sleep,
    now = Date.now,
    random = Math.random,
    retryDelaysMs = RETRY_DELAYS_MS,
    circuitAfter = CIRCUIT_AFTER,
    progressEveryMs = 250,
  } = options;
  const maxAttempts = retryDelaysMs.length + 1;

  let current: Progress['current'] = null;
  let lastProgress = -Infinity;
  let sendTimeMs = 1_000;
  const progress = async (force = false) => {
    if (!options.onProgress || (!force && now() - lastProgress < progressEveryMs)) return;
    lastProgress = now();
    const counts = await store.counts();
    options.onProgress({
      counts,
      current,
      etaMs: (counts.pending + counts.sending) * (options.delayMs + sendTimeMs),
    });
  };

  const stopOrPause = async (): Promise<Outcome | null> => {
    const request = requested();
    if (request === 'stop') {
      await store.setStatus('stopped');
      return { status: 'stopped' };
    }
    return request ? pause(request) : null;
  };
  const pause = async (reason: PauseReason): Promise<Outcome> => {
    await store.setStatus('paused', reason);
    current = null;
    await progress(true);
    return { status: 'paused', reason };
  };

  await store.setStatus('sending');
  await progress(true);
  let sentBefore = false;
  let doubtfulInARow = 0;

  for (;;) {
    const early = await stopOrPause();
    if (early) return early;
    if ((await store.sentToday()) >= options.dailyLimit) return pause('dailyLimit');

    const person = await store.nextPending();
    if (!person) {
      await store.setStatus('finished');
      current = null;
      await progress(true);
      return { status: 'finished' };
    }

    // The gap between emails, so the provider doesn't see a burst.
    if (sentBefore && options.delayMs > 0) {
      await sleep(options.delayMs);
      const afterWait = await stopOrPause();
      if (afterWait) return afterWait;
    }

    if (!(await store.claim(person.id))) continue;
    current = { rowNo: person.rowNo, to: person.to.join(', ') };
    await progress();

    let email: OutgoingEmail;
    try {
      email = await options.build(person);
    } catch {
      await store.markFailed(person.id, 'template');
      continue;
    }

    for (let attempt = 1; ; attempt += 1) {
      const started = now();
      let result: SendResult | null = null;
      let failure: SendFailure | null = null;
      try {
        result = await options.send(email);
      } catch (error) {
        failure = classifyFailure(error);
      }
      // Saving the outcome is outside the try: if the database can't record a
      // sent email, the engine stops, and on restart that person is `uncertain`.
      if (result) {
        await store.markSent(person.id, result.messageId);
        await store.recordSent();
        sendTimeMs = Math.max(1, now() - started);
        sentBefore = true;
        doubtfulInARow = 0;
        break;
      }
      if (failure) {
        if (failure.kind === 'rejected' || failure.kind === 'invalid') {
          await store.markFailed(
            person.id,
            failure.kind === 'invalid' ? 'invalid' : `rejected:${failure.reason}`,
          );
          doubtfulInARow = 0;
          break;
        }
        if (failure.kind === 'auth') {
          // Nothing was sent: this person stays in the queue for when it's fixed.
          await store.release(person.id);
          return pause('auth');
        }
        if (failure.kind === 'uncertain') {
          await store.markUncertain(person.id, failure.reason);
          doubtfulInARow += 1;
          if (doubtfulInARow >= circuitAfter) return pause('connection');
          break;
        }
        // "Not now" or couldn't connect: nothing was sent, so trying again is safe.
        if (attempt < maxAttempts) {
          const wait = retryDelaysMs[attempt - 1] ?? 0;
          await sleep(Math.round(wait * (0.8 + random() * 0.4)));
          if (requested()) {
            await store.release(person.id);
            break;
          }
          continue;
        }
        if (failure.kind === 'offline') {
          await store.release(person.id);
          return pause('connection');
        }
        await store.markFailed(person.id, `temporary:${failure.reason}`);
        break;
      }
    }
    await progress();
  }
}
