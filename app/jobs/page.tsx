export default function JobsPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      <h1 className="text-4xl font-bold">Jobs</h1>

      <p className="mt-2 text-slate-400">
        Manage all jobs for JR Electrical Services.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">Active Jobs</h2>
          <p className="mt-4 text-4xl font-bold">0</p>
        </div>

        <div className="rounded-xl bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">Scheduled This Week</h2>
          <p className="mt-4 text-4xl font-bold">0</p>
        </div>

        <div className="rounded-xl bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">Completed This Month</h2>
          <p className="mt-4 text-4xl font-bold">0</p>
        </div>
      </div>

      <button className="mt-8 rounded-xl bg-cyan-500 px-6 py-3 font-semibold text-slate-950 hover:bg-cyan-400">
        + Create New Job
      </button>
    </main>
  );
}