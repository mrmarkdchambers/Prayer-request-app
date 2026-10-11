import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import { StoreProvider } from './store';
import { useReminder } from './useReminder';
import { TodayPage } from './pages/TodayPage';
import { ListPage } from './pages/ListPage';
import { PrayerPage } from './pages/PrayerPage';
import { NewPrayerPage } from './pages/NewPrayerPage';
import { SessionPage } from './pages/SessionPage';
import { AnsweredPage } from './pages/AnsweredPage';
import { SettingsPage } from './pages/SettingsPage';
import { SupportPage } from './pages/SupportPage';
import { PrintPage } from './pages/PrintPage';
import { Icon, type IconName } from './components/Icon';

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Today', icon: 'sun' },
  { to: '/prayers', label: 'Prayers', icon: 'list' },
  { to: '/answered', label: 'Answered', icon: 'star' },
  { to: '/settings', label: 'Settings', icon: 'gear' },
];

function Shell() {
  useReminder();
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <NavLink to="/" className="brand">
          <img src="/icon.svg" alt="" width={28} height={28} />
          <span>Prayer List</span>
        </NavLink>
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className="nav-link">
              <Icon name={n.icon} />
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
      </header>
      <main id="main" className="main">
        <Routes>
          <Route path="/" element={<TodayPage />} />
          <Route path="/prayers" element={<ListPage />} />
          <Route path="/prayers/new" element={<NewPrayerPage />} />
          <Route path="/prayers/:id" element={<PrayerPage />} />
          <Route path="/session" element={<SessionPage />} />
          <Route path="/answered" element={<AnsweredPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/support" element={<SupportPage />} />
          <Route path="/print" element={<PrintPage />} />
          <Route path="*" element={<TodayPage />} />
        </Routes>
      </main>
    </div>
  );
}

export function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
    </StoreProvider>
  );
}
