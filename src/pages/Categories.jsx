import AppLayout from '../components/AppLayout';
import { useToast } from '../context/ToastContext';
import '../pagestyles/categories.css';

const CATEGORIES = [
  { name: 'Dairy', count: 24 },
  { name: 'Grocery', count: 40 },
  { name: 'Snacks', count: 18 },
  { name: 'Bakery', count: 9 },
  { name: 'Fruits & Veg', count: 30 },
  { name: 'Personal Care', count: 15 },
];

export default function Categories() {
  const toast = useToast();

  return (
    <AppLayout title="Categories">
      <div className="section-title">Categories Management</div>
      <div className="section-sub">Categories add, reorder ya edit karein</div>

      <div className="stat-grid">
        {CATEGORIES.map((c, i) => (
          <div className="stat-card" key={i}>
            <div className="stat-top">
              <div className="stat-icon" style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}>
                🗂️
              </div>
              <button
                className="act-btn"
                onClick={() => toast.show('Edit category — hook this up to your categories table when ready.')}
              >
                Edit
              </button>
            </div>
            <div className="stat-val" style={{ fontSize: '1rem' }}>{c.name}</div>
            <div className="stat-label">{c.count} products</div>
          </div>
        ))}
        <div className="stat-card" style={{ alignItems: 'center', justifyContent: 'center', border: '1.5px dashed var(--border)' }}>
          <button
            className="btn-ghost"
            onClick={() => toast.show('Add category — hook this up to your categories table when ready.')}
          >
            + Add Category
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
