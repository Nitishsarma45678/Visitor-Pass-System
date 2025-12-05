🚀 Visitor Pass System (CarePass)

A modern PWA-based visitor management system built with React, Vite, TailwindCSS, barcode/QR scanning, offline storage, and role-based dashboards.

The system supports:

Visitor self-registration

Admin/Reception approval workflows

QR-based check-in / check-out

Security scanning interface

Reports & analytics

✨ Features
👨‍💼 Visitor Workflow

Visitors can self-register through a public page.

Auto-generated QR pass with unique ID + short human code.

Review pass details, including visit history, host, purpose, etc.

🏢 Admin & Reception

Approve or decline pending visitor requests.

Create new passes directly from the dashboard.

Manage access policies:

Single-entry

Multi-entry (re-entry)

Validity windows (valid until date)

🔐 Security Role

Dedicated scanner interface for gate security.

Check-in / Check-out visitors using QR.

Prevents duplicate scans using smart debounce.

Enforces pass policy rules (expiry, limit reached, declined, pending).

📊 Dashboard & Reporting

Overview of all visitors.

Filter by status: Pending, Approved, Checked-In, Checked-Out, Declined.

Export visitor logs as CSV.

Real-time updates across tabs (BroadcastChannel-based).

📱 PWA Support

Installable on desktop or mobile.

Works offline using localForage (IndexedDB).

Fast-loading, optimized for low-end devices.

🛠️ Tech Stack
Layer	Technology
Frontend	React (Vite), TailwindCSS
Storage	localForage (IndexedDB)
QR Code	jsQR (decoding), qrcode.react (encoding)
State	Local state + BroadcastChannel syncing
Auth	Demo role-based (Admin, Reception, Security)
Build Tool	Vite
Deployment	GitHub Pages / Any static hosting
📂 Project Structure
src/
 ├── components/         # Shared UI components
 ├── pages/              # Main screens (Dashboard, Scan, AllPasses, etc.)
 ├── lib/                # Storage, QR, Reports, Helpers
 ├── styles/             # theme.css + Tailwind layers
 ├── App.jsx             # Main router + role tabs
 └── main.jsx            # App entry point


Key logic areas:

✔ Storage & Pass Rules

src/lib/storage.js handles:

Pass creation

Approvals & declines

Check-in/check-out

Visit history array

Re-entry rules

✔ QR Encode/Decode

src/lib/qr.js

✔ Reports

src/lib/reports.js
Used by Dashboard.

✔ Scanner

src/components/Scanner.jsx
Camera access + jsQR decoding + debounce.

🚀 Getting Started
1. Install dependencies
npm install

2. Start the development server
npm run dev


Visit:

http://localhost:5173

3. Build for production
npm run build
npm run preview

🔐 Demo Authentication

The system uses simple local login with three predefined roles:

admin – full access

reception – approve/decline passes

security – scanning & check-in/out

Modify them in:

src/lib/auth.js

📱 QR Workflow Overview

Visitor registers → Pass generated

Admin/Reception approves → Pass becomes active

Security scans QR → Check-in recorded

On exit → Scan again for Check-out

Dashboard reflects changes in real-time

📡 Real-Time Refresh (Offline Friendly)

The app uses:

BroadcastChannel (modern browsers)

storage events (fallback)

So tabs update when:

New pass is created

Pass is approved/declined

A visitor checks in/out

📅 Roadmap

🔗 Move from localForage → real cloud database (Firebase/Supabase)

🪪 Add user-specific login & JWT auth

🖨 Printable pass format

📊 Advanced reports (weekly, monthly charts)

☁ Deploy backend API for multi-device syncing

🎨 Better theme customization

🤝 Contributing

Pull requests are welcome.
Before submitting changes:

npm run build
npm run lint

📄 License

MIT License.
You are free to use, modify, and distribute this project.

🌟 Credits

Built by Nitish Sarma ( Chatgpt as my companion )
Designed as a lightweight visitor-authorization solution with QR-based tracking.