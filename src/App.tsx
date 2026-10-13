import { useEffect } from 'react';
import { HashRouter, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { StoreProvider } from './store';
import { AccountProvider, useAccount } from './sync/AccountProvider';
import { pendingJoin } from './sync/useGroup';
import { GroupsPage } from './pages/GroupsPage';
import { GroupPage } from './pages/GroupPage';
import { JoinPage } from './pages/JoinPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { listenForNotificationTaps } from './sync/push';
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
import { APP_NAME } from './config';

const NAV: { to: string; label: string; icon: IconName; needsAccount?: boolean }[] = [
  { to: '/', label: 'Today', icon: 'sun' },
  { to: '/prayers', label: 'Prayers', icon: 'list' },
  { to: '/groups', label: 'Groups', icon: 'users', needsAccount: true },
  { to: '/answered', label: 'Answered', icon: 'star' },
  { to: '/settings', label: 'Settings', icon: 'gear' },
];

/** Finishes joining a group after signing in through the email link. */
function useResumeJoin() {
  const { userId } = useAccount();
  const navigate = useNavigate();
  useEffect(() => {
    const code = pendingJoin.get();
    if (userId && code && !location.hash.startsWith('#/join/')) navigate(`/join/${code}`);
  }, [userId, navigate]);
}

/** In the store apps, tapping a notification opens the screen it's about. */
function useNotificationTaps() {
  const navigate = useNavigate();
  useEffect(() => listenForNotificationTaps(navigate), [navigate]);
}

function Shell() {
  useReminder();
  useResumeJoin();
  useNotificationTaps();
  const account = useAccount();
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <NavLink to="/" className="brand">
          <img src="/icon.svg" alt="" width={28} height={28} />
          <span>{APP_NAME}</span>
        </NavLink>
        <nav className="nav" aria-label="Main">
          {NAV.filter((n) => !n.needsAccount || account.enabled).map((n) => (
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
          <Route path="/groups" element={<GroupsPage />} />
          <Route path="/groups/:id" element={<GroupPage />} />
          <Route path="/join/:code" element={<JoinPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="*" element={<TodayPage />} />
        </Routes>
      </main>
    </div>
  );
}

export function App() {
  return (
    <StoreProvider>
      <AccountProvider>
        <HashRouter>
          <Shell />
        </HashRouter>
      </AccountProvider>
    </StoreProvider>
  );
}
