import { Alert } from '@mantine/core';
import { IconAlertTriangle, IconLock } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useSecurity } from '../api/queries';

/** Explains how the password will be stored on this computer, and warns when that's weak. */
export function PasswordProtectionNotice() {
  const { t } = useTranslation();
  const security = useSecurity();
  const protection = security.data?.secretProtection;

  if (protection === 'unavailable') {
    return (
      <Alert color="red" icon={<IconAlertTriangle />} role="alert">
        {t('accounts.protectionUnavailable')}
      </Alert>
    );
  }
  if (protection === 'weak') {
    return (
      <Alert color="yellow" icon={<IconAlertTriangle />} role="status">
        {t('accounts.protectionWeak')}
      </Alert>
    );
  }
  return (
    <Alert color="gray" variant="light" icon={<IconLock />} role="note">
      {t('accounts.protectionKeychain')}
    </Alert>
  );
}
