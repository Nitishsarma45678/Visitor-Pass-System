import { useState } from "react";
import { login } from "@/lib/auth.js";

export default function Login({ onLoggedIn }) {
  const [email, setEmail] = useState("admin@demo");
  const [password, setPassword] = useState("admin");
  const [err, setErr] = useState("");

  function submit(e) {
    e.preventDefault();
    const u = login(email.trim(), password.trim());
    if (!u) return setErr("Invalid credentials");
    onLoggedIn(u);
  }

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm border rounded-2xl p-6 grid gap-3 bg-white">
        <h1 className="text-2xl font-bold">CarePass Login</h1>
        <input className="border rounded-lg px-3 py-2" value={email} onChange={e=>setEmail(e.target.value)} placeholder="email" />
        <input type="password" className="border rounded-lg px-3 py-2" value={password} onChange={e=>setPassword(e.target.value)} placeholder="password" />
        {err && <div className="text-sm text-red-600">{err}</div>}
        <button className="rounded-xl px-4 py-2 bg-sky-600 text-white">Sign in</button>
        <div className="text-xs text-slate-500">
          Demo accounts: admin@demo/admin • reception@demo/reception • security@demo/security
        </div>
      </form>
    </div>
  );
}
