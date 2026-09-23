import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { Card, Spinner, EmptyState, ErrorState } from '../components/ui';
import { MoistureAreaChart, MetricLineChart } from '../components/charts';
import { useLocale } from '../i18n/LocaleContext';
import { translateApiError } from '../i18n/errorMessages';

const RANGE_KEYS = ['live', '24h', '7d', '30d'];

export default function Analytics() {
  const { t } = useLocale();
  const { activeFarmId } = useAuth();
  const [devices, setDevices] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [range, setRange] = useState('24h');
  const [history, setHistory] = useState(null);
  const [devicesError, setDevicesError] = useState('');
  const [devicesRetryTick, setDevicesRetryTick] = useState(0);
  const [historyError, setHistoryError] = useState('');
  const [historyRetryTick, setHistoryRetryTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setDevicesError('');
    api.get(`/dashboard/farms/${activeFarmId}/devices`)
      .then((data) => {
        if (cancelled) return;
        setDevices(data);
        setDeviceId((prev) => prev || data[0]?.deviceId || null);
      })
      .catch((err) => {
        if (!cancelled) setDevicesError(translateApiError(err, t) || t('analytics.devicesLoadFailed'));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFarmId, devicesRetryTick]);

  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;
    setHistory(null);
    setHistoryError('');
    api.get(`/dashboard/devices/${deviceId}/telemetry?range=${range}`)
      .then((data) => {
        if (!cancelled) setHistory(data);
      })
      .catch((err) => {
        if (!cancelled) setHistoryError(translateApiError(err, t) || t('analytics.telemetryLoadFailed'));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, range, historyRetryTick]);

  if (!devices && devicesError) {
    return (
      <Card title={t('analytics.title')}>
        <ErrorState title={t('analytics.devicesLoadErrorTitle')} sub={devicesError} onRetry={() => setDevicesRetryTick((n) => n + 1)} />
      </Card>
    );
  }

  if (!devices) return <Spinner label={t('analytics.loading')} />;
  if (devices.length === 0) return <EmptyState title={t('analytics.noDevicesTitle')} />;

  return (
    <Card
      title={t('analytics.title')}
      action={
        <select
          value={deviceId || ''}
          onChange={(e) => setDeviceId(e.target.value)}
          aria-label={t('analytics.selectDevice')}
          className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600"
        >
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>{d.name}</option>
          ))}
        </select>
      }
    >
      <div className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1">
        {RANGE_KEYS.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-bold ${
              range === r ? 'bg-white text-brand-700 shadow-card' : 'text-slate-500'
            }`}
          >
            {t(`analytics.ranges.${r}`)}
          </button>
        ))}
      </div>

      {historyError ? (
        <ErrorState title={t('analytics.telemetryLoadErrorTitle')} sub={historyError} onRetry={() => setHistoryRetryTick((n) => n + 1)} />
      ) : !history ? (
        <Spinner label={t('analytics.loadingReadings')} />
      ) : history.length === 0 ? (
        <EmptyState title={t('analytics.noTelemetryTitle')} sub={t('analytics.noTelemetrySub')} />
      ) : (
        <div className="flex flex-col gap-6">
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{t('analytics.soilMoisture')}</div>
            <MoistureAreaChart data={history} height={200} />
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{t('analytics.temperature')}</div>
              <MetricLineChart data={history} dataKey="temperatureCelsius" unit="°C" color="#f97316" />
            </div>
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{t('analytics.ecSalinity')}</div>
              <MetricLineChart data={history} dataKey="soilSalinityPpt" unit=" dS/m" color="#17ada6" />
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
