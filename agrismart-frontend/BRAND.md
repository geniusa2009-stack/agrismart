# AgriSmart brand & design tokens

## Official logo asset

- **Source of truth:** `logo.png` at the project root (`AgriSmart - IoT & AI Smart Farming/logo.png`).
- **Used in the app at:** `agrismart-frontend/public/agrismart-logo.png` (copied as-is, unmodified — see "Setup" below if this file is missing).
- **Where it's rendered:** Sidebar header (`src/components/Sidebar.jsx`), Login screen (`src/pages/Login.jsx`), and the browser favicon (`index.html`).
- The logo is used exactly as provided — not redrawn, approximated, or replaced with text anywhere. Its own wordmark ("AgriSmart") and tagline ("Smart Farming. Better Future.") are baked into the image, so no separate text lockup is rendered next to it.

### Setup (if `agrismart-frontend/public/agrismart-logo.png` is missing)

The asset had to be copied into the frontend's `public/` folder so Vite can serve it. If it's ever missing (e.g. a fresh clone that didn't carry it), run:

```
cp "logo.png" "agrismart-frontend/public/agrismart-logo.png"
```
(run from the project root).

## Extracted colors

No image color-sampling tool was available when these were chosen, so the values below come from careful visual inspection of `logo.png`, per the brand brief's own fallback instruction — not automated extraction. They intentionally stay close to the small set of colors actually present in the logo: leaf/plant green and droplet/circuit teal-cyan, nothing else.

| Token | Hex | Sampled from |
|---|---|---|
| `brand-400` | `#43c98a` | Bright highlight on the upper leaves |
| `brand-500` | `#22a86d` | Mid-tone leaf green (primary action color) |
| `brand-600` | `#178a58` | "Agri" wordmark green / hover state |
| `brand-900` | `#0d3d2b` | Deepest leaf shadow |
| `accent-500` | `#17ada6` | Droplet-outline gradient + circuit-node teal/cyan |
| `accent-600` | `#128f8a` | Accent hover/active state |

The full 50–900/950 scale for both is defined in `tailwind.config.js` under `theme.extend.colors.brand` and `theme.extend.colors.accent`.

## Token system (Tailwind, `tailwind.config.js`)

- `brand-*` — primary. Buttons, active nav state, headings that need brand emphasis, positive/healthy status, links.
- `accent-*` — secondary/info. Anything that was previously a generic Tailwind `sky` blue (water/irrigation icons, the "Recent Activity" open-valve icon, chart lines for EC/salinity and temperature accents that aren't warm-coded, the `Badge tone="blue"` used for in-progress command states and "Auto" mode). The logo has no blue, so `sky-*` was removed everywhere it appeared and replaced with `accent-*`.
- `amber-*` / `red-*` (Tailwind defaults, not brand-specific) — semantic warning/danger. Kept as standard Tailwind colors since these are universal alarm semantics, not brand identity, and the brief only asked to avoid *unrelated* colors (purple, random blue, neon green), not to brand-ify every semantic state.
- `orange-*` (Tailwind default) — used only for the temperature stat icon (a near-universal heat association), not treated as a brand token.
- Neutrals (`slate-*`) — unchanged; still used for body text, borders, and backgrounds. Not brand-specific by design (the logo defines a foreground icon/wordmark color story, not a full neutral system), so re-deriving a whole neutral scale from the logo was judged out of scope for a minimal, safe pass.

## Where each color is used

| Token | Used for |
|---|---|
| `brand-500`/`600` | Primary buttons, active sidebar/nav item, links, focus rings, "healthy soil" / positive states, moisture area chart fill+line |
| `brand-50`/`100` | Soft/positive backgrounds (badges, active states, empty-state accents) |
| `accent-500`/`600` | Irrigation/water-related icons (valve droplet icons, soil-moisture stat icon, irrigation-status stat icon), EC/salinity chart line, "open valve" activity icon, `Badge tone="blue"` (in-progress command states, "Auto" mode) |
| `amber-*` | Warning-severity alerts, high/low readings outside normal range |
| `red-*` | Critical alerts, failed/expired commands, destructive actions (revoke, delete) |
| `orange-*` | Temperature stat icon only |
| `slate-*` | Body text, muted text, borders, neutral backgrounds |

## Not yet brand-tokenized (explicitly out of scope this pass)

Per the phase's constraints (no backend changes, no framework migration, no RTL), this pass covered the app-wide color system and logo placement only. Not touched: a full CSS-custom-property/`ink`/`surface`/`border` variable system (the neutral scale still uses Tailwind's stock `slate-*`), and Arabic/RTL-specific styling.
