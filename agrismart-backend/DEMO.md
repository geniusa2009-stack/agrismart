# Running the AgriSmart demo

`npm run demo` (inside `agrismart-backend/`) starts the real backend
(`src/server.js`, unmodified) plus a simulated ESP32 device
(`scripts/demoSimulator.js`) that drives the real irrigation/telemetry/
command service functions — the same code path a real device would use.
Nothing about the backend logic is mocked for the demo.

## Prerequisites

- `npm install` already run in `agrismart-backend/`.
- The frontend running separately: `npm run dev` inside `agrismart-frontend/`
  (defaults to `http://localhost:5173`, which the demo backend already
  allow-lists via CORS).

## How database startup works

By default (no `MONGODB_URI` set) the demo boots an ephemeral, in-memory
MongoDB via `mongodb-memory-server` — zero setup, zero external services.

**First run only:** this downloads a MongoDB binary (~70MB) from
`fastdl.mongodb.org`. It is cached afterward
(`~/.cache/mongodb-binaries` by default), so every subsequent run is
offline and fast.

**If that first-run download fails** (no internet, blocked/filtered
network, conference/venue wifi, corporate firewall) — you'll see a clear
`[DEMO] Could not start the built-in in-memory MongoDB` message instead
of a raw crash. To work around it without any code changes, point the
demo at a real MongoDB instance instead:

1. Copy `.env.example` to `.env` in `agrismart-backend/` if you haven't
   already.
2. Add a line: `MONGODB_URI=mongodb://127.0.0.1:27017/agrismart_demo`
   (or any reachable MongoDB — local `mongod`, Docker, or Atlas).
3. Re-run `npm run demo`.

When `MONGODB_URI` is set, the demo skips the in-memory download
entirely and connects to that database instead — same demo, same
simulated device, real database of your choosing.

## What to expect on a successful start

```
[DEMO] Starting AgriSmart demo mode (simulated device, ephemeral in-memory database)...
[DEMO] Ephemeral in-memory MongoDB ready (no external database required).
[DEMO] Login with: demo-farmer@agrismart.local / DemoPassword123!  (farmId: ...)
[DEMO] Telemetry received from sim-esp32-001: moisture=... temp=... salinity=...
```

The simulator runs continuously (one simulated reading every ~4s) and
automatically opens/closes the valve when simulated moisture crosses the
configured thresholds, going through the real command lifecycle
(created → acknowledged → executing → completed) and real irrigation
safety checks (max duration, daily allowance).

Log in to the frontend with the printed demo credentials to watch the
dashboard update live.
