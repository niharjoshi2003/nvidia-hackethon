import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import Home from "./screens/Home";
import Research from "./screens/Research";
import Explain from "./screens/Explain";
import Review from "./screens/Review";
import Debrief from "./screens/Debrief";
import Progress from "./screens/Progress";
import Library from "./screens/Library";
import SettingsScreen from "./screens/Settings";
import { cx } from "./components/ui";

const NAV = [
  { to: "/", label: "Today" },
  { to: "/library", label: "Library" },
  { to: "/progress", label: "Progress" },
  { to: "/settings", label: "Settings" },
];

export default function App() {
  const { pathname } = useLocation();
  // Explain is deliberately chrome-free: nothing on screen but the timer.
  const bare = pathname.startsWith("/explain");

  return (
    <div className="min-h-full">
      {!bare && (
        <header className="border-b border-zinc-800">
          <nav className="mx-auto flex max-w-3xl items-center gap-1 px-5 py-3">
            <span className="mr-4 text-sm font-semibold tracking-tight text-zinc-100">sixty</span>
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  cx(
                    "rounded px-2.5 py-1 text-sm transition-colors",
                    isActive ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>
      )}

      <main className={cx(!bare && "mx-auto max-w-3xl px-5 py-8")}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/research/:topicId" element={<Research />} />
          <Route path="/explain/:topicId" element={<Explain />} />
          <Route path="/review/:topicId" element={<Review />} />
          <Route path="/debrief/:topicId" element={<Debrief />} />
          <Route path="/library" element={<Library />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
    </div>
  );
}
