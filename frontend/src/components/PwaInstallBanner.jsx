import React, { useEffect, useState } from 'react';

const PWA_BANNER_DISMISS_KEY = 'dangote-pwa-banner-dismissed';

export default function PwaInstallBanner() {
  const [installEvent, setInstallEvent] = useState(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(PWA_BANNER_DISMISS_KEY) === 'true');
    } catch {
      setDismissed(false);
    }

    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      setInstallEvent(event);
    }

    function handlePwaUpdateReady() {
      setUpdateReady(true);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('dangote-pwa-update-ready', handlePwaUpdateReady);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('dangote-pwa-update-ready', handlePwaUpdateReady);
    };
  }, []);

  async function handleInstall() {
    if (updateReady) {
      window.location.reload();
      return;
    }

    if (!installEvent) {
      return;
    }

    installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  }

  function handleDismiss() {
    try {
      window.localStorage.setItem(PWA_BANNER_DISMISS_KEY, 'true');
    } catch {
      // ignore storage failures in UI-only behavior
    }
    setDismissed(true);
  }

  if ((!installEvent && !updateReady) || dismissed) {
    return null;
  }

  return (
    <div className="pwa-banner-wrap">
      <div className="pwa-banner" role="status" aria-live="polite">
        <div className="pwa-banner-copy">
          <strong>{updateReady ? 'App update ready' : 'Install for low-connectivity use'}</strong>
          <span>
            {updateReady
              ? 'Reload to apply the latest offline-ready assets.'
              : 'Install the app on vendor or help-desk devices for faster startup and cached offline screens.'}
          </span>
        </div>
        <div className="pwa-banner-actions">
          <button type="button" className="btn-pwa-install" onClick={handleInstall}>
            {updateReady ? 'Reload App' : 'Install App'}
          </button>
          <button type="button" className="btn-pwa-dismiss" onClick={handleDismiss}>Dismiss</button>
        </div>
      </div>
    </div>
  );
}