import { useEffect, useState } from 'react';
import { DashboardWorkspace } from './components/DashboardWorkspace';
import { LoginPortal } from './components/LoginPortal';
import { PublicPages } from './components/PublicPages';
import { AppErrorBoundary } from './components/StatusComponents';
import { api, setAuthToken, type PublicStats, type TaxonomyData } from './lib/api';
import { signOutFirebaseIfActive, testFirestoreConnection } from './lib/firebase';
import type { PortalGroup, UserAccount } from './lib/types';

export default function App() {
  const [view, setView] = useState<'public' | 'login' | 'workspace'>('public');
  const [preferredPortal, setPreferredPortal] = useState<PortalGroup>('citizen');
  const [user, setUser] = useState<UserAccount | null>(null);
  const [taxonomy, setTaxonomy] = useState<TaxonomyData>({
    states: [],
    districts: [],
    municipalities: [],
    departments: [],
    categories: [],
  });
  const [publicStats, setPublicStats] = useState<PublicStats | null>(null);

  const loadMeta = async () => {
    try {
      const [tax, stats] = await Promise.all([api.getTaxonomy(), api.getPublicStats()]);
      setTaxonomy(tax);
      setPublicStats(stats);
    } catch (err) {
      console.error('Failed to load initial civic metadata:', err);
    }
  };

  useEffect(() => {
    loadMeta();
    testFirestoreConnection();
  }, []);

  const handleNavigateLogin = (portal: PortalGroup = 'citizen') => {
    setPreferredPortal(portal);
    setView('login');
  };

  const handleLoginSuccess = (authenticatedUser: UserAccount) => {
    setUser(authenticatedUser);
    setView('workspace');
  };

  const handleLogout = async () => {
    setAuthToken(null);
    setUser(null);
    await signOutFirebaseIfActive().catch(() => {});
    setView('public');
    loadMeta();
  };

  return (
    <AppErrorBoundary>
      {view === 'workspace' && user ? (
        <DashboardWorkspace
          user={user}
          taxonomy={taxonomy}
          onLogout={handleLogout}
          onTaxonomyChanged={loadMeta}
        />
      ) : view === 'login' ? (
        <LoginPortal
          taxonomy={taxonomy}
          initialPortal={preferredPortal}
          onSuccess={handleLoginSuccess}
          onBackHome={() => setView('public')}
        />
      ) : (
        <PublicPages
          stats={publicStats}
          taxonomy={taxonomy}
          onNavigateLogin={handleNavigateLogin}
        />
      )}
    </AppErrorBoundary>
  );
}
