"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type PanelTheme = "light" | "dark";

type ThemeContextValue = {
  theme: PanelTheme;
  toggleTheme: () => void;
};

const STORAGE_KEY = "aplismart-motors-panel-theme-v1";
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<PanelTheme>("light");

  // Sincroniza con DOM al montar — una sola vez
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const resolved: PanelTheme =
      stored === "dark" || stored === "light"
        ? stored
        : document.documentElement.classList.contains("dark")
        ? "dark"
        : "light";

    setTheme(resolved);

    if (resolved === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem(STORAGE_KEY, next);
      if (next === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme debe usarse dentro de ThemeProvider");
  return ctx;
}