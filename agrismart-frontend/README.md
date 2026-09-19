# AgriSmart frontend

React 19 + Vite + Tailwind CSS. See the [root README](../README.md) for the
full project overview, quick-start (demo and full-dev paths), environment
variables, and product/architecture context — this file only covers the
frontend package itself.

## Local development

```bash
npm install
npm run dev     # http://localhost:5173
```

`VITE_API_BASE_URL` in `.env` must point at wherever the backend is actually
running (see the root README's "Ports" section) — `.env` here already points
at `http://localhost:5001/api/v1` to match this repo's backend `.env`.

## Scripts

```bash
npm run dev       # Vite dev server
npm run build     # production build
npm run preview   # preview a production build locally
npm run lint      # oxlint
npm run test:e2e  # Playwright end-to-end tests (requires a running backend + frontend)
```

## Brand assets

See [`BRAND.md`](BRAND.md) for the color tokens and logo usage rules. The
AgriSmart logo (`public/agrismart-logo.png`) is a fixed brand asset — used
as-is, never recreated as SVG or replaced.
