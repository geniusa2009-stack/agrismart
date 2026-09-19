import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Droplet, Thermometer, FlaskConical, Waves, CheckCircle2, AlertTriangle, ArrowRight,
  Activity, Search, Brain, Zap, ShieldCheck, Clock, MapPin, Wifi, WifiOff, Radio, Check,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { usePolling } from '../hooks';
import { Card, Badge, EmptyState, DashboardSkeleton, timeAgo } from '../components/ui';
import AiInsightCard from '../components/AiInsightCard';
import { MoistureAreaChart, DevicesDonut } from '../components/charts';

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

function chartRangeLabel(readingCount) {
  return readingCount > 0 && readingCount <= SPARSE_READING_THRESHOLD ? 'Recent readings' : `${REQUESTED_RANGE_LABEL} range`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const { activeFarm, activeFarmId, user } = useAuth();
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

  if (error) return <EmptyState title="Could not load dashboard" sub={error} />;
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
            {greeting()}, {displayName}
          </div>
          <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">
            {activeFarm?.name || 'Your Farm'}
          </h1>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 rounded-full border border-slate-100 bg-white px-3 py-1.5 font-medium text-slate-400 shadow-card">
            <MapPin size={12} />
            {activeFarm?.location?.village || activeFarm?.location?.governorate
              ? `${activeFarm.location.village || ''}${activeFarm.location.village && activeFarm.location.governorate ? ', ' : ''}${activeFarm.location.governorate || ''}`
              : 'Location not set'}
          </div>
          <div
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-semibold ${
              allOperational ? 'border-brand-100 bg-brand-50 text-brand-700' : 'border-amber-100 bg-amber-50 text-amber-700'
            }`}
          >
            {allOperational ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
            {allOperational ? 'All Systems Operational' : `${criticalAlerts + summary.deviceCounts.offline} Issue(s)`}
          </div>
        </div>
      </div>

      <FarmStatusInsight valve={primaryValve} moisture={moisture} latest={latest} />

      <AiInsightCard insight={aiInsight} />

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
          title="Soil Moisture"
          subtitle={
            primaryDevice
              ? `${primaryDevice.name} · ${chartRangeLabel(history.length)} · ${history.length} reading${history.length === 1 ? '' : 's'}`
              : chartRangeLabel(history.length)
          }
          className="lg:col-span-2"
        >
          {history.length ? (
            <MoistureAreaChart data={history} commands={recentCommands} />
          ) : (
            <EmptyState title="No telemetry yet" sub="Run npm run demo to start simulated readings." />
          )}
        </Card>
        <Card
          title="Devices"
          action={
            <Link to="/devices" className="flex items-center gap-1 text-xs font-semibold text-brand-600">
              View All <ArrowRight size={12} />
            </Link>
          }
        >
          <div className="flex items-center justify-around">
            <DevicesDonut online={summary.deviceCounts.online} offline={summary.deviceCounts.offline} maintenance={summary.deviceCounts.maintenance} />
            <div className="flex flex-col gap-2 text-xs font-semibold text-slate-500">
              <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-brand-500" /> Online <span className="text-slate-800">{summary.deviceCounts.online}</span></div>
              <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-slate-300" /> Offline <span className="text-slate-800">{summary.deviceCounts.offline}</span></div>
              <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Maintenance <span className="text-slate-800">{summary.deviceCounts.maintenance}</span></div>
            </div>
          </div>
          {primaryDevice && (
            <div className="mt-4 flex items-center justify-between border-t border-slate-50 pt-3 text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5 font-semibold text-slate-500">
                {primaryDevice.online ? <Wifi size={13} className="text-brand-500" /> : <WifiOff size={13} className="text-slate-300" />}
                {primaryDevice.name}
              </span>
              <span>Last telemetry {timeAgo(latest?.recordedAt)}</span>
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
          title="Alerts"
          action={
            <Link to="/alerts" className="flex items-center gap-1 text-xs font-semibold text-brand-600">
              View All <ArrowRight size={12} />
            </Link>
          }
        >
          {unresolvedAlerts.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl bg-brand-50/60 px-4 py-3.5">
              <CheckCircle2 className="shrink-0 text-brand-500" size={20} />
              <div>
                <div className="text-xs font-bold text-slate-700">No active alerts</div>
                <div className="text-[11px] text-slate-500">Your farm is operating normally.</div>
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
  const lowThreshold = valve?.automationEnabled ? valve.autoOpenBelowPercent : DEFAULT_LOW_MOISTURE_THRESHOLD;
  const isOpen = valve?.commandedState === 'open';
  const hasData = moisture != null;
  const isDry = hasData && lowThreshold != null && moisture < lowThreshold;

  let icon = Activity;
  let tone = 'brand';
  let headline = 'Waiting for data';
  let detail = 'No telemetry has been received yet for this farm.';

  if (!hasData) {
    icon = Radio;
    tone = 'slate';
    headline = 'Waiting for telemetry';
    detail = 'No recent sensor reading is available.';
  } else if (isOpen) {
    icon = Waves;
    tone = 'accent';
    headline = 'Irrigation in progress';
    detail = `${valve.name} valve is open.`;
  } else if (isDry) {
    icon = AlertTriangle;
    tone = 'amber';
    headline = 'Irrigation recommended';
    detail = 'Soil moisture is below the configured threshold.';
  } else {
    icon = ShieldCheck;
    tone = 'brand';
    headline = 'Conditions are stable';
    detail = 'Soil moisture is above the irrigation threshold.';
  }

  const tones = {
    brand: { bg: 'bg-brand-50/70', ring: 'bg-brand-600', text: 'text-brand-800' },
    accent: { bg: 'bg-accent-50/70', ring: 'bg-accent-600', text: 'text-accent-800' },
    amber: { bg: 'bg-amber-50/70', ring: 'bg-amber-500', text: 'text-amber-800' },
    slate: { bg: 'bg-slate-50', ring: 'bg-slate-400', text: 'text-slate-700' },
  };
  const t = tones[tone];
  const Icon = icon;

  return (
    <div className={`flex items-center gap-4 rounded-xl2 border border-slate-100 ${t.bg} px-5 py-4 shadow-card`}>
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${t.ring} text-white`}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <div className={`text-base font-extrabold ${t.text}`}>{headline}</div>
        <div className="mt-0.5 text-xs text-slate-500">{detail}</div>
      </div>
      {latest?.recordedAt && (
        <div className="ml-auto hidden shrink-0 text-right text-[11px] text-slate-400 sm:block">
          <div>Updated</div>
          <div className="font-semibold text-slate-500">{timeAgo(latest.recordedAt)}</div>
        </div>
      )}
    </div>
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
  const moistureStatus = moisture == null ? 'No data' : moisture < (moistureThreshold ?? DEFAULT_LOW_MOISTURE_THRESHOLD) ? 'Low' : moisture > 85 ? 'High' : 'Moderate';
  const moistureContext =
    moisture == null
      ? 'Waiting for a reading'
      : moisture < (moistureThreshold ?? DEFAULT_LOW_MOISTURE_THRESHOLD)
        ? `Below ${moistureThreshold ?? DEFAULT_LOW_MOISTURE_THRESHOLD}% threshold`
        : `Above ${moistureThreshold ?? DEFAULT_LOW_MOISTURE_THRESHOLD}% threshold`;

  const temperatureStatus = temperature == null ? 'No data' : temperature > 35 ? 'High' : 'Normal';
  const isOpen = valve?.commandedState === 'open';

  const items = [
    {
      icon: Droplet,
      label: 'Soil Moisture',
      value: moisture != null ? `${moisture}%` : '—',
      status: moistureStatus,
      statusTone: moisture != null && (moisture < (moistureThreshold ?? DEFAULT_LOW_MOISTURE_THRESHOLD) || moisture > 85) ? 'amber' : 'slate',
      context: moistureContext,
      primary: true,
    },
    {
      icon: Thermometer,
      label: 'Temperature',
      value: temperature != null ? `${temperature}°C` : '—',
      status: temperatureStatus,
      statusTone: temperature != null && temperature > 35 ? 'amber' : 'green',
      context: temperature == null ? 'Waiting for a reading' : temperature > 35 ? 'Above typical range' : 'Within typical range',
    },
    {
      icon: FlaskConical,
      label: 'EC / Salinity',
      value: ec != null ? `${ec} dS/m` : '—',
      status: ec == null ? 'No data' : 'Reading',
      statusTone: 'slate',
      context: ec == null ? 'Waiting for a reading' : 'From latest sensor reading',
    },
    {
      icon: Waves,
      label: 'Irrigation',
      value: !valve ? '—' : isOpen ? 'OPEN' : 'CLOSED',
      status: !valve ? 'No valve' : isOpen ? 'Running' : 'Idle',
      statusTone: isOpen ? 'green' : 'slate',
      context: !valve ? 'No valve provisioned' : isOpen ? `${valve.name} valve is open` : `${valve.name} valve is closed`,
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
            {it.primary && <span className="ml-1 rounded-full bg-brand-100 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-brand-700">Key signal</span>}
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
  { key: 'decide', label: 'Decide' },
  { key: 'command', label: 'Command' },
  { key: 'execute', label: 'Execute' },
  { key: 'verify', label: 'Verify' },
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
  if (!valve) {
    return (
      <Card title="Irrigation">
        <EmptyState title="No valve provisioned" sub="Add a device and valve to control irrigation." />
      </Card>
    );
  }

  const isIrrigationCommand = latestCommand?.type === 'open_valve' || latestCommand?.type === 'close_valve';

  if (!isIrrigationCommand) {
    const isDry = moisture != null && moistureThreshold != null && moisture < moistureThreshold;
    return (
      <Card title="Irrigation">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-slate-800">System is idle</div>
            <div className="mt-1 text-xs text-slate-400">
              {moisture != null && moistureThreshold != null
                ? isDry
                  ? `Moisture (${moisture}%) is below the ${moistureThreshold}% threshold — a decision may follow shortly.`
                  : `Moisture (${moisture}%) is above the ${moistureThreshold}% irrigation threshold.`
                : 'The valve is currently closed.'}
            </div>
          </div>
          <Badge tone="slate">Closed</Badge>
        </div>
      </Card>
    );
  }

  const isOpenCommand = latestCommand.type === 'open_valve';
  const failed = latestCommand.status === 'failed' || latestCommand.status === 'expired';
  const phase = lifecyclePhase(latestCommand.status);
  const confirmedOpen = valve.confirmedState === 'open';

  const stageDetail = [
    'Moisture below threshold',
    isOpenCommand ? 'OPEN valve' : 'CLOSE valve',
    phase >= 2 ? 'Valve acknowledged' : 'Dispatched to device',
    failed
      ? `Command ${latestCommand.status}`
      : phase === 3
        ? confirmedOpen
          ? 'Valve confirmed open'
          : 'Valve confirmed closed'
        : 'Awaiting confirmation',
  ];

  return (
    <Card
      title="Irrigation"
      subtitle={`${valve.name} · Decide → Command → Execute → Verify`}
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
                    {stage.label}
                  </div>
                </div>
                <div className="text-[11px] leading-snug text-slate-500">{reached ? stageDetail[i] : '—'}</div>
              </div>
              {i < LIFECYCLE_STAGES.length - 1 && (
                <ArrowRight size={14} className={`hidden shrink-0 sm:block ${reached ? 'text-brand-300' : 'text-slate-200'}`} />
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
      label: 'Measure',
      active: true,
      detail: hasData ? `Moisture ${moisture}% from live sensor readings.` : 'Waiting for the first telemetry reading.',
    },
    {
      key: 'understand',
      icon: Search,
      label: 'Understand',
      active: hasData,
      detail: !hasData
        ? 'No readings yet.'
        : isDry
          ? `Dry soil detected (below ${lowThreshold}%).`
          : 'Soil moisture is within the healthy range.',
    },
    {
      key: 'decide',
      icon: Brain,
      label: 'Decide',
      active: isDry || commandedOpen || latestIsOpenCommand,
      detail: latestIsOpenCommand
        ? 'Decision made: open the valve.'
        : latestIsCloseCommand
          ? 'Decision made: close the valve (moisture recovered).'
          : isDry
            ? 'Decision pending: dry soil calls for irrigation.'
            : 'No irrigation decision needed right now.',
    },
    {
      key: 'act',
      icon: Zap,
      label: 'Act',
      active: commandedOpen,
      detail: commandedOpen
        ? `OPEN_VALVE command issued${awaitingConfirmation ? ' — dispatched to device' : ''}.`
        : 'No open command currently in effect.',
    },
    {
      key: 'verify',
      icon: ShieldCheck,
      label: 'Verify',
      active: !!valve && !awaitingConfirmation,
      detail: !valve
        ? 'No valve provisioned yet.'
        : awaitingConfirmation
          ? 'Awaiting device confirmation of last command.'
          : confirmedOpen
            ? isRecovered
              ? 'Moisture recovered — ready to close.'
              : 'Valve confirmed OPEN by the device.'
            : 'Valve confirmed CLOSED by the device.',
    },
  ];

  return (
    <Card title="How AgriSmart Works — Live" action={<span className="text-[11px] font-semibold text-slate-400">Measure → Understand → Decide → Act → Verify</span>}>
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
              <ArrowRight size={16} className={`hidden shrink-0 md:block ${step.active ? 'text-brand-300' : 'text-slate-200'}`} />
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

const COMMAND_STAGE = {
  pending: { label: 'Decided', pct: 20 },
  queued: { label: 'Queued', pct: 35 },
  sent: { label: 'Dispatched', pct: 55 },
  acknowledged: { label: 'Acknowledged', pct: 70 },
  executing: { label: 'Executing', pct: 85 },
  completed: { label: 'Verified', pct: 100 },
  failed: { label: 'Failed', pct: 100 },
  expired: { label: 'Expired', pct: 100 },
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
  return (
    <Card
      title="Recent Irrigation Activity"
      subtitle="Decide → Command → Execute → Verify"
    >
      {commands.length === 0 ? (
        <EmptyState title="No commands yet" sub="Irrigation commands (manual or automatic) will appear here." />
      ) : (
        <div className="flex flex-col">
          {commands.slice(0, 6).map((c, i) => {
            const stage = COMMAND_STAGE[c.status] || { label: c.status, pct: 10 };
            const failed = c.status === 'failed' || c.status === 'expired';
            const isLast = i === Math.min(commands.length, 6) - 1;
            return (
              <div key={c.commandId} className="relative flex gap-3 pb-4 last:pb-0">
                {!isLast && <div className="absolute left-[15px] top-8 h-full w-px bg-slate-100" />}
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
                      {c.type.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase())}
                    </div>
                    <Badge tone={c.status === 'completed' ? 'green' : failed ? 'red' : 'blue'}>{stage.label}</Badge>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
                    <Clock size={11} /> {timeAgo(c.createdAt)} · {c.deviceId}
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
