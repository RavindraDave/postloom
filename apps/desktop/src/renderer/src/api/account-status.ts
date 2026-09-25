import type { EmailAccountInfo } from '@postloom/contracts';

/** An account "needs you" when its last check failed or it has no saved password. */
export function accountNeedsYou(account: EmailAccountInfo): boolean {
  return !account.hasPassword || account.lastTestOk === false;
}
