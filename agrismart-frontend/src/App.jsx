import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Register from './pages/Register';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Devices from './pages/Devices';
import Irrigation from './pages/Irrigation';
import Analytics from './pages/Analytics';
import Alerts from './pages/Alerts';
import Farm from './pages/Farm';
import Settings from './pages/Settings';
import CommunityFeed from './pages/community/Feed';
import Profile from './pages/community/Profile';
import Equipment from './pages/equipment/Equipment';
import Services from './pages/services/Services';
import Marketplace from './pages/marketplace/Marketplace';
import Notifications from './pages/notifications/Notifications';
import Moderation from './pages/moderation/Moderation';
import { Spinner } from './components/ui';

export default function App() {
  const { user, loading, activeFarmId } = useAuth();

  // Once a signed-in user has no farm yet (either right after
  // registering, or an existing account that never finished setup),
  // enter the onboarding flow and STAY there — including through its
  // own Farm step, which sets activeFarmId as soon as step 1 succeeds.
  // Gating on `!activeFarmId` alone would unmount onboarding (and lose
  // its Device/Ready step state) the instant the farm is created, so
  // onboarding is only exited explicitly, via its own "Go to
  // Dashboard" button.
  const [onboarding, setOnboarding] = useState(false);
  useEffect(() => {
    if (!loading && user && !activeFarmId) setOnboarding(true);
  }, [loading, user, activeFarmId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Loading AgriSmart…" />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (onboarding) {
    return <Onboarding onFinish={() => setOnboarding(false)} />;
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-x-hidden pb-20 md:pb-0">
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/farm" element={<Farm />} />
            <Route path="/devices" element={<Devices />} />
            <Route path="/irrigation" element={<Irrigation />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/community" element={<CommunityFeed />} />
            <Route path="/community/profile" element={<Profile />} />
            <Route path="/community/profile/:userId" element={<Profile />} />
            <Route path="/equipment" element={<Equipment />} />
            <Route path="/services" element={<Services />} />
            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/moderation" element={<Moderation />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
      <Sidebar mobile />
    </div>
  );
}
