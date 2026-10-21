import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannels, type AwakenApi, type HabitsCreateRequest } from '../shared/ipc';

const api: AwakenApi = {
  habits: {
    create: (input: HabitsCreateRequest) => ipcRenderer.invoke(IpcChannels.habitsCreate, input),
    list: () => ipcRenderer.invoke(IpcChannels.habitsList),
  },
};

contextBridge.exposeInMainWorld('api', api);
