// src/pages/Visit.jsx
import { useEffect, useState } from "react";
import { uid, humanCode } from "@/lib/ids.js";
import { addPass, getPassByCode, getAllPasses } from "@/lib/storage.js";
import { QRCodeSVG } from "qrcode.react";
import { encodeQR } from "@/lib/qr.js";

/**
 * /visit - public visitor self-register page.
 * Accepts query param: passId=<id> to preview an existing pass (useful for shared links)
 *
 * Enhancements:
 * - Field-level validation (name disallows digits, phone/email validation, host/purpose required)
 * - Date/time validation (not in past, not > 365 days)
 * - Prevent duplicate pending requests for same phone within 30 minutes
 * - Inline errors, focus first invalid field, disable submit when submitting or invalid
 */

const NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ'’.\- ]{2,80}$/; // letters, spaces, some punctuation
const PHONE_RE = /^\+?\d{7,15}$/; // optional +, 7-15 digits
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isISODateTime(s) {
  if (!s) return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}
function toISO(s) { return s ? new Date(s).toISOString() : null; }
function nowISO() { return new Date().toISOString(); }

export default function Visit() {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    company: "",
    host: "",
    purpose: "",
    requestedVisitAt: "",
    requestedReentry: false,
  });

  const [errors, setErrors] = useState({});
  const [created, setCreated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [previewExists, setPreviewExists] = useState(false);

  const set = (k, v) => {
    setForm(s => ({ ...s, [k]: v }));
    setErrors(e => ({ ...e, [k]: undefined }));
  };

  useEffect(() => {
    // if ?passId=... show that pass (read-only)
    const params = new URLSearchParams(window.location.search);
    const passId = params.get("passId");
    if (passId) {
      // try to load by id or code
      (async () => {
        try {
          const p = await getPassByCode(passId);
          if (p) {
            setCreated(p);
            setPreviewExists(true);
          } else {
            setPreviewExists(false);
          }
        } catch (e) {
          console.error(e);
          setPreviewExists(false);
        } finally {
          setLoading(false);
        }
      })();
    } else {
      setLoading(false);
    }
  }, []);

  // Validation function returns { valid, errors }
  function validateForm(values = form) {
    const e = {};

    // name
    if (!values.name || !String(values.name).trim()) {
      e.name = "Name is required.";
    } else if (!NAME_RE.test(String(values.name).trim())) {
      e.name = "Name must be 2–80 letters; numbers and strange symbols are not allowed.";
    }

    // phone
    if (!values.phone || !String(values.phone).trim()) {
      e.phone = "Phone number is required.";
    } else if (!PHONE_RE.test(String(values.phone).trim())) {
      e.phone = "Enter a valid phone (digits only, optional +, 7–15 digits).";
    }

    // email optional
    if (values.email && values.email.trim()) {
      if (!EMAIL_RE.test(String(values.email).trim())) {
        e.email = "Enter a valid email address.";
      }
    }

    // host
    if (!values.host || !String(values.host).trim()) {
      e.host = "Host is required (who you're visiting).";
    } else if (String(values.host).trim().length < 2) {
      e.host = "Host name is too short.";
    }

    // purpose
    if (!values.purpose || String(values.purpose).trim().length < 3) {
      e.purpose = "Purpose is required (at least 3 characters).";
    } else if (String(values.purpose).length > 300) {
      e.purpose = "Purpose is too long.";
    }

    // requestedVisitAt (optional) - when present, must be valid and not in past and not crazy future
    if (values.requestedVisitAt) {
      const iso = values.requestedVisitAt;
      if (!isISODateTime(iso)) {
        e.requestedVisitAt = "Invalid date/time.";
      } else {
        const visitTs = new Date(iso).getTime();
        const now = Date.now();
        if (visitTs + 5 * 60 * 1000 < now) {
          e.requestedVisitAt = "Visit time cannot be in the past.";
        }
        const maxAhead = now + 365 * 24 * 60 * 60 * 1000;
        if (visitTs > maxAhead) {
          e.requestedVisitAt = "Visit date must be within the next year.";
        }
      }
    }

    // requestedReentry - nothing complex here; receptionist will control policy

    return { valid: Object.keys(e).length === 0, errors: e };
  }

  // Focus first invalid field (by name attribute)
  function focusFirstError(errs) {
    if (!errs) return;
    const first = Object.keys(errs)[0];
    if (!first) return;
    const el = document.querySelector(`[name="${first}"]`);
    if (el) el.focus();
  }

  async function handleSubmit(e) {
    e?.preventDefault();

    // validate
    const { valid, errors: vErr } = validateForm(form);
    if (!valid) {
      setErrors(vErr);
      focusFirstError(vErr);
      return;
    }

    setSubmitting(true);
    try {
      // duplicate pending check: same phone pending in last 30 minutes
      try {
        const all = await getAllPasses();
        const recent = (all || []).find(p =>
          p.phone === String(form.phone).trim() &&
          p.status === "pending" &&
          p.requestedAt &&
          (Date.now() - new Date(p.requestedAt).getTime()) < 30 * 60 * 1000
        );
        if (recent) {
          // show a friendly inline-ish error
          setErrors({ phone: "A pending request from this number exists (submitted recently). Please wait or contact reception." });
          focusFirstError({ phone: true });
          setSubmitting(false);
          return;
        }
      } catch (err) {
        // non-fatal: proceed if the duplicate check fails
        console.warn("duplicate check failed", err);
      }

      const pass = {
        id: uid(),
        code: humanCode(),
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: (form.email || "").trim(),
        company: (form.company || "").trim(),
        host: form.host.trim(),
        purpose: (form.purpose || "").trim(),
        requestedAt: nowISO(),
        requestedVisitAt: form.requestedVisitAt ? toISO(form.requestedVisitAt) : null,
        requestedReentry: !!form.requestedReentry,
        status: "pending",
        visits: []
      };

      await addPass(pass);

      // BroadcastChannel if available
      try {
        if (typeof BroadcastChannel !== "undefined") {
          const bc = new BroadcastChannel("carepass");
          bc.postMessage({ type: "new-pass", id: pass.id, name: pass.name, time: new Date().toISOString() });
          bc.close();
        } else {
          // fallback using localStorage event (will fire in other tabs)
          localStorage.setItem("carepass:new", JSON.stringify({ id: pass.id, name: pass.name, t: Date.now() }));
          // cleanup key so repeated writes will still fire
          setTimeout(() => localStorage.removeItem("carepass:new"), 500);
        }
      } catch (e2) {
        console.warn("notify broadcast failed", e2);
      }

      setCreated(pass);
      // clear form errors
      setErrors({});
    } catch (err) {
      console.error(err);
      alert("Error creating request");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="min-h-screen grid place-items-center p-6">Loading…</div>;

  // if preview exists and created is set (previewed pass), show preview card; otherwise show the form
  return (
    <div className="min-h-screen p-6 grid place-items-center">
      <div className="w-full max-w-md bg-white p-6 rounded-2xl border">
        <h2 className="text-xl font-semibold mb-3">Visitor Check-in</h2>

        {!created ? (
          <form className="grid gap-3" onSubmit={handleSubmit} noValidate>
            <div>
              <label className="text-sm">Your name</label>
              <input
                name="name"
                className={`border rounded-lg px-3 py-2 w-full ${errors.name ? "border-red-400" : ""}`}
                value={form.name}
                onChange={e => set("name", e.target.value)}
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? "err-name" : undefined}
                placeholder="Full name"
              />
              {errors.name && <div id="err-name" className="text-red-600 text-sm mt-1">{errors.name}</div>}
            </div>

            <div>
              <label className="text-sm">Phone</label>
              <input
                name="phone"
                className={`border rounded-lg px-3 py-2 w-full ${errors.phone ? "border-red-400" : ""}`}
                value={form.phone}
                onChange={e => set("phone", e.target.value)}
                aria-invalid={!!errors.phone}
                aria-describedby={errors.phone ? "err-phone" : undefined}
                placeholder="+919012345678"
              />
              {errors.phone && <div id="err-phone" className="text-red-600 text-sm mt-1">{errors.phone}</div>}
            </div>

            <div>
              <label className="text-sm">Email (optional)</label>
              <input
                name="email"
                className={`border rounded-lg px-3 py-2 w-full ${errors.email ? "border-red-400" : ""}`}
                value={form.email}
                onChange={e => set("email", e.target.value)}
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? "err-email" : undefined}
                placeholder="you@example.com"
              />
              {errors.email && <div id="err-email" className="text-red-600 text-sm mt-1">{errors.email}</div>}
            </div>

            <div>
              <label className="text-sm">Company (optional)</label>
              <input
                name="company"
                className="border rounded-lg px-3 py-2 w-full"
                value={form.company}
                onChange={e => set("company", e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm">Host (who you are visiting)</label>
              <input
                name="host"
                className={`border rounded-lg px-3 py-2 w-full ${errors.host ? "border-red-400" : ""}`}
                value={form.host}
                onChange={e => set("host", e.target.value)}
                aria-invalid={!!errors.host}
                aria-describedby={errors.host ? "err-host" : undefined}
                placeholder="Host name or department"
              />
              {errors.host && <div id="err-host" className="text-red-600 text-sm mt-1">{errors.host}</div>}
            </div>

            <div>
              <label className="text-sm">Purpose</label>
              <input
                name="purpose"
                className={`border rounded-lg px-3 py-2 w-full ${errors.purpose ? "border-red-400" : ""}`}
                value={form.purpose}
                onChange={e => set("purpose", e.target.value)}
                aria-invalid={!!errors.purpose}
                aria-describedby={errors.purpose ? "err-purpose" : undefined}
                placeholder="Meeting, interview, delivery..."
              />
              {errors.purpose && <div id="err-purpose" className="text-red-600 text-sm mt-1">{errors.purpose}</div>}
            </div>

            <div>
              <label className="text-sm">Preferred visit time (optional)</label>
              <input
                name="requestedVisitAt"
                type="datetime-local"
                className={`border rounded-lg px-3 py-2 w-full ${errors.requestedVisitAt ? "border-red-400" : ""}`}
                value={form.requestedVisitAt}
                onChange={e => set("requestedVisitAt", e.target.value)}
                aria-invalid={!!errors.requestedVisitAt}
                aria-describedby={errors.requestedVisitAt ? "err-visit" : undefined}
              />
              {errors.requestedVisitAt && <div id="err-visit" className="text-red-600 text-sm mt-1">{errors.requestedVisitAt}</div>}
              <div className="text-xs text-slate-500 mt-1">Optional — not required for walk-ins. Time must be in the future.</div>
            </div>

            <label className="inline-flex items-center gap-2 mt-1">
              <input type="checkbox" checked={form.requestedReentry} onChange={e => set("requestedReentry", e.target.checked)} />
              <span className="text-sm">I may need to step out and re-enter</span>
            </label>

            <div className="flex justify-end mt-2">
              <button
                type="submit"
                className="rounded-xl px-4 py-2 bg-sky-600 text-white disabled:opacity-50"
                disabled={submitting}
                aria-disabled={submitting}
              >
                {submitting ? "Submitting…" : "Request Pass"}
              </button>
            </div>
          </form>
        ) : (
          <div className="grid gap-4">
            <div className="text-sm">
              Your request has been submitted and is <strong>{created.status === "pending" ? "pending approval" : created.status}</strong>.
            </div>

            <div className="grid place-items-center">
              <QRCodeSVG value={encodeQR(created)} size={220} includeMargin />
              <div className="text-xs text-slate-500 mt-2">
                {created.status === "pending" ? "This QR is inactive until Reception approves." : "Show this QR to security at the gate."}
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                className="px-3 py-1.5 border rounded-lg"
                onClick={() => {
                  navigator.clipboard?.writeText(created.code).catch(() => {});
                  // friendly inline feedback
                  alert("Code copied");
                }}
              >
                Copy Code
              </button>
              <button
                className="px-3 py-1.5 rounded-lg bg-sky-600 text-white"
                onClick={() => {
                  setCreated(null);
                  setForm({
                    name: "",
                    phone: "",
                    email: "",
                    company: "",
                    host: "",
                    purpose: "",
                    requestedVisitAt: "",
                    requestedReentry: false,
                  });
                  setErrors({});
                }}
              >
                Create Another
              </button>
            </div>
          </div>
        )}
      </div>

      {previewExists && created && created.status !== "pending" && (
        <div className="text-xs mt-3">Note: This page is showing a pass record preview.</div>
      )}
    </div>
  );
}
