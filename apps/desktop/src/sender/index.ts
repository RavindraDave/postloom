import { createRepositories, openDatabase } from '@postloom/db';
import { openMailer } from '@postloom/email';
import { createControl, runJob, type Outcome } from '@postloom/sending';
import type { FromSender, ToSender } from '../main/send-runner';

/**
 * The sending process (an Electron utility process): runs one send and
 * reports progress. It opens the same database as the app (WAL mode lets
 * both write safely) and exits when the send finishes, pauses or stops.
 */
const port = process.parentPort;
const control = createControl();

// If the app itself dies (a crash, or Windows ending it without its children),
// this process must not carry on sending on its own: exit at once. Anyone
// mid-send is then marked "uncertain" when the app starts again.
const appPid = process.ppid;
setInterval(() => {
  try {
    process.kill(appPid, 0);
  } catch {
    process.exit(2);
  }
}, 1_000).unref();
const post = (message: FromSender) => {
  port.postMessage(message);
};

port.on('message', (event: { data: ToSender }) => {
  const message = event.data;
  if (message.type === 'pause') control.pause(message.reason);
  if (message.type === 'stop') control.stop();
  if (message.type === 'start') void run(message.job, message.dbFile);
});

async function run(job: Extract<ToSender, { type: 'start' }>['job'], dbFile: string) {
  try {
    const opened = await openDatabase({ file: dbFile });
    let outcome: Outcome;
    try {
      outcome = await runJob(job, {
        repos: createRepositories(opened.db),
        openMailer,
        control,
        onProgress: (progress) => {
          post({ type: 'progress', progress });
        },
      });
    } finally {
      await opened.close();
    }
    post({ type: 'done', outcome });
    // Give the message a moment to leave before exiting.
    setTimeout(() => process.exit(0), 50);
  } catch {
    // The app sees the exit, marks anyone mid-send as uncertain and pauses the send.
    process.exit(1);
  }
}
