import { useEffect, useState, useCallback } from 'react';

const SW_PATH = '/service-worker.js';

if (!window.__RK_ADMIN_PWA__) {
  window.__RK_ADMIN_PWA__ = {
    deferredPrompt: null,
    waitingWorker: null,
    swRegistered: false,
    _eventsRegistered: false,
    listeners: new Set(),
  };
}

function notify() {
  window.__RK_ADMIN_PWA__.listeners.forEach((fn) => fn());
}

export function usePWA() {
  const pwa = window.__RK_ADMIN_PWA__;

  const [canInstall, setCanInstall] = useState(!!pwa.deferredPrompt);
  const [isInstalled, setIsInstalled] = useState(
    window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
  );
  const [updateReady, setUpdateReady] = useState(!!pwa.waitingWorker);
  const [isIOS] = useState(
    /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream
  );

  useEffect(() => {
    function sync() {
      setCanInstall(!!pwa.deferredPrompt);
      setUpdateReady(!!pwa.waitingWorker);
    }
    pwa.listeners.add(sync);
    return () => pwa.listeners.delete(sync);
  }, [pwa]);

  useEffect(() => {
    if (pwa._eventsRegistered) return;
    pwa._eventsRegistered = true;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      pwa.deferredPrompt = e;
      notify();
      // Customer site jaisa — turant popup dikhao
      pwa.deferredPrompt.prompt();
      pwa.deferredPrompt.userChoice.finally(() => {
        pwa.deferredPrompt = null;
        notify();
      });
    });

    window.addEventListener('appinstalled', () => {
      pwa.deferredPrompt = null;
      setIsInstalled(true);
      notify();
    });
  }, [pwa]);

  useEffect(() => {
    if (pwa.swRegistered || !('serviceWorker' in navigator)) return;
    pwa.swRegistered = true;

    navigator.serviceWorker.register(SW_PATH).then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) {
        pwa.waitingWorker = reg.waiting;
        notify();
      }
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            pwa.waitingWorker = nw;
            notify();
          }
        });
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update();
      });
    }).catch((err) => console.warn('[RKAdmin PWA]', err));

    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  }, [pwa]);

  const promptInstall = useCallback(() => {
    if (pwa.deferredPrompt) {
      pwa.deferredPrompt.prompt();
      pwa.deferredPrompt.userChoice.finally(() => {
        pwa.deferredPrompt = null;
        notify();
      });
      return false;
    }
    return isIOS;
  }, [pwa, isIOS]);

  const applyUpdate = useCallback(() => {
    if (pwa.waitingWorker) pwa.waitingWorker.postMessage('SKIP_WAITING');
  }, [pwa]);

  const showInstall = (canInstall || isIOS) && !isInstalled;

  return { showInstall, isInstalled, updateReady, isIOS, promptInstall, applyUpdate };
}
