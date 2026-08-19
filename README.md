# Lambs Web

React SPA frontend for Lambs 管理系统 — universal project management panel.

## Tech

- React 19 + Vite
- react-router-dom 7 (BrowserRouter, basename `/Lambs` — set via `base` in `vite.config.js`)
- Playwright for E2E (mock-API UI tests)

## Dev

```bash
npm install
npm run dev          # vite dev server on :2233
```

The dev server proxies `/Lambs/api` to `http://localhost:8000` by default — point it at a running lambs-server instance in `vite.config.js`.

## Build

```bash
npm run build        # output to dist/
```

Deploy `dist/` behind nginx at `/Lambs/` (see `deploy/nginx-lambs.conf` in the lambs-server repo).

## Test

```bash
npx playwright test  # 55 UI tests, mocked API (no backend needed)
```

## Backend

See [lambs-server](https://github.com/Wool-xing/lambs-server) — the Go single-binary backend this UI talks to.
