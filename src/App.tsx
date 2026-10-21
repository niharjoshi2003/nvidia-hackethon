import { Link, NavLink, Route, Routes } from "react-router-dom";
import Coach from "./screens/Coach";
import EvidenceSample from "./screens/EvidenceSample";
import History from "./screens/History";
import Overview from "./screens/Overview";
import SettingsScreen from "./screens/Settings";
import { cx } from "./components/ui";

const NAV = [
  { to: "/", label: "Coach", end: true },
  { to: "/history", label: "History", end: false },
  { to: "/overview", label: "Overview", end: false },
  { to: "/settings", label: "Settings", end: false },
];

export default function App() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur">
        <nav className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3">
          <Link
            to="/"
            className="flex items-center gap-2 rounded text-base font-semibold tracking-tight text-zinc-100 hover:text-amber-300"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-amber-400 font-mono text-xs font-bold text-zinc-950">
              60
            </span>
            sixty
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full border border-nv/40 bg-nv/10 px-2.5 py-1 text-xs text-nv lg:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-nv" aria-hidden />
              NVIDIA Nemotron · Nebius Token Factory
            </span>
            <div className="flex items-center gap-0.5 sm:gap-1">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cx(
                      "rounded px-2 py-1 text-sm transition-colors sm:px-2.5",
                      isActive ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200",
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
        <Routes>
          <Route path="/" element={<Coach />} />
          <Route path="/history" element={<History />} />
          <Route path="/history/:id" element={<History />} />
          <Route path="/overview" element={<Overview />} />
          <Route path="/evidence/rag-production-sample" element={<EvidenceSample />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="*" element={<Coach />} />
        </Routes>
      </main>

      <footer className="border-t border-zinc-900 py-5 text-center text-xs text-zinc-600">
        sixty · Personal AI track · Nebius × NVIDIA Global AI Hackathon
      </footer>
    </div>
  );
}
