import { useState } from 'react';
import {
  Power, Loader2, ShieldAlert, Settings2, WifiOff, Clock,
  CheckCircle2, AlertTriangle, CircleQuestionMark, Check, X, ArrowRight, Activity,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { usePolling } from '../hooks';
import { Card, Badge, ProgressBar, Spinner, EmptyState } from '../components/ui';
import { selectLatestCommand, findMostRecentCompleted } from '../lib/commandSelection';
import { useLocale } from '../i18n/LocaleContext';
import { translateApiError } from '../i18n/errorMessages';
import VoiceCommandPanel from '../components/VoiceCommandPanel';

// Matches the same fallback the Dashboard uses (dashboard.service.js's
// own ALERT_THRESHOLDS.SOIL_MOISTURE_LOW_PERCENT) when a valve doesn't
// have automation-derived thresholds of its own.
const DEFAULT_LOW_MOISTURE_THRESHOLD = 30;

const DURATION_PRESETS = [
  { label: '30 sec', seconds: 30 },
  { label: '1 min', seconds: 60 },
  { label: '5 min', seconds: 300 },
  { label: '10 min', seconds: 600 },
];

// The real backend command state machine (deviceCommand.model.js
// COMMAND_STATUS / commands.service.js) — PENDING is immediately
// advanced to QUEUED by issueCommand(), so "Requested" below is shown
// for either. FAILED/EXPIRED are terminal and rendered separately, not
// as a step in this forward progression.
const COMMAND_STAGES = [
  { key: 'pending', labelKey: 'irrigation.stageRequested' },
  { key: 'queued', labelKey: 'irrigation.stageQueued' },
  { key: 'sent', labelKey: 'irrigation.stageSent' },
  { key: 'acknowledged', labelKey: 'irrigation.stageAcknowledged' },
  { key: 'executing', labelKey: 'irrigation.stageExecuting' },
  { key: 'completed', labelKey: 'irrigation.stageCompleted' },
];

function commandStagePhase(status) {
  if (status === 'pending') return 0;
  const idx = COMMAND_STAGES.findIndex((s) => s.key === status);
  return idx; // -1 for failed/expired, handled separately
}

function commandTypeLabel(type, t) {
  if (type === 'open_valve') return t('irrigation.startIrrigation');
  if (type === 'close_valve') return t('irrigation.stopIrrigation');
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Absolute local timestamp, shown alongside (not instead of) the
// existing relative time — so the Command Lifecycle card unambiguously
// identifies WHEN a command was created, not just "x ago". Uses the
// active locale so Arabic modes render Arabic month names/digits.
function formatAbsoluteTime(dateStr, localeTag) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString(localeTag, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function Irrigation() {
  const { activeFarmId } = useAuth();
  const { t, locale, formatRelativeTime: timeAgoT } = useLocale();
  const localeTag = locale === 'en' ? 'en-US' : 'ar-EG';
  const [valves, setValves] = useState(null);
  const [summary, setSummary] = useState(null);
  const [commands, setCommands] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [duration, setDuration] = useState(300);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [emergencyBusy, setEmergencyBusy] = useState(false);
  const [lastOpenResult, setLastOpenResult] = useState(null); // { deviceOnline, at } — surfaced from the real POST .../open response, not polled
  const [confirmAction, setConfirmAction] = useState(null); // 'open' | 'emergency' | null

  // Three existing, already-used-elsewhere endpoints, polled together:
  // valves (state + safety limits), farm summary (device online status +
  // latest telemetry), and farm commands (lifecycle of the most recent
  // irrigation commands). No new backend endpoint.
  usePolling(async () => {
    try {
      const [valveData, summaryData, commandData] = await Promise.all([
        api.get(`/dashboard/farms/${activeFarmId}/valves`),
        api.get(`/dashboard/farms/${activeFarmId}/summary`),
        api.get(`/dashboard/farms/${activeFarmId}/commands`),
      ]);
      setValves(valveData);
      setSummary(summaryData);
      setCommands(commandData);
      setSelectedId((prev) => (prev && valveData.some((v) => v.valveId === prev) ? prev : valveData[0]?.valveId || null));
    } catch (err) {
      setError(err.message);
    }
  }, 4000, [activeFarmId]);

  if (!valves) return <Spinner label={t('irrigation.loading')} />;
  if (valves.length === 0) return <EmptyState title={t('irrigation.noValvesTitle')} sub={t('irrigation.noValvesSub')} />;

  const valve = valves.find((v) => v.valveId === selectedId) || valves[0];
  const device = summary?.devices?.find((d) => d.deviceId === valve.deviceId) || null;
  const latestTelemetry = summary?.latestTelemetryByDevice?.[valve.deviceId] || null;
  const moisture = latestTelemetry?.soilMoisturePercent ?? null;
  const lowThreshold = valve.automationEnabled ? valve.autoOpenBelowPercent : DEFAULT_LOW_MOISTURE_THRESHOLD;
  const isDry = moisture != null && moisture < lowThreshold;

  // Latest command touching this valve's device. GET
  // /dashboard/farms/:farmId/commands is already returned newest-first
  // by the backend (commands.repository.js sorts by createdAt desc),
  // but selectLatestCommand defensively re-sorts by createdAt itself as
  // a client-side safety net — it never trusts array order alone, and
  // it never substitutes an older/nicer-looking command for the truly
  // latest one, even if the latest is expired or failed. That is the
  // honest "current command" signal for this valve.
  //
  // findMostRecentCompleted is a separate, secondary signal — the most
  // recent command that actually completed — derived from the same
  // already-fetched list (no extra API call). It is only ever shown
  // *alongside* an expired/failed latest command, never in place of it,
  // so a real failure is never hidden.
  const latestCommand = selectLatestCommand(commands, valve.deviceId);
  const mostRecentCompletedCommand = findMostRecentCompleted(commands, valve.deviceId);

  // Never exceed the backend's own maxDurationSeconds — presets above
  // it are simply not offered, and the requested value sent to the API
  // is clamped the same way.
  const availablePresets = DURATION_PRESETS.filter((d) => d.seconds <= valve.maxDurationSeconds);
  const clampedDuration = Math.min(duration, valve.maxDurationSeconds);

  async function requestOpen() {
    setBusy(true);
    setError('');
    setLastOpenResult(null);
    try {
      // idempotencyKey generated fresh for this one confirmed action —
      // not on render, not reused across retries.
      const idempotencyKey = crypto.randomUUID();
      const result = await api.post(`/irrigation/valves/${valve.valveId}/open`, {
        requestedDurationSeconds: clampedDuration,
        idempotencyKey,
      });
      // The response's own deviceOnline flag — real signal from the
      // backend, not derived or guessed on the frontend.
      setLastOpenResult({ deviceOnline: result.deviceOnline, at: Date.now() });
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
      setConfirmAction(null);
    }
  }

  async function requestClose() {
    setBusy(true);
    setError('');
    try {
      const idempotencyKey = crypto.randomUUID();
      // closeValve's real response is only { command } — the backend
      // never computes/returns a deviceOnline flag for close, so there
      // is nothing equivalent to surface here beyond the command itself
      // (shown via the command lifecycle card below from the next poll).
      await api.post(`/irrigation/valves/${valve.valveId}/close`, { idempotencyKey });
      setLastOpenResult(null);
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function emergencyStop() {
    setEmergencyBusy(true);
    setError('');
    try {
      // Emergency stop's real contract takes no body at all (no
      // idempotencyKey field in the validator) — left unchanged.
      await api.post(`/irrigation/farms/${activeFarmId}/emergency-stop`, {});
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setEmergencyBusy(false);
      setConfirmAction(null);
    }
  }

  const isOpenRequested = valve.commandedState === 'open';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button
          onClick={() => setConfirmAction('emergency')}
          disabled={emergencyBusy}
          className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-700 shadow-card hover:bg-red-100 disabled:opacity-60"
        >
          {emergencyBusy ? <Loader2 size={14} className="animate-spin" /> : <ShieldAlert size={14} />}
          {t('irrigation.emergencyStopAll')}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title={t('irrigation.valves')} className="lg:col-span-1" padded={false}>
          <div className="flex flex-col divide-y divide-slate-50">
            {valves.map((v) => (
              <button
                key={v.valveId}
                onClick={() => setSelectedId(v.valveId)}
                className={`flex items-center justify-between px-5 py-3.5 text-start ${selectedId === v.valveId ? 'bg-brand-50' : 'hover:bg-slate-50'}`}
              >
                <div className="text-sm font-bold text-slate-800">{v.name}</div>
                <div className="flex items-center gap-1.5">
                  {v.automationEnabled && <Badge tone="blue">{t('irrigation.auto')}</Badge>}
                  <PhysicalStateBadge confirmedState={v.confirmedState} t={t} />
                </div>
              </button>
            ))}
          </div>
        </Card>

        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card title={t('irrigation.soilCondition')} subtitle={valve.name}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-2xl font-extrabold text-slate-800">
                  <Activity size={18} className="text-accent-500" />
                  {moisture != null ? `${moisture}%` : '—'}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400">
                  {t('irrigation.threshold', { pct: lowThreshold })}{latestTelemetry?.recordedAt ? t('irrigation.updatedAt', { time: timeAgoT(latestTelemetry.recordedAt) }) : ''}
                </div>
              </div>
              <div className={`rounded-lg px-3 py-2 text-xs font-bold ${moisture == null ? 'bg-slate-50 text-slate-400' : isDry ? 'bg-amber-50 text-amber-700' : 'bg-brand-50 text-brand-700'}`}>
                {moisture == null ? t('irrigation.waitingForTelemetry') : isDry ? t('irrigation.irrigationRecommended') : t('irrigation.aboveThreshold')}
              </div>
            </div>
          </Card>

          <VoiceCommandPanel
            valve={valve}
            device={device}
            moisture={moisture}
            isOpenRequested={valve.commandedState === 'open'}
            onStart={() => setConfirmAction('open')}
            onStop={requestClose}
          />

          <Card title={t('irrigation.irrigationControl')}>
            <div className="flex flex-col gap-5">
              <ValvePhysicalStatePanel valve={valve} t={t} timeAgoT={timeAgoT} />

              {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</div>}

              {lastOpenResult?.deviceOnline === false && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800">
                  <WifiOff size={16} className="mt-0.5 shrink-0" />
                  <div>
                    <div className="font-bold">{t('irrigation.commandQueuedOffline')}</div>
                    <div className="mt-0.5">{t('irrigation.executionCannotConfirm')}</div>
                  </div>
                </div>
              )}

              <IrrigationModeToggle key={valve.valveId} valve={valve} t={t} />

              {!valve.automationEnabled && (
                <>
                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-slate-400">
                      <span>{t('irrigation.irrigationDuration')}</span>
                      <span className="normal-case text-slate-400">{t('irrigation.maxDuration', { duration: formatMinutes(valve.maxDurationSeconds, t) })}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {availablePresets.map((d) => (
                        <button
                          key={d.seconds}
                          onClick={() => setDuration(d.seconds)}
                          className={`rounded-lg border px-3 py-2 text-xs font-bold ${
                            clampedDuration === d.seconds ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 text-slate-600 hover:border-brand-300'
                          }`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => (isOpenRequested ? requestClose() : setConfirmAction('open'))}
                    disabled={busy}
                    className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-card disabled:opacity-60 ${
                      isOpenRequested ? 'bg-red-500 hover:bg-red-600' : 'bg-brand-600 hover:bg-brand-700'
                    }`}
                  >
                    {busy ? <Loader2 size={16} className="animate-spin" /> : <Power size={16} />}
                    {isOpenRequested ? t('irrigation.stopIrrigation') : t('irrigation.startIrrigation')}
                  </button>
                </>
              )}

              <div>
                <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>{t('irrigation.todaysUsage')}</span>
                  <span>{valve.todayUsageSeconds}s / {valve.dailyAllowanceSeconds}s</span>
                </div>
                <ProgressBar value={valve.todayUsageSeconds} max={valve.dailyAllowanceSeconds} />
              </div>
            </div>
          </Card>

          <CommandLifecycleCard
            command={latestCommand}
            valveName={valve.name}
            mostRecentCompleted={mostRecentCompletedCommand}
            t={t}
            timeAgoT={timeAgoT}
            localeTag={localeTag}
          />
        </div>
      </div>

      {confirmAction === 'open' && (
        <ConfirmDialog
          title={t('irrigation.confirmStartTitle')}
          confirmLabel={t('irrigation.confirmStartLabel')}
          confirmTone="brand"
          busy={busy}
          onCancel={() => setConfirmAction(null)}
          onConfirm={requestOpen}
        >
          <ConfirmRow label={t('irrigation.confirmValve')} value={valve.name} />
          <ConfirmRow label={t('irrigation.confirmCurrentPhysicalState')} value={<PhysicalStateBadge confirmedState={valve.confirmedState} t={t} />} />
          <ConfirmRow label={t('irrigation.confirmDuration')} value={formatMinutes(clampedDuration, t)} />
          <ConfirmRow label={t('irrigation.confirmMoisture')} value={moisture != null ? `${moisture}%` : t('irrigation.confirmNoReading')} />
          <ConfirmRow
            label={t('irrigation.confirmDevice')}
            value={device ? (device.online ? t('common.online') : t('common.offline')) : t('irrigation.confirmDeviceUnknown')}
          />
          {valve.confirmedState === 'unknown' && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              {t('irrigation.unknownStateWarning')}
            </div>
          )}
        </ConfirmDialog>
      )}

      {confirmAction === 'emergency' && (
        <ConfirmDialog
          title={t('irrigation.confirmStopTitle')}
          confirmLabel={t('irrigation.confirmStopLabel')}
          confirmTone="red"
          busy={emergencyBusy}
          onCancel={() => setConfirmAction(null)}
          onConfirm={emergencyStop}
        >
          <p className="text-xs text-slate-600">
            {t('irrigation.emergencyStopBody')}
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

function formatMinutes(seconds, t) {
  if (seconds == null) return '—';
  if (seconds < 60) return `${seconds} ${t('irrigation.secSuffix')}`;
  const minutes = seconds / 60;
  return `${minutes % 1 === 0 ? minutes : minutes.toFixed(1)} ${t('irrigation.minSuffix')}`;
}

function PhysicalStateBadge({ confirmedState, t }) {
  if (confirmedState === 'open') return <Badge tone="green">{t('irrigation.confirmedOpenBadge')}</Badge>;
  if (confirmedState === 'closed') return <Badge tone="slate">{t('irrigation.confirmedClosedBadge')}</Badge>;
  return <Badge tone="amber">{t('irrigation.unknownBadge')}</Badge>;
}

/**
 * The core correction: this panel NEVER treats commandedState (what
 * AgriSmart requested) as proof the physical valve moved. Only
 * confirmedState (set exclusively by commands.service.reportExecutionResult
 * -> irrigation.service.confirmValveState, driven by the device itself)
 * drives the "physical state" label. When they disagree, the discrepancy
 * is shown explicitly rather than collapsed into one badge.
 */
function ValvePhysicalStatePanel({ valve, t, timeAgoT }) {
  const commanded = valve.commandedState; // 'open' | 'closed'
  const confirmed = valve.confirmedState; // 'open' | 'closed' | 'unknown'
  const inSync = confirmed !== 'unknown' && confirmed === commanded;

  const confirmedIcon = confirmed === 'open' ? CheckCircle2 : confirmed === 'closed' ? CheckCircle2 : CircleQuestionMark;
  const confirmedTone = confirmed === 'open' ? 'text-brand-600' : confirmed === 'closed' ? 'text-slate-500' : 'text-amber-500';
  const confirmedLabel = confirmed === 'open' ? t('irrigation.valveConfirmedOpen') : confirmed === 'closed' ? t('irrigation.valveConfirmedClosed') : t('irrigation.physicalStateUnknown');

  let statusLine = null;
  if (!inSync) {
    statusLine =
      confirmed === 'unknown'
        ? t('irrigation.waitingForDeviceConfirmation')
        : t('irrigation.commandNotYetConfirmed');
  }

  const ConfirmedIcon = confirmedIcon;

  return (
    <div className={`rounded-xl2 border p-4 ${inSync ? 'border-slate-100 bg-slate-50/60' : 'border-amber-200 bg-amber-50/70'}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-12 w-12 items-center justify-center rounded-full border-4 ${confirmed === 'open' ? 'border-brand-500' : confirmed === 'closed' ? 'border-slate-300' : 'border-amber-400'} ${confirmedTone}`}>
            <ConfirmedIcon size={20} />
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('irrigation.physicalState')}</div>
            <div className={`text-base font-extrabold ${confirmed === 'open' ? 'text-brand-800' : confirmed === 'closed' ? 'text-slate-700' : 'text-amber-700'}`}>
              {confirmedLabel}
            </div>
          </div>
        </div>
        <div className="text-end">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('irrigation.requestedState')}</div>
          <div className="text-base font-extrabold text-slate-700">{commanded === 'open' ? t('dashboard.open') : t('dashboard.closed')}</div>
        </div>
      </div>
      {statusLine && (
        <div className="mt-3 flex items-center gap-1.5 border-t border-amber-100 pt-3 text-xs font-semibold text-amber-700">
          <Clock size={13} /> {statusLine}
        </div>
      )}
      {valve.confirmedStateAt && (
        <div className="mt-1 text-[11px] text-slate-400">{t('irrigation.lastConfirmed', { time: timeAgoT(valve.confirmedStateAt) })}</div>
      )}
    </div>
  );
}

/**
 * Honest command lifecycle for the selected valve's most recent
 * command, from the real, already-polled GET
 * /dashboard/farms/:farmId/commands data — no client-invented stages.
 * QUEUED never implies delivered, SENT never implies executed,
 * ACKNOWLEDGED only means transport receipt; only COMPLETED (reported
 * by the device via commands.service.reportExecutionResult) means
 * success.
 */
function CommandLifecycleCard({ command, valveName, mostRecentCompleted, t, timeAgoT, localeTag }) {
  const failed = command ? command.status === 'failed' || command.status === 'expired' : false;
  // This is deliberately a small, EXPANDABLE technical section, not a
  // permanently-open admin panel — a farmer doesn't need to see
  // command-stage plumbing to understand irrigation, only when
  // something failed (kept open by default in that case, since that's
  // actionable safety information, not background detail).
  const [open, setOpen] = useState(failed);

  if (!command) {
    return (
      <Card title={t('irrigation.commandLifecycle')} subtitle={valveName}>
        <EmptyState title={t('irrigation.noCommandsYet')} sub={t('irrigation.noCommandsYetSub')} />
      </Card>
    );
  }

  const phase = commandStagePhase(command.status);
  // A secondary reference is only meaningful when it's a genuinely
  // different command than the (expired/failed) one being shown as
  // primary — otherwise it would just be restating the same record.
  const showCompletedReference =
    failed && mostRecentCompleted && mostRecentCompleted.commandId !== command.commandId;

  return (
    <Card
      title={t('irrigation.commandLifecycle')}
      subtitle={`${valveName ? `${valveName} · ` : ''}${commandTypeLabel(command.type, t)} · ${formatAbsoluteTime(command.createdAt, localeTag)} (${timeAgoT(command.createdAt)})`}
      action={
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs font-bold text-slate-400 hover:text-slate-600"
        >
          {open ? t('irrigation.hideDetails') : t('irrigation.showDetails')}
        </button>
      }
    >
      {!open ? null : failed ? (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700">
            <AlertTriangle size={18} className="shrink-0" />
            <div>
              <div className="font-bold">{t('irrigation.commandStatusLabel', { status: command.status === 'expired' ? t('irrigation.badgeExpired') : t('irrigation.badgeFailed') })}</div>
              <div className="mt-0.5">
                {command.status === 'expired'
                  ? t('irrigation.expiredDetail')
                  : t('irrigation.failedDetail')}
              </div>
            </div>
          </div>
          {showCompletedReference && (
            <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs text-slate-600">
              <CheckCircle2 size={16} className="shrink-0 text-brand-500" />
              <div>
                <div className="font-bold text-slate-700">
                  {t('irrigation.mostRecentSuccessful', { type: commandTypeLabel(mostRecentCompleted.type, t) })}
                </div>
                <div className="mt-0.5">{formatAbsoluteTime(mostRecentCompleted.createdAt, localeTag)} ({timeAgoT(mostRecentCompleted.createdAt)})</div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-2">
          {COMMAND_STAGES.map((stage, i) => {
            const reached = i <= phase;
            const isCurrent = i === phase;
            return (
              <div key={stage.key} className="flex flex-1 items-center gap-2">
                <div className={`flex flex-1 flex-col gap-1 rounded-xl border p-3 ${reached ? 'border-brand-200 bg-brand-50/70' : 'border-slate-100 bg-slate-50/60'}`}>
                  <div className="flex items-center gap-1.5">
                    <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${reached ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                      {reached && !isCurrent ? <Check size={11} /> : <span className="text-[10px] font-bold">{i + 1}</span>}
                    </div>
                    <div className={`text-[11px] font-extrabold uppercase tracking-wide ${reached ? 'text-brand-700' : 'text-slate-400'}`}>{t(stage.labelKey)}</div>
                  </div>
                </div>
                {i < COMMAND_STAGES.length - 1 && (
                  <ArrowRight size={14} className={`hidden shrink-0 sm:block rtl:rotate-180 ${reached ? 'text-brand-300' : 'text-slate-200'}`} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function ConfirmDialog({ title, children, onCancel, onConfirm, confirmLabel, confirmTone = 'brand', busy }) {
  const { t } = useLocale();
  const toneClasses = confirmTone === 'red' ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-sm rounded-xl2 border border-slate-100 bg-white p-5 shadow-cardHover">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold text-slate-900">{title}</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <div className="mt-3 flex flex-col gap-2">{children}</div>
        <div className="mt-5 flex gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-60"
          >
            {t('irrigation.cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-white shadow-card disabled:opacity-60 ${toneClasses}`}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmRow({ label, value }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="font-semibold text-slate-500">{label}</span>
      <span className="font-bold text-slate-800">{value}</span>
    </div>
  );
}

function IrrigationModeToggle({ valve, t }) {
  const [mode, setMode] = useState(valve.automationEnabled ? 'automatic' : 'manual');
  const [settings, setSettings] = useState({
    autoOpenBelowPercent: valve.autoOpenBelowPercent,
    autoCloseAbovePercent: valve.autoCloseAbovePercent,
    autoDurationSeconds: valve.autoDurationSeconds,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function setMode_(next) {
    setMode(next);
    setError('');
    setBusy(true);
    try {
      await api.patch(`/irrigation/valves/${valve.valveId}/automation`, { automationEnabled: next === 'automatic' });
    } catch (err) {
      setError(translateApiError(err, t));
      setMode(next === 'automatic' ? 'manual' : 'automatic');
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    setSaved(false);
    try {
      await api.patch(`/irrigation/valves/${valve.valveId}/automation`, settings);
      setSaved(true);
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
        <Settings2 size={13} /> {t('irrigation.irrigationMode')}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => setMode_('manual')}
          disabled={busy}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold ${mode === 'manual' ? 'bg-brand-600 text-white' : 'border border-slate-200 text-slate-500'}`}
        >
          {t('irrigation.manual')}
        </button>
        <button
          onClick={() => setMode_('automatic')}
          disabled={busy}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold ${mode === 'automatic' ? 'bg-brand-600 text-white' : 'border border-slate-200 text-slate-500'}`}
        >
          {t('irrigation.automatic')}
        </button>
      </div>

      {error && <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</div>}

      {mode === 'automatic' && (
        <form onSubmit={saveSettings} className="mt-3 flex flex-col gap-3 rounded-xl bg-slate-50 p-4">
          <div className="text-xs font-bold text-slate-600">{t('irrigation.automationSettings')}</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="text-[11px] font-semibold text-slate-500">
              {t('irrigation.openBelowPct')}
              <input
                type="number" min="0" max="100"
                value={settings.autoOpenBelowPercent}
                onChange={(e) => setSettings((s) => ({ ...s, autoOpenBelowPercent: Number(e.target.value) }))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-[11px] font-semibold text-slate-500">
              {t('irrigation.closeAbovePct')}
              <input
                type="number" min="0" max="100"
                value={settings.autoCloseAbovePercent}
                onChange={(e) => setSettings((s) => ({ ...s, autoCloseAbovePercent: Number(e.target.value) }))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-[11px] font-semibold text-slate-500">
              {t('irrigation.durationSeconds')}
              <input
                type="number" min="1"
                value={settings.autoDurationSeconds}
                onChange={(e) => setSettings((s) => ({ ...s, autoDurationSeconds: Number(e.target.value) }))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="flex items-center justify-center gap-2 self-start rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {busy && <Loader2 size={13} className="animate-spin" />} {t('irrigation.saveSettings')}
          </button>
          {saved && <div className="text-[11px] font-semibold text-brand-600">{t('irrigation.settingsSaved')}</div>}
          <p className="text-[11px] text-slate-400">
            {t('irrigation.automationExplainer')}
          </p>
        </form>
      )}
    </div>
  );
}
