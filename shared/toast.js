/**
 * shared/toast.js
 * Lightweight toast notifications. No dependencies.
 *
 * Usage:
 *   Toast.show('Saved successfully');
 *   Toast.show('Something went wrong', { type: 'error' });
 */
(function () {
  let activeToast = null;
  let hideTimer = null;

  function ensureStyles() {
    if (document.getElementById('toast-styles')) return;
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
      .toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
        background:var(--dark);color:#fff;padding:12px 20px;border-radius:12px;
        font-size:0.84rem;font-weight:600;z-index:999;box-shadow:0 8px 24px rgba(0,0,0,0.25);
        animation:toastIn .2s ease-out;}
      .toast.t-error{background:var(--red,#E63946);}
      .toast.t-success{background:var(--primary-dark,#158A5E);}
      @keyframes toastIn{from{opacity:0;transform:translate(-50%,8px);}to{opacity:1;transform:translate(-50%,0);}}
    `;
    document.head.appendChild(style);
  }

  function show(message, opts) {
    opts = opts || {};
    ensureStyles();
    if (activeToast) {
      activeToast.remove();
      clearTimeout(hideTimer);
    }
    const el = document.createElement('div');
    el.className = 'toast' + (opts.type === 'error' ? ' t-error' : opts.type === 'success' ? ' t-success' : '');
    el.textContent = message;
    document.body.appendChild(el);
    activeToast = el;

    const duration = opts.duration || 2800;
    hideTimer = setTimeout(() => {
      el.remove();
      if (activeToast === el) activeToast = null;
    }, duration);
  }

  window.Toast = { show };
})();
