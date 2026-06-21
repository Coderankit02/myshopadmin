import { useState } from 'react';
import { usePWA } from '../hooks/usePWA';

export default function PWAInstallButton() {
  const { showInstall, updateReady, promptInstall, applyUpdate } = usePWA();
  const [showIOSSheet, setShowIOSSheet] = useState(false);

  function handleClick() {
    const needsSheet = promptInstall();
    if (needsSheet) setShowIOSSheet(true);
  }

  return (
    <>
      {updateReady && (
        <div className="pwa-update-banner">
          <span>🔄 Naya version available hai</span>
          <button className="pwa-update-btn" onClick={applyUpdate}>
            Refresh Karein
          </button>
        </div>
      )}

      {showInstall && (
        <button
          type="button"
          className="pwa-install-btn"
          onClick={handleClick}
          title="App install karein"
        >
          <span>📲</span>
          <span className="pwa-install-label">Install</span>
        </button>
      )}

      {showIOSSheet && (
        <div className="pwa-ios-overlay" onClick={() => setShowIOSSheet(false)}>
          <div className="pwa-ios-card" onClick={(e) => e.stopPropagation()}>
            <h3>Home Screen Par Add Karein</h3>
            <p>
              Safari ke Share button <strong>⬆️</strong> par tap karein,
              phir <strong>"Add to Home Screen"</strong> chunein.
            </p>
            <button onClick={() => setShowIOSSheet(false)}>Samajh Gaya ✓</button>
          </div>
        </div>
      )}
    </>
  );
}
