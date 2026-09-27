import { describe, expect, it } from 'vitest';
import { compileMjml, toPlainText } from './compile';

const simpleTemplate = `
<mjml>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-text>Hello Asha,</mj-text>
        <mj-button href="https://example.com/pay">Pay invoice</mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

describe('compileMjml', () => {
  it('produces table-based HTML and a plain-text version', async () => {
    const result = await compileMjml(simpleTemplate);

    expect(result.html).toContain('<table');
    expect(result.html).toContain('Hello Asha,');
    expect(result.text).toContain('Hello Asha,');
    expect(result.text).toContain('Pay invoice');
    expect(result.warnings).toEqual([]);
  });

  it('reports validation problems as warnings instead of failing', async () => {
    const result = await compileMjml(
      '<mjml><mj-body><mj-section><mj-column><mj-text unknown-attr="x">Hi</mj-text></mj-column></mj-section></mj-body></mjml>',
    );

    expect(result.html).toContain('Hi');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('does not read files through mj-include', async () => {
    const result = await compileMjml(
      '<mjml><mj-body><mj-include path="/etc/passwd" /><mj-section><mj-column><mj-text>Body</mj-text></mj-column></mj-section></mj-body></mjml>',
    );

    expect(result.html).toContain('Body');
    expect(result.html).not.toContain('root:');
  });
});

describe('toPlainText', () => {
  it('drops images and keeps link text readable', () => {
    const text = toPlainText(
      '<p>Hi <img src="logo.png" alt="Logo"> <a href="https://example.com">https://example.com</a></p>',
    );

    expect(text).toBe('Hi https://example.com');
  });

  it('leaves out the hidden inbox preview line', () => {
    const text = toPlainText(
      '<div style="display:none;font-size:1px">Preview line</div><p>Dear Asha,</p>',
    );

    expect(text).toBe('Dear Asha,');
  });
});
