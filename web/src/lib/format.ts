export function fmtTime(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

/** "1 giờ 25 phút", "48 phút" */
export function fmtDurationLong(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "—";
  const m = Math.round(sec / 60);
  if (m < 1) return `${Math.round(sec)} giây`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h === 0) return `${m} phút`;
  return mm ? `${h} giờ ${mm} phút` : `${h} giờ`;
}

export function fmtCount(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(".", ",")} tr`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(".", ",")}k`;
  return String(n);
}

export function fmtDate(unixSec: number): string {
  if (!unixSec) return "";
  return new Date(unixSec * 1000).toLocaleDateString("vi-VN", { day: "numeric", month: "long", year: "numeric" });
}

/** Thời gian tương đối từ giây Unix. */
export function fmtAgo(unixSec: number): string {
  const diff = Date.now() / 1000 - unixSec;
  if (diff < 60) return "vừa xong";
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} ngày trước`;
  return new Date(unixSec * 1000).toLocaleDateString("vi-VN");
}
