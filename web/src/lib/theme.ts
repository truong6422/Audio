import { useCallback, useEffect, useState } from "react";
import { local } from "./storage";

export type Theme = "dark" | "light";

function systemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function readTheme(): Theme {
  const t = local.get("kd_theme");
  return t === "light" || t === "dark" ? t : systemTheme();
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: light)");
    if (!mq) return;
    const onChange = () => {
      if (!local.get("kd_theme")) setTheme(systemTheme());
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const color = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta && color) meta.content = color;
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      local.set("kd_theme", next);
      return next;
    });
  }, []);

  return { theme, toggle };
}
