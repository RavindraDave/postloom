import { AppError, DEFAULT_SENDING_SETTINGS } from '@postloom/core';
import type { SendSummary } from '@postloom/contracts';
import type { PauseReason, Repositories, SendRecord } from '@postloom/db';
import { collectAssetIds, lookFromBrand, writeDocumentToMjml } from '@postloom/editor';
import { compileMjml } from '@postloom/email';
import type { Progress, SendJob } from '@postloom/sending';
import { loadSmtpConfig, type AccountDeps } from './accounts';
import { inlineImagesFor, senderBrand } from './brand';
import { readDocument } from './documents';
import type { IpcHandlers } from './ipc-router';
import type { ListService } from './recipients';
import { buildReport } from './report';
import type { RunnerEvents, RunnerResult, SendRunner } from './send-runner';

export interface SendServiceDeps extends Pick<AccountDeps, 'repos' | 'vault' | 'extraCa'> {
  repos: Repositories;
  lists: ListService;
  createRunner: (events: RunnerEvents) => SendRunner;
  /** Shows a notification from the computer (e.g. "Sending finished"). */
  notify?: (title: string, body: string) => void;
  /** Asks where to save a report and saves it; the file name, or null if cancelled. */
  saveReport?: (suggestedName: string, csv: string) => Promise<string | null>;
}

type SendHandlers = Pick<
  IpcHandlers,
  | 'sends:start'
  | 'sends:get'
  | 'sends:list'
  | 'sends:pause'
  | 'sends:resume'
  | 'sends:stop'
  | 'sends:retryFailed'
  | 'sends:resolveUncertain'
  | 'sends:problems'
  | 'sends:exportReport'
>;

/** Sends shown in the recent list. */
const RECENT_SENDS = 50;

const fail = (messageKey: string) => new AppError({ code: 'VALIDATION_FAILED', messageKey });

/**
 * Starts, pauses, resumes and stops sends. The emails themselves go out from
 * the sending process; this side prepares each send, keeps its latest
 * progress for the screen and cleans up if the sending process dies.
 */
export function createSendService(deps: SendServiceDeps) {
  const { repos } = deps;
  const progress = new Map<string, Progress>();
  /** Sends paused because the computer went to sleep, to carry on when it wakes. */
  const sleeping = new Set<string>();

  const runner = deps.createRunner({
    onProgress: (sendId, latest) => {
      progress.set(sendId, latest);
    },
    onDone: (sendId, result) => {
      progress.delete(sendId);
      void finished(sendId, result);
    },
  });

  const finished = async (sendId: string, result: RunnerResult) => {
    if (result.status === 'crashed') await repos.sends.recoverSend(sendId);
    const counts = await repos.sends.counts(sendId);
    if (result.status === 'finished') {
      deps.notify?.(
        'Sending finished',
        counts.failed > 0
          ? `${String(counts.sent)} sent. ${String(counts.failed)} couldn't be sent.`
          : `All ${String(counts.sent)} emails were sent.`,
      );
    }
    if (result.status === 'paused' && result.reason !== 'user' && result.reason !== 'sleep') {
      deps.notify?.('Sending paused', 'Open Postloom to see why and carry on.');
    }
  };

  const nameOf = async (lookup: () => Promise<{ name: string }>) =>
    lookup()
      .then((found) => found.name)
      .catch(() => '');

  const summary = async (send: SendRecord): Promise<SendSummary> => {
    const latest = progress.get(send.id);
    const running = runner.isRunning(send.id);
    const counts = await repos.sends.counts(send.id);
    return {
      id: send.id,
      status: send.status,
      pauseReason: send.pauseReason,
      running,
      templateName: await nameOf(() => repos.templates.get(send.templateId)),
      senderName: await nameOf(() => repos.senders.get(send.senderProfileId)),
      accountName: await nameOf(() => repos.accounts.get(send.emailAccountId)),
      fileName: send.sourceFileName,
      counts,
      current: running ? (latest?.current ?? null) : null,
      etaMs: running
        ? (latest?.etaMs ?? (counts.pending + counts.sending) * send.settings.delayMs)
        : 0,
      createdAt: send.createdAt,
      startedAt: send.startedAt,
      finishedAt: send.finishedAt,
    };
  };
  const summaryOf = async (id: string) => summary(await repos.sends.get(id));

  /** Everything the sending process needs, from the send's saved template version. */
  const prepareJob = async (send: SendRecord): Promise<SendJob> => {
    const version = await repos.templates.version(send.templateVersionId);
    const document = readDocument({ id: version.templateId, document: version.document });
    const sender = await repos.senders.get(send.senderProfileId);
    const account = await repos.accounts.get(send.emailAccountId);
    const look = lookFromBrand(await senderBrand(repos, sender), sender.fromName);
    const { html } = await compileMjml(writeDocumentToMjml(document, look, 'liquid'));
    const assetIds = [...(look.logo ? [look.logo.assetId] : []), ...collectAssetIds(document)];
    return {
      sendId: send.id,
      accountId: account.id,
      smtp: await loadSmtpConfig(account, deps),
      from: { name: sender.fromName, address: sender.fromAddress },
      replyTo: sender.replyTo ?? undefined,
      template: {
        html,
        subject: version.subject,
        fallbackSubject: await nameOf(() => repos.templates.get(send.templateId)),
      },
      inlineImages: await inlineImagesFor(repos, assetIds),
      delayMs: send.settings.delayMs,
      dailyLimit: send.settings.dailyLimit,
    };
  };

  const begin = async (id: string) => {
    const send = await repos.sends.get(id);
    if (runner.isRunning(id) || send.status === 'finished') return;
    const busy = await Promise.all(runner.running().map((other) => repos.sends.get(other)));
    if (busy.some((other) => other.emailAccountId === send.emailAccountId)) {
      throw fail('errors.sendAccountBusy');
    }
    const job = await prepareJob(send);
    await repos.sends.setStatus(id, 'sending');
    runner.start(job);
  };

  const handlers: SendHandlers = {
    'sends:start': async (input) => {
      const checked = await deps.lists.check(input);
      if (checked.problems.some((problem) => problem.severity === 'mustFix')) {
        throw fail('errors.sendHasProblems');
      }
      if (checked.toSend.length === 0) throw fail('errors.sendNobody');
      const { fileName, sha256 } = deps.lists.file(input.token);
      const version = await repos.templates.snapshot(input.templateId, `Sent to ${fileName}`);
      const reasons = new Map(checked.leftOut.map((row) => [row.rowNo, row.reason]));
      const account = checked.account;
      const send = await repos.sends.create({
        templateId: input.templateId,
        templateVersionId: version.id,
        senderProfileId: input.senderId,
        emailAccountId: account.id,
        settings: {
          delayMs:
            checked.sender.delayMs ??
            account.delayMs ??
            DEFAULT_SENDING_SETTINGS.delayBetweenEmailsMs,
          dailyLimit: checked.dailyLimit,
        },
        sourceFileName: fileName,
        sourceFileSha256: sha256,
        mapping: { sheet: input.sheet, columns: input.mapping, fields: input.fieldMap },
        recipients: checked.recipients.map((person) => ({
          rowNo: person.rowNo,
          // A left-out row keeps what was typed, so the report shows which row it was.
          to:
            reasons.has(person.rowNo) && person.to.length === 0
              ? person.invalidAddresses.map((typed) => typed.replace(/[\r\n]+/g, ' '))
              : person.to,
          cc: person.cc,
          bcc: person.bcc,
          values: person.values,
          attachments: (checked.files.get(person.rowNo) ?? []).flatMap((file) =>
            file.path ? [file.path] : [],
          ),
          skipped: reasons.get(person.rowNo),
        })),
      });
      await begin(send.id);
      return summaryOf(send.id);
    },

    'sends:get': ({ id }) => summaryOf(id),

    'sends:list': async () => {
      const sends = (await repos.sends.list()).slice(0, RECENT_SENDS);
      return Promise.all(sends.map(summary));
    },

    'sends:pause': async ({ id }) => {
      runner.pause(id, 'user');
      return summaryOf(id);
    },

    'sends:resume': async ({ id }) => {
      sleeping.delete(id);
      await begin(id);
      return summaryOf(id);
    },

    'sends:stop': async ({ id }) => {
      if (!runner.stop(id)) {
        const send = await repos.sends.get(id);
        if (send.status !== 'finished') await repos.sends.setStatus(id, 'stopped');
      }
      return summaryOf(id);
    },

    'sends:retryFailed': async ({ id }) => {
      await repos.sends.retryFailed(id);
      const send = await repos.sends.get(id);
      // A finished send reopens for the retried people.
      if (send.status === 'finished') await repos.sends.setStatus(id, 'paused', 'user');
      await begin(id);
      return summaryOf(id);
    },

    'sends:resolveUncertain': async ({ id, action }) => {
      await repos.sends.resolveUncertain(id, action);
      const send = await repos.sends.get(id);
      const counts = await repos.sends.counts(id);
      // Nothing left to send once the uncertain ones are skipped: the send is done.
      if (!runner.isRunning(id) && counts.pending === 0 && send.status !== 'finished') {
        await repos.sends.setStatus(id, 'finished');
      }
      return summaryOf(id);
    },

    'sends:exportReport': async ({ id }) => {
      const send = await repos.sends.get(id);
      const template = await nameOf(() => repos.templates.get(send.templateId));
      const day = send.createdAt.slice(0, 10);
      // A file name without characters that aren't allowed in file names.
      const suggested = `${template || 'Send'} ${day}.csv`.replace(/[\\/:*?"<>|]+/g, '-');
      const fileName = await (deps.saveReport ?? (() => Promise.resolve(null)))(
        suggested,
        buildReport(await repos.sends.recipients(id)),
      );
      return { saved: fileName !== null, fileName };
    },

    'sends:problems': async ({ id }) => {
      const people = await repos.sends.recipients(id);
      return people
        .filter(
          (person): person is typeof person & { status: 'failed' | 'uncertain' | 'skipped' } =>
            person.status === 'failed' ||
            person.status === 'uncertain' ||
            person.status === 'skipped',
        )
        .map((person) => ({
          rowNo: person.rowNo,
          to: person.to.join(', '),
          status: person.status,
          errorCode: person.errorCode,
        }));
    },
  };

  return {
    handlers,
    /** Pauses every running send (the computer is going to sleep, or the app is quitting). */
    pauseAll(reason: PauseReason) {
      for (const id of runner.running()) {
        if (reason === 'sleep') sleeping.add(id);
        runner.pause(id, reason);
      }
    },
    /** Carries on with sends paused for sleep. */
    async wake() {
      const ids = [...sleeping];
      sleeping.clear();
      for (const id of ids) await begin(id).catch(() => undefined);
    },
    stopAll() {
      for (const id of runner.running()) runner.stop(id);
    },
    isSending: () => runner.running().length > 0,
  };
}

export type SendService = ReturnType<typeof createSendService>;
