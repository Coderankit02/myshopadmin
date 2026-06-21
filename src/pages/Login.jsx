import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles_login.css';

export default function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const result = await login(email.trim(), password);

    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    navigate('/dashboard');
  }

  return (
    <div id="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-logo">🔐</div>
        <div className="login-title">Admin Dashboard</div>
        <div className="login-sub">Rinku Kirana — Unified Admin Panel</div>
        {error && <div className="login-error show">{error}</div>}
        <div className="field-group">
          <label className="field-label">Email</label>
          <input
            className="field-input"
            type="email"
            placeholder="admin@example.com"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Password</label>
          <input
            className="field-input"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="login-btn" type="submit" disabled={submitting}>
          {submitting ? '⏳ Checking...' : '🔑 Login'}
        </button>
      </form>
    </div>
  );
}
