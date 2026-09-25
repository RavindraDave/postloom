import type { IpcChannel, PostloomApi } from '@postloom/contracts';
import { contextBridge, ipcRenderer } from 'electron';

// Only named, typed functions are exposed - never ipcRenderer itself or a
// generic invoke(channel, ...) passthrough (PLAN.md §10.2). The main process
// validates every argument again.
const invoke = (channel: IpcChannel, input?: unknown) => ipcRenderer.invoke(channel, input);

const api: PostloomApi = {
  app: {
    getInfo: () => invoke('app:getInfo'),
    getSecurity: () => invoke('app:getSecurity'),
  },
  settings: {
    get: () => invoke('settings:get'),
    update: (input) => invoke('settings:update', input),
  },
  accounts: {
    list: () => invoke('accounts:list'),
    create: (input) => invoke('accounts:create', input),
    update: (input) => invoke('accounts:update', input),
    delete: (input) => invoke('accounts:delete', input),
    testConnection: (input) => invoke('accounts:testConnection', input),
    test: (input) => invoke('accounts:test', input),
    sendTestEmail: (input) => invoke('accounts:sendTestEmail', input),
  },
  senders: {
    list: () => invoke('senders:list'),
    create: (input) => invoke('senders:create', input),
    update: (input) => invoke('senders:update', input),
    delete: (input) => invoke('senders:delete', input),
    setBrand: (input) => invoke('senders:setBrand', input),
  },
  assets: {
    pickImage: () => invoke('assets:pickImage'),
    totalSize: (input) => invoke('assets:totalSize', input),
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
    sendTest: (input) => invoke('templates:sendTest', input),
    pickHtml: () => invoke('templates:pickHtml'),
    restoreVersion: (input) => invoke('templates:restoreVersion', input),
  },
};

contextBridge.exposeInMainWorld('postloom', api);
