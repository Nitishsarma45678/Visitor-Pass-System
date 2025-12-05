// src/App.jsx
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import CreatePass from "@/pages/CreatePass.jsx";
import AllPasses from "@/pages/AllPasses.jsx";
import Scan from "@/pages/Scan.jsx";
import Login from "@/pages/Login.jsx";
import Dashboard from "@/pages/Dashboard.jsx";
import { currentUser, logout } from "@/lib/auth.js";
import { getAllPasses } from "@/lib/storage.js";

/* role-based helpers */
function defaultTabForRole(role) {
  if (role === "reception") return "create";
  if (role === "security") return "scan";
  return "list";
}
function saveLastTab(role, tab) {
  localStorage.setItem(`carepass:lastTab:${role}`, tab);
}
function getLastTab(role, tabs) {
  const t = localStorage.getItem(`carepass:lastTab:${role}`);
  return tabs?.some((x) => x.key === t) ? t : null;
}
function computeTabs(user) {
  if (!user) return [];
  const role = user.role;
  const tabs = [];
  if (role === "admin") tabs.push({ key: "dashboard", label: "Dashboard" });
  if (role === "admin" || role === "reception")
    tabs.push({
      key: "create",
      label: "Create Pass",
      aria: "create-tab",
    });
  if (role === "admin" || role === "reception" || role === "security")
    tabs.push({ key: "list", label: "All Passes" });
  if (role === "admin" || role === "security")
    tabs.push({ key: "scan", label: "Scan QR" });
  return tabs;
}

/* Mobile menu component used in header for small screens */
function MobileMenu({ tabs, currentTab, setTab, pendingCount, onLogout }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="p-2 rounded-md border bg-white hover:bg-slate-50"
        aria-label="Open menu"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border p-2 z-50">
          <div className="grid gap-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  setTab(t.key);
                  setOpen(false);
                }}
                className={`text-left px-3 py-2 rounded ${currentTab === t.key ? "bg-slate-100 font-medium" : "hover:bg-slate-50"}`}
              >
                <div className="flex items-center justify-between">
                  <span>{t.label}</span>
                  {t.key === "list" && pendingCount > 0 && (
                    <span className="ml-2 inline-flex items-center justify-center text-xs w-5 h-5 rounded-full bg-amber-500 text-white">{pendingCount}</span>
                  )}
                </div>
              </button>
            ))}

            <div className="border-t my-1" />

            <button
              onClick={() => {
                onLogout();
                setOpen(false);
              }}
              className="text-left px-3 py-2 rounded hover:bg-slate-50"
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(currentUser());
  const tabs = useMemo(() => computeTabs(user), [user]);

  const [tab, setTab] = useState(() => {
    const u = currentUser();
    if (!u) return "list";
    const last = getLastTab(u.role, computeTabs(u));
    return last || defaultTabForRole(u.role);
  });

  // pending badge
  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const all = await getAllPasses();
        if (!mounted) return;
        setPendingCount((all || []).filter((p) => p.status === "pending").length);
      } catch (e) {
        if (!mounted) return;
      }
    }
    if (!user) {
      setPendingCount(0);
      return;
    }
    load();
    const id = setInterval(load, 5000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [user]);

  // toast
  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);

  // audio beep
  function playBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.value = 0.0001;
      o.start();
      g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
      setTimeout(() => {
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);
        try {
          o.stop(ctx.currentTime + 0.06);
        } catch {}
      }, 60);
    } catch (e) {}
  }

  // request notification permission
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // listen for new-pass events
  useEffect(() => {
    if (!user) return;

    const onNew = (info) => {
      const name = info?.name || info?.id || "Visitor";
      setPendingCount((n) => n + 1);
      setToast({ text: `New visitor request: ${name}`, ts: Date.now() });
      playBeep();

      // flash title
      const original = document.title;
      let blinking = true,
        i = 0;
      const blink = setInterval(() => {
        document.title = i++ % 2 === 0 ? `🔔 ${original}` : original;
        if (!blinking) {
          clearInterval(blink);
          document.title = original;
        }
      }, 800);
      setTimeout(() => {
        blinking = false;
      }, 4500);

      // system notification
      if ("Notification" in window && Notification.permission === "granted") {
        try {
          const n = new Notification("CarePass — New visitor", {
            body: `${name} • Click to open`,
            tag: `carepass-new-${info?.id || Date.now()}`,
          });
          n.onclick = () => window.focus();
        } catch {}
      }
    };

    let bc;
    if (typeof BroadcastChannel !== "undefined") {
      bc = new BroadcastChannel("carepass");
      bc.onmessage = (ev) => {
        if (ev?.data?.type === "new-pass") onNew(ev.data);
      };
    } else {
      const handler = (ev) => {
        if (ev.key === "carepass:new" && ev.newValue) {
          try {
            onNew(JSON.parse(ev.newValue));
          } catch {
            onNew({});
          }
        }
      };
      window.addEventListener("storage", handler);
      bc = { close: () => window.removeEventListener("storage", handler) };
    }
    return () => {
      try {
        bc?.close();
      } catch {}
    };
  }, [user]);

  // change tab based on role
  useEffect(() => {
    if (!user || !tabs.length) return;
    const remembered = getLastTab(user.role, tabs);
    const initial = remembered || defaultTabForRole(user.role);
    setTab(tabs.some((t) => t.key === initial) ? initial : tabs[0].key);
  }, [user, tabs]);

  useEffect(() => {
    if (!user) return;
    saveLastTab(user.role, tab);
  }, [user, tab]);

  if (!user) return <Login onLoggedIn={setUser} />;

  return (
    <div className="min-h-screen">
      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b">
        <div className="mx-auto w-full max-w-screen-xl lg:max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-4">
              <div className="header-title text-lg font-semibold">CarePass</div>
              <div className="subtle text-sm text-slate-500 hidden sm:block">Visitor Pass PWA</div>
            </div>

            {/* Desktop nav (hidden on small screens) */}
            <nav className="hidden md:flex items-center gap-2">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  aria-label={t.aria || undefined}
                  onClick={() => setTab(t.key)}
                  className={`btn ${tab === t.key ? "btn-primary" : "btn-ghost"}`}
                >
                  <span>{t.label}</span>
                  {t.key === "list" && pendingCount > 0 && (
                    <span className="badge bg-amber-500 text-white ml-2 w-5 h-5 flex items-center justify-center text-xs rounded-full">
                      {pendingCount}
                    </span>
                  )}
                </button>
              ))}

              <div className="ml-4 flex items-center gap-2">
                <div className="text-sm text-slate-600 hidden md:block">
                  Signed in as <span className="font-medium">{user.name}</span>
                </div>
                <button
                  className="btn btn-outline"
                  onClick={() => {
                    logout();
                    setUser(null);
                  }}
                >
                  Logout ({user.role})
                </button>
              </div>
            </nav>

            {/* Mobile controls: hamburger + small user display */}
            <div className="flex items-center md:hidden">
              <div className="text-sm text-slate-600 mr-3">Hi, <span className="font-medium">{user.name.split(" ")[0]}</span></div>

              <MobileMenu
                tabs={tabs}
                currentTab={tab}
                setTab={(k) => setTab(k)}
                pendingCount={pendingCount}
                onLogout={() => {
                  logout();
                  setUser(null);
                }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="mx-auto w-full max-w-screen-xl lg:max-w-6xl px-4 sm:px-6 lg:px-8 py-8 grid gap-6">
        {tab === "dashboard" && user.role === "admin" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <Dashboard />
          </motion.div>
        )}

        {tab === "create" && (user.role === "admin" || user.role === "reception") && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <CreatePass />
          </motion.div>
        )}

        {tab === "list" &&
          (user.role === "admin" || user.role === "reception" || user.role === "security") && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
              <AllPasses />
            </motion.div>
          )}

        {tab === "scan" && (user.role === "admin" || user.role === "security") && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <Scan />
          </motion.div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="mx-auto w-full max-w-screen-xl lg:max-w-6xl px-4 sm:px-6 lg:px-8 text-xs text-slate-500 pb-8">
        <div>Roles: admin (all), reception (create/list), security (scan/list-readonly).</div>
      </footer>

      {/* TOAST */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <div className="bg-slate-900 text-white px-4 py-2 rounded-lg shadow-md">
            <div>{toast.text}</div>
            <div className="text-xs text-slate-300 mt-1">{new Date(toast.ts).toLocaleTimeString()}</div>
          </div>
        </div>
      )}
    </div>
  );
}
