import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Eye, EyeOff, ArrowRight, Sprout } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AuthBrandPanel, { LOGO_SRC } from '../components/AuthBrandPanel';

const DEMO_EMAIL = 'demo-farmer@agrismart.local';
const DEMO_PASSWORD = 'DemoPassword123!';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function doLogin(loginEmail, loginPassword) {
    setError('');
    setBusy(true);
    try {
      await login(loginEmail, loginPassword);
    } catch (err) {
      setError(err.message || 'Could not sign in. Check your credentials and try again.');
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    doLogin(email, password);
  }

  function useDemoAccount() {
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    doLogin(DEMO_EMAIL, DEMO_PASSWORD);
  }

  return (
    <div className="flex min-h-screen bg-white">
      <AuthBrandPanel />

      {/* RIGHT — login panel */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-[360px] animate-[fadeSlideIn_0.5s_ease-out]">
          {/* Logo shown here only on mobile/tablet, where the brand panel is hidden */}
          <div className="mb-8 flex justify-center lg:hidden">
            <img src={LOGO_SRC} alt="AgriSmart" className="h-16 w-auto object-contain" />
          </div>

          <h2 className="text-xl font-extrabold text-slate-900">Welcome back</h2>
          <p className="mt-1 text-sm text-slate-500">Sign in to monitor and control your farm.</p>

          <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4" noValidate>
            <div>
              <label htmlFor="login-email" className="text-xs font-semibold text-slate-600">
                Email address
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@farm.com"
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="text-xs font-semibold text-slate-600">
                Password
              </label>
              <div className="relative mt-1.5">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 pr-10 text-sm text-slate-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 outline-none transition hover:text-slate-600 focus-visible:text-brand-600"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-xs font-medium text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-1 flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow-card outline-none transition hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              Sign in
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-slate-500">
            New to AgriSmart?{' '}
            <Link to="/register" className="font-bold text-brand-600 hover:text-brand-700">
              Create your account
            </Link>
          </p>

          <div className="mt-6 flex items-center gap-3 text-[11px] text-slate-300">
            <div className="h-px flex-1 bg-slate-100" />
            Demo environment
            <div className="h-px flex-1 bg-slate-100" />
          </div>

          <button
            type="button"
            onClick={useDemoAccount}
            disabled={busy}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-500 outline-none transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Sprout size={14} /> Use demo account
          </button>
        </div>
      </div>
    </div>
  );
}
