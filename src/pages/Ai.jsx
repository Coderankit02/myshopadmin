import AppLayout from '../components/AppLayout';
import { useToast } from '../context/ToastContext';
import '../pagestyles/ai.css';

export default function Ai() {
  const toast = useToast();

  return (
    <AppLayout title="Ananya AI">
      <div className="section-title">Ananya AI Management</div>
      <div className="section-sub">AI assistant ka usage aur feedback monitor karein</div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-top"><div className="stat-icon" style={{ background: '#8B5CF622', color: '#8B5CF6' }}>🤖</div></div>
          <div className="stat-val">Enabled</div><div className="stat-label">AI Status</div>
        </div>
        <div className="stat-card">
          <div className="stat-top"><div className="stat-icon" style={{ background: '#3B82F622', color: '#3B82F6' }}>💬</div></div>
          <div className="stat-val">186</div><div className="stat-label">Conversations Today</div>
        </div>
        <div className="stat-card">
          <div className="stat-top"><div className="stat-icon" style={{ background: '#FFB80022', color: '#FFB800' }}>🔢</div></div>
          <div className="stat-val">42.3K</div><div className="stat-label">Tokens Used Today</div>
        </div>
        <div className="stat-card">
          <div className="stat-top"><div className="stat-icon" style={{ background: '#1BA67222', color: '#1BA672' }}>👍</div></div>
          <div className="stat-val">92%</div><div className="stat-label">Positive Feedback</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Quick Controls</h3></div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn-main" onClick={() => toast.show('Disable AI Assistant — hook this up to your AI config when ready.')}>
            Disable AI Assistant
          </button>
          <button className="btn-ghost" onClick={() => toast.show('Conversation logs — hook this up when ready.')}>
            View Conversation Logs
          </button>
          <button className="btn-ghost" onClick={() => toast.show('Export feedback report — hook this up when ready.')}>
            Export Feedback Report
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
