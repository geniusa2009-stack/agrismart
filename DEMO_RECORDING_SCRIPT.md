# AgriSmart Live Demo — Recording Script (target 90s, range 60–120s)

Written from the actual current source (`Dashboard.jsx`, `Devices.jsx`,
`Irrigation.jsx`, `AiInsightCard.jsx`) so every line below matches what is
really on screen — nothing here describes a feature that isn't built.

## Before you hit record

1. `cd agrismart-backend && npm run dev` (uses your real Atlas connection —
   this shows your real farm/device/command history, not a fresh demo reset).
2. `cd agrismart-frontend && npm run dev`, open `http://localhost:5173`.
3. Log in with your real account and confirm: Dashboard shows a moisture
   reading, the Devices page shows your device online/offline status, and
   Irrigation shows at least one command in its history.
4. Close DevTools, close unrelated tabs, hide bookmarks bar, silence
   notifications (Do Not Disturb).
5. **Do not click "Add Device" or any "regenerate secret" action during
   recording** — that flow displays a real one-time device secret on
   screen, which must never appear in the video.
6. Zoom the browser to make text comfortably readable at 1920×1080
   (Cmd/Ctrl + a couple of times if your display is high-DPI).

## Recording (macOS)

- `Cmd+Shift+5` → "Record Entire Screen" or "Record Selected Portion"
  (select just the browser window) → Record.
- Stop with the menu-bar stop button when you finish Scene 4.
- This saves a `.mov` file to your Desktop by default.

Once you have the raw file, drop it into this project folder (anywhere,
e.g. the repo root) and tell me — I'll trim it to the target length,
convert it to 1920×1080 H.264 MP4, and verify duration/size/no visible
secrets before you upload it to Drive.

## Scene 1 — Dashboard (~30s)

Land on `/` (Dashboard). Let it sit for a beat before moving the cursor.

**On-screen caption:** "AgriSmart — turning field data into irrigation intelligence."

Show, in order (these are real cards on the page, no scrolling tricks needed):
- The greeting header + farm name + "All Systems Operational" badge.
- The KPI strip: **Soil Moisture, Temperature, EC / Salinity, Irrigation**
  (state) — these are the real fields the task asked for.
- The **Soil Moisture** chart card (telemetry history).
- The **Devices** card (online/offline donut).

**Caption (second half):** "Live soil moisture, temperature and EC readings, and device status, from a real backend."

## Scene 2 — Device / IoT (~20s)

Click **Devices** in the sidebar.

**Caption:** "Sensor → backend → dashboard."

Show the device list (name, device ID, Online/Offline badge) and click into
the provisioned device to show its detail/telemetry chart.

**Important accuracy note — say or caption this, don't skip it:**
"This is a provisioned device record backed by real telemetry — no
physical ESP32 is currently connected in the field." (This matches your
own truthfulness rule and the project's README, which is explicit that no
physical ESP32 has been wired up yet.)

## Scene 3 — Irrigation Control (~25s)

Click **Irrigation** in the sidebar.

**Caption:** "Every irrigation command is tracked through a real, enforced lifecycle."

Show:
- The valve list + **Physical state** panel — point out the two separate
  labels: **Requested state** vs. **Physical state** (Confirmed
  open/closed/**Unknown**).
- The **Command Lifecycle** card — showing the real stage stepper
  (Pending → Queued → Sent → Acknowledged → Executing → Completed) or, if
  the latest command expired, the honest "Command expired" state (this is
  the fix from the last engineering pass — it now always names the exact
  command, its timestamp, and the valve).

**Caption:** "Commanded state and confirmed physical state are always shown separately — physical confirmation only happens when a real device reports back."

Do **not** click Start/Stop Irrigation live unless you want to show a fresh
command — it's optional and not required to satisfy the brief.

## Scene 4 — AI (~15s)

Scroll back to the Dashboard and point at the **AI Insight** card (it sits
right under the farm status header — no separate AI page exists today,
which is accurate to report).

Two possible real states — caption whichever one is actually showing:

- If it reads "AI insight unavailable — collecting more data":
  **Caption:** "AgriSmart's AI layer is real but honest: it declines to guess until it has enough data."
- If it shows a probability/confidence line:
  **Caption:** "An AI research layer estimates irrigation likelihood from live data. Current models are candidates, still being validated — not production forecasts." (If you see an amber "dev model" badge, that confirms the model was trained on development, not production, data — leave it visible, don't crop it out.)

## Closing frame (optional, ~5s)

Hold on the Dashboard or fade to the AgriSmart logo/wordmark for the last
couple of seconds.

## Things to keep OUT of frame

- Any `.env` file, terminal window, or MongoDB connection string.
- The "Add Device" one-time secret banner.
- DevTools / console / network tab.
- Any tab other than AgriSmart.
