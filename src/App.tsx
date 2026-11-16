import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Footer } from './components/Footer';
import { Navbar } from './components/Navbar';
import { AuthProvider, useAuth } from './context/AuthContext';
import { formatFirestoreErrorForUi, isFirebaseConfigured } from './lib/firebase';
import { subscribePublicReports, subscribeUserVerifications } from './lib/reportsService';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { AuthPage } from './pages/AuthPage';
import { CommunityFeedPage } from './pages/CommunityFeedPage';
import { CommunityMapPage } from './pages/CommunityMapPage';
import { DashboardPage } from './pages/DashboardPage';
import { InsightsPage } from './pages/InsightsPage';
import { LandingPage } from './pages/LandingPage';
import { ReportDetailPage } from './pages/ReportDetailPage';
import { ReportIssuePage } from './pages/ReportIssuePage';
import type { CivicReport } from './types/civic';

function parseRoute(fullPath: string): { pathname: string; query: URLSearchParams } {
  const [pathname, search = ''] = fullPath.split('?');
  return {
    pathname: pathname || '/',
    query: new URLSearchParams(search),
  };
}

function RaastaAppShell() {
  const { user, authLoading } = useAuth();
  const [locationPath, setLocationPath] = useState<string>(
    () => `${window.location.pathname}${window.location.search}`,
  );
  const [reports, setReports] = useState<CivicReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [verifiedMap, setVerifiedMap] = useState<Record<string, boolean>>({});
  const [mapsApiKey, setMapsApiKey] = useState<string>(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
  );
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  const navigate = useCallback((to: string) => {
    window.history.pushState({}, '', to);
    setLocationPath(to);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setLocationPath(`${window.location.pathname}${window.location.search}`);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const onQuotaExceeded = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  useEffect(() => {
    fetch('/api/public-config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.mapsApiKey) {
          setMapsApiKey(data.mapsApiKey);
        }
      })
      .catch(() => {
        // Fallback relies on VITE_GOOGLE_MAPS_API_KEY or list view
      });
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setReportsLoading(false);
      return;
    }
    const unsub = subscribePublicReports(
      (items) => {
        setReports(items);
        setReportsError(null);
        setReportsLoading(false);
      },
      (err) => {
        setReportsError(formatFirestoreErrorForUi(err, 'Unable to load public reports.'));
        setReportsLoading(false);
      },
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || !user) {
      setVerifiedMap({});
      return;
    }
    const unsub = subscribeUserVerifications(user.uid, (map) => {
      setVerifiedMap(map);
    });
    return () => unsub();
  }, [user]);

  if (!isFirebaseConfigured) {
    return (
      <div className="min-h-screen bg-[#F8F7F4] flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white border border-[#E5E3DC] rounded-xl p-8 space-y-4">
          <div className="flex items-center gap-3 text-[#B45309]">
            <AlertTriangle className="w-6 h-6 shrink-0" aria-hidden="true" />
            <h1 className="font-display text-xl font-bold text-[#1A1D1B]">
              Firebase Configuration Required
            </h1>
          </div>
          <p className="text-sm text-[#4F5651] leading-relaxed">
            RaastaAI requires a configured Firebase project in{' '}
            <code className="font-mono text-xs bg-[#F3F1EC] px-1.5 py-0.5 rounded">
              firebase-applet-config.json
            </code>{' '}
            to authenticate citizens, store civic reports, and manage uploads. See{' '}
            <code className="font-mono text-xs bg-[#F3F1EC] px-1.5 py-0.5 rounded">README.md</code>{' '}
            for setup steps.
          </p>
        </div>
      </div>
    );
  }

  const { pathname, query } = parseRoute(locationPath);
  const nextRedirect = query.get('next') || '/dashboard';

  const renderPage = () => {
    if (authLoading && (pathname === '/dashboard' || pathname === '/report' || pathname === '/admin')) {
      return (
        <div className="max-w-4xl mx-auto px-4 py-16 space-y-4">
          <div className="h-8 w-48 bg-[#EFECE5] rounded-lg animate-pulse" />
          <div className="h-56 bg-[#EFECE5] rounded-xl animate-pulse" />
        </div>
      );
    }

    if (pathname === '/') {
      return <LandingPage reports={reports} loading={reportsLoading} onNavigate={navigate} />;
    }
    if (pathname === '/auth') {
      return <AuthPage onNavigate={navigate} redirectTo={nextRedirect} />;
    }
    if (pathname === '/dashboard') {
      return <DashboardPage onNavigate={navigate} />;
    }
    if (pathname === '/report') {
      return <ReportIssuePage existingReports={reports} onNavigate={navigate} />;
    }
    if (pathname === '/map') {
      return (
        <CommunityMapPage
          reports={reports}
          loading={reportsLoading}
          mapsApiKey={mapsApiKey}
          quotaExceeded={quotaExceeded}
          onNavigate={navigate}
        />
      );
    }
    if (pathname === '/feed') {
      return (
        <CommunityFeedPage
          reports={reports}
          verifiedMap={verifiedMap}
          loading={reportsLoading}
          onNavigate={navigate}
        />
      );
    }
    if (pathname.startsWith('/reports/')) {
      const reportId = pathname.replace('/reports/', '').split('/')[0];
      return (
        <ReportDetailPage
          reportId={reportId}
          cachedReports={reports}
          verifiedMap={verifiedMap}
          onNavigate={navigate}
        />
      );
    }
    if (pathname === '/admin') {
      return <AdminDashboardPage reports={reports} onNavigate={navigate} />;
    }
    if (pathname === '/insights') {
      return <InsightsPage reports={reports} loading={reportsLoading} />;
    }

    return <LandingPage reports={reports} loading={reportsLoading} onNavigate={navigate} />;
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F7F4] text-[#1A1D1B]">
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      <Navbar currentPath={pathname} onNavigate={navigate} />

      {reportsError && (
        <div
          role="alert"
          className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-4"
        >
          <div className="p-3.5 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs sm:text-sm text-[#991B1B]">
            {reportsError}
          </div>
        </div>
      )}

      <main className="flex-1">{renderPage()}</main>

      <Footer onNavigate={navigate} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <RaastaAppShell />
    </AuthProvider>
  );
}
