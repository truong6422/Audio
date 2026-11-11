import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { LockPoint, PublicSiteConfig } from "@shared/types";

declare global {
  interface Window {
    __SITE__?: PublicSiteConfig;
  }
}

const FALLBACK: PublicSiteConfig = {
  brandName: "Kể Đêm Audio",
  siteTitle: "",
  tagline: "Truyện audio cho những đêm dài",
  contactEmail: "",
  gate: null,
  inAppBrowserPrompt: true,
  categories: [],
  defaultOgImage: "",
};

function normalize(c: Partial<PublicSiteConfig> | undefined): PublicSiteConfig {
  const merged: PublicSiteConfig = { ...FALLBACK, ...(c ?? {}) };
  merged.brandName = merged.brandName || FALLBACK.brandName;
  merged.tagline = merged.tagline || FALLBACK.tagline;
  merged.categories = Array.isArray(merged.categories) ? merged.categories.filter((c) => c && c.slug && c.name) : [];
  merged.defaultOgImage = merged.defaultOgImage || "";
  if (merged.gate) {
    const cps: LockPoint[] = [...(merged.gate.checkpoints ?? [])]
      .filter((p) => p && (Number.isFinite(p.fromEp) || (p.atSecond != null && Number.isFinite(p.atSecond))))
      .map((p) => ({ ...p, fromEp: Number.isFinite(p.fromEp) ? p.fromEp : 1 }))
      .sort((a, b) => a.fromEp - b.fromEp);
    const ttl = Number(merged.gate.unlockTtlHours);
    merged.gate = cps.length ? { checkpoints: cps, unlockTtlHours: Number.isFinite(ttl) && ttl > 0 ? ttl : 6 } : null;
  }
  return merged;
}

/** Cấu hình hiện tại (đọc được cả ngoài React). */
let current: PublicSiteConfig = normalize(window.__SITE__);
export const getSite = () => current;

const SiteCtx = createContext<PublicSiteConfig>(current);

export function SiteProvider({ children }: { children: ReactNode }) {
  const [site, setSite] = useState<PublicSiteConfig>(current);
  useEffect(() => {
    if (window.__SITE__) return;
    // Khi dev không có máy chủ chèn cấu hình → hỏi API.
    fetch("/api/public/config", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((c: PublicSiteConfig | null) => {
        if (!c) return;
        current = normalize(c);
        setSite(current);
      })
      .catch(() => {});
  }, []);
  return <SiteCtx.Provider value={site}>{children}</SiteCtx.Provider>;
}

export const useSite = () => useContext(SiteCtx);
