import { useState } from 'react';
import { usePWA } from '../hooks/usePWA';

const S = {
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 13px',
    borderRadius: '9px',
    border: '1.5px solid var(--border, #334155)',
    background: 'transparent',
    color: 'var(--fg, #e2e8f0)',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'background 0.15s, border-color 0.15s',
    fontFamily: 'inherit',
  },
  btnHover: {
    background: 'var(--primary, #15803D)',
    borderColor: 'var(--primary, #15803D)',
    color: '#fff',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 10000,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  card: {
    background: '#fff',
    color: '#111827',
    width: '100%',
    maxWidth: '460px',
    borderRadius: '18px 18px 0 0',
    padding: '24px 24px 32px',
    textAlign: 'center',
  },
  cardTitle: { margin: '0 0 10px', fontSize: '1.05rem', fontWeight: 800 },
  cardBody: { margin: '0 0 18px', fontSize: '0.9rem', color: '#475569', lineHeight: 1.6 },
  cardBtn: {
    width: '100%',
    padding: '13px',
    borderRadius: '10px',
    border: 'none',
    background: '#15803D',
    color: '#fff',
    fontSize: '0.95rem',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  updateBanner: {
    position: 'fixed',
    top: 0, left: 0, right: 0,
    zIndex: 9999,
    background: '#15803D',
    color: '#fff',
    padding: '11px 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    fontSize: '0.84rem',
    fontWeight: 600,
  },
  updateBtn: {
    background: '#fff',
    color: '#15803D',
    border: 'none',
    padding: '6px 14px',
    borderRadius: '8px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
};

export default function PWAInstallButton() {
  const { canInstall, isInstalled, updateReady, isIOS, promptInstall, applyUpdate } = usePWA();
  const [hovered, setHovered] = useState(false);
  const [showIOSSheet, setShowIOSSheet] = useState(false);

  function handleInstallClick() {
    const needsIOSSheet = promptInstall();
    if (needsIOSSheet) setShowIOSSheet(true);
  }

  const showInstallBtn = canInstall && !isInstalled;

  return (
    <>
      {updateReady && (
        <div style={S.updateBanner}>
          <span>🔄 Naya version available hai</span>
          <button style={S.updateBtn} onClick={applyUpdate}>
            Refresh Karein
          </button>
        </div>
      )}

      {showInstallBtn && (
        <button
          type="button"
          style={hovered ? { ...S.btn, ...S.btnHover } : S.btn}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onClick={handleInstallClick}
          title="Admin app apne device par install karein"
        >
          📲 App Install
        </button>
      )}

      {showIOSSheet && (
        <div style={S.overlay} onClick={() => setShowIOSSheet(false)}>
          <div style={S.card} onClick={(e) => e.stopPropagation()}>
            <h3 style={S.cardTitle}>Home Screen Par Add Karein</h3>
            <p style={S.cardBody}>
              Safari ke Share button <strong>⬆️</strong> par tap karein,
              phir <strong>"Add to Home Screen"</strong> chunein.
              <br />Yeh admin panel aapke phone par app jaisa kaam karega.
            </p>
            <button style={S.cardBtn} onClick={() => setShowIOSSheet(false)}>
              Samajh Gaya ✓
            </button>
          </div>
        </div>
      )}
    </>
  );
}
