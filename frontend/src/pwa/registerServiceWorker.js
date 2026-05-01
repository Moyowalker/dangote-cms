import { registerSW } from 'virtual:pwa-register';

let registered = false;

export function registerDangoteServiceWorker() {
  if (registered || typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  registered = true;

  registerSW({
    immediate: true,
    onNeedRefresh() {
      window.dispatchEvent(new CustomEvent('dangote-pwa-update-ready'));
    },
    onOfflineReady() {
      window.dispatchEvent(new CustomEvent('dangote-pwa-offline-ready'));
    }
  });
}