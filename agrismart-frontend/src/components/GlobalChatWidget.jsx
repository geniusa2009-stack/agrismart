import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X, Send, Loader2, Trash2 } from 'lucide-react';
import { useLocale } from '../i18n/LocaleContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

/**
 * GlobalChatWidget — AgriSmart's persistent farm assistant
 * ("مساعدك الزراعي"), mounted ONCE in App.jsx's authenticated shell so
 * it is reachable from every page. This is a UI layer on top of the
 * SAME Gemini backend integration as GeminiCopilotCard
 * (POST /api/v1/ai/chat -> ai.controller.js.postChatMessage ->
 * ai/services/geminiCopilotService.js's getChatResponse) — there is no
 * second AI architecture and no second API key here.
 *
 * Safety: this component never calls a valve/command endpoint. When
 * the backend flags `intents.irrigationExecutionRequested`, the only
 * action offered is real client-side navigation to the Irrigation
 * page, where the existing, unmodified safety-validated flow takes
 * over — exactly the same principle as GeminiCopilotCard's "Start
 * irrigation" button.
 *
 * Memory: only this component's own in-memory message list is kept
 * (spec section 17 — lightweight session memory, no new persistence
 * layer). It is capped and trimmed further server-side
 * (geminiCopilotService.js's MAX_HISTORY_TURNS_SENT_TO_GEMINI) before
 * ever reaching Gemini.
 */

const PATH_TO_CONTEXT = [
  [/^\/$/, 'dashboard'],
  [/^\/farm/, 'farm'],
  [/^\/irrigation/, 'irrigation'],
  [/^\/analytics/, 'analytics'],
  [/^\/alerts/, 'alerts'],
  [/^\/community/, 'community'],
  [/^\/equipment/, 'equipment'],
  [/^\/services/, 'services'],
  [/^\/marketplace/, 'marketplace'],
  [/^\/settings/, 'settings'],
];

function contextForPath(pathname) {
  const match = PATH_TO_CONTEXT.find(([re]) => re.test(pathname));
  return match ? match[1] : undefined;
}

const CONTEXT_QUICK_ACTION = {
  dashboard: 'analyzeField',
  irrigation: 'shouldIIrrigateNow',
  analytics: 'explainData',
  alerts: 'explainAlert',
  equipment: 'helpPickEquipment',
  community: 'whereToAsk',
};

const MAX_CLIENT_HISTORY = 12;

export default function GlobalChatWidget() {
  const { t, locale, isRtl } = useLocale();
  const { activeFarmId } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]); // { id, role: 'user'|'assistant', content, reasons?, nextStep?, intents?, errorKind? }
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showTechnicalFor, setShowTechnicalFor] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const context = contextForPath(location.pathname);
  const contextualQuickActionKey = CONTEXT_QUICK_ACTION[context];

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending, open]);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  async function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    if (!activeFarmId) {
      setMessages((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, role: 'user', content: trimmed },
        { id: `a-${Date.now() + 1}`, role: 'assistant', errorKind: 'noFarm', content: t('globalChat.noFarmYet') },
      ]);
      setInput('');
      return;
    }

    const userMessage = { id: `u-${Date.now()}`, role: 'user', content: trimmed };
    const historyForRequest = [...messages, userMessage]
      .filter((m) => !m.errorKind)
      .slice(-MAX_CLIENT_HISTORY)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setSending(true);

    try {
      const data = await api.post('/ai/chat', {
        message: trimmed,
        farmId: activeFarmId,
        context,
        locale,
        history: historyForRequest.slice(0, -1),
      });

      if (data.status === 'available') {
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: data.answer,
            reasons: data.reasons,
            nextStep: data.nextStep,
            intents: data.intents,
            confidence: data.confidence,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: 'assistant', errorKind: data.status, content: t(`globalChat.errors.${data.status}`) },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: 'assistant', errorKind: 'error', content: t('globalChat.errors.error'), failedRetryText: trimmed },
      ]);
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    sendMessage(input);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const hasMessages = messages.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('globalChat.buttonLabel')}
        aria-expanded={open}
        className="fixed bottom-20 end-4 z-40 flex items-center gap-2 rounded-full bg-brand-600 px-4 py-3 text-sm font-bold text-white shadow-decision transition-transform hover:scale-105 hover:bg-brand-700 active:scale-95 md:bottom-6 md:end-6"
      >
        <img src="/agrismart-mark.png" alt="" className="h-5 w-5 object-contain" />
        <span className="hidden sm:inline">{t('globalChat.buttonLabel')}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/30 md:hidden" onClick={() => setOpen(false)} aria-hidden="true" />

          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('globalChat.title')}
            dir={isRtl ? 'rtl' : 'ltr'}
            className="fixed inset-x-0 bottom-0 z-50 flex h-[85vh] flex-col rounded-t-2xl bg-white shadow-decision md:inset-x-auto md:inset-y-0 md:end-0 md:h-full md:w-[400px] md:rounded-none md:border-s md:border-slate-100"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5">
              <div>
                <h2 className="text-sm font-bold text-slate-800">{t('globalChat.title')}</h2>
                <p className="text-[11px] text-slate-400">{t('globalChat.subtitle')}</p>
              </div>
              <div className="flex items-center gap-1">
                {hasMessages && (
                  <button
                    type="button"
                    onClick={() => setMessages([])}
                    aria-label={t('globalChat.clearConversation')}
                    title={t('globalChat.clearConversation')}
                    className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t('globalChat.close')}
                  className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                >
                  <X size={17} />
                </button>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
              {!hasMessages && (
                <div className="flex flex-col gap-4">
                  <div className="rounded-xl2 bg-brand-50/70 p-4">
                    <p className="text-sm font-bold text-brand-900">{t('globalChat.welcomeGreeting')}</p>
                    <p className="mt-1 text-sm text-slate-600">{t('globalChat.welcomeIntro')}</p>
                    <p className="mt-1 text-sm text-slate-600">{t('globalChat.welcomeBody')}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {contextualQuickActionKey && (
                      <QuickAction label={t(`globalChat.quickActions.${contextualQuickActionKey}`)} onClick={() => sendMessage(t(`globalChat.quickActions.${contextualQuickActionKey}`))} highlight />
                    )}
                    {['farmStatus', 'shouldIIrrigate', 'whyLowMoisture', 'waterUsed', 'sensorProblem', 'askAboutCrop'].map((key) => (
                      <QuickAction key={key} label={t(`globalChat.quickActions.${key}`)} onClick={() => sendMessage(t(`globalChat.quickActions.${key}`))} />
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3">
                {messages.map((m) => (
                  <ChatBubble
                    key={m.id}
                    message={m}
                    t={t}
                    showTechnical={showTechnicalFor === m.id}
                    onToggleTechnical={() => setShowTechnicalFor((cur) => (cur === m.id ? null : m.id))}
                    onRetry={() => sendMessage(m.failedRetryText)}
                    onOpenIrrigation={() => {
                      navigate('/irrigation');
                      setOpen(false);
                    }}
                    onOpenEquipment={() => {
                      navigate('/equipment');
                      setOpen(false);
                    }}
                    onOpenCommunity={() => {
                      navigate('/community');
                      setOpen(false);
                    }}
                  />
                ))}
                {sending && (
                  <div className="flex items-center gap-2 self-start rounded-xl2 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-400">
                    <Loader2 size={13} className="animate-spin" />
                    {t('globalChat.title')}…
                  </div>
                )}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-slate-100 px-3 py-3">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('globalChat.inputPlaceholder')}
                rows={1}
                className="max-h-28 flex-1 resize-none rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                aria-label={t('globalChat.send')}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40"
              >
                <Send size={16} />
              </button>
            </form>
          </div>
        </>
      )}
    </>
  );
}

function QuickAction({ label, onClick, highlight }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        highlight
          ? 'border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  );
}

function ChatBubble({ message, t, showTechnical, onToggleTechnical, onRetry, onOpenIrrigation, onOpenEquipment, onOpenCommunity }) {
  const isUser = message.role === 'user';
  if (isUser) {
    return (
      <div className="self-end max-w-[85%] rounded-2xl rounded-ee-sm bg-brand-600 px-3.5 py-2.5 text-sm text-white ms-auto">
        {message.content}
      </div>
    );
  }

  return (
    <div className="self-start max-w-[92%] rounded-2xl rounded-ss-sm bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700">
      <p>{message.content}</p>

      {message.reasons && message.reasons.length > 0 && (
        <div className="mt-2">
          <div className="text-[11px] font-bold text-slate-400">{t('globalChat.whyLabel')}</div>
          <ul className="mt-0.5 list-disc space-y-0.5 ps-4 text-xs text-slate-600">
            {message.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {message.nextStep && (
        <div className="mt-2 rounded-lg bg-white px-2.5 py-2 text-xs">
          <span className="font-bold text-slate-400">{t('globalChat.nextStepLabel')}: </span>
          <span className="text-slate-600">{message.nextStep}</span>
        </div>
      )}

      {message.confidence && (
        <button type="button" onClick={onToggleTechnical} className="mt-2 text-[10px] font-semibold text-slate-400 hover:text-slate-600">
          {t('globalChat.technicalDetails')}
        </button>
      )}
      {showTechnical && message.confidence && (
        <div className="mt-1 text-[10px] text-slate-400">{message.confidence}</div>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5">
        {message.intents?.irrigationExecutionRequested && (
          <button type="button" onClick={onOpenIrrigation} className="rounded-full bg-accent-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-accent-700">
            {t('globalChat.openIrrigationPage')}
          </button>
        )}
        {message.intents?.equipmentIntent && (
          <button type="button" onClick={onOpenEquipment} className="rounded-full bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700">
            {t('globalChat.openEquipmentPage')}
          </button>
        )}
        {message.intents?.communityIntent && (
          <button type="button" onClick={onOpenCommunity} className="rounded-full bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700">
            {t('globalChat.openCommunityPage')}
          </button>
        )}
        {message.errorKind && message.errorKind !== 'noFarm' && message.errorKind !== 'insufficient_data' && message.errorKind !== 'unavailable' && (
          <button type="button" onClick={onRetry} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            {t('globalChat.retry')}
          </button>
        )}
      </div>
    </div>
  );
}
