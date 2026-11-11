// Tiện ích chữ cho trang quản trị: bỏ dấu, slug, tag, thời gian mm:ss, kiểm email / URL.

/** Chữ thường, bỏ dấu tiếng Việt (giống worker/src/lib.ts fold). */
export function fold(s: string): string {
  return s.toLowerCase().replace(/đ/g, "d").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Slug không dấu nối "-" (khớp slugify phía máy chủ, nhưng rỗng thì trả rỗng). */
export function slugify(s: string): string {
  return fold(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/g, "");
}

/** Tag: chữ thường không dấu nối "-", tối đa 40 ký tự. */
export function normalizeTag(s: string): string {
  return slugify(s).slice(0, 40).replace(/-+$/g, "");
}

/** "90" | "1:30" | "01:02:03" → giây; rỗng → null; sai → NaN. */
export function parseTime(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})$/.exec(s);
  if (!m) return NaN;
  const h = Number(m[1] ?? 0);
  const min = Number(m[2]);
  const sec = Number(m[3]);
  if (sec >= 60 || (m[1] !== undefined && min >= 60)) return NaN;
  return h * 3600 + min * 60 + sec;
}

/** Giây → "m:ss" hoặc "h:mm:ss". */
export function fmtTime(total: number): string {
  const t = Math.max(0, Math.round(total));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/** URL tuyệt đối http(s) hoặc đường dẫn nội bộ bắt đầu bằng "/" (vd /media/...). */
export function isHttpUrl(s: string, allowPath = false): boolean {
  const v = s.trim();
  if (allowPath && v.startsWith("/") && !v.startsWith("//")) return true;
  try {
    const u = new URL(v);
    return (u.protocol === "http:" || u.protocol === "https:") && !!u.hostname;
  } catch {
    return false;
  }
}
