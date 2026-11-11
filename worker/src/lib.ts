// Tiện ích dùng chung: lỗi HTTP, kiểm đầu vào, chuỗi tiếng Việt, mật mã, đường dẫn media.
import type { Env } from "./env";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const bad = (message: string) => new HttpError(400, message);

export const nowSec = () => Math.floor(Date.now() / 1000);

// ---------- Đầu vào ----------

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  let data: unknown;
  try {
    data = await req.json();
  } catch {
    throw bad("Dữ liệu gửi lên không phải JSON hợp lệ");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw bad("Dữ liệu gửi lên phải là một đối tượng JSON");
  return data as Record<string, unknown>;
}

export function str(v: unknown, field: string, opts: { max: number; min?: number; optional?: boolean } = { max: 1000 }): string {
  if (v === undefined || v === null) {
    if (opts.optional || (opts.min ?? 0) === 0) return "";
    throw bad(`Thiếu ${field}`);
  }
  if (typeof v !== "string") throw bad(`${field} phải là chuỗi`);
  const s = v.trim();
  if (s.length < (opts.min ?? 0)) throw bad(opts.min === 1 ? `Thiếu ${field}` : `${field} phải có ít nhất ${opts.min} ký tự`);
  if (s.length > opts.max) throw bad(`${field} tối đa ${opts.max} ký tự`);
  return s;
}

export function int(v: unknown, field: string, min: number, max: number): number {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) throw bad(`${field} phải là số`);
  const r = Math.round(n);
  if (r < min || r > max) throw bad(`${field} phải từ ${min} đến ${max}`);
  return r;
}

/** Tham số truy vấn số nguyên, sai thì dùng mặc định và kẹp trong [min, max]. */
export function intParam(v: string | undefined, def: number, min: number, max: number): number {
  const n = v ? parseInt(v, 10) : NaN;
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

export function isHttpUrl(s: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(s);
}

/** URL ảnh/link chấp nhận: http(s) tuyệt đối hoặc đường dẫn gốc "/..." (không "//"). */
export function isSafeUrl(s: string): boolean {
  return isHttpUrl(s) || (/^\/[^/\\]/.test(s) && !/\s/.test(s));
}

// ---------- Tiếng Việt ----------

/** Chữ thường, đ→d, bỏ dấu. */
export function fold(s: string): string {
  return s.toLowerCase().replace(/đ/g, "d").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function slugify(title: string): string {
  const s = fold(title).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/g, "");
  return s || "audio";
}

/** Chuẩn hoá để tìm: bỏ dấu, chỉ giữ a-z0-9, gom khoảng trắng. */
export function searchText(s: string): string {
  return fold(s).replace(/[^a-z0-9]+/g, " ").trim();
}

export const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");

// ---------- HTML / JSON an toàn ----------

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

/** JSON nhúng trong <script>: chặn </script>, <!--, và U+2028/2029. */
export function jsonForScript(v: unknown): string {
  return JSON.stringify(v)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

// ---------- Mật mã ----------

const te = new TextEncoder();

function toB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function toB64Url(bytes: Uint8Array): string {
  return toB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

export function randomToken(n = 32): string {
  return toB64Url(randomBytes(n));
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export function constantTimeEqualStr(a: string, b: string): boolean {
  return constantTimeEqual(te.encode(a), te.encode(b));
}

export async function sha256Hex(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", te.encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Workers giới hạn PBKDF2 tối đa 100 000 vòng.
const PBKDF2_ITER = 100_000;

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", te.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await pbkdf2(password, salt, PBKDF2_ITER);
  return `pbkdf2-sha256$${PBKDF2_ITER}$${toB64(salt)}$${toB64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, iterStr, saltB64, hashB64] = stored.split("$");
  if (alg !== "pbkdf2-sha256" || !iterStr || !saltB64 || !hashB64) return false;
  const iter = parseInt(iterStr, 10);
  if (!Number.isFinite(iter) || iter < 1 || iter > PBKDF2_ITER) return false;
  const hash = await pbkdf2(password, fromB64(saltB64), iter);
  return constantTimeEqual(hash, fromB64(hashB64));
}

// ---------- Media ----------

export const UPLOAD_EXTS = ["m3u8", "ts", "m4s", "aac", "mp3", "m4a", "mp4", "wav", "jpg", "png", "webp"] as const;

const CONTENT_TYPES: Record<string, string> = {
  m3u8: "application/vnd.apple.mpegurl",
  ts: "video/mp2t",
  m4s: "video/iso.segment",
  aac: "audio/aac",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  wav: "audio/wav",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function extOf(path: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(path);
  return m ? m[1]!.toLowerCase() : "";
}

export function contentTypeFor(path: string): string {
  return CONTENT_TYPES[extOf(path)] ?? "application/octet-stream";
}

/** Cache: playlist ngắn (có thể tải lại), tệp đoạn / audio / ảnh dài hạn. */
export function cacheControlFor(path: string): string {
  return extOf(path) === "m3u8" ? "public, max-age=300" : "public, max-age=31536000, immutable";
}

/**
 * Kiểm đường dẫn tương đối của tệp tải lên: không rỗng, không "..", không "\", không bắt đầu bằng "/",
 * không ký tự điều khiển. Trả về đường dẫn đã chuẩn (các đoạn nối bằng "/").
 */
export function cleanRelPath(raw: string): string {
  if (!raw || raw.length > 400) throw bad("Đường dẫn tệp không hợp lệ");
  if (raw.includes("\\") || raw.startsWith("/")) throw bad("Đường dẫn tệp không hợp lệ");
  const parts = raw.split("/");
  for (const p of parts) {
    if (!p || p === "." || p === ".." || p.length > 200 || /[\x00-\x1f\x7f]/.test(p)) {
      throw bad("Đường dẫn tệp không hợp lệ (không được chứa \"..\" hay đoạn rỗng)");
    }
  }
  return parts.join("/");
}

export function mediaUrl(env: Env, key: string): string {
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  const base = (env.MEDIA_PUBLIC_BASE ?? "").trim().replace(/\/+$/, "");
  return base ? `${base}/${encoded}` : `/media/${encoded}`;
}

export function isLocalHost(url: string): boolean {
  const h = new URL(url).hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1" || h.endsWith(".localhost");
}

/** Đầu ngày theo giờ Việt Nam (UTC+7), giây Unix. */
export function startOfDayVN(now = nowSec()): number {
  const off = 7 * 3600;
  return Math.floor((now + off) / 86400) * 86400 - off;
}
