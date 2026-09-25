import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createMessageBuilder } from './message';

// A way to collect garbage on demand, so only memory still in use is measured.
setFlagsFromString('--expose-gc');
const collectGarbage = runInNewContext('gc') as () => void;

const heapMb = () => {
  collectGarbage();
  collectGarbage();
  return process.memoryUsage().heapUsed / 1024 / 1024;
};

describe('memory while sending (PLAN.md §15.3)', () => {
  it('building each email keeps nothing: memory stays flat from 1,000 to 5,000 people', async () => {
    const build = createMessageBuilder({
      template: {
        html: `<html><body><p>Dear {{ row["First Name"] }},</p>${'<p>Your invoice is attached.</p>'.repeat(40)}</body></html>`,
        subject: 'Invoice for {{First Name}}',
        fallbackSubject: 'Invoice',
      },
      from: { name: 'Asha', address: 'asha@example.com' },
      inlineImages: [],
    });
    const person = (i: number) =>
      ({
        id: String(i),
        rowNo: i,
        to: [`person${String(i)}@example.com`],
        cc: [],
        bcc: [],
        values: { 'First Name': `Person ${String(i)}` },
        attachments: [],
      }) as unknown as Parameters<typeof build>[0];

    for (let i = 0; i < 1000; i += 1) await build(person(i));
    const after1000 = heapMb();
    for (let i = 1000; i < 5000; i += 1) await build(person(i));
    const after5000 = heapMb();

    expect(after5000 - after1000).toBeLessThan(2);
  }, 60_000);
});
