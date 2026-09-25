import { renderSubject } from '@postloom/editor';
import { toPlainText } from '@postloom/email';
import { Liquid } from 'liquidjs';

export interface PreparedTemplate {
  /** Compiled email HTML with `{{ row["…"] }}` personal details still to fill in. */
  html: string;
  /** Subject with `{{Detail}}` markers. */
  subject: string;
  /** Used as the subject if it comes out empty. */
  fallbackSubject: string;
}

export interface PersonalEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Fills in each person's details. The template is compiled once per send
 * (MJML is slow); only the Liquid step runs per person. Every value is
 * HTML-escaped, and only a row's own details can be read.
 */
export function createPersonaliser(prepared: PreparedTemplate) {
  const liquid = new Liquid({
    outputEscape: 'escape',
    strictFilters: true,
    ownPropertyOnly: true,
    cache: false,
  });
  const parsed = liquid.parse(prepared.html);
  return async (values: Record<string, string>): Promise<PersonalEmail> => {
    const row = Object.assign(Object.create(null) as Record<string, string>, values);
    const html = (await liquid.render(parsed, { row })) as string;
    return {
      subject: renderSubject(prepared.subject, values) || prepared.fallbackSubject,
      html,
      text: toPlainText(html),
    };
  };
}
