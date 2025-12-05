// src/lib/time.js
export function fmt(ts) {
  if (!ts) return "";
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}
