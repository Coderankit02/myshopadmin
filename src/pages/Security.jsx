import { useEffect, useState } from 'react';
import AppLayout from '../components/AppLayout';
import { useToast } from '../context/ToastContext';
import { db } from '../lib/supabase';
import { roleLabel } from '../lib/auth';
import { formatDateTime } from '../lib/utils';
import '../pagestyles/security.css';

const LIMIT = 100;

function downloadCSV(filename, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

export default function Security() {
  const toast = useToast();
  const [tab, setTab] = useState('audit');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [missing, setMissing] = useState(false);

  async function load() {
    setLoading(true);
    const table = tab === 'audit' ? 'audit_logs' : 'login_history';
    const { data, error } = await db.from(table).select('*').order('created_at', { ascending: false }).limit(LIMIT);
    if (error) {
      setMissing(true);
      setLogs([]);
      setLoading(false);
      return;
    }
    setMissing(false);
    setLogs(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab]);

  const actions = [...new Set(logs.map((l) => l.action).filter(Boolean))];

  const filtered = logs.filter((l) => {
    if (actionFilter !== 'all' && l.action !== actionFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${l.admin_email || ''} ${l.email || ''} ${l.action || ''} ${l.entity || ''}`.toLowerCase().includes(q);
  });

  function exportLogs() {
    const isAudit = tab === 'audit';
    const head = isAudit
      ? ['Admin', 'Role', 'Action', 'Entity', 'Entity ID', 'Details', 'Time']
      : ['Email', 'Role', 'Success', 'User Agent', 'Time'];
    const rows = [head];
    filtered.forEach((l) => {
      if (isAudit) rows.push([l.admin_email, roleLabel(l.role), l.action, l.entity, l.entity_id, JSON.stringify(l.details || {}), formatDateTime(l.created_at)]);
      else rows.push([l.email, roleLabel(l.role), l.success ? 'Yes' : 'No', l.user_agent, formatDateTime(l.created_at)]);
    });
    downloadCSV(`${tab}-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    toast.show(`⬇ ${rows.length - 1} log(s) export ho gaye`, { type: 'success' });
  }

  return (
    <AppLayout title="Security">
      <div className="section-title">Security &amp; Audit</div>
      <div className="section-sub">
        Audit logs (admin actions) aur login history — har activity track hoti hai. Naya tab load karne par fresh data.
      </div>

      <div className="sec-tab-row" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'audit'} className={`filter-chip${tab === 'audit' ? ' on' : ''}`} onClick={() => { setTab('audit'); setActionFilter('all'); setSearch(''); }}>
          📝 Audit Logs
        </button>
        <button type="button" role="tab" aria-selected={tab === 'login'} className={`filter-chip${tab === 'login' ? ' on' : ''}`} onClick={() => { setTab('login'); setActionFilter('all'); setSearch(''); }}>
          🔐 Login History
        </button>
      </div>

      <div className="table-wrap">
        <div className="sec-filter-row">
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tab === 'audit' ? 'Admin, action ya entity search...' : 'Email search...'} />
          {tab === 'audit' && (
            <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} aria-label="Filter by action">
              <option value="all">All actions</option>
              {actions.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
          <button className="btn-ghost" onClick={exportLogs} disabled={filtered.length === 0}>⬇ Export CSV</button>
        </div>

        {missing ? (
          <div className="placeholder-card" style={{ margin: 16 }}>
            <div className="pc-icon">🔐</div>
            <h4>{tab === 'audit' ? 'audit_logs' : 'login_history'} table setup pending</h4>
            <p>Run <code>supabase/admin-wiring-migration.sql</code> in Supabase SQL Editor once — naye actions yahan automatically log hote hain.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                {tab === 'audit' ? (
                  <tr><th>Admin</th><th>Role</th><th>Action</th><th>Entity</th><th>Details</th><th>Time</th></tr>
                ) : (
                  <tr><th>Email</th><th>Role</th><th>Result</th><th>Device / Browser</th><th>Time</th></tr>
                )}
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={tab === 'audit' ? 6 : 5}><div className="skel" style={{ height: 20 }} aria-hidden="true" /></td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={tab === 'audit' ? 6 : 5} style={{ textAlign: 'center', color: 'var(--gray)' }}>Koi log nahi mila</td></tr>
                ) : tab === 'audit' ? (
                  filtered.map((l) => (
                    <tr key={l.id}>
                      <td style={{ fontWeight: 700 }}>{l.admin_email || '—'}</td>
                      <td>{roleLabel(l.role)}</td>
                      <td className="sec-action">{l.action}</td>
                      <td>{l.entity}{l.entity_id ? ` · ${String(l.entity_id).slice(0, 8)}` : ''}</td>
                      <td className="sec-details" title={JSON.stringify(l.details || {})}>{JSON.stringify(l.details || {})}</td>
                      <td>{formatDateTime(l.created_at)}</td>
                    </tr>
                  ))
                ) : (
                  filtered.map((l) => (
                    <tr key={l.id}>
                      <td style={{ fontWeight: 700 }}>{l.email || '—'}</td>
                      <td>{roleLabel(l.role)}</td>
                      <td><span className={`badge ${l.success ? 'sec-success' : 'sec-fail'}`}>{l.success ? '✓ Success' : '✗ Failed'}</span></td>
                      <td className="sec-details" title={l.user_agent}>{l.user_agent || '—'}</td>
                      <td>{formatDateTime(l.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
