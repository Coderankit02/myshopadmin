/**
 * shared/modal.js
 * Reusable modal/overlay helper. No dependencies.
 *
 * Usage:
 *   Modal.open({
 *     title: 'Payment Request',
 *     bodyHTML: '<p>...</p>',
 *     onClose: () => {}
 *   });
 *   Modal.close();
 *
 *   Modal.confirm({
 *     title: 'Delete product?',
 *     message: 'This cannot be undone.',
 *     confirmLabel: 'Delete',
 *     danger: true
 *   }).then(confirmed => { ... });
 */
(function () {
  function ensureStyles() {
    if (document.getElementById('modal-styles')) return;
    const style = document.createElement('style');
    style.id = 'modal-styles';
    style.textContent = `
      .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:300;
        display:flex;align-items:center;justify-content:center;padding:16px;}
      .modal-panel{background:var(--card-bg);border:1px solid var(--border);border-radius:16px;
        padding:20px;max-width:420px;width:100%;max-height:85vh;overflow-y:auto;
        animation:modalIn .18s ease-out;}
      @keyframes modalIn{from{opacity:0;transform:translateY(10px) scale(.98);}to{opacity:1;transform:translateY(0) scale(1);}}
      .modal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;}
      .modal-head h3{font-size:1rem;font-weight:800;color:var(--dark);}
      .modal-actions{display:flex;gap:10px;margin-top:18px;}
    `;
    document.head.appendChild(style);
  }

  let overlayEl = null;

  function close() {
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }
  }

  function open(opts) {
    opts = opts || {};
    ensureStyles();
    close(); // only one modal at a time

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        close();
        if (opts.onClose) opts.onClose();
      }
    });

    const panel = document.createElement('div');
    panel.className = 'modal-panel';
    panel.addEventListener('click', (e) => e.stopPropagation());

    const head = document.createElement('div');
    head.className = 'modal-head';
    head.innerHTML = `<h3>${opts.title || ''}</h3>`;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'icon-btn';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => {
      close();
      if (opts.onClose) opts.onClose();
    });
    head.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'modal-body';
    if (opts.bodyHTML !== undefined) body.innerHTML = opts.bodyHTML;
    if (opts.bodyEl) body.appendChild(opts.bodyEl);

    panel.appendChild(head);
    panel.appendChild(body);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    overlayEl = overlay;

    return { panel, body };
  }

  function confirm(opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const { body } = open({
        title: opts.title || 'Are you sure?',
        bodyHTML: `<p style="color:var(--gray);font-size:0.86rem;">${opts.message || ''}</p>`,
        onClose: () => resolve(false),
      });

      const actions = document.createElement('div');
      actions.className = 'modal-actions';

      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'btn-main';
      if (opts.danger) confirmBtn.style.background = 'var(--red)';
      confirmBtn.textContent = opts.confirmLabel || 'Confirm';
      confirmBtn.addEventListener('click', () => {
        close();
        resolve(true);
      });

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn-ghost';
      cancelBtn.textContent = opts.cancelLabel || 'Cancel';
      cancelBtn.addEventListener('click', () => {
        close();
        resolve(false);
      });

      actions.appendChild(confirmBtn);
      actions.appendChild(cancelBtn);
      body.appendChild(actions);
    });
  }

  window.Modal = { open, close, confirm };
})();
