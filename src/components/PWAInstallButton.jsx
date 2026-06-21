import { useState, useEffect } from 'react';
import { usePWA } from '../hooks/usePWA';

export default function PWAInstallButton() {
  const { showInstall, updateReady, promptInstall, applyUpdate } = usePWA();
  const [showBanner, setShowBanner] = useState(false);
  const [showIOSSheet, setShowIOSSheet] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(false);

  // Jaise hi install available ho, 1.5 second baad banner dikhao
  useEffect(() => {
    if (!showInstall) return;
    const t = setTimeout(() => {
      setShowBanner(true);
      requestAnimationFrame(() => setBannerVisible(true));
    }, 1500);
    return () => clearTimeout(t);
  }, [showInstall]);

  function hideBanner() {
    setBannerVisible(false);
    setTimeout(() => setShowBanner(false), 320);
  }

  function handleBannerInstall() {
    hideBanner();
    const needsSheet = promptInstall();
    if (needsSheet) setShowIOSSheet(true);
  }

  function handleNavbarInstall() {
    const needsSheet = promptInstall();
    if (needsSheet) setShowIOSSheet(true);
  }

  return (
    <>
      {/* ── Update banner ── */}
      {updateReady && (
        <div className="pwa-update-banner">
          <span>🔄 Naya version available hai</span>
          <button className="pwa-update-btn" onClick={applyUpdate}>
            Refresh Karein
          </button>
        </div>
      )}

      {/* ── Navbar install button (hamesha dikhega jab tak install na ho) ── */}
      {showInstall && (
        <button
          type="button"
          className="pwa-install-btn"
          onClick={handleNavbarInstall}
          title="App install karein"
        >
          <span>📲</span>
          <span className="pwa-install-label">Install</span>
        </button>
      )}

      {/* ── Auto popup banner (customer site jaisa, niche se aata hai) ── */}
      {showBanner && (
        <div className={`pwa-auto-banner${bannerVisible ? ' pwa-auto-banner--show' : ''}`}>
          <div className="pwa-auto-icon">🏪</div>
          <div className="pwa-auto-text">
            <p className="pwa-auto-title">Rinku Admin App Install Karein</p>
            <p className="pwa-auto-sub">Fast access, home screen shortcut</p>
          </div>
          <div className="pwa-auto-actions">
            <button className="pwa-auto-later" onClick={hideBanner}>Baad Mein</button>
            <button className="pwa-auto-now" onClick={handleBannerInstall}>Install</button>
          </div>
        </div>
      )}

      {/* ── iOS sheet ── */}
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
