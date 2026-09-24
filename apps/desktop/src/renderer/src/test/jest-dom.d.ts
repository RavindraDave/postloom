// @testing-library/jest-dom's bundled Vitest types target Vitest 3/4, which
// declared matchers on `Assertion<T>`. Vitest 5 merges custom matchers through
// `Matchers<R, T>`, so the DOM matchers are registered here instead. The type
// parameters must match Vitest's declaration exactly, even though T is unused.
/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars */
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

declare module 'vitest' {
  interface Matchers<
    R extends void | Promise<void> = void | Promise<void>,
    T = unknown,
  > extends TestingLibraryMatchers<unknown, R> {}
}
