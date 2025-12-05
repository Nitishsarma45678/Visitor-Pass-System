// Flattens each visit so multiple IN/OUT cycles become multiple rows.
// If a pass has no visits, exports a single "created" row.
export function passesToRows(passes = []) {
  const rows = [];
  for (const p of passes) {
    const base = {
      Code: p.code,
      Name: p.name,
      Company: p.company || "",
      Host: p.host || "",
      Purpose: p.purpose || "",
      Status: p.status || "created",
      "Created At": p.createdAt || "",
      "Allow Reentry": p.allowReentry ? "Yes" : "No",
      "Max Entries": p.allowReentry ? (p.maxEntries ?? "") : "",
      "Valid Until": p.validUntil || "",
    };
    const visits = Array.isArray(p.visits) && p.visits.length ? p.visits : [ { in: p.checkInAt || "", out: p.checkOutAt || "" } ];
    for (const v of visits) {
      rows.push({ ...base, "Check-in": v.in || "", "Check-out": v.out || "" });
    }
  }
  return rows;
}

export function toCSV(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (s) => {
    const v = s == null ? "" : String(s);
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map(h => esc(r[h])).join(","));
  return lines.join("\n");
}

export function downloadCSV(filename, csvText) {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
