// Shared mock data + route helpers for the AgriSmart E2E suite.
// All backend calls are intercepted via page.route('**/api/v1/**', ...).
// Every success body is wrapped as { data }, every error as { error: { message, code } }.

export const TOKEN_KEY = 'agrismart_access_token';
export const FAKE_TOKEN = 'fake-access-token-e2e';

export function ok(data, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify({ data }) };
}

export function fail(message, status = 400, code = 'ERROR') {
  return { status, contentType: 'application/json', body: JSON.stringify({ error: { message, code } }) };
}

export const USER = {
  _id: 'user-1',
  email: 'demo-farmer@agrismart.local',
  fullName: 'Demo Farmer',
};

export const FARM = {
  _id: 'farm-1',
  name: 'Green Valley Farm',
  location: { governorate: 'Beqaa', village: 'Zahle' },
};

export const DEVICE_1 = {
  deviceId: 'dev-001',
  name: 'ESP32-A001',
  online: true,
  status: 'active',
  lastSeenAt: new Date(Date.now() - 60_000).toISOString(),
  signalStrengthDbm: -55,
  batteryPercent: 87,
  firmwareVersion: '1.2.0',
  createdAt: new Date('2026-01-01T00:00:00Z').toISOString(),
};

export const DEVICE_2 = {
  deviceId: 'dev-002',
  name: 'ESP32-B002',
  online: false,
  status: 'suspended',
  lastSeenAt: new Date(Date.now() - 3600_000).toISOString(),
  signalStrengthDbm: -80,
  batteryPercent: 12,
  firmwareVersion: '1.2.0',
  createdAt: new Date('2026-01-05T00:00:00Z').toISOString(),
};

export function telemetryHistory(n = 6) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    arr.push({
      recordedAt: new Date(Date.now() - (n - i) * 3600_000).toISOString(),
      soilMoisturePercent: 40 + i,
      temperatureCelsius: 22 + i * 0.5,
      soilSalinityPpt: 1.2,
    });
  }
  return arr;
}

export function latestTelemetryFor(deviceId) {
  return {
    deviceId,
    soilMoisturePercent: 42,
    temperatureCelsius: 24.5,
    soilSalinityPpt: 1.3,
    recordedAt: new Date().toISOString(),
  };
}

export const VALVE_1 = {
  valveId: 'valve-001',
  name: 'North Field Valve',
  commandedState: 'closed',
  lastOpenedAt: null,
  automationEnabled: false,
  autoOpenBelowPercent: 30,
  autoCloseAbovePercent: 70,
  autoDurationSeconds: 300,
  todayUsageSeconds: 120,
  dailyAllowanceSeconds: 1800,
};

export const ALERT_OPEN = {
  id: 'alert:critical:1',
  title: 'Low soil moisture',
  message: 'Soil moisture dropped below 20% on North Field.',
  severity: 'critical',
  acknowledged: false,
  deviceId: 'dev-001',
  at: new Date(Date.now() - 600_000).toISOString(),
};

export const ALERT_WARNING = {
  id: 'alert:warning:2',
  title: 'Battery low',
  message: 'Device battery is below 15%.',
  severity: 'warning',
  acknowledged: false,
  deviceId: 'dev-002',
  at: new Date(Date.now() - 1200_000).toISOString(),
};

export const ALERT_RESOLVED = {
  id: 'alert:notice:3',
  title: 'Firmware updated',
  message: 'Device firmware updated to 1.2.0.',
  severity: 'notice',
  acknowledged: true,
  deviceId: 'dev-001',
  at: new Date(Date.now() - 86_400_000).toISOString(),
};

export function buildDashboardSummary(overrides = {}) {
  return {
    devices: [DEVICE_1, DEVICE_2],
    latestTelemetryByDevice: {
      [DEVICE_1.deviceId]: latestTelemetryFor(DEVICE_1.deviceId),
    },
    valves: [VALVE_1],
    alerts: [ALERT_OPEN, ALERT_WARNING, ALERT_RESOLVED],
    deviceCounts: { total: 2, online: 1, offline: 1, maintenance: 0 },
    ...overrides,
  };
}

export function buildDeviceDetail(device = DEVICE_1) {
  return {
    device,
    latestTelemetry: latestTelemetryFor(device.deviceId),
  };
}

/**
 * Sets an access token in localStorage before the page's own scripts run,
 * so the app boots straight past the login screen.
 */
export async function seedAuthToken(page) {
  await page.addInitScript(
    ([key, token]) => {
      window.localStorage.setItem(key, token);
    },
    [TOKEN_KEY, FAKE_TOKEN]
  );
}

const LOCALE_KEY = 'agrismart_locale';

/** Seeds the LocaleContext's persisted locale ('ar-eg' | 'ar' | 'en') before boot. */
export async function seedLocale(page, locale) {
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    [LOCALE_KEY, locale]
  );
}

/**
 * Installs a single router covering the whole API surface used by the app.
 * `calls` (array) records every intercepted request as { method, url, postData }.
 * `state` lets tests override farms/devices/valves/alerts on the fly.
 */
export function installApiMocks(page, opts = {}) {
  const calls = [];
  const state = {
    user: { ...USER },
    farms: [FARM],
    devices: [DEVICE_1, DEVICE_2],
    devicesById: { [DEVICE_1.deviceId]: DEVICE_1, [DEVICE_2.deviceId]: DEVICE_2 },
    valves: [VALVE_1],
    alerts: [ALERT_OPEN, ALERT_WARNING, ALERT_RESOLVED],
    telemetry: telemetryHistory(),
    commands: [
      { commandId: 'cmd-1', type: 'open_valve', status: 'completed', createdAt: new Date().toISOString() },
    ],
    loginShouldFail: false,
    chatResponse: {
      status: 'available',
      decision: null,
      answer: 'Irrigation is not needed right now.',
      reasons: ['Soil moisture is adequate', 'The last irrigation was recent'],
      nextStep: 'Keep monitoring soil moisture over the next couple of hours.',
      intents: { irrigationExecutionRequested: false, equipmentIntent: false, communityIntent: false },
      confidence: 'medium',
      limitations: [],
      source: 'gemini',
    },
    ...opts,
  };

  page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^.*\/api\/v1/, '');
    let postData = null;
    try {
      postData = request.postDataJSON();
    } catch {
      postData = null;
    }
    calls.push({ method, path, url: request.url(), body: postData });

    // ---- Auth ----
    if (path === '/auth/login' && method === 'POST') {
      if (state.loginShouldFail) {
        return route.fulfill(fail('Invalid email or password.', 401, 'INVALID_CREDENTIALS'));
      }
      return route.fulfill(ok({ accessToken: FAKE_TOKEN, user: state.user }));
    }

    if (path === '/users/me' && method === 'GET') {
      return route.fulfill(ok(state.user));
    }
    if (path === '/users/me' && method === 'PATCH') {
      state.user = { ...state.user, ...postData };
      return route.fulfill(ok(state.user));
    }

    // ---- Farms ----
    if (path === '/farms' && method === 'GET') {
      return route.fulfill(ok(state.farms));
    }
    if (path === '/farms' && method === 'POST') {
      const farm = { _id: `farm-${state.farms.length + 1}`, name: postData?.name, location: postData?.location || null };
      state.farms = [...state.farms, farm];
      return route.fulfill(ok(farm, 201));
    }
    const farmPatchMatch = path.match(/^\/farms\/([^/]+)$/);
    if (farmPatchMatch && method === 'PATCH') {
      const id = farmPatchMatch[1];
      state.farms = state.farms.map((f) => (f._id === id ? { ...f, ...postData } : f));
      return route.fulfill(ok(state.farms.find((f) => f._id === id)));
    }
    if (farmPatchMatch && method === 'DELETE') {
      const id = farmPatchMatch[1];
      if (state.deleteFarmShouldConflict) {
        return route.fulfill(fail('Farm has active devices and cannot be deleted.', 409, 'FARM_HAS_DEVICES'));
      }
      state.farms = state.farms.filter((f) => f._id !== id);
      return route.fulfill(ok(null));
    }

    // ---- Dashboard aggregates ----
    const summaryMatch = path.match(/^\/dashboard\/farms\/([^/]+)\/summary$/);
    if (summaryMatch && method === 'GET') {
      return route.fulfill(ok(buildDashboardSummary({ valves: state.valves, alerts: state.alerts, devices: state.devices })));
    }
    const devicesListMatch = path.match(/^\/dashboard\/farms\/([^/]+)\/devices$/);
    if (devicesListMatch && method === 'GET') {
      return route.fulfill(ok(state.devices));
    }
    const valvesMatch = path.match(/^\/dashboard\/farms\/([^/]+)\/valves$/);
    if (valvesMatch && method === 'GET') {
      return route.fulfill(ok(state.valves));
    }
    const alertsMatch = path.match(/^\/dashboard\/farms\/([^/]+)\/alerts$/);
    if (alertsMatch && method === 'GET') {
      return route.fulfill(ok(state.alerts));
    }
    const alertAckMatch = path.match(/^\/dashboard\/farms\/([^/]+)\/alerts\/([^/]+)\/acknowledge$/);
    if (alertAckMatch && (method === 'POST' || method === 'DELETE')) {
      const rawId = decodeURIComponent(alertAckMatch[2]);
      state.alerts = state.alerts.map((a) => (a.id === rawId ? { ...a, acknowledged: method === 'POST' } : a));
      return route.fulfill(ok(state.alerts.find((a) => a.id === rawId) || null));
    }

    const deviceDetailMatch = path.match(/^\/dashboard\/devices\/([^/]+)$/);
    if (deviceDetailMatch && method === 'GET') {
      const id = deviceDetailMatch[1];
      const device = state.devicesById[id] || state.devices.find((d) => d.deviceId === id);
      return route.fulfill(ok(buildDeviceDetail(device)));
    }
    const telemetryMatch = path.match(/^\/dashboard\/devices\/([^/]+)\/telemetry$/);
    if (telemetryMatch && method === 'GET') {
      return route.fulfill(ok(state.telemetry));
    }
    const commandsMatch = path.match(/^\/dashboard\/devices\/([^/]+)\/commands$/);
    if (commandsMatch && method === 'GET') {
      return route.fulfill(ok(state.commands));
    }

    // ---- Devices (management) ----
    if (path === '/devices' && method === 'POST') {
      const deviceId = `dev-${Math.random().toString(36).slice(2, 8)}`;
      const device = {
        deviceId,
        name: postData?.name || 'New Device',
        online: false,
        status: 'active',
        lastSeenAt: null,
        signalStrengthDbm: null,
        batteryPercent: null,
        firmwareVersion: null,
        createdAt: new Date().toISOString(),
      };
      state.devices = [...state.devices, device];
      state.devicesById[deviceId] = device;
      return route.fulfill(ok({ ...device, deviceSecret: 'sec_e2e_one_time_secret_abc123' }, 201));
    }
    const deviceRenameMatch = path.match(/^\/devices\/([^/]+)$/);
    if (deviceRenameMatch && method === 'PATCH') {
      const id = deviceRenameMatch[1];
      if (state.renameShouldFail) {
        return route.fulfill(fail('Could not rename device.', 400, 'RENAME_FAILED'));
      }
      const updated = { ...(state.devicesById[id] || {}), ...postData };
      state.devicesById[id] = updated;
      state.devices = state.devices.map((d) => (d.deviceId === id ? updated : d));
      return route.fulfill(ok(updated));
    }
    const activateMatch = path.match(/^\/devices\/([^/]+)\/activate$/);
    if (activateMatch && method === 'POST') {
      const id = activateMatch[1];
      state.devicesById[id] = { ...(state.devicesById[id] || {}), status: 'active' };
      return route.fulfill(ok(state.devicesById[id]));
    }
    const suspendMatch = path.match(/^\/devices\/([^/]+)\/suspend$/);
    if (suspendMatch && method === 'POST') {
      const id = suspendMatch[1];
      state.devicesById[id] = { ...(state.devicesById[id] || {}), status: 'suspended' };
      return route.fulfill(ok(state.devicesById[id]));
    }
    const rotateMatch = path.match(/^\/devices\/([^/]+)\/rotate-secret$/);
    if (rotateMatch && method === 'POST') {
      return route.fulfill(ok({ deviceSecret: 'sec_e2e_rotated_secret_xyz789' }));
    }
    const revokeMatch = path.match(/^\/devices\/([^/]+)\/revoke$/);
    if (revokeMatch && method === 'POST') {
      const id = revokeMatch[1];
      if (state.revokeShouldFail) {
        return route.fulfill(fail('Could not revoke device.', 400, 'REVOKE_FAILED'));
      }
      state.devicesById[id] = { ...(state.devicesById[id] || {}), status: 'revoked' };
      return route.fulfill(ok(state.devicesById[id]));
    }

    // ---- Irrigation ----
    const openMatch = path.match(/^\/irrigation\/valves\/([^/]+)\/open$/);
    if (openMatch && method === 'POST') {
      const id = openMatch[1];
      state.valves = state.valves.map((v) => (v.valveId === id ? { ...v, commandedState: 'open' } : v));
      return route.fulfill(ok(state.valves.find((v) => v.valveId === id)));
    }
    const closeMatch = path.match(/^\/irrigation\/valves\/([^/]+)\/close$/);
    if (closeMatch && method === 'POST') {
      const id = closeMatch[1];
      state.valves = state.valves.map((v) => (v.valveId === id ? { ...v, commandedState: 'closed' } : v));
      return route.fulfill(ok(state.valves.find((v) => v.valveId === id)));
    }
    const automationMatch = path.match(/^\/irrigation\/valves\/([^/]+)\/automation$/);
    if (automationMatch && method === 'PATCH') {
      const id = automationMatch[1];
      state.valves = state.valves.map((v) => (v.valveId === id ? { ...v, ...postData } : v));
      return route.fulfill(ok(state.valves.find((v) => v.valveId === id)));
    }
    const emergencyMatch = path.match(/^\/irrigation\/farms\/([^/]+)\/emergency-stop$/);
    if (emergencyMatch && method === 'POST') {
      state.valves = state.valves.map((v) => ({ ...v, commandedState: 'closed' }));
      return route.fulfill(ok({ stopped: state.valves.length }));
    }

    // ---- Global AI chat assistant ----
    if (path === '/ai/chat' && method === 'POST') {
      return route.fulfill(ok(state.chatResponse));
    }

    // fallback: unknown endpoint
    return route.fulfill(fail(`No mock configured for ${method} ${path}`, 404, 'NOT_MOCKED'));
  });

  return { calls, state };
}
