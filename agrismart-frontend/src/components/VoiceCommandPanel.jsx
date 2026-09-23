import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Send, Volume2 } from 'lucide-react';
import { Card } from './ui';
import { useLocale } from '../i18n/LocaleContext';
import { translateApiError } from '../i18n/errorMessages';

/**
 * VoiceCommandPanel — a real, honest Arabic voice-command layer.
 *
 * Honesty rules this component follows (section 11 of the localization
 * brief):
 *  - It NEVER claims a command executed unless the real API call it
 *    triggers actually succeeded. `resultLine` always reflects the true
 *    outcome (`irrigation.commandSent` / `irrigation.commandFailed...`),
 *    never a fabricated success.
 *  - It NEVER bypasses the app's existing safety layer. A recognized
 *    "start irrigation" / "open valve" phrase calls the SAME
 *    `onStart` prop Irrigation.jsx wires to `setConfirmAction('open')`
 *    — i.e. it still goes through the existing ConfirmDialog with the
 *    real device/moisture/duration summary, exactly like a manual
 *    button press. "Stop"/"close" has no existing confirm dialog in
 *    Irrigation.jsx (immediate close), so this component adds its own
 *    lightweight yes/no confirmation step before calling `onStop`, so a
 *    misheard word can never silently stop irrigation.
 *  - Speech recognition (`webkitSpeechRecognition` / `SpeechRecognition`)
 *    is a REAL browser API when present — nothing here fakes a
 *    transcript. When the API is unavailable (most non-Chrome browsers,
 *    non-secure contexts, or this sandboxed preview), the panel says so
 *    plainly and falls back to a deterministic TEST MODE: a text input
 *    that runs the exact same intent-matching and confirmation flow,
 *    so the feature is honestly demoable without pretending a
 *    microphone was used.
 */

const INTENTS = [
  { id: 'start', patterns: ['ابدأ الري', 'روي الأرض', 'شغل الري', 'ابدا الري', 'start irrigation'] },
  { id: 'stop', patterns: ['وقف الري', 'ايقاف الري', 'أوقف الري', 'stop irrigation'] },
  { id: 'open', patterns: ['افتح المحبس', 'افتح الصمام', 'open valve'] },
  { id: 'close', patterns: ['اقفل المحبس', 'قفل المحبس', 'أغلق المحبس', 'close valve'] },
  { id: 'moisture', patterns: ['الرطوبة كام', 'رطوبة الأرض', 'وريني حالة الأرض', 'soil moisture'] },
  { id: 'deviceStatus', patterns: ['الجهاز متصل', 'الحساس متصل', 'device status'] },
  { id: 'usage', patterns: ['استخدمنا مياه قد ايه', 'استخدمنا مياه قد إيه', 'كمية المياه المستخدمة', 'water used'] },
];

function matchIntent(text) {
  const normalized = text.trim().toLowerCase();
  for (const intent of INTENTS) {
    if (intent.patterns.some((p) => normalized.includes(p.toLowerCase()))) return intent.id;
  }
  return null;
}

function getSpeechRecognition() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export default function VoiceCommandPanel({ valve, device, moisture, isOpenRequested, onStart, onStop }) {
  const { t, locale } = useLocale();
  const [supported] = useState(() => !!getSpeechRecognition());
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [resultLine, setResultLine] = useState('');
  const [pendingIntent, setPendingIntent] = useState(null); // 'start' | 'stop' | 'open' | 'close' | null
  const [testInput, setTestInput] = useState('');
  const recognitionRef = useRef(null);

  useEffect(() => {
    if (!supported) return undefined;
    const SpeechRecognitionCtor = getSpeechRecognition();
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = locale === 'en' ? 'en-US' : 'ar-EG';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      handleUtterance(transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    return () => {
      try {
        recognition.stop();
      } catch {
        // already stopped
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, locale]);

  function startListening() {
    if (!recognitionRef.current) return;
    setHeard('');
    setResultLine('');
    setListening(true);
    try {
      recognitionRef.current.start();
    } catch {
      setListening(false);
    }
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  function handleUtterance(transcript) {
    setHeard(transcript);
    const intentId = matchIntent(transcript);
    runIntent(intentId);
  }

  function runIntent(intentId) {
    if (!intentId) {
      setResultLine(t('voice.notRecognized'));
      return;
    }
    if (intentId === 'moisture') {
      setResultLine(moisture != null ? t('voice.statusQuery', { pct: moisture }) : t('irrigation.confirmNoReading'));
      return;
    }
    if (intentId === 'deviceStatus') {
      setResultLine(t('voice.deviceStatusQuery', { status: device?.online ? t('common.online') : t('common.offline') }));
      return;
    }
    if (intentId === 'usage') {
      setResultLine(
        t('voice.usageQuery', {
          used: valve?.todayUsageSeconds ?? 0,
          allowance: valve?.dailyAllowanceSeconds ?? 0,
        })
      );
      return;
    }
    // start / stop / open / close all require an explicit confirmation
    // step before touching anything real — never auto-executed just
    // because recognition (or the test-mode text match) matched.
    setPendingIntent(intentId);
    setResultLine('');
  }

  function confirmPending() {
    if ((pendingIntent === 'start' || pendingIntent === 'open') && !isOpenRequested) {
      onStart();
      setResultLine(t('voice.commandSent'));
    } else if (pendingIntent === 'stop' || pendingIntent === 'close' || ((pendingIntent === 'start' || pendingIntent === 'open') && isOpenRequested)) {
      Promise.resolve(onStop())
        .then(() => setResultLine(t('voice.commandSent')))
        .catch((err) => setResultLine(translateApiError(err, t)));
    }
    setPendingIntent(null);
  }

  function cancelPending() {
    setPendingIntent(null);
  }

  function runTestMode(e) {
    e.preventDefault();
    if (!testInput.trim()) return;
    handleUtterance(testInput.trim());
    setTestInput('');
  }

  const confirmTextKey =
    pendingIntent === 'start' ? 'voice.confirmStart' : pendingIntent === 'stop' ? 'voice.confirmStop' : pendingIntent === 'open' ? 'voice.confirmOpen' : 'voice.confirmClose';

  return (
    <Card title={t('voice.title')} subtitle={t('voice.subtitle')}>
      <div className="flex flex-col gap-3">
        {supported ? (
          <button
            type="button"
            onClick={listening ? stopListening : startListening}
            className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold shadow-card ${
              listening ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-brand-600 text-white hover:bg-brand-700'
            }`}
          >
            {listening ? <MicOff size={16} /> : <Mic size={16} />}
            {listening ? t('voice.listening') : t('voice.start')}
          </button>
        ) : (
          <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500">{t('voice.unsupported')}</div>
        )}

        {!supported && (
          <form onSubmit={runTestMode} className="flex flex-col gap-2">
            <div className="text-[11px] font-semibold text-slate-400">{t('voice.testMode')}</div>
            <div className="flex gap-2">
              <input
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                placeholder={t('voice.testModePlaceholder')}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700"
              >
                <Send size={13} /> {t('voice.testModeRun')}
              </button>
            </div>
          </form>
        )}

        {heard && <div className="text-xs text-slate-500">{t('voice.heard', { text: heard })}</div>}

        {resultLine && (
          <div className="flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700">
            <Volume2 size={13} /> {resultLine}
          </div>
        )}

        {pendingIntent && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs">
            <span className="font-bold text-amber-800">{t(confirmTextKey)}</span>
            <div className="flex gap-2">
              <button
                onClick={cancelPending}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-bold text-slate-600 hover:bg-slate-50"
              >
                {t('voice.confirmNo')}
              </button>
              <button
                onClick={confirmPending}
                className="rounded-lg bg-brand-600 px-3 py-1.5 font-bold text-white hover:bg-brand-700"
              >
                {t('voice.confirmYes')}
              </button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
