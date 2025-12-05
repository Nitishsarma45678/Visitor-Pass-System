// src/pages/AllPasses.jsx
/**  ALLPASSES WITH RESPONSIVE LAYOUT  **/
import { useEffect, useMemo, useRef, useState } from "react";
import ApproveModal from "@/components/ApproveModal.jsx";
import PassDetail from "@/components/PassDetail.jsx";
import {
  deletePass,
  getAllPasses,
  approvePass,
  declinePass,
} from "@/lib/storage.js";
import { passesToRows, toCSV, downloadCSV } from "@/lib/csv.js";
import { QRCodeSVG } from "qrcode.react";
import { encodeQR } from "@/lib/qr.js";
import { currentUser } from "@/lib/auth.js";

import {
  Search,
  Download,
  Share2,
  Trash2,
  CheckSquare,
  XSquare,
  RefreshCw,
  CheckCircle,
  XCircle,
  Info,
  AlertCircle,
} from "lucide-react";

import { motion, AnimatePresence } from "framer-motion";

export default function AllPasses() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [refreshing, setRefreshing] = useState(false);

  const [qrFor, setQrFor] = useState(null);
  const svgRef = useRef(null);

  const [approveFor, setApproveFor] = useState(null);
  const [shareFor, setShareFor] = useState(null);

  const [declineFor, setDeclineFor] = useState(null);
  const [declineReason, setDeclineReason] = useState("");
  const [declineBusy, setDeclineBusy] = useState(false);

  const [notifications, setNotifications] = useState([]);

  // NEW: delete confirm modal state
  const [deleteFor, setDeleteFor] = useState(null);

  // NEW: detailed view modal state
  const [selectedPass, setSelectedPass] = useState(null);

  useEffect(() => {
    refresh();
  }, []);

  const role = currentUser()?.role;

  useEffect(() => {
    const onNew = async () => {
      await refresh();
    };

    let bc;
    if (typeof BroadcastChannel !== "undefined") {
      bc = new BroadcastChannel("carepass");
      bc.onmessage = (ev) =>
        ev?.data?.type === "new-pass" ? onNew(ev.data) : null;
    } else {
      const handler = (ev) => {
        if (ev.key === "carepass:new") {
          try {
            onNew(JSON.parse(ev.newValue));
          } catch {}
        }
      };
      window.addEventListener("storage", handler);
      bc = { close: () => window.removeEventListener("storage", handler) };
    }
    return () => bc?.close?.();
  }, []);

  async function refresh() {
    setRefreshing(true);
    const list = await getAllPasses();
    setItems(list);
    setTimeout(() => setRefreshing(false), 300);
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    let list = items;

    if (statusFilter !== "all")
      list = list.filter((v) => (v.status || "created") === statusFilter);

    if (!s) return list;

    return list.filter((v) =>
      [v.name, v.company, v.host, v.purpose, v.code].some((f) =>
        f?.toLowerCase().includes(s)
      )
    );
  }, [items, q, statusFilter]);

  const canExportFiltered = filtered.length > 0;
  const canExportAll = items.length > 0;

  async function onDelete(id) {
    if (!id) return;
    await deletePass(id);
    await refresh();
  }

  function exportCSV(scope = "filtered") {
    if (role !== "admin") return;
    const src = scope === "all" ? items : filtered;
    const rows = passesToRows(src);
    if (!rows.length) return showNotification("No data to export.", "info");
    const csv = toCSV(rows);
    downloadCSV(
      `carepass_export_${new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[:T]/g, "-")}.csv`,
      csv
    );
  }

  async function onApprove(pass, policy) {
    const user = currentUser();
    await approvePass(pass.id, {
      ...policy,
      approver: user?.name || user?.email || null,
    });
    await refresh();
    showNotification("Approved", "success");
  }

  async function onDecline(pass, reason) {
    const user = currentUser();
    await declinePass(pass.id, {
      reason,
      decliner: user?.name || user?.email || null,
    });
    await refresh();
    showNotification("Declined", "success");
  }

  function showNotification(message, type = "info") {
    const id = Date.now();
    setNotifications((n) => [...n, { id, message, type }]);
    setTimeout(() => {
      setNotifications((n) => n.filter((x) => x.id !== id));
    }, 3000);
  }

  function copyLink(pass) {
    if (!(role === "admin" || role === "reception")) return;
    const url = `${location.origin}/visit?passId=${encodeURIComponent(pass.id)}`;
    navigator.clipboard
      ?.writeText(url)
      .then(() => showNotification("Link copied", "success"))
      .catch(() => showNotification("Could not copy", "error"));
  }

  function shareWhatsApp(pass) {
    const url = `${location.origin}/visit?passId=${encodeURIComponent(pass.id)}`;
    const text = `${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  function downloadQR() {
    if (!svgRef.current || !qrFor) return;
    const xml = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([xml], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${qrFor.code}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyCode() {
    if (!qrFor) return;
    try {
      await navigator.clipboard.writeText(qrFor.code);
      showNotification("Code copied", "success");
    } catch {
      showNotification("Could not copy", "error");
    }
  }

  function prettyStatus(s) {
    if (s === "pending")
      return { label: "Pending", cls: "bg-amber-100 text-amber-500" };
    if (s === "checked-in")
      return { label: "Checked-in", cls: "bg-green-50 text-green-700" };
    if (s === "checked-out")
      return { label: "Checked-out", cls: "bg-sky-50 text-sky-700" };
    if (s === "declined")
      return { label: "Declined", cls: "bg-red-50 text-red-700" };
    return { label: "Created", cls: "bg-green-50 text-green-700" };
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="mx-auto w-full"
    >
      <div className="card grid gap-4">
        {/* HEADER: stack on mobile, row on sm+ */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">All passes</h2>
            <div className="subtle text-sm text-slate-500">
              Search, filter, approve and export visitor passes.
            </div>
          </div>

          <div className="w-full sm:w-auto">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              {/* Search (flex-grow on mobile) */}
              <div className="flex items-center gap-2 border rounded-lg px-3 py-1 flex-1 min-w-0">
                <Search size={16} className="text-slate-500 flex-shrink-0" />
                <input
                  placeholder="Search name, host, code…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="outline-none w-full"
                />
              </div>

              {/* Filter */}
              <select
                className="border rounded-lg px-3 py-2 w-full sm:w-auto"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="created">Created</option>
                <option value="checked-in">Checked-in</option>
                <option value="checked-out">Checked-out</option>
                <option value="declined">Declined</option>
              </select>

              {/* Actions: refresh + export */}
              <div className="flex items-center gap-2">
                <motion.button
                  className="btn btn-ghost"
                  onClick={refresh}
                  animate={refreshing ? { rotate: 360 } : { rotate: 0 }}
                  transition={{ duration: 0.4, ease: "easeInOut" }}
                >
                  <RefreshCw size={16} />
                </motion.button>

                {role === "admin" && (
                  <div className="flex items-center gap-2">
                    <button
                      className="btn btn-outline flex items-center gap-2 text-sm"
                      disabled={!canExportFiltered}
                      onClick={() => exportCSV("filtered")}
                    >
                      <Download size={14} /> Export
                    </button>
                    <button
                      className="btn btn-outline flex items-center gap-2 text-sm"
                      disabled={!canExportAll}
                      onClick={() => exportCSV("all")}
                    >
                      <Download size={14} /> Export all
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* LIST */}
        <div className="grid gap-3">
          {filtered.length === 0 ? (
            <div className="rounded-2xl border p-8 text-center text-slate-500">
              <div className="text-xl mb-2">No passes yet</div>
              <div className="subtle mb-4">
                Create a pass from the Create Pass tab, or share the visitor
                link at the gate.
              </div>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <button
                  className="btn btn-primary"
                  onClick={() =>
                    document
                      .querySelector('button[aria-label="create-tab"]')
                      ?.click()
                  }
                >
                  Create pass
                </button>

                <button className="btn" onClick={refresh}>
                  <motion.span
                    animate={refreshing ? { rotate: 360 } : { rotate: 0 }}
                    transition={{ duration: 0.4 }}
                  >
                    <RefreshCw size={14} />
                  </motion.span>{" "}
                  Refresh
                </button>
              </div>
            </div>
          ) : (
            filtered.map((v) => {
              const st = prettyStatus(v.status);
              return (
                <div
                  key={v.id}
                  className="rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between visitor-row hover:shadow-md gap-3"
                >
                  {/* LEFT: clickable summary opens detail */}
                  <div
                    className="flex items-start gap-4 min-w-0 cursor-pointer"
                    onClick={() => setSelectedPass(v)}
                  >
                    <div className="code-box flex-shrink-0">
                      <div className="text-sm font-mono text-slate-700">{v.code}</div>
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="font-semibold text-base truncate">{v.name}</div>
                        <div className={`text-xs px-2 py-0.5 rounded ${st.cls}`}>{st.label}</div>
                        {v.company && <div className="text-xs text-slate-500 truncate">{v.company}</div>}
                      </div>

                      <div className="text-sm text-slate-600 mt-1">
                        Host: <span className="font-medium">{v.host}</span> • {v.purpose}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        Requested:{" "}
                        {v.requestedAt ? new Date(v.requestedAt).toLocaleString() : "—"}
                      </div>
                    </div>
                  </div>

                 {/* ACTIONS (clean: only Approve / Decline / Share / Delete / QR) */}
<div className="flex items-center gap-2 flex-wrap justify-end">

  {/* QR */}
  <button
    className="btn-qr"
    onClick={() => setQrFor(v)}
    aria-label={`Show QR for ${v.code}`}
  >
    QR
  </button>

  {/* Approve / Decline - ALWAYS full buttons */}
  {v.status === "pending" && (role === "admin" || role === "reception") && (
    <>
      <button
        className="btn-sm btn-sm-outline flex items-center gap-2 text-sm"
        style={{ borderColor: "#0b8a33ff", color: "#047857" }}
        onClick={() => setApproveFor(v)}
      >
        Approve
      </button>

      <button
        className="btn-sm btn-sm-outline flex items-center gap-2 text-sm"
        style={{ borderColor: "#db1818ff", color: "#b91c1c" }}
        onClick={() => { setDeclineFor(v); setDeclineReason(""); }}
      >
        Decline
      </button>
    </>
  )}

  {/* Share */}
  {(role === "admin" || role === "reception") && (
    <button
      className="btn-icon"
      onClick={() => setShareFor(v)}
      aria-label={`Share ${v.code}`}
    >
      <Share2 size={16} />
    </button>
  )}

  {/* Delete (admin only) */}
  {role === "admin" && (
    <button
      className="btn-delete flex items-center gap-2 text-sm"
      onClick={() => setDeleteFor(v)}
      aria-label={`Delete ${v.code}`}
    >
      <Trash2 size={14} />
      Delete
    </button>
  )}
</div>

                </div>
              );
            })
          )}
        </div>
      </div>

      {/* APPROVE MODAL */}
      <ApproveModal
        passObj={approveFor}
        open={!!approveFor}
        onClose={() => setApproveFor(null)}
        onApprove={async (policy) => {
          if (!approveFor) return;
          await onApprove(approveFor, policy);
          setApproveFor(null);
        }}
      />

      {/* DECLINE MODAL */}
      {declineFor && (
        <div className="modal-backdrop" onClick={() => { if (!declineBusy) setDeclineFor(null); }}>
          <div className="card max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">Decline pass • {declineFor.name}</h3>

            <div className="grid gap-3">
              <div className="text-sm text-slate-600">Are you sure you want to decline this visitor pass?</div>

              <label className="text-xs">Reason (optional)</label>
              <textarea
                className="border rounded-lg px-3 py-2 min-h-[72px]"
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                disabled={declineBusy}
              />

              <div className="flex justify-end gap-2 mt-4">
                <button className="btn btn-outline" onClick={() => !declineBusy && setDeclineFor(null)}>Cancel</button>

                <button
                  className="px-4 py-1.5 rounded-lg bg-red-600 text-white"
                  disabled={declineBusy}
                  onClick={async () => {
                    try {
                      setDeclineBusy(true);
                      await onDecline(declineFor, declineReason || "Declined");
                      setDeclineFor(null);
                    } finally {
                      setDeclineBusy(false);
                    }
                  }}
                >
                  {declineBusy ? "Declining…" : "Confirm Decline"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QR MODAL */}
      {qrFor && (
        <div className="modal-backdrop" onClick={() => setQrFor(null)}>
          <div className="card max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">QR • {qrFor.name}</h3>
            <div className="grid place-items-center gap-3">
              <QRCodeSVG value={encodeQR(qrFor)} size={200} includeMargin ref={svgRef} />
              <div className="text-sm text-slate-600">{qrFor.code} • Host: {qrFor.host}</div>
            </div>
            <div className="mt-4 flex gap-2 justify-end flex-wrap">
              <button className="btn btn-outline" onClick={copyCode}>Copy Code</button>
              <button className="btn" onClick={downloadQR}>Download SVG</button>
              <button className="btn btn-primary" onClick={() => setQrFor(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* SHARE MODAL */}
      {shareFor && (
        <div className="modal-backdrop" onClick={() => setShareFor(null)}>
          <div className="card max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">Share • {shareFor.name}</h3>

            <div className="grid gap-3">
              <button
                className="btn btn-outline flex items-center justify-center w-full"
                onClick={() => {
                  copyLink(shareFor);
                  setShareFor(null);
                }}
              >
                Copy link
              </button>

              <button
                className="btn flex items-center gap-2"
                style={{ backgroundColor: "#25D366", color: "white" }}
                onClick={() => {
                  shareWhatsApp(shareFor);
                  setShareFor(null);
                }}
              >
                <img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" width="20" alt="WhatsApp" />
                WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM MODAL (admin only) */}
      <AnimatePresence>
        {deleteFor && (
          <div className="modal-backdrop" onClick={() => setDeleteFor(null)}>
            <motion.div
              className="card max-w-sm"
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.2 }}
            >
              <h3 className="font-semibold mb-2">Delete pass • {deleteFor.name}</h3>
              <div className="text-sm text-slate-600 mb-4">
                This action cannot be undone. Are you sure you want to delete this pass?
              </div>
              <div className="flex justify-end gap-2">
                <button className="btn btn-outline" onClick={() => setDeleteFor(null)}>Cancel</button>
                <button
                  className="px-4 py-1.5 rounded-lg bg-red-600 text-white"
                  onClick={async () => {
                    await onDelete(deleteFor.id);
                    setDeleteFor(null);
                  }}
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DETAILED PASS VIEW (same modal used previously) */}
      {selectedPass && (
        <PassDetail
          passObj={selectedPass}
          open={!!selectedPass}
          onClose={() => setSelectedPass(null)}
          onRefresh={refresh}
        />
      )}

      {/* NOTIFICATIONS (small toasts) */}
      <div className="fixed top-6 right-6 z-50 flex flex-col gap-2">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`rounded px-3 py-2 text-sm shadow-md border ${
              n.type === "error" ? "bg-red-50 text-red-700 border-red-200" : "bg-white text-slate-700 border-slate-200"
            }`}
          >
            {n.message}
          </div>
        ))}
      </div>
    </motion.div>
  );
}
