import ar from './ar';

/**
 * i18n/index.js
 *
 * Deliberately tiny localization layer — no external i18n library
 * (i18next etc.) is pulled in for a single-locale-today, "architecture
 * ready for a second locale later" requirement (Overnight Community
 * task, section 15: "Build localization architecture so English can be
 * added later. No scattered hardcoded strings where practical.").
 *
 * `locales` is the ONE place a future `en.js` dictionary would be
 * added; `t()` and the RTL/number/date helpers are locale-aware so
 * adding English later is a matter of adding a dictionary + flipping
 * `DEFAULT_LOCALE`, not rewriting every page.
 */

const locales = { ar };

const DEFAULT_LOCALE = 'ar';
const RTL_LOCALES = new Set(['ar']);

function getDictionary(locale = DEFAULT_LOCALE) {
  return locales[locale] || locales[DEFAULT_LOCALE];
}

/**
 * `t('community.feed')` -> 'المنشورات'. Falls back to the raw key
 * (never throws, never renders "undefined") if a translation is
 * missing — a missing string should be visibly wrong, not crash the
 * page.
 */
export function t(key, locale = DEFAULT_LOCALE) {
  const dict = getDictionary(locale);
  const value = key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), dict);
  return typeof value === 'string' ? value : key;
}

export function isRtl(locale = DEFAULT_LOCALE) {
  return RTL_LOCALES.has(locale);
}

export function dir(locale = DEFAULT_LOCALE) {
  return isRtl(locale) ? 'rtl' : 'ltr';
}

const INTL_LOCALE_MAP = { ar: 'ar-EG' };

export function formatNumber(value, locale = DEFAULT_LOCALE) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat(INTL_LOCALE_MAP[locale] || locale).format(value);
}

export function formatCurrency(value, locale = DEFAULT_LOCALE) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${formatNumber(value, locale)} ${t('common.egp', locale)}`;
}

export function formatDate(value, locale = DEFAULT_LOCALE) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat(INTL_LOCALE_MAP[locale] || locale, { dateStyle: 'medium' }).format(new Date(value));
  } catch {
    return '—';
  }
}

export function formatRelativeTime(value, locale = DEFAULT_LOCALE) {
  if (!value) return '—';
  const diffMs = Date.now() - new Date(value).getTime();
  const sec = Math.round(diffMs / 1000);
  const rtf = new Intl.RelativeTimeFormat(INTL_LOCALE_MAP[locale] || locale, { numeric: 'auto' });
  if (sec < 60) return rtf.format(-sec, 'second');
  const min = Math.round(sec / 60);
  if (min < 60) return rtf.format(-min, 'minute');
  const hr = Math.round(min / 60);
  if (hr < 24) return rtf.format(-hr, 'hour');
  const day = Math.round(hr / 24);
  return rtf.format(-day, 'day');
}

export { DEFAULT_LOCALE };
