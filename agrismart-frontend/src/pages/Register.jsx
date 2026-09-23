import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AuthBrandPanel, { LOGO_SRC } from '../components/AuthBrandPanel';
import { useLocale } from '../i18n/LocaleContext';
import { translateApiError } from '../i18n/errorMessages';

// Mirrors the backend's real validation (auth.validators.js
// registerSchema: password min 8 / max 128, fullName min 1 / max 120)
// so the user sees the same rule before submitting, not a fabricated
// stricter/looser one.
const PASSWORD_MIN_LENGTH = 8;

export default function Register() {
  const { register } = useAuth();
  const { t } = useLocale();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(t('auth.passwordTooShort', { count: PASSWORD_MIN_LENGTH }));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }

    setBusy(true);
    try {
      // Real account creation via POST /auth/register — role is left
      // unset so the backend applies its own default (farmer), the
      // only self-service role that matters for onboarding.
      await register({ email, password, fullName });
      // On success, AuthContext's user/activeFarmId state updates and
      // App.jsx automatically routes into the onboarding flow — no
      // manual navigation needed here.
    } catch (err) {
      setError(translateApiError(err, t) || t('auth.registerError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-white">
      <AuthBrandPanel />

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-[360px] animate-[fadeSlideIn_0.5s_ease-out]">
          <div className="mb-8 flex justify-center lg:hidden">
            <img src={LOGO_SRC} alt="AgriSmart" className="h-16 w-auto object-contain" />
          </div>

          <h2 className="text-xl font-extrabold text-slate-900">{t('auth.createAccountTitle')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('auth.createAccountSub')}</p>

          <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4" noValidate>
            <div>
              <label htmlFor="reg-name" className="text-xs font-semibold text-slate-600">
                {t('auth.fullName')}
              </label>
              <input
                id="reg-name"
                type="text"
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t('auth.fullName')}
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>

            <div>
              <label htmlFor="reg-email" className="text-xs font-semibold text-slate-600">
                {t('auth.emailAddress')}
              </label>
              <input
                id="reg-email"
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
              <label htmlFor="reg-password" className="text-xs font-semibold text-slate-600">
                {t('auth.password')}
              </label>
              <div className="relative mt-1.5">
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={PASSWORD_MIN_LENGTH}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 pe-10 text-sm text-slate-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 end-0 flex items-center px-3 text-slate-400 outline-none transition hover:text-slate-600 focus-visible:text-brand-600"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="reg-confirm" className="text-xs font-semibold text-slate-600">
                {t('auth.confirmPassword')}
              </label>
              <input
                id="reg-confirm"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
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
              {t('auth.createAccount')}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-slate-500">
            {t('auth.alreadyHaveAccount')}{' '}
            <Link to="/login" className="font-bold text-brand-600 hover:text-brand-700">
              {t('auth.signInLink')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
