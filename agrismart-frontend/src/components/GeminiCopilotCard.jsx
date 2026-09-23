import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Card, Badge } from './ui';
import { api } from '../lib/api';
import { translateApiError } from '../i18n/errorMessages';
import { useLocale } from '../i18n/LocaleContext';

/**
 * GeminiCopilotCard — "مساعد AgriSmart الذكي", the Gemini-backed
 * agricultural copilot at POST /api/v1/ai/copilot/:valveId/analyze
 * (ai/services/geminiCopilotService.js). Distinct from AiInsightCard
 * (the small logistic-regression model at /ai/recommendations): this
 * one is a manually-triggered, richer natural-language analysis, not
 * something polled automatically every few seconds — an LLM call is
 * comparatively slow/costly, and the backend service itself is
 * explicitly advisory-only.
 *
 * HARD SAFETY RULE this component must never violate: the backend
 * service that powers this card never calls valve actuation itself
 * (see geminiCopilotService.js's own doc-comment and
 * tests/ai/geminiCopilotSafetyBoundary.test.js). This component
 * mirrors that on the frontend — even when the analysis says
 * "irrigate_now", the only action here is navigating to the real
 * Irrigation page, where the existing confirmation dialog and safety
 * checks (max duration, daily allowance, emergency stop) are the only
 * path that can ever open a valve. Nothing in this card opens a valve
 * directly.
 */
export default function GeminiCopilotCard({ valveId, deviceOnline }) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!valveId) return null;

  async function analyze() {
    setBusy(true);
    setError('');
    try {
      const data = await api.post(`/ai/copilot/${valveId}/analyze`, {});
      setResult(data);
    } catch (err) {
      setError(translateApiError(err, t) || t('geminiCopilot.statusMessages.error'));
    } finally {
      setBusy(false);
    }
  }

  const showSimulationNote = result?.status === 'available' && result.decision === 'irrigate_now' && !deviceOnline;

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white ring-1 ring-accent-100">
            <img src="/agrismart-mark.png" alt="" className="h-6 w-6 object-contain" />
          </div>
          <div>
            <div className="text-sm font-extrabold text-slate-800">{t('geminiCopilot.title')}</div>
            <div className="text-[11px] text-slate-400">{t('geminiCopilot.subtitle')}</div>
          </div>
        </div>
        <button
          onClick={analyze}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-accent-700 disabled:opacity-60"
        >
          {busy && <Loader2 size={13} className="animate-spin" />}
          {busy ? t('geminiCopilot.analyzing') : t('geminiCopilot.analyzeButton')}
        </button>
      </div>

      {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</div>}

      {result && result.status !== 'available' && (
        <p className="mt-3 text-sm text-slate-500">{t(`geminiCopilot.statusMessages.${result.status}`)}</p>
      )}

      {result && result.status === 'available' && (
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <span className="text-base font-extrabold text-slate-800">{result.title}</span>
            {result.confidence && (
              <Badge tone={result.confidence === 'high' ? 'green' : result.confidence === 'medium' ? 'amber' : 'slate'}>
                {t('geminiCopilot.confidenceLabel')}: {t(`geminiCopilot.confidenceLabels.${result.confidence}`)}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600">{result.summary}</p>

          {result.reasons?.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-bold text-slate-500">{t('geminiCopilot.whyLabel')}</div>
              <ul className="mt-1 space-y-1 text-xs text-slate-600 list-disc ps-4">
                {result.reasons.slice(0, 3).map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-3 rounded-lg bg-accent-50/60 px-3 py-2 text-xs">
            <span className="font-bold text-slate-500">{t('geminiCopilot.nextStepLabel')}: </span>
            <span className="text-slate-700">{result.recommendation}</span>
          </div>

          {result.decision === 'irrigate_now' && (
            <div className="mt-3 flex flex-col gap-1.5">
              <button
                onClick={() => navigate('/irrigation')}
                className="self-start rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700"
              >
                {t('geminiCopilot.startIrrigationButton')}
              </button>
              {showSimulationNote && <p className="text-[11px] text-slate-400">{t('geminiCopilot.simulationNote')}</p>}
            </div>
          )}

          {result.limitations?.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[11px] text-slate-400 list-disc ps-4">
              {result.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-3 text-[10px] text-slate-300">{t('geminiCopilot.poweredBy')}</div>
    </Card>
  );
}
