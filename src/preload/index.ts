import { contextBridge, ipcRenderer } from 'electron';
import type { AwakenApi, IpcChannel, IpcContract } from '../shared/ipc';

function invoke<C extends IpcChannel>(
  channel: C,
  ...args: IpcContract[C]['args']
): Promise<IpcContract[C]['result']> {
  return ipcRenderer.invoke(channel, ...args);
}

const api: AwakenApi = {
  habits: {
    list: () => invoke('habits:list'),
    create: (input) => invoke('habits:create', input),
    update: (id, input) => invoke('habits:update', id, input),
    archive: (id) => invoke('habits:archive', id),
    restore: (id) => invoke('habits:restore', id),
    delete: (id) => invoke('habits:delete', id),
    toggleLog: (habitId, dayKey) => invoke('habits:toggleLog', habitId, dayKey),
    getLogs: (fromDayKey, toDayKey) => invoke('habits:getLogs', fromDayKey, toDayKey),
  },
  settings: {
    get: () => invoke('settings:get'),
    update: (changes) => invoke('settings:update', changes),
  },
};

contextBridge.exposeInMainWorld('api', api);
