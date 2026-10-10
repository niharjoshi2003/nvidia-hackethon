import { Link, NavLink, Route, Routes } from "react-router-dom";
import Coach from "./screens/Coach";
import EvidenceSample from "./screens/EvidenceSample";
import SettingsScreen from "./screens/Settings";
import { cx } from "./components/ui";

const NAV = [
  { to: "/", label: "Coach", end: true },
  { to: "/settings", label: "Settings", end: false },
];

export default function App() {
  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <nav className="mx-auto flex max-w-3xl items-center justify-between gap-1 px-5 py-3">
          <Link
            to="/"
            className="flex items-center gap-2 rounded text-sm font-semibold tracking-tight text-zinc-100 hover:text-amber-300"
          >
            <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-amber-400 font-mono text-[11px] font-bold text-zinc-950">
              60
            </span>
            sixty
          </Link>
          <div className="flex items-center gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cx(
                    "rounded px-2.5 py-1 text-sm transition-colors",
                    isActive ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8">
        <Routes>
          <Route path="/" element={<Coach />} />
          <Route path="/evidence/rag-production-sample" element={<EvidenceSample />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="*" element={<Coach />} />
        </Routes>
      </main>
    </div>
  );
}
