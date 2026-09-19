import { useEffect, useRef } from 'react';

/**
 * Polls `callback` every `intervalMs`. `callback` may be async; if it
 * throws or rejects, the error is swallowed here ONLY as a last resort
 * (logged to console) so a network hiccup never becomes an unhandled
 * rejection that crashes nothing but also tells the user nothing.
 * Callers that want a real error state in the UI (recommended for any
 * page whose only data source is a poll) should catch inside their own
 * callback and set their own error state — this defensive catch exists
 * so a caller who forgets to do that gets a console warning instead of
 * a silently-stuck spinner with zero diagnostic trail.
 */
export function usePolling(callback, intervalMs, deps = []) {
  const savedCallback = useRef(callback);
  savedCallback.current = callback;

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      try {
        const result = savedCallback.current();
        if (result && typeof result.catch === 'function') {
          result.catch((err) => {
            if (!cancelled) {
              // eslint-disable-next-line no-console
              console.error('usePolling: unhandled error in poll callback', err);
            }
          });
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('usePolling: unhandled error in poll callback', err);
      }
    };
    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
