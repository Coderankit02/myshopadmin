import { useState } from 'react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';

export default function AppLayout({ title, notifCount = 3, onSearch, children }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="app">
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />

      <div className="main">
        <Navbar
          title={title}
          notifCount={notifCount}
          onSearch={onSearch}
          onHamburger={() => setMobileOpen((o) => !o)}
        />
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
