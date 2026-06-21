import { useEffect, useState, useCallback } from 'react';

const SW_PATH = '/service-worker.js';

let _deferredPrompt = null;
let _waitingWorker = null;
let _swRegistered = false;

export function usePWA() {
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    setIsInstalled(standalone);

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(ios);

    if (ios && !standalone) setCanInstall(true);
  }, []);

  useEffect(() => {
    function onBeforeInstall(e) {
      e.preventDefault();
      _deferredPrompt = e;
      setCanInstall(true);
    }
    function onAppInstalled() {
      _deferredPrompt = null;
      setCanInstall(false);
      setIsInstalled(true);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (_swRegistered || !('serviceWorker' in navigator)) return;
    _swRegistered = true;

    navigator.serviceWorker.register(SW_PATH).then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) {
        _waitingWorker = reg.waiting;
        setUpdateReady(true);
      }
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            _waitingWorker = nw;
            setUpdateReady(true);
          }
        });
      });

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update();
      });
    }).catch((err) => console.warn('[RKADMIN-PWA] SW register failed:', err));

    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  }, []);

  const promptInstall = useCallback(() => {
    if (_deferredPrompt) {
      _deferredPrompt.prompt();
      _deferredPrompt.userChoice.finally(() => {
        _deferredPrompt = null;
        setCanInstall(false);
      });
    }
    return isIOS;
  }, [isIOS]);

  const applyUpdate = useCallback(() => {
    if (_waitingWorker) _waitingWorker.postMessage('SKIP_WAITING');
  }, []);

  return { canInstall, isInstalled, updateReady, isIOS, promptInstall, applyUpdate };
}
