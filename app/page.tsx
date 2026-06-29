export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800 bg-slate-950 px-6 py-5">
        <p className="text-sm text-cyan-400">Owner Dashboard</p>
        <h2 className="text-3xl font-bold">Welcome back, Jake</h2>
      </header>

      <div className="p-6">
        <div className="grid gap-4 md:grid-cols-4">
          {[
            ["Today's Jobs", "3"],
            ["Open Quotes", "7"],
            ["Unpaid Invoices", "£3,280"],
            ["PAYE Readiness", "74%"],
          ].map(([title, value]) => (
            <div
              key={title}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-5"
            >
              <p className="text-sm text-slate-400">{title}</p>
              <p className="mt-3 text-3xl font-bold">{value}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}