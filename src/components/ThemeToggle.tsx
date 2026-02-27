"use client";

import { useState, useEffect } from "react";

type Theme = "system" | "light" | "dark";

const ICONS: Record<Theme, string> = {
  system: "◑",
  light: "☀",
  dark: "☾",
};

const LABELS: Record<Theme, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const stored = localStorage.getItem("theme") as Theme | null;
    if (stored && (stored === "light" || stored === "dark")) {
      setTheme(stored);
      document.documentElement.setAttribute("data-theme", stored);
    }
    // If "system" or no stored value, remove data-theme so CSS @media takes over
  }, []);

  const cycle = () => {
    const order: Theme[] = ["system", "light", "dark"];
    const next = order[(order.indexOf(theme) + 1) % order.length];
    setTheme(next);

    if (next === "system") {
      document.documentElement.removeAttribute("data-theme");
      localStorage.removeItem("theme");
    } else {
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("theme", next);
    }
  };

  return (
    <button
      onClick={cycle}
      aria-label={`Theme: ${LABELS[theme]}`}
      title={`Theme: ${LABELS[theme]}`}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
      style={{
        backgroundColor: "var(--btn-bg)",
        color: "var(--text-secondary)",
        border: "1px solid var(--border-default)",
      }}
    >
      <span style={{ fontSize: "14px", lineHeight: 1 }}>{ICONS[theme]}</span>
      <span>{LABELS[theme]}</span>
    </button>
  );
}
