# ADR 0003: Mantine as the UI component library

- **Status:** Accepted
- **Date:** 2026-09-24
- **Deciders:** Ravindra Dave

## Context
Postloom's audience is non-technical, so the UI must be consistent, accessible (WCAG 2.2 AA), themeable (light/dark, text size) and quick to build. The core flows need a stepper, forms with validation, modals, notifications and data tables.

## Options considered
1. **Mantine** - large, accessible React component set with Stepper, Form, Modals, Notifications, Spotlight, Dropzone, dates; CSS-variable theming with built-in dark mode; MIT.
2. **shadcn/ui (Radix + Tailwind)** - excellent accessible primitives, full ownership of component code; more assembly needed (stepper, notifications, forms) and Tailwind adds a styling paradigm.
3. **MUI** - mature, but heavier and more opinionated Material look.

## Decision
**Mantine** (with Tabler Icons). Its built-in components cover our flows with the least custom code, and its theming maps directly onto our design tokens.

## Consequences
- Design tokens live in one Mantine theme (`apps/desktop/src/renderer/theme`).
- Shared app-specific components (InheritedField, ProblemList, etc.) wrap Mantine primitives in `packages/ui` so a future library change stays contained.
- Mantine uses inline styles in places; the CSP keeps `style-src 'unsafe-inline'` (scripts remain `'self'` only).
