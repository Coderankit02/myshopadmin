import { useEffect, useState } from 'react';
import AppLayout from '../components/AppLayout';
import { useModal } from '../context/ModalContext';
import { useToast } from '../context/ToastContext';
import { db } from '../lib/supabase';
import { audit } from '../lib/audit';
import { formatDateTime } from '../lib/utils';
import '../pagestyles/reviews.css';

const FILTERS = ['All', 'Pending', 'Approved', 'Rejected'];

function Stars({ rating }) {
  return (
    <span className="rev-stars" aria-label={`${rating} out of 5`}>
      {'★'.repeat(rating)}<span className="rev-stars-off">{'★'.repeat(5 - rating)}</span>
    </span>
  );
}

function ReplyForm({ review, busy, onSave }) {
  const [reply, setReply] = useState(review?.admin_reply || '');
  return (
    <div>
      <p style={{ fontSize: '0.84rem', color: 'var(--gray)', marginBottom: 12 }}>
        Customer: “{review?.comment}”
      </p>
      <div className="f-group">
        <label htmlFor="rev-reply">Admin Reply</label>
        <textarea id="rev-reply" rows={4} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Customer ko public reply likhein..." />
      </div>
      <div className="modal-actions">
        <button className="btn-main" disabled={busy} onClick={() => onSave(reply.trim())}>
          {busy ? 'Saving...' : 'Save Reply'}
        </button>
      </div>
    </div>
  );
}

export default function Reviews() {
  const modal = useModal();
  const toast = useToast();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await db
      .from('reviews')
      .select('*,products(id,name)')
      .order('created_at', { ascending: false });
    if (error) {
      toast.show(`Reviews load nahi hue: ${error.message}`, { type: 'error' });
      setReviews([]);
      setLoading(false);
      return;
    }
    setReviews(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function setStatus(r, status) {
    const { error } = await db.from('reviews').update({ status, updated_at: new Date().toISOString() }).eq('id', r.id);
    if (error) { toast.show(`Update nahi hua: ${error.message}`, { type: 'error' }); return; }
    audit(`review.${status}`, 'review', r.id, { rating: r.rating });
    toast.show(status === 'approved' ? 'Review approve ho gayi ✅ (ab customer site par dikhegi)' : `Review ${status}`, { type: 'success' });
    load();
  }

  function openReply(r) {
    modal.open({
      title: `Reply to ${r.customer_name || 'customer'}`,
      content: <ReplyForm review={r} busy={busy} onSave={async (reply) => {
        setBusy(true);
        const { error } = await db.from('reviews').update({ admin_reply: reply || null }).eq('id', r.id);
        setBusy(false);
        if (error) { toast.show(`Reply save nahi hua: ${error.message}`, { type: 'error' }); return; }
        audit('review.reply', 'review', r.id, { reply });
        modal.close();
        toast.show('Reply save ho gaya ✅', { type: 'success' });
        load();
      }} />,
    });
  }

  async function handleDelete(r) {
    const confirmed = await modal.confirm({
      title: 'Delete review?',
      message: 'Ye review permanently delete ho jayega.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    const { error } = await db.from('reviews').delete().eq('id', r.id);
    if (error) { toast.show(`Delete nahi hua: ${error.message}`, { type: 'error' }); return; }
    audit('review.delete', 'review', r.id);
    toast.show('Review delete ho gayi', { type: 'success' });
    load();
  }

  const filtered = filter === 'All' ? reviews : reviews.filter((r) => r.status === filter);
  const counts = {
    All: reviews.length,
    Pending: reviews.filter((r) => r.status === 'pending').length,
    Approved: reviews.filter((r) => r.status === 'approved').length,
    Rejected: reviews.filter((r) => r.status === 'rejected').length,
  };

  return (
    <AppLayout title="Reviews">
      <div className="section-title">Review Management</div>
      <div className="section-sub">Approve karein to hi review customer site par public dikhega — unapproved reviews hidden rehte hain</div>

      <div className="table-wrap">
        <div className="table-head">
          <div className="filter-row">
            {FILTERS.map((f) => (
              <button key={f} type="button" className={`filter-chip${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)} aria-pressed={filter === f}>
                {f} <span className="rev-count">{counts[f]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>Product</th><th>Customer</th><th>Rating</th><th>Review</th><th>Status</th><th>Date</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7}><div className="skel" style={{ height: 20 }} aria-hidden="true" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--gray)' }}>Koi review nahi mila</td></tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 700 }}>{r.products?.name || '—'}</td>
                    <td>{r.customer_name || 'Guest'}</td>
                    <td><Stars rating={r.rating} /></td>
                    <td style={{ maxWidth: 260 }}>
                      <div style={{ whiteSpace: 'normal', lineHeight: 1.45 }}>{r.comment || '—'}</div>
                      {r.title && <div style={{ fontSize: '0.72rem', color: 'var(--gray)', marginTop: 2 }}>{r.title}</div>}
                      {r.admin_reply && (
                        <div className="rev-reply-bubble">↩️ Admin: {r.admin_reply}</div>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${r.status === 'approved' ? 'b-delivered' : r.status === 'rejected' ? 'b-cancelled' : 'b-pending'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td>{formatDateTime(r.created_at)}</td>
                    <td>
                      <div className="row-actions">
                        {r.status !== 'approved' && (
                          <button className="act-btn primary" onClick={() => setStatus(r, 'approved')}>✅ Approve</button>
                        )}
                        {r.status !== 'rejected' && (
                          <button className="act-btn" onClick={() => setStatus(r, 'rejected')}>❌ Reject</button>
                        )}
                        <button className="act-btn" onClick={() => openReply(r)}>💬 Reply</button>
                        <button className="act-btn danger" onClick={() => handleDelete(r)}>🗑️</button>
                      </div>
                    </td>
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
