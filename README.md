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
npx playwright test  # 440+ UI tests across chromium/firefox/webkit, mocked API (no backend needed)
```

## Backend

See [lambs-server](https://github.com/Wool-xing/lambs-server) — the Go single-binary backend this UI talks to.

## Features

Dashboard (project cards, status machine, multi-node system monitor, log
panel) · project detail (data browser for 8 datasource types incl. vector
search, member management with RBAC, service logs, backups, scheduled
tasks) · user management · notification center · system settings (global
config, SMTP, brand logo, exports, audit log) · 12 themes · keyboard-
accessible controls (WCAG basics).

The backend contract lives in [lambs-server](https://github.com/Wool-xing/lambs-server).

## License

MIT
