import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import { useModal } from '../context/ModalContext';
import { useToast } from '../context/ToastContext';
import { db } from '../lib/supabase';
import { formatDateTime } from '../lib/utils';
import '../pagestyles/ai.css';

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function Ai() {
  const toast = useToast();
  const modal = useModal();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, today: 0, escalated: 0, resolved: 0, totalMessages: 0 });
  const [aiEnabled, setAiEnabled] = useState(null); // null = unknown / settings not set up yet
  const [recentSessions, setRecentSessions] = useState([]);

  async function load() {
    setLoading(true);
    const { data: sessions } = await db.from('ananya_chat_sessions').select('id,status,created_at,updated_at,display_name,last_message').order('updated_at', { ascending: false }).limit(500);
    const list = sessions || [];
    const today = startOfDay(new Date());
    setStats({
      total: list.length,
      today: list.filter((s) => new Date(s.created_at) >= today).length,
      escalated: list.filter((s) => s.status === 'escalated').length,
      resolved: list.filter((s) => s.status === 'resolved').length,
    });
    setRecentSessions(list.slice(0, 6));

    const { data: settings } = await db.from('shop_settings').select('ai_enabled').eq('id', 1).maybeSingle();
    setAiEnabled(settings ? settings.ai_enabled : null);

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleAi() {
    if (aiEnabled === null) {
      toast.show('Settings table abhi setup nahi hai — supabase/admin-wiring-migration.sql run karein', { type: 'error' });
      return;
    }
    const next = !aiEnabled;
    const confirmed = await modal.confirm({
      title: next ? 'Enable AI Assistant?' : 'Disable AI Assistant?',
      message: next ? 'Ananya AI customers ke liye dobara enable ho jayegi.' : 'Ananya AI customers ke liye band ho jayegi.',
      confirmLabel: next ? 'Enable' : 'Disable',
      danger: !next,
    });
    if (!confirmed) return;
    const { error } = await db.from('shop_settings').update({ ai_enabled: next, updated_at: new Date().toISOString() }).eq('id', 1);
    if (error) {
      toast.show(`Update nahi hua: ${error.message}`, { type: 'error' });
      return;
    }
    setAiEnabled(next);
    toast.show(next ? 'AI Assistant enable ho gayi' : 'AI Assistant disable ho gayi', { type: 'success' });
  }

  return (
    <AppLayout title="Ananya AI">
      <div className="section-title">Ananya AI Management</div>
      <div className="section-sub">AI assistant ka usage monitor karein — live Supabase data</div>

      <div className="stat-grid" aria-busy={loading}>
        <div className="stat-card">
          <div className="stat-top"><div className="stat-icon" style={{ background: '#8B5CF622', color: '#8B5CF6' }}>🤖</div></div>
          <div className="stat-val">{aiEnabled === null ? '—' : aiEnabled ? 'Enabled' : 'Disabled'}</div>
          <div className="stat-label">AI Status</div>
        </div>
        <div className="stat-card">
          <div className="stat-top"><div className="stat-icon" style={{ background: '#3B82F622', color: '#3B82F6' }}>💬</div></div>
          <div className="stat-val">{stats.today}</div><div className="stat-label">Conversations Today</div>
        </div>
        <div className="stat-card">
          <div className="stat-top"><div className="stat-icon" style={{ background: '#1BA67222', color: '#1BA672' }}>📊</div></div>
          <div className="stat-val">{stats.total}</div><div className="stat-label">Total Conversations</div>
        </div>
        <div className="stat-card">
          <div className="stat-top"><div className="stat-icon" style={{ background: '#E6394622', color: '#E63946' }}>🚨</div></div>
          <div className="stat-val">{stats.escalated}</div><div className="stat-label">Escalated to Support</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Quick Controls</h3></div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn-main" onClick={toggleAi}>
            {aiEnabled ? 'Disable AI Assistant' : 'Enable AI Assistant'}
          </button>
          <Link className="btn-ghost" to="/support" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            View Conversation Logs (Support page)
          </Link>
        </div>
      </div>

      <div className="table-wrap" style={{ marginTop: 20 }}>
        <div className="table-head"><h3 style={{ fontSize: '0.96rem', fontWeight: 800 }}>Recent Conversations</h3></div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>User</th><th>Last Message</th><th>Status</th><th>Updated</th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4}><div className="skel" style={{ height: 20 }} aria-hidden="true" /></td></tr>
              ) : recentSessions.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--gray)' }}>Koi conversation nahi mili</td></tr>
              ) : (
                recentSessions.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 700 }}>{s.display_name || 'Guest User'}</td>
                    <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.last_message || '—'}</td>
                    <td><span className={`badge ${s.status === 'resolved' ? 'b-delivered' : s.status === 'escalated' ? 'b-cancelled' : 'b-confirmed'}`}>{s.status || 'open'}</span></td>
                    <td>{formatDateTime(s.updated_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
