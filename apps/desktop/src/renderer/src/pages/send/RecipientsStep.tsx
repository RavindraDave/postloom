import {
  Alert,
  Button,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import type { ColumnMappingInfo, IpcOutput } from '@postloom/contracts';
import { IconAlertTriangle, IconFileSpreadsheet } from '@tabler/icons-react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { errorKey } from '../../api/ipc';
import { usePickList } from '../../api/queries';
import { EmptyState } from '../../components/EmptyState';
import classes from './SendPage.module.css';

export type PickedList = NonNullable<IpcOutput<'recipients:pick'>>;
export type InspectedList = IpcOutput<'recipients:inspect'>;

interface RecipientsStepProps {
  list: PickedList | null;
  sheet: string;
  inspected: UseQueryResult<InspectedList>;
  mapping: ColumnMappingInfo | null;
  onPicked: (list: PickedList) => void;
  onSheet: (sheet: string) => void;
  onMapping: (mapping: ColumnMappingInfo) => void;
}

const MAPPING_KEYS = ['to', 'cc', 'bcc', 'enabled'] as const;

/** Step 1: pick the spreadsheet, the sheet and the address columns. */
export function RecipientsStep({
  list,
  sheet,
  inspected,
  mapping,
  onPicked,
  onSheet,
  onMapping,
}: RecipientsStepProps) {
  const { t } = useTranslation();
  const pick = usePickList();

  const choose = (label: string, variant: 'filled' | 'default') => (
    <Button
      variant={variant}
      size={variant === 'filled' ? 'md' : 'sm'}
      leftSection={<IconFileSpreadsheet size={18} />}
      loading={pick.isPending}
      onClick={() => {
        pick.mutate(undefined, {
          onSuccess: (picked) => {
            if (picked) onPicked(picked);
          },
        });
      }}
    >
      {label}
    </Button>
  );

  const error = pick.error ?? inspected.error;
  const alert = error && (
    <Alert color="red" icon={<IconAlertTriangle />} role="alert">
      {t(errorKey(error))}
    </Alert>
  );

  if (!list) {
    return (
      <Stack gap="md">
        {alert}
        <EmptyState
          title={t('send.list.emptyTitle')}
          description={t('send.list.emptyBody')}
          action={choose(t('send.list.choose'), 'filled')}
        />
      </Stack>
    );
  }

  const data = inspected.data;
  const headers = data?.headers ?? [];
  const toColumn = mapping?.to ? headers.indexOf(mapping.to) : -1;

  return (
    <Stack gap="lg">
      {alert}
      <Paper withBorder radius="lg" p="lg">
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Group gap="xs">
              <IconFileSpreadsheet size={20} aria-hidden />
              <Text fw={700}>{list.fileName}</Text>
            </Group>
            {data && (
              <Text c="var(--pl-ink-soft)">{t('send.list.people', { count: data.rowCount })}</Text>
            )}
          </Stack>
          {choose(t('send.list.chooseAnother'), 'default')}
        </Group>
        {list.sheets.length > 1 && (
          <Select
            mt="md"
            maw={360}
            label={t('send.list.sheet')}
            allowDeselect={false}
            value={sheet}
            data={list.sheets.map((option) => ({
              value: option.name,
              label: t('send.list.sheetRows', { name: option.name, count: option.rowCount }),
            }))}
            onChange={(value) => {
              if (value) onSheet(value);
            }}
          />
        )}
      </Paper>

      {inspected.isPending && (
        <Group gap="sm">
          <Loader size="sm" />
          <Text>{t('send.list.reading')}</Text>
        </Group>
      )}

      {data && mapping && (
        <>
          <Stack gap="sm">
            <Title order={2} size="h3">
              {t('send.list.columnsTitle')}
            </Title>
            <div className={classes.mappingGrid}>
              {MAPPING_KEYS.map((key) => (
                <Select
                  key={key}
                  label={t(`send.list.${key}`)}
                  description={
                    key === 'to'
                      ? t('send.list.toHint')
                      : key === 'enabled'
                        ? t('send.list.enabledHint')
                        : undefined
                  }
                  placeholder={t('send.list.none')}
                  clearable={key !== 'to'}
                  allowDeselect={key !== 'to'}
                  withAsterisk={key === 'to'}
                  value={mapping[key]}
                  data={headers}
                  onChange={(value) => {
                    onMapping({ ...mapping, [key]: value });
                  }}
                />
              ))}
            </div>
            {!mapping.to && (
              <Text size="sm" c="var(--pl-muted)">
                {t('send.list.chooseTo')}
              </Text>
            )}
          </Stack>

          <Stack gap="xs">
            <Title order={2} size="h3">
              {t('send.list.sampleTitle')}
            </Title>
            <Table.ScrollContainer minWidth={Math.max(480, headers.length * 140)}>
              <Table striped withTableBorder aria-label={t('send.list.sampleTitle')}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t('send.list.row')}</Table.Th>
                    {headers.map((header, index) => (
                      <Table.Th key={header} data-highlight={index === toColumn || undefined}>
                        {header}
                      </Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.sample.map((row) => (
                    <Table.Tr key={row.rowNo}>
                      <Table.Td c="var(--pl-muted)">{row.rowNo}</Table.Td>
                      {headers.map((header, index) => (
                        <Table.Td key={header} data-highlight={index === toColumn || undefined}>
                          {row.cells[index] ?? ''}
                        </Table.Td>
                      ))}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            {data.rowCount > data.sample.length && (
              <Text size="sm" c="var(--pl-muted)">
                {t('send.list.sampleMore', { shown: data.sample.length, count: data.rowCount })}
              </Text>
            )}
          </Stack>
        </>
      )}
    </Stack>
  );
}
