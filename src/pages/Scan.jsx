// src/pages/Scan.jsx
import { useCallback, useEffect, useRef, useState } from "react";
import Scanner from "@/components/Scanner.jsx";
import { getPassByCode, toggleCheck } from "@/lib/storage.js";
import { currentUser } from "@/lib/auth.js";

/**
 * Responsive Scan page (recent-scans list implemented)
 */

const RECENT_KEY = "carepass:recentScans:v1";

export default function Scan() {
  const [message, setMessage] = useState(null); // { type: 'info'|'success'|'error', text }
  const [loading, setLoading] = useState(false);
  const [manual, setManual] = useState("");
  const [lastScanned, setLastScanned] = useState(null);
  const [recent, setRecent] = useState(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [permissionHint, setPermissionHint] = useState(null);
  const [showScanFeedback, setShowScanFeedback] = useState(false);
  const [scanResult, setScanResult] = useState(null); // { type: 'success' | 'error', data: {...} }
  const manualRef = useRef(null);

  // detect small screens (mobile)
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth <= 640 : false
  );
  useEffect(() => {
    function onResize() {
      setIsMobile(window.innerWidth <= 640);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(id);
  }, [message]);

  // persist recent
  function persistRecent(list) {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    } catch {}
  }

  // normalize + execute after a found code/id
  const processCode = useCallback(async (raw) => {
    try {
      setLoading(true);
      setMessage({ type: "info", text: "Processing..." });

      // Normalize payload
      let codeCandidate = "";
      if (!raw) {
        setMessage({ type: "error", text: "Invalid QR" });
        setLoading(false);
        return;
      }

      if (typeof raw === "object") {
        codeCandidate = raw.code || raw.raw || raw.id || JSON.stringify(raw);
      } else {
        codeCandidate = String(raw);
      }
      codeCandidate = codeCandidate.trim();

      // If JSON text, parse for .code or .id
      try {
        if (codeCandidate && (codeCandidate.startsWith("{") || codeCandidate.startsWith("["))) {
          const parsed = JSON.parse(codeCandidate);
          if (parsed && (parsed.code || parsed.id)) {
            codeCandidate = parsed.code || parsed.id;
          }
        }
      } catch (e) {
        // ignore parse errors
      }

      codeCandidate = String(codeCandidate || "").trim();
      if (!codeCandidate) {
        setScanResult({ type: "error", message: "Invalid QR payload" });
        setShowScanFeedback(true);
        setLoading(false);
        setTimeout(() => setShowScanFeedback(false), 3000);
        return;
      }

      // Lookup
      const pass = await getPassByCode(codeCandidate);
      if (!pass) {
        setScanResult({ type: "error", message: `No pass found for "${codeCandidate}"` });
        setShowScanFeedback(true);
        setLoading(false);
        setTimeout(() => setShowScanFeedback(false), 3000);
        return;
      }

      // Handle pending/declined explicitly
      if (pass.status === "pending") {
        setScanResult({ type: "error", message: `Pass for ${pass.name} is not approved yet` });
        setShowScanFeedback(true);
        setLoading(false);
        setTimeout(() => setShowScanFeedback(false), 3000);
        return;
      }
      if (pass.status === "declined") {
        const reason = pass.declineReason ? ` Reason: ${pass.declineReason}` : "";
        setScanResult({ type: "error", message: `Pass for ${pass.name} has been declined${reason}` });
        setShowScanFeedback(true);
        setLoading(false);
        setTimeout(() => setShowScanFeedback(false), 3000);
        return;
      }

      // toggle check (check-in / check-out)
      const updated = await toggleCheck(pass.id);
      if (!updated) {
        setScanResult({ type: "error", message: "Could not update pass. Try again." });
        setShowScanFeedback(true);
        setLoading(false);
        setTimeout(() => setShowScanFeedback(false), 3000);
        return;
      }

      // check for blocked reasons
      if (updated._blocked) {
        const r = updated._reason || "blocked";
        let errorMsg = "";
        if (r === "expired") {
          errorMsg = `Pass ${pass.code} has expired`;
        } else if (r === "limit-or-single-use" || r === "not-allowed") {
          errorMsg = `Re-entry limit reached for ${pass.name}`;
        } else {
          errorMsg = `Action blocked: ${r}`;
        }
        setScanResult({ type: "error", message: errorMsg });
        setShowScanFeedback(true);
        setLoading(false);
        setTimeout(() => setShowScanFeedback(false), 3000);
        return;
      }

      // success - prepare message and recent list
      let successMsg = "";
      if (updated.status === "checked-in") {
        successMsg = `Checked IN: ${updated.name || pass.name}`;
        setMessage({ type: "success", text: `✅ Checked IN: ${updated.name || pass.name}` });
      } else if (updated.status === "checked-out") {
        successMsg = `Checked OUT: ${updated.name || pass.name}`;
        setMessage({ type: "success", text: `👋 Checked OUT: ${updated.name || pass.name}` });
      } else {
        successMsg = `Updated: ${updated.name || pass.name}`;
        setMessage({ type: "info", text: `Updated: ${updated.name || pass.name} • ${updated.status || "ok"}` });
      }

      setScanResult({ 
        type: "success", 
        message: successMsg,
        data: { name: updated.name, code: updated.code, status: updated.status }
      });
      setShowScanFeedback(true);
      setTimeout(() => setShowScanFeedback(false), 2500);

      const item = { time: Date.now(), pass: { id: updated.id, name: updated.name, code: updated.code, status: updated.status } };
      setLastScanned(item);

      // update recent list (prepend, keep max 20 for better history)
      setRecent((r) => {
        const nr = [item, ...(r || [])].filter(Boolean).slice(0, 20);
        persistRecent(nr);
        return nr;
      });
    } catch (err) {
      console.error(err);
      setScanResult({ type: "error", message: "Scanner error. Check console." });
      setShowScanFeedback(true);
      setTimeout(() => setShowScanFeedback(false), 3000);
    } finally {
      setLoading(false);
    }
  }, []);

  // callback for live scanner component
  const onDetect = useCallback(
    async (payload) => {
      setManual("");
      await processCode(payload);
    },
    [processCode]
  );

  // fallback: user submits manual code
  async function handleManualSubmit(e) {
    e?.preventDefault?.();
    if (!manual || !String(manual).trim()) {
      setMessage({ type: "error", text: "Enter code or scan QR" });
      manualRef.current?.focus?.();
      return;
    }
    await processCode(manual.trim());
  }

  // helper: friendly permission hint
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      setPermissionHint("Camera not available in this browser.");
      return;
    }
    setPermissionHint(null);
  }, []);

  // Quick actions: copy last code or open last pass
  function copyLastCode() {
    if (recent && recent.length) {
      navigator.clipboard?.writeText(recent[0].pass.code);
      setMessage({ type: "success", text: "Code copied" });
    } else {
      setMessage({ type: "info", text: "No recent scans" });
    }
  }
  function openLastPass() {
    if (recent && recent.length) {
      const id = recent[0].pass.id;
      if (id) window.open(`${location.origin}/visit?passId=${encodeURIComponent(id)}`, "_blank");
      else setMessage({ type: "info", text: "No last scan to open" });
    } else {
      setMessage({ type: "info", text: "No recent scans" });
    }
  }

  return (
    <div className="rounded-2xl border p-4 grid gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Scan QR</h2>
        <div className="text-xs text-slate-500">Point the camera at a CarePass QR</div>
      </div>

      {/* BIG SCANNER AREA: responsive */}
      <div className="w-full flex flex-col sm:flex-row gap-4 items-start">
        {/* LEFT: scanner */}
        <div className="flex-1 rounded-md border border-slate-200 p-3 flex flex-col">
          <div
            className="w-full flex items-center justify-center relative"
            style={{ minHeight: isMobile ? "180px" : "400px" }}
          >
            {/* Scanner - hidden when showing feedback */}
            <div className={`w-full h-full scanner-root ${showScanFeedback ? "hidden" : ""}`}>
              <Scanner onDetect={onDetect} hint={permissionHint} />
            </div>

            {/* Scan Feedback Overlay */}
            {showScanFeedback && scanResult && (
              <div
                className={`absolute inset-0 flex flex-col items-center justify-center rounded-md ${
                  scanResult.type === "success"
                    ? "bg-gradient-to-br from-green-50 to-green-100"
                    : "bg-gradient-to-br from-red-50 to-red-100"
                } animate-fadeIn`}
              >
                {/* Icon */}
                <div className="mb-4">
                  {scanResult.type === "success" ? (
                    <div className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center animate-scaleIn">
                      <svg
                        className="w-12 h-12 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-red-500 flex items-center justify-center animate-scaleIn">
                      <svg
                        className="w-12 h-12 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Message */}
                <div className="text-center px-4">
                  <h3
                    className={`text-xl font-bold mb-2 ${
                      scanResult.type === "success" ? "text-green-700" : "text-red-700"
                    }`}
                  >
                    {scanResult.type === "success" ? "Scan Complete!" : "Scan Failed"}
                  </h3>
                  <p
                    className={`text-sm ${
                      scanResult.type === "success" ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {scanResult.message}
                  </p>
                  {scanResult.type === "success" && scanResult.data && (
                    <div className="mt-3 text-xs text-green-600">
                      <div className="font-semibold">{scanResult.data.code}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="mt-2 w-full flex items-center justify-center">
            <button
              onClick={() => {
                setManual("");
                manualRef.current?.focus?.();
              }}
              className="btn btn-ghost text-sm"
            >
             
            </button>
          </div>
        </div>

        {/* RIGHT: manual/status */}
        <aside className="w-full sm:w-[360px] flex-shrink-0">
          <div className="rounded-md border border-slate-200 p-3 flex flex-col gap-3">
            <div>
              <div className="text-xs text-slate-500">Manual code</div>
              <form onSubmit={handleManualSubmit} className="mt-2 flex gap-2">
                <input
                  ref={manualRef}
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  placeholder="Enter pass code or id"
                  className="border rounded px-3 py-2 flex-1 min-w-0"
                  aria-label="Manual pass code"
                />
                <button type="submit" className="px-3 py-2 rounded bg-sky-600 text-white">
                  Go
                </button>
              </form>
            </div>

            <div className="text-xs text-slate-500">
              {permissionHint
                ? permissionHint
                : "Camera required for live scanning. Use manual code if camera isn't available."}
            </div>

            {/* Status box with COMPACT FIXED HEIGHT and scroll */}
            <div
              className="rounded-md border border-slate-100 p-3 bg-white"
              style={{ height: "200px", display: "flex", flexDirection: "column" }}
            >
              {loading ? (
                <div className="text-sm text-slate-600">Processing…</div>
              ) : message ? (
                <div
                  className={`${
                    message.type === "error"
                      ? "text-red-600"
                      : message.type === "success"
                      ? "text-green-600"
                      : "text-slate-700"
                  }`}
                >
                  {message.text}
                </div>
              ) : recent && recent.length ? (
                <div className="w-full h-full flex flex-col">
                  <div className="text-sm font-medium mb-2 flex-shrink-0">Recent scans</div>
                  {/* Scrollable area with fixed height */}
                  <div className="flex-1 overflow-y-auto space-y-2" style={{ minHeight: 0 }}>
                    {recent.map((r, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-slate-50 flex-shrink-0"
                      >
                        <div>
                          <div className="text-sm leading-tight">{r.pass?.name || "—"}</div>
                          <div className="text-xs text-slate-500">{r.pass?.code}</div>
                        </div>
                        <div className="text-xs text-slate-400 whitespace-nowrap">
                          {new Date(r.time).toLocaleTimeString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-500">Waiting for scans…</div>
              )}
            </div>

            {/* Quick actions for last scanned */}
            <div>
              <div className="text-xs text-slate-500 mb-1">Quick actions</div>
              <div className="flex gap-2 flex-wrap">
                <button className="btn btn-outline" onClick={copyLastCode}>
                  Copy code
                </button>

                <button className="btn btn-outline" onClick={openLastPass}>
                  Open pass
                </button>

                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    // clear recent
                    setRecent([]);
                    persistRecent([]);
                    setMessage({ type: "info", text: "Cleared recent scans" });
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <div className="text-xs text-slate-500">
        Tip: Ensure camera permission for the site. If scanner fails, use manual code.
      </div>

      {/* Add CSS animations */}
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes scaleIn {
          from {
            transform: scale(0);
          }
          to {
            transform: scale(1);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
        .animate-scaleIn {
          animation: scaleIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
      `}</style>
    </div>
  );
}
