import { Brain, Sparkles } from 'lucide-react';
import { Card, Badge } from './ui';

/**
 * AiInsightCard
 *
 * Renders whatever /api/v1/ai/recommendations/:valveId actually
 * returned — never fabricates a confidence percentage or a
 * recommendation the API didn't send. Three real states:
 *
 * 1. `insight` is null / still loading -> nothing is rendered by the
 *    caller (Dashboard.jsx only mounts this once a valve id exists).
 * 2. `insight.available === false` -> honest "collecting more data"
 *    message, no probability shown.
 * 3. `insight.available === true` -> probability, confidence,
 *    explanation and recommendation exactly as computed server-side,
 *    plus a visible "synthetic" badge whenever the underlying model
 *    was trained on development data rather than real farm telemetry
 *    (ai/README.md "no fake AI" — the UI must not hide this).
 */
export default function AiInsightCard({ insight }) {
  if (!insight) return null;

  if (!insight.available) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Brain className="h-4 w-4" />
          AI Insight
        </div>
        <p className="mt-2 text-sm text-slate-500">
          AI insight unavailable — collecting more data.
        </p>
      </Card>
    );
  }

  const recommendationLabel = {
    recommend_irrigation: 'Review irrigation',
    monitor: 'Monitor',
    no_action: 'No action needed',
    insufficient_data: 'Collecting more data',
  }[insight.recommendation] || insight.recommendation;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Brain className="h-4 w-4" />
          AI Insight
        </div>
        {insight.synthetic && (
          <span title={insight.reason || 'Trained on synthetic development data'}>
            <Badge tone="amber">
              <Sparkles className="h-3 w-3 mr-1 inline" />
              dev model
            </Badge>
          </span>
        )}
      </div>

      <p className="mt-2 text-sm text-slate-700">
        Likely irrigation need within the next 3 hours: <strong>{Math.round(insight.probability * 100)}%</strong>
      </p>
      <p className="text-xs text-slate-500">
        Confidence: {insight.confidence}
        {insight.modelVersion ? ` · model ${insight.modelVersion}` : ''}
      </p>

      {insight.explanation?.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-slate-500 list-disc list-inside">
          {insight.explanation.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-sm font-medium text-slate-800">Recommendation: {recommendationLabel}</p>
    </Card>
  );
}
