// Truy cập D1: track, cài đặt, người dùng.
import type { Category, LockPoint, Page, PublicSiteConfig, SiteSettings, Track, TrackFormat, TrackStatus, User } from "../../shared/types";
import type { Env } from "./env";
import { bad, escapeLike, fold, isHttpUrl, isSafeUrl, nowSec, randomToken, searchText, slugify } from "./lib";

// ---------- Track ----------

export interface TrackRow {
  id: string;
  slug: string;
  code: number;
  title: string;
  title_search: string;
  description: string;
  cover_url: string | null;
  format: TrackFormat;
  entry: string | null;
  duration_seconds: number;
  episode_count: number;
  status: TrackStatus;
  play_count: number;
  category: string | null;
  tags: string;
  created_at: number;
  updated_at: number;
}

function parseTags(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

/** Tag: chữ thường không dấu, nối bằng "-" (vd "me-chong"), tối đa 40 ký tự; tối đa 20 tag. */
export function tagSlug(t: string): string {
  return fold(t).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
}

export function cleanTags(v: unknown): string[] {
  if (!Array.isArray(v)) throw bad("tags phải là danh sách");
  const out = new Set<string>();
  for (const t of v) {
    if (typeof t !== "string") throw bad("Mỗi tag phải là chuỗi");
    const s = tagSlug(t);
    if (s) out.add(s);
  }
  if (out.size > 20) throw bad("Tối đa 20 tag");
  return [...out];
}

export function toTrack(r: TrackRow): Track {
  return {
    id: r.id,
    slug: r.slug,
    code: r.code,
    title: r.title,
    description: r.description ?? "",
    coverUrl: r.cover_url ?? null,
    format: r.format,
    durationSeconds: r.duration_seconds ?? 0,
    episodeCount: Math.max(1, r.episode_count ?? 1),
    status: r.status,
    playCount: r.play_count ?? 0,
    category: r.category ?? null,
    tags: parseTags(r.tags),
    createdAt: r.created_at,
  };
}

export async function getTrackById(env: Env, id: string): Promise<TrackRow | null> {
  return env.DB.prepare("SELECT * FROM tracks WHERE id = ?").bind(id).first<TrackRow>();
}

export async function getReadyTrackByCode(env: Env, code: number): Promise<TrackRow | null> {
  return env.DB.prepare("SELECT * FROM tracks WHERE code = ? AND status = 'ready'").bind(code).first<TrackRow>();
}

export async function getReadyTrackBySlug(env: Env, slug: string): Promise<TrackRow | null> {
  return env.DB.prepare("SELECT * FROM tracks WHERE slug = ? AND status = 'ready'").bind(slug).first<TrackRow>();
}

/** Slug duy nhất từ tiêu đề: trùng thì thêm -2, -3… (bỏ qua chính track exceptId). */
export async function uniqueSlug(env: Env, title: string, exceptId?: string): Promise<string> {
  const base = slugify(title);
  const { results } = await env.DB.prepare(
    "SELECT slug FROM tracks WHERE (slug = ? OR slug LIKE ? ESCAPE '\\') AND id != ?",
  )
    .bind(base, `${escapeLike(base)}-%`, exceptId ?? "")
    .all<{ slug: string }>();
  const used = new Set(results.map((r) => r.slug));
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const s = `${base}-${n}`;
    if (!used.has(s)) return s;
  }
}

const isUniqueSlugError = (e: unknown) => /UNIQUE/i.test(String(e)) && /slug|code/i.test(String(e));

/** Chạy thao tác ghi cần slug duy nhất, thử lại khi đụng độ đồng thời. */
export async function withUniqueSlug<T>(env: Env, title: string, exceptId: string | undefined, fn: (slug: string) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const slug = await uniqueSlug(env, title, exceptId);
    try {
      return await fn(slug);
    } catch (e) {
      if (attempt < 3 && isUniqueSlugError(e)) continue;
      throw e;
    }
  }
}

export interface TrackQuery {
  q?: string;
  readyOnly: boolean;
  sort: "new" | "hot";
  category?: string;
  tag?: string;
  page: number;
  pageSize: number;
}

export async function queryTracks(env: Env, o: TrackQuery): Promise<Page<Track>> {
  const where: string[] = [];
  const args: unknown[] = [];
  if (o.readyOnly) where.push("status = 'ready'");
  const words = o.q ? searchText(o.q).split(" ").filter(Boolean).slice(0, 8) : [];
  for (const w of words) {
    where.push("title_search LIKE ? ESCAPE '\\'");
    args.push(`%${escapeLike(w)}%`);
  }
  if (o.category) {
    where.push("category = ?");
    args.push(o.category);
  }
  if (o.tag) {
    where.push("EXISTS (SELECT 1 FROM json_each(tracks.tags) WHERE json_each.value = ?)");
    args.push(o.tag);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  let order = o.sort === "hot" ? "play_count DESC, created_at DESC" : "created_at DESC";
  const orderArgs: unknown[] = [];
  if (words.length) {
    // Khớp đầu tiêu đề xếp trước.
    order = `(title_search LIKE ? ESCAPE '\\') DESC, ${order}`;
    orderArgs.push(`${escapeLike(words.join(" "))}%`);
  }
  const offset = (o.page - 1) * o.pageSize;
  const [countRes, listRes] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS n FROM tracks ${whereSql}`).bind(...args),
    env.DB.prepare(`SELECT * FROM tracks ${whereSql} ORDER BY ${order}, id LIMIT ? OFFSET ?`).bind(...args, ...orderArgs, o.pageSize, offset),
  ]);
  const total = (countRes!.results[0] as { n: number } | undefined)?.n ?? 0;
  return { items: (listRes!.results as unknown as TrackRow[]).map(toTrack), total, page: o.page, pageSize: o.pageSize };
}

export async function latestReady(env: Env, limit: number, exceptId?: string): Promise<TrackRow[]> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM tracks WHERE status = 'ready' AND id != ? ORDER BY created_at DESC, id LIMIT ?",
  )
    .bind(exceptId ?? "", limit)
    .all<TrackRow>();
  return results;
}

// ---------- Cài đặt ----------

export const DEFAULT_SETTINGS: SiteSettings = {
  brand_name: "Kể Đêm Audio",
  site_title: "",
  tagline: "Nghe chuyện đời, chuyện nhà, chuyện lòng",
  contact_email: "",
  gate_enabled: false,
  lock_points: [],
  unlock_ttl_hours: 6,
  categories: [],
  default_og_image: "",
  in_app_prompt: true,
  head_html: "",
  body_html: "",
  ads_txt: "",
};

type Key = keyof SiteSettings;
const KEYS = Object.keys(DEFAULT_SETTINGS) as Key[];

export async function getSettings(env: Env): Promise<SiteSettings> {
  const { results } = await env.DB.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  const out: SiteSettings = { ...DEFAULT_SETTINGS, lock_points: [], categories: [] };
  for (const r of results) {
    if (!(KEYS as string[]).includes(r.key)) continue;
    try {
      const v = JSON.parse(r.value) as unknown;
      const def = DEFAULT_SETTINGS[r.key as Key];
      if (Array.isArray(def) ? Array.isArray(v) : typeof v === typeof def) (out as unknown as Record<string, unknown>)[r.key] = v;
    } catch {
      /* giá trị hỏng → giữ mặc định */
    }
  }
  return out;
}

function cleanLockPoints(v: unknown): LockPoint[] {
  if (!Array.isArray(v)) throw bad("lock_points phải là danh sách");
  if (v.length > 50) throw bad("Tối đa 50 chốt khoá");
  const ids = new Set<string>();
  const out = v.map((raw, i): LockPoint => {
    if (!raw || typeof raw !== "object") throw bad(`Chốt ${i + 1} không hợp lệ`);
    const o = raw as Record<string, unknown>;
    const s = (k: string, max: number) => {
      const val = o[k] ?? "";
      if (typeof val !== "string") throw bad(`Chốt ${i + 1}: ${k} phải là chuỗi`);
      if (val.trim().length > max) throw bad(`Chốt ${i + 1}: ${k} tối đa ${max} ký tự`);
      return val.trim();
    };
    let id = s("id", 40);
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || ids.has(id)) id = "cp" + randomToken(6).replace(/[^A-Za-z0-9]/g, "").slice(0, 6);
    ids.add(id);
    const fromEp = Number(o.fromEp);
    if (!Number.isInteger(fromEp) || fromEp < 1 || fromEp > 100000) throw bad(`Chốt ${i + 1}: "khoá từ tập" phải là số nguyên ≥ 1`);
    let atSecond: number | null = null;
    if (o.atSecond !== undefined && o.atSecond !== null && o.atSecond !== "") {
      const a = Number(o.atSecond);
      if (!Number.isFinite(a) || a < 0 || a > 7 * 24 * 3600) throw bad(`Chốt ${i + 1}: "khoá từ giây" phải là số ≥ 0`);
      atSecond = Math.round(a);
    }
    const link = s("link", 2000);
    if (link && !isHttpUrl(link)) throw bad(`Chốt ${i + 1}: liên kết phải bắt đầu bằng http:// hoặc https://`);
    const imageUrl = s("imageUrl", 2000);
    if (imageUrl && !isSafeUrl(imageUrl)) throw bad(`Chốt ${i + 1}: địa chỉ ảnh không hợp lệ`);
    return {
      id,
      fromEp,
      atSecond,
      name: s("name", 100),
      title: s("title", 500),
      link,
      imageUrl,
      button: s("button", 100),
      description: s("description", 1000),
    };
  });
  return out.sort((a, b) => a.fromEp - b.fromEp);
}

function cleanCategories(v: unknown): Category[] {
  if (!Array.isArray(v)) throw bad("categories phải là danh sách");
  if (v.length > 100) throw bad("Tối đa 100 thể loại");
  const seen = new Set<string>();
  return v.map((raw, i): Category => {
    if (!raw || typeof raw !== "object") throw bad(`Thể loại ${i + 1} không hợp lệ`);
    const o = raw as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!name || name.length > 80) throw bad(`Thể loại ${i + 1}: tên bắt buộc, tối đa 80 ký tự`);
    const slug = slugify(typeof o.slug === "string" && o.slug.trim() ? o.slug : name);
    if (seen.has(slug)) throw bad(`Thể loại trùng đường dẫn "${slug}"`);
    seen.add(slug);
    const description = typeof o.description === "string" ? o.description.trim() : "";
    if (description.length > 2000) throw bad(`Thể loại ${i + 1}: mô tả tối đa 2000 ký tự`);
    return { slug, name, description };
  });
}

/** Kiểm Partial<SiteSettings>; khoá lạ bị bỏ qua. */
export function cleanSettingsPatch(input: Record<string, unknown>): Partial<SiteSettings> {
  const out: Partial<SiteSettings> = {};
  const text = (k: Key, max: number) => {
    const v = input[k];
    if (typeof v !== "string") throw bad(`${k} phải là chuỗi`);
    if (v.length > max) throw bad(`${k} tối đa ${max} ký tự`);
    return v;
  };
  const bool = (k: Key) => {
    const v = input[k];
    if (typeof v !== "boolean") throw bad(`${k} phải là true/false`);
    return v;
  };
  for (const k of KEYS) {
    if (!(k in input)) continue;
    switch (k) {
      case "brand_name": {
        const v = text(k, 80).trim();
        if (!v) throw bad("Tên thương hiệu không được để trống");
        out.brand_name = v;
        break;
      }
      case "site_title":
        out.site_title = text(k, 200).trim();
        break;
      case "tagline":
        out.tagline = text(k, 300).trim();
        break;
      case "contact_email": {
        const v = text(k, 200).trim();
        if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw bad("Email liên hệ không hợp lệ");
        out.contact_email = v;
        break;
      }
      case "gate_enabled":
      case "in_app_prompt":
        out[k] = bool(k);
        break;
      case "lock_points":
        out.lock_points = cleanLockPoints(input[k]);
        break;
      case "unlock_ttl_hours": {
        const v = Number(input[k]);
        if (!Number.isFinite(v) || v < 0 || v > 24 * 365) throw bad("Thời hạn mở khoá (giờ) không hợp lệ");
        out.unlock_ttl_hours = v;
        break;
      }
      case "categories":
        out.categories = cleanCategories(input[k]);
        break;
      case "default_og_image": {
        const v = text(k, 2000).trim();
        if (v && !isSafeUrl(v)) throw bad("Địa chỉ ảnh OG mặc định không hợp lệ");
        out.default_og_image = v;
        break;
      }
      case "head_html":
      case "body_html":
        out[k] = text(k, 50_000);
        break;
      case "ads_txt":
        out.ads_txt = text(k, 50_000);
        break;
    }
  }
  return out;
}

export async function saveSettings(env: Env, patch: Partial<SiteSettings>): Promise<void> {
  const entries = Object.entries(patch);
  if (!entries.length) return;
  const t = nowSec();
  await env.DB.batch(
    entries.map(([k, v]) =>
      env.DB.prepare(
        "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      ).bind(k, JSON.stringify(v), t),
    ),
  );
}

export function siteTitleOf(s: SiteSettings): string {
  return s.site_title || (s.tagline ? `${s.brand_name} — ${s.tagline}` : s.brand_name);
}

export function publicConfig(s: SiteSettings): PublicSiteConfig {
  return {
    brandName: s.brand_name,
    siteTitle: siteTitleOf(s),
    tagline: s.tagline,
    contactEmail: s.contact_email,
    gate:
      s.gate_enabled && s.lock_points.length
        ? { checkpoints: [...s.lock_points].sort((a, b) => a.fromEp - b.fromEp), unlockTtlHours: s.unlock_ttl_hours }
        : null,
    inAppBrowserPrompt: s.in_app_prompt,
    categories: s.categories,
    defaultOgImage: s.default_og_image,
  };
}

// ---------- Người dùng ----------

export interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  is_admin: number;
  created_at: number;
}

export const toUser = (r: Pick<UserRow, "id" | "email" | "name" | "is_admin">): User => ({
  id: r.id,
  email: r.email,
  name: r.name,
  isAdmin: r.is_admin === 1,
});
