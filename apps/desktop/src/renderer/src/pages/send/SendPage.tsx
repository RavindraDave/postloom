import { Button, Group, Stack } from '@mantine/core';
import type { ColumnMappingInfo, FieldMapInfo } from '@postloom/contracts';
import { IconArrowLeft, IconArrowRight } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { useInspectList, useSenders, useTemplate } from '../../api/queries';
import { PageHeader } from '../../components/PageHeader';
import { WizardSteps } from '../../components/WizardSteps';
import { CheckStep } from './CheckStep';
import { ConfirmStep } from './ConfirmStep';
import { RecipientsStep, type PickedList } from './RecipientsStep';
import { TemplateStep } from './TemplateStep';

const STEPS = ['recipients', 'template', 'check', 'send'] as const;
type Step = (typeof STEPS)[number];

/**
 * The send wizard (PLAN.md §5.3): who to send to → template and sender →
 * check everyone → send. The list itself stays in the main process; this
 * screen holds only the choices.
 */
export function SendPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<Step>('recipients');
  const [list, setList] = useState<PickedList | null>(null);
  const [sheet, setSheet] = useState('');
  // Null until the person changes something: until then the main process's guess is used.
  const [mapping, setMapping] = useState<ColumnMappingInfo | null>(null);
  const [fieldMap, setFieldMap] = useState<FieldMapInfo | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(searchParams.get('template'));
  const [chosenSenderId, setChosenSenderId] = useState<string | null>(null);
  const [skipRows, setSkipRows] = useState<number[]>([]);
  const [sendDuplicatesOnce, setSendDuplicatesOnce] = useState(false);
  const [tested, setTested] = useState(false);

  const ref = list ? { token: list.token, sheet } : null;
  const addresses = useInspectList(ref);
  const details = useInspectList(ref && templateId ? { ...ref, templateId } : null);
  const template = useTemplate(templateId);
  const senders = useSenders();

  const effectiveMapping = mapping ?? addresses.data?.mapping ?? null;
  const effectiveFieldMap = fieldMap ?? details.data?.fieldMap ?? null;
  const senderList = senders.data ?? [];
  const senderId =
    [chosenSenderId, template.data?.defaultSenderProfileId, senderList[0]?.id].find(
      (id) => id && senderList.some((sender) => sender.id === id),
    ) ?? null;

  const choices =
    list && effectiveMapping && effectiveFieldMap && templateId
      ? {
          token: list.token,
          sheet,
          templateId,
          mapping: effectiveMapping,
          fieldMap: effectiveFieldMap,
        }
      : null;

  const current = STEPS.indexOf(step);
  const canContinue =
    step === 'recipients'
      ? Boolean(effectiveMapping?.to)
      : step === 'template'
        ? Boolean(choices && senderId)
        : false;

  const resetList = (next: PickedList | null, nextSheet: string) => {
    setList(next);
    setSheet(nextSheet);
    setMapping(null);
    setFieldMap(null);
    setSkipRows([]);
    setTested(false);
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('send.title')} description={t('send.intro')} />
      <WizardSteps
        label={t('send.stepsLabel')}
        steps={STEPS.map((id) => t(`send.steps.${id}`))}
        current={current}
        orientation="horizontal"
      />

      {step === 'recipients' && (
        <RecipientsStep
          list={list}
          sheet={sheet}
          inspected={addresses}
          mapping={effectiveMapping}
          onPicked={(picked) => {
            resetList(picked, picked.sheets[0]?.name ?? '');
          }}
          onSheet={(name) => {
            if (list) resetList(list, name);
          }}
          onMapping={(next) => {
            setMapping(next);
            setTested(false);
          }}
        />
      )}

      {step === 'template' && (
        <TemplateStep
          templateId={templateId}
          senderId={senderId}
          senders={senderList}
          template={template.data}
          headers={addresses.data?.headers ?? []}
          inspected={details}
          fieldMap={effectiveFieldMap}
          onTemplate={(id) => {
            setTemplateId(id);
            setFieldMap(null);
            setTested(false);
          }}
          onSender={(id) => {
            setChosenSenderId(id);
            setTested(false);
          }}
          onFieldMap={(next) => {
            setFieldMap(next);
            setTested(false);
          }}
        />
      )}

      {step === 'check' && choices && senderId && template.data && (
        <CheckStep
          choices={choices}
          senderId={senderId}
          template={template.data}
          senders={senderList}
          skipRows={skipRows}
          sendDuplicatesOnce={sendDuplicatesOnce}
          tested={tested}
          onSkipRows={setSkipRows}
          onSendDuplicatesOnce={setSendDuplicatesOnce}
          onTested={() => {
            setTested(true);
          }}
          onMatchColumns={() => {
            setStep('template');
          }}
          onContinue={() => {
            setStep('send');
          }}
        />
      )}

      {step === 'send' && choices && senderId && (
        <ConfirmStep
          check={{ ...choices, senderId, skipRows, sendDuplicatesOnce }}
          senderId={senderId}
          senders={senderList}
        />
      )}

      <Group justify="space-between">
        {current > 0 ? (
          <Button
            variant="default"
            leftSection={<IconArrowLeft size={16} />}
            onClick={() => {
              setStep(STEPS[current - 1] ?? 'recipients');
            }}
          >
            {t('send.back')}
          </Button>
        ) : (
          <span />
        )}
        {(step === 'recipients' || step === 'template') && (
          <Button
            size="md"
            rightSection={<IconArrowRight size={16} />}
            disabled={!canContinue}
            onClick={() => {
              setStep(STEPS[current + 1] ?? 'check');
            }}
          >
            {t('send.next')}
          </Button>
        )}
      </Group>
    </Stack>
  );
}
