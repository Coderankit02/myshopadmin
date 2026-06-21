import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null); // { message, type }
  const timerRef = useRef(null);

  const show = useCallback((message, opts = {}) => {
    clearTimeout(timerRef.current);
    setToast({ message, type: opts.type || 'default' });
    timerRef.current = setTimeout(() => setToast(null), opts.duration || 2800);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && (
        <div className={`toast${toast.type === 'error' ? ' t-error' : toast.type === 'success' ? ' t-success' : ''}`}>
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
