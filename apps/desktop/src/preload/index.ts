import type { IpcChannel, PostloomApi } from '@postloom/contracts';
import { contextBridge, ipcRenderer } from 'electron';

// Only named, typed functions are exposed - never ipcRenderer itself or a
// generic invoke(channel, ...) passthrough (PLAN.md §10.2). The main process
// validates every argument again.
const invoke = (channel: IpcChannel, input?: unknown) => ipcRenderer.invoke(channel, input);

const api: PostloomApi = {
  app: {
    getInfo: () => invoke('app:getInfo'),
  },
  templates: {
    renderPreview: (input) => invoke('templates:renderPreview', input),
  },
};

contextBridge.exposeInMainWorld('postloom', api);
