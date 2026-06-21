import { useEffect, useRef, useState } from 'react';
import AppLayout from '../components/AppLayout';
import { db } from '../lib/supabase';
import { formatTime } from '../lib/utils';
import '../pagestyles/support.css';

const FILTERS = ['open', 'escalated', 'resolved', 'unread', 'all'];

function bubbleClass(role) {
  if (role === 'user') return 'from-user';
  if (role === 'admin') return 'from-admin';
  return 'from-assistant';
}

export default function Support() {
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [filter, setFilter] = useState('open');
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [replyText, setReplyText] = useState('');
  const msgsRef = useRef(null);

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

  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
  }, [messages]);

  const filteredSessions = sessions.filter((s) => {
    if (filter === 'all') return true;
    if (filter === 'unread') return s.unread > 0;
    return (s.status || 'open') === filter;
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
                <span key={f} className={`filter-chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
                  {f[0].toUpperCase() + f.slice(1)}
                </span>
              ))}
            </div>
          </div>
          <div className="support-list-scroll">
            {loadingSessions ? (
              <div style={{ padding: 20 }}><div className="skel" style={{ height: 60 }} /></div>
            ) : filteredSessions.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--gray)' }}>Koi conversation nahi mili</div>
            ) : (
              filteredSessions.map((s) => (
                <div
                  key={s.id}
                  className={`list-row support-list-row ${active && active.id === s.id ? 'active' : ''}`}
                  onClick={() => openSession(s)}
                >
                  <div className="list-avatar">👤</div>
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
                    {s.unread > 0 && <span className="badge b-pending">{s.unread} new</span>}
                  </div>
                </div>
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
              <div className="support-messages" ref={msgsRef}>
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
                <input
                  placeholder="Reply as admin..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') sendReply();
                  }}
                />
                <button className="btn-main" onClick={sendReply}>➤</button>
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
