/// <reference types="vite/client" />
import type { AwakenApi } from '../../shared/ipc';

declare global {
  interface Window {
    api: AwakenApi;
  }
}

export {};
