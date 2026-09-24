import { Button, Stack, Text, Title } from '@mantine/core';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Translation } from 'react-i18next';

interface Props {
  children: ReactNode;
  /** Called when the person chooses to try again (defaults to reloading the window). */
  onReset?: () => void;
}

interface State {
  failed: boolean;
}

/**
 * Catches unexpected errors in a screen so people see a calm message with a
 * way forward, instead of a blank window (PLAN.md §15.2).
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // Details go to the log only; the screen never shows technical text.
    console.error('[ui] screen crashed', error, info.componentStack);
  }

  private reset = () => {
    this.setState({ failed: false });
    if (this.props.onReset) this.props.onReset();
    else window.location.reload();
  };

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Translation>
        {(t) => (
          <Stack role="alert" align="flex-start" gap="sm" maw={520} p="xl">
            <Title order={2}>{t('errors.screenTitle')}</Title>
            <Text c="var(--pl-ink-soft)">{t('errors.screenBody')}</Text>
            <Button onClick={this.reset}>{t('errors.screenRetry')}</Button>
          </Stack>
        )}
      </Translation>
    );
  }
}
