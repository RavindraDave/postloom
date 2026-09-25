import {
  collectAssetIds,
  lookFromBrand,
  renderSubject,
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
 * and in its brand look, with personal details shown as "[First Name]"
 * placeholders and pictures travelling inside the email.
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
    'templates:sendTest': async ({ id, senderId, to }) => {
      const template = await repos.templates.get(id);
      const document = readDocument(template);
      const sender = await repos.senders.get(senderId);
      const account = await repos.accounts.get(sender.emailAccountId);
      const recipient = to ?? account.username;

      const brand = await senderBrand(repos, sender);
      const look = lookFromBrand(brand, sender.fromName);
      const { html, text } = await compileMjml(writeDocumentToMjml(document, look, 'placeholder'));
      const assetIds = [...(look.logo ? [look.logo.assetId] : []), ...collectAssetIds(document)];
      await send(await loadSmtpConfig(account, { repos, vault, extraCa }), {
        from: { name: sender.fromName, address: sender.fromAddress },
        replyTo: sender.replyTo ?? undefined,
        to: [recipient],
        subject: `${TEST_SUBJECT_PREFIX}${renderSubject(template.subject) || template.name}`,
        html,
        text,
        inlineImages: await inlineImagesFor(repos, assetIds),
      });
      return { sentTo: recipient };
    },
  };
}
