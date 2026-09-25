import type { Template } from '@postloom/core';
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
import { compileMjml, sendEmail } from '@postloom/email';
import { createAccountHandlers, type AccountDeps } from './accounts';
import { createAssetHandlers, type AssetDeps } from './assets';
import { readDocument } from './documents';
import { createTemplateTestHandler } from './template-test';
import type { IpcHandlers } from './ipc-router';

const PREFERENCES_KEY = 'preferences';
const WRITE_DOCUMENT_VERSION = 1;

/** A blank letter for "Write a new letter". */
export const BLANK_LETTER: WriteDocument = { type: 'doc', content: [{ type: 'paragraph' }] };

export interface HandlerDeps extends Omit<AccountDeps, 'repos'>, Partial<Omit<AssetDeps, 'repos'>> {
  appInfo: AppInfo;
  repos: Repositories;
}

/** Without a real file picker (tests), picking a picture just cancels. */
const noPicker: Omit<AssetDeps, 'repos'> = {
  codec: { decode: () => null },
  pickImageFile: () => Promise.resolve(null),
};

export function createHandlers({
  appInfo,
  repos,
  codec,
  pickImageFile,
  ...accountDeps
}: HandlerDeps): IpcHandlers {
  const loadPreferences = async (): Promise<Preferences> => {
    const stored = await repos.settings.get<unknown>(PREFERENCES_KEY, {});
    // Merge over defaults and drop anything invalid (e.g. from an older version).
    const merged = preferencesSchema.safeParse({ ...DEFAULT_PREFERENCES, ...(stored as object) });
    return merged.success ? merged.data : DEFAULT_PREFERENCES;
  };

  return {
    ...createAccountHandlers({ repos, ...accountDeps }),
    ...createAssetHandlers({
      repos,
      codec: codec ?? noPicker.codec,
      pickImageFile: pickImageFile ?? noPicker.pickImageFile,
    }),
    ...createTemplateTestHandler({
      repos,
      vault: accountDeps.vault,
      extraCa: accountDeps.extraCa,
      send: accountDeps.smtp?.send ?? sendEmail,
    }),

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
    'templates:save': async ({ id, name, subject, document, defaultSenderProfileId, snapshot }) =>
      toDetail(
        await repos.templates.update(
          id,
          {
            ...(name !== undefined && { name }),
            ...(subject !== undefined && { subject }),
            ...(document !== undefined && { document }),
            ...(defaultSenderProfileId !== undefined && { defaultSenderProfileId }),
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
