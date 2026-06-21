import AppLayout from '../components/AppLayout';
import { useModal } from '../context/ModalContext';
import { useToast } from '../context/ToastContext';
import { formatINR } from '../lib/utils';
import '../pagestyles/customers.css';

const CUSTOMERS = [
  { name: 'Anjali Sharma', phone: '98765 43210', orders: 14, spend: 8420, joined: 'Mar 2025' },
  { name: 'Vikram Singh', phone: '91234 56780', orders: 6, spend: 2310, joined: 'Jan 2026' },
  { name: 'Pooja Mehta', phone: '99887 76655', orders: 22, spend: 15600, joined: 'Aug 2024' },
];

export default function Customers() {
  const modal = useModal();
  const toast = useToast();

  function viewCustomer(c) {
    modal.open({
      title: c.name,
      content: (
        <>
          <div className="list-row"><div className="list-main"><div className="list-sub">Phone</div></div><div className="list-val">{c.phone}</div></div>
          <div className="list-row"><div className="list-main"><div className="list-sub">Orders</div></div><div className="list-val">{c.orders}</div></div>
          <div className="list-row"><div className="list-main"><div className="list-sub">Total Spend</div></div><div className="list-val">₹{formatINR(c.spend)}</div></div>
          <div className="list-row"><div className="list-main"><div className="list-sub">Joined</div></div><div className="list-val">{c.joined}</div></div>
        </>
      ),
    });
  }

  async function blockCustomer(c) {
    const confirmed = await modal.confirm({
      title: 'Block customer?',
      message: `Block ${c.name} from placing new orders?`,
      confirmLabel: 'Block',
      danger: true,
    });
    if (confirmed) toast.show('Block customer — hook this up to your customers table when ready.');
  }

  return (
    <AppLayout title="Customers">
      <div className="section-title">Customers Management</div>
      <div className="section-sub">Customer profiles aur unki order history dekhein</div>

      <div className="table-wrap">
        <div className="table-head">
          <div className="filter-row">
            <button type="button" className="filter-chip on" aria-pressed="true">All</button>
            <button type="button" className="filter-chip">Active</button>
            <button type="button" className="filter-chip">Blocked</button>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>Name</th><th>Phone</th><th>Orders</th><th>Total Spend</th><th>Joined</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {CUSTOMERS.map((c, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 700 }}>{c.name}</td>
                  <td>{c.phone}</td>
                  <td>{c.orders}</td>
                  <td>₹{formatINR(c.spend)}</td>
                  <td>{c.joined}</td>
                  <td>
                    <div className="row-actions">
                      <button className="act-btn primary" onClick={() => viewCustomer(c)}>View</button>
                      <button className="act-btn danger" onClick={() => blockCustomer(c)}>Block</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
