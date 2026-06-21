/**
 * support/support.js
 * Support Management page logic.
 * Talks to real Supabase tables (`ananya_chat_sessions`, `ananya_chat_messages`),
 * preserved exactly from the original app — only the rendering layer changed
 * from React to vanilla DOM.
 */
(async function () {
  const user = await Auth.requireAdmin();

  Sidebar.mount(document.getElementById('sidebar-mount'));
  Navbar.mount(document.getElementById('navbar-mount'), { title: 'Support', userEmail: user.email, notifCount: 3 });

  let sessions = [];
  let filter = 'open';
  let active = null;
  let messages = [];

  const filtersEl = document.getElementById('support-filters');
  const listEl = document.getElementById('support-sessions-list');
  const chatPanelEl = document.getElementById('support-chat-panel');

  function renderFilters() {
    const options = ['open', 'escalated', 'resolved', 'unread', 'all'];
    filtersEl.innerHTML = options
      .map((f) => `<span class="filter-chip ${filter === f ? 'on' : ''}" data-f="${f}">${f[0].toUpperCase() + f.slice(1)}</span>`)
      .join('');
    filtersEl.querySelectorAll('.filter-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        filter = chip.getAttribute('data-f');
        renderFilters();
        renderList();
      });
    });
  }

  function filteredSessions() {
    return sessions.filter((s) => {
      if (filter === 'all') return true;
      if (filter === 'unread') return s.unread > 0;
      return (s.status || 'open') === filter;
    });
  }

  function renderList() {
    const filtered = filteredSessions();
    if (filtered.length === 0) {
      listEl.innerHTML = `<div style="padding:30px;text-align:center;color:var(--gray);">Koi conversation nahi mili</div>`;
      return;
    }
    listEl.innerHTML = filtered
      .map(
        (s) => `
      <div class="list-row support-list-row ${active && active.id === s.id ? 'active' : ''}" data-id="${s.id}">
        <div class="list-avatar">👤</div>
        <div class="list-main">
          <div class="list-title">${Utils.escapeHTML(s.display_name || 'Guest User')}</div>
          <div class="list-sub" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Utils.escapeHTML(s.last_message || 'No messages yet')}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
          <span class="badge ${s.status === 'resolved' ? 'b-delivered' : s.status === 'escalated' ? 'b-cancelled' : 'b-confirmed'}">${s.status || 'open'}</span>
          ${s.unread > 0 ? `<span class="badge b-pending">${s.unread} new</span>` : ''}
        </div>
      </div>`
      )
      .join('');

    listEl.querySelectorAll('.support-list-row').forEach((row) => {
      row.addEventListener('click', () => {
        const session = sessions.find((s) => String(s.id) === row.getAttribute('data-id'));
        openSession(session);
      });
    });
  }

  function showListLoading() {
    listEl.innerHTML = `<div style="padding:20px;"><div class="skel" style="height:60px;"></div></div>`;
  }

  async function loadSessions() {
    showListLoading();
    const { data, error } = await window.db.from('ananya_chat_sessions').select('*').order('updated_at', { ascending: false }).limit(200);
    sessions = !error && data ? data : [];
    renderList();
  }

  function bubbleClass(role) {
    if (role === 'user') return 'from-user';
    if (role === 'admin') return 'from-admin';
    return 'from-assistant';
  }

  function renderChatPanel() {
    if (!active) {
      chatPanelEl.innerHTML = `<div class="support-empty">👈 Koi conversation select karein</div>`;
      return;
    }
    chatPanelEl.innerHTML = `
      <div class="panel-head">
        <h3>${Utils.escapeHTML(active.display_name || 'Guest User')}</h3>
        <button class="act-btn primary" id="resolve-btn">✅ Resolve</button>
      </div>
      <div class="support-messages" id="support-messages"></div>
      <div class="support-input-row">
        <input id="support-reply-input" placeholder="Reply as admin..."/>
        <button class="btn-main" id="support-send-btn">➤</button>
      </div>
    `;

    renderMessages();

    document.getElementById('resolve-btn').addEventListener('click', () => resolve(active.id));
    document.getElementById('support-send-btn').addEventListener('click', sendReply);
    document.getElementById('support-reply-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendReply();
    });
  }

  function renderMessages() {
    const msgsEl = document.getElementById('support-messages');
    if (!msgsEl) return;
    if (messages.length === 0) {
      msgsEl.innerHTML = `<div style="margin:auto;color:var(--gray);">Koi messages nahi</div>`;
      return;
    }
    msgsEl.innerHTML = messages
      .map(
        (m) => `
      <div class="support-bubble ${bubbleClass(m.role)}">
        <div class="support-bubble-content">${Utils.escapeHTML(m.content)}</div>
        <div class="support-bubble-time">${Utils.formatTime(m.created_at)}</div>
      </div>`
      )
      .join('');
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  async function openSession(session) {
    active = session;
    messages = [];
    renderList();
    renderChatPanel();

    const { data } = await window.db
      .from('ananya_chat_messages')
      .select('*')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true })
      .limit(200);
    messages = data || [];
    renderMessages();

    if (session.unread > 0) {
      await window.db.from('ananya_chat_sessions').update({ unread: 0 }).eq('id', session.id);
    }
    loadSessions();
  }

  async function sendReply() {
    const input = document.getElementById('support-reply-input');
    const text = input.value.trim();
    if (!text || !active) return;
    input.value = '';

    const msg = { session_id: active.id, role: 'admin', content: text, created_at: new Date().toISOString() };
    messages.push(msg);
    renderMessages();

    await window.db.from('ananya_chat_messages').insert(msg);
    await window.db
      .from('ananya_chat_sessions')
      .update({ last_message: text, updated_at: new Date().toISOString(), status: 'open' })
      .eq('id', active.id);
    loadSessions();
  }

  async function resolve(id) {
    await window.db.from('ananya_chat_sessions').update({ status: 'resolved' }).eq('id', id);
    if (active && active.id === id) active = { ...active, status: 'resolved' };
    renderChatPanel();
    loadSessions();
  }

  renderFilters();
  loadSessions();
})();
