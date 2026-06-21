import { useState } from 'react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';

export default function AppLayout({ title, notifCount = 3, onSearch, children }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="app">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />

      <div className="main">
        <Navbar
          title={title}
          notifCount={notifCount}
          onSearch={onSearch}
          onHamburger={() => setMobileOpen((o) => !o)}
        />
        <main className="content" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
