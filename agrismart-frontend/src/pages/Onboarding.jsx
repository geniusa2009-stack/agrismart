import { useState } from 'react';
import { Check, ArrowRight, Loader2, Sprout, Cpu, PartyPopper, X, Wifi, ShieldAlert, Copy, CheckCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

const LOGO_SRC = '/agrismart-logo.png';

const STEPS = [
  { key: 'farm', label: 'Farm' },
  { key: 'device', label: 'Device' },
  { key: 'ready', label: 'Ready' },
];

/**
 * First-time setup: Farm -> Device (optional) -> Ready. Only real,
 * backend-persisted fields are collected — see BRAND/AUDIT notes below
 * for the fields the brief asked for that the current API does not
 * support (deliberately not faked):
 *
 *  - Farm: `name` and `location.governorate`/`location.village` are
 *    the ONLY fields farms.validators.js accepts (createFarmSchema is
 *    `.strict()`); "farm area", "crop", and "water source" have no
 *    field on the Farm model, so they are not collected here.
 *  - Device: `POST /devices` only accepts `{ farmId, name? }`
 *    (devices.validators.js provisionDeviceSchema, also `.strict()`).
 *    The device's actual `deviceId` is generated server-side
 *    (devices.service.js) and returned once with its one-time secret
 *    — there is no client-supplied "Device ID" field, and devices have
 *    no "zone" concept in the current model, so neither is collected.
 *
 *  - A newly provisioned device starts in the real backend `provisioned`
 *    status (device.model.js DEVICE_STATUS default) — it is configured
 *    in AgriSmart's database only. `POST /devices/:deviceId/activate`
 *    (used on the Devices page) does nothing but flip that status field
 *    to `active` (devices.service.js activateDevice ->
 *    devices.repository.js updateStatus — a plain
 *    findOneAndUpdate({deviceId}, {status})); it is called by the
 *    signed-in USER, not the device, and performs no credential check,
 *    no heartbeat check, and no verification of any kind that a
 *    physical ESP32 is actually running. The only backend signal that
 *    ever reflects real physical activity is `lastSeenAt`, set by the
 *    device-authenticated `POST /devices/heartbeat` endpoint when a
 *    real device calls in — onboarding has no such event to wait for.
 *    So this screen never claims "physically connected"; it only ever
 *    reports the true software state ("configured in AgriSmart") and
 *    is explicit that physical connection is a separate, pending step.
 */
export default function Onboarding({ onFinish }) {
  const [step, setStep] = useState(0);
  const [farm, setFarm] = useState(null);
  const [provisionedDevice, setProvisionedDevice] = useState(null);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <div className="border-b border-slate-100 bg-white px-6 py-5">
        <div className="mx-auto flex max-w-xl items-center justify-between">
          <img src={LOGO_SRC} alt="AgriSmart" className="h-9 w-auto object-contain" />
          <ProgressIndicator step={step} />
        </div>
      </div>

      <div className="flex flex-1 items-start justify-center px-4 py-10 sm:py-16">
        <div className="w-full max-w-md animate-[fadeSlideIn_0.4s_ease-out]">
          {step === 0 && (
            <FarmStep
              onCreated={(createdFarm) => {
                setFarm(createdFarm);
                setStep(1);
              }}
            />
          )}
          {step === 1 && farm && (
            <DeviceStep
              farmId={farm._id}
              onDone={(device) => {
                setProvisionedDevice(device);
                setStep(2);
              }}
              onSkip={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <ReadyStep farm={farm} device={provisionedDevice} onFinish={onFinish} />
          )}
        </div>
      </div>
    </div>
  );
}

function ProgressIndicator({ step }) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${
              i < step ? 'bg-brand-600 text-white' : i === step ? 'bg-brand-100 text-brand-700 ring-2 ring-brand-500' : 'bg-slate-100 text-slate-400'
            }`}
          >
            {i < step ? <Check size={13} /> : i + 1}
          </div>
          <span className={`hidden text-xs font-semibold sm:inline ${i <= step ? 'text-slate-700' : 'text-slate-400'}`}>
            {s.label}
          </span>
          {i < STEPS.length - 1 && <div className={`h-px w-6 ${i < step ? 'bg-brand-400' : 'bg-slate-200'}`} />}
        </div>
      ))}
    </div>
  );
}

function StepCard({ icon: Icon, title, subtitle, children }) {
  return (
    <div className="rounded-xl2 border border-slate-100 bg-white p-7 shadow-card">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <Icon size={20} />
        </div>
        <div>
          <div className="text-base font-extrabold text-slate-900">{title}</div>
          <div className="text-xs text-slate-500">{subtitle}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

function FarmStep({ onCreated }) {
  const { createFarm } = useAuth();
  const [name, setName] = useState('');
  const [governorate, setGovernorate] = useState('');
  const [village, setVillage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const location = governorate || village ? { governorate: governorate || undefined, village: village || undefined } : undefined;
      const created = await createFarm({ name, location });
      onCreated(created);
    } catch (err) {
      setError(err.message || 'Could not create your farm.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <StepCard icon={Sprout} title="Set up your farm" subtitle="Step 1 of 3 — this is the only required step.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="farm-name" className="text-xs font-semibold text-slate-600">
            Farm name
          </label>
          <input
            id="farm-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Green Valley Farm"
            className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="farm-gov" className="text-xs font-semibold text-slate-600">
              Governorate
            </label>
            <input
              id="farm-gov"
              value={governorate}
              onChange={(e) => setGovernorate(e.target.value)}
              placeholder="Optional"
              className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div>
            <label htmlFor="farm-village" className="text-xs font-semibold text-slate-600">
              Village
            </label>
            <input
              id="farm-village"
              value={village}
              onChange={(e) => setVillage(e.target.value)}
              placeholder="Optional"
              className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
        </div>

        {error && (
          <div role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-xs font-medium text-red-600">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-1 flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow-card transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
          Continue
        </button>
      </form>
    </StepCard>
  );
}

function DeviceStep({ farmId, onDone, onSkip }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      // POST /devices only accepts { farmId, name? } — deviceId and
      // deviceSecret are generated server-side and returned once. A
      // freshly provisioned device's real backend status is
      // 'provisioned' (device.model.js default) — configured in
      // AgriSmart only, nothing physical has been verified.
      const data = await api.post('/devices', { farmId, name: name || undefined });
      setCreated(data);
    } catch (err) {
      setError(err.message || 'Could not add the device.');
    } finally {
      setBusy(false);
    }
  }

  // Clipboard only — never logged, never put in a URL/query string,
  // never written to localStorage/sessionStorage. It only ever lives in
  // this component's React state, which is discarded the moment this
  // step is left (Continue/Skip unmounts it); it cannot be shown again
  // from anywhere else in the app after that.
  async function handleCopySecret() {
    try {
      await navigator.clipboard.writeText(created.deviceSecret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable/denied — the secret is still visible
      // to select and copy manually; nothing else to do here.
    }
  }

  if (created) {
    return (
      <StepCard icon={Cpu} title="Device added" subtitle="Copy your device secret now — it cannot be shown again.">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">
          <div className="flex items-center gap-1.5 font-bold">
            <ShieldAlert size={14} /> Sensitive credential — do not share this with anyone
          </div>
          <div className="mt-2 font-semibold text-red-700/80">Device ID</div>
          <div className="mt-0.5 font-mono text-red-900">{created.deviceId}</div>
          <div className="mt-3 font-semibold text-red-700/80">Device secret</div>
          <div className="mt-1 flex items-center gap-2">
            <div className="min-w-0 flex-1 break-all rounded-lg bg-white/70 px-2.5 py-2 font-mono text-red-900">{created.deviceSecret}</div>
            <button
              type="button"
              onClick={handleCopySecret}
              aria-label="Copy device secret"
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-red-300 bg-white px-2.5 py-2 text-[11px] font-bold text-red-700 transition hover:bg-red-100"
            >
              {copied ? <CheckCheck size={13} /> : <Copy size={13} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="mt-2 text-[11px] text-red-700/90">
            Anyone with this secret can authenticate as this device. AgriSmart cannot show it to you again — store it somewhere safe before continuing.
          </div>
        </div>

        {/* Honest software-only status: POST /devices only records this
            device in AgriSmart's database. Nothing in this onboarding
            flow talks to, or hears back from, a physical ESP32 — the
            only backend signal for real physical activity is a device
            heartbeat, which hasn't happened yet, so that is stated
            plainly rather than implied otherwise. */}
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50 p-3.5 text-xs">
          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500">
            <Wifi size={13} />
          </div>
          <div>
            <div className="font-bold text-slate-700">Configured in AgriSmart</div>
            <div className="mt-0.5 text-slate-500">
              Physical device connection pending — connect your ESP32 with these credentials any time from the Devices page.
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onDone(created)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow-card transition hover:bg-brand-700"
        >
          <ArrowRight size={16} /> Continue
        </button>
      </StepCard>
    );
  }

  return (
    <StepCard icon={Cpu} title="Add your first device" subtitle="Step 2 of 3 — optional, you can do this later.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="device-name" className="text-xs font-semibold text-slate-600">
            Device name
          </label>
          <input
            id="device-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. ESP32-A001"
            className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
          <p className="mt-1.5 text-[11px] text-slate-400">
            The device ID and connection secret are generated automatically once added.
          </p>
        </div>

        {error && (
          <div role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-xs font-medium text-red-600">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-500 transition hover:bg-slate-50"
          >
            <X size={15} /> Skip for now
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow-card transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
            Add device
          </button>
        </div>
      </form>
    </StepCard>
  );
}

function ReadyStep({ farm, device, onFinish }) {
  return (
    <StepCard icon={PartyPopper} title="AgriSmart configuration complete" subtitle="Step 3 of 3">
      <div className="flex flex-col gap-2 rounded-xl bg-slate-50 p-4 text-xs text-slate-600">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-500">Farm</span>
          <span className="font-bold text-slate-800">{farm?.name || '—'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-500">Device</span>
          <span className="font-bold text-slate-800">{device ? device.deviceId : 'Not added yet'}</span>
        </div>
        {device && (
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-500">Physical device</span>
            <span className="font-bold text-slate-500">Not connected yet</span>
          </div>
        )}
      </div>
      <p className="mt-4 text-xs text-slate-500">
        {device
          ? 'Connect your ESP32 with the device secret any time from the Devices page to start sending real telemetry.'
          : 'You can add a device any time from the Devices page — or run the backend demo to see AgriSmart with live simulated data.'}
      </p>
      <button
        type="button"
        onClick={onFinish}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow-card transition hover:bg-brand-700"
      >
        <ArrowRight size={16} /> Go to Dashboard
      </button>
    </StepCard>
  );
}
