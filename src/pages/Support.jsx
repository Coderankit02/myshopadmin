import { useEffect, useMemo, useRef, useState } from 'react';
import AppLayout from '../components/AppLayout';
import { db } from '../lib/supabase';
import { formatTime, timeAgo, debounce } from '../lib/utils';
import '../pagestyles/support.css';

const FILTERS = ['open', 'escalated', 'resolved', 'unread', 'all'];

function bubbleClass(role) {
  if (role === 'user') return 'from-user';
  if (role === 'admin') return 'from-admin';
  return 'from-assistant';
}

// Newest-first sort, kept as one helper so every place that merges/reloads
// sessions (initial load, realtime insert, realtime update) stays consistent.
function sortByRecent(list) {
  return [...list].sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
}

export default function Support() {
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [filter, setFilter] = useState('open');
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const msgsRef = useRef(null);
  const activeIdRef = useRef(null);
  useEffect(() => {
    activeIdRef.current = active?.id || null;
  }, [active?.id]);

  async function loadSessions() {
    setLoadingSessions(true);
    const { data, error } = await db
      .from('ananya_chat_sessions')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(200);
    setSessions(!error && data ? data : []);
    setLoadingSessions(false);
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
            </div>
          </div>
          <div className="support-list-scroll" data-now={now}>
            {loadingSessions ? (
              <div style={{ padding: 20 }}><div className="skel" style={{ height: 60 }} aria-hidden="true" /><span className="sr-only">Loading conversations…</span></div>
            ) : filteredSessions.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--gray)' }}>Koi conversation nahi mili</div>
            ) : (
              filteredSessions.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className={`list-row support-list-row ${active && active.id === s.id ? 'active' : ''}`}
                  onClick={() => openSession(s)}
                  aria-current={active && active.id === s.id ? 'true' : undefined}
                >
                  <div className="list-avatar" aria-hidden="true">👤</div>
                  <div className="list-main">
                    <div className="list-title">{s.display_name || 'Guest User'}</div>
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
              ))
            )}
          </div>
        </div>

        <div className="panel support-chat-panel">
          {!active ? (
            <div className="support-empty">👈 Koi conversation select karein</div>
          ) : (
            <>
              <div className="panel-head">
                <h3>{active.display_name || 'Guest User'}</h3>
                <button className="act-btn primary" onClick={() => resolve(active.id)}>✅ Resolve</button>
              </div>
              <div className="support-messages" ref={msgsRef} role="log" aria-live="polite" aria-label="Conversation messages">
                {messages.length === 0 ? (
                  <div style={{ margin: 'auto', color: 'var(--gray)' }}>Koi messages nahi</div>
                ) : (
                  messages.map((m, i) => (
                    <div className={`support-bubble ${bubbleClass(m.role)}`} key={m.id || i}>
                      <div className="support-bubble-content">{m.content}</div>
                      <div className="support-bubble-time">{formatTime(m.created_at)}</div>
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
