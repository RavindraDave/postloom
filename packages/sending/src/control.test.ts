import { describe, expect, it, vi } from 'vitest';
import { createControl } from './control';

describe('send control', () => {
  it('ends a wait as soon as Pause is pressed, and remembers why', async () => {
    vi.useFakeTimers();
    const control = createControl();
    let woke = false;
    const waiting = control.sleep(60_000).then(() => (woke = true));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(woke).toBe(false);
    control.pause('sleep');
    await waiting;
    expect(woke).toBe(true);
    expect(control.requested()).toBe('sleep');
    // Once asked, further waits don't wait.
    await control.sleep(60_000);
    vi.useRealTimers();
  });

  it('waits the full time when nothing is asked, and Stop wins over a later Pause', async () => {
    vi.useFakeTimers();
    const control = createControl();
    let woke = false;
    const waiting = control.sleep(2_000).then(() => (woke = true));
    await vi.advanceTimersByTimeAsync(2_000);
    await waiting;
    expect(woke).toBe(true);
    expect(control.requested()).toBeNull();
    control.stop();
    control.pause();
    expect(control.requested()).toBe('stop');
    vi.useRealTimers();
  });
});
