import localforage from "localforage";

localforage.config({ name: "carepass", storeName: "visitor_passes" });
const KEY = "passes";

export async function getAllPasses() {
  return (await localforage.getItem(KEY)) ?? [];
}
export async function saveAllPasses(list) {
  await localforage.setItem(KEY, list);
}
export async function addPass(pass) {
  const list = await getAllPasses();
  list.unshift(pass);
  await saveAllPasses(list);
  return pass;
}
export async function updatePass(id, patch) {
  const list = await getAllPasses();
  const i = list.findIndex(p => p.id === id);
  if (i > -1) {
    list[i] = { ...list[i], ...patch };
    await saveAllPasses(list);
    return list[i];
  }
  return null;
}
export async function deletePass(id) {
  const list = await getAllPasses();
  await saveAllPasses(list.filter(p => p.id !== id));
}

export function ensureVisitFields(p) {
  return {
    checkInAt: null,
    checkOutAt: null,
    status: "created",
    allowReentry: false,
    maxEntries: 1,
    validUntil: null,
    visits: [],
    ...p,
  };
}

export async function getPassByCode(codeOrPayload) {
  if (!codeOrPayload) return null;
  let normalized = String(codeOrPayload).trim();

  // If payload looks like JSON, try to parse and extract code or id
  try {
    if (normalized.startsWith("{") || normalized.startsWith("[")) {
      const parsed = JSON.parse(normalized);
      if (parsed && (parsed.code || parsed.id)) {
        normalized = String(parsed.code || parsed.id).trim();
      }
    } else {
      // sometimes scanners pass entire object as a JS object rather than string
      // handle that case where codeOrPayload may be an object
      if (typeof codeOrPayload === "object" && codeOrPayload !== null) {
        const objCode = codeOrPayload.code || codeOrPayload.id;
        if (objCode) normalized = String(objCode).trim();
      }
    }
  } catch (e) {
    // ignore parse errors — keep normalized as-is
  }

  const list = await getAllPasses();
  return list.find(p => String(p.code).trim() === normalized || String(p.id || "").trim() === normalized) || null;
}

function nowISO() { return new Date().toISOString(); }
function isExpired(pass) {
  if (!pass.validUntil) return false;
  return Date.now() > new Date(pass.validUntil).getTime();
}
function entriesCount(pass) {
  return Array.isArray(pass.visits) ? pass.visits.length : 0;
}
function lastVisit(pass) {
  if (!pass.visits?.length) return null;
  return pass.visits[pass.visits.length - 1];
}
function canCheckIn(pass) {
  // If pass isn't approved (created) and re-entry isn't allowed, deny
  if (pass.status === "pending" || pass.status === "declined") return false;
  // single-use
  if (!pass.allowReentry) {
    return pass.status === "created";
  }
  // re-entry allowed
  if (isExpired(pass)) return false;
  const count = entriesCount(pass);
  const limit = Number(pass.maxEntries || 1);
  if (count >= limit && lastVisit(pass)?.out) return false; // no slots left
  if (pass.status === "checked-in") return false; // already inside
  return true;
}


export async function toggleCheck(passId) {
  const rec = await updatePass(passId, {}); // read current (updatePass returns the record)
  if (!rec) return null;

  // hydrate defaults for older records
  const cur = ensureVisitFields(rec);

  // Block explicitly for pending/declined
  if (cur.status === "pending") {
    return { ...cur, _blocked: true, _reason: "pending" };
  }
  if (cur.status === "declined") {
    return { ...cur, _blocked: true, _reason: "declined" };
  }

  // CASE 1: currently outside → try to check-in
  if (cur.status !== "checked-in") {
    if (!canCheckIn(cur)) {
      // Prefer a clear reason: expired vs limit/single-use vs not allowed
      const reason = isExpired(cur) ? "expired" : "limit-or-single-use";
      return { ...cur, _blocked: true, _reason: reason };
    }
    const visit = { in: nowISO(), out: null };
    const visits = Array.isArray(cur.visits) ? [...cur.visits, visit] : [visit];
    return updatePass(passId, {
      status: "checked-in",
      checkInAt: visit.in,
      checkOutAt: null,
      visits,
    });
  }

  // CASE 2: currently inside → check-out
  const visits = Array.isArray(cur.visits) ? [...cur.visits] : [];
  if (visits.length) {
    const i = visits.length - 1;
    if (!visits[i].out) visits[i].out = nowISO();
  }
  return updatePass(passId, {
    status: "checked-out",
    checkOutAt: visits[visits.length - 1]?.out || nowISO(),
    visits,
  });
}

// call this to approve a pending pass (reception sets policy)
export async function approvePass(passId, { allowReentry = false, maxEntries = 1, validUntil = null, approver = null } = {}) {
  const patch = {
    status: "created",
    allowReentry: !!allowReentry,
    maxEntries: Number(maxEntries || 1),
    validUntil: validUntil ? new Date(validUntil).toISOString() : null,
    approvedAt: new Date().toISOString(),
    approvedBy: approver || null,
  };
  return updatePass(passId, patch);
}

export async function declinePass(passId, { reason = null, decliner = null } = {}) {
  const patch = {
    status: "declined",
    declinedAt: new Date().toISOString(),
    declinedBy: decliner || null,
    declineReason: reason || null,
  };
  return updatePass(passId, patch);
}
