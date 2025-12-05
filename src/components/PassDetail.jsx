// src/components/PassDetail.jsx
import { useEffect, useState, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { encodeQR } from "@/lib/qr.js";
import { currentUser } from "@/lib/auth.js";
import { approvePass, declinePass, toggleCheck } from "@/lib/storage.js";
import {
  CheckSquare,
  XSquare,
  Share2,
  Copy,
  Download,
  X,
  User,
  Building2,
  Calendar,
  Clock,
  LogIn,
  LogOut,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Props:
 * - passObj
 * - open
 * - onClose()
 * - onRefresh()
 */
export default function PassDetail({ passObj, open, onClose, onRefresh }) {
  const svgRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState(passObj);
  const [notification, setNotification] = useState(null);

  // responsive QR size
  const [qrSize, setQrSize] = useState(216);
  useEffect(() => {
    function update() {
      const w = Math.max(0, window.innerWidth || 360);
      // use 45% of viewport width at small sizes, cap at 216
      const size = Math.min(216, Math.floor(w * 0.45));
      setQrSize(size < 80 ? 80 : size); // don't go too small
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => setLocal(passObj), [passObj]);
  if (!open || !local) return null;

  const role = currentUser()?.role;

  function showNotif(msg, type = "success") {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 2200);
  }

  async function doApprove() {
    setBusy(true);
    try {
      await approvePass(local.id, {
        allowReentry: !!local.requestedReentry,
        maxEntries: local.maxEntries || 1,
        validUntil: local.validUntil || null,
        approver: currentUser()?.name,
      });
      await onRefresh?.();
      showNotif("Pass approved");
    } catch {
      showNotif("Approve failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function doDecline(reason = "Declined") {
    setBusy(true);
    try {
      await declinePass(local.id, { reason, decliner: currentUser()?.name });
      await onRefresh?.();
      showNotif("Pass declined");
    } catch {
      showNotif("Decline failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function doToggleCheck() {
    setBusy(true);
    try {
      await toggleCheck(local.id);
      await onRefresh?.();
      showNotif(local.status === "checked-in" ? "Checked out" : "Checked in");
    } catch {
      showNotif("Update failed", "error");
    } finally {
      setBusy(false);
    }
  }

  function copyCode() {
    navigator.clipboard
      ?.writeText(local.code)
      .then(() => showNotif("Code copied"))
      .catch(() => showNotif("Copy failed", "error"));
  }

  function copyLink() {
    const url = `${location.origin}/visit?passId=${encodeURIComponent(local.id)}`;
    navigator.clipboard
      ?.writeText(url)
      .then(() => showNotif("Link copied"))
      .catch(() => showNotif("Copy failed", "error"));
  }

  function shareWhatsApp() {
    const url = `${location.origin}/visit?passId=${encodeURIComponent(local.id)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(url)}`, "_blank");
  }

  function downloadQR() {
    if (!svgRef.current) return;
    const xml = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([xml], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${local.code}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    showNotif("QR downloaded");
  }

  // ---- Status UI config
  const statusCfg =
    ({
      pending: {
        label: "Pending Approval",
        bg: "bg-amber-50",
        text: "text-amber-700",
        br: "border-amber-200",
        icon: <AlertCircle className="h-4 w-4 text-amber-500" />,
      },
      created: {
        label: "Created",
        bg: "bg-green-50",
        text: "text-green-700",
        br: "border-green-200",
        icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,
      },
      "checked-in": {
        label: "Checked In",
        bg: "bg-blue-50",
        text: "text-blue-700",
        br: "border-blue-200",
        icon: <LogIn className="h-4 w-4 text-blue-500" />,
      },
      "checked-out": {
        label: "Checked Out",
        bg: "bg-slate-50",
        text: "text-slate-700",
        br: "border-slate-200",
        icon: <LogOut className="h-4 w-4 text-slate-500" />,
      },
      declined: {
        label: "Declined",
        bg: "bg-red-50",
        text: "text-red-700",
        br: "border-red-200",
        icon: <XSquare className="h-4 w-4 text-red-500" />,
      },
    }[local.status] ?? {
      label: "Created",
      bg: "bg-green-50",
      text: "text-green-700",
      br: "border-green-200",
      icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    });

  // ---- Entry/visibility rules for Check In/Out
  const visits = Array.isArray(local?.visits) ? local.visits : [];
  const last = visits[visits.length - 1];
  const inProgress = !!(last && last.in && !last.out); // currently inside

  const allowReentry = !!local?.allowReentry;
  const configuredMax = Number(local?.maxEntries);
  const maxEntries = Number.isFinite(configuredMax)
    ? configuredMax
    : allowReentry
    ? Infinity
    : 1;

  const completedEntries = visits.filter((v) => v.in && v.out).length;

  // If outside, how many entries remain
  const remainingEntries = inProgress
    ? maxEntries === Infinity
      ? Infinity
      : Math.max(0, maxEntries - completedEntries)
    : maxEntries === Infinity
    ? Infinity
    : Math.max(0, maxEntries - completedEntries);

  const canShowCheckControls =
    (role === "admin" || role === "security") &&
    local.status !== "declined" &&
    local.status !== "pending" &&
    (inProgress || remainingEntries > 0);

  const showCheckOut = inProgress;
  const showCheckIn = !inProgress && remainingEntries > 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" />

          {/* Card */}
          <motion.div
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 w-full max-w-2xl mx-4 rounded-lg bg-white shadow-xl border border-slate-200 max-h-[90vh] overflow-auto"
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.18 }}
          >
            {/* Header */}
            <div className="flex items-start justify-between p-4 border-b border-slate-100">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-slate-900 font-medium truncate">
                  <User className="h-4 w-4 text-slate-500 shrink-0" />
                  <span className="truncate">{local.name}</span>
                </div>
                {local.company && (
                  <div className="mt-0.5 flex items-center gap-1.5 text-slate-600 text-xs">
                    <Building2 className="h-3.5 w-3.5 text-slate-400" />
                    <span className="truncate">{local.company}</span>
                  </div>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-md hover:bg-slate-100 active:scale-95"
                aria-label="Close"
              >
                <X className="h-5 w-5 text-slate-600" />
              </button>
            </div>

            {/* Status */}
            <div
              className={`mx-4 mt-3 rounded-md border ${statusCfg.br} ${statusCfg.bg} ${statusCfg.text}`}
            >
              <div className="flex items-center gap-2 px-3 py-2 text-sm">
                {statusCfg.icon}
                <span className="font-medium">{statusCfg.label}</span>
                <span className="ml-auto text-[11px] text-slate-500">
                  Pass Code: {local.code}
                </span>
              </div>
            </div>

            {/* Body */}
            <div className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-[260px,1fr] gap-4">
                {/* Left: QR */}
                <div className="rounded-md border border-slate-200 p-4 flex flex-col items-center">
                  <div className="w-full text-[11px] font-medium text-slate-500">
                    Pass Code
                  </div>
                  <div className="mt-0.5 text-slate-900 text-sm">{local.code}</div>

                  <div className="mt-3 flex items-center justify-center w-full">
                    <div
                      className="bg-white p-3 rounded border border-slate-200"
                      style={{ maxWidth: 216, width: "100%" }}
                    >
                      <div style={{ width: "100%", display: "grid", placeItems: "center" }}>
                        <QRCodeSVG
                          ref={svgRef}
                          value={encodeQR({ id: local.id, code: local.code })}
                          size={qrSize}
                          includeMargin={false}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
                    <button
                      onClick={copyCode}
                      className="inline-flex items-center gap-1.5 px-2.5 py-2 text-sm rounded-md border border-slate-200 hover:bg-slate-50 w-full sm:w-auto justify-center"
                    >
                      <Copy className="h-4 w-4" />
                      Copy Code
                    </button>
                    <button
                      onClick={downloadQR}
                      className="inline-flex items-center gap-1.5 px-2.5 py-2 text-sm rounded-md border border-slate-200 hover:bg-slate-50 w-full sm:w-auto justify-center"
                    >
                      <Download className="h-4 w-4" />
                      Download QR
                    </button>
                  </div>
                </div>

                {/* Right: Details */}
                <div className="space-y-4">
                  {/* Visitor info */}
                  <section className="rounded-md border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                      <User className="h-4 w-4 text-slate-500" />
                      Visitor Information
                    </h3>
                    <div className="mt-2 space-y-2">
                      <div>
                        <div className="text-[11px] text-slate-500">Full Name</div>
                        <div className="text-sm text-slate-900">{local.name}</div>
                      </div>
                      {local.company && (
                        <div>
                          <div className="text-[11px] text-slate-500">Company</div>
                          <div className="text-sm text-slate-900">{local.company}</div>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* Visit details */}
                  <section className="rounded-md border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-slate-500" />
                      Visit Details
                    </h3>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <div className="text-[11px] text-slate-500">Host</div>
                        <div className="text-sm text-slate-900">{local.host}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-500">Purpose</div>
                        <div className="text-sm text-slate-900">{local.purpose || "—"}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-500">Requested</div>
                        <div className="text-sm text-slate-900">
                          {local.requestedAt ? new Date(local.requestedAt).toLocaleString() : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-500">Visit Time</div>
                        <div className="text-sm text-slate-900">
                          {local.requestedVisitAt ? new Date(local.requestedVisitAt).toLocaleString() : "—"}
                        </div>
                      </div>
                      <div className="sm:col-span-2">
                        <div className="text-[11px] text-slate-500">Access Policy</div>
                        <div className="text-sm text-slate-900">
                          {local.allowReentry
                            ? `Re-entry allowed${Number.isFinite(Number(local.maxEntries)) ? ` (max ${local.maxEntries} entries)` : ""}`
                            : local.requestedReentry
                            ? "Re-entry requested (pending approval)"
                            : "Single entry only"}
                          {local.validUntil && (
                            <span className="block text-[11px] text-slate-600 mt-0.5">
                              Valid until: {new Date(local.validUntil).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              </div>

              {/* Visit History */}
              <section className="mt-4 rounded-md border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-slate-500" />
                  Visit History
                </h3>
                {Array.isArray(local.visits) && local.visits.length ? (
                  <div className="mt-2 space-y-2">
                    {local.visits.map((v, i) => (
                      <div
                        key={i}
                        className="flex flex-wrap items-center gap-2 rounded border border-slate-100 px-3 py-2"
                      >
                        <span className="text-[11px] font-medium text-slate-500">#{i + 1}</span>
                        <div className="flex items-center gap-1 text-sm text-slate-800">
                          <LogIn className="h-3.5 w-3.5 text-green-500" />
                          <span>
                            Check-in{" "}
                            {v.in
                              ? new Date(v.in).toLocaleString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "—"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-sm text-slate-800">
                          <LogOut className="h-3.5 w-3.5 text-slate-500" />
                          <span>
                            Check-out{" "}
                            {v.out
                              ? new Date(v.out).toLocaleString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : local.status === "checked-in" && i === local.visits.length - 1
                              ? "Inside"
                              : "—"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-slate-600">No visits recorded yet</div>
                )}
              </section>

              {/* Footer */}
              <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={copyLink}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border border-slate-200 hover:bg-slate-50"
                  >
                    <Share2 className="h-4 w-4" />
                    Copy Link
                  </button>
                  <button
                    onClick={shareWhatsApp}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border border-slate-200 hover:bg-slate-50"
                  >
                    <Share2 className="h-4 w-4 text-green-600" />
                    WhatsApp
                  </button>
                </div>

                <div className="flex items-center gap-2 flex-wrap mt-2 sm:mt-0">
                  {canShowCheckControls && (
                    <button
                      onClick={doToggleCheck}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                      {showCheckOut ? <LogOut className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
                      {busy ? "Processing..." : showCheckOut ? "Check Out" : "Check In"}
                    </button>
                  )}

                  {local.status === "pending" && (role === "admin" || role === "reception") && (
                    <>
                      <button
                        onClick={() => doDecline("Declined via detail view")}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        <XSquare className="h-4 w-4" />
                        Decline
                      </button>
                      <button
                        onClick={doApprove}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        <CheckSquare className="h-4 w-4" />
                        {busy ? "Approving..." : "Approve"}
                      </button>
                    </>
                  )}

                  <button
                    onClick={onClose}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border border-slate-200 hover:bg-slate-50"
                  >
                    <X className="h-4 w-4" />
                    Close
                  </button>
                </div>
              </div>
            </div>

            {/* Toast */}
            <AnimatePresence>
              {notification && (
                <motion.div
                  className={`pointer-events-none absolute left-1/2 -translate-x-1/2 -top-3 rounded px-3 py-1.5 text-xs shadow-md border ${
                    notification.type === "error"
                      ? "bg-red-50 text-red-700 border-red-200"
                      : "bg-emerald-50 text-emerald-700 border-emerald-200"
                  }`}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                >
                  {notification.msg}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
