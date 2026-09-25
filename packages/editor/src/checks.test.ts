import { describe, expect, it } from 'vitest';
import { checkTemplate, GMAIL_CLIP_BYTES } from './checks';
import type { WriteDocument } from './document';
import { STARTER_GALLERY } from './starters';

const letter = (content: WriteDocument['content']): WriteDocument => ({ type: 'doc', content });
const hello = letter([{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }]);

describe('template checklist', () => {
  it('is happy with a finished letter', () => {
    expect(checkTemplate({ subject: 'Hello', document: hello, htmlBytes: 2_000 })).toEqual([]);
  });

  it('needs a subject and some words', () => {
    const ids = checkTemplate({ subject: '  ', document: letter([{ type: 'paragraph' }]) }).map(
      (problem) => problem.id,
    );
    expect(ids).toEqual(['subjectMissing', 'letterEmpty']);
  });

  it('warns when the subject will be cut off', () => {
    const [problem] = checkTemplate({ subject: 'x'.repeat(90), document: hello });
    expect(problem).toEqual({
      id: 'subjectLong',
      severity: 'worthALook',
      values: { count: 90, limit: 78 },
    });
  });

  it('flags button links that are broken or still the example', () => {
    const problems = checkTemplate({
      subject: 'Hi',
      document: letter([
        { type: 'button', attrs: { label: 'Pay now', href: 'https://example.com/pay' } },
        { type: 'button', attrs: { label: 'Open', href: 'javascript:alert(1)' } },
        { type: 'button', attrs: { label: 'Mail us', href: 'mailto:events@example.com' } },
      ]),
    });
    expect(problems).toEqual([
      { id: 'buttonLinkExample', severity: 'mustFix', values: { label: 'Pay now' } },
      { id: 'buttonLinkInvalid', severity: 'mustFix', values: { label: 'Open' } },
    ]);
  });

  it('flags text links that go nowhere, including inside lists', () => {
    const problems = checkTemplate({
      subject: 'Hi',
      document: letter([
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'our site',
                      marks: [{ type: 'link', attrs: { href: 'nope' } }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ]),
    });
    expect(problems).toEqual([
      { id: 'linkInvalid', severity: 'mustFix', values: { text: 'our site' } },
    ]);
  });

  it('warns before Gmail would clip the email', () => {
    const [problem] = checkTemplate({
      subject: 'Hi',
      document: hello,
      htmlBytes: GMAIL_CLIP_BYTES + 5_000,
    });
    expect(problem?.id).toBe('tooLarge');
  });

  it('asks people to replace the example links in starters that have them', () => {
    const invoice = STARTER_GALLERY.find((starter) => starter.id === 'invoice');
    const ids = checkTemplate({
      subject: invoice?.subject ?? '',
      document: invoice?.document ?? hello,
    }).map((problem) => problem.id);
    expect(ids).toEqual(['buttonLinkExample']);
  });
});
