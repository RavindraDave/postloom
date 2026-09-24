import type { PostloomApi } from '@postloom/contracts';

declare global {
  interface Window {
    /** Exposed by the preload script; the renderer's only way to reach the main process. */
    postloom: PostloomApi;
  }
}

export {};
