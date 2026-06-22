import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// BUG FIX (Info #14): Naya 404 page.
// Logged-in admin ke liye dashboard link dikhata hai.
// Non-logged user ke liye login redirect.
export default function NotFound() {
  const { user } = useAuth();

  if (!user) {
    // Non-logged user ko login bhejo
    return <Link to="/" replace />;
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', gap: 16,
      fontFamily: 'Inter, sans-serif', color: 'var(--text)',
    }}>
      <div style={{ fontSize: '4rem' }}>🔍</div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Page nahi mili</h1>
      <p style={{ color: 'var(--gray)', fontSize: '0.9rem' }}>
        Yeh URL exist nahi karta ya aapke paas access nahi hai.
      </p>
      <Link
        to="/dashboard"
        style={{
          background: 'var(--primary)', color: '#fff',
          padding: '10px 24px', borderRadius: 10,
          fontWeight: 700, textDecoration: 'none', fontSize: '0.9rem',
        }}
      >
        Dashboard par jaayein
      </Link>
    </div>
  );
}
