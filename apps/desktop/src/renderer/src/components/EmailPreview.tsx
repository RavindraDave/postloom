import { Paper } from '@mantine/core';

export type PreviewDevice = 'desktop' | 'phone';

const DEVICE_WIDTH: Record<PreviewDevice, number> = { desktop: 680, phone: 375 };

interface EmailPreviewProps {
  html: string;
  device: PreviewDevice;
  title: string;
}

/**
 * Shows compiled email HTML in a fully sandboxed iframe: no scripts, no
 * same-origin access, no forms, no popups (PLAN.md §10.2). Email HTML is
 * untrusted content - it may come from imported or shared templates.
 */
export function EmailPreview({ html, device, title }: EmailPreviewProps) {
  return (
    <Paper
      withBorder
      radius="md"
      style={{ overflow: 'hidden', width: '100%', maxWidth: DEVICE_WIDTH[device] }}
    >
      <iframe
        title={title}
        sandbox=""
        referrerPolicy="no-referrer"
        srcDoc={html}
        style={{ border: 0, width: '100%', height: 560, background: 'white', display: 'block' }}
      />
    </Paper>
  );
}
