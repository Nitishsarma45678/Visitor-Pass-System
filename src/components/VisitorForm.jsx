import { useState } from "react";

export default function VisitorForm({ onCreate }) {
  const [f, setF] = useState({
    name: "", company: "", host: "", purpose: "", notes: "",
    allowReentry: false, maxEntries: 4, validUntil: ""
  });
  const [submitting, setSubmitting] = useState(false);

  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  const disabled =
    submitting ||
    !f.name.trim() || !f.host.trim() || !f.purpose.trim();

  async function handleSubmit(e) {
    e?.preventDefault();
    if (disabled) return;
    setSubmitting(true);
    try {
      await onCreate({
        name: f.name.trim(),
        company: f.company.trim(),
        host: f.host.trim(),
        purpose: f.purpose.trim(),
        notes: f.notes.trim(),
        allowReentry: !!f.allowReentry,
        maxEntries: f.allowReentry ? Number(f.maxEntries || 4) : undefined,
        validUntil: f.allowReentry && f.validUntil ? new Date(f.validUntil).toISOString() : undefined
      });
      setF({ name:"", company:"", host:"", purpose:"", notes:"", allowReentry:false, maxEntries:4, validUntil:"" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="grid gap-3" onSubmit={handleSubmit}>
      {["name","company","host","purpose"].map(k=>(
        <div key={k} className="grid gap-1">
          <label className="text-sm capitalize">{k}</label>
          <input className="border rounded-lg px-3 py-2" value={f[k]} onChange={e=>set(k,e.target.value)} />
        </div>
      ))}

      <div className="grid gap-1">
        <label className="text-sm">notes</label>
        <textarea className="border rounded-lg px-3 py-2" value={f.notes} onChange={e=>set("notes",e.target.value)} />
      </div>

      {/* Re-entry options */}
      <div className="mt-2 grid gap-2 border rounded-xl p-3 bg-slate-50">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={f.allowReentry} onChange={e=>set("allowReentry", e.target.checked)} />
          <span className="text-sm font-medium">Allow re-entry (same day)</span>
        </label>

        {f.allowReentry && (
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="grid gap-1">
              <label className="text-sm">Max entries</label>
              <input type="number" min={1} className="border rounded-lg px-3 py-2"
                     value={f.maxEntries} onChange={e=>set("maxEntries", e.target.value)} />
            </div>
            <div className="grid gap-1">
              <label className="text-sm">Valid until (date & time)</label>
              <input type="datetime-local" className="border rounded-lg px-3 py-2"
                     value={f.validUntil} onChange={e=>set("validUntil", e.target.value)} />
            </div>
          </div>
        )}
      </div>

      <button type="submit" disabled={disabled}
        className="rounded-xl px-4 py-2 bg-sky-600 text-white disabled:opacity-50">
        {submitting ? "Creating…" : "Create Pass"}
      </button>
    </form>
  );
}
