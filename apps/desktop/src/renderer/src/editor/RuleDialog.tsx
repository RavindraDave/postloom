import { Autocomplete, Button, Group, Modal, Select, Stack, TextInput } from '@mantine/core';
import { fieldNameSchema, type ConditionOp } from '@postloom/editor';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface RuleValue {
  field: string;
  op: ConditionOp;
  value: string;
}

interface RuleDialogProps {
  opened: boolean;
  onClose: () => void;
  onSave: (rule: RuleValue) => void;
  fields: string[];
  initial?: RuleValue | undefined;
}

/** "Show this part only to some people": a detail, a test and maybe a value. */
export function RuleDialog({ opened, onClose, onSave, fields, initial }: RuleDialogProps) {
  const { t } = useTranslation();
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={initial ? t('editor.rule.editTitle') : t('editor.rule.title')}
      centered
    >
      {opened && (
        <RuleForm fields={fields} initial={initial} onSave={onSave} isEdit={Boolean(initial)} />
      )}
    </Modal>
  );
}

function RuleForm({
  fields,
  initial,
  onSave,
  isEdit,
}: {
  fields: string[];
  initial?: RuleValue | undefined;
  onSave: (rule: RuleValue) => void;
  isEdit: boolean;
}) {
  const { t } = useTranslation();
  const [field, setField] = useState(initial?.field ?? fields[0] ?? '');
  const [op, setOp] = useState<ConditionOp>(initial?.op ?? 'notEmpty');
  const [value, setValue] = useState(initial?.value ?? '');
  const [submitted, setSubmitted] = useState(false);
  const needsValue = op === 'equals' || op === 'notEquals';
  const fieldValid = fieldNameSchema.safeParse(field).success;
  const valueValid = !needsValue || fieldNameSchema.safeParse(value).success;

  const submit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setSubmitted(true);
    if (fieldValid && valueValid) {
      onSave({ field: field.trim(), op, value: needsValue ? value.trim() : '' });
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <Stack gap="md">
        <Autocomplete
          label={t('editor.rule.field')}
          description={t('editor.rule.fieldHint')}
          data={fields}
          value={field}
          onChange={setField}
          error={submitted && !fieldValid ? t('editor.detailModal.nameInvalid') : undefined}
          data-autofocus
        />
        <Select
          label={t('editor.rule.op')}
          data={[
            { value: 'notEmpty', label: t('editor.rule.opNotEmpty') },
            { value: 'isEmpty', label: t('editor.rule.opIsEmpty') },
            { value: 'equals', label: t('editor.rule.opEquals') },
            { value: 'notEquals', label: t('editor.rule.opNotEquals') },
          ]}
          value={op}
          allowDeselect={false}
          onChange={(next) => {
            if (next) setOp(next);
          }}
        />
        {needsValue && (
          <TextInput
            label={t('editor.rule.value')}
            description={t('editor.rule.valueHint')}
            value={value}
            onChange={(event) => {
              setValue(event.currentTarget.value);
            }}
            error={
              submitted && !valueValid
                ? value.trim()
                  ? t('editor.detailModal.nameInvalid')
                  : t('editor.rule.valueMissing')
                : undefined
            }
          />
        )}
        <Group justify="flex-end">
          <Button type="submit">
            {isEdit ? t('editor.rule.saveEdit') : t('editor.rule.save')}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
