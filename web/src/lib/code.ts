// Mã số ngắn của truyện (đọc trong clip: "số 123").
import type { Track } from "@shared/types";
import { apiGet } from "../api";

/** "123", "#123", "số 123", "ma so 123" → 123; không phải mã thì null. */
export function parseCode(input: string): number | null {
  const m = input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .match(/^(?:#|ma\s*so\s*|ma\s*|so\s*)?(\d{1,7})$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export async function trackByCode(code: number, signal?: AbortSignal): Promise<Track | null> {
  try {
    const r = await apiGet<{ track: Track | null }>(`/api/public/tracks/by-code/${code}`, signal);
    return r?.track ?? null;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    return null;
  }
}
