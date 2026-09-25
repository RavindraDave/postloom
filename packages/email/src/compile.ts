import { AppError } from '@postloom/core';
import { convert } from 'html-to-text';
import type mjml2html from 'mjml';

export interface CompiledEmail {
  html: string;
  /** Plain-text alternative, sent alongside the HTML part. */
  text: string;
  /** Non-fatal MJML validation messages, e.g. unknown attributes. */
  warnings: string[];
}

// MJML takes over half a second to load, so it loads when first needed, not at start-up.
let loading: Promise<typeof mjml2html> | null = null;
const loadMjml = () => (loading ??= import('mjml').then((module) => module.default));

/** Loads MJML in the background, so the first preview doesn't wait for it. */
export function preloadMjml(): void {
  void loadMjml();
}

/**
 * Compiles MJML into email-client-safe HTML plus a plain-text version.
 *
 * `mj-include` is disabled: it reads arbitrary files from disk, and template
 * sources are untrusted input (imported or shared templates).
 */
export async function compileMjml(source: string): Promise<CompiledEmail> {
  const compile = await loadMjml();
  let result: Awaited<ReturnType<typeof mjml2html>>;
  try {
    result = await compile(source, {
      validationLevel: 'soft',
      ignoreIncludes: true,
      keepComments: false,
    });
  } catch (error) {
    throw new AppError(
      { code: 'TEMPLATE_INVALID', messageKey: 'errors.templateInvalid' },
      { cause: error },
    );
  }

  return {
    html: result.html,
    text: toPlainText(result.html),
    warnings: result.errors.map((error) => error.formattedMessage),
  };
}

export function toPlainText(html: string): string {
  return convert(html, {
    wordwrap: 78,
    selectors: [
      { selector: 'img', format: 'skip' },
      { selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
    ],
  }).trim();
}
