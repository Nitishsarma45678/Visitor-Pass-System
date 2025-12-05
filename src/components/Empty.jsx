export default function Empty({ children = "Nothing here yet." }) {
  return (
    <div className="rounded-2xl border border-dashed p-8 text-center text-slate-600">
      {children}
    </div>
  );
}
