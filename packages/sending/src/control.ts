import type { PauseReason } from '@postloom/db';

/**
 * Pause and Stop for a running send. Waiting (between emails or before a
 * retry) ends as soon as either is asked for; the email being sent at that
 * moment always finishes first.
 */
export function createControl() {
  let request: PauseReason | 'stop' | null = null;
  const wakers = new Set<() => void>();
  const wakeAll = () => {
    for (const wake of wakers) wake();
    wakers.clear();
  };
  return {
    requested: () => request,
    pause(reason: PauseReason = 'user') {
      // Stop wins over a later pause.
      if (request !== 'stop') request = reason;
      wakeAll();
    },
    stop() {
      request = 'stop';
      wakeAll();
    },
    sleep(ms: number): Promise<void> {
      if (request) return Promise.resolve();
      return new Promise((resolve) => {
        const done = () => {
          clearTimeout(timer);
          wakers.delete(done);
          resolve();
        };
        const timer = setTimeout(done, ms);
        wakers.add(done);
      });
    },
  };
}

export type SendControl = ReturnType<typeof createControl>;
