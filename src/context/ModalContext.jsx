import { createContext, useCallback, useContext, useState } from 'react';

const ModalContext = createContext(null);

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
      {modal && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{modal.title}</h3>
              <button className="icon-btn" onClick={close}>
                ✕
              </button>
            </div>
            <div className="modal-body">{modal.content}</div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('useModal must be used within ModalProvider');
  return ctx;
}
