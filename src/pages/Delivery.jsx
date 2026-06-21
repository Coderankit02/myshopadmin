import { useEffect, useState } from 'react';
import AppLayout from '../components/AppLayout';
import { useToast } from '../context/ToastContext';
import { db } from '../lib/supabase';
import { statusBadgeClass, statusLabel } from '../lib/utils';
import '../pagestyles/delivery.css';

function pinLink(lat, lng, label) {
  const q = label ? encodeURIComponent(label) : `${lat},${lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${q}&center=${lat},${lng}`;
}

export default function Delivery() {
  const toast = useToast();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data, error } = await db
      .from('orders')
      .select('id,order_number,delivery_name,delivery_phone,distance_km,delivery_charge,delivery_status,latitude,longitude,status,created_at')
      .in('status', ['confirmed', 'out_for_delivery'])
      .order('created_at', { ascending: false });
    if (error) {
      toast.show(`Deliveries load nahi ho payi: ${error.message}`, { type: 'error' });
      setOrders([]);
    } else {
      setOrders(data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const outForDelivery = orders.filter((o) => o.status === 'out_for_delivery');
  const freeToday = orders.filter((o) => (o.delivery_charge || 0) === 0).length;
  const distances = orders.filter((o) => o.distance_km != null).map((o) => o.distance_km);
  const avgDistance = distances.length ? (distances.reduce((s, d) => s + d, 0) / distances.length).toFixed(1) : '—';

  const STATS = [
    { icon: '🚴', color: '#1BA672', val: String(outForDelivery.length), label: 'Out For Delivery' },
    { icon: '📍', color: '#3B82F6', val: distances.length ? `${avgDistance} km` : '—', label: 'Avg Distance' },
    { icon: '🆓', color: '#FFB800', val: String(freeToday), label: 'Free Deliveries (active)' },
    { icon: '📦', color: '#8B5CF6', val: String(orders.length), label: 'Active Deliveries' },
  ];

  return (
    <AppLayout title="Delivery">
      <div className="section-title">Delivery Management</div>
      <div className="section-sub">Confirmed aur out-for-delivery orders — live Supabase data</div>

      <div className="stat-grid" aria-busy={loading}>
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div className="stat-card" key={i}><div className="skel" style={{ height: 70 }} aria-hidden="true" /></div>
            ))
          : STATS.map((s, i) => (
              <div className="stat-card" key={i}>
                <div className="stat-top"><div className="stat-icon" style={{ background: s.color + '22', color: s.color }}>{s.icon}</div></div>
                <div className="stat-val">{s.val}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
      </div>

      <div className="table-wrap">
        <div className="table-head"><h3 style={{ fontSize: '0.96rem', fontWeight: 800 }}>Active Deliveries</h3></div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Order ID</th><th>Customer</th><th>Distance</th><th>Charge</th><th>Status</th><th>Map</th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6}><div className="skel" style={{ height: 20 }} aria-hidden="true" /></td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--gray)' }}>Abhi koi active delivery nahi hai</td></tr>
              ) : (
                orders.map((d) => (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 700 }}>{d.order_number}</td>
                    <td>{d.delivery_name}</td>
                    <td>{d.distance_km != null ? `${Number(d.distance_km).toFixed(1)} km` : '—'}</td>
                    <td>{(d.delivery_charge || 0) === 0 ? 'FREE' : `₹${d.delivery_charge}`}</td>
                    <td><span className={`badge ${statusBadgeClass(d.status)}`}>{statusLabel(d.status)}</span></td>
                    <td>
                      {d.latitude && d.longitude ? (
                        <a className="act-btn" href={pinLink(d.latitude, d.longitude, d.delivery_name)} target="_blank" rel="noopener noreferrer">🗺️ Open</a>
                      ) : (
                        <span style={{ color: 'var(--gray)', fontSize: '0.78rem' }}>No GPS data</span>
                      )}
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
