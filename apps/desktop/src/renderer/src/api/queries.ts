import type {
  CreateAccountInput,
  CreateSenderInput,
  CreateTemplateInput,
  TestConnectionInput,
  UpdateAccountInput,
  UpdateSenderInput,
  BrandInput,
  ColumnMappingInfo,
  FieldMapInfo,
  Preferences,
  SaveTemplateInput,
  SendSummary,
  SendTemplateTestInput,
  TemplateDetail,
} from '@postloom/contracts';
import {
  DEFAULT_BRAND,
  writeDocumentToMjml,
  type BrandLook,
  type WriteDocument,
} from '@postloom/editor';
import { APP_ASSET_URL_PREFIX } from '@postloom/editor/tiptap';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { unwrap } from './ipc';

export const queryKeys = {
  preferences: ['preferences'] as const,
  templates: ['templates'] as const,
  template: (id: string) => ['templates', id] as const,
  versions: (id: string) => ['templates', id, 'versions'] as const,
  preview: (
    document: WriteDocument | undefined,
    look: BrandLook,
    values: Record<string, string> | null,
  ) => ['preview', document, look, values] as const,
  security: ['security'] as const,
  accounts: ['accounts'] as const,
  senders: ['senders'] as const,
};

export function usePreferences() {
  return useQuery({
    queryKey: queryKeys.preferences,
    queryFn: () => unwrap(window.postloom.settings.get()),
    staleTime: Infinity,
  });
}

export function useUpdatePreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (changes: Partial<Preferences>) => unwrap(window.postloom.settings.update(changes)),
    onSuccess: (preferences) => client.setQueryData(queryKeys.preferences, preferences),
  });
}

export function useTemplates() {
  return useQuery({
    queryKey: queryKeys.templates,
    queryFn: () => unwrap(window.postloom.templates.list()),
  });
}

export function useTemplate(id: string | null) {
  return useQuery({
    queryKey: queryKeys.template(id ?? ''),
    queryFn: () => unwrap(window.postloom.templates.get({ id: id ?? '' })),
    enabled: id !== null,
  });
}

export function useCreateTemplate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTemplateInput) => unwrap(window.postloom.templates.create(input)),
    onSuccess: (template: TemplateDetail) => {
      client.setQueryData(queryKeys.template(template.id), template);
      void client.invalidateQueries({ queryKey: queryKeys.templates, exact: true });
    },
  });
}

export function useSaveTemplate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveTemplateInput) => unwrap(window.postloom.templates.save(input)),
    onSuccess: (template: TemplateDetail, input) => {
      client.setQueryData(queryKeys.template(template.id), template);
      void client.invalidateQueries({ queryKey: queryKeys.templates, exact: true });
      if (input.snapshot)
        void client.invalidateQueries({ queryKey: queryKeys.versions(template.id) });
    },
  });
}

export function useDeleteTemplate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(window.postloom.templates.delete({ id })),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.templates, exact: true }),
  });
}

export function useRestoreTemplate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(window.postloom.templates.restore({ id })),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.templates, exact: true }),
  });
}

export function useTemplateVersions(id: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.versions(id),
    queryFn: () => unwrap(window.postloom.templates.versions({ id })),
    enabled,
  });
}

export function useRestoreVersion() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; versionNo: number }) =>
      unwrap(window.postloom.templates.restoreVersion(input)),
    onSuccess: (template: TemplateDetail) => {
      client.setQueryData(queryKeys.template(template.id), template);
      void client.invalidateQueries({ queryKey: queryKeys.versions(template.id) });
      void client.invalidateQueries({ queryKey: queryKeys.templates, exact: true });
    },
  });
}

export function useSendTemplateTest() {
  return useMutation({
    mutationFn: (input: SendTemplateTestInput) => unwrap(window.postloom.templates.sendTest(input)),
  });
}

/** Where the preview loads stored pictures from (the app serves them). */
const appImageSource = (assetId: string) => `${APP_ASSET_URL_PREFIX}${assetId}`;

/**
 * Compiles a Write-mode document to email HTML (in the main process) for the
 * preview, in the sender's brand look when there is one.
 */
export function useEmailPreview(
  document: WriteDocument | undefined,
  look: BrandLook = DEFAULT_BRAND,
  /** Example values; without them details show as "[First Name]". */
  values: Record<string, string> | null = null,
) {
  return useQuery({
    queryKey: queryKeys.preview(document, look, values),
    queryFn: () => {
      if (!document) throw new Error('No document to preview');
      // Previews never contain personalisation code.
      const mjml = writeDocumentToMjml(
        document,
        look,
        values ? { values } : 'placeholder',
        appImageSource,
      );
      return unwrap(window.postloom.templates.renderPreview({ mjml }));
    },
    enabled: document !== undefined,
    staleTime: Infinity,
  });
}

// ------------------------------------------------------ Accounts and senders

/** How well this computer protects saved passwords (keychain / weak / unavailable). */
export function useSecurity() {
  return useQuery({
    queryKey: queryKeys.security,
    queryFn: () => unwrap(window.postloom.app.getSecurity()),
    staleTime: Infinity,
  });
}

export function useAccounts() {
  return useQuery({
    queryKey: queryKeys.accounts,
    queryFn: () => unwrap(window.postloom.accounts.list()),
  });
}

export function useSenders() {
  return useQuery({
    queryKey: queryKeys.senders,
    queryFn: () => unwrap(window.postloom.senders.list()),
  });
}

/** Accounts and senders depend on each other (counts, inherited values), so refresh both. */
function useRefreshPeople() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.accounts }),
      client.invalidateQueries({ queryKey: queryKeys.senders }),
    ]);
}

export function useTestConnection() {
  return useMutation({
    mutationFn: (input: TestConnectionInput) =>
      unwrap(window.postloom.accounts.testConnection(input)),
  });
}

export function useCreateAccount() {
  const refresh = useRefreshPeople();
  return useMutation({
    mutationFn: (input: CreateAccountInput) => unwrap(window.postloom.accounts.create(input)),
    onSuccess: refresh,
  });
}

export function useUpdateAccount() {
  const refresh = useRefreshPeople();
  return useMutation({
    mutationFn: (input: UpdateAccountInput) => unwrap(window.postloom.accounts.update(input)),
    onSuccess: refresh,
  });
}

export function useDeleteAccount() {
  const refresh = useRefreshPeople();
  return useMutation({
    mutationFn: (id: string) => unwrap(window.postloom.accounts.delete({ id })),
    onSuccess: refresh,
  });
}

export function useTestAccount() {
  const refresh = useRefreshPeople();
  return useMutation({
    mutationFn: (id: string) => unwrap(window.postloom.accounts.test({ id })),
    // A failed test is recorded too, so refresh either way.
    onSettled: refresh,
  });
}

export function useSendTestEmail() {
  const refresh = useRefreshPeople();
  return useMutation({
    mutationFn: (input: { id: string; to?: string }) =>
      unwrap(window.postloom.accounts.sendTestEmail(input)),
    onSuccess: refresh,
  });
}

export function useCreateSender() {
  const refresh = useRefreshPeople();
  return useMutation({
    mutationFn: (input: CreateSenderInput) => unwrap(window.postloom.senders.create(input)),
    onSuccess: refresh,
  });
}

export function useUpdateSender() {
  const refresh = useRefreshPeople();
  return useMutation({
    mutationFn: (input: UpdateSenderInput) => unwrap(window.postloom.senders.update(input)),
    onSuccess: refresh,
  });
}

export function useDeleteSender() {
  const refresh = useRefreshPeople();
  return useMutation({
    mutationFn: (id: string) => unwrap(window.postloom.senders.delete({ id })),
    onSuccess: refresh,
  });
}

// --------------------------------------------------------- Pictures and brand

/** Opens the computer's file picker; resolves to null when cancelled. */
export function usePickImage() {
  return useMutation({ mutationFn: () => unwrap(window.postloom.assets.pickImage()) });
}

export function useImagesSize(ids: string[]) {
  return useQuery({
    queryKey: ['assets', 'size', ids] as const,
    queryFn: () => unwrap(window.postloom.assets.totalSize({ ids })),
    enabled: ids.length > 0,
    staleTime: Infinity,
  });
}

export function useSetBrand() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; brand: BrandInput | null }) =>
      unwrap(window.postloom.senders.setBrand(input)),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.senders }),
  });
}

/** Opens the computer's file picker for an HTML email; resolves to null when cancelled. */
export function usePickHtml() {
  return useMutation({ mutationFn: () => unwrap(window.postloom.templates.pickHtml()) });
}

// ------------------------------------------------------------- Sending lists

export interface ListRef {
  token: string;
  sheet: string;
  templateId?: string;
}

export interface ListChoices extends ListRef {
  mapping: ColumnMappingInfo;
  fieldMap: FieldMapInfo;
}

/** Opens the computer's file picker for a spreadsheet; resolves to null when cancelled. */
export function usePickList() {
  return useMutation({ mutationFn: () => unwrap(window.postloom.recipients.pick()) });
}

/** A sheet's columns, first rows and the best guess at matching them. */
export function useInspectList(ref: ListRef | null) {
  return useQuery({
    queryKey: ['lists', 'inspect', ref] as const,
    queryFn: () => unwrap(window.postloom.recipients.inspect(ref as ListRef)),
    enabled: ref !== null,
    staleTime: Infinity,
  });
}

export type CheckListInput = ListChoices & {
  templateId: string;
  senderId: string;
  skipRows: number[];
  sendDuplicatesOnce: boolean;
};

/** Checks everyone on the list with the current choices. */
export function useCheckList(input: CheckListInput | null) {
  return useQuery({
    queryKey: ['lists', 'check', input] as const,
    queryFn: () => unwrap(window.postloom.recipients.check(input as CheckListInput)),
    enabled: input !== null,
    placeholderData: keepPreviousData,
  });
}

/** One person's addresses and details, for the preview. */
export function useListRow(input: (ListChoices & { rowNo: number }) | null) {
  return useQuery({
    queryKey: ['lists', 'row', input] as const,
    queryFn: () => unwrap(window.postloom.recipients.row(input as ListChoices & { rowNo: number })),
    enabled: input !== null,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  });
}

// -------------------------------------------------------------------- Sends

const sendKey = (id: string) => ['sends', id] as const;

/** Starts sending; the check runs again in the main process first. */
export function useStartSend() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CheckListInput) => unwrap(window.postloom.sends.start(input)),
    onSuccess: (send: SendSummary) => {
      client.setQueryData(sendKey(send.id), send);
      void client.invalidateQueries({ queryKey: ['sends'], exact: true });
    },
  });
}

/** A send, refreshed a few times a second while it's going out. */
export function useSend(id: string) {
  return useQuery({
    queryKey: sendKey(id),
    queryFn: () => unwrap(window.postloom.sends.get({ id })),
    refetchInterval: (query) =>
      query.state.data?.running || query.state.data?.status === 'sending' ? 500 : false,
  });
}

/** Recent sends, newest first. */
export function useSends() {
  return useQuery({
    queryKey: ['sends'] as const,
    queryFn: () => unwrap(window.postloom.sends.list()),
  });
}

export function useSendProblems(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ['sends', id, 'problems'] as const,
    queryFn: () => unwrap(window.postloom.sends.problems({ id })),
    enabled,
  });
}

type SendAction = 'pause' | 'resume' | 'stop' | 'retryFailed';

/** Pause, Resume, Stop and Retry failed. */
export function useSendAction(action: SendAction) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(window.postloom.sends[action]({ id })),
    onSuccess: (send: SendSummary) => {
      client.setQueryData(sendKey(send.id), send);
      void client.invalidateQueries({ queryKey: ['sends', send.id, 'problems'] });
    },
  });
}

export function useResolveUncertain() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; action: 'resend' | 'skip' }) =>
      unwrap(window.postloom.sends.resolveUncertain(input)),
    onSuccess: (send: SendSummary) => {
      client.setQueryData(sendKey(send.id), send);
      void client.invalidateQueries({ queryKey: ['sends', send.id, 'problems'] });
    },
  });
}

/** Trusts the folders the latest check flagged for attachments, then checks again. */
export function useTrustFolders() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => unwrap(window.postloom.recipients.approveFolders({ token })),
    onSuccess: () => client.invalidateQueries({ queryKey: ['lists', 'check'] }),
  });
}
