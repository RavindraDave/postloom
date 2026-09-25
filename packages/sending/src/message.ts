import type { SendRecipient } from '@postloom/db';
import type { FileAttachment, InlineImage, OutgoingEmail } from '@postloom/email';
import { readAttachments } from './attachments';
import { createPersonaliser, type PreparedTemplate } from './personalise';

export interface MessageParts {
  template: PreparedTemplate;
  from: { name: string; address: string };
  replyTo?: string | undefined;
  inlineImages: InlineImage[];
  /** Reads a person's attachments (tests fake it). */
  readFiles?: (paths: string[]) => Promise<FileAttachment[]>;
}

/** Builds each person's email: their details, their addresses, the shared pictures. */
export function createMessageBuilder(parts: MessageParts) {
  const personalise = createPersonaliser(parts.template);
  const readFiles = parts.readFiles ?? readAttachments;
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
      attachments: person.attachments.length ? await readFiles(person.attachments) : [],
    };
  };
}
