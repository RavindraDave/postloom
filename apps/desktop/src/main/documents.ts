import { AppError, type Template } from '@postloom/core';
import { writeDocumentSchema, type WriteDocument } from '@postloom/editor';

/** Stored documents are re-validated before use: the database is not trusted blindly. */
export function readDocument(template: Template): WriteDocument {
  const parsed = writeDocumentSchema.safeParse(template.document);
  if (!parsed.success) {
    throw new AppError({
      code: 'TEMPLATE_INVALID',
      messageKey: 'errors.templateInvalid',
      details: { templateId: template.id },
    });
  }
  return parsed.data;
}
