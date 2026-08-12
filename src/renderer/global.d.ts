import type { HubApi } from '../preload/index';

declare global {
  interface Window {
    hub: HubApi;
  }
}
export {};
