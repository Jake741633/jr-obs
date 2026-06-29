const menuItems = [
  "Dashboard",
  "Customers",
  "Builders",
  "Jobs",
  "Quotes",
  "Estimates",
  "Invoices",
  "Materials",
  "Surveys",
  "Job Packs",
  "AI",
  "Business",
  "Settings",
];

export default function Sidebar() {
  return (
    <aside className="hidden w-72 border-r border-slate-800 bg-slate-900 p-6 lg:block">
      <h1 className="text-2xl font-bold text-white">JR OS</h1>

      <p className="mt-1 text-sm text-slate-400">
        JR Electrical Business Suite
      </p>

      <nav className="mt-8 space-y-2">
        {menuItems.map((item) => (
          <button
            key={item}
            className="w-full rounded-xl px-4 py-3 text-left text-slate-300 transition hover:bg-slate-800 hover:text-white"
          >
            {item}
          </button>
        ))}
      </nav>
    </aside>
  );
}