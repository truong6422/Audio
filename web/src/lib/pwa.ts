// PWA: đăng ký service worker (chỉ bản production) + giữ sự kiện beforeinstallprompt + đếm số bài đã nghe.
import { useEffect, useState } from "react";
import { local } from "./storage";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const LISTENED_KEY = "kd_listened";
const DISMISS_KEY = "kd_install_dismiss";
const EVT = "kd-install";
const REMIND_AFTER_MS = 21 * 24 * 3600 * 1000;

let deferred: BeforeInstallPromptEvent | null = null;

export function initPwa() {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // tự hiện lời mời kín đáo, không để trình duyệt hiện thanh mặc định
    deferred = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event(EVT));
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    local.set(DISMISS_KEY, String(Date.now() + 10 * 365 * 24 * 3600 * 1000));
    window.dispatchEvent(new Event(EVT));
  });
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }
}

export const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const isIOSSafari = () => {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  // Chrome / Firefox / app nhúng trên iOS không thêm vào MH chính được như Safari.
  return ios && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|FBAN|FBAV|Instagram|Zalo|TikTok|Bytedance|Line\//i.test(ua);
};

/** Ghi nhận đã nghe một bài (≥ 1 phút). */
export function markListened(trackId: string) {
  const ids = local.getJSON<string[]>(LISTENED_KEY, []);
  if (ids.includes(trackId)) return;
  local.setJSON(LISTENED_KEY, [trackId, ...ids].slice(0, 50));
  window.dispatchEvent(new Event(EVT));
}

export function dismissInstall() {
  local.set(DISMISS_KEY, String(Date.now()));
  window.dispatchEvent(new Event(EVT));
}

export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  try {
    await e.prompt();
    const r = await e.userChoice;
    if (r.outcome !== "accepted") dismissInstall();
    return r.outcome === "accepted";
  } catch {
    return false;
  } finally {
    window.dispatchEvent(new Event(EVT));
  }
}

export type InstallMode = "android" | "ios" | null;

function compute(): InstallMode {
  if (isStandalone()) return null;
  if (local.getJSON<string[]>(LISTENED_KEY, []).length < 2) return null;
  const d = Number(local.get(DISMISS_KEY));
  if (Number.isFinite(d) && d > 0 && Date.now() - d < REMIND_AFTER_MS) return null;
  if (deferred) return "android";
  if (isIOSSafari()) return "ios";
  return null;
}

export function useInstallMode(): InstallMode {
  const [mode, setMode] = useState<InstallMode>(compute);
  useEffect(() => {
    const on = () => setMode(compute());
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  return mode;
}
