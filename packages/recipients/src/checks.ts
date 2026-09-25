import type { FieldMap } from './mapping';
import type { Recipient } from './recipients';

/** Above this many people, sending takes long enough to be worth a mention. */
export const LARGE_SEND = 2_000;

export type RecipientProblemId =
  | 'missingColumn'
  | 'noAddress'
  | 'invalidAddress'
  | 'overDailyLimit'
  | 'emptyDetail'
  | 'duplicate'
  | 'doNotEmail'
  | 'disabled'
  | 'largeSend';

export interface RecipientProblem {
  id: RecipientProblemId;
  severity: 'mustFix' | 'worthALook' | 'info';
  /** Rows affected (as numbered in Excel). */
  rows: number[];
  values?: Record<string, string | number>;
}

export interface CheckInput {
  recipients: Recipient[];
  /** Details the template uses, and whether each has an "if empty" text. */
  fields: { name: string; hasFallback: boolean }[];
  fieldMap: FieldMap;
  /** Addresses on the "Do not email" list (lower-case). */
  doNotEmail: Set<string>;
  /** How many more emails the account may send today. */
  remainingToday: number;
  /** Rows the person chose to leave out. */
  skipRows: Set<number>;
  /** Send only once to an address that appears in several rows. */
  sendDuplicatesOnce: boolean;
}

export interface CheckResult {
  problems: RecipientProblem[];
  /** The people who will get an email, in row order. */
  toSend: Recipient[];
  /** Rows left out, and why. */
  leftOut: { rowNo: number; reason: 'skipped' | 'disabled' | 'doNotEmail' | 'duplicate' }[];
}

/**
 * Checks everyone before sending ("Check together"). Must-fix problems block
 * sending until they're fixed (usually by leaving those rows out). People on
 * the "Do not email" list and disabled rows are left out automatically.
 */
export function checkRecipients(input: CheckInput): CheckResult {
  const problems: RecipientProblem[] = [];
  const leftOut: CheckResult['leftOut'] = [];

  const missing = input.fields.filter((field) => !input.fieldMap[field.name]);
  for (const field of missing) {
    problems.push({
      id: 'missingColumn',
      // With an "if empty" text the email still reads well, just less personal.
      severity: field.hasFallback ? 'worthALook' : 'mustFix',
      rows: [],
      values: { field: field.name },
    });
  }

  const disabled: number[] = [];
  const doNotEmail: number[] = [];
  const duplicates: number[] = [];
  const noAddress: number[] = [];
  const invalid: number[] = [];
  const firstRowFor = new Map<string, number>();
  const toSend: Recipient[] = [];

  for (const recipient of input.recipients) {
    if (input.skipRows.has(recipient.rowNo)) {
      leftOut.push({ rowNo: recipient.rowNo, reason: 'skipped' });
      continue;
    }
    if (!recipient.enabled) {
      disabled.push(recipient.rowNo);
      leftOut.push({ rowNo: recipient.rowNo, reason: 'disabled' });
      continue;
    }
    if (recipient.to.length > 0 && recipient.to.every((address) => input.doNotEmail.has(address))) {
      doNotEmail.push(recipient.rowNo);
      leftOut.push({ rowNo: recipient.rowNo, reason: 'doNotEmail' });
      continue;
    }
    const key = recipient.to.join(';');
    if (key && firstRowFor.has(key)) {
      duplicates.push(recipient.rowNo);
      if (input.sendDuplicatesOnce) {
        leftOut.push({ rowNo: recipient.rowNo, reason: 'duplicate' });
        continue;
      }
    } else if (key) {
      firstRowFor.set(key, recipient.rowNo);
    }
    if (recipient.invalidAddresses.length > 0) invalid.push(recipient.rowNo);
    else if (recipient.to.length === 0) noAddress.push(recipient.rowNo);
    toSend.push(recipient);
  }

  if (noAddress.length) problems.push({ id: 'noAddress', severity: 'mustFix', rows: noAddress });
  if (invalid.length) problems.push({ id: 'invalidAddress', severity: 'mustFix', rows: invalid });

  if (toSend.length > input.remainingToday) {
    problems.push({
      id: 'overDailyLimit',
      severity: 'mustFix',
      rows: toSend.slice(input.remainingToday).map((recipient) => recipient.rowNo),
      values: { count: toSend.length, remaining: Math.max(0, input.remainingToday) },
    });
  }

  for (const field of input.fields) {
    const column = input.fieldMap[field.name];
    if (!column || field.hasFallback) continue;
    const empty = toSend
      .filter((recipient) => !(recipient.values[field.name] ?? '').trim())
      .map((recipient) => recipient.rowNo);
    if (empty.length) {
      problems.push({
        id: 'emptyDetail',
        severity: 'worthALook',
        rows: empty,
        values: { field: field.name },
      });
    }
  }
  if (duplicates.length) {
    problems.push({
      id: 'duplicate',
      severity: input.sendDuplicatesOnce ? 'info' : 'worthALook',
      rows: duplicates,
    });
  }
  if (doNotEmail.length) problems.push({ id: 'doNotEmail', severity: 'info', rows: doNotEmail });
  if (disabled.length) problems.push({ id: 'disabled', severity: 'info', rows: disabled });
  if (toSend.length > LARGE_SEND) {
    problems.push({
      id: 'largeSend',
      severity: 'worthALook',
      rows: [],
      values: { count: toSend.length },
    });
  }

  return { problems, toSend, leftOut };
}
