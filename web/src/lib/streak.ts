// Chuỗi ngày nghe: một ngày "tính" khi nghe ≥ 5 phút; chuỗi = số ngày liên tiếp tới hôm nay (hoặc hôm qua nếu hôm nay chưa đủ).
import { useEffect, useState } from "react";
import { local } from "./storage";

const KEY = "kd_listen_days";
const EVT = "kd-streak";
export const STREAK_MIN_SECONDS = 300;
const KEEP_DAYS = 120;

type Days = Record<string, number>; // "YYYY-MM-DD" (giờ máy) → giây đã nghe

function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const read = (): Days => local.getJSON<Days>(KEY, {});

export function addListenSeconds(sec: number) {
  if (!(sec > 0)) return;
  const days = read();
  const k = dayKey(new Date());
  const before = days[k] ?? 0;
  days[k] = Math.round((before + sec) * 10) / 10;
  const keys = Object.keys(days).sort();
  for (const old of keys.slice(0, Math.max(0, keys.length - KEEP_DAYS))) delete days[old];
  local.setJSON(KEY, days);
  // Chỉ báo giao diện khi vượt ngưỡng (đỡ vẽ lại).
  if (before < STREAK_MIN_SECONDS && days[k] >= STREAK_MIN_SECONDS) window.dispatchEvent(new Event(EVT));
}

export interface StreakInfo {
  streak: number; // số ngày liên tiếp
  todaySeconds: number;
  todayDone: boolean;
}

export function getStreak(): StreakInfo {
  const days = read();
  const d = new Date();
  const todaySeconds = days[dayKey(d)] ?? 0;
  const todayDone = todaySeconds >= STREAK_MIN_SECONDS;
  if (!todayDone) d.setDate(d.getDate() - 1);
  let streak = 0;
  while ((days[dayKey(d)] ?? 0) >= STREAK_MIN_SECONDS) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return { streak, todaySeconds, todayDone };
}

export function useStreak(): StreakInfo {
  const [info, setInfo] = useState(getStreak);
  useEffect(() => {
    const on = () => setInfo(getStreak());
    window.addEventListener(EVT, on);
    window.addEventListener("kd-progress", on);
    return () => {
      window.removeEventListener(EVT, on);
      window.removeEventListener("kd-progress", on);
    };
  }, []);
  return info;
}
