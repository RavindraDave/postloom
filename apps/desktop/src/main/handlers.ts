import { AppError, type Template } from '@postloom/core';
import {
  DEFAULT_PREFERENCES,
  preferencesSchema,
  type AppInfo,
  type Preferences,
  type TemplateDetail,
  type TemplateSummary,
} from '@postloom/contracts';
import type { Repositories } from '@postloom/db';
import { collectFields, writeDocumentSchema, type WriteDocument } from '@postloom/editor';
import { compileMjml } from '@postloom/email';
import type { IpcHandlers } from './ipc-router';

const PREFERENCES_KEY = 'preferences';
const WRITE_DOCUMENT_VERSION = 1;

/** A blank letter for "Write a new letter". */
export const BLANK_LETTER: WriteDocument = { type: 'doc', content: [{ type: 'paragraph' }] };

export interface HandlerDeps {
  appInfo: AppInfo;
  repos: Repositories;
}

export function createHandlers({ appInfo, repos }: HandlerDeps): IpcHandlers {
  const loadPreferences = async (): Promise<Preferences> => {
    const stored = await repos.settings.get<unknown>(PREFERENCES_KEY, {});
    // Merge over defaults and drop anything invalid (e.g. from an older version).
    const merged = preferencesSchema.safeParse({ ...DEFAULT_PREFERENCES, ...(stored as object) });
    return merged.success ? merged.data : DEFAULT_PREFERENCES;
  };

  return {
    'app:getInfo': () => Promise.resolve(appInfo),

    'settings:get': loadPreferences,
    'settings:update': async (changes) => {
      const next = preferencesSchema.parse({ ...(await loadPreferences()), ...changes });
      await repos.settings.set(PREFERENCES_KEY, next);
      return next;
    },

    'templates:renderPreview': async ({ mjml }) => compileMjml(mjml),

    'templates:list': async () => (await repos.templates.list()).map(toSummary),
    'templates:get': async ({ id }) => toDetail(await repos.templates.get(id)),
    'templates:create': async ({ name, subject, category, document }) =>
      toDetail(
        await repos.templates.create({
          name,
          subject,
          category: category ?? null,
          editorMode: 'write',
          document: document ?? BLANK_LETTER,
          documentVersion: WRITE_DOCUMENT_VERSION,
          defaultSenderProfileId: null,
        }),
      ),
    'templates:save': async ({ id, name, subject, document, snapshot }) =>
      toDetail(
        await repos.templates.update(
          id,
          {
            ...(name !== undefined && { name }),
            ...(subject !== undefined && { subject }),
            ...(document !== undefined && { document }),
          },
          { snapshot: snapshot ?? false },
        ),
      ),
    'templates:delete': async ({ id }) => {
      await repos.templates.softDelete(id);
      return { ok: true as const };
    },
    'templates:restore': async ({ id }) => {
      await repos.templates.restore(id);
      return { ok: true as const };
    },
    'templates:versions': async ({ id }) =>
      (await repos.templates.versions(id)).map((v) => ({
        versionNo: v.versionNo,
        subject: v.subject,
        note: v.note,
        createdAt: v.createdAt,
      })),
    'templates:restoreVersion': async ({ id, versionNo }) =>
      toDetail(await repos.templates.restoreVersion(id, versionNo)),
  };
}

/** Stored documents are re-validated before use: the database is not trusted blindly. */
function readDocument(template: Template): WriteDocument {
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

function toSummary(template: Template): TemplateSummary {
  const document = writeDocumentSchema.safeParse(template.document);
  return {
    id: template.id,
    name: template.name,
    category: template.category,
    subject: template.subject,
    editorMode: template.editorMode,
    fields: document.success ? collectFields(document.data) : [],
    updatedAt: template.updatedAt,
  };
}

function toDetail(template: Template): TemplateDetail {
  const document = readDocument(template);
  return {
    ...toSummary(template),
    document,
    defaultSenderProfileId: template.defaultSenderProfileId,
  };
}
