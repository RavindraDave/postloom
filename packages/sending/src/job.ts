import type { Repositories } from '@postloom/db';
import type { InlineImage, Mailer, SmtpAccountConfig } from '@postloom/email';
import type { SendControl } from './control';
import { runSend, type Outcome, type Progress } from './engine';
import { createMessageBuilder } from './message';
import type { PreparedTemplate } from './personalise';
import { createEngineStore } from './store';

/**
 * Everything a send needs, prepared by the main process. It crosses into the
 * sending process as plain data (the password never leaves the app's own
 * processes and is never written anywhere).
 */
export interface SendJob {
  sendId: string;
  accountId: string;
  smtp: SmtpAccountConfig;
  from: { name: string; address: string };
  replyTo?: string | undefined;
  template: PreparedTemplate;
  inlineImages: InlineImage[];
  delayMs: number;
  dailyLimit: number;
}

export interface JobPorts {
  repos: Repositories;
  openMailer: (config: SmtpAccountConfig) => Mailer;
  control: SendControl;
  onProgress: (progress: Progress) => void;
  today?: () => string;
}

/** Runs one send until it finishes, pauses or stops. */
export async function runJob(job: SendJob, ports: JobPorts): Promise<Outcome> {
  const mailer = ports.openMailer(job.smtp);
  try {
    return await runSend({
      store: createEngineStore(ports.repos, job.sendId, job.accountId, ports.today),
      send: (email) => mailer.send(email),
      build: createMessageBuilder({
        template: job.template,
        from: job.from,
        replyTo: job.replyTo,
        inlineImages: job.inlineImages,
      }),
      delayMs: job.delayMs,
      dailyLimit: job.dailyLimit,
      requested: ports.control.requested,
      sleep: (ms) => ports.control.sleep(ms),
      onProgress: ports.onProgress,
    });
  } finally {
    mailer.close();
  }
}
