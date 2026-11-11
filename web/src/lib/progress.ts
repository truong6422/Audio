// Vị trí nghe dở lưu ở máy (cho khách; người đã đăng nhập dùng thêm để hiện nhanh).
import type { Track } from "@shared/types";
import { local } from "./storage";

const KEY = "kd_progress";
const MAX = 40;

export interface LocalProgress {
  track: Track;
  position: number;
  updatedAt: number; // giây Unix
}

type Store = Record<string, LocalProgress>;

const read = (): Store => local.getJSON<Store>(KEY, {});

export function getProgress(trackId: string): LocalProgress | null {
  return read()[trackId] ?? null;
}

export function saveProgress(track: Track, position: number) {
  const s = read();
  s[track.id] = { track, position: Math.floor(position), updatedAt: Math.floor(Date.now() / 1000) };
  const entries = Object.values(s)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX);
  local.setJSON(KEY, Object.fromEntries(entries.map((e) => [e.track.id, e])));
  window.dispatchEvent(new Event("kd-progress"));
}

export function clearProgress(trackId: string) {
  const s = read();
  if (!s[trackId]) return;
  delete s[trackId];
  local.setJSON(KEY, s);
  window.dispatchEvent(new Event("kd-progress"));
}

export function listProgress(): LocalProgress[] {
  return Object.values(read()).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Đáng hỏi "nghe tiếp" khi đã nghe > 15s và còn > 20s. */
export function isResumable(position: number, duration: number): boolean {
  if (!(position > 15)) return false;
  if (duration > 0 && position > duration - 20) return false;
  return true;
}
