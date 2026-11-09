import { contextBridge, ipcRenderer } from 'electron';
import { MainEvents, type AwakenApi, type IpcChannel, type IpcContract } from '../shared/ipc';

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
  calendar: {
    listInRange: (fromDayKey, toDayKey) => invoke('events:listInRange', fromDayKey, toDayKey),
    create: (input) => invoke('events:create', input),
    update: (id, input) => invoke('events:update', id, input),
    delete: (id) => invoke('events:delete', id),
    // Spread so an omitted day isn't sent as an explicit undefined argument.
    toggleTaskDone: (id, occurrenceDay) =>
      occurrenceDay === undefined
        ? invoke('events:toggleTaskDone', id)
        : invoke('events:toggleTaskDone', id, occurrenceDay),
  },
  reminders: {
    test: () => invoke('reminders:test'),
  },
  events: {
    onShowToday(listener) {
      // Wrap the listener so the renderer never sees Electron's event object.
      const handler = () => listener();
      ipcRenderer.on(MainEvents.showToday, handler);
      return () => ipcRenderer.removeListener(MainEvents.showToday, handler);
    },
  },
};

contextBridge.exposeInMainWorld('api', api);
