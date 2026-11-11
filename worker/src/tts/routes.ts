// Xưởng audio — Hono sub-app. Gắn ở worker/src/index.ts (chỗ "GẮN MÔ-ĐUN NGOÀI"):
//   import studio from "./tts/routes";
//   app.use("/api/admin/studio/*", requireAdmin);
//   app.route("/api/admin/studio", studio);
// (sub-app tự kiểm admin lần nữa cho chắc). Env cần: xem StudioEnv trong ./types.ts.
//
//   GET    /providers                               -> { live, providers, emotions, narrator, budgetUsd }
//   POST   /parse {script}                          -> ParseResult
//   GET    /usage?month=YYYY-MM                     -> { month, budgetUsd, spentUsd, byProvider }
//   GET    /jobs                                    -> { jobs: StudioJob[] }   (50 bản mới nhất, không kèm script)
//   POST   /jobs {title, script, provider, voices}  -> { job, segments, items, parse }
//   GET    /jobs/:id                                -> { job, segments, items }
//   PUT    /jobs/:id {title?, script?, provider?, voices?} -> { job, segments, items, parse }  (lời không đổi giữ nguyên âm thanh)
//   DELETE /jobs/:id                                -> { ok }
//   POST   /jobs/:id/estimate                       -> Estimate (ký tự / giây / USD còn phải tạo, phần có trong bộ đệm, ngân sách)
//   POST   /jobs/:id/segments/:n/generate?force=1   -> { segment, job }   (MỘT request TTS; force = bỏ qua bộ đệm, đọc lại)
//   GET    /jobs/:id/segments/:n/audio?h=<hash>     -> audio/wav
//   POST   /jobs/:id/publish/:trackId?duration=<giây>  body = WAV -> { trackId, entry, key }
//   GET    /library                                 -> { items: {kind, name, key, size}[] }
//   GET    /library/:kind/:name                     -> tệp âm thanh
//   PUT    /library/:kind/:name   body = âm thanh   -> { kind, name, key }   (kind = music | sfx)
//   DELETE /library/:kind/:name                     -> { ok }

import { Hono } from "hono";
import type { User } from "../../../shared/types";
import { HttpError, bad, nowSec, readJson, sha256Hex, slugify, str } from "../lib";
import { NORMALIZE_VERSION, syllableCount, estimateSeconds, stripTags } from "./normalize";
import { EMOTIONS, PROVIDERS, effectiveProvider, getProvider, isLive } from "./providers";
import { MAX_SCRIPT_CHARS, MAX_SEGMENTS, NARRATOR, parseScript } from "./script";
import {
  PROVIDER_IDS,
  type CastHint,
  type ProviderId,
  type RoleVoice,
  type ScriptItem,
  type StudioEnv,
  type StudioJob,
  type StudioSegment,
} from "./types";
import { trimAndAnalyze, type WavStats } from "./wav";

type StudioApp = { Bindings: StudioEnv; Variables: { user: User | null } };
export const studio = new Hono<StudioApp>();
export default studio;

studio.use("*", async (c, next) => {
  const u = c.get("user");
  if (!u) throw new HttpError(401, "Bạn cần đăng nhập");
  if (!u.isAdmin) throw new HttpError(403, "Chỉ quản trị viên được dùng chức năng này");
  await next();
});

// ---------------------------------------------------------------- tiện ích

interface JobRow {
  id: string;
  title: string;
  script: string;
  provider: string;
  voices_json: string;
  items_json: string;
  status: StudioJob["status"];
  track_id: string | null;
  created_at: number;
  updated_at: number;
}
interface SegRow {
  job_id: string;
  n: number;
  role: string;
  emotion: string;
  style: string;
  text: string;
  tts_text: string;
  provider: string;
  voice: string;
  speed: number;
  hash: string;
  status: StudioSegment["status"];
  error: string | null;
  qc: string | null;
  duration_ms: number;
  bytes: number;
  cost_usd: number;
  cached: number;
  updated_at: number;
}

const segKey = (jobId: string, n: number) => `studio/${jobId}/${n}.wav`;
const notFound = () => new HttpError(404, "Không tìm thấy phiên làm việc");
const asProvider = (s: string): ProviderId => ((PROVIDER_IDS as readonly string[]).includes(s) ? (s as ProviderId) : "mock");

function safeJson<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function toJob(r: JobRow): StudioJob {
  return {
    id: r.id,
    title: r.title,
    script: r.script,
    provider: asProvider(r.provider),
    voices: safeJson(r.voices_json, {}),
    status: r.status,
    trackId: r.track_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toSeg(r: SegRow): StudioSegment {
  return {
    n: r.n,
    role: r.role,
    emotion: r.emotion,
    style: r.style,
    text: r.text,
    ttsText: r.tts_text,
    provider: asProvider(r.provider),
    voice: r.voice,
    speed: r.speed,
    hash: r.hash,
    status: r.status,
    error: r.error,
    qc: r.qc,
    durationMs: r.duration_ms,
    bytes: r.bytes,
    costUsd: r.cost_usd,
    cached: r.cached === 1,
  };
}

async function getJobRow(env: StudioEnv, id: string): Promise<JobRow> {
  const r = await env.DB.prepare("SELECT * FROM studio_jobs WHERE id = ?").bind(id).first<JobRow>();
  if (!r) throw notFound();
  return r;
}

async function getSegs(env: StudioEnv, id: string): Promise<SegRow[]> {
  const { results } = await env.DB.prepare("SELECT * FROM studio_segments WHERE job_id = ? ORDER BY n").bind(id).all<SegRow>();
  return results ?? [];
}

async function getSeg(env: StudioEnv, id: string, n: number): Promise<SegRow | null> {
  return env.DB.prepare("SELECT * FROM studio_segments WHERE job_id = ? AND n = ?").bind(id, n).first<SegRow>();
}

function cleanProvider(v: unknown): ProviderId {
  const s = typeof v === "string" ? v : "mock";
  if (!(PROVIDER_IDS as readonly string[]).includes(s)) throw bad("Nhà cung cấp không hợp lệ");
  return s as ProviderId;
}

function cleanVoices(v: unknown): Record<string, RoleVoice> {
  if (v === undefined || v === null) return {};
  if (typeof v !== "object" || Array.isArray(v)) throw bad("Bảng vai phải là đối tượng");
  const out: Record<string, RoleVoice> = {};
  for (const [role, raw] of Object.entries(v as Record<string, unknown>).slice(0, 100)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as { voice?: unknown; speed?: unknown; persona?: unknown };
    const voice = typeof r.voice === "string" ? r.voice.trim().slice(0, 120) : "";
    const persona = typeof r.persona === "string" ? r.persona.trim().slice(0, 300) : "";
    const sp = typeof r.speed === "number" && Number.isFinite(r.speed) ? r.speed : 1;
    out[role.trim().slice(0, 80)] = { voice, speed: Math.min(2, Math.max(0.5, sp)), persona };
  }
  return out;
}

const FEMALE_WORD_RE = /(mẹ|má|bà|cô|chị|em gái|con gái|vợ|nàng|thím|mợ|dì|nữ|cháu gái|bé gái|dâu)/i;
/** Tên riêng nữ phổ biến (so khớp NGUYÊN từ cuối của tên vai, vd. "Lan", "chị Hoa", "Ngọc Trâm"). */
export const FEMALE_NAMES = new Set(
  "lan hoa mai hương linh ngọc trang thảo hằng nga thu hạnh yến nhung vy my vân loan phương hà huyền trinh uyên quyên diệp thúy thuý tuyết nhi ngân châu xuân hồng cúc liên oanh dung duyên giang hiền thơ trâm quỳnh diễm kiều ly thư hân nhàn tuyền thắm lụa đào".split(" "),
);
/** Vai nữ: có từ chỉ nữ, là "o" (cô — tiếng miền Trung), hoặc từ cuối là tên nữ phổ biến. */
export function isFemaleRole(role: string): boolean {
  const words = role.toLowerCase().trim().split(/\s+/);
  return FEMALE_WORD_RE.test(role) || words[0] === "o" || FEMALE_NAMES.has(words[words.length - 1] ?? "");
}
export const ELDER_RE = /(mẹ chồng|mẹ vợ|bố chồng|bố vợ|bà|ông|cụ|bác|già|lão|mẹ|bố|cha|má)/i;

/** Giọng cho một vai: bảng vai (giao diện) → @vai trong kịch bản → mặc định theo tên vai. */
export function voiceFor(provider: ProviderId, voices: Record<string, RoleVoice>, cast: Record<string, CastHint>, role: string): RoleVoice {
  const set = voices[role];
  const hint = cast[role];
  const hintOk = hint && (!hint.provider || hint.provider === provider);
  const d = PROVIDERS[provider].defaultVoice;
  // Vai lớn tuổi (mẹ chồng, bố chồng, bà, ông…) → giọng lớn tuổi, không đọc mẹ chồng bằng giọng nữ trẻ.
  const elder = ELDER_RE.test(role);
  const fallback =
    role === NARRATOR ? d.narrator : isFemaleRole(role) ? (elder && d.elderFemale) || d.female : (elder && d.elderMale) || d.male;
  return {
    voice: set?.voice || (hintOk ? hint.voice : "") || fallback,
    speed: set?.speed ?? hint?.speed ?? 1,
    persona: set?.persona || hint?.persona || "",
  };
}

async function segHash(env: StudioEnv, provider: ProviderId, voice: string, speed: number, emotion: string, style: string, ttsText: string) {
  return sha256Hex([provider, PROVIDERS[provider].model(env), voice, speed.toFixed(2), emotion, style, ttsText, `v${NORMALIZE_VERSION}`].join("␟"));
}

async function deleteKeys(env: StudioEnv, keys: string[]) {
  for (let i = 0; i < keys.length; i += 1000) await env.MEDIA.delete(keys.slice(i, i + 1000));
}

async function deletePrefix(env: StudioEnv, prefix: string) {
  let cursor: string | undefined;
  do {
    const list = await env.MEDIA.list({ prefix, cursor, limit: 1000 });
    if (list.objects.length) await env.MEDIA.delete(list.objects.map((o) => o.key));
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
}

async function refreshJobStatus(env: StudioEnv, id: string) {
  const r = await env.DB.prepare(
    "SELECT COUNT(*) AS total, SUM(status = 'done') AS done, SUM(status = 'error') AS err, SUM(status = 'generating') AS gen FROM studio_segments WHERE job_id = ?",
  )
    .bind(id)
    .first<{ total: number; done: number | null; err: number | null; gen: number | null }>();
  const total = r?.total ?? 0;
  const done = r?.done ?? 0;
  const status = total > 0 && done === total ? "ready" : (r?.err ?? 0) > 0 ? "error" : (r?.gen ?? 0) > 0 || done > 0 ? "generating" : "draft";
  await env.DB.prepare("UPDATE studio_jobs SET status = CASE WHEN status = 'published' AND ? = 'ready' THEN status ELSE ? END, updated_at = ? WHERE id = ?")
    .bind(status, status, nowSec(), id)
    .run();
}

/** Kiểm chất lượng một clip (docs/xuong-audio-thiet-ke.md 3.6). null = ổn. */
function qcOf(ttsText: string, stats: WavStats | null, durationMs: number): string | null {
  const issues: string[] = [];
  const syl = syllableCount(stripTags(ttsText));
  if (syl >= 4 && durationMs > 0) {
    const per = durationMs / 1000 / syl;
    if (per < 0.15) issues.push("đọc quá nhanh / có thể bỏ chữ");
    if (per > 0.6) issues.push("quá dài so với số chữ / có thể lặp");
  }
  if (stats) {
    if (stats.rmsDb < -40) issues.push("gần như im lặng");
    if (stats.peak >= 0.999) issues.push("vỡ tiếng (chạm 0 dBFS)");
    if (stats.longestSilenceSec > 2) issues.push(`lặng ${stats.longestSilenceSec.toFixed(1)} s giữa câu`);
  }
  return issues.length ? issues.join("; ") : null;
}

// ---------------------------------------------------------------- ngân sách

const budgetOf = (env: StudioEnv) => {
  const n = Number(env.STUDIO_MONTHLY_BUDGET_USD ?? "");
  return Number.isFinite(n) && n >= 0 ? n : 10;
};
const today = () => new Date().toISOString().slice(0, 10);

async function monthSpent(env: StudioEnv, month = today().slice(0, 7)) {
  const { results } = await env.DB.prepare(
    "SELECT provider, SUM(chars) AS chars, SUM(seconds) AS seconds, SUM(cost_usd) AS cost, SUM(requests) AS requests FROM studio_usage WHERE day LIKE ? GROUP BY provider",
  )
    .bind(`${month}-%`)
    .all<{ provider: string; chars: number; seconds: number; cost: number; requests: number }>();
  const byProvider = (results ?? []).map((r) => ({ provider: r.provider, chars: r.chars, seconds: Math.round(r.seconds), usd: Math.round(r.cost * 10000) / 10000, requests: r.requests }));
  return { spentUsd: byProvider.reduce((s, r) => s + r.usd, 0), byProvider };
}

async function recordUsage(env: StudioEnv, provider: ProviderId, chars: number, seconds: number, cost: number) {
  await env.DB.prepare(
    `INSERT INTO studio_usage (day, provider, chars, seconds, cost_usd, requests) VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT (day, provider) DO UPDATE SET chars = chars + excluded.chars, seconds = seconds + excluded.seconds,
       cost_usd = cost_usd + excluded.cost_usd, requests = requests + 1`,
  )
    .bind(today(), provider, chars, seconds, cost)
    .run();
}

// ---------------------------------------------------------------- lưu kịch bản

/**
 * Ghi kịch bản + dựng lại danh sách lời. Lời cùng số thứ tự và cùng hash giữ nguyên (không phải tạo lại);
 * lời đổi → pending; lời thừa → xoá cả tệp R2.
 */
async function saveScript(env: StudioEnv, id: string, title: string, script: string, provider: ProviderId, voices: Record<string, RoleVoice>, isNew: boolean) {
  if (script.length > MAX_SCRIPT_CHARS) throw bad(`Kịch bản tối đa ${MAX_SCRIPT_CHARS} ký tự`);
  const parse = parseScript(script);
  if (parse.speechCount > MAX_SEGMENTS) throw bad(`Kịch bản có ${parse.speechCount} lời — tối đa ${MAX_SEGMENTS}, hãy chia nhỏ`);
  const eff = effectiveProvider(env, provider);
  const old = new Map((isNew ? [] : await getSegs(env, id)).map((s) => [s.n, s]));
  const now = nowSec();
  const stmts: D1PreparedStatement[] = [];
  const items = JSON.stringify(parse.items);
  if (isNew) {
    stmts.push(
      env.DB.prepare(
        "INSERT INTO studio_jobs (id, title, script, provider, voices_json, items_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)",
      ).bind(id, title, script, provider, JSON.stringify(voices), items, now, now),
    );
  } else {
    stmts.push(
      env.DB.prepare("UPDATE studio_jobs SET title = ?, script = ?, provider = ?, voices_json = ?, items_json = ?, updated_at = ? WHERE id = ?").bind(
        title,
        script,
        provider,
        JSON.stringify(voices),
        items,
        now,
        id,
      ),
    );
  }
  for (const it of parse.items) {
    if (it.type !== "speech") continue;
    const rv = voiceFor(eff, voices, parse.cast, it.role);
    const speed = it.speed ?? rv.speed;
    const style = [rv.persona, it.direction].filter(Boolean).join("; ");
    const hash = await segHash(env, eff, rv.voice, speed, it.emotion, style, it.ttsText);
    const prev = old.get(it.n);
    old.delete(it.n);
    if (prev && prev.hash === hash && prev.status === "done") {
      if (prev.text !== it.text || prev.role !== it.role)
        stmts.push(env.DB.prepare("UPDATE studio_segments SET text = ?, role = ? WHERE job_id = ? AND n = ?").bind(it.text, it.role, id, it.n));
      continue;
    }
    stmts.push(
      env.DB.prepare(
        `INSERT INTO studio_segments (job_id, n, role, emotion, style, text, tts_text, provider, voice, speed, hash, status, error, qc, duration_ms, bytes, cost_usd, cached, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, 0, 0, 0, 0, ?)
         ON CONFLICT (job_id, n) DO UPDATE SET role = excluded.role, emotion = excluded.emotion, style = excluded.style, text = excluded.text,
           tts_text = excluded.tts_text, provider = excluded.provider, voice = excluded.voice, speed = excluded.speed, hash = excluded.hash,
           status = 'pending', error = NULL, qc = NULL, duration_ms = 0, bytes = 0, cost_usd = 0, cached = 0, updated_at = excluded.updated_at`,
      ).bind(id, it.n, it.role, it.emotion, style, it.text, it.ttsText, eff, rv.voice, speed, hash, now),
    );
  }
  const stale = [...old.keys()];
  for (const n of stale) stmts.push(env.DB.prepare("DELETE FROM studio_segments WHERE job_id = ? AND n = ?").bind(id, n));
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
  if (stale.length) await deleteKeys(env, stale.map((n) => segKey(id, n)));
  await refreshJobStatus(env, id);
  return parse;
}

async function jobPayload(env: StudioEnv, id: string) {
  const row = await getJobRow(env, id);
  return { job: toJob(row), segments: (await getSegs(env, id)).map(toSeg), items: safeJson<ScriptItem[]>(row.items_json, []) };
}

// ---------------------------------------------------------------- nhà cung cấp & phân tích

studio.get("/providers", (c) => {
  const providers = PROVIDER_IDS.map((id) => {
    const p = PROVIDERS[id];
    return { id, label: p.label, unavailable: p.unavailable(c.env), model: p.model(c.env), voices: p.voices, defaultVoice: p.defaultVoice };
  });
  const emotions = Object.entries(EMOTIONS).map(([id, e]) => ({ id, label: e.label }));
  return c.json({ live: isLive(c.env), providers, emotions, narrator: NARRATOR, budgetUsd: budgetOf(c.env) });
});

studio.post("/parse", async (c) => {
  const body = await readJson(c.req.raw);
  return c.json(parseScript(typeof body.script === "string" ? body.script : ""));
});

studio.get("/usage", async (c) => {
  const q = c.req.query("month") ?? "";
  const month = /^\d{4}-\d{2}$/.test(q) ? q : today().slice(0, 7);
  return c.json({ month, budgetUsd: budgetOf(c.env), ...(await monthSpent(c.env, month)) });
});

// ---------------------------------------------------------------- phiên làm việc

studio.get("/jobs", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, title, '' AS script, provider, voices_json, '[]' AS items_json, status, track_id, created_at, updated_at
     FROM studio_jobs ORDER BY updated_at DESC LIMIT 50`,
  ).all<JobRow>();
  return c.json({ jobs: (results ?? []).map(toJob) });
});

studio.post("/jobs", async (c) => {
  const body = await readJson(c.req.raw);
  const title = str(body.title, "Tên", { max: 200 }) || "Kịch bản chưa đặt tên";
  const script = typeof body.script === "string" ? body.script : "";
  const provider = cleanProvider(body.provider);
  const voices = cleanVoices(body.voices);
  const id = crypto.randomUUID();
  const parse = await saveScript(c.env, id, title, script, provider, voices, true);
  return c.json({ ...(await jobPayload(c.env, id)), parse });
});

studio.get("/jobs/:id", async (c) => c.json(await jobPayload(c.env, c.req.param("id"))));

studio.put("/jobs/:id", async (c) => {
  const id = c.req.param("id");
  const row = await getJobRow(c.env, id);
  const body = await readJson(c.req.raw);
  const job = toJob(row);
  const title = body.title === undefined ? row.title : str(body.title, "Tên", { max: 200 }) || row.title;
  const script = typeof body.script === "string" ? body.script : row.script;
  const provider = body.provider === undefined ? job.provider : cleanProvider(body.provider);
  const voices = body.voices === undefined ? job.voices : cleanVoices(body.voices);
  const parse = await saveScript(c.env, id, title, script, provider, voices, false);
  return c.json({ ...(await jobPayload(c.env, id)), parse });
});

studio.delete("/jobs/:id", async (c) => {
  const id = c.req.param("id");
  await getJobRow(c.env, id);
  await deletePrefix(c.env, `studio/${id}/`);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM studio_segments WHERE job_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM studio_jobs WHERE id = ?").bind(id),
  ]);
  return c.json({ ok: true });
});

studio.post("/jobs/:id/estimate", async (c) => {
  const id = c.req.param("id");
  const job = toJob(await getJobRow(c.env, id));
  const eff = effectiveProvider(c.env, job.provider);
  const p = PROVIDERS[eff];
  const segs = await getSegs(c.env, id);
  let chars = 0;
  let seconds = 0;
  let cachedChars = 0;
  let pending = 0;
  for (const s of segs) {
    if (s.status === "done") continue;
    pending++;
    const hit = await c.env.DB.prepare("SELECT 1 FROM studio_segments WHERE hash = ? AND status = 'done' LIMIT 1").bind(s.hash).first();
    if (hit) {
      cachedChars += s.tts_text.length;
      continue;
    }
    chars += s.tts_text.length;
    seconds += estimateSeconds(s.tts_text, s.speed);
  }
  const usd = p.cost(c.env, chars, seconds);
  const { spentUsd } = await monthSpent(c.env);
  return c.json({
    live: isLive(c.env),
    provider: eff,
    pending,
    chars,
    seconds: Math.round(seconds),
    cachedChars,
    usd: Math.round(usd * 10000) / 10000,
    budgetUsd: budgetOf(c.env),
    spentUsd: Math.round(spentUsd * 10000) / 10000,
  });
});

// ---------------------------------------------------------------- tạo giọng từng lời

studio.post("/jobs/:id/segments/:n/generate", async (c) => {
  const id = c.req.param("id");
  const n = Number(c.req.param("n"));
  if (!Number.isInteger(n) || n < 0) throw bad("Số lời không hợp lệ");
  const force = c.req.query("force") === "1";
  await getJobRow(c.env, id);
  const seg = await getSeg(c.env, id, n);
  if (!seg) throw new HttpError(404, "Không tìm thấy lời");
  // Nhà cung cấp đã chốt lúc lưu (provider của lời). Nếu sau đó tắt live → ép về mock (hash đổi ở lần lưu kế tiếp).
  const pid = isLive(c.env) ? asProvider(seg.provider) : "mock";
  const provider = getProvider(pid);
  const why = provider.unavailable(c.env);
  if (why) throw new HttpError(400, `${provider.label}: ${why}`);
  const key = segKey(id, n);

  const finish = async (bytes: Uint8Array, durationMs: number, qc: string | null, cost: number, cached: boolean) => {
    await c.env.MEDIA.put(key, bytes, { httpMetadata: { contentType: "audio/wav" } });
    await c.env.DB.prepare(
      "UPDATE studio_segments SET status = 'done', error = NULL, qc = ?, duration_ms = ?, bytes = ?, cost_usd = ?, cached = ?, updated_at = ? WHERE job_id = ? AND n = ? AND hash = ?",
    )
      .bind(qc, durationMs, bytes.byteLength, cost, cached ? 1 : 0, nowSec(), id, n, seg.hash)
      .run();
  };
  const respond = async () => {
    await refreshJobStatus(c.env, id);
    return c.json({ segment: toSeg((await getSeg(c.env, id, n))!), job: toJob(await getJobRow(c.env, id)) });
  };

  if (!force) {
    if (seg.status === "done" && (await c.env.MEDIA.head(key))) return respond();
    // Bộ đệm: lời khác (bất kỳ phiên nào) đã tạo cùng hash → chép, không gọi nhà cung cấp, không tính tiền.
    const hit = await c.env.DB.prepare(
      "SELECT job_id, n, duration_ms, qc FROM studio_segments WHERE hash = ? AND status = 'done' AND NOT (job_id = ? AND n = ?) LIMIT 1",
    )
      .bind(seg.hash, id, n)
      .first<{ job_id: string; n: number; duration_ms: number; qc: string | null }>();
    if (hit) {
      const obj = await c.env.MEDIA.get(segKey(hit.job_id, hit.n));
      if (obj) {
        await finish(new Uint8Array(await obj.arrayBuffer()), hit.duration_ms, hit.qc, 0, true);
        return respond();
      }
    }
  }

  // Trần ngân sách tháng (chỉ nhà cung cấp thật).
  const estCost = provider.cost(c.env, seg.tts_text.length, estimateSeconds(seg.tts_text, seg.speed));
  if (estCost > 0) {
    const { spentUsd } = await monthSpent(c.env);
    const budget = budgetOf(c.env);
    if (spentUsd + estCost > budget) throw new HttpError(402, `Vượt ngân sách tháng ($${spentUsd.toFixed(2)} / $${budget.toFixed(2)}) — tăng STUDIO_MONTHLY_BUDGET_USD hoặc đợi tháng sau`);
  }

  await c.env.DB.prepare("UPDATE studio_segments SET status = 'generating', error = NULL, updated_at = ? WHERE job_id = ? AND n = ?").bind(nowSec(), id, n).run();
  try {
    const out = await provider.synthesize(c.env, { text: seg.tts_text, voice: seg.voice, speed: seg.speed, emotion: seg.emotion, style: seg.style });
    const { wav, stats } = trimAndAnalyze(out.wav);
    const durationMs = stats?.durationMs ?? out.durationMs;
    const cost = provider.cost(c.env, seg.tts_text.length, durationMs / 1000);
    if (pid !== "mock") await recordUsage(c.env, pid, seg.tts_text.length, durationMs / 1000, cost);
    await finish(wav, durationMs, qcOf(seg.tts_text, stats, durationMs), cost, false);
  } catch (e) {
    const msg = e instanceof HttpError ? e.message : e instanceof Error && e.name === "TimeoutError" ? `${provider.label} quá thời gian chờ` : "Lỗi khi tạo giọng";
    if (!(e instanceof HttpError)) console.error("studio synth", e);
    await c.env.DB.prepare("UPDATE studio_segments SET status = 'error', error = ?, updated_at = ? WHERE job_id = ? AND n = ?").bind(msg, nowSec(), id, n).run();
    await refreshJobStatus(c.env, id);
    throw e instanceof HttpError ? e : new HttpError(502, msg);
  }
  return respond();
});

studio.get("/jobs/:id/segments/:n/audio", async (c) => {
  const id = c.req.param("id");
  const n = Number(c.req.param("n"));
  if (!Number.isInteger(n) || n < 0) throw bad("Số lời không hợp lệ");
  const obj = await c.env.MEDIA.get(segKey(id, n));
  if (!obj) throw new HttpError(404, "Lời này chưa có âm thanh");
  // ?h=<hash> đổi khi lời được tạo lại → cho trình duyệt giữ bộ đệm (trộn 2 lượt không tải lại).
  const cache = c.req.query("h") ? "private, max-age=86400, immutable" : "no-store";
  return new Response(obj.body, { headers: { "content-type": "audio/wav", "content-length": String(obj.size), "cache-control": cache } });
});

// ---------------------------------------------------------------- đăng thành track
// Luồng upload/complete chung chỉ nhận mp3/m4a/aac/mp4 (UPLOAD_EXTS + kiểm ở /complete), nên WAV của xưởng
// đăng qua đây: ghi R2 tracks/<trackId>/studio-<thời điểm>.wav rồi đặt track sẵn sàng giống /complete.
// Khi lõi nhận thêm "wav" (hoặc xưởng xuất AAC/HLS) thì giao diện chuyển sang PUT /api/admin/upload + /complete.

const MAX_PUBLISH = 500 * 1024 * 1024;

studio.post("/jobs/:id/publish/:trackId", async (c) => {
  const id = c.req.param("id");
  const trackId = c.req.param("trackId");
  await getJobRow(c.env, id);
  const track = await c.env.DB.prepare("SELECT id, format FROM tracks WHERE id = ?").bind(trackId).first<{ id: string; format: string }>();
  if (!track) throw new HttpError(404, "Không tìm thấy audio");
  if (track.format !== "file") throw bad("Track phải có định dạng tệp đơn (file)");
  const duration = Math.round(Number(c.req.query("duration")));
  if (!Number.isFinite(duration) || duration < 1 || duration > 7 * 24 * 3600) throw bad("Thời lượng không hợp lệ");
  const len = Number(c.req.header("content-length") ?? NaN);
  if (!Number.isFinite(len)) throw new HttpError(411, "Thiếu Content-Length");
  if (len > MAX_PUBLISH) throw new HttpError(413, "Tệp quá lớn (tối đa 500 MB)");
  if (len < 44) throw bad("Tệp WAV rỗng");
  const body = c.req.raw.body;
  if (!body) throw bad("Thân yêu cầu rỗng");
  const entry = `studio-${Date.now()}.wav`;
  const key = `tracks/${trackId}/${entry}`;
  await c.env.MEDIA.put(key, body, { httpMetadata: { contentType: "audio/wav", cacheControl: "public, max-age=31536000, immutable" } });
  const head = await c.env.MEDIA.get(key, { range: { offset: 0, length: 12 } });
  const sig = head ? new Uint8Array(await head.arrayBuffer()) : new Uint8Array();
  const tag = (o: number) => String.fromCharCode(...sig.slice(o, o + 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") {
    await c.env.MEDIA.delete(key);
    throw bad("Tệp gửi lên không phải WAV");
  }
  const now = nowSec();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE tracks SET status = 'ready', duration_seconds = ?, entry = ?, updated_at = ? WHERE id = ?").bind(duration, entry, now, trackId),
    c.env.DB.prepare("UPDATE studio_jobs SET status = 'published', track_id = ?, updated_at = ? WHERE id = ?").bind(trackId, now, id),
  ]);
  return c.json({ trackId, entry, key });
});

// ---------------------------------------------------------------- thư viện nhạc nền / hiệu ứng

const LIB_TYPES: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/webm": "webm",
};
const LIB_CT: Record<string, string> = { mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac", webm: "audio/webm" };
const MAX_LIB = 30 * 1024 * 1024;

function libKind(k: string): "music" | "sfx" {
  if (k !== "music" && k !== "sfx") throw bad("Loại phải là music hoặc sfx");
  return k;
}

/** Tên trong thư viện = slug không dấu ("Mưa đêm" → "mua-dem"); kịch bản [nhạc mưa-đêm] khớp cùng cách. */
const libName = (raw: string) => slugify(raw).slice(0, 60);

async function findLib(env: StudioEnv, kind: string, name: string) {
  return (await env.MEDIA.list({ prefix: `studio/lib/${kind}/${name}.`, limit: 10 })).objects;
}

studio.get("/library", async (c) => {
  const items: { kind: string; name: string; key: string; size: number }[] = [];
  let cursor: string | undefined;
  do {
    const list = await c.env.MEDIA.list({ prefix: "studio/lib/", cursor, limit: 1000 });
    for (const o of list.objects) {
      const m = /^studio\/lib\/(music|sfx)\/([^/]+)\.[a-z0-9]+$/.exec(o.key);
      if (m) items.push({ kind: m[1]!, name: m[2]!, key: o.key, size: o.size });
    }
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor && items.length < 2000);
  return c.json({ items });
});

studio.get("/library/:kind/:name", async (c) => {
  const kind = libKind(c.req.param("kind"));
  const [first] = await findLib(c.env, kind, libName(c.req.param("name")));
  const obj = first ? await c.env.MEDIA.get(first.key) : null;
  if (!obj) throw new HttpError(404, "Không có tệp này trong thư viện");
  const ext = obj.key.slice(obj.key.lastIndexOf(".") + 1);
  return new Response(obj.body, {
    headers: { "content-type": LIB_CT[ext] ?? "application/octet-stream", "content-length": String(obj.size), "cache-control": "private, max-age=300" },
  });
});

studio.put("/library/:kind/:name", async (c) => {
  const kind = libKind(c.req.param("kind"));
  const name = libName(c.req.param("name"));
  const type = (c.req.header("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  const ext = LIB_TYPES[type];
  if (!ext) throw bad("Chỉ nhận âm thanh MP3, WAV, OGG, M4A, AAC, WebM");
  const len = Number(c.req.header("content-length") ?? NaN);
  if (Number.isFinite(len) && len > MAX_LIB) throw new HttpError(413, "Tệp quá lớn (tối đa 30 MB)");
  const buf = await c.req.arrayBuffer();
  if (!buf.byteLength) throw bad("Tệp rỗng");
  if (buf.byteLength > MAX_LIB) throw new HttpError(413, "Tệp quá lớn (tối đa 30 MB)");
  const old = await findLib(c.env, kind, name);
  if (old.length) await c.env.MEDIA.delete(old.map((o) => o.key));
  const key = `studio/lib/${kind}/${name}.${ext}`;
  await c.env.MEDIA.put(key, buf, { httpMetadata: { contentType: LIB_CT[ext] } });
  return c.json({ kind, name, key });
});

studio.delete("/library/:kind/:name", async (c) => {
  const kind = libKind(c.req.param("kind"));
  const old = await findLib(c.env, kind, libName(c.req.param("name")));
  if (old.length) await c.env.MEDIA.delete(old.map((o) => o.key));
  return c.json({ ok: true });
});
