// src/pages/CreatePass.jsx
import { useEffect, useMemo, useState } from "react";
import { addPass } from "@/lib/storage.js";
import { uid, humanCode } from "@/lib/ids.js";
import { encodeQR } from "@/lib/qr.js";
import { QRCodeSVG } from "qrcode.react";
import { motion } from "framer-motion";
import { Send, Check, X, FilePlus, User, Building, Clock, Calendar } from "lucide-react";
import { currentUser } from "@/lib/auth.js";

function broadcastNew(pass) {
  const payload = { type: "new-pass", id: pass.id, name: pass.name, requestedAt: pass.requestedAt };
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const bc = new BroadcastChannel("carepass");
      bc.postMessage(payload);
      bc.close();
    } else {
      localStorage.setItem("carepass:new", JSON.stringify(payload));
      setTimeout(() => localStorage.removeItem("carepass:new"), 500);
    }
  } catch (e) {
    console.debug("broadcast error", e);
  }
}

export default function CreatePass() {
  const [form, setForm] = useState({
    name: "",
    company: "",
    host: "",
    purpose: "",
    date: "",
    time: "",
    allowReentry: false,
    maxEntries: 1,
  });

  const [touched, setTouched] = useState({});
  const [creating, setCreating] = useState(false);
  const [success, setSuccess] = useState(null);
  const [globalError, setGlobalError] = useState("");

  const me = currentUser();
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }));

  const errors = useMemo(() => {
    const e = {};
    const name = (form.name || "").trim();
    const host = (form.host || "").trim();
    const company = (form.company || "").trim();
    const purpose = (form.purpose || "").trim();

    if (!name) e.name = "Please enter visitor name";
    else if (/\d/.test(name)) e.name = "Name should not contain digits";
    else if (name.length < 2) e.name = "Name too short";

    if (!host) e.host = "Please enter host name";
    if (company && company.length > 60) e.company = "Company name too long";
    if (purpose && purpose.length > 120) e.purpose = "Purpose too long";

    if (form.date || form.time) {
      if (form.time && !form.date) {
        e.date = "Please select a date for the preferred time";
      } else if (form.date) {
        const iso = form.date + "T" + (form.time || "00:00");
        const dt = new Date(iso);
        if (isNaN(dt.getTime())) {
          e.date = "Invalid date/time";
        } else if (dt.getTime() + 60_000 < Date.now()) {
          e.date = "Preferred time cannot be in the past";
        }
      }
    }

    if (form.allowReentry) {
      const n = Number(form.maxEntries);
      if (!n || n < 1) e.maxEntries = "Enter valid max entries (≥1)";
      else if (n > 100) e.maxEntries = "Max entries seems too large";
    }

    return e;
  }, [form]);

  function markTouched(field) {
    setTouched(t => ({ ...t, [field]: true }));
  }

  function FieldError({ field }) {
    const msg = touched[field] && errors[field] ? errors[field] : "";
    return (
      <div className="min-h-4 mt-1 text-sm" aria-live="polite" role="status">
        {msg ? <span className="text-red-600">{msg}</span> : <span className="opacity-0">placeholder</span>}
      </div>
    );
  }

  async function submit(e) {
    e?.preventDefault();
    setTouched({ name: true, host: true, date: true, maxEntries: true, purpose: true, company: true });
    if (Object.keys(errors).length) return setGlobalError("Please fix the errors above");
    if (creating) return;

    setCreating(true);
    setGlobalError("");

    try {
      const id = uid();
      const code = humanCode();
      const requestedAt = new Date().toISOString();

      let status = "pending";
      let approvedAt = null;
      let approvedBy = null;
      if (me && (me.role === "admin" || me.role === "reception")) {
        status = "created";
        approvedAt = new Date().toISOString();
        approvedBy = me.name || me.email || me.role;
      }

      const requestedVisitAt =
        form.date && (form.time || form.time === "")
          ? new Date(`${form.date}T${form.time || "00:00"}`).toISOString()
          : null;

      const pass = {
        id,
        code,
        name: form.name.trim(),
        company: (form.company || "").trim(),
        host: form.host.trim(),
        purpose: (form.purpose || "").trim(),
        requestedAt,
        requestedVisitAt,
        requestedReentry: !!form.allowReentry,
        allowReentry: !!form.allowReentry,
        maxEntries: form.allowReentry ? Number(form.maxEntries || 1) : 1,
        status,
        visits: [],
        approvedAt,
        approvedBy,
      };

      await addPass(pass);
      if (pass.status === "pending") broadcastNew(pass);
      setSuccess(pass);

      setForm({
        name: "",
        company: "",
        host: form.host,
        purpose: "",
        date: "",
        time: "",
        allowReentry: false,
        maxEntries: 1,
      });

      setTouched({});
    } catch (err) {
      console.error(err);
      setGlobalError("Could not create pass — try again");
    } finally {
      setCreating(false);
      setTimeout(() => setSuccess(null), 45_000);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="mx-auto w-full max-w-6xl"
    >
      {/* Page header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Create Visitor Pass</h2>
          <p className="text-sm text-slate-500">Register a visitor and generate a QR pass.</p>
        </div>
        <div className="text-sm text-slate-600 inline-flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
          <FilePlus size={16} /> New visitor
        </div>
      </div>

      {/* Shell: left form, right preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Form card */}
        <form onSubmit={submit} className="lg:col-span-2">
          <motion.div
            layout
            className="rounded-xl border border-slate-200 bg-white shadow-sm"
          >
            {/* Section: Basics */}
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">Visitor details</h3>
              <p className="text-xs text-slate-500 mt-0.5">Who is visiting and who they’re meeting.</p>
            </div>

            <div className="px-5 py-5 grid gap-5 sm:grid-cols-2">
              {/* Visitor name */}
              <div className="grid gap-1.5">
                <label className="text-sm font-medium">Visitor name</label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                    <User size={18} />
                  </span>
                  <input
                    className={`w-full rounded-lg border bg-white px-9 py-2 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-4 ring-slate-100 transition ${
                      touched.name && errors.name ? "border-red-300 focus:ring-red-100" : "border-slate-200 focus:ring-slate-100"
                    }`}
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    onBlur={() => markTouched("name")}
                    placeholder="e.g. Leela Das"
                    aria-invalid={!!(touched.name && errors.name)}
                  />
                </div>
                <FieldError field="name" />
              </div>

              {/* Host */}
              <div className="grid gap-1.5">
                <label className="text-sm font-medium">Host</label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                    <Building size={18} />
                  </span>
                  <input
                    className={`w-full rounded-lg border bg-white px-9 py-2 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-4 ring-slate-100 transition ${
                      touched.host && errors.host ? "border-red-300 focus:ring-red-100" : "border-slate-200 focus:ring-slate-100"
                    }`}
                    value={form.host}
                    onChange={(e) => set("host", e.target.value)}
                    onBlur={() => markTouched("host")}
                    placeholder="Host name (required)"
                    aria-invalid={!!(touched.host && errors.host)}
                  />
                </div>
                <FieldError field="host" />
              </div>

              {/* Company */}
              <div className="grid gap-1.5">
                <label className="text-sm font-medium">Company (optional)</label>
                <input
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-4 ring-slate-100 transition"
                  value={form.company}
                  onChange={(e) => set("company", e.target.value)}
                  onBlur={() => markTouched("company")}
                  placeholder="Optional company"
                />
                <FieldError field="company" />
              </div>

              {/* Purpose */}
              <div className="grid gap-1.5">
                <label className="text-sm font-medium">Purpose</label>
                <input
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-4 ring-slate-100 transition"
                  value={form.purpose}
                  onChange={(e) => set("purpose", e.target.value)}
                  onBlur={() => markTouched("purpose")}
                  placeholder="Meeting, delivery, maintenance…"
                />
                <FieldError field="purpose" />
              </div>
            </div>

            {/* Section: Schedule */}
            <div className="px-5 py-4 border-t border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">Schedule</h3>
              <p className="text-xs text-slate-500 mt-0.5">Optional preferred visit date and time.</p>
            </div>

            <div className="px-5 pb-5 grid gap-4">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <div className="flex items-center gap-2 w-full sm:max-w-xs">
                  <Calendar size={16} className="text-slate-400" />
                  <input
                    type="date"
                    className={`w-full rounded-lg border bg-white px-3 py-2 shadow-sm focus:outline-none focus:ring-4 transition ${
                      touched.date && errors.date ? "border-red-300 focus:ring-red-100" : "border-slate-200 focus:ring-slate-100"
                    }`}
                    value={form.date}
                    onChange={(e) => set("date", e.target.value)}
                    onBlur={() => markTouched("date")}
                  />
                </div>
                <div className="flex items-center gap-2 w-full sm:w-40">
                  <Clock size={16} className="text-slate-400" />
                  <input
                    type="time"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm focus:outline-none focus:ring-4 ring-slate-100 transition"
                    value={form.time}
                    onChange={(e) => set("time", e.target.value)}
                    onBlur={() => markTouched("date")}
                  />
                </div>
              </div>
              <FieldError field="date" />
            </div>

            {/* Section: Policy */}
            <div className="px-5 py-4 border-t border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">Re-entry policy</h3>
              <p className="text-xs text-slate-500 mt-0.5">Receptionist can approve and adjust later.</p>
            </div>

            <div className="px-5 pb-5 grid gap-2">
              <div className="flex flex-wrap items-center gap-4">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.allowReentry}
                    onChange={(e) => set("allowReentry", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-slate-700 focus:ring-2 focus:ring-slate-300"
                  />
                  <span className="text-sm">Allow re-entry</span>
                </label>

                {form.allowReentry && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      className={`w-28 rounded-lg border bg-white px-3 py-2 shadow-sm focus:outline-none focus:ring-4 transition ${
                        touched.maxEntries && errors.maxEntries ? "border-red-300 focus:ring-red-100" : "border-slate-200 focus:ring-slate-100"
                      }`}
                      value={form.maxEntries}
                      onChange={(e) => set("maxEntries", e.target.value)}
                      onBlur={() => markTouched("maxEntries")}
                    />
                    <div className="text-xs text-slate-500">entries</div>
                  </div>
                )}
              </div>
              <FieldError field="maxEntries" />
            </div>

            {/* Actions */}
            <div className="px-5 py-4 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="min-h-[1.25rem]">
                {globalError && <div className="text-sm text-red-600">{globalError}</div>}
                {success && (
                  <div className="text-sm text-green-700 inline-flex items-center gap-2">
                    <Check size={16} /> Pass created •{" "}
                    <span className="font-mono bg-green-50 border border-green-200 px-2 py-0.5 rounded">{success.code}</span>
                    <span className="text-xs text-slate-500 ml-2">Status: {success.status}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-100"
                  onClick={() => {
                    setForm({
                      name: "",
                      company: "",
                      host: "",
                      purpose: "",
                      date: "",
                      time: "",
                      allowReentry: false,
                      maxEntries: 1,
                    });
                    setTouched({});
                    setGlobalError("");
                  }}
                  disabled={creating}
                >
                  <X size={14} /> Clear
                </button>

<button
  type="submit"
  className={`inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-600 focus:outline-none focus:ring-4 focus:ring-sky-300 ${
    creating ? "opacity-80 pointer-events-none" : ""
  }`}
  onClick={submit}
  disabled={creating || Object.keys(errors).length > 0}
>
  {creating ? "Creating…" : <>Create pass <Send size={14} /></>}
</button>

              </div>
            </div>
          </motion.div>
        </form>

        {/* Right: Preview / Success panel */}
        <div className="lg:col-span-1">
          <motion.aside
            layout
            className="lg:sticky lg:top-6 rounded-xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">Pass preview</h3>
              <p className="text-xs text-slate-500 mt-0.5">Appears after creation.</p>
            </div>

            <div className="px-5 py-6">
              {!success ? (
                <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                  Fill the form and create a pass to see the QR preview here.
                </div>
              ) : (
                <div className="flex items-start gap-4">
                  <div className="bg-white px-4 py-3 rounded-lg shadow-sm border border-slate-200">
                    <QRCodeSVG value={encodeQR(success)} size={120} includeMargin />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{success.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Code: <span className="font-mono bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">{success.code}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Status:{" "}
                      <span className={success.status === "pending" ? "text-amber-700" : "text-green-700"}>
                        {success.status}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <button
                        className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-100"
                        onClick={() => {
                          navigator.clipboard?.writeText(success.code).then(() => {
                            setGlobalError("");
                            setTimeout(() => setGlobalError("Code copied to clipboard"), 100);
                            setTimeout(() => setGlobalError(""), 1500);
                          });
                        }}
                      >
                        Copy code
                      </button>
                      <button
                        className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-black focus:outline-none focus:ring-4 focus:ring-slate-300"
                        onClick={() => {
                          navigator.clipboard
                            ?.writeText(`${location.origin}/visit?passId=${encodeURIComponent(success.id)}`)
                            .then(() => {
                              setGlobalError("");
                              setTimeout(() => setGlobalError("Link copied to clipboard"), 100);
                              setTimeout(() => setGlobalError(""), 1500);
                            });
                        }}
                      >
                        Copy link
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.aside>
        </div>
      </div>

      {/* Mobile sticky footer actions hint (optional) */}
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-10 p-3 pointer-events-none">
        <div className="mx-auto max-w-6xl pointer-events-auto">
          <div className="rounded-lg border border-slate-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60 shadow-lg px-3 py-2 text-center text-xs text-slate-600">
            Use the buttons above to clear or create the pass.
          </div>
        </div>
      </div>
    </motion.div>
  );
}
