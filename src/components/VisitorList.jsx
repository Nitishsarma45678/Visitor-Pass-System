// src/components/VisitorList.jsx
import Empty from "./Empty.jsx";
import { currentUser } from "@/lib/auth.js";

export default function VisitorList({ visitors, onDelete, onShowQR }) {
  if (!visitors.length) return <Empty>Start by creating a visitor pass.</Empty>;
  const role = currentUser()?.role;

  return (
    <div className="grid gap-3">
      {visitors.map(v => (
        <div key={v.id} className="card flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div>
                <div className="font-semibold">{v.name}</div>
                <div className="text-xs text-slate-500">{v.company}</div>
              </div>
              <div className="text-xs bg-slate-100 px-2 py-1 rounded">{v.code}</div>
            </div>
            <div className="text-sm text-slate-600 mt-2">Host: {v.host} • {v.purpose}</div>
          </div>

          <div className="flex gap-2">
            <button className="btn btn-outline" onClick={() => onShowQR(v)}>QR</button>
            {(role === "admin" || role === "reception") && <button className="btn btn-ghost" onClick={()=>navigator.clipboard?.writeText(`${location.origin}/visit?passId=${v.id}`) && alert("Link copied")}>Link</button>}
            {role === "admin" && <button className="btn btn-outline" onClick={() => onDelete(v.id)}>Delete</button>}
          </div>
        </div>
      ))}
    </div>
  );
}
