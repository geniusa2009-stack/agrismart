import { Brain, Sparkles } from 'lucide-react';
import { Card, Badge } from './ui';
import { useLocale } from '../i18n/LocaleContext';

/**
 * AiInsightCard
 *
 * Renders whatever /api/v1/ai/recommendations/:valveId actually
 * returned — never fabricates a confidence percentage or a
 * recommendation the API didn't send. Three real states:
 *
 * 1. `insight` is null / still loading -> nothing is rendered by the
 *    caller (Dashboard.jsx only mounts this once a valve id exists).
 * 2. `insight.available === false` -> honest "insufficient data"
 *    message, no probability shown, tagged with an "Unavailable"
 *    state badge.
 * 3. `insight.available === true` -> probability, confidence,
 *    explanation and recommendation exactly as computed server-side,
 *    plus a visible "synthetic" badge whenever the underlying model
 *    was trained on development data rather than real farm telemetry
 *    (ai/README.md "no fake AI" — the UI must not hide this). The
 *    state badge (Recommendation / Advisory / Insufficient data)
 *    reflects the server's own `insight.recommendation` value — never
 *    a fabricated category.
 */

// Maps the backend's real recommendation enum to an honest, visible
// state category. `insufficient_data` here means the model DID run
// but explicitly reported it couldn't form a confident recommendation
// — distinct from `insight.available === false`, which means no
// result was returned at all.
const STATE_BY_RECOMMENDATION = {
  recommend_irrigation: 'recommendation',
  monitor: 'advisory',
  no_action: 'advisory',
  insufficient_data: 'insufficientData',
};

const STATE_TONE = {
  recommendation: 'blue',
  advisory: 'amber',
  insufficientData: 'slate',
  unavailable: 'slate',
};

export default function AiInsightCard({ insight }) {
  const { t } = useLocale();
  if (!insight) return null;

  if (!insight.available) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <Brain className="h-4 w-4" />
            {t('aiInsight.title')}
          </div>
          <Badge tone={STATE_TONE.unavailable}>{t('aiInsight.stateLabels.unavailable')}</Badge>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          {t('aiInsight.unavailableMessage')}
        </p>
      </Card>
    );
  }

  const stateKey = STATE_BY_RECOMMENDATION[insight.recommendation] || 'advisory';
  const recommendationLabel = t(`aiInsight.recommendationText.${insight.recommendation}`) || insight.recommendation;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Brain className="h-4 w-4" />
          {t('aiInsight.title')}
        </div>
        <div className="flex items-center gap-1.5">
          <Badge tone={STATE_TONE[stateKey]}>{t(`aiInsight.stateLabels.${stateKey}`)}</Badge>
          {insight.synthetic && (
            <span title={insight.reason || t('aiInsight.devModelTooltipDefault')}>
              <Badge tone="amber">
                <Sparkles className="h-3 w-3 me-1 inline" />
                {t('aiInsight.devModelBadge')}
              </Badge>
            </span>
          )}
        </div>
      </div>

      <p className="mt-2 text-sm text-slate-700">
        {t('aiInsight.probabilityLabel')}: <strong>{Math.round(insight.probability * 100)}%</strong>
      </p>
      <p className="text-xs text-slate-500">
        {t('aiInsight.confidenceLabel')}: {insight.confidence}
        {insight.modelVersion ? t('aiInsight.modelVersionSuffix', { version: insight.modelVersion }) : ''}
      </p>

      {insight.explanation?.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-slate-500 list-disc list-inside">
          {insight.explanation.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-sm font-medium text-slate-800">{t('aiInsight.recommendationLabel')}: {recommendationLabel}</p>
    </Card>
  );
}
