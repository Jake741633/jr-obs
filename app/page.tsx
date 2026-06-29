export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8 flex flex-col gap-2">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-400">
            JR Electrical Services
          </p>
          <h1 className="text-4xl font-bold tracking-tight">JR OS Dashboard</h1>
          <p className="text-slate-400">
            AI-powered business suite for quoting, jobs, surveys, materials,
            invoices and growth.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {[
            ["Today&apos;s Jobs", "3", "Jobs scheduled today"],
            ["Open Quotes", "7", "Waiting for approval"],
            ["Unpaid Invoices", "£3,280", "Payments to chase"],
            ["Business Score", "74%", "Leave PAYE readiness"],
          ].map(([title, value, note]) => (
            <div
              key={title}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-lg"
            >
              <p className="text-sm text-slate-400">{title}</p>
              <p className="mt-3 text-3xl font-bold">{value}</p>
              <p className="mt-2 text-sm text-slate-500">{note}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 lg:col-span-2">
            <h2 className="text-xl font-semibold">Quick Actions</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                "New Quote",
                "New Estimate",
                "New Job",
                "New Customer",
                "Office Checklist",
                "Site Survey",
                "Material Order",
                "Create Job Pack",
                "Voice Note",
              ].map((item) => (
                <button
                  key={item}
                  className="rounded-xl bg-cyan-500 px-4 py-3 text-left font-semibold text-slate-950 hover:bg-cyan-400"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-6">
            <h2 className="text-xl font-semibold text-cyan-300">
              AI Business Coach
            </h2>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              Jake, JR OS will learn from your quotes, jobs, surveys and
              invoices to help price work better, manage workload and plan when
              it is safe to leave PAYE.
            </p>
            <button className="mt-6 rounded-xl bg-white px-4 py-3 font-semibold text-slate-950">
              Open AI Coach
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">Owner Lock</h2>
            <p className="mt-3 text-slate-400">
              Pricing, markups, profit, supplier discounts and business
              financials are visible only to the owner.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">Electrician Survey Mode</h2>
            <p className="mt-3 text-slate-400">
              Electricians can submit site surveys, photos and notes without
              seeing customer prices or profit.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}