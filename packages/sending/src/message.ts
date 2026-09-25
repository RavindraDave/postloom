import type { SendRecipient } from '@postloom/db';
import type { InlineImage, OutgoingEmail } from '@postloom/email';
import { createPersonaliser, type PreparedTemplate } from './personalise';

export interface MessageParts {
  template: PreparedTemplate;
  from: { name: string; address: string };
  replyTo?: string | undefined;
  inlineImages: InlineImage[];
}

/** Builds each person's email: their details, their addresses, the shared pictures. */
export function createMessageBuilder(parts: MessageParts) {
  const personalise = createPersonaliser(parts.template);
  return async (person: SendRecipient): Promise<OutgoingEmail> => {
    const { subject, html, text } = await personalise(person.values);
    return {
      from: parts.from,
      to: person.to,
      cc: person.cc,
      bcc: person.bcc,
      replyTo: parts.replyTo,
      subject,
      html,
      text,
      inlineImages: parts.inlineImages,
    };
  };
}
