import {
  AreaChart,
  Area,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceArea,
} from 'recharts';
import { useLocale } from '../i18n/LocaleContext';

// --- Real-data-only chart helpers -----------------------------------
// Everything below formats/sorts/paces the ACTUAL telemetry readings
// returned by the backend. No values are invented; only presentation
// (ordering, tick spacing, label format) is adjusted.

function sortByRecordedAt(data) {
  return [...data].sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
}

function spanMs(points) {
  if (points.length < 2) return 0;
  return new Date(points[points.length - 1].recordedAt).getTime() - new Date(points[0].recordedAt).getTime();
}

// Adaptive tick label granularity based on the ACTUAL span of the
// returned readings (not the requested range) — a short demo run of a
// few minutes gets second-level labels; a genuine multi-day range gets
// date labels. This is what was producing the earlier "01:22 01:22
// 01:22" duplicate-label bug: the old formatter used minute-only
// precision regardless of how tightly packed the readings were.
function formatTick(iso, rangeMs) {
  const d = new Date(iso);
  if (rangeMs < 2 * 60 * 1000) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  if (rangeMs < 2 * 3600 * 1000) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (rangeMs < 48 * 3600 * 1000) {
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Tooltip always shows the exact timestamp (down to the second) plus
// the value — regardless of how coarse the axis labels are.
function formatTooltipLabel(iso) {
  const d = new Date(iso);
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Picks a small, readable set of explicit tick positions (rather than
// relying on Recharts' own interval spacing) and de-duplicates any
// ticks whose formatted label would repeat — this is what guarantees
// adjacent labels never duplicate, however dense the real readings are.
function computeTicks(points, rangeMs, maxTicks = 6) {
  if (points.length === 0) return [];
  if (points.length === 1) return [points[0].ts];

  const step = Math.max(1, Math.ceil(points.length / maxTicks));
  const ticks = [];
  const seenLabels = new Set();

  for (let i = 0; i < points.length; i += step) {
    const p = points[i];
    const label = formatTick(p.recordedAt, rangeMs);
    if (!seenLabels.has(label)) {
      seenLabels.add(label);
      ticks.push(p.ts);
    }
  }

  const last = points[points.length - 1];
  const lastLabel = formatTick(last.recordedAt, rangeMs);
  if (!seenLabels.has(lastLabel)) {
    ticks.push(last.ts);
  }

  return ticks;
}

// A single reading (or several readings that all land on the same
// timestamp) collapses the 'dataMin'/'dataMax' domain to one point,
// which Recharts renders as a degenerate axis. A small fixed padding
// around the one real timestamp keeps the axis readable without
// implying any additional (fabricated) readings exist on either side.
function xDomain(points) {
  if (points.length < 2 || points[0].ts === points[points.length - 1].ts) {
    const t = points[0]?.ts ?? Date.now();
    return [t - 30 * 1000, t + 30 * 1000];
  }
  return ['dataMin', 'dataMax'];
}

// Purely a presentation width cap — never touches data, ticks, domain,
// or tooltips. A handful of readings spanning only a few seconds
// stretched across a full-width card reads as a mostly-empty chart, so
// the rendered width is capped down for very short real spans and
// eased back up to 100% as the span grows into something that's
// actually comfortable to fill the full card width. A sane min-width
// keeps the Y-axis and its labels from ever being squeezed on narrow
// viewports.
function chartWidthStyle(rangeMs, pointCount) {
  let maxWidthPct;
  if (pointCount <= 1) maxWidthPct = 45;
  else if (rangeMs < 60 * 1000) maxWidthPct = 55;
  else if (rangeMs < 5 * 60 * 1000) maxWidthPct = 72;
  else if (rangeMs < 30 * 60 * 1000) maxWidthPct = 88;
  else maxWidthPct = 100;

  return maxWidthPct === 100 ? { width: '100%' } : { width: '100%', maxWidth: `${maxWidthPct}%`, minWidth: 240, margin: '0 auto' };
}

/**
 * Derives shaded "irrigation in progress" windows from real
 * open_valve/close_valve commands (already fetched from the backend's
 * commands API — nothing fabricated). Pairs each open with the next
 * close chronologically and clips to the chart's visible time range.
 */
function irrigationWindows(commands, points) {
  if (!commands?.length || points.length < 2) return [];
  const sorted = [...commands].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const rangeStart = new Date(points[0].recordedAt).getTime();
  const rangeEnd = new Date(points[points.length - 1].recordedAt).getTime();

  const windows = [];
  let openAt = null;
  for (const c of sorted) {
    if (c.type === 'open_valve' && openAt == null) {
      openAt = new Date(c.createdAt).getTime();
    } else if (c.type === 'close_valve' && openAt != null) {
      const closeAt = new Date(c.createdAt).getTime();
      const start = Math.max(openAt, rangeStart);
      const end = Math.min(closeAt, rangeEnd);
      if (end > start) windows.push({ start, end });
      openAt = null;
    }
  }
  // Still-open valve: shade from open to the last visible reading.
  if (openAt != null && openAt < rangeEnd) {
    windows.push({ start: Math.max(openAt, rangeStart), end: rangeEnd });
  }
  return windows;
}

export function MoistureAreaChart({ data, height = 220, commands }) {
  const { t } = useLocale();
  const sorted = sortByRecordedAt(data);
  const rangeMs = spanMs(sorted);
  const points = sorted.map((d) => ({ ...d, ts: new Date(d.recordedAt).getTime() }));
  const windows = irrigationWindows(commands, sorted);
  const ticks = computeTicks(points, rangeMs);

  return (
    <div style={chartWidthStyle(rangeMs, points.length)}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={points} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="moistureFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22a86d" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#22a86d" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f0" />
        <XAxis
          dataKey="ts"
          type="number"
          domain={xDomain(points)}
          scale="time"
          ticks={ticks}
          tickFormatter={(ts) => formatTick(ts, rangeMs)}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          tickFormatter={(v) => `${v}`}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          width={34}
          tickMargin={4}
        />
        <Tooltip
          formatter={(v) => [`${v}%`, t('charts.soilMoistureTooltip')]}
          labelFormatter={(ts) => formatTooltipLabel(ts)}
          contentStyle={{ borderRadius: 12, border: '1px solid #eef2f0', fontSize: 12 }}
        />
        {windows.map((w, i) => (
          <ReferenceArea key={i} x1={w.start} x2={w.end} fill="#17ada6" fillOpacity={0.08} strokeOpacity={0} ifOverflow="visible" />
        ))}
        <Area type="monotone" dataKey="soilMoisturePercent" stroke="#178a58" strokeWidth={2.5} fill="url(#moistureFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MetricLineChart({ data, dataKey, unit, color = '#17ada6', domain, height = 180 }) {
  const sorted = sortByRecordedAt(data);
  const rangeMs = spanMs(sorted);
  const points = sorted.map((d) => ({ ...d, ts: new Date(d.recordedAt).getTime() }));
  const ticks = computeTicks(points, rangeMs);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={points} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f0" />
        <XAxis
          dataKey="ts"
          type="number"
          domain={xDomain(points)}
          scale="time"
          ticks={ticks}
          tickFormatter={(ts) => formatTick(ts, rangeMs)}
          tick={{ fontSize: 10, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={domain || ['auto', 'auto']}
          tick={{ fontSize: 10, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          width={38}
          tickMargin={4}
        />
        <Tooltip
          formatter={(v) => [`${v}${unit || ''}`, '']}
          labelFormatter={(ts) => formatTooltipLabel(ts)}
          contentStyle={{ borderRadius: 12, border: '1px solid #eef2f0', fontSize: 12 }}
        />
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2.25} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DevicesDonut({ online, offline, maintenance, size = 140 }) {
  const { t } = useLocale();
  const total = online + offline + maintenance;
  const data = [
    { name: t('charts.online'), value: online, color: '#22a86d' },
    { name: t('charts.offline'), value: offline, color: '#cbd5e1' },
    { name: t('charts.maintenance'), value: maintenance, color: '#f59e0b' },
  ].filter((d) => d.value > 0);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data.length ? data : [{ name: t('charts.none'), value: 1, color: '#e2e8f0' }]} dataKey="value" innerRadius="70%" outerRadius="100%" stroke="none">
            {(data.length ? data : [{ color: '#e2e8f0' }]).map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-2xl font-extrabold text-slate-800">{total}</div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t('charts.totalDevices')}</div>
      </div>
    </div>
  );
}
