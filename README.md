# CarePass

CarePass — visitor pass management PWA (demo).  
Built with React + Tailwind, client-side storage (localForage), and a camera QR scanner.

## Project structure (high level)
- `src/pages` — Visit, CreatePass, AllPasses, Scan, Dashboard, Login
- `src/components` — Scanner, PassDetail, VisitorForm, ApproveModal, etc.
- `src/lib` — `storage.js`, `qr.js`, `reports.js`, `ids.js`, `auth.js`, `csv.js`, `time.js`
- `src/styles` — `theme.css`
- `public` — static assets

## Quick start (dev)
```bash
# install
npm install

# dev server (Vite)
npm run dev

# build
npm run build

# preview build
npm run preview
