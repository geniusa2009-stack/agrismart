import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Droplet, Thermometer, FlaskConical, Waves, CheckCircle2, AlertTriangle, ArrowRight,
  Activity, Search, Brain, Zap, ShieldCheck, Clock, MapPin, Wifi, WifiOff, Radio, Check,
  Droplets, Sprout, Tractor, Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { usePolling } from '../hooks';
import { Card, Badge, EmptyState, DashboardSkeleton, ActionCard, DecisionCard } from '../components/ui';
import AiInsightCard from '../components/AiInsightCard';
import GeminiCopilotCard from '../components/GeminiCopilotCard';
import { MoistureAreaChart, DevicesDonut } from '../components/charts';
import { useLocale } from '../i18n/LocaleContext';

// Matches the backend's own low-moisture alert rule
// (dashboard.service.js ALERT_THRESHOLDS.SOIL_MOISTURE_LOW_PERCENT) —
// kept in sync, not invented independently. When the active valve has
// automation enabled, its own real per-valve thresholds (already
// returned by the summary API) are used instead of this fallback.
const DEFAULT_LOW_MOISTURE_THRESHOLD = 30;

// The telemetry endpoint is queried with range=24h below. This label is
// used verbatim in the chart subtitle alongside the ACTUAL reading
// count returned, so the UI never implies 24 hours of visible history
// when the demo/device has only been reporting for a few minutes —
// e.g. "24h range · 23 readings" rather than a false "last 24 hours".
const REQUESTED_RANGE_LABEL = '24h';

// A handful of readings (e.g. a few seconds into a fresh demo run)
// technically fall within the requested 24h window, but labeling that
// "24h range" reads as if 24 hours of history exists. Below this
// count, the subtitle says "Recent readings" instead — still truthful
// about what's requested, but not implying a long history that isn't
// there. Nothing about the requested range or the underlying query
// changes; this only affects the displayed label.
const SPARSE_READING_THRESHOLD = 10;

function chartRangeLabel(readingCount, t) {
  return readingCount > 0 && readingCount <= SPARSE_READING_THRESHOLD ? t('dashboard.recentReadings') : t('dashboard.rangeLabel24h');
}

function greetingKey() {
  const h = new Date().getHours();
  if (h < 12) return 'dashboard.goodMorning';
  if (h < 18) return 'dashboard.goodAfternoon';
  return 'dashboard.goodEvening';
}

/**
 * The one-tap-away row a farmer actually needs from Home: start/check
 * irrigation, see the farm, rent equipment, ask the community. Real
 * routes only (no placeholder links) — same destinations as the
 * sidebar/bottom nav, just surfaced where a farmer looks first.
 */
function QuickActions() {
  const { t } = useLocale();
  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-3">
      <ActionCard to="/irrigation" tone="accent" icon={<Droplets size={20} />} label={t('dashboard.quickActions.irrigation')} />
      <ActionCard to="/farm" tone="brand" icon={<Sprout size={20} />} label={t('dashboard.quickActions.myFarm')} />
      <ActionCard to="/equipment" tone="amber" icon={<Tractor size={20} />} label={t('dashboard.quickActions.equipment')} />
      <ActionCard to="/community" tone="slate" icon={<Users size={20} />} label={t('dashboard.quickActions.community')} />
    </div>
  );
}

export default function Dashboard() {
  const { activeFarm, activeFarmId, user } = useAuth();
  const { t, formatRelativeTime: timeAgoT } = useLocale();
  const displayName = user?.email ? user.email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'there';
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [recentCommands, setRecentCommands] = useState([]);
  const [aiInsight, setAiInsight] = useState(null);
  const [error, setError] = useState('');

  // 3s polling: the bounded backend demo drives one simulated reading
  // every ~4s and completes a full irrigation cycle in well under two
  // minutes, so a snappier refresh makes the MEASURE -> UNDERSTAND ->
  // DECIDE -> ACT -> VERIFY transitions visible live during a
  // presentation without over-polling (single farm, single tab).
  usePolling(async () => {
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

      // AI insight is best-effort and must never break the dashboard:
      // a valve with too little history or no trained model yet
      // returns `available: false`, which AiInsightCard renders as
      // "collecting more data" rather than a crash or blank card.
      const primaryValveId = data.valves[0]?.valveId;
      if (primaryValveId) {
        try {
          const insight = await api.get(`/ai/recommendations/${primaryValveId}`);
          setAiInsight(insight);
        } catch (aiErr) {
          setAiInsight(null);
        }
      } else {
        setAiInsight(null);
      }
    } catch (err) {
      setError(err.message);
    }
  }, 3000, [activeFarmId]);

  if (error) return <EmptyState title={t('dashboard.couldNotLoad')} sub={error} />;
  if (!summary) return <DashboardSkeleton />;

  const primaryDevice = summary.devices[0];
  const latest = primaryDevice ? summary.latestTelemetryByDevice[primaryDevice.deviceId] : null;
  const primaryValve = summary.valves[0];
  const unresolvedAlerts = summary.alerts.filter((a) => !a.acknowledged);
  const criticalAlerts = unresolvedAlerts.filter((a) => a.severity === 'critical').length;
  const allOperational = criticalAlerts === 0 && summary.deviceCounts.offline === 0;

  const moisture = latest?.soilMoisturePercent;
  const temperature = latest?.temperatureCelsius;
  const ec = latest?.soilSalinityPpt;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-brand-500">
            {t(greetingKey())}, {displayName}
          </div>
          <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">
            {activeFarm?.name || t('dashboard.yourFarm')}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{t('dashboard.heroSubtitle')}</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 rounded-full border border-slate-100 bg-white px-3 py-1.5 font-medium text-slate-400 shadow-card">
            <MapPin size={12} />
            {activeFarm?.location?.village || activeFarm?.location?.governorate
              ? `${activeFarm.location.village || ''}${activeFarm.location.village && activeFarm.location.governorate ? ', ' : ''}${activeFarm.location.governorate || ''}`
              : t('dashboard.locationNotSet')}
          </div>
          <div
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-semibold ${
              allOperational ? 'border-brand-100 bg-brand-50 text-brand-700' : 'border-amber-100 bg-amber-50 text-amber-700'
            }`}
          >
            {allOperational ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
            {allOperational ? t('dashboard.allSystemsOperational') : t('dashboard.issues', { count: criticalAlerts + summary.deviceCounts.offline })}
          </div>
        </div>
      </div>

      <FarmStatusInsight valve={primaryValve} moisture={moisture} latest={latest} />

      <AiInsightCard insight={aiInsight} />

      <GeminiCopilotCard valveId={primaryValve?.valveId} deviceOnline={primaryDevice?.online} />

      <QuickActions />

      <KpiStrip
        moisture={moisture}
        moistureThreshold={primaryValve?.automationEnabled ? primaryValve.autoOpenBelowPercent : DEFAULT_LOW_MOISTURE_THRESHOLD}
        temperature={temperature}
        ec={ec}
        valve={primaryValve}
      />

      {/* Chart + donut */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card
          title={t('dashboard.soilMoisture')}
          subtitle={
            primaryDevice
              ? `${primaryDevice.name} · ${chartRangeLabel(history.length, t)} · ${t('dashboard.reading', { count: history.length })}`
              : chartRangeLabel(history.length, t)
          }
          className="lg:col-span-2"
        >
          {history.length ? (
            <MoistureAreaChart data={history} commands={recentCommands} />
          ) : (
            <EmptyState title={t('dashboard.noTelemetryYet')} sub={t('dashboard.noTelemetryRunDemo')} />
          )}
        </Card>
        <Card
          title={t('dashboard.devices')}
          action={
            <Link to="/devices" className="flex items-center gap-1 text-xs font-semibold text-brand-600">
              {t('dashboard.viewAll')} <ArrowRight size={12} className="rtl:rotate-180" />
            </Link>
          }
        >
          <div className="flex items-center justify-around">
            <DevicesDonut online={summary.deviceCounts.online} offline={summary.deviceCounts.offline} maintenance={summary.deviceCounts.maintenance} />
            <div className="flex flex-col gap-2 text-xs font-semibold text-slate-500">
              <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-brand-500" /> {t('dashboard.online')} <span className="text-slate-800">{summary.deviceCounts.online}</span></div>
              <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-slate-300" /> {t('dashboard.offline')} <span className="text-slate-800">{summary.deviceCounts.offline}</span></div>
              <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> {t('dashboard.maintenance')} <span className="text-slate-800">{summary.deviceCounts.maintenance}</span></div>
            </div>
          </div>
          {primaryDevice && (
            <div className="mt-4 flex items-center justify-between border-t border-slate-50 pt-3 text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5 font-semibold text-slate-500">
                {primaryDevice.online ? <Wifi size={13} className="text-brand-500" /> : <WifiOff size={13} className="text-slate-300" />}
                {primaryDevice.name}
              </span>
              <span>{t('dashboard.lastTelemetry', { time: timeAgoT(latest?.recordedAt) })}</span>
            </div>
          )}
        </Card>
      </div>

      {/* Active irrigation + alerts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <IrrigationLifecycle
          valve={primaryValve}
          moisture={moisture}
          moistureThreshold={primaryValve?.automationEnabled ? primaryValve.autoOpenBelowPercent : DEFAULT_LOW_MOISTURE_THRESHOLD}
          latestCommand={recentCommands[0]}
        />

        <Card
          title={t('dashboard.alerts')}
          action={
            <Link to="/alerts" className="flex items-center gap-1 text-xs font-semibold text-brand-600">
              {t('dashboard.viewAll')} <ArrowRight size={12} className="rtl:rotate-180" />
            </Link>
          }
        >
          {unresolvedAlerts.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl bg-brand-50/60 px-4 py-3.5">
              <CheckCircle2 className="shrink-0 text-brand-500" size={20} />
              <div>
                <div className="text-xs font-bold text-slate-700">{t('dashboard.noActiveAlerts')}</div>
                <div className="text-[11px] text-slate-500">{t('dashboard.noActiveAlertsDetail')}</div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {unresolvedAlerts.slice(0, 3).map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={15} className={a.severity === 'critical' ? 'text-red-500' : 'text-amber-500'} />
                    <div>
                      <div className="text-xs font-bold text-slate-700">{a.title}</div>
                      <div className="text-[11px] text-slate-400">{a.message}</div>
                    </div>
                  </div>
                  <Badge tone={a.severity === 'critical' ? 'red' : 'amber'}>{a.severity}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <IrrigationJourney valve={primaryValve} moisture={moisture} latestCommand={recentCommands[0]} />

      <RecentActivity commands={recentCommands} />
    </div>
  );
}

/**
 * "Farm Intelligence" primary insight — one real, data-derived headline
 * + supporting sentence. Text is chosen from a small fixed set of
 * states based on actual moisture/valve data; nothing here is
 * generated or fabricated.
 */
function FarmStatusInsight({ valve, moisture, latest }) {
  const { t, formatRelativeTime: timeAgoT } = useLocale();
  const lowThreshold = valve?.automationEnabled ? valve.autoOpenBelowPercent : DEFAULT_LOW_MOISTURE_THRESHOLD;
  const isOpen = valve?.commandedState === 'open';
  const hasData = moisture != null;
  const isDry = hasData && lowThreshold != null && moisture < lowThreshold;

  let icon = Activity;
  let tone = 'brand';
  let headline = t('dashboard.waitingForData');
  let detail = t('dashboard.waitingForDataDetail');

  if (!hasData) {
    icon = Radio;
    tone = 'slate';
    headline = t('dashboard.waitingForTelemetry');
    detail = t('dashboard.waitingForTelemetryDetail');
  } else if (isOpen) {
    icon = Waves;
    tone = 'accent';
    headline = t('dashboard.irrigationInProgress');
    detail = t('dashboard.valveIsOpen', { valve: valve.name });
  } else if (isDry) {
    icon = AlertTriangle;
    tone = 'amber';
    headline = t('dashboard.irrigationRecommended');
    detail = t('dashboard.belowThresholdDetail');
  } else {
    icon = ShieldCheck;
    tone = 'brand';
    headline = t('dashboard.conditionsStable');
    detail = t('dashboard.aboveThresholdDetail');
  }

  const Icon = icon;
  // DecisionCard only knows brand/accent/amber/slate tones — "tone"
  // here already only ever takes those four values (see the branches
  // above), so this is a direct pass-through, not a remap.
  return (
    <DecisionCard
      tone={tone}
      icon={<Icon size={22} />}
      eyebrow={t('dashboard.farmStatusEyebrow')}
      headline={headline}
      action={
        latest?.recordedAt ? (
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
            <Clock size={12} />
            {t('dashboard.updated')} · {timeAgoT(latest.recordedAt)}
          </div>
        ) : null
      }
    >
      {detail}
    </DecisionCard>
  );
}

/**
 * Compact, dense KPI strip — one bordered container with four
 * value/status/context blocks separated by hairline dividers, instead
 * of four separate elevated cards. Every value comes straight from the
 * latest real telemetry/valve state; context text only appears when it
 * can be derived from real data already on hand (threshold comparisons,
 * valve state), never invented.
 */
function KpiStrip({ moisture, moistureThreshold, temperature, ec, valve }) {
  const { t } = useLocale();
  const th = moistureThreshold ?? DEFAULT_LOW_MOISTURE_THRESHOLD;
  const moistureStatus = moisture == null ? t('dashboard.noData') : moisture < th ? t('dashboard.low') : moisture > 85 ? t('dashboard.high') : t('dashboard.moderate');
  const moistureContext =
    moisture == null
      ? t('dashboard.waitingForReading')
      : moisture < th
        ? t('dashboard.belowThresholdPct', { pct: th })
        : t('dashboard.aboveThresholdPct', { pct: th });

  const temperatureStatus = temperature == null ? t('dashboard.noData') : temperature > 35 ? t('dashboard.high') : t('dashboard.normal');
  const isOpen = valve?.commandedState === 'open';

  const items = [
    {
      icon: Droplet,
      label: t('dashboard.soilMoisture'),
      value: moisture != null ? `${moisture}%` : '—',
      status: moistureStatus,
      statusTone: moisture != null && (moisture < th || moisture > 85) ? 'amber' : 'slate',
      context: moistureContext,
      primary: true,
    },
    {
      icon: Thermometer,
      label: t('dashboard.temperature'),
      value: temperature != null ? `${temperature}°C` : '—',
      status: temperatureStatus,
      statusTone: temperature != null && temperature > 35 ? 'amber' : 'green',
      context: temperature == null ? t('dashboard.waitingForReading') : temperature > 35 ? t('dashboard.aboveTypicalRange') : t('dashboard.withinTypicalRange'),
    },
    {
      icon: FlaskConical,
      label: t('dashboard.ecSalinity'),
      value: ec != null ? `${ec} dS/m` : '—',
      status: ec == null ? t('dashboard.noData') : t('dashboard.reading'),
      statusTone: 'slate',
      context: ec == null ? t('dashboard.waitingForReading') : t('dashboard.fromLatestReading'),
    },
    {
      icon: Waves,
      label: t('dashboard.irrigation'),
      value: !valve ? '—' : isOpen ? t('dashboard.open') : t('dashboard.closed'),
      status: !valve ? t('dashboard.noValve') : isOpen ? t('dashboard.running') : t('dashboard.idle'),
      statusTone: isOpen ? 'green' : 'slate',
      context: !valve ? t('dashboard.noValveProvisioned') : isOpen ? t('dashboard.valveOpenDetail', { valve: valve.name }) : t('dashboard.valveClosedDetail', { valve: valve.name }),
    },
  ];

  const statusToneClass = { amber: 'text-amber-600', green: 'text-brand-600', slate: 'text-slate-400' };

  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 rounded-xl2 border border-slate-100 bg-white shadow-card sm:grid-cols-[1.3fr_1fr_1fr_1fr] sm:divide-y-0">
      {items.map((it) => (
        <div
          key={it.label}
          className={`flex flex-col gap-1 px-4 py-3.5 ${it.primary ? 'bg-brand-50/40' : ''}`}
        >
          <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${it.primary ? 'text-brand-600' : 'text-slate-400'}`}>
            <it.icon size={it.primary ? 14 : 13} /> {it.label}
            {it.primary && <span className="ms-1 rounded-full bg-brand-100 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-brand-700">{t('dashboard.keySignal')}</span>}
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`font-extrabold text-slate-800 ${it.primary ? 'text-3xl' : 'text-xl'}`}>{it.value}</span>
            <span className={`font-bold ${it.primary ? 'text-xs' : 'text-[11px]'} ${statusToneClass[it.statusTone] || statusToneClass.slate}`}>{it.status}</span>
          </div>
          <div className="text-[11px] text-slate-400">{it.context}</div>
        </div>
      ))}
    </div>
  );
}

const LIFECYCLE_STAGES = [
  { key: 'decide', labelKey: 'dashboard.stageDecide' },
  { key: 'command', labelKey: 'dashboard.stageCommand' },
  { key: 'execute', labelKey: 'dashboard.stageAct' },
  { key: 'verify', labelKey: 'dashboard.stageVerify' },
];

// Maps the command's real backend status onto the 4-stage Decide ->
// Command -> Execute -> Verify story. No client-side fake transitions —
// this only groups the backend's own state machine values
// (pending/queued/sent/acknowledged/executing/completed/failed/expired)
// into the four story stages.
function lifecyclePhase(status) {
  switch (status) {
    case 'pending':
      return 0;
    case 'queued':
    case 'sent':
      return 1;
    case 'acknowledged':
    case 'executing':
      return 2;
    case 'completed':
    case 'failed':
    case 'expired':
      return 3;
    default:
      return 0;
  }
}

/**
 * Irrigation lifecycle card — communicates Decide -> Command -> Execute
 * -> Verify for the most recent real irrigation command (open_valve or
 * close_valve). Falls back to a simple idle summary when there is no
 * valve, or no irrigation command has happened yet.
 */
function IrrigationLifecycle({ valve, moisture, moistureThreshold, latestCommand }) {
  const { t } = useLocale();
  if (!valve) {
    return (
      <Card title={t('dashboard.irrigation')}>
        <EmptyState title={t('dashboard.noValveProvisioned')} sub={t('irrigation.noValvesSub')} />
      </Card>
    );
  }

  const isIrrigationCommand = latestCommand?.type === 'open_valve' || latestCommand?.type === 'close_valve';

  if (!isIrrigationCommand) {
    const isDry = moisture != null && moistureThreshold != null && moisture < moistureThreshold;
    return (
      <Card title={t('dashboard.irrigation')}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-slate-800">{t('dashboard.systemIdle')}</div>
            <div className="mt-1 text-xs text-slate-400">
              {moisture != null && moistureThreshold != null
                ? isDry
                  ? t('dashboard.moistureBelowSoon', { pct: moisture, threshold: moistureThreshold })
                  : t('dashboard.moistureAbove', { pct: moisture, threshold: moistureThreshold })
                : t('dashboard.valveClosedNoData')}
            </div>
          </div>
          <Badge tone="slate">{t('dashboard.closed')}</Badge>
        </div>
      </Card>
    );
  }

  const isOpenCommand = latestCommand.type === 'open_valve';
  const failed = latestCommand.status === 'failed' || latestCommand.status === 'expired';
  const phase = lifecyclePhase(latestCommand.status);
  const confirmedOpen = valve.confirmedState === 'open';

  const stageDetail = [
    t('dashboard.understandDryDetail', { pct: moistureThreshold }),
    isOpenCommand ? t('irrigation.stageRequested') + ' — OPEN' : t('irrigation.stageRequested') + ' — CLOSE',
    phase >= 2 ? t('irrigation.stageAcknowledged') : t('dashboard.actDispatchedSuffix'),
    failed
      ? t('irrigation.commandStatusLabel', { status: latestCommand.status })
      : phase === 3
        ? confirmedOpen
          ? t('dashboard.verifyOpenDetail')
          : t('dashboard.verifyClosedDetail')
        : t('dashboard.verifyAwaitingDetail'),
  ];

  return (
    <Card
      title={t('dashboard.irrigation')}
      subtitle={`${valve.name} · ${t('dashboard.lifecycleCaption')}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-2">
        {LIFECYCLE_STAGES.map((stage, i) => {
          const reached = i <= phase;
          const isCurrent = i === phase;
          return (
            <div key={stage.key} className="flex flex-1 items-center gap-2">
              <div
                className={`flex flex-1 flex-col gap-1 rounded-xl border p-3 ${
                  failed && i === 3
                    ? 'border-red-200 bg-red-50/70'
                    : reached
                      ? 'border-brand-200 bg-brand-50/70'
                      : 'border-slate-100 bg-slate-50/60'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                      failed && i === 3 ? 'bg-red-500 text-white' : reached ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-400'
                    }`}
                  >
                    {reached && !isCurrent ? <Check size={11} /> : <span className="text-[10px] font-bold">{i + 1}</span>}
                  </div>
                  <div className={`text-[11px] font-extrabold uppercase tracking-wide ${reached ? 'text-brand-700' : 'text-slate-400'}`}>
                    {t(stage.labelKey)}
                  </div>
                </div>
                <div className="text-[11px] leading-snug text-slate-500">{reached ? stageDetail[i] : '—'}</div>
              </div>
              {i < LIFECYCLE_STAGES.length - 1 && (
                <ArrowRight size={14} className={`hidden shrink-0 sm:block rtl:rotate-180 ${reached ? 'text-brand-300' : 'text-slate-200'}`} />
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/**
 * Real, data-driven MEASURE -> UNDERSTAND -> DECIDE -> ACT -> VERIFY
 * strip. Every stage's status text is derived from actual API data
 * (latest telemetry, the valve's real commandedState/confirmedState
 * and — when automation is on — its own real thresholds, and the most
 * recent farm command). Nothing here is a client-side fake transition;
 * it simply narrates state that already came from the backend.
 */
function IrrigationJourney({ valve, moisture, latestCommand }) {
  const { t } = useLocale();
  const lowThreshold = valve?.automationEnabled ? valve.autoOpenBelowPercent : DEFAULT_LOW_MOISTURE_THRESHOLD;
  const highThreshold = valve?.automationEnabled ? valve.autoCloseAbovePercent : null;

  const hasData = moisture != null;
  const isDry = hasData && lowThreshold != null && moisture < lowThreshold;
  const isRecovered = hasData && highThreshold != null && moisture >= highThreshold;

  const commandedOpen = valve?.commandedState === 'open';
  const confirmedOpen = valve?.confirmedState === 'open';
  const awaitingConfirmation = !!valve && valve.commandedState !== valve.confirmedState;

  const latestIsOpenCommand = latestCommand?.type === 'open_valve';
  const latestIsCloseCommand = latestCommand?.type === 'close_valve';

  const steps = [
    {
      key: 'measure',
      icon: Activity,
      label: t('dashboard.stageMeasure'),
      active: true,
      detail: hasData ? t('dashboard.measureActiveDetail', { pct: moisture }) : t('dashboard.measureIdleDetail'),
    },
    {
      key: 'understand',
      icon: Search,
      label: t('dashboard.stageUnderstand'),
      active: hasData,
      detail: !hasData
        ? t('dashboard.understandIdleDetail')
        : isDry
          ? t('dashboard.understandDryDetail', { pct: lowThreshold })
          : t('dashboard.understandOkDetail'),
    },
    {
      key: 'decide',
      icon: Brain,
      label: t('dashboard.stageDecide'),
      active: isDry || commandedOpen || latestIsOpenCommand,
      detail: latestIsOpenCommand
        ? t('dashboard.decideOpenDetail')
        : latestIsCloseCommand
          ? t('dashboard.decideCloseDetail')
          : isDry
            ? t('dashboard.decidePendingDetail')
            : t('dashboard.decideNoneDetail'),
    },
    {
      key: 'act',
      icon: Zap,
      label: t('dashboard.stageAct'),
      active: commandedOpen,
      detail: commandedOpen
        ? t('dashboard.actOpenDetail', { suffix: awaitingConfirmation ? t('dashboard.actDispatchedSuffix') : '' })
        : t('dashboard.actNoneDetail'),
    },
    {
      key: 'verify',
      icon: ShieldCheck,
      label: t('dashboard.stageVerify'),
      active: !!valve && !awaitingConfirmation,
      detail: !valve
        ? t('dashboard.verifyNoneDetail')
        : awaitingConfirmation
          ? t('dashboard.verifyAwaitingDetail')
          : confirmedOpen
            ? isRecovered
              ? t('dashboard.verifyRecoveredDetail')
              : t('dashboard.verifyOpenDetail')
            : t('dashboard.verifyClosedDetail'),
    },
  ];

  return (
    <Card title={t('dashboard.howItWorks')} action={<span className="text-[11px] font-semibold text-slate-400">{t('dashboard.journeyCaption')}</span>}>
      <div className="flex flex-col gap-3 md:flex-row md:items-stretch md:gap-2">
        {steps.map((step, i) => (
          <div key={step.key} className="flex flex-1 items-center gap-2">
            <div
              className={`flex flex-1 flex-col gap-1.5 rounded-xl2 border p-3.5 transition-colors ${
                step.active ? 'border-brand-200 bg-brand-50/70' : 'border-slate-100 bg-slate-50/60'
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    step.active ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-400'
                  }`}
                >
                  <step.icon size={16} />
                </div>
                <div className={`text-xs font-extrabold uppercase tracking-wide ${step.active ? 'text-brand-700' : 'text-slate-400'}`}>
                  {step.label}
                </div>
              </div>
              <div className="text-[11px] leading-snug text-slate-500">{step.detail}</div>
            </div>
            {i < steps.length - 1 && (
              <ArrowRight size={16} className={`hidden shrink-0 md:block rtl:rotate-180 ${step.active ? 'text-brand-300' : 'text-slate-200'}`} />
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

const COMMAND_STAGE = {
  pending: { labelKey: 'irrigation.stageRequested', pct: 20 },
  queued: { labelKey: 'irrigation.stageQueued', pct: 35 },
  sent: { labelKey: 'irrigation.stageSent', pct: 55 },
  acknowledged: { labelKey: 'irrigation.stageAcknowledged', pct: 70 },
  executing: { labelKey: 'irrigation.stageExecuting', pct: 85 },
  completed: { labelKey: 'irrigation.stageCompleted', pct: 100 },
  failed: { labelKey: 'irrigation.badgeFailed', pct: 100 },
  expired: { labelKey: 'irrigation.badgeExpired', pct: 100 },
};

/**
 * Real command/irrigation activity feed (GET
 * /dashboard/farms/:farmId/commands). Each row's progress reflects the
 * command's actual status field from the backend's own state machine
 * (pending -> queued -> sent -> acknowledged -> executing -> completed
 * /failed/expired) — this visually tells the DECIDE -> COMMAND ->
 * EXECUTE -> VERIFY story using only real, already-returned data.
 */
function RecentActivity({ commands }) {
  const { t, formatRelativeTime: timeAgoT } = useLocale();
  return (
    <Card
      title={t('dashboard.recentIrrigationActivity')}
      subtitle={t('dashboard.lifecycleCaption')}
    >
      {commands.length === 0 ? (
        <EmptyState title={t('dashboard.noCommandsYet')} sub={t('dashboard.noCommandsYetDetail')} />
      ) : (
        <div className="flex flex-col">
          {commands.slice(0, 6).map((c, i) => {
            const stage = COMMAND_STAGE[c.status] || { labelKey: null, pct: 10 };
            const stageLabel = stage.labelKey ? t(stage.labelKey) : c.status;
            const failed = c.status === 'failed' || c.status === 'expired';
            const isLast = i === Math.min(commands.length, 6) - 1;
            const typeLabel = c.type === 'open_valve' ? t('irrigation.startIrrigation') : c.type === 'close_valve' ? t('irrigation.stopIrrigation') : c.type.replace(/_/g, ' ');
            return (
              <div key={c.commandId} className="relative flex gap-3 pb-4 last:pb-0">
                {!isLast && <div className="absolute start-[15px] top-8 h-full w-px bg-slate-100" />}
                <div
                  className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    failed ? 'bg-red-100 text-red-600' : c.status === 'completed' ? 'bg-brand-100 text-brand-700' : 'bg-accent-100 text-accent-700'
                  }`}
                >
                  <Droplet size={14} />
                </div>
                <div className="flex-1 pt-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-bold text-slate-700">
                      {typeLabel}
                    </div>
                    <Badge tone={c.status === 'completed' ? 'green' : failed ? 'red' : 'blue'}>{stageLabel}</Badge>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
                    <Clock size={11} /> {timeAgoT(c.createdAt)} · {c.deviceId}
                  </div>
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${failed ? 'bg-red-400' : 'bg-accent-500'}`}
                      style={{ width: `${stage.pct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
