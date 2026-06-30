/**
 * useOrders.js — Central data hook for Orders page
 * Handles: fetching, filters, pagination, realtime, stats, status updates,
 * bulk actions, COD collection, returns, and CSV export.
 *
 * BUG FIXES applied here (see comments inline for each):
 *  1. Stale orders list after status update  -> optimistic local patch on every mutation
 *  2. Unbounded stats queries (whole-table download) -> count(head:true) + capped, projected selects
 *  3. Realtime channel re-created on every filter change -> single subscription, refs for latest callbacks
 *  4. Double API call / race condition on filter change -> filter setters batch the page reset themselves
 *  7. CSV export only exported the current page -> now re-queries ALL matching rows + items
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { notifyNewOrder } from '../lib/orderAlerts';

export const PAGE_SIZE = 50;

export const VALID_TRANSITIONS = {
  pending:          ['confirmed', 'cancelled'],
  confirmed:        ['packed', 'cancelled'],
  packed:           ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered:        ['returned'],   // Feature: order return/refund workflow
  cancelled:        [],
  returned:         [],
};

// Reasons shown in the UI when an admin cancels or returns an order (Feature: cancellation reason tracking)
export const CANCELLATION_REASONS = [
  'Out of stock', 'Customer ne mana kiya', 'Address nahi mila',
  'Duplicate order', 'Payment issue', 'Other',
];
export const RETURN_REASONS = [
  'Item damaged', 'Wrong item delivered', 'Quality issue', 'Customer changed mind', 'Other',
];

export function useOrders() {
  const toast = useToast();

  const [filter, setFilterRaw]               = useState('all');
  const [search, setSearchRaw]               = useState('');
  const [paymentFilter, setPaymentFilterRaw] = useState('all');
  const [pincodeFilter, setPincodeFilterRaw] = useState(''); // Feature: delivery area / pincode grouping
  const [dateFrom, setDateFromRaw]           = useState('');
  const [dateTo, setDateToRaw]               = useState('');
  const [page, setPage]                      = useState(1);

  // BUG FIX (Medium #4): every filter setter resets the page to 1 in the SAME state update
  // batch as the filter change itself, instead of relying on a separate effect that watches
  // [filter, search, ...] and calls setPage(1) a moment later. That old approach caused TWO
  // fetches per filter change (one with the old page, one after the page-reset re-render).
  // Because React 18 batches these two setState calls together, `load` (which depends on both
  // `page` and the filter) only ever gets a single new identity per user action -> one fetch.
  const setFilter        = useCallback((v) => { setPage(1); setFilterRaw(v); }, []);
  const setSearch         = useCallback((v) => { setPage(1); setSearchRaw(v); }, []);
  const setPaymentFilter = useCallback((v) => { setPage(1); setPaymentFilterRaw(v); }, []);
  const setPincodeFilter  = useCallback((v) => { setPage(1); setPincodeFilterRaw(v); }, []);
  const setDateFrom      = useCallback((v) => { setPage(1); setDateFromRaw(v); }, []);
  const setDateTo        = useCallback((v) => { setPage(1); setDateToRaw(v); }, []);

  const [orders, setOrders]   = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats]     = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const fetchId = useRef(0);

  const buildFilteredQuery = useCallback((base) => {
    let q = base;
    if (filter !== 'all') q = q.eq('status', filter);
    if (paymentFilter !== 'all') q = q.eq('payment_method', paymentFilter);
    if (pincodeFilter.trim()) q = q.eq('delivery_pincode', pincodeFilter.trim());
    if (dateFrom) q = q.gte('created_at', new Date(dateFrom).toISOString());
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      q = q.lte('created_at', end.toISOString());
    }
    if (search.trim()) {
      const s = search.trim();
      q = q.or(`order_number.ilike.%${s}%,delivery_name.ilike.%${s}%,delivery_phone.ilike.%${s}%`);
    }
    return q;
  }, [filter, paymentFilter, pincodeFilter, dateFrom, dateTo, search]);

  const load = useCallback(async () => {
    const id = ++fetchId.current;
    setLoading(true);

    const q = buildFilteredQuery(
      db.from('orders').select('*', { count: 'exact' }).order('created_at', { ascending: false })
    ).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    const { data, error, count } = await q;
    if (id !== fetchId.current) return; // a newer request already won

    if (error) {
      toast.show(`Orders load nahi ho paye: ${error.message}`, { type: 'error' });
      setOrders([]); setTotal(0);
    } else {
      setOrders(data || []); setTotal(count || 0);
    }
    setLoading(false);
  }, [buildFilteredQuery, page, toast]);

  // BUG FIX (Critical #2): pehle yeh teen `select('id,status,final_amount')` queries
  // pure `orders` table ko bina kisi limit/range ke download karti thi (cancelled rows
  // bhi). Bade dataset par yeh slow / memory-heavy / crash-prone tha. Ab:
  //   - counts ke liye sirf `count: 'exact', head: true` use karte hain — koi row data
  //     network par nahi aata, sirf ek number.
  //   - revenue sirf relevant column (`final_amount`) aur sirf us time-window (today/month)
  //     ke rows se nikalte hain, with a hard safety cap (SUM_CAP) so even a huge single
  //     day can never balloon into an unbounded download.
  const SUM_CAP = 20000;
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const statuses = ['pending', 'confirmed', 'packed', 'out_for_delivery', 'delivered', 'cancelled', 'returned'];
    const countOf = (q) => q.then(({ count, error }) => (error ? 0 : count || 0));

    const [
      totalCount,
      todayCount,
      statusCounts,
      todayAmtRes,
      monthAmtRes,
    ] = await Promise.all([
      countOf(db.from('orders').select('id', { count: 'exact', head: true })),
      countOf(db.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', todayStart.toISOString())),
      Promise.all(statuses.map((s) => countOf(db.from('orders').select('id', { count: 'exact', head: true }).eq('status', s)))),
      db.from('orders').select('final_amount').neq('status', 'cancelled')
        .gte('created_at', todayStart.toISOString()).limit(SUM_CAP),
      db.from('orders').select('final_amount').neq('status', 'cancelled')
        .gte('created_at', monthStart.toISOString()).limit(SUM_CAP),
    ]);

    const sum = (res) => (res.data || []).reduce((s, o) => s + (o.final_amount || 0), 0);
    const statusMap = {};
    statuses.forEach((s, i) => { statusMap[s] = statusCounts[i]; });

    setStats({
      total: totalCount,
      todayOrders: todayCount,
      ...statusMap,
      todayRevenue: sum(todayAmtRes),
      monthRevenue: sum(monthAmtRes),
    });
    setStatsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadStats(); }, [loadStats]);

  // BUG FIX (Critical #3): pehle yeh effect [load, loadStats] par depend karta tha — aur
  // `load`/`loadStats` har filter change par naya function reference ban jaate the. Isse
  // har filter change par purana channel hatao + naya 'orders-rt-v2' channel banao hota
  // tha, aur agar cleanup race ho jaye to stale subscriptions stack ho sakti thi.
  // Ab subscription ek hi baar mount par banti hai (empty deps), aur refs ke through
  // hamesha latest load/loadStats call hoti hai — koi resubscribe nahi.
  // Feature #1 (naya order notification) bhi yahi hook karta hai: INSERT event par
  // browser notification + beep.
  const loadRef = useRef(load);
  const loadStatsRef = useRef(loadStats);
  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => { loadStatsRef.current = loadStats; }, [loadStats]);

  useEffect(() => {
    const channel = db
      .channel('orders-rt-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        loadRef.current();
        loadStatsRef.current();
        if (payload.eventType === 'INSERT') notifyNewOrder(payload.new);
      })
      .subscribe();
    return () => { db.removeChannel(channel); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- intentionally subscribe once

  // BUG FIX (Critical #1): har mutation ke baad sirf DB update karke chhod dena kaafi nahi
  // tha — list ko fresh data milta tha sirf agar realtime event time par fire ho jaye.
  // Ab har success ke baad `orders` array ko turant (optimistically) patch karte hain, taaki
  // "Back to Orders" par turant sahi status dikhe, realtime ki latency par depend kiye bina.
  const patchOrderLocally = useCallback((id, patch) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }, []);

  // BUG FIX (Critical #4, follow-up): ab jab order place hota hai to stock kam hota hai
  // (customer-side orders.js), to jab admin order cancel/return karta hai, stock wapas
  // add hona chahiye — warna cancelled orders ka stock hamesha "lost" reh jayega.
  const restoreStockForOrder = useCallback(async (orderId) => {
    try {
      const { data: items, error } = await db.from('order_items').select('product_id,qty').eq('order_id', orderId);
      if (error || !items?.length) return;
      for (const it of items) {
        if (!it.product_id) continue;
        const { data: prod } = await db.from('products').select('id,stock_quantity').eq('id', it.product_id).maybeSingle();
        if (!prod) continue;
        await db.from('products').update({
          stock_quantity: (prod.stock_quantity || 0) + (it.qty || 0),
          updated_at: new Date().toISOString(),
        }).eq('id', prod.id);
      }
    } catch (_) { /* best-effort restore; don't block the cancellation flow */ }
  }, []);

  const updateStatus = useCallback(async (order, newStatus, extras = {}) => {
    const allowed = VALID_TRANSITIONS[order.status] || [];
    if (!allowed.includes(newStatus)) {
      toast.show(`❌ Yeh transition allowed nahi hai`, { type: 'error' });
      return null;
    }
    const updates = {
      status: newStatus,
      updated_at: new Date().toISOString(),
      ...(extras.deliveryPersonName !== undefined && { delivery_person_name: extras.deliveryPersonName }),
      ...(extras.deliveryNotes !== undefined && { delivery_notes: extras.deliveryNotes }),
      ...(extras.estimatedDelivery !== undefined && { estimated_delivery: extras.estimatedDelivery }),
      ...(extras.deliverySlot !== undefined && { delivery_slot: extras.deliverySlot }),
      ...(extras.cancellationReason !== undefined && { cancellation_reason: extras.cancellationReason }),
    };
    const { data, error } = await db.from('orders').update(updates).eq('id', order.id).select().single();
    if (error) { toast.show(`Update nahi hua: ${error.message}`, { type: 'error' }); return null; }

    try {
      await db.from('order_status_history').insert({ order_id: order.id, status: newStatus, changed_by: 'admin' });
    } catch (_) { /* ignore if table doesn't exist yet */ }

    if (newStatus === 'cancelled') {
      restoreStockForOrder(order.id); // fire-and-forget
    }

    patchOrderLocally(order.id, data);
    toast.show('✅ Status update ho gaya!', { type: 'success' });
    return data;
  }, [toast, patchOrderLocally, restoreStockForOrder]);

  // Feature: Bulk status update — select 20-30 orders, move them all in one go.
  const bulkUpdateStatus = useCallback(async (selectedOrders, newStatus) => {
    const eligible = selectedOrders.filter((o) => (VALID_TRANSITIONS[o.status] || []).includes(newStatus));
    const skipped = selectedOrders.length - eligible.length;
    if (eligible.length === 0) {
      toast.show('❌ Koi bhi selected order is status mein move nahi ho sakta', { type: 'error' });
      return { updated: 0, skipped };
    }
    const ids = eligible.map((o) => o.id);
    const { data, error } = await db.from('orders')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .in('id', ids)
      .select();
    if (error) {
      toast.show(`Bulk update nahi hua: ${error.message}`, { type: 'error' });
      return { updated: 0, skipped: selectedOrders.length };
    }
    try {
      await db.from('order_status_history').insert(ids.map((id) => ({ order_id: id, status: newStatus, changed_by: 'admin' })));
    } catch (_) { /* table optional */ }
    setOrders((prev) => prev.map((o) => {
      const fresh = (data || []).find((d) => d.id === o.id);
      return fresh ? { ...o, ...fresh } : o;
    }));
    toast.show(
      `✅ ${eligible.length} order(s) "${newStatus}" mein update ho gaye${skipped ? ` · ${skipped} skip (invalid transition)` : ''}`,
      { type: 'success' }
    );
    return { updated: eligible.length, skipped };
  }, [toast]);

  // Feature: COD payment collected confirmation
  const markCodCollected = useCallback(async (order, amount) => {
    const { data, error } = await db.from('orders').update({
      payment_status: 'paid',
      cod_collected_amount: amount,
      cod_collected_at: new Date().toISOString(),
    }).eq('id', order.id).select().single();
    if (error) { toast.show(`Save nahi hua: ${error.message}`, { type: 'error' }); return null; }
    patchOrderLocally(order.id, data);
    toast.show('💰 COD collection mark ho gayi', { type: 'success' });
    return data;
  }, [toast, patchOrderLocally]);

  // Feature: Order return / refund (partial or full)
  const initiateReturn = useCallback(async (order, { reason, returnType, refundAmount }) => {
    const allowed = VALID_TRANSITIONS[order.status] || [];
    if (!allowed.includes('returned')) {
      toast.show('❌ Yeh order ab return nahi ho sakta', { type: 'error' });
      return null;
    }
    const { data, error } = await db.from('orders').update({
      status: 'returned',
      return_reason: reason,
      return_type: returnType,
      refund_amount: refundAmount,
      updated_at: new Date().toISOString(),
    }).eq('id', order.id).select().single();
    if (error) { toast.show(`Return save nahi hua: ${error.message}`, { type: 'error' }); return null; }
    try {
      await db.from('order_status_history').insert({ order_id: order.id, status: 'returned', changed_by: 'admin' });
    } catch (_) { /* table optional */ }
    if (returnType === 'full' || !returnType) {
      restoreStockForOrder(order.id); // fire-and-forget — full return ke liye stock wapas
    }
    patchOrderLocally(order.id, data);
    toast.show('↩️ Return initiate ho gaya', { type: 'success' });
    return data;
  }, [toast, patchOrderLocally, restoreStockForOrder]);

  // Feature: Internal admin-only notes (never shown to the customer / on the invoice)
  const saveInternalNotes = useCallback(async (order, notes) => {
    const { data, error } = await db.from('orders').update({ internal_notes: notes }).eq('id', order.id).select().single();
    if (error) { toast.show(`Note save nahi hua: ${error.message}`, { type: 'error' }); return null; }
    patchOrderLocally(order.id, data);
    return data;
  }, [toast, patchOrderLocally]);

  // Feature: Edit Order — change item quantities / remove out-of-stock items, then
  // recalculate subtotal + final_amount. `editedItems` is the remaining desired list,
  // each needing { id, price, qty }. `removedIds` are order_items rows to delete.
  const updateOrderItems = useCallback(async (order, editedItems, removedIds = []) => {
    try {
      if (removedIds.length) {
        const { error: delErr } = await db.from('order_items').delete().in('id', removedIds);
        if (delErr) throw delErr;
      }
      for (const it of editedItems) {
        const line_total = Number(it.price || 0) * Number(it.qty || 0);
        const { error: updErr } = await db.from('order_items')
          .update({ qty: it.qty, line_total })
          .eq('id', it.id);
        if (updErr) throw updErr;
      }
      const newSubtotal = editedItems.reduce((s, it) => s + Number(it.price || 0) * Number(it.qty || 0), 0);
      const discount = Number(order.discount || 0);
      const deliveryCharge = Number(order.delivery_charge || 0);
      const newFinal = Math.max(0, newSubtotal - discount + deliveryCharge);

      const { data, error } = await db.from('orders').update({
        subtotal: newSubtotal,
        final_amount: newFinal,
        updated_at: new Date().toISOString(),
      }).eq('id', order.id).select().single();
      if (error) throw error;

      patchOrderLocally(order.id, data);
      toast.show('✅ Order items update ho gaye, total recalculate ho gaya', { type: 'success' });
      return data;
    } catch (error) {
      toast.show(`Order edit nahi hua: ${error.message}`, { type: 'error' });
      return null;
    }
  }, [toast, patchOrderLocally]);

  // Feature: Bulk WhatsApp — same templated message to many customers at once.
  // Browsers block more than ~1 window.open() outside a direct click, so this just
  // builds the wa.me links for the caller to walk through one by one.
  const buildBulkWhatsAppLinks = useCallback((selectedOrders, messageTemplate) => {
    return selectedOrders
      .filter((o) => o.delivery_phone)
      .map((o) => ({
        order: o,
        message: messageTemplate
          .replaceAll('{name}', o.delivery_name || 'Customer')
          .replaceAll('{order}', o.order_number || '')
          .replaceAll('{amount}', `₹${Number(o.final_amount || 0).toLocaleString('en-IN')}`),
      }));
  }, []);

  // BUG FIX (Medium #7) + Feature (CSV with items): pehle exportCSV sirf in-memory
  // `orders` (current page, max 50 rows) ko CSV banata tha. Ab woh saare filters ke
  // mutabik **saare matching pages** dobara query karta hai, aur har order ke
  // order_items bhi include karta hai (item-wise row) — accountant/stock check ke liye.
  const exportCSV = useCallback(async () => {
    setExporting(true);
    const q = buildFilteredQuery(db.from('orders').select('*').order('created_at', { ascending: false }));
    const { data: allOrders, error } = await q;
    if (error) {
      toast.show(`Export fail: ${error.message}`, { type: 'error' });
      setExporting(false);
      return;
    }

    const ids = (allOrders || []).map((o) => o.id);
    const itemsByOrder = {};
    if (ids.length) {
      const { data: items } = await db.from('order_items').select('*').in('order_id', ids);
      (items || []).forEach((it) => {
        (itemsByOrder[it.order_id] = itemsByOrder[it.order_id] || []).push(it);
      });
    }

    const rows = [[
      'Order ID', 'Customer', 'Phone', 'Item', 'Qty', 'Item Price', 'Item Total',
      'Order Amount', 'Payment', 'Pay Status', 'Status', 'Date',
    ]];
    (allOrders || []).forEach((o) => {
      const its = itemsByOrder[o.id] || [];
      const dateStr = new Date(o.created_at).toLocaleString('en-IN');
      if (its.length === 0) {
        rows.push([o.order_number, o.delivery_name, o.delivery_phone, '—', '—', '—', '—',
          o.final_amount, o.payment_method, o.payment_status, o.status, dateStr]);
      } else {
        its.forEach((it) => {
          rows.push([o.order_number, o.delivery_name, o.delivery_phone, it.name, it.qty,
            it.price, it.line_total, o.final_amount, o.payment_method, o.payment_status, o.status, dateStr]);
        });
      }
    });

    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    toast.show(`✅ CSV exported — ${allOrders.length} order(s), sabhi pages + items included`, { type: 'success' });
    setExporting(false);
  }, [buildFilteredQuery, toast]);

  return {
    orders, total, loading,
    stats, statsLoading,
    filter, setFilter,
    search, setSearch,
    paymentFilter, setPaymentFilter,
    pincodeFilter, setPincodeFilter,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    page, setPage,
    pageSize: PAGE_SIZE,
    totalPages: Math.ceil(total / PAGE_SIZE),
    load, loadStats,
    updateStatus, bulkUpdateStatus,
    markCodCollected, initiateReturn, saveInternalNotes,
    updateOrderItems, buildBulkWhatsAppLinks,
    patchOrderLocally,
    exportCSV, exporting,
    validTransitions: VALID_TRANSITIONS,
  };
}