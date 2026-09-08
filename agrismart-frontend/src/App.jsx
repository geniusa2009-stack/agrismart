import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Devices from './pages/Devices';
import Irrigation from './pages/Irrigation';
import Analytics from './pages/Analytics';
import Alerts from './pages/Alerts';
import Farm from './pages/Farm';
import Settings from './pages/Settings';
import { Spinner } from './components/ui';
import CreateFarmForm from './components/CreateFarmForm';

export default function App() {
  const { user, loading, activeFarmId } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Loading AgriSmart…" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-x-hidden pb-20 md:pb-0">
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
          {!activeFarmId ? (
            <div className="mx-auto max-w-md rounded-xl2 border border-dashed border-brand-200 bg-brand-50/50 p-8">
              <div className="text-center">
                <div className="text-lg font-bold text-brand-800">Create your first farm</div>
                <p className="mt-1 text-sm text-slate-500">
                  Add a farm to get started, or run <code className="rounded bg-white px-1.5 py-0.5">npm run demo</code>{' '}
                  in the backend for a demo farm with live simulated data.
                </p>
              </div>
              <div className="mt-5">
                <CreateFarmForm />
              </div>
            </div>
          ) : (
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/farm" element={<Farm />} />
              <Route path="/devices" element={<Devices />} />
              <Route path="/irrigation" element={<Irrigation />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </div>
      </main>
      <Sidebar mobile />
    </div>
  );
}
