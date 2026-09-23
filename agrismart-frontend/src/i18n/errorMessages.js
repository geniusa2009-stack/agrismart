/**
 * i18n/errorMessages.js
 *
 * Maps a backend `ApiError.code` (see lib/api.js — carried through
 * unchanged from the API's own `error.code` field, e.g.
 * IRRIGATION_SAFETY_VIOLATION, DEVICE_OFFLINE, UNAUTHORIZED,
 * VALIDATION_ERROR) to a localized, farmer-readable message.
 *
 * IMPORTANT: this only changes what is DISPLAYED. It never touches the
 * machine-readable `err.code` itself, which callers can still branch on
 * for logic (e.g. showing the "device offline" banner specifically) —
 * see section 13 of the localization brief: "Keep the underlying error
 * code for engineering/debugging."
 */
export function translateApiError(err, t) {
  if (!err) return t('errors.generic');
  const code = err.code;
  if (code) {
    const key = `errors.${code}`;
    const translated = t(key);
    // t() falls back to the raw key string when nothing matches — treat
    // that as "no mapping for this code" and fall back to the server's
    // own message rather than showing a literal "errors.SOME_CODE".
    if (translated !== key) return translated;
  }
  // No known mapping — show the server's real message rather than a
  // generic string, so a real (if untranslated) error is never hidden.
  return err.message || t('errors.generic');
}
