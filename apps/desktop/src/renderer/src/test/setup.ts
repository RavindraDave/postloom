import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import '../i18n/i18n';

// jsdom lacks these browser APIs, which Mantine uses.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverStub;

if (!('fonts' in document)) {
  Object.defineProperty(document, 'fonts', {
    value: { addEventListener: vi.fn(), removeEventListener: vi.fn(), ready: Promise.resolve() },
  });
}

// ...and these, which ProseMirror (the Write-mode editor) uses to scroll the caret into view.
const emptyRect = () => new DOMRect(0, 0, 0, 0);
const emptyRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = emptyRect;
Range.prototype.getClientRects = emptyRects;
Element.prototype.scrollIntoView = vi.fn();
if (!('elementFromPoint' in document)) {
  Object.defineProperty(document, 'elementFromPoint', { value: () => null });
}

afterEach(() => cleanup());
