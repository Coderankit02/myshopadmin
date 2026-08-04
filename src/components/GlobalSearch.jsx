import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/supabase';
import { statusLabel, statusBadgeClass, formatDateTime } from '../lib/utils';

const MIN_QUERY = 2;
const DEBOUNCE_MS = 300;

/**
 * GlobalSearch — topbar "Search Everywhere".
 * Ek hi input se Orders + Products + Customers teeno mein live search hota hai,
 * results grouped dropdown mein dikhte hain, aur click karne par sahi page par
 * deep-link ho jata hai:
 *   • Order      → /orders      (state.openOrderId → OrderDetail khulta hai)
 *   • Product    → /products    (state.searchQuery → search prefill)
 *   • Customer   → /customers   (state.highlightId → row highlight)
 */
export default function GlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null); // { orders, products, customers }
  const boxRef = useRef(null);
  const timer = useRef(null);
  const fetchId = useRef(0); // stale-response guard (jaise useOrders mein)

  // Debounced search — 2+ chars hone par hi query chalti hai.
  // (set-state-in-effect lint rule ke liye effect mein directly state set nahi
  // karte — sab kuch setTimeout callback ke andar hota hai, jo allowed hai.)
  useEffect(() => {
    const q = query.trim();
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (q.length < MIN_QUERY) {
        setResults(null);
        setOpen(false);
        return;
      }
      const id = ++fetchId.current;
      setLoading(true);
      try {
        const s = q;
        const [oRes, pRes, cRes] = await Promise.all([
          // Orders: order_number / customer name / phone
          db.from('orders')
            .select('id,order_number,delivery_name,delivery_phone,final_amount,status,created_at')
            .or(`order_number.ilike.%${s}%,delivery_name.ilike.%${s}%,delivery_phone.ilike.%${s}%`)
            .order('created_at', { ascending: false })
            .limit(4),
          // Products: name / description / SKU
          db.from('products')
            .select('id,name,unit_value,selling_price,stock_quantity,is_active')
            .or(`name.ilike.%${s}%,description.ilike.%${s}%,sku.ilike.%${s}%`)
            .limit(4),
          // Customers: name / phone / email
          db.from('profiles')
            .select('id,name,phone,email')
            .or(`name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`)
            .limit(4),
        ]);
        if (id !== fetchId.current) return; // nayi query pehle aa gayi — stale result mat dikhao
        setResults({
          orders: oRes.data || [],
          products: pRes.data || [],
          customers: cRes.data || [],
        });
        setOpen(true);
      } catch {
        if (id !== fetchId.current) return;
        // Supabase error (e.g. column missing) — khaali dropdown dikhao, crash nahi
        setResults({ orders: [], products: [], customers: [] });
        setOpen(true);
      }
      if (id === fetchId.current) setLoading(false);
    }, DEBOUNCE_MS); // proper debounce — 300ms, empty-query clear bhi async hota hai
    return () => clearTimeout(timer.current);
  }, [query]);

  // Outside click → dropdown band
  useEffect(() => {
    function onDocClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function go(handler) {
    setOpen(false);
    setQuery('');
    setResults(null);
    handler();
  }

  const total = results
    ? (results.orders.length + results.products.length + results.customers.length)
    : 0;

  return (
    <div className="gs-wrap" ref={boxRef} role="search" aria-label="Global search">
      <span className="gs-icon" aria-hidden="true">🔍</span>
      <input
        id="topbar-search"
        type="search"
        placeholder="Search orders, products, customers..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results && setOpen(true)}
        aria-label="Search everywhere — orders, products, customers"
        autoComplete="off"
      />
      {query.length >= MIN_QUERY && open && (
        <div className="gs-dropdown">
          {loading && (
            <div className="gs-status">
              <span className="skel" style={{ width: 60, height: 12, display: 'inline-block' }} aria-hidden="true" />
              Searching…
            </div>
          )}

          {!loading && total === 0 && (
            <div className="gs-empty">
              <div className="gs-empty-icon">🔍</div>
              <div>Kuch nahi mila <b>"{query.trim()}"</b> ke liye</div>
              <div className="gs-empty-sub">Orders, products ya customers mein try karein</div>
            </div>
          )}

          {!loading && results?.orders.length > 0 && (
            <div className="gs-group">
              <div className="gs-group-title">🧾 Orders ({results.orders.length})</div>
              {results.orders.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className="gs-item"
                  onClick={() => go(() => navigate('/orders', { state: { openOrderId: o.id } }))}
                >
                  <span className="gs-item-avatar">{o.delivery_name?.[0] || '#'}</span>
                  <span className="gs-item-main">
                    <span className="gs-item-title">{o.delivery_name} · {o.order_number}</span>
                    <span className="gs-item-sub">₹{Number(o.final_amount || 0).toLocaleString('en-IN')} · {formatDateTime(o.created_at)}</span>
                  </span>
                  <span className={`badge ${statusBadgeClass(o.status)}`}>{statusLabel(o.status)}</span>
                </button>
              ))}
            </div>
          )}

          {!loading && results?.products.length > 0 && (
            <div className="gs-group">
              <div className="gs-group-title">🛒 Products ({results.products.length})</div>
              {results.products.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="gs-item"
                  onClick={() => go(() => navigate('/products', { state: { searchQuery: p.name } }))}
                >
                  <span className="gs-item-avatar gs-avatar-prod">🛒</span>
                  <span className="gs-item-main">
                    <span className="gs-item-title">{p.name}</span>
                    <span className="gs-item-sub">
                      {p.unit_value || '—'} · ₹{p.selling_price} · Stock {p.stock_quantity ?? 0}
                    </span>
                  </span>
                  <span className={`badge ${p.is_active ? 'b-delivered' : 'b-cancelled'}`}>
                    {p.is_active ? 'Active' : 'Inactive'}
                  </span>
                </button>
              ))}
            </div>
          )}

          {!loading && results?.customers.length > 0 && (
            <div className="gs-group">
              <div className="gs-group-title">👥 Customers ({results.customers.length})</div>
              {results.customers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="gs-item"
                  onClick={() => go(() => navigate('/customers', { state: { highlightId: c.id } }))}
                >
                  <span className="gs-item-avatar">{c.name?.[0] || '?'}</span>
                  <span className="gs-item-main">
                    <span className="gs-item-title">{c.name || 'Guest'}</span>
                    <span className="gs-item-sub">{c.phone || '—'} {c.email ? `· ${c.email}` : ''}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
