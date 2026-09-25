import { IconCheck } from '@tabler/icons-react';
import classes from './WizardSteps.module.css';

interface WizardStepsProps {
  label: string;
  steps: string[];
  /** Index of the current step. */
  current: number;
}

/** Done / current / to-do steps; the current one has `aria-current="step"`. */
export function WizardSteps({ label, steps, current }: WizardStepsProps) {
  return (
    <ol className={classes.list} aria-label={label}>
      {steps.map((step, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'todo';
        return (
          <li
            key={step}
            className={classes.step}
            data-state={state}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <span className={classes.dot} aria-hidden>
              {state === 'done' ? <IconCheck size={14} stroke={3} /> : index + 1}
            </span>
            <span>{step}</span>
          </li>
        );
      })}
    </ol>
  );
}
