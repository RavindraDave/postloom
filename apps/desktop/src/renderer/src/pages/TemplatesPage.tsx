import {
  Alert,
  Button,
  Grid,
  List,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react';
import type { AppErrorShape } from '@postloom/core';
import type { IpcResult, RenderPreviewOutput } from '@postloom/contracts';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmailPreview, type PreviewDevice } from '../components/EmailPreview';

export const SAMPLE_TEMPLATE = `<mjml>
  <mj-body background-color="#f4f5f7">
    <mj-section background-color="#ffffff" padding="24px">
      <mj-column>
        <mj-text font-size="22px" font-weight="700">Hello Asha,</mj-text>
        <mj-text font-size="15px" line-height="1.6">
          Your invoice for September is ready. Thank you for your business!
        </mj-text>
        <mj-button background-color="#4c6ef5" href="https://example.com">View invoice</mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

export function TemplatesPage() {
  const { t } = useTranslation();
  const [source, setSource] = useState(SAMPLE_TEMPLATE);
  const [device, setDevice] = useState<PreviewDevice>('desktop');
  const [preview, setPreview] = useState<RenderPreviewOutput | null>(null);
  const [error, setError] = useState<AppErrorShape | null>(null);
  const [busy, setBusy] = useState(true);

  const applyResult = useCallback((result: IpcResult<RenderPreviewOutput>) => {
    setBusy(false);
    if (result.ok) {
      setPreview(result.data);
      setError(null);
    } else {
      setError(result.error);
    }
  }, []);

  const render = async (mjml: string) => {
    setBusy(true);
    applyResult(await window.postloom.templates.renderPreview({ mjml }));
  };

  useEffect(() => {
    let cancelled = false;
    void window.postloom.templates.renderPreview({ mjml: SAMPLE_TEMPLATE }).then((result) => {
      if (!cancelled) applyResult(result);
    });
    return () => {
      cancelled = true;
    };
  }, [applyResult]);

  return (
    <Stack gap="lg">
      <Title order={1}>{t('templates.title')}</Title>
      <Alert icon={<IconInfoCircle />} variant="light" role="note">
        {t('templates.previewNotice')}
      </Alert>
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <Stack>
            <Textarea
              label={t('templates.sourceLabel')}
              value={source}
              onChange={(event) => setSource(event.currentTarget.value)}
              autosize
              minRows={16}
              maxRows={28}
              styles={{ input: { fontFamily: 'ui-monospace, Menlo, Consolas, monospace' } }}
              spellCheck={false}
            />
            <Button onClick={() => void render(source)} loading={busy} disabled={!source.trim()}>
              {busy ? t('templates.updating') : t('templates.updatePreview')}
            </Button>
            {error && (
              <Alert color="red" icon={<IconAlertTriangle />} role="alert">
                {t(error.messageKey)}
              </Alert>
            )}
            {preview && preview.warnings.length > 0 && (
              <Alert
                color="yellow"
                title={t('templates.warningsTitle')}
                icon={<IconAlertTriangle />}
                role="status"
              >
                <List size="sm">
                  {preview.warnings.map((warning) => (
                    <List.Item key={warning}>{warning}</List.Item>
                  ))}
                </List>
              </Alert>
            )}
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <Stack>
            <Text fw={600}>{t('templates.previewTitle')}</Text>
            <SegmentedControl
              w="fit-content"
              value={device}
              onChange={(value) => setDevice(value)}
              data={[
                { value: 'desktop', label: t('templates.desktop') },
                { value: 'phone', label: t('templates.phone') },
              ]}
            />
            {preview && (
              <EmailPreview
                html={preview.html}
                device={device}
                title={t('templates.previewFrameTitle')}
              />
            )}
          </Stack>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
