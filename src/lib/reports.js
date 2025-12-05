// src/lib/reports.js
import { getAllPasses } from "@/lib/storage.js";

/**
 * reports.js
 * - Helpers to compute dashboard metrics and filtered lists
 */

/** convert ISO date to start-of-day timestamp */
function startOfDay(ts) {
  const d = ts ? new Date(ts) : new Date();
  d.setHours(0,0,0,0);
  return d.getTime();
}

/** convert to end-of-day timestamp */
function endOfDay(ts) {
  const d = ts ? new Date(ts) : new Date();
  d.setHours(23,59,59,999);
  return d.getTime();
}

/** parse range: { from: ISO|null, to: ISO|null } -> numeric bounds */
function rangeBounds(range) {
  if (!range) return [0, Date.now()];
  const from = range.from ? new Date(range.from).getTime() : 0;
  const to = range.to ? new Date(range.to).getTime() : Date.now();
  return [from, to];
}

/** returns all passes optionally filtered by date-range on requestedAt (or fallback) */
export async function fetchPassesFiltered(range = null) {
  const list = await getAllPasses();
  if (!range || (!range.from && !range.to)) return list.slice();
  const [from, to] = rangeBounds(range);
  return list.filter(p => {
    // consider requestedAt (creation) or approvedAt as the pass's "date"
    const t = p.requestedAt || p.approvedAt || p.createdAt || null;
    if (!t) return false;
    const ts = new Date(t).getTime();
    return ts >= from && ts <= to;
  });
}

/**
 * compute dashboard metrics for a given date-range
 * returns:
 * {
 *  totalPasses, pending, checkedIn, createdInRange,
 *  visitsByHour: [{hour, value}], topHosts: [{host, count}],
 *  recent: [passes sorted by requestedAt desc]
 * }
 */
export async function computeDashboard(range = null) {
  const all = await getAllPasses();
  const [from, to] = rangeBounds(range);
  const metrics = {
    totalPasses: all.length,
    pending: 0,
    checkedIn: 0,
    createdInRange: 0,
    visitsByHour: Array.from({ length: 24 }).map((_, i) => ({ hour: String(i).padStart(2,"0"), value: 0 })),
    topHosts: {},
    recent: []
  };

  for (const p of all) {
    const status = p.status || "created";
    if (status === "pending") metrics.pending++;
    if (status === "checked-in") metrics.checkedIn++;

    const createdAt = p.requestedAt ? new Date(p.requestedAt).getTime() : null;
    if (createdAt && createdAt >= from && createdAt <= to) metrics.createdInRange++;

    // visits array: count in-range and bucket by hour
    if (Array.isArray(p.visits)) {
      for (const v of p.visits) {
        if (v.in) {
          const t = new Date(v.in).getTime();
          if (t >= from && t <= to) {
            const hr = new Date(t).getHours();
            metrics.visitsByHour[hr].value += 1;
          }
        }
      }
    }

    // track hosts count (for topHosts)
    const host = p.host || "—";
    metrics.topHosts[host] = (metrics.topHosts[host] || 0) + 1;

    // recent activity: track created/requested/approved/checkin/checkout as separate entries
    if (p.requestedAt) metrics.recent.push({ type: "requested", at: p.requestedAt, pass: p });
    if (p.approvedAt) metrics.recent.push({ type: "approved", at: p.approvedAt, pass: p });
    if (p.declinedAt) metrics.recent.push({ type: "declined", at: p.declinedAt, pass: p });
    if (p.checkInAt) metrics.recent.push({ type: "check-in", at: p.checkInAt, pass: p });
    if (p.checkOutAt) metrics.recent.push({ type: "check-out", at: p.checkOutAt, pass: p });
  }

  // convert topHosts object to sorted array
  const topHostsArr = Object.entries(metrics.topHosts).map(([host, count]) => ({ host, count }))
    .sort((a,b) => b.count - a.count)
    .slice(0, 6); // top 6
  metrics.topHosts = topHostsArr;

  // sort recent descending and keep top 20
  metrics.recent = metrics.recent
    .filter(r => r.at)
    .sort((a,b) => new Date(b.at) - new Date(a.at))
    .slice(0, 20);

  // visits chart data already shaped
  metrics.visitsChart = metrics.visitsByHour.map(h => ({ hour: h.hour, value: h.value }));

  return metrics;
}
