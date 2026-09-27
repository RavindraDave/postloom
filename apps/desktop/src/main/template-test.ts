import {
  emailAssetIds,
  lookFromBrand,
  renderSubject,
  signatureFromStored,
  writeDocumentToMjml,
} from '@postloom/editor';
import { compileMjml } from '@postloom/email';
import { loadSmtpConfig, type AccountDeps } from './accounts';
import { inlineImagesFor, senderBrand } from './brand';
import { readDocument } from './documents';
import type { IpcHandlers } from './ipc-router';

/** Marks test emails so they're never mistaken for the real thing. */
export const TEST_SUBJECT_PREFIX = '[Test] ';

/**
 * "Send me a test": sends the template as it is now, from the chosen sender
 * and in its brand look, with pictures travelling inside the email. Personal
 * details show as "[First Name]" placeholders, or as one person's real
 * details when they're given (from the list, while checking a send).
 */
export function createTemplateTestHandler({
  repos,
  vault,
  extraCa,
  send,
}: Pick<AccountDeps, 'repos' | 'vault' | 'extraCa'> & {
  send: NonNullable<AccountDeps['smtp']>['send'];
}): Pick<IpcHandlers, 'templates:sendTest'> {
  return {
    'templates:sendTest': async ({ id, senderId, to, values }) => {
      const template = await repos.templates.get(id);
      const document = readDocument(template);
      const sender = await repos.senders.get(senderId);
      const account = await repos.accounts.get(sender.emailAccountId);
      const recipient = to ?? account.username;

      const brand = await senderBrand(repos, sender);
      const look = lookFromBrand(brand, sender.fromName, signatureFromStored(sender.signature));
      const { html, text } = await compileMjml(
        writeDocumentToMjml(document, look, values ? { values } : 'placeholder'),
      );
      const assetIds = emailAssetIds(document, look);
      await send(await loadSmtpConfig(account, { repos, vault, extraCa }), {
        from: { name: sender.fromName, address: sender.fromAddress },
        replyTo: sender.replyTo ?? undefined,
        to: [recipient],
        subject: `${TEST_SUBJECT_PREFIX}${renderSubject(template.subject, values, document.attrs?.detailFormats) || template.name}`,
        html,
        text,
        inlineImages: await inlineImagesFor(repos, assetIds),
      });
      return { sentTo: recipient };
    },
  };
}
