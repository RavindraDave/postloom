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
  settings: {
    get: () => invoke('settings:get'),
    update: (input) => invoke('settings:update', input),
  },
  templates: {
    renderPreview: (input) => invoke('templates:renderPreview', input),
    list: () => invoke('templates:list'),
    get: (input) => invoke('templates:get', input),
    create: (input) => invoke('templates:create', input),
    save: (input) => invoke('templates:save', input),
    delete: (input) => invoke('templates:delete', input),
    restore: (input) => invoke('templates:restore', input),
    versions: (input) => invoke('templates:versions', input),
    restoreVersion: (input) => invoke('templates:restoreVersion', input),
  },
};

contextBridge.exposeInMainWorld('postloom', api);
