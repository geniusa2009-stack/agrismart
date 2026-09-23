import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import ar from './locales/ar';
import arEg from './locales/ar-eg';
import en from './locales/en';

/**
 * i18n/LocaleContext.jsx
 *
 * Real, app-wide locale switching — the piece the previous single-locale
 * i18n/ar.js deliberately deferred ("the ONE place a future en.js
 * dictionary would be added"). Three real locales:
 *
 *   ar     - general/standard Arabic (default)
 *   ar-eg  - Egyptian Arabic, farmer-friendly (sparse override of ar)
 *   en     - English fallback
 *
 * Architecture notes:
 *  - `ar-eg` is DEEP-MERGED over `ar` at load time (once, here — not
 *    per-render) so a missing ar-eg key silently falls back to correct
 *    general Arabic, never to English and never to a raw key string.
 *  - `document.documentElement.dir`/`lang` are set from the ACTIVE
 *    locale's own `meta.dir` — never a hardcoded 'rtl'/'ltr' — so
 *    switching to `en` genuinely flips the whole app back to LTR, and
 *    switching to either Arabic variant flips it to RTL, in one place,
 *    not per-page (see AGENTS/localization audit: previously only 6
 *    community pages individually hardcoded dir="rtl", the rest of the
 *    app never set dir at all).
 *  - Preference persists to localStorage (`agrismart_locale`) so a
 *    reload keeps the farmer's chosen language/mode.
 *  - `t()` supports dot-path keys, {{interpolation}}, and a minimal
 *    ICU-lite pluralization convention (`key_one` / `key_other`,
 *    selected via a numeric `count` interpolation value) — enough for
 *    "1 reading" vs "12 readings" / "قراءة واحدة" vs "12 قراءة" without
 *    pulling in a full i18n library.
 */

function deepMerge(base, override) {
  const out = { ...base };
  for (const key of Object.keys(override)) {
    const bv = base[key];
    const ov = override[key];
    if (bv && ov && typeof bv === 'object' && typeof ov === 'object' && !Array.isArray(bv)) {
      out[key] = deepMerge(bv, ov);
    } else {
      out[key] = ov;
    }
  }
  return out;
}

const DICTIONARIES = {
  ar,
  'ar-eg': deepMerge(ar, arEg),
  en,
};

export const LOCALES = ['ar', 'ar-eg', 'en'];
const STORAGE_KEY = 'agrismart_locale';
const DEFAULT_LOCALE = 'ar-eg'; // Arabic-first, farmer-friendly by default — see section 3/4 of the localization brief.

function readStoredLocale() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return DICTIONARIES[stored] ? stored : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

function resolveKey(dict, key) {
  return key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), dict);
}

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, name) => (vars[name] !== undefined ? String(vars[name]) : `{{${name}}}`));
}

const LocaleContext = createContext(null);

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(readStoredLocale);

  useEffect(() => {
    const dict = DICTIONARIES[locale] || DICTIONARIES[DEFAULT_LOCALE];
    const dir = dict.meta?.dir || 'ltr';
    const langTag = locale === 'ar-eg' ? 'ar' : locale;
    document.documentElement.dir = dir;
    document.documentElement.lang = langTag;
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // private mode / storage unavailable — locale still works for this session
    }
  }, [locale]);

  const setLocale = useCallback((next) => {
    if (DICTIONARIES[next]) setLocaleState(next);
  }, []);

  const t = useCallback(
    (key, vars) => {
      const dict = DICTIONARIES[locale] || DICTIONARIES[DEFAULT_LOCALE];
      // Pluralization: if a numeric `count` var is given and a
      // `${key}_one` / `${key}_other` pair exists, pick the matching
      // branch (Arabic collapses to the same two-way split English
      // uses here — good enough for this app's actual plural surface
      // area, which is small: reading counts, issue counts).
      if (vars && typeof vars.count === 'number') {
        const branchKey = vars.count === 1 ? `${key}_one` : `${key}_other`;
        const branchValue = resolveKey(dict, branchKey);
        if (typeof branchValue === 'string') return interpolate(branchValue, vars);
      }
      const value = resolveKey(dict, key);
      if (typeof value === 'string') return interpolate(value, vars);
      // Fall back to English, then the raw key — never crash, never
      // render "undefined".
      const fallback = resolveKey(DICTIONARIES.en, key);
      if (typeof fallback === 'string') return interpolate(fallback, vars);
      return key;
    },
    [locale]
  );

  const isRtl = (DICTIONARIES[locale]?.meta?.dir || 'ltr') === 'rtl';

  const formatNumber = useCallback((value) => {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'ar-EG').format(value);
  }, [locale]);

  // Shared by the Community/Marketplace/Equipment/Services subtree
  // (previously its own hardcoded-`ar` formatCurrency in the old
  // single-locale i18n/index.js) — same "value + common.egp" shape,
  // now locale-aware so it renders "EGP" in English mode instead of
  // always "ج.م".
  const formatCurrency = useCallback((value) => {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return `${formatNumber(value)} ${t('common.egp')}`;
  }, [formatNumber, t]);

  const formatDate = useCallback((value) => {
    if (!value) return '—';
    try {
      return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'ar-EG', { dateStyle: 'medium' }).format(new Date(value));
    } catch {
      return '—';
    }
  }, [locale]);

  const formatRelativeTime = useCallback((value) => {
    if (!value) return t('common.never');
    const diffMs = Date.now() - new Date(value).getTime();
    const sec = Math.round(diffMs / 1000);
    if (sec < 60) return t('common.secondsAgo', { count: sec });
    const min = Math.round(sec / 60);
    if (min < 60) return t('common.minutesAgo', { count: min });
    const hr = Math.round(min / 60);
    if (hr < 24) return t('common.hoursAgo', { count: hr });
    const day = Math.round(hr / 24);
    return t('common.daysAgo', { count: day });
  }, [t]);

  const value = useMemo(
    () => ({ locale, setLocale, t, isRtl, formatNumber, formatCurrency, formatDate, formatRelativeTime, locales: LOCALES }),
    [locale, setLocale, t, isRtl, formatNumber, formatCurrency, formatDate, formatRelativeTime]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale() must be used within a LocaleProvider');
  return ctx;
}
