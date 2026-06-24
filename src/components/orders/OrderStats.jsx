/**
 * OrderStats.jsx — Dashboard stat cards for Orders page
 */
export default function OrderStats({ stats, loading }) {
  const CARDS = stats ? [
    { icon: '🧾', color: '#3B82F6', label: 'Total Orders',     val: stats.total },
    { icon: '📅', color: '#1BA672', label: "Today's Orders",   val: stats.todayOrders },
    { icon: '⏳', color: '#FFB800', label: 'Pending',           val: stats.pending },
    { icon: '✅', color: '#1BA672', label: 'Confirmed',         val: stats.confirmed },
    { icon: '📦', color: '#8B5CF6', label: 'Packed',            val: stats.packed },
    { icon: '🚚', color: '#3B82F6', label: 'Out For Delivery', val: stats.out_for_delivery },
    { icon: '🎉', color: '#1BA672', label: 'Delivered',         val: stats.delivered },
    { icon: '❌', color: '#E63946', label: 'Cancelled',         val: stats.cancelled },
    { icon: '💰', color: '#FFB800', label: "Today Revenue",    val: `₹${(stats.todayRevenue||0).toLocaleString('en-IN')}` },
    { icon: '📆', color: '#8B5CF6', label: 'Monthly Revenue',  val: `₹${(stats.monthRevenue||0).toLocaleString('en-IN')}` },
  ] : [];

  if (loading) {
    return (
      <div className="stat-grid ord-stat-grid" aria-busy="true">
        {Array.from({ length: 10 }).map((_, i) => (
          <div className="stat-card" key={i}>
            <div className="skel" style={{ height: 68 }} aria-hidden="true" />
            {i === 0 && <span className="sr-only">Loading stats…</span>}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="stat-grid ord-stat-grid">
      {CARDS.map((c, i) => (
        <div className="stat-card" key={i}>
          <div className="stat-top">
            <div className="stat-icon" style={{ background: c.color + '22', color: c.color }}>
              {c.icon}
            </div>
          </div>
          <div className="stat-val">{c.val}</div>
          <div className="stat-label">{c.label}</div>
        </div>
      ))}
    </div>
  );
}
