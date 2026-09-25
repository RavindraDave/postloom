import { Button, Group, Modal, Stack, TextInput } from '@mantine/core';
import { fieldNameSchema, safeHref } from '@postloom/editor';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

type Submit = { preventDefault: () => void };

interface DialogProps<T> {
  opened: boolean;
  onClose: () => void;
  onSave: (value: T) => void;
  initial?: T | undefined;
}

/** Web or email link for the selected words. */
export function LinkDialog({ opened, onClose, onSave, initial }: DialogProps<string>) {
  const { t } = useTranslation();
  return (
    <Modal opened={opened} onClose={onClose} title={t('editor.linkModal.title')} centered>
      {opened && <LinkForm initial={initial} onSave={onSave} />}
    </Modal>
  );
}

function LinkForm({
  initial,
  onSave,
}: {
  initial?: string | undefined;
  onSave: (href: string) => void;
}) {
  const { t } = useTranslation();
  const [href, setHref] = useState(initial ?? '');
  const [submitted, setSubmitted] = useState(false);
  const valid = safeHref(href) !== null;
  const submit = (event: Submit) => {
    event.preventDefault();
    setSubmitted(true);
    if (valid) onSave(href.trim());
  };
  return (
    <form onSubmit={submit} noValidate>
      <Stack gap="md">
        <TextInput
          label={t('editor.linkModal.label')}
          description={t('editor.linkModal.hint')}
          value={href}
          onChange={(event) => {
            setHref(event.currentTarget.value);
          }}
          error={submitted && !valid ? t('editor.linkModal.invalid') : undefined}
          data-autofocus
        />
        <Group justify="flex-end">
          <Button type="submit">{t('editor.linkModal.save')}</Button>
        </Group>
      </Stack>
    </form>
  );
}

export interface ButtonValue {
  label: string;
  href: string;
}

/** Adds or edits a call-to-action button. */
export function ButtonDialog({ opened, onClose, onSave, initial }: DialogProps<ButtonValue>) {
  const { t } = useTranslation();
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={initial ? t('editor.buttonModal.editTitle') : t('editor.buttonModal.title')}
      centered
    >
      {opened && <ButtonForm initial={initial} onSave={onSave} />}
    </Modal>
  );
}

function ButtonForm({
  initial,
  onSave,
}: {
  initial?: ButtonValue | undefined;
  onSave: (value: ButtonValue) => void;
}) {
  const { t } = useTranslation();
  const [label, setLabel] = useState(initial?.label ?? '');
  const [href, setHref] = useState(initial?.href ?? '');
  const [submitted, setSubmitted] = useState(false);
  const labelMissing = label.trim() === '';
  const hrefValid = safeHref(href) !== null;
  const submit = (event: Submit) => {
    event.preventDefault();
    setSubmitted(true);
    if (!labelMissing && hrefValid) onSave({ label: label.trim(), href: href.trim() });
  };
  return (
    <form onSubmit={submit} noValidate>
      <Stack gap="md">
        <TextInput
          label={t('editor.buttonModal.label')}
          value={label}
          maxLength={80}
          onChange={(event) => {
            setLabel(event.currentTarget.value);
          }}
          error={submitted && labelMissing ? t('editor.buttonModal.labelMissing') : undefined}
          data-autofocus
        />
        <TextInput
          label={t('editor.buttonModal.href')}
          description={t('editor.linkModal.hint')}
          value={href}
          onChange={(event) => {
            setHref(event.currentTarget.value);
          }}
          error={submitted && !hrefValid ? t('editor.linkModal.invalid') : undefined}
        />
        <Group justify="flex-end">
          <Button type="submit">
            {initial ? t('editor.buttonModal.saveEdit') : t('editor.buttonModal.save')}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

export interface DetailValue {
  name: string;
  fallback: string;
}

/** Adds a personal detail (a spreadsheet column), or edits its "if empty" text. */
export function DetailDialog({ opened, onClose, onSave, initial }: DialogProps<DetailValue>) {
  const { t } = useTranslation();
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={initial ? t('editor.detailModal.editTitle') : t('editor.detailModal.title')}
      centered
    >
      {opened && <DetailForm initial={initial} onSave={onSave} />}
    </Modal>
  );
}

function DetailForm({
  initial,
  onSave,
}: {
  initial?: DetailValue | undefined;
  onSave: (value: DetailValue) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? '');
  const [fallback, setFallback] = useState(initial?.fallback ?? '');
  const [submitted, setSubmitted] = useState(false);
  const nameValid = fieldNameSchema.safeParse(name).success;
  const fallbackValid = fallback.trim() === '' || fieldNameSchema.safeParse(fallback).success;
  const submit = (event: Submit) => {
    event.preventDefault();
    setSubmitted(true);
    if (nameValid && fallbackValid) onSave({ name: name.trim(), fallback: fallback.trim() });
  };
  return (
    <form onSubmit={submit} noValidate>
      <Stack gap="md">
        <TextInput
          label={t('editor.detailModal.name')}
          description={t('editor.detailModal.nameHint')}
          value={name}
          readOnly={initial !== undefined}
          onChange={(event) => {
            setName(event.currentTarget.value);
          }}
          error={submitted && !nameValid ? t('editor.detailModal.nameInvalid') : undefined}
          data-autofocus={initial === undefined || undefined}
        />
        <TextInput
          label={t('editor.detailModal.fallback')}
          description={t('editor.detailModal.fallbackHint')}
          value={fallback}
          onChange={(event) => {
            setFallback(event.currentTarget.value);
          }}
          error={submitted && !fallbackValid ? t('editor.detailModal.nameInvalid') : undefined}
          data-autofocus={initial !== undefined || undefined}
        />
        <Group justify="flex-end">
          <Button type="submit">
            {initial ? t('editor.detailModal.saveEdit') : t('editor.detailModal.save')}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
