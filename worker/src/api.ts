// API công khai, lịch sử nghe và quản trị.
import { Hono } from "hono";
import type { FunnelEventType, FunnelStats, HistoryItem, PlaybackInfo, SiteSettings } from "../../shared/types";
import type { AppEnv, Env } from "./env";
import { authRoutes, requireAdmin, requireUser } from "./auth";
import { SLUG_REDIRECT_INSERT_SQL } from "./seo";
import {
  cleanSettingsPatch,
  cleanTags,
  tagSlug,
  getReadyTrackByCode,
  getReadyTrackBySlug,
  getSettings,
  getTrackById,
  latestReady,
  publicConfig,
  queryTracks,
  saveSettings,
  toTrack,
  withUniqueSlug,
  type TrackRow,
} from "./data";
import {
  HttpError,
  UPLOAD_EXTS,
  bad,
  cacheControlFor,
  cleanRelPath,
  contentTypeFor,
  extOf,
  int,
  intParam,
  isSafeUrl,
  mediaUrl,
  nowSec,
  readJson,
  searchText,
  sha256Hex,
  startOfDayVN,
  str,
} from "./lib";

export const api = new Hono<AppEnv>();

api.route("/auth", authRoutes);

const notFoundTrack = () => new HttpError(404, "Không tìm thấy audio");

// ---------- Công khai ----------

api.get("/public/config", async (c) => c.json(publicConfig(await getSettings(c.env))));

api.get("/public/categories", async (c) => {
  const s = await getSettings(c.env);
  const { results } = await c.env.DB.prepare(
    "SELECT category, COUNT(*) AS n FROM tracks WHERE status = 'ready' AND category IS NOT NULL GROUP BY category",
  ).all<{ category: string; n: number }>();
  const counts = new Map(results.map((r) => [r.category, r.n]));
  return c.json(s.categories.map((cat) => ({ ...cat, count: counts.get(cat.slug) ?? 0 })));
});

api.get("/public/tracks", async (c) => {
  const category = (c.req.query("category") ?? "").trim().slice(0, 80);
  const tag = tagSlug(c.req.query("tag") ?? "");
  const page = await queryTracks(c.env, {
    readyOnly: true,
    category: category || undefined,
    tag: tag || undefined,
    sort: c.req.query("sort") === "hot" ? "hot" : "new",
    page: intParam(c.req.query("page"), 1, 1, 10_000),
    pageSize: intParam(c.req.query("pageSize"), 24, 1, 100),
  });
  return c.json(page);
});

api.get("/public/tracks/by-code/:code", async (c) => {
  const code = Number(c.req.param("code"));
  const row = Number.isInteger(code) && code > 0 ? await getReadyTrackByCode(c.env, code) : null;
  if (!row) throw notFoundTrack();
  return c.json({ track: toTrack(row) });
});

api.get("/public/tracks/:slug", async (c) => {
  const row = await getReadyTrackBySlug(c.env, c.req.param("slug"));
  if (!row) throw notFoundTrack();
  const related = await latestReady(c.env, 12, row.id);
  return c.json({ track: toTrack(row), related: related.map(toTrack) });
});

api.get("/search", async (c) => {
  const q = (c.req.query("q") ?? "").slice(0, 200);
  const page = intParam(c.req.query("page"), 1, 1, 10_000);
  const pageSize = intParam(c.req.query("pageSize"), 24, 1, 100);
  if (!searchText(q)) return c.json({ items: [], total: 0, page, pageSize });
  return c.json(await queryTracks(c.env, { q, readyOnly: true, sort: "new", page, pageSize }));
});

api.get("/playback/:id", async (c) => {
  const row = await getTrackById(c.env, c.req.param("id"));
  if (!row || row.status !== "ready" || !row.entry) throw notFoundTrack();
  const t = nowSec();
  const stmts = [c.env.DB.prepare("UPDATE tracks SET play_count = play_count + 1 WHERE id = ?").bind(row.id)];
  const user = c.get("user");
  if (user) {
    // Đưa bài lên đầu lịch sử; giữ vị trí nghe dở đã lưu.
    stmts.push(
      c.env.DB.prepare(
        "INSERT INTO history (user_id, track_id, position_seconds, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(user_id, track_id) DO UPDATE SET updated_at = excluded.updated_at",
      ).bind(user.id, row.id, t),
    );
  }
  await c.env.DB.batch(stmts);
  const info: PlaybackInfo = { trackId: row.id, format: row.format, url: mediaUrl(c.env, `tracks/${row.id}/${row.entry}`) };
  return c.json(info);
});

api.post("/public/unlock", async (c) => {
  const body = await readJson(c.req.raw);
  const checkpointId = str(body.checkpointId, "checkpointId", { min: 1, max: 40 });
  if (!/^[A-Za-z0-9_-]+$/.test(checkpointId)) throw bad("checkpointId không hợp lệ");
  const trackId = str(body.trackId, "trackId", { max: 64 }) || null;
  await c.env.DB.prepare("INSERT INTO unlock_events (checkpoint_id, track_id, created_at) VALUES (?, ?, ?)")
    .bind(checkpointId, trackId, nowSec())
    .run();
  return c.json({ ok: true });
});

const FUNNEL_TYPES: readonly FunnelEventType[] = ["view", "play", "gate_shown", "unlock", "gate_dismiss", "complete", "share"];
const EVENTS_PER_MINUTE = 120;

/** Ngày YYYY-MM-DD theo giờ Việt Nam. */
const vnDay = (sec: number) => new Date((sec + 7 * 3600) * 1000).toISOString().slice(0, 10);
const shortText = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

api.post("/public/events", async (c) => {
  let data: unknown;
  try {
    data = await c.req.json();
  } catch {
    throw bad("Dữ liệu gửi lên không phải JSON hợp lệ");
  }
  const list = Array.isArray(data) ? data : [data];
  if (!list.length) return c.json({ ok: true });
  if (list.length > 20) throw bad("Tối đa 20 sự kiện mỗi lần gửi");
  const t = nowSec();
  const day = vnDay(t);
  const events = list.map((raw, i) => {
    if (!raw || typeof raw !== "object") throw bad(`Sự kiện ${i + 1} không hợp lệ`);
    const e = raw as Record<string, unknown>;
    if (!FUNNEL_TYPES.includes(e.type as FunnelEventType)) throw bad(`Sự kiện ${i + 1}: loại không hợp lệ`);
    const checkpointId = shortText(e.checkpointId, 40);
    return {
      type: e.type as FunnelEventType,
      trackId: shortText(e.trackId, 64) || null,
      checkpointId: /^[A-Za-z0-9_-]+$/.test(checkpointId) ? checkpointId : null,
      source: shortText(e.source, 40).toLowerCase(),
      campaign: shortText(e.campaign, 80),
    };
  });
  // Không lưu IP thô: băm IP kèm ngày (đổi mỗi ngày, không truy ngược được giữa các ngày).
  const ip = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const ipHash = (await sha256Hex(`${day}|${ip}|funnel`)).slice(0, 32);
  const recent = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM funnel_events WHERE ip_hash = ? AND created_at > ?")
    .bind(ipHash, t - 60)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) + events.length > EVENTS_PER_MINUTE) throw new HttpError(429, "Gửi quá nhiều sự kiện, thử lại sau");
  await c.env.DB.batch(
    events.map((e) =>
      c.env.DB.prepare(
        "INSERT INTO funnel_events (type, track_id, checkpoint_id, source, campaign, ip_hash, day, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(e.type, e.trackId, e.checkpointId, e.source, e.campaign, ipHash, day, t),
    ),
  );
  return c.json({ ok: true });
});

// ---------- Lịch sử ----------

api.get("/history", requireUser, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT t.*, h.position_seconds AS h_pos, h.updated_at AS h_updated
       FROM history h JOIN tracks t ON t.id = h.track_id
      WHERE h.user_id = ? AND t.status = 'ready'
      ORDER BY h.updated_at DESC LIMIT 100`,
  )
    .bind(c.get("user")!.id)
    .all<TrackRow & { h_pos: number; h_updated: number }>();
  const items: HistoryItem[] = results.map((r) => ({ track: toTrack(r), positionSeconds: r.h_pos, updatedAt: r.h_updated }));
  return c.json(items);
});

api.put("/history/:trackId", requireUser, async (c) => {
  const body = await readJson(c.req.raw);
  const pos = int(body.positionSeconds, "positionSeconds", 0, 7 * 24 * 3600);
  const trackId = c.req.param("trackId");
  const row = await getTrackById(c.env, trackId);
  if (!row || row.status !== "ready") throw notFoundTrack();
  await c.env.DB.prepare(
    "INSERT INTO history (user_id, track_id, position_seconds, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, track_id) DO UPDATE SET position_seconds = excluded.position_seconds, updated_at = excluded.updated_at",
  )
    .bind(c.get("user")!.id, trackId, pos, nowSec())
    .run();
  return c.json({ ok: true });
});

// ---------- Quản trị ----------

const admin = new Hono<AppEnv>();
admin.use("*", requireAdmin);

admin.get("/tracks", async (c) => {
  // Lọc ở máy chủ: &category=<slug> &tag=<tag> (tổng số / phân trang theo bộ lọc).
  const category = (c.req.query("category") ?? "").trim().slice(0, 80);
  const tag = tagSlug(c.req.query("tag") ?? "");
  const page = await queryTracks(c.env, {
    q: (c.req.query("q") ?? "").slice(0, 200),
    readyOnly: false,
    category: category || undefined,
    tag: tag || undefined,
    sort: "new",
    page: intParam(c.req.query("page"), 1, 1, 10_000),
    pageSize: intParam(c.req.query("pageSize"), 20, 1, 100),
  });
  return c.json(page);
});

admin.post("/tracks", async (c) => {
  const body = await readJson(c.req.raw);
  const title = str(body.title, "Tên audio", { min: 1, max: 200 });
  const description = str(body.description, "Mô tả", { max: 5000 });
  const format = body.format;
  if (format !== "hls" && format !== "file") throw bad('Định dạng phải là "hls" hoặc "file"');
  const episodeCount = body.episodeCount === undefined || body.episodeCount === null || body.episodeCount === "" ? 1 : int(body.episodeCount, "Số tập", 1, 1000);
  const id = crypto.randomUUID();
  const t = nowSec();
  await withUniqueSlug(c.env, title, undefined, (slug) =>
    c.env.DB.prepare(
      `INSERT INTO tracks (id, slug, code, title, title_search, description, format, episode_count, status, created_at, updated_at)
       VALUES (?, ?, (SELECT COALESCE(MAX(code), 0) + 1 FROM tracks), ?, ?, ?, ?, ?, 'processing', ?, ?)`,
    )
      .bind(id, slug, title, searchText(title), description, format, episodeCount, t, t)
      .run(),
  );
  return c.json({ track: toTrack((await getTrackById(c.env, id))!) }, 201);
});

admin.patch("/tracks/:id", async (c) => {
  const id = c.req.param("id");
  const row = await getTrackById(c.env, id);
  if (!row) throw notFoundTrack();
  const body = await readJson(c.req.raw);
  const sets: string[] = [];
  const args: unknown[] = [];
  let newTitle: string | null = null;
  if ("title" in body) {
    newTitle = str(body.title, "Tên audio", { min: 1, max: 200 });
    if (newTitle === row.title) newTitle = null;
  }
  if ("description" in body) {
    sets.push("description = ?");
    args.push(str(body.description, "Mô tả", { max: 5000 }));
  }
  if ("episodeCount" in body) {
    sets.push("episode_count = ?");
    args.push(int(body.episodeCount, "Số tập", 1, 1000));
  }
  if ("durationSeconds" in body) {
    sets.push("duration_seconds = ?");
    args.push(int(body.durationSeconds, "Thời lượng", 0, 7 * 24 * 3600));
  }
  if ("category" in body) {
    let cat: string | null = null;
    if (body.category !== null && body.category !== "") {
      cat = str(body.category, "Thể loại", { max: 80 });
      const s = await getSettings(c.env);
      if (!s.categories.some((x) => x.slug === cat)) throw bad(`Thể loại "${cat}" chưa có trong cài đặt`);
    }
    sets.push("category = ?");
    args.push(cat);
  }
  if ("tags" in body) {
    sets.push("tags = ?");
    args.push(JSON.stringify(cleanTags(body.tags)));
  }
  if ("coverUrl" in body) {
    let cover: string | null = null;
    if (body.coverUrl !== null && body.coverUrl !== "") {
      cover = str(body.coverUrl, "Ảnh bìa", { max: 2000 });
      if (!isSafeUrl(cover)) throw bad("Địa chỉ ảnh bìa không hợp lệ");
    }
    sets.push("cover_url = ?");
    args.push(cover);
  }
  const run = async (slug: string | null) => {
    const t = nowSec();
    const s = [...sets, "updated_at = ?"];
    const a = [...args, t];
    if (newTitle !== null && slug !== null) {
      s.push("title = ?", "title_search = ?", "slug = ?");
      a.push(newTitle, searchText(newTitle), slug);
    }
    const update = c.env.DB.prepare(`UPDATE tracks SET ${s.join(", ")} WHERE id = ?`).bind(...a, id);
    if (slug === null || slug === row.slug) return update.run();
    // Slug đổi → ghi slug cũ để /track/<slug cũ> trả 301; bỏ chuyển hướng trùng slug mới (tránh vòng).
    await c.env.DB.batch([
      update,
      c.env.DB.prepare(SLUG_REDIRECT_INSERT_SQL).bind(row.slug, id, t),
      c.env.DB.prepare("DELETE FROM slug_redirects WHERE old_slug = ?").bind(slug),
    ]);
  };
  if (newTitle !== null) await withUniqueSlug(c.env, newTitle, id, run);
  else await run(null);
  return c.json({ track: toTrack((await getTrackById(c.env, id))!) });
});

async function deletePrefix(env: Env, prefix: string): Promise<number> {
  let cursor: string | undefined;
  let n = 0;
  do {
    const list = await env.MEDIA.list({ prefix, cursor, limit: 1000 });
    const keys = list.objects.map((o) => o.key);
    if (keys.length) {
      await env.MEDIA.delete(keys);
      n += keys.length;
    }
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
  return n;
}

admin.delete("/tracks/:id", async (c) => {
  const id = c.req.param("id");
  const row = await getTrackById(c.env, id);
  if (!row) throw notFoundTrack();
  await deletePrefix(c.env, `tracks/${id}/`);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM history WHERE track_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM tracks WHERE id = ?").bind(id),
  ]);
  return c.json({ ok: true });
});

const MAX_UPLOAD = 500 * 1024 * 1024;

admin.put("/upload/:id/*", async (c) => {
  const id = c.req.param("id");
  const pathname = new URL(c.req.url).pathname;
  const marker = `/upload/${encodeURIComponent(id)}/`;
  const at = pathname.indexOf(marker);
  if (at < 0) throw bad("Thiếu đường dẫn tệp");
  let rel: string;
  try {
    rel = pathname.slice(at + marker.length).split("/").map(decodeURIComponent).join("/");
  } catch {
    throw bad("Đường dẫn tệp không hợp lệ");
  }
  rel = cleanRelPath(rel);
  const ext = extOf(rel);
  if (!(UPLOAD_EXTS as readonly string[]).includes(ext)) throw bad(`Không nhận tệp đuôi ".${ext || "?"}" (chỉ ${UPLOAD_EXTS.map((e) => "." + e).join(" ")})`);
  if (!(await getTrackById(c.env, id))) throw notFoundTrack();

  const len = Number(c.req.header("content-length") ?? NaN);
  if (Number.isFinite(len) && len > MAX_UPLOAD) throw new HttpError(413, "Tệp quá lớn (tối đa 500 MB mỗi tệp)");
  const body = c.req.raw.body;
  if (!body) throw bad("Thân yêu cầu rỗng");
  const key = `tracks/${id}/${rel}`;
  const httpMetadata = { contentType: contentTypeFor(rel), cacheControl: cacheControlFor(rel) };
  // R2 cần luồng biết trước độ dài; không có Content-Length thì đọc hết vào bộ nhớ.
  if (Number.isFinite(len)) await c.env.MEDIA.put(key, body, { httpMetadata });
  else {
    const buf = await c.req.arrayBuffer();
    if (buf.byteLength > MAX_UPLOAD) throw new HttpError(413, "Tệp quá lớn (tối đa 500 MB mỗi tệp)");
    await c.env.MEDIA.put(key, buf, { httpMetadata });
  }
  return c.json({ key });
});

admin.post("/tracks/:id/complete", async (c) => {
  const id = c.req.param("id");
  const row = await getTrackById(c.env, id);
  if (!row) throw notFoundTrack();
  const body = await readJson(c.req.raw);
  const duration = int(body.durationSeconds, "Thời lượng", 0, 7 * 24 * 3600);
  const entry = cleanRelPath(str(body.entry, "entry", { min: 1, max: 400 }));
  const ext = extOf(entry);
  if (row.format === "hls" && ext !== "m3u8") throw bad("Track HLS cần entry là tệp .m3u8");
  if (row.format === "file" && !["mp3", "m4a", "aac", "mp4", "wav"].includes(ext)) throw bad("Track tệp đơn cần entry là .mp3 / .m4a / .aac / .mp4 / .wav");
  if (!(await c.env.MEDIA.head(`tracks/${id}/${entry}`))) throw bad(`Chưa thấy tệp "${entry}" trên kho — hãy tải lên trước`);
  await c.env.DB.prepare("UPDATE tracks SET status = 'ready', duration_seconds = ?, entry = ?, updated_at = ? WHERE id = ?")
    .bind(duration, entry, nowSec(), id)
    .run();
  return c.json({ track: toTrack((await getTrackById(c.env, id))!) });
});

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_IMAGE = 5 * 1024 * 1024;

admin.post("/assets", async (c) => {
  const type = (c.req.header("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  const ext = IMAGE_TYPES[type];
  if (!ext) throw bad("Chỉ nhận ảnh JPG, PNG hoặc WebP");
  const len = Number(c.req.header("content-length") ?? NaN);
  if (Number.isFinite(len) && len > MAX_IMAGE) throw new HttpError(413, "Ảnh quá lớn (tối đa 5 MB)");
  const buf = await c.req.arrayBuffer();
  if (!buf.byteLength) throw bad("Ảnh rỗng");
  if (buf.byteLength > MAX_IMAGE) throw new HttpError(413, "Ảnh quá lớn (tối đa 5 MB)");
  const key = `assets/${crypto.randomUUID()}.${ext}`;
  await c.env.MEDIA.put(key, buf, { httpMetadata: { contentType: type, cacheControl: cacheControlFor(key) } });
  return c.json({ url: mediaUrl(c.env, key) });
});

const getSettingsRoute = async (c: { env: Env; json: (v: SiteSettings) => Response }) => c.json(await getSettings(c.env));
admin.get("/settings", (c) => getSettingsRoute(c));
admin.put("/settings", async (c) => {
  const patch = cleanSettingsPatch(await readJson(c.req.raw));
  await saveSettings(c.env, patch);
  return c.json(await getSettings(c.env));
});

admin.get("/stats", async (c) => {
  const [t, u, k] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(play_count), 0) AS plays FROM tracks"),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM users"),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM unlock_events WHERE created_at >= ?").bind(startOfDayVN()),
  ]);
  const tr = t!.results[0] as { n: number; plays: number };
  return c.json({
    tracks: tr.n,
    plays: tr.plays,
    users: (u!.results[0] as { n: number }).n,
    unlocksToday: (k!.results[0] as { n: number }).n,
  });
});

admin.get("/funnel", async (c) => {
  const days = intParam(c.req.query("days"), 30, 1, 365);
  const from = vnDay(nowSec() - (days - 1) * 86400);
  const { results } = await c.env.DB.prepare(
    `SELECT day, source,
            SUM(type = 'view') AS view, SUM(type = 'play') AS play, SUM(type = 'gate_shown') AS gate_shown,
            SUM(type = 'unlock') AS unlock, SUM(type = 'complete') AS complete
       FROM funnel_events WHERE day >= ?
      GROUP BY day, source ORDER BY day DESC, view DESC`,
  )
    .bind(from)
    .all<FunnelStats["rows"][number]>();
  const stats: FunnelStats = { days, rows: results };
  return c.json(stats);
});

api.route("/admin", admin);

// Bí danh theo chú thích trong shared/types.ts ("GET/PUT /api/settings") — cùng quyền admin.
const settingsAlias = new Hono<AppEnv>();
settingsAlias.use("*", requireAdmin);
settingsAlias.get("/", (c) => getSettingsRoute(c));
settingsAlias.put("/", async (c) => {
  const patch = cleanSettingsPatch(await readJson(c.req.raw));
  await saveSettings(c.env, patch);
  return c.json(await getSettings(c.env));
});
api.route("/settings", settingsAlias);
