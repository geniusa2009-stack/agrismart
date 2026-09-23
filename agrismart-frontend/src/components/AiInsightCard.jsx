import { useState } from 'react';
import { Sparkles, ChevronDown, Bot } from 'lucide-react';
import { Badge, DecisionCard } from './ui';
import { useLocale } from '../i18n/LocaleContext';

/**
 * AiInsightCard — presented to the farmer as "مساعد AgriSmart" (the
 * AgriSmart assistant), not a generic chatbot. Renders whatever
 * /api/v1/ai/recommendations/:valveId actually returned — never
 * fabricates a probability, confidence, reason, or next-step that
 * doesn't trace back to a real field on that response. Four real,
 * visually distinct states:
 *
 * 1. `insight` is null / still loading -> nothing is rendered by the
 *    caller (Dashboard.jsx only mounts this once a valve id exists).
 * 2. `insight.available === false` -> honest "insufficient data"
 *    message, no probability shown, tagged "Unavailable".
 * 3. `insight.available === true` with `recommendation ===
 *    'insufficient_data'` -> the model ran but explicitly couldn't
 *    form a confident call, tagged "Insufficient data" — distinct
 *    from case 2.
 * 4. Otherwise -> the real headline/reasons/next-step, tagged
 *    "Recommendation" or "Advisory" depending on the server's own
 *    `recommendation` value.
 *
 * The "next step" line is UI-authored guidance keyed off which of
 * those four states applies (not a sentence the model generated) —
 * it is never presented as something the AI itself said. Technical
 * mode expands to show the real confidence/timestamp/model
 * version/limitations fields the API actually returned, so a
 * technically-minded user can verify the headline instead of taking
 * it on faith.
 */

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

const DECISION_TONE = {
  recommendation: 'accent',
  advisory: 'brand',
  insufficientData: 'slate',
  unavailable: 'slate',
};

export default function AiInsightCard({ insight }) {
  const { t, formatRelativeTime } = useLocale();
  const [showTechnical, setShowTechnical] = useState(false);
  if (!insight) return null;

  const unavailable = !insight.available;
  const stateKey = unavailable ? 'unavailable' : (STATE_BY_RECOMMENDATION[insight.recommendation] || 'advisory');
  const headline = unavailable
    ? t('aiInsight.unavailableMessage')
    : (t(`aiInsight.recommendationText.${insight.recommendation}`) || insight.recommendation);
  const reasons = (insight.explanation || []).slice(0, 3);

  return (
    <DecisionCard
      tone={DECISION_TONE[stateKey]}
      icon={<Bot size={22} />}
      eyebrow={t('aiInsight.farmDecisionEyebrow')}
      headline={headline}
      action={
        <div className="flex flex-wrap items-center gap-1.5">
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
      }
    >
      {!unavailable && reasons.length > 0 && (
        <div className="mt-1">
          <div className="text-xs font-bold text-slate-500">{t('aiInsight.reasonsLabel')}</div>
          <ul className="mt-1 space-y-1 text-xs text-slate-600 list-disc ps-4">
            {reasons.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 rounded-lg bg-white/60 px-3 py-2 text-xs">
        <span className="font-bold text-slate-500">{t('aiInsight.nextStepLabel')}: </span>
        <span className="text-slate-600">{t(`aiInsight.nextStepText.${stateKey}`)}</span>
      </div>

      {!unavailable && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowTechnical((v) => !v)}
            className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-slate-600"
          >
            <ChevronDown size={13} className={`transition-transform ${showTechnical ? 'rotate-180' : ''}`} />
            {t('aiInsight.technicalModeToggle')}
          </button>
          {showTechnical && (
            <div className="mt-2 flex flex-col gap-1.5 rounded-lg border border-slate-100 bg-white px-3 py-2.5 text-[11px] text-slate-500">
              <TechRow label={t('aiInsight.technicalMode.confidence')} value={insight.confidence} />
              <TechRow label={t('aiInsight.technicalMode.generatedAt')} value={insight.generatedAt ? formatRelativeTime(insight.generatedAt) : '—'} />
              {insight.modelVersion && <TechRow label={t('aiInsight.technicalMode.modelVersion')} value={insight.modelVersion} />}
              <TechRow label={t('aiInsight.technicalMode.dataUsed')} value={t('aiInsight.technicalMode.dataUsedValue')} />
              <TechRow
                label={t('aiInsight.technicalMode.limitations')}
                value={insight.outOfDistribution ? t('aiInsight.technicalMode.outOfDistribution') : t('aiInsight.technicalMode.noLimitations')}
              />
            </div>
          )}
        </div>
      )}
    </DecisionCard>
  );
}

function TechRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="font-semibold text-slate-400">{label}</span>
      <span className="text-end text-slate-600">{value}</span>
    </div>
  );
}
