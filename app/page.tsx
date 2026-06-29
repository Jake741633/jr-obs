const menuItems = [
  "Dashboard",
  "Jobs",
  "Customers",
  "Builders",
  "Quotes",
  "Invoices",
  "Surveys",
  "Materials",
  "Job Packs",
  "Staff",
  "AI",
  "Business",
  "Settings",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 border-r border-slate-800 bg-slate-900 p-6 lg:block">
          <h1 className="text-2xl font-bold">JR OS</h1>
          <p className="mt-1 text-sm text-slate-400">Electrical Business Suite</p>

          <nav className="mt-8 space-y-2">
            {menuItems.map((item) => (
              <button
                key={item}
                className="w-full rounded-xl px-4 py-3 text-left text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                {item}
              </button>
            ))}
          </nav>
        </aside>

        <section className="flex-1">
          <header className="border-b border-slate-800 bg-slate-950 px-6 py-5">
            <p className="text-sm text-cyan-400">Owner Dashboard</p>
            <h2 className="text-3xl font-bold">Welcome back, Jake</h2>
          </header>

          <div className="p-6">
            <div className="grid gap-4 md:grid-cols-4">
              {[
                ["Today&apos;s Jobs", "3"],
                ["Open Quotes", "7"],
                ["Unpaid Invoices", "£3,280"],
                ["PAYE Readiness", "74%"],
              ].map(([title, value]) => (
                <div key={title} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                  <p className="text-sm text-slate-400">{title}</p>
                  <p className="mt-3 text-3xl font-bold">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 lg:col-span-2">
                <h3 className="text-xl font-semibold">Quick Actions</h3>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    "New Quote",
                    "New Job",
                    "New Survey",
                    "Office Checklist",
                    "Material Order",
                    "Create Job Pack",
                  ].map((item) => (
                    <button key={item} className="rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950">
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-6">
                <h3 className="text-xl font-semibold text-cyan-300">AI Business Coach</h3>
                <p className="mt-4 text-sm leading-6 text-slate-300">
                  JR OS will learn from jobs, quotes, materials and invoices to help you grow.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}