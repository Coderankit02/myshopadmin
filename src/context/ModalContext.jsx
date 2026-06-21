import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const ModalContext = createContext(null);

const FOCUSABLE_SELECTOR =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

function ModalDialog({ modal, onRequestClose }) {
  const panelRef = useRef(null);
  const lastFocusedRef = useRef(null);

  // Remember what had focus before the modal opened, focus the panel on
  // open, and restore focus to the trigger element when it closes.
  useEffect(() => {
    lastFocusedRef.current = document.activeElement;
    const firstFocusable = panelRef.current?.querySelector(FOCUSABLE_SELECTOR);
    (firstFocusable || panelRef.current)?.focus();

    return () => {
      if (lastFocusedRef.current && typeof lastFocusedRef.current.focus === 'function') {
        lastFocusedRef.current.focus();
      }
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onRequestClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;

      const focusable = Array.from(panelRef.current.querySelectorAll(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onRequestClose]);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onRequestClose();
      }}
    >
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 id="modal-title">{modal.title}</h3>
          <button type="button" className="icon-btn" onClick={onRequestClose} aria-label="Close dialog">
            ✕
          </button>
        </div>
        <div className="modal-body">{modal.content}</div>
      </div>
    </div>
  );
}

export function ModalProvider({ children }) {
  const [modal, setModal] = useState(null); // { title, content, onClose }

  const close = useCallback(() => {
    setModal((m) => {
      if (m?.onClose) m.onClose();
      return null;
    });
  }, []);

  const open = useCallback(({ title, content, onClose }) => {
    setModal({ title, content, onClose });
  }, []);

  const confirm = useCallback(
    ({ title = 'Are you sure?', message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) => {
      return new Promise((resolve) => {
        setModal({
          title,
          onClose: () => resolve(false),
          content: (
            <div>
              <p style={{ color: 'var(--gray)', fontSize: '0.86rem' }}>{message}</p>
              <div className="modal-actions">
                <button
                  className="btn-main"
                  style={danger ? { background: 'var(--red)' } : undefined}
                  onClick={() => {
                    setModal(null);
                    resolve(true);
                  }}
                >
                  {confirmLabel}
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => {
                    setModal(null);
                    resolve(false);
                  }}
                >
                  {cancelLabel}
                </button>
              </div>
            </div>
          ),
        });
      });
    },
    []
  );

  return (
    <ModalContext.Provider value={{ open, close, confirm }}>
      {children}
      {modal && <ModalDialog modal={modal} onRequestClose={close} />}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('useModal must be used within ModalProvider');
  return ctx;
}
