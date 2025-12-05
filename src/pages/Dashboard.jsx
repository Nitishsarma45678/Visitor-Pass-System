// src/pages/Dashboard.jsx
import { useEffect, useState, useMemo } from "react";
import { computeDashboard, fetchPassesFiltered } from "@/lib/reports.js";
import { passesToRows, toCSV, downloadCSV } from "@/lib/csv.js";
import { QRCodeSVG } from "qrcode.react";
import { encodeQR } from "@/lib/qr.js";
import { currentUser } from "@/lib/auth.js";

// ----------------- Data Normalization Helpers -----------------
function normalizeMetrics(raw = {}) {
  const m = { ...raw };
  const pick = (a, ...candidates) => {
    for (const k of candidates) {
      if (a[k] !== undefined && a[k] !== null) return a[k];
    }
    return undefined;
  };
  const totalPasses = pick(m, "totalPasses", "total_passes", "total", "count") || 0;
  const checkedIn = pick(m, "checkedIn", "checked_in", "checked", "active") || 0;
  const pending = pick(m, "pending", "pendingApproval", "pending_approval", "awaiting") || 0;
  const createdInRange = pick(m, "createdInRange", "created_in_range", "created", "today") || 0;
  const topHosts = pick(m, "topHosts", "top_hosts", "hosts") || [];
  return {
    __raw: raw,
    totalPasses: Number(totalPasses) || 0,
    checkedIn: Number(checkedIn) || 0,
    pending: Number(pending) || 0,
    createdInRange: Number(createdInRange) || 0,
    topHosts,
    ...m,
  };
}

function normalizePass(p = {}) {
  const normalized = { ...p };
  normalized.requestedAt =
    p.requestedAt ?? p.requested_at ?? p.requested ?? p.request_time ?? p.createdAt ?? p.created_at ?? p.created ?? null;
  normalized.createdAt = p.createdAt ?? p.created_at ?? p.created ?? normalized.requestedAt;
  normalized.id = p.id ?? p._id ?? p.passId ?? p.pass_id ?? p.code ?? null;
  normalized.code = p.code ?? p.passCode ?? p.pass_code ?? p.id ?? normalized.id ?? "";
  normalized.name = p.name ?? p.fullName ?? p.full_name ?? p.visitorName ?? p.visitor_name ?? "";
  normalized.host = p.host ?? p.hostName ?? p.host_name ?? "";
  normalized.company = p.company ?? p.org ?? p.company_name ?? "";
  normalized.purpose = p.purpose ?? p.reason ?? "";
  const statusRaw = (p.status ?? p.state ?? p.currentStatus ?? "").toString().toLowerCase();
  const mapStatus = {
    pending: "pending",
    "pending-approval": "pending",
    approved: "approved",
    created: "approved",
    declined: "declined",
    "checked-in": "checked-in",
    checked_in: "checked-in",
    "checked-out": "checked-out",
    checked_out: "checked-out",
    active: "checked-in",
  };
  normalized.status = mapStatus[statusRaw] ?? statusRaw ?? "created";
  return normalized;
}

function ensureMetrics(metrics = {}, passes = []) {
  const m = { ...(metrics || {}) };
  m.createdInRange = Number(m.createdInRange ?? m.created_in_range ?? m.created ?? m.today ?? 0);
  m.totalPasses = Number(m.totalPasses ?? m.total_passes ?? m.total ?? m.count ?? 0);
  m.checkedIn = Number(m.checkedIn ?? m.checked_in ?? m.active ?? 0);
  m.pending = Number(m.pending ?? m.pendingApproval ?? m.pending_approval ?? 0);
  m.topHosts = m.topHosts || m.top_hosts || m.hosts || [];
  return m;
}

// ----------------- End Normalization Helpers -----------------

function timeAgo(ts) {
  if (!ts) return "—";
  const now = Date.now();
  const diff = now - new Date(ts).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function formatDateTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString() + " at " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function StatusBadge({ status }) {
  const styles = {
    pending: "bg-amber-50 text-amber-700 border-amber-100",
    approved: "bg-green-50 text-green-700 border-green-100",
    declined: "bg-red-50 text-red-700 border-red-100",
    "checked-in": "bg-blue-50 text-blue-700 border-blue-100",
    "checked-out": "bg-slate-50 text-slate-700 border-slate-100",
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border ${styles[status] || styles["approved"]}`}>
      {status || "created"}
    </span>
  );
}

// Compute comprehensive events for a pass (including re-entries)
function computeEventsForPass(p) {
  const visits = Array.isArray(p.visits) ? p.visits : (p?.visitHistory || []);
  const approver = p.approver ?? p.approvedBy ?? p.approved_by ?? p.approved;
  const decliner = p.decliner ?? p.declinedBy ?? p.declined_by ?? p.declined;
  const creator = p.createdBy ?? p.creator ?? p.requestedBy ?? p.requested_by;

  const events = [];

  // Pass created/requested
  if (p.requestedAt || p.createdAt) {
    events.push({
      label: `Pass ${creator ? `created by ${creator}` : 'created'}`,
      ts: p.requestedAt ?? p.createdAt,
      type: 'created',
      actor: creator,
    });
  }

  // Approved
  if (p.status !== "pending" && (approver || p.approvedAt || p.approved_at)) {
    events.push({
      label: `Approved by ${approver || "System"}`,
      ts: p.approvedAt ?? p.approved_at ?? p.approvedOn ?? null,
      type: 'approved',
      actor: approver || "System",
    });
  }

  // Declined
  if (p.status === "declined" && (decliner || p.declinedAt || p.declined_at)) {
    events.push({
      label: `Declined by ${decliner || "System"}`,
      ts: p.declinedAt ?? p.declined_at ?? null,
      type: 'declined',
      actor: decliner || "System",
      reason: p.declineReason || p.decline_reason,
    });
  }

  // All visits (check-ins and check-outs)
  if (visits.length) {
    visits.forEach((v, idx) => {
      if (v.in || v.checkIn || v.entered) {
        events.push({
          label: `Checked in ${visits.length > 1 ? `(Visit ${idx + 1})` : ''}`,
          ts: v.in || v.checkIn || v.entered,
          type: 'checkin',
          visitNumber: idx + 1,
        });
      }
      if (v.out || v.checkOut || v.left) {
        events.push({
          label: `Checked out ${visits.length > 1 ? `(Visit ${idx + 1})` : ''}`,
          ts: v.out || v.checkOut || v.left,
          type: 'checkout',
          visitNumber: idx + 1,
        });
      }
    });
  }

  // Sort events by timestamp (most recent first)
  const eventsWithTs = events
    .filter(e => e.ts)
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  return {
    events: eventsWithTs,
    visits,
    creator,
    approver,
    decliner,
    totalVisits: visits.length,
    hasReentries: visits.length > 1,
  };
}

export default function Dashboard() {
  const defaultFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [range, setRange] = useState({
    from: defaultFrom.toISOString().slice(0, 16),
    to: new Date().toISOString().slice(0, 16),
  });

  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [passes, setPasses] = useState([]);
  const [selected, setSelected] = useState(null);

  async function loadAll() {
    setLoading(true);
    try {
      const r = {
        from: range.from ? new Date(range.from).toISOString() : null,
        to: range.to ? new Date(range.to).toISOString() : null,
      };

      const rawMetrics = await computeDashboard(r);
      console.debug("raw metrics:", rawMetrics);

      const list = await fetchPassesFiltered(r);
      console.debug("raw passes (filtered) length:", Array.isArray(list) ? list.length : typeof list, list);

      const normalizedList = (list || []).map((p) => normalizePass(p));
      setPasses(normalizedList);

      const safeMetrics = ensureMetrics(rawMetrics || {}, normalizedList);
      setMetrics(safeMetrics);

    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    const id = setInterval(loadAll, 15000);
    return () => clearInterval(id);
  }, [range.from, range.to]);

  function exportCSV() {
    const rows = passesToRows(passes);
    const csv = toCSV(rows);
    downloadCSV(
      `carepass_export_${new Date().toISOString().slice(0, 10)}.csv`,
      csv
    );
  }

  // Compute events for recent activity display - FILTERED BY DATE RANGE
  const recentEvents = useMemo(() => {
    return (passes || [])
      .slice(0, 6)
      .sort((a, b) => new Date(b.requestedAt || b.createdAt || 0) - new Date(a.requestedAt || a.createdAt || 0))
      .map(p => ({
        ...p,
        ...computeEventsForPass(p)
      }));
  }, [passes]);

  const selectedDetails = useMemo(() => selected ? computeEventsForPass(selected) : null, [selected]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Modern Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between py-4 gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Welcome back, {currentUser()?.name || "Admin"}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Date Range */}
              <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <input
                  type="datetime-local"
                  value={range.from}
                  onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                  className="bg-transparent text-sm border-none focus:outline-none w-40"
                />
                <span className="text-slate-400">→</span>
                <input
                  type="datetime-local"
                  value={range.to}
                  onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                  className="bg-transparent text-sm border-none focus:outline-none w-40"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={loadAll}
                  className="px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 text-sm font-medium transition-colors"
                >
                  <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh
                </button>

                {currentUser()?.role === "admin" && (
                  <button
                    onClick={exportCSV}
                    disabled={passes.length === 0}
                    className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Export
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading && (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
          </div>
        )}

        {/* Empty State */}
        {!loading && passes.length === 0 && (
          <div className="text-center py-20">
            <svg className="w-20 h-20 mx-auto mb-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No passes found</h3>
            <p className="text-slate-500 mb-4">No visitor passes exist in the selected date range.</p>
            <button
              onClick={() => {
                const defaultFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                setRange({
                  from: defaultFrom.toISOString().slice(0, 16),
                  to: new Date().toISOString().slice(0, 16),
                });
              }}
              className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 text-sm font-medium"
            >
              Show Last 30 Days
            </button>
          </div>
        )}

        {/* Dashboard Content */}
        {!loading && passes.length > 0 && (
          <div className="space-y-6">
            {/* Key Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <MetricCard
                title="Total Passes"
                value={passes.length}
                icon="📋"
                subtitle="In selected range"
                color="purple"
              />
              <MetricCard
                title="Checked In"
                value={passes.filter(p => p.status === 'checked-in').length}
                icon="✅"
                subtitle="Currently active"
                color="blue"
              />
              <MetricCard
                title="Pending"
                value={passes.filter(p => p.status === 'pending').length}
                icon="⏳"
                subtitle="Awaiting approval"
                color="amber"
              />
              <MetricCard
                title="Total Visits"
                value={passes.reduce((sum, p) => sum + (p.visits?.length || 0), 0)}
                icon="🔄"
                subtitle="Including re-entries"
                color="green"
              />
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Top Hosts - Takes 1 column */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Top Hosts</h3>
                    <p className="text-sm text-slate-500 mt-1">Most visits in range</p>
                  </div>
                  <div className="w-10 h-10 bg-sky-50 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                </div>

                <div className="space-y-4">
                  {(() => {
                    // Calculate top hosts from filtered passes
                    const hostCounts = {};
                    passes.forEach(p => {
                      if (p.host) {
                        hostCounts[p.host] = (hostCounts[p.host] || 0) + 1;
                      }
                    });
                    const topHosts = Object.entries(hostCounts)
                      .map(([host, count]) => ({ host, count }))
                      .sort((a, b) => b.count - a.count)
                      .slice(0, 5);

                    return topHosts.length > 0 ? (
                      topHosts.map((h, idx) => (
                        <div key={idx} className="flex items-center gap-4">
                          <div
                            className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                              idx === 0
                                ? "bg-yellow-100 text-yellow-700"
                                : idx === 1
                                ? "bg-slate-200 text-slate-700"
                                : idx === 2
                                ? "bg-orange-100 text-orange-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">{h.host}</p>
                            <p className="text-xs text-slate-500">{h.count} visitors</p>
                          </div>
                          <div className="w-16 bg-slate-100 rounded-full h-2">
                            <div
                              className="bg-gradient-to-r from-sky-500 to-sky-600 h-2 rounded-full"
                              style={{
                                width: `${Math.min((h.count / topHosts[0].count) * 100, 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-12 text-slate-400 text-sm">
                        <svg className="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        No host data
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Recent Activity - Detailed Timeline View - Takes 2 columns */}
              <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Recent Activity</h3>
                    <p className="text-sm text-slate-500 mt-1">Latest visitor updates in range</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-xs font-medium text-slate-600">Live</span>
                  </div>
                </div>

                <div className="space-y-4">
                  {recentEvents.map((p) => {
                    const latestEvent = p.events.length > 0 ? p.events[0] : null;

                    return (
                      <div
                        key={p.id}
                        className="flex items-start gap-4 p-4 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-slate-200"
                        onClick={() => setSelected(p)}
                      >
                        {/* Avatar */}
                        <div className="flex-shrink-0 w-11 h-11 bg-gradient-to-br from-sky-500 to-sky-600 rounded-full flex items-center justify-center text-white font-semibold text-base shadow-sm">
                          {p.name?.charAt(0)?.toUpperCase() || "?"}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          {/* Name and Status */}
                          <div className="flex items-center gap-3 mb-1 flex-wrap">
                            <h4 className="text-sm font-semibold text-slate-900">{p.name}</h4>
                            <StatusBadge status={p.status} />
                            {p.hasReentries && (
                              <span className="text-xs px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full border border-purple-200 font-medium">
                                {p.totalVisits} visits
                              </span>
                            )}
                          </div>

                          {/* Host info */}
                          <p className="text-sm text-slate-600 mb-2">
                            <span className="text-slate-500">Host:</span> {p.host} <span className="text-slate-400">• {timeAgo(p.requestedAt ?? p.createdAt)}</span>
                          </p>

                          {/* Timeline event */}
                          {latestEvent && (
                            <div className="flex items-center gap-2 text-sm">
                              <div className="w-1.5 h-1.5 bg-sky-500 rounded-full"></div>
                              <span className="text-slate-700 font-medium">{latestEvent.label}</span>
                              {latestEvent.ts && (
                                <>
                                  <span className="text-slate-400">•</span>
                                  <span className="text-slate-500">{timeAgo(latestEvent.ts)}</span>
                                </>
                              )}
                              {p.events.length > 1 && (
                                <span className="text-xs text-slate-400 ml-2">+{p.events.length - 1} more</span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Arrow */}
                        <svg className="w-5 h-5 text-slate-400 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    );
                  })}
                  {recentEvents.length === 0 && (
                    <div className="text-center py-16 text-slate-400">
                      <svg className="w-16 h-16 mx-auto mb-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-sm font-medium">No recent activity</p>
                      <p className="text-xs mt-1">No activity in selected date range</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Enhanced Visitor Detail Panel */}
      {selected && selectedDetails && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full my-8"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between p-6 border-b border-slate-200">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-sky-500 to-sky-600 rounded-full flex items-center justify-center text-white font-bold text-2xl shadow-lg">
                  {selected.name?.charAt(0)?.toUpperCase() || "?"}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">{selected.name}</h2>
                  <p className="text-sm text-slate-500 mt-1">Pass Code: <span className="font-mono font-semibold">{selected.code}</span></p>
                  {selectedDetails.hasReentries && (
                    <p className="text-xs text-purple-600 font-medium mt-1">🔄 {selectedDetails.totalVisits} total visits (re-entry enabled)</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6 max-h-[calc(100vh-250px)] overflow-y-auto">
              {/* Status and Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Current Status</h3>
                    <StatusBadge status={selected.status} />
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Visitor Information</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between py-2 border-b border-slate-100">
                        <span className="text-slate-500">Company:</span>
                        <span className="font-medium text-slate-900">{selected.company || "—"}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-slate-100">
                        <span className="text-slate-500">Host:</span>
                        <span className="font-medium text-slate-900">{selected.host || "—"}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-slate-100">
                        <span className="text-slate-500">Purpose:</span>
                        <span className="font-medium text-slate-900">{selected.purpose || "—"}</span>
                      </div>
                      {selected.email && (
                        <div className="flex justify-between py-2 border-b border-slate-100">
                          <span className="text-slate-500">Email:</span>
                          <span className="font-medium text-slate-900">{selected.email}</span>
                        </div>
                      )}
                      {selected.phone && (
                        <div className="flex justify-between py-2 border-b border-slate-100">
                          <span className="text-slate-500">Phone:</span>
                          <span className="font-medium text-slate-900">{selected.phone}</span>
                        </div>
                      )}
                      {selectedDetails.creator && (
                        <div className="flex justify-between py-2 border-b border-slate-100">
                          <span className="text-slate-500">Created By:</span>
                          <span className="font-medium text-slate-900">{selectedDetails.creator}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">QR Code</h3>
                    <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4 flex justify-center">
                      <div className="bg-white p-3 rounded-lg shadow-md">
                        <QRCodeSVG value={encodeQR(selected)} size={150} level="H" includeMargin />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Complete Timeline Section */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Complete Activity Timeline ({selectedDetails.events.length} events)
                </h3>
                <div className="space-y-4">
                  {selectedDetails.events.map((event, idx) => {
                    const isLast = idx === selectedDetails.events.length - 1;
                    
                    // Determine icon and color based on event type
                    let icon, bgColor, textColor, borderColor;
                    switch (event.type) {
                      case 'created':
                        icon = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />;
                        bgColor = "bg-slate-100";
                        textColor = "text-slate-600";
                        borderColor = "border-slate-200";
                        break;
                      case 'approved':
                        icon = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />;
                        bgColor = "bg-green-100";
                        textColor = "text-green-600";
                        borderColor = "border-green-200";
                        break;
                      case 'declined':
                        icon = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />;
                        bgColor = "bg-red-100";
                        textColor = "text-red-600";
                        borderColor = "border-red-200";
                        break;
                      case 'checkin':
                        icon = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />;
                        bgColor = "bg-blue-100";
                        textColor = "text-blue-600";
                        borderColor = "border-blue-200";
                        break;
                      case 'checkout':
                        icon = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />;
                        bgColor = "bg-slate-100";
                        textColor = "text-slate-600";
                        borderColor = "border-slate-200";
                        break;
                      default:
                        icon = <circle cx="12" cy="12" r="3" fill="currentColor" />;
                        bgColor = "bg-slate-100";
                        textColor = "text-slate-600";
                        borderColor = "border-slate-200";
                    }

                    return (
                      <div key={idx} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className={`w-10 h-10 ${bgColor} rounded-full flex items-center justify-center border-2 ${borderColor}`}>
                            <svg className={`w-5 h-5 ${textColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              {icon}
                            </svg>
                          </div>
                          {!isLast && <div className="w-0.5 h-full bg-slate-200 mt-2"></div>}
                        </div>
                        <div className={`flex-1 ${!isLast ? 'pb-6' : ''}`}>
                          <p className="text-sm font-semibold text-slate-900">{event.label}</p>
                          <p className="text-xs text-slate-500 mt-1">{formatDateTime(event.ts)}</p>
                          {event.reason && (
                            <p className="text-xs text-red-600 mt-2 bg-red-50 px-2 py-1 rounded">Reason: {event.reason}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Visit Statistics */}
              {selectedDetails.visits.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    Visit History Summary
                  </h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                      <p className="text-purple-500 text-xs mb-1">Total Visits</p>
                      <p className="font-bold text-2xl text-purple-900">{selectedDetails.visits.length}</p>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                      <p className="text-blue-500 text-xs mb-1">Currently</p>
                      <p className="font-bold text-lg text-blue-900">{selected.status === 'checked-in' ? 'On-site' : 'Off-site'}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Additional Details */}
              {(selected.validFrom || selected.validUntil || selected.maxVisits) && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Pass Validity</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {selected.validFrom && (
                      <div className="bg-slate-50 p-3 rounded-lg">
                        <p className="text-slate-500 text-xs mb-1">Valid From</p>
                        <p className="font-medium text-slate-900">{formatDateTime(selected.validFrom)}</p>
                      </div>
                    )}
                    {selected.validUntil && (
                      <div className="bg-slate-50 p-3 rounded-lg">
                        <p className="text-slate-500 text-xs mb-1">Valid Until</p>
                        <p className="font-medium text-slate-900">{formatDateTime(selected.validUntil)}</p>
                      </div>
                    )}
                    {selected.maxVisits && (
                      <div className="bg-slate-50 p-3 rounded-lg">
                        <p className="text-slate-500 text-xs mb-1">Max Visits Allowed</p>
                        <p className="font-medium text-slate-900">{selected.maxVisits}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(selected.code);
                  alert("Pass code copied!");
                }}
                className="px-4 py-2 border-2 border-slate-300 rounded-xl hover:bg-white text-sm font-semibold transition-colors"
              >
                📋 Copy Code
              </button>
              <button
                onClick={() => {
                  const url = `${location.origin}/visit?passId=${encodeURIComponent(selected.id)}`;
                  navigator.clipboard?.writeText(url);
                  alert("Pass link copied!");
                }}
                className="px-4 py-2 border-2 border-slate-300 rounded-xl hover:bg-white text-sm font-semibold transition-colors"
              >
                🔗 Copy Link
              </button>
              <button
                onClick={() => setSelected(null)}
                className="px-6 py-2 bg-gradient-to-r from-sky-600 to-sky-700 text-white rounded-xl hover:from-sky-700 hover:to-sky-800 text-sm font-semibold transition-all shadow-lg shadow-sky-600/30"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* Enhanced Metric Card Component */
function MetricCard({ title, value, icon, subtitle, color }) {
  const colorStyles = {
    purple: "from-purple-500 to-purple-600",
    blue: "from-blue-500 to-blue-600",
    amber: "from-amber-500 to-amber-600",
    green: "from-green-500 to-green-600",
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 bg-gradient-to-br ${colorStyles[color] || colorStyles.blue} rounded-xl flex items-center justify-center text-2xl shadow-lg`}>
          {icon}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-slate-600">{title}</p>
        <p className="text-3xl font-bold text-slate-900 mt-2">{value}</p>
        {subtitle && (
          <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
