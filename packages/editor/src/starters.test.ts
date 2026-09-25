import { compileMjml } from '@postloom/email';
import { describe, expect, it } from 'vitest';
import { writeDocumentSchema } from './document';
import { STARTER_GALLERY } from './starters';
import { writeDocumentToMjml } from './to-mjml';

describe('starter gallery', () => {
  it('has the eight starters from the plan, each with a unique id', () => {
    expect(STARTER_GALLERY.map((starter) => starter.id)).toEqual([
      'plainLetter',
      'paymentReminder',
      'invoice',
      'thankYou',
      'welcome',
      'announcement',
      'newsletter',
      'eventInvite',
    ]);
  });

  it.each(STARTER_GALLERY.map((starter) => [starter.name, starter] as const))(
    '%s is valid and compiles without warnings',
    async (_name, starter) => {
      expect(writeDocumentSchema.parse(starter.document)).toEqual(starter.document);
      expect(starter.subject.length).toBeLessThanOrEqual(78);
      const { warnings, html } = await compileMjml(writeDocumentToMjml(starter.document));
      expect(warnings).toEqual([]);
      expect(html.length).toBeLessThan(102_000);
    },
  );
});
