import { useEffect, useState } from 'react';
import AppLayout from '../components/AppLayout';
import { useModal } from '../context/ModalContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/supabase';
import { audit } from '../lib/audit';
import { roleLabel } from '../lib/auth';
import { formatDateTime } from '../lib/utils';
import '../pagestyles/team.css';

const ROLE_OPTIONS = ['super_admin', 'manager', 'staff', 'delivery', 'support'];

function RoleBadge({ role }) {
  const map = {
    super_admin: { cls: 'team-badge', label: '👑 Super Admin' },
    admin: { cls: 'team-badge', label: '👑 Admin' },
    manager: { cls: 'team-badge', label: '📋 Manager' },
    staff: { cls: 'team-badge', label: '🧑‍💼 Staff' },
    delivery: { cls: 'team-badge', label: '🚴 Delivery' },
    support: { cls: 'team-badge', label: '🎧 Support' },
  };
  const m = map[role] || { cls: 'team-badge', label: role || '—' };
  return <span className={m.cls}>{m.label}</span>;
}

export default function Team() {
  const { user } = useAuth();
  const modal = useModal();
  const toast = useToast();
  const [team, setTeam] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [profileSearch, setProfileSearch] = useState('');
  const [selectedProfile, setSelectedProfile] = useState('');
  const [newRole, setNewRole] = useState('staff');

  async function load() {
    setLoading(true);
    const [{ data: teamRows }, { data: profs }] = await Promise.all([
      db.from('admin_team').select('*').order('created_at', { ascending: false }),
      db.from('profiles').select('id,name,phone,email').order('name').limit(2000),
    ]);
    const byId = {};
    (profs || []).forEach((p) => { byId[p.id] = p; });
    setTeam((teamRows || []).map((t) => ({ ...t, profile: byId[t.user_id] || null })));
    setProfiles(profs || []);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Agar admin_team khaali hai to current admin ko seed karo (purane system ka admin)
  async function seedCurrent() {
    if (!user) return;
    const { data: existing } = await db.from('admin_team').select('user_id').eq('user_id', user.id).maybeSingle();
    if (existing) { toast.show('Aap already team mein hain', { type: 'error' }); return; }
    const { error } = await db.from('admin_team').insert({
      user_id: user.id,
      email: user.email,
      name: user.user_metadata?.full_name || user.email,
      role: 'super_admin',
      is_active: true,
    });
    if (error) { toast.show(`Seed nahi hua: ${error.message}`, { type: 'error' }); return; }
    audit('team.seed', 'admin_team', user.id, { role: 'super_admin' });
    toast.show('Aap Super Admin ban gaye ✅', { type: 'success' });
    load();
  }

  async function addMember() {
    if (!selectedProfile) { toast.show('Pehle ek profile select karein', { type: 'error' }); return; }
    const prof = profiles.find((p) => p.id === selectedProfile);
    setBusy(true);
    const { error } = await db.from('admin_team').insert({
      user_id: prof.id,
      email: prof.email || null,
      name: prof.name || null,
      role: newRole,
      is_active: true,
    });
    setBusy(false);
    if (error) { toast.show(`Add nahi hua: ${error.message}`, { type: 'error' }); return; }
    audit('team.add', 'admin_team', prof.id, { role: newRole });
    toast.show(`${prof.name || prof.id} team mein add ho gaye ✅`, { type: 'success' });
    setSelectedProfile(''); setProfileSearch('');
    load();
  }

  async function changeRole(t, role) {
    const { error } = await db.from('admin_team').update({ role, updated_at: new Date().toISOString() }).eq('user_id', t.user_id);
    if (error) { toast.show(`Role change nahi hua: ${error.message}`, { type: 'error' }); return; }
    audit('team.role_change', 'admin_team', t.user_id, { from: t.role, to: role });
    toast.show(`Role → ${roleLabel(role)}`, { type: 'success' });
    load();
  }

  async function toggleActive(t) {
    const { error } = await db.from('admin_team').update({ is_active: !t.is_active, updated_at: new Date().toISOString() }).eq('user_id', t.user_id);
    if (error) { toast.show(`Update nahi hua: ${error.message}`, { type: 'error' }); return; }
    toast.show(t.is_active ? 'Member deactivate ho gaya (login blocked)' : 'Member activate ho gaya', { type: 'success' });
    load();
  }

  async function removeMember(t) {
    const confirmed = await modal.confirm({
      title: 'Remove from team?',
      message: `${t.name || t.email || t.user_id} ab admin panel access nahi karenge.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!confirmed) return;
    const { error } = await db.from('admin_team').delete().eq('user_id', t.user_id);
    if (error) { toast.show(`Remove nahi hua: ${error.message}`, { type: 'error' }); return; }
    audit('team.remove', 'admin_team', t.user_id);
    toast.show('Member remove ho gaya', { type: 'success' });
    load();
  }

  const filteredProfiles = profiles.filter((p) => {
    const q = profileSearch.trim().toLowerCase();
    if (!q) return true;
    return `${p.name || ''} ${p.phone || ''} ${p.email || ''}`.toLowerCase().includes(q);
  });

  const teamIds = new Set(team.map((t) => t.user_id));
  const addable = filteredProfiles.filter((p) => !teamIds.has(p.id));

  return (
    <AppLayout title="Team & Roles">
      <div className="section-title">Team &amp; Roles (RBAC)</div>
      <div className="section-sub">
        Admin panel ke members aur unke roles manage karein — Super Admin · Manager · Staff · Delivery · Support
      </div>

      {team.length === 0 && !loading && (
        <div className="placeholder-card" style={{ marginBottom: 16 }}>
          <div className="pc-icon">👑</div>
          <h4>Team list khaali hai</h4>
          <p>
            Naya system <code>admin_team</code> table use karta hai. Purane app_metadata wale admins already kaam karte hain —
            unhe is list mein lane ke liye niche wala button dabayein.
          </p>
          <button className="btn-main" style={{ marginTop: 12 }} onClick={seedCurrent}>👑 Seed Current Admin (Super Admin)</button>
        </div>
      )}

      {/* Add member */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-head"><h3>＋ Add Team Member</h3></div>
        <p className="team-hint">
          Kisi registered customer (profile) ko role dekar admin banayein. Naya user banane ke liye Supabase Dashboard →
          Authentication → Add user se email/password banao, phir yahan se role do.
        </p>
        <div className="team-add">
          <div className="f-group">
            <label htmlFor="tm-search">Profile (customer) search</label>
            <input
              id="tm-search"
              value={profileSearch}
              onChange={(e) => { setProfileSearch(e.target.value); setSelectedProfile(''); }}
              placeholder="Naam, phone ya email se search..."
            />
            <select
              value={selectedProfile}
              onChange={(e) => setSelectedProfile(e.target.value)}
              style={{ width: '100%', marginTop: 8 }}
            >
              <option value="">{profileSearch ? `${addable.length} results — select karein` : 'Select profile...'}</option>
              {addable.slice(0, 50).map((p) => (
                <option key={p.id} value={p.id}>{p.name || 'Guest'} — {p.phone || p.email || 'no contact'}</option>
              ))}
            </select>
          </div>
          <div className="f-group" style={{ maxWidth: 200 }}>
            <label htmlFor="tm-role">Role</label>
            <select id="tm-role" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
              {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
            </select>
          </div>
          <button className="btn-main" disabled={busy || !selectedProfile} onClick={addMember}>
            {busy ? 'Adding...' : '＋ Add Member'}
          </button>
        </div>
      </div>

      <div className="team-grid" aria-busy={loading}>
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div className="team-card" key={i}><div className="skel" style={{ height: 90 }} aria-hidden="true" /></div>
          ))
        ) : team.length === 0 ? (
          <div className="placeholder-card" style={{ gridColumn: '1/-1' }}>
            <div className="pc-icon">🧑‍💼</div>
            <h4>Koi member nahi</h4>
            <p>Upar se pehla member add karein.</p>
          </div>
        ) : (
          team.map((t) => {
            const isSelf = user?.id === t.user_id;
            const avatar = t.profile?.avatar_url;
            return (
              <div className="team-card" key={t.user_id}>
                <div className="team-top">
                  <div className="team-avatar">
                    {avatar ? <img src={avatar} alt="" /> : (t.name || t.email || '?')[0]?.toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="team-name">{t.name || 'Admin'}{isSelf && ' (you)'}</div>
                    <div className="team-email">{t.email || t.profile?.email || t.user_id}</div>
                  </div>
                  <RoleBadge role={t.role} />
                </div>
                <div className="team-role-row">
                  <select
                    value={t.role}
                    onChange={(e) => changeRole(t, e.target.value)}
                    aria-label={`Role for ${t.name || t.email}`}
                  >
                    {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                  </select>
                  <span className={`team-badge${t.is_active ? '' : ' off'}`}>{t.is_active ? 'Active' : 'Inactive'}</span>
                </div>
                <div className="team-hint">Joined: {formatDateTime(t.created_at)}</div>
                <div className="row-actions">
                  <button className="act-btn" onClick={() => toggleActive(t)}>
                    {t.is_active ? '⏸ Deactivate' : '▶ Activate'}
                  </button>
                  <button className="act-btn danger" disabled={isSelf} onClick={() => removeMember(t)}>🗑️ Remove</button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </AppLayout>
  );
}
