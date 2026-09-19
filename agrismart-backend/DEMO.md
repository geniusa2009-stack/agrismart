# Running the AgriSmart demo

`npm run demo` (inside `agrismart-backend/`) starts the real backend
(`src/server.js`, unmodified) plus a simulated ESP32 device
(`scripts/demoSimulator.js`) that drives the real irrigation/telemetry/
command service functions — the same code path a real device would use.
Nothing about the backend logic is mocked for the demo.

To run it on the port used for live presentations:

```
PORT=5001 npm run demo
```

(Plain `npm run demo` also works and uses the default port from
`.env`/config if `PORT` isn't set.)

The demo is **bounded**: it runs one simulated irrigation cycle
(telemetry → low moisture → decision → OPEN → acknowledged → executing →
valve OPEN → moisture recovery → CLOSE → acknowledged → executing →
valve CLOSED) and then shuts itself down cleanly — HTTP server closed,
MongoDB connection closed, in-memory MongoDB stopped, process exits.
It no longer runs forever. See "Bounded run behavior" below.

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
[DEMO] Bounded run: will stop after ~1 full irrigation cycle, or after 60 ticks / 240s, whichever comes first.
[DEMO] Telemetry received from sim-esp32-001: moisture=... temp=... salinity=...
[DEMO] 1. Telemetry received.
[DEMO] 2. Moisture below threshold (...).
[DEMO] 3. Irrigation decision created (open).
[DEMO] 4. OPEN command created (...).
[DEMO] 5. Command acknowledged (open_valve, ...).
[DEMO] 6. Valve confirmed OPEN (...).
[DEMO] 7. Moisture recovered (...).
[DEMO] 8. CLOSE command created (...).
[DEMO] 9. Command acknowledged (close_valve, ...).
[DEMO] 10. Valve confirmed CLOSED (...).
[DEMO] DEMO PASS — one full irrigation cycle completed (... ticks, ...s elapsed.)
[DEMO] Simulation finished. Shutting down cleanly...
[DEMO] HTTP server closed.
[DEMO] Database connection closed.
[DEMO] In-memory MongoDB stopped.
[DEMO] Final summary: PASS — one full irrigation cycle completed in ... ticks / ...s.
```

The simulator runs the real command lifecycle end to end (dispatched →
acknowledged → executing → completed) and real irrigation safety checks
(max duration, daily allowance) — nothing about it is faked.

While it's running, log in to the frontend with the printed demo
credentials to watch the dashboard update live. Because the run is now
bounded (a few minutes at most), start the frontend and log in promptly
after launching the demo if you want to watch it live end to end.

## Bounded run behavior

The demo intentionally stops after roughly one full irrigation cycle
instead of running forever, so it's safe to leave attended during a
presentation. Two independent safety limits bound it, both configurable
via environment variables (set in your shell or in `.env`):

| Variable                     | Default | Meaning                                                        |
|-------------------------------|---------|------------------------------------------------------------------|
| `DEMO_MAX_TICKS`              | `60`    | Max simulated telemetry ticks before giving up (one every ~4s). |
| `DEMO_MAX_DURATION_SECONDS`   | `240`   | Max wall-clock seconds before giving up, regardless of ticks.   |

Whichever limit is hit first stops the run. On success you'll see
`[DEMO] DEMO PASS ...` and the process exits `0`. If a full cycle
doesn't complete within the configured limits (e.g. an unusually long
random moisture drift), you'll see `[DEMO] DEMO FAILED: <exact reason>`
and the process exits non-zero — the server and database are still shut
down cleanly either way.

Example — give the demo more headroom on a slow machine:

```
DEMO_MAX_TICKS=120 DEMO_MAX_DURATION_SECONDS=480 PORT=5001 npm run demo
```
