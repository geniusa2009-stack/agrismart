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
} from 'recharts';

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function MoistureAreaChart({ data, height = 220 }) {
  const points = data.map((d) => ({ ...d, label: formatTime(d.recordedAt) }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="moistureFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22a86d" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#22a86d" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f0" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={36} />
        <Tooltip
          formatter={(v) => [`${v}%`, 'Soil Moisture']}
          labelFormatter={(l) => l}
          contentStyle={{ borderRadius: 12, border: '1px solid #eef2f0', fontSize: 12 }}
        />
        <Area type="monotone" dataKey="soilMoisturePercent" stroke="#178a58" strokeWidth={2.5} fill="url(#moistureFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function MetricLineChart({ data, dataKey, unit, color = '#0ea5e9', domain, height = 180 }) {
  const points = data.map((d) => ({ ...d, label: formatTime(d.recordedAt) }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={points} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f0" />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <YAxis domain={domain || ['auto', 'auto']} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={32} />
        <Tooltip
          formatter={(v) => [`${v}${unit || ''}`, '']}
          contentStyle={{ borderRadius: 12, border: '1px solid #eef2f0', fontSize: 12 }}
        />
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2.25} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DevicesDonut({ online, offline, maintenance, size = 140 }) {
  const total = online + offline + maintenance;
  const data = [
    { name: 'Online', value: online, color: '#22a86d' },
    { name: 'Offline', value: offline, color: '#cbd5e1' },
    { name: 'Maintenance', value: maintenance, color: '#f59e0b' },
  ].filter((d) => d.value > 0);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data.length ? data : [{ name: 'None', value: 1, color: '#e2e8f0' }]} dataKey="value" innerRadius="70%" outerRadius="100%" stroke="none">
            {(data.length ? data : [{ color: '#e2e8f0' }]).map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-2xl font-extrabold text-slate-800">{total}</div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Total Devices</div>
      </div>
    </div>
  );
}
