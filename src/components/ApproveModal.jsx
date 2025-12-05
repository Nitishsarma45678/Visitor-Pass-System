// src/components/ApproveModal.jsx
import { useEffect, useState } from "react";

/**
 * ApproveModal
 * Props:
 * - passObj: the pass to approve
 * - open: boolean
 * - onClose(): void
 * - onApprove({allowReentry, maxEntries, validUntil}): Promise
 * - onDecline(reason): Promise
 */
export default function ApproveModal({ passObj, open, onClose, onApprove, onDecline }) {
  const [form, setForm] = useState({
    allowReentry: false,
    maxEntries: 1,
    validUntil: ""
  });

  useEffect(() => {
    if (!passObj) return;
    setForm({
      allowReentry: !!passObj.requestedReentry,
      maxEntries: passObj.maxEntries || 1,
      validUntil: passObj.validUntil ? (new Date(passObj.validUntil).toISOString().slice(0,16)) : ""
    });
  }, [passObj]);

  if (!open || !passObj) return null;

  const set = (k, v) => setForm(s => ({ ...s, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg" onClick={(e)=>e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-2">Approve Pass — {passObj.name}</h3>
        <p className="text-sm text-slate-600 mb-4">Requested: {passObj.requestedAt ? new Date(passObj.requestedAt).toLocaleString() : "-"}</p>

        <div className="grid gap-3">
          <label className="text-sm">Allow re-entry</label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={form.allowReentry} onChange={e=>set("allowReentry", e.target.checked)} />
            <span className="text-sm">Enable re-entry for this visitor</span>
          </label>

          {form.allowReentry && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm">Max entries</label>
                <input type="number" min="1" className="border rounded-lg px-3 py-2 w-full" value={form.maxEntries}
                  onChange={e=>set("maxEntries", Number(e.target.value || 1))} />
              </div>
              <div>
                <label className="text-sm">Valid until</label>
                <input type="datetime-local" className="border rounded-lg px-3 py-2 w-full" value={form.validUntil}
                  onChange={e=>set("validUntil", e.target.value)} />
              </div>
            </div>
          )}

          {!form.allowReentry && (
            <div className="text-xs text-slate-500">Single-use pass will be created on approval.</div>
          )}

          <div className="flex gap-2 justify-end mt-4">
            <button className="px-3 py-1.5 border rounded-lg bg-red-600 text-white" onClick={onClose}>Cancel</button>

            <button
              className="px-4 py-1.5 rounded-lg bg-green-600 text-white"
              onClick={async ()=>{
                await onApprove({
                  allowReentry: !!form.allowReentry,
                  maxEntries: Number(form.maxEntries || 1),
                  validUntil: form.validUntil ? new Date(form.validUntil).toISOString() : null
                });
                onClose();
              }}
            >
              Approve
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}