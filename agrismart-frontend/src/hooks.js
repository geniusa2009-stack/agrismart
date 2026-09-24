import { useEffect, useRef, useState } from 'react';
import { api } from './lib/api';

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


/**
 * useFarmSnapshot — the single source of truth for "what's happening
 * on the active farm right now": farm/device/valve summary, recent
 * commands, the primary device's 24h telemetry history, and the
 * primary valve's AI insight (POST /ai/recommendations/:valveId).
 * Extracted from Dashboard.jsx so the Advanced dashboard and the
 * Simple Mode home screen (SimpleHome.jsx) poll the exact same real
 * endpoints on the exact same 3s cadence and can never show two
 * different farmers two different numbers for the same farm. Nothing
 * here is invented — a caller with no valve/device just gets nulls,
 * same honesty rules AiInsightCard already documents.
 */
export function useFarmSnapshot(activeFarmId) {
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [recentCommands, setRecentCommands] = useState([]);
  const [aiInsight, setAiInsight] = useState(null);
  const [error, setError] = useState('');

  usePolling(
    async () => {
      if (!activeFarmId) return;
      try {
        const [data, commands] = await Promise.all([
          api.get(`/dashboard/farms/${activeFarmId}/summary`),
          api.get(`/dashboard/farms/${activeFarmId}/commands`),
        ]);
        setSummary(data);
        setRecentCommands(commands);
        setError('');

        const primaryDeviceId = data.devices[0]?.deviceId;
        if (primaryDeviceId) {
          const h = await api.get(`/dashboard/devices/${primaryDeviceId}/telemetry?range=24h`);
          setHistory(h);
        }

        const primaryValveId = data.valves[0]?.valveId;
        if (primaryValveId) {
          try {
            const insight = await api.get(`/ai/recommendations/${primaryValveId}`);
            setAiInsight(insight);
          } catch {
            setAiInsight(null);
          }
        } else {
          setAiInsight(null);
        }
      } catch (err) {
        setError(err.message);
      }
    },
    3000,
    [activeFarmId]
  );

  return { summary, history, recentCommands, aiInsight, error };
}
