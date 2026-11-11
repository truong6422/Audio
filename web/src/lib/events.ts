// Sự kiện phễu: gom lô rồi POST /api/public/events; rời trang thì gửi bằng sendBeacon. Lỗi mạng bỏ qua êm.
import type { FunnelEvent, FunnelEventType } from "@shared/types";
import { session } from "./storage";

const ENDPOINT = "/api/public/events";
const ATTR_KEY = "kd_attr";
const LANDING_KEY = "kd_landing";
const FLUSH_MS = 4000;
const MAX_BATCH = 20;

export interface Attribution {
  source: string;
  campaign: string;
}

const APP_SOURCES: [RegExp, string][] = [
  [/Bytedance|musical_ly|TikTok|trill/i, "tiktok"],
  [/FBAN|FBAV|FB_IAB|FB4A|FBIOS|Messenger/i, "facebook"],
  [/Instagram/i, "instagram"],
  [/Zalo/i, "zalo"],
];

const REF_SOURCES: [RegExp, string][] = [
  [/tiktok\./i, "tiktok"],
  [/facebook\.|fb\.com|messenger\./i, "facebook"],
  [/instagram\./i, "instagram"],
  [/zalo\./i, "zalo"],
  [/youtube\.|youtu\.be/i, "youtube"],
  [/google\./i, "google"],
];

const clean = (v: string | null | undefined, max = 64) =>
  (v ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-.]/g, "")
    .slice(0, max);

function detectSource(): string {
  const ua = navigator.userAgent;
  for (const [re, s] of APP_SOURCES) if (re.test(ua)) return s;
  try {
    const ref = document.referrer ? new URL(document.referrer) : null;
    if (ref && ref.host !== location.host) {
      for (const [re, s] of REF_SOURCES) if (re.test(ref.hostname)) return s;
    }
  } catch {
    /* bỏ qua */
  }
  return "khac";
}

/** Nguồn + chiến dịch của phiên: chốt ở lần vào đầu (sessionStorage), lần sau đọc lại. */
function initAttribution(): Attribution {
  const saved = session.get(ATTR_KEY);
  if (saved) {
    try {
      const a = JSON.parse(saved) as Attribution;
      if (a && typeof a.source === "string") return a;
    } catch {
      /* bỏ qua */
    }
  }
  const p = new URLSearchParams(location.search);
  const a: Attribution = {
    source: clean(p.get("utm_source")) || clean(p.get("src")) || detectSource(),
    campaign: clean(p.get("utm_campaign"), 120),
  };
  session.set(ATTR_KEY, JSON.stringify(a));
  // Lần vào đầu phiên có UTM → ghi lại để hiện dải chào đúng truyện.
  if (p.get("utm_source") || p.get("utm_campaign")) session.set(LANDING_KEY, JSON.stringify({ path: location.pathname, ...a }));
  return a;
}

const attribution: Attribution = typeof window !== "undefined" ? initAttribution() : { source: "khac", campaign: "" };
export const getAttribution = () => attribution;

/** Thông tin lần vào đầu từ UTM (một lần mỗi phiên), hoặc null. */
export function getLanding(): (Attribution & { path: string }) | null {
  const raw = session.get(LANDING_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Attribution & { path: string };
  } catch {
    return null;
  }
}
export const clearLanding = () => session.set(LANDING_KEY, "");

let queue: FunnelEvent[] = [];
let timer: number | null = null;
const recent = new Map<string, number>();

function send(batch: FunnelEvent[], beacon: boolean) {
  if (!batch.length) return;
  const body = JSON.stringify(batch);
  try {
    if (beacon && navigator.sendBeacon) {
      if (navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }))) return;
    }
    fetch(ENDPOINT, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* bỏ qua */
  }
}

export function flushEvents(beacon = false) {
  if (timer != null) {
    window.clearTimeout(timer);
    timer = null;
  }
  const batch = queue;
  queue = [];
  send(batch, beacon);
}

/** Ghi một sự kiện phễu. Trùng y hệt trong 1,5 giây (StrictMode / bấm đúp) thì bỏ. */
export function trackEvent(type: FunnelEventType, extra: { trackId?: string; checkpointId?: string } = {}) {
  if (typeof window === "undefined" || location.pathname.startsWith("/admin")) return;
  const key = `${type}|${extra.trackId ?? ""}|${extra.checkpointId ?? ""}`;
  const now = Date.now();
  const last = recent.get(key);
  if (last && now - last < 1500) return;
  recent.set(key, now);
  const ev: FunnelEvent = { type, source: attribution.source };
  if (attribution.campaign) ev.campaign = attribution.campaign;
  if (extra.trackId) ev.trackId = extra.trackId;
  if (extra.checkpointId) ev.checkpointId = extra.checkpointId;
  queue.push(ev);
  if (queue.length >= MAX_BATCH) flushEvents();
  else if (timer == null) timer = window.setTimeout(() => flushEvents(), FLUSH_MS);
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => flushEvents(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushEvents(true);
  });
}
