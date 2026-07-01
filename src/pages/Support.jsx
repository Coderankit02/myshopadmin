import { useEffect, useMemo, useRef, useState } from 'react';
import AppLayout from '../components/AppLayout';
import { db } from '../lib/supabase';
import { useModal } from '../context/ModalContext';
import { useToast } from '../context/ToastContext';
import { formatTime, timeAgo, debounce } from '../lib/utils';
import '../pagestyles/support.css';

const FILTERS = ['open', 'escalated', 'resolved', 'unread', 'all'];

function bubbleClass(role) {
  if (role === 'user') return 'from-user';
  if (role === 'admin') return 'from-admin';
  return 'from-assistant';
}

// Small circular avatar — customer's real DP (profiles.avatar_url) when we
// have it, else an initial-letter fallback so it never looks broken.
function Avatar({ name, url, size = 36 }) {
  const initial = (name || 'G').trim().charAt(0).toUpperCase() || '👤';
  return (
    <div
      className="list-avatar support-avatar"
      style={{ width: size, height: size, overflow: 'hidden', padding: 0 }}
      aria-hidden="true"
    >
      {url ? (
        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        initial
      )}
    </div>
  );
}

// Newest-first sort, kept as one helper so every place that merges/reloads
// sessions (initial load, realtime insert, realtime update) stays consistent.
function sortByRecent(list) {
  return [...list].sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
}

export default function Support() {
  const modal = useModal();
  const toast = useToast();
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [filter, setFilter] = useState('open');
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [now, setNow] = useState(() => Date.now());
  // Feature: customers' profile photos, keyed by user_id — comes from the
  // storefront `profiles` table (same one Orders/Customers already use).
  const [profilesById, setProfilesById] = useState({});
  // Feature: bulk-select + delete chat history. Checkboxes only appear once
  // "Select" mode is turned on — the list stays clean otherwise, and delete
  // (single or bulk) happens by selecting item(s) then tapping Delete.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deletingId, setDeletingId] = useState(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const msgsRef = useRef(null);
  const activeIdRef = useRef(null);
  useEffect(() => {
    activeIdRef.current = active?.id || null;
  }, [active?.id]);

  // Best-effort: fetch profile (name + avatar) for any session user_ids we
  // don't already have cached, so the DP appears in the list + conversation.
  async function loadProfilesFor(list) {
    const ids = [...new Set((list || []).map((s) => s.user_id).filter(Boolean))];
    const missing = ids.filter((id) => !(id in profilesById));
    if (missing.length === 0) return;
    try {
      const { data } = await db.from('profiles').select('id,name,avatar_url').in('id', missing);
      if (!data) return;
      setProfilesById((prev) => {
        const next = { ...prev };
        data.forEach((p) => { next[p.id] = p; });
        return next;
      });
    } catch (e) { /* profiles table optional */ }
  }

  async function loadSessions() {
    setLoadingSessions(true);
    const { data, error } = await db
      .from('ananya_chat_sessions')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(200);
    const list = !error && data ? data : [];
    setSessions(list);
    setLoadingSessions(false);
    loadProfilesFor(list);
  }

  useEffect(() => {
    loadSessions();
  }, []);

  // BUG FIX: naye/updated chats sirf manual page-refresh par dikhte the —
  // koi live update nahi tha. Ab Supabase Realtime se session list khud-ba-khud
  // update hoti hai (naya chat aate hi list mein turant aa jaata hai, sahi
  // "time ago" order mein) — refresh ki zaroorat nahi.
  useEffect(() => {
    const channel = db
      .channel('admin-support-sessions')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ananya_chat_sessions' },
        (payload) => {
          setSessions((prev) => sortByRecent([payload.new, ...prev.filter((s) => s.id !== payload.new.id)]));
          loadProfilesFor([payload.new]);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'ananya_chat_sessions' },
        (payload) => {
          setSessions((prev) => sortByRecent(prev.map((s) => (s.id === payload.new.id ? payload.new : s))));
          setActive((a) => (a && a.id === payload.new.id ? { ...a, ...payload.new } : a));
        }
      )
      .subscribe();
    return () => db.removeChannel(channel);
  }, []);

  // Jo bhi conversation admin ne khol rakhi hai, uspar customer ka naya
  // message live aana chahiye — pehle sirf conversation dobara kholne par
  // hi dikhta tha.
  useEffect(() => {
    if (!active?.id) return undefined;
    const channel = db
      .channel(`admin-support-messages-${active.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ananya_chat_messages', filter: `session_id=eq.${active.id}` },
        (payload) => {
          // Admin ke apne bheje replies pehle se hi optimistically list mein
          // add ho chuke hote hain (sendReply mein) — unhe realtime se dobara
          // add karne par duplicate bubble ban jaata, isliye sirf customer/AI
          // ke naye messages hi yahan se live-append karte hain.
          if (payload.new.role === 'admin') return;
          setMessages((prev) => (prev.some((m) => m.id === payload.new.id) ? prev : [...prev, payload.new]));
          if (payload.new.role === 'user' && activeIdRef.current === active.id) {
            db.from('ananya_chat_sessions').update({ unread: 0 }).eq('id', active.id);
          }
        }
      )
      .subscribe();
    return () => db.removeChannel(channel);
  }, [active?.id]);

  // "2 min pehle" ko live taaza rakhne ke liye har 20s par ek re-render force
  // karte hain — timeAgo() automatically nayi value de degi.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
  }, [messages]);

  const debouncedSetSearch = useMemo(() => debounce((v) => setSearch(v), 250), []);

  const filteredSessions = sessions.filter((s) => {
    if (filter === 'all') { /* no status filter */ }
    else if (filter === 'unread') { if (!(s.unread > 0)) return false; }
    else if ((s.status || 'open') !== filter) return false;

    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      (s.display_name || 'guest user').toLowerCase().includes(q) ||
      (s.last_message || '').toLowerCase().includes(q) ||
      (s.page_url || '').toLowerCase().includes(q)
    );
  });

  async function openSession(session) {
    setActive(session);
    setMessages([]);

    const { data } = await db
      .from('ananya_chat_messages')
      .select('*')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true })
      .limit(200);
    setMessages(data || []);

    if (session.unread > 0) {
      await db.from('ananya_chat_sessions').update({ unread: 0 }).eq('id', session.id);
    }
    loadSessions();
  }

  async function sendReply() {
    const text = replyText.trim();
    if (!text || !active) return;
    setReplyText('');

    const msg = { session_id: active.id, role: 'admin', content: text, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, msg]);

    await db.from('ananya_chat_messages').insert(msg);
    await db
      .from('ananya_chat_sessions')
      .update({ last_message: text, updated_at: new Date().toISOString(), status: 'open' })
      .eq('id', active.id);
    loadSessions();
  }

  async function resolve(id) {
    await db.from('ananya_chat_sessions').update({ status: 'resolved' }).eq('id', id);
    setActive((a) => (a && a.id === id ? { ...a, status: 'resolved' } : a));
    loadSessions();
  }

  // ── Bulk selection (single delete just calls this with one id) ──────────
  function toggleSelect(id, e) {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) =>
      prev.size === filteredSessions.length ? new Set() : new Set(filteredSessions.map((s) => s.id))
    );
  }

  // Removes a chat history (messages + session row) for one or more session
  // ids. Used for both the single 🗑️ button and the bulk "Delete Selected" bar.
  async function deleteSessions(ids) {
    if (!ids || ids.length === 0) return;
    const count = ids.length;
    const confirmed = await modal.confirm({
      title: count === 1 ? 'Chat delete karein?' : `${count} chats delete karein?`,
      message: `Ye conversation${count > 1 ? 's' : ''} aur unke saare messages permanently delete ho jayenge. Ye action wapas nahi ho sakta.`,
      confirmLabel: 'Haan, Delete Karo',
      danger: true,
    });
    if (!confirmed) return;

    if (count === 1) setDeletingId(ids[0]);
    else setBulkDeleting(true);

    try {
      await db.from('ananya_chat_messages').delete().in('session_id', ids);
      const { error } = await db.from('ananya_chat_sessions').delete().in('id', ids);
      if (error) throw error;

      setSessions((prev) => prev.filter((s) => !ids.includes(s.id)));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      if (active && ids.includes(active.id)) {
        setActive(null);
        setMessages([]);
      }
      if (selectMode) exitSelectMode();
      toast.show(count === 1 ? '🗑️ Chat delete ho gaya' : `🗑️ ${count} chats delete ho gaye`, { type: 'success' });
    } catch (e) {
      toast.show('❌ Delete nahi ho paya, dobara try karein', { type: 'error' });
    } finally {
      setDeletingId(null);
      setBulkDeleting(false);
    }
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  function deleteSelected() {
    deleteSessions([...selectedIds]);
  }

  return (
    <AppLayout title="Support">
      <div className="section-title">Support Management</div>
      <div className="section-sub">Ananya AI chat conversations — live Supabase data</div>

      <div className="support-row">
        <div className="panel support-list-panel">
          <div className="table-head">
            <div className="filter-row">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`filter-chip ${filter === f ? 'on' : ''}`}
                  onClick={() => setFilter(f)}
                  aria-pressed={filter === f}
                >
                  {f[0].toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            <div className="support-search-row">
              <label htmlFor="support-search" className="sr-only">Naam ya message se search karein</label>
              <input
                id="support-search"
                type="search"
                placeholder="🔍 Naam ya message se search karein..."
                defaultValue={search}
                onChange={(e) => debouncedSetSearch(e.target.value)}
              />
              {filteredSessions.length > 0 && (
                <button
                  type="button"
                  className={`act-btn support-select-toggle ${selectMode ? 'primary' : ''}`}
                  onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                >
                  {selectMode ? '✕ Cancel' : '☑️ Select'}
                </button>
              )}
            </div>
            {selectMode && (
              <div className="support-select-all-row">
                <label className="support-checkbox-label">
                  <input
                    type="checkbox"
                    checked={filteredSessions.length > 0 && selectedIds.size === filteredSessions.length}
                    onChange={toggleSelectAll}
                    aria-label="Sabhi conversations select karein"
                  />
                  Select All
                </label>
                <strong>{selectedIds.size} selected</strong>
                <button
                  type="button"
                  className="act-btn danger"
                  disabled={bulkDeleting || selectedIds.size === 0}
                  onClick={deleteSelected}
                >
                  {bulkDeleting ? '⏳ Deleting…' : '🗑️ Delete'}
                </button>
              </div>
            )}
          </div>
          <div className="support-list-scroll" data-now={now}>
            {loadingSessions ? (
              <div style={{ padding: 20 }}><div className="skel" style={{ height: 60 }} aria-hidden="true" /><span className="sr-only">Loading conversations…</span></div>
            ) : filteredSessions.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--gray)' }}>Koi conversation nahi mili</div>
            ) : (
              filteredSessions.map((s) => {
                const profile = s.user_id ? profilesById[s.user_id] : null;
                const name = profile?.name || s.display_name || 'Guest User';
                return (
                  <div
                    key={s.id}
                    className={`list-row support-list-row ${active && active.id === s.id ? 'active' : ''}`}
                  >
                    {selectMode && (
                      <label className="support-checkbox-label support-row-check" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(s.id)}
                          onChange={(e) => toggleSelect(s.id, e)}
                          aria-label={`Select conversation with ${name}`}
                        />
                      </label>
                    )}
                    <button
                      type="button"
                      className="support-row-main"
                      onClick={() => (selectMode ? toggleSelect(s.id, { stopPropagation() {} }) : openSession(s))}
                      aria-current={active && active.id === s.id ? 'true' : undefined}
                    >
                      <Avatar name={name} url={profile?.avatar_url} />
                      <div className="list-main">
                        <div className="list-title">{name}</div>
                        <div className="list-sub" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {s.last_message || 'No messages yet'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <span className={`badge ${s.status === 'resolved' ? 'b-delivered' : s.status === 'escalated' ? 'b-cancelled' : 'b-confirmed'}`}>
                          {s.status || 'open'}
                        </span>
                        <span className="list-time" title={s.updated_at ? new Date(s.updated_at).toLocaleString('en-IN') : ''}>
                          {timeAgo(s.updated_at)}
                        </span>
                        {s.unread > 0 && <span className="badge b-pending">{s.unread} new</span>}
                      </div>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="panel support-chat-panel">
          {!active ? (
            <div className="support-empty">👈 Koi conversation select karein</div>
          ) : (
            <>
              <div className="panel-head">
                <h3>{profilesById[active.user_id]?.name || active.display_name || 'Guest User'}</h3>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="act-btn primary" onClick={() => resolve(active.id)}>✅ Resolve</button>
                  <button
                    className="act-btn danger"
                    disabled={deletingId === active.id}
                    onClick={() => deleteSessions([active.id])}
                  >
                    {deletingId === active.id ? '⏳' : '🗑️ Delete Chat'}
                  </button>
                </div>
              </div>
              <div className="support-messages" ref={msgsRef} role="log" aria-live="polite" aria-label="Conversation messages">
                {messages.length === 0 ? (
                  <div style={{ margin: 'auto', color: 'var(--gray)' }}>Koi messages nahi</div>
                ) : (
                  messages.map((m, i) => (
                    <div className={`support-bubble-row ${bubbleClass(m.role)}`} key={m.id || i}>
                      {m.role === 'user' && (
                        <Avatar
                          name={profilesById[active.user_id]?.name || active.display_name}
                          url={profilesById[active.user_id]?.avatar_url}
                          size={26}
                        />
                      )}
                      <div className={`support-bubble ${bubbleClass(m.role)}`}>
                        <div className="support-bubble-content">{m.content}</div>
                        <div className="support-bubble-time">{formatTime(m.created_at)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="support-input-row">
                <label htmlFor="support-reply" className="sr-only">Reply as admin</label>
                <input
                  id="support-reply"
                  placeholder="Reply as admin..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') sendReply();
                  }}
                />
                <button className="btn-main" onClick={sendReply} aria-label="Send reply">➤</button>
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
