import type { Repositories } from '@postloom/db';
import type { EngineStore } from './engine';

/** Today in UTC (YYYY-MM-DD): daily limits count per UTC day. */
export const utcDay = (date = new Date()) => date.toISOString().slice(0, 10);

/** The engine's view of one send, backed by the database. */
export function createEngineStore(
  repos: Repositories,
  sendId: string,
  accountId: string,
  today: () => string = () => utcDay(),
): EngineStore {
  const { sends, usage } = repos;
  return {
    nextPending: () => sends.nextPending(sendId),
    claim: (id) => sends.claim(id),
    markSent: (id, messageId) => sends.markSent(id, messageId),
    markFailed: (id, code) => sends.markFailed(id, code),
    markUncertain: (id, code) => sends.markUncertain(id, code),
    release: (id) => sends.release(id),
    setStatus: (status, reason) => sends.setStatus(sendId, status, reason ?? null),
    sentToday: () => usage.sentOn(accountId, today()),
    recordSent: async () => {
      await usage.add(accountId, today());
    },
    counts: () => sends.counts(sendId),
  };
}
