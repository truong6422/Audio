// API Trợ lý viết kịch bản — gắn ở /api/admin/writer (sau requireAdmin).
//
//   GET    /config                              nhà cung cấp đang dùng
//   GET    /projects                            danh sách dự án
//   POST   /projects                            tạo dự án (ý tưởng, nhân vật, độ dài, giọng kể, kiểu kết)
//   GET    /projects/:id                        dự án + các tập
//   PATCH  /projects/:id                        sửa ý tưởng / dàn ý
//   DELETE /projects/:id
//   POST   /projects/:id/outline                AI sinh dàn ý (ghi đè dàn ý cũ)
//   POST   /projects/:id/episodes/:no/generate  AI sinh kịch bản tập (ghi đè bản nháp)
//   PUT    /projects/:id/episodes/:no           lưu bản sửa tay
//   POST   /projects/:id/episodes/:no/send      kiểm định dạng, đánh dấu "sent" → trả { id }
//   GET    /scripts                             các kịch bản đã gửi (cho Xưởng audio)
//   GET    /scripts/:id                         một kịch bản (StudioScript)
import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { HttpError, bad, int, nowSec, readJson, str } from "../lib";
import { NARRATOR, cleanScript, parseScript } from "./format";
import { generate, mockEpisode, mockOutline, providerInfo, type WriterVars } from "./llm";
import { FICTION_NOTE, SYSTEM_PROMPT, episodePrompt, normalizeOutline, outlinePrompt, parseEpisode, parseOutline } from "./prompts";
import type { Ending, Outline, Pov, StudioScript, WriterCharacter, WriterEpisode, WriterProject } from "./types";

type C = Context<AppEnv>;
const vars = (c: C) => c.env as unknown as WriterVars;

// ---------- Ánh xạ hàng ----------

interface ProjectRow {
  id: string;
  title: string;
  genre: string;
  idea: string;
  characters: string;
  episode_minutes: number;
  episode_count: number;
  pov: Pov;
  ending: Ending;
  notes: string;
  outline: string | null;
  created_at: number;
  updated_at: number;
}

interface EpisodeRow {
  id: string;
  project_id: string;
  ep_no: number;
  title: string;
  script: string;
  cliffhanger: string;
  teaser: string;
  seo_title: string;
  seo_description: string;
  hashtags: string;
  status: "draft" | "sent";
  sent_at: number | null;
  created_at: number;
  updated_at: number;
}

function jsonOr<T>(s: string | null, def: T): T {
  if (!s) return def;
  try {
    return JSON.parse(s) as T;
  } catch {
    return def;
  }
}

const toProject = (r: ProjectRow): WriterProject => ({
  id: r.id,
  title: r.title,
  genre: r.genre,
  idea: r.idea,
  characters: jsonOr<WriterCharacter[]>(r.characters, []),
  episodeMinutes: r.episode_minutes,
  episodeCount: r.episode_count,
  pov: r.pov,
  ending: r.ending,
  notes: r.notes,
  outline: jsonOr<Outline | null>(r.outline, null),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toEpisode = (r: EpisodeRow): WriterEpisode => ({
  id: r.id,
  projectId: r.project_id,
  epNo: r.ep_no,
  title: r.title,
  script: r.script,
  cliffhanger: r.cliffhanger,
  teaser: r.teaser,
  seoTitle: r.seo_title,
  seoDescription: r.seo_description,
  hashtags: r.hashtags,
  status: r.status,
  sentAt: r.sent_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

async function loadProject(c: C, id: string): Promise<WriterProject> {
  const r = await c.env.DB.prepare("SELECT * FROM writer_projects WHERE id = ?").bind(id).first<ProjectRow>();
  if (!r) throw new HttpError(404, "Không tìm thấy dự án truyện");
  return toProject(r);
}

async function loadEpisode(c: C, projectId: string, no: number): Promise<WriterEpisode | null> {
  const r = await c.env.DB.prepare("SELECT * FROM writer_episodes WHERE project_id = ? AND ep_no = ?").bind(projectId, no).first<EpisodeRow>();
  return r ? toEpisode(r) : null;
}

// ---------- Kiểm đầu vào ----------

function parseCharacters(v: unknown): WriterCharacter[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw bad("Nhân vật phải là danh sách");
  if (v.length > 12) throw bad("Tối đa 12 nhân vật");
  const seen = new Set<string>();
  return v.map((x, i) => {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const name = str(o.name, `Tên nhân vật ${i + 1}`, { max: 40, min: 1 });
    if (/[[\]|{}()]/.test(name)) throw bad(`Tên nhân vật "${name}" không được chứa [ ] | { } ( )`);
    if (seen.has(name.toLowerCase())) throw bad(`Trùng tên nhân vật "${name}"`);
    seen.add(name.toLowerCase());
    const gender = o.gender === "nam" ? "nam" : "nữ";
    return { name, gender, age: str(o.age, "Tuổi", { max: 20 }), role: str(o.role, "Vai trò", { max: 300 }), voice: str(o.voice, "Vai chuẩn", { max: 40 }) };
  });
}

function projectFields(b: Record<string, unknown>, partial: boolean) {
  const f: Partial<Omit<WriterProject, "id" | "createdAt" | "updatedAt">> = {};
  const has = (k: string) => !partial || k in b;
  if (has("title")) f.title = str(b.title, "Tên truyện", { max: 200 });
  if (has("genre")) f.genre = str(b.genre, "Thể loại", { max: 60, min: 1 });
  if (has("idea")) f.idea = str(b.idea, "Ý tưởng", { max: 4000, min: 10 });
  if (has("characters")) f.characters = parseCharacters(b.characters);
  if (has("episodeMinutes")) f.episodeMinutes = int(b.episodeMinutes ?? 10, "Độ dài mỗi tập (phút)", 3, 40);
  if (has("episodeCount")) f.episodeCount = int(b.episodeCount ?? 5, "Số tập", 1, 30);
  if (has("pov")) {
    if (b.pov !== "ngoi1" && b.pov !== "ngoi3") throw bad("Giọng kể phải là ngoi1 hoặc ngoi3");
    f.pov = b.pov;
  }
  if (has("ending")) {
    if (b.ending !== "co-hau" && b.ending !== "twist") throw bad("Kiểu kết phải là co-hau hoặc twist");
    f.ending = b.ending;
  }
  if (has("notes")) f.notes = str(b.notes, "Ghi chú", { max: 2000 });
  if (partial && "outline" in b) f.outline = b.outline === null ? null : normalizeOutline(b.outline);
  return f;
}

function epNo(c: C, p: WriterProject): number {
  const n = Number(c.req.param("no"));
  const max = Math.max(p.episodeCount, p.outline?.episodes.length ?? 0);
  if (!Number.isInteger(n) || n < 1 || n > max) throw bad(`Số tập phải từ 1 đến ${max}`);
  return n;
}

// ---------- Ghi tập ----------

type EpisodeData = Pick<WriterEpisode, "title" | "script" | "cliffhanger" | "teaser" | "seoTitle" | "seoDescription" | "hashtags">;

async function upsertEpisode(c: C, projectId: string, no: number, d: EpisodeData, resetStatus: boolean): Promise<WriterEpisode> {
  const t = nowSec();
  const old = await loadEpisode(c, projectId, no);
  if (old) {
    const status = resetStatus && old.script !== d.script ? "draft" : old.status;
    await c.env.DB.prepare(
      `UPDATE writer_episodes SET title = ?, script = ?, cliffhanger = ?, teaser = ?, seo_title = ?, seo_description = ?, hashtags = ?,
         status = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(d.title, d.script, d.cliffhanger, d.teaser, d.seoTitle, d.seoDescription, d.hashtags, status, t, old.id)
      .run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO writer_episodes (id, project_id, ep_no, title, script, cliffhanger, teaser, seo_title, seo_description, hashtags, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
    )
      .bind(crypto.randomUUID(), projectId, no, d.title, d.script, d.cliffhanger, d.teaser, d.seoTitle, d.seoDescription, d.hashtags, t, t)
      .run();
  }
  await c.env.DB.prepare("UPDATE writer_projects SET updated_at = ? WHERE id = ?").bind(t, projectId).run();
  return (await loadEpisode(c, projectId, no))!;
}

/** Bảo đảm dòng ghi chú hư cấu ở đầu kịch bản và cuối mô tả. */
function ensureFiction(d: EpisodeData): EpisodeData {
  const script = cleanScript(d.script);
  const head = script.split("\n").slice(0, 3).join(" ");
  return {
    ...d,
    script: head.includes("hư cấu") ? script : `[${NARRATOR}] ${FICTION_NOTE}\n(nghỉ 1s)\n${script}`,
    teaser: cleanScript(d.teaser),
    seoDescription: d.seoDescription.includes("hư cấu") ? d.seoDescription : `${d.seoDescription} ${FICTION_NOTE}`.trim(),
  };
}

// ---------- Định tuyến ----------

export const writer = new Hono<AppEnv>();

writer.get("/config", (c) => c.json(providerInfo(vars(c))));

writer.get("/projects", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT p.*, (SELECT COUNT(*) FROM writer_episodes e WHERE e.project_id = p.id AND e.script <> '') AS written,
            (SELECT COUNT(*) FROM writer_episodes e WHERE e.project_id = p.id AND e.status = 'sent') AS sent
       FROM writer_projects p ORDER BY p.updated_at DESC LIMIT 200`,
  ).all<ProjectRow & { written: number; sent: number }>();
  return c.json({ items: results.map((r) => ({ ...toProject(r), written: r.written, sent: r.sent })) });
});

writer.post("/projects", async (c) => {
  const f = projectFields(await readJson(c.req.raw), false);
  const id = crypto.randomUUID();
  const t = nowSec();
  await c.env.DB.prepare(
    `INSERT INTO writer_projects (id, title, genre, idea, characters, episode_minutes, episode_count, pov, ending, notes, outline, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
  )
    .bind(id, f.title!, f.genre!, f.idea!, JSON.stringify(f.characters ?? []), f.episodeMinutes!, f.episodeCount!, f.pov!, f.ending!, f.notes!, c.get("user")?.id ?? null, t, t)
    .run();
  return c.json(await loadProject(c, id), 201);
});

writer.get("/projects/:id", async (c) => {
  const project = await loadProject(c, c.req.param("id"));
  const { results } = await c.env.DB.prepare("SELECT * FROM writer_episodes WHERE project_id = ? ORDER BY ep_no").bind(project.id).all<EpisodeRow>();
  return c.json({ project, episodes: results.map(toEpisode) });
});

writer.patch("/projects/:id", async (c) => {
  const p = await loadProject(c, c.req.param("id"));
  const f = projectFields(await readJson(c.req.raw), true);
  const n: WriterProject = { ...p, ...f };
  if (n.outline && n.outline.episodes.length) n.episodeCount = Math.min(30, n.outline.episodes.length);
  await c.env.DB.prepare(
    `UPDATE writer_projects SET title = ?, genre = ?, idea = ?, characters = ?, episode_minutes = ?, episode_count = ?, pov = ?, ending = ?, notes = ?,
       outline = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(n.title, n.genre, n.idea, JSON.stringify(n.characters), n.episodeMinutes, n.episodeCount, n.pov, n.ending, n.notes, n.outline ? JSON.stringify(n.outline) : null, nowSec(), p.id)
    .run();
  return c.json(await loadProject(c, p.id));
});

writer.delete("/projects/:id", async (c) => {
  const p = await loadProject(c, c.req.param("id"));
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM writer_episodes WHERE project_id = ?").bind(p.id),
    c.env.DB.prepare("DELETE FROM writer_projects WHERE id = ?").bind(p.id),
  ]);
  return c.body(null, 204);
});

writer.post("/projects/:id/outline", async (c) => {
  const p = await loadProject(c, c.req.param("id"));
  const text = await generate(vars(c), { system: SYSTEM_PROMPT, user: outlinePrompt(p), maxTokens: 8000, mock: () => mockOutline(p) });
  let outline: Outline;
  try {
    outline = parseOutline(text, p.episodeCount);
  } catch (e) {
    throw new HttpError(502, e instanceof Error ? e.message : "Dàn ý không hợp lệ");
  }
  const title = p.title || outline.title;
  await c.env.DB.prepare("UPDATE writer_projects SET outline = ?, title = ?, episode_count = ?, updated_at = ? WHERE id = ?")
    .bind(JSON.stringify(outline), title, outline.episodes.length, nowSec(), p.id)
    .run();
  return c.json(await loadProject(c, p.id));
});

writer.post("/projects/:id/episodes/:no/generate", async (c) => {
  const p = await loadProject(c, c.req.param("id"));
  if (!p.outline?.episodes.length) throw bad("Hãy sinh hoặc soạn dàn ý trước");
  const no = epNo(c, p);
  if (no > p.outline.episodes.length) throw bad("Tập này chưa có trong dàn ý");
  const prev = no > 1 ? await loadEpisode(c, p.id, no - 1) : null;
  const prevTail = prev?.script ? prev.script.split("\n").slice(-25).join("\n") : "";
  const total = p.outline.episodes.length;
  const text = await generate(vars(c), {
    system: SYSTEM_PROMPT,
    user: episodePrompt({ project: p, outline: p.outline, epNo: no, prevTail }),
    maxTokens: 32000,
    mock: () => mockEpisode(p, no, total),
  });
  const d = parseEpisode(text);
  if (!d.script.trim()) throw new HttpError(502, "Mô hình không trả về kịch bản, hãy thử lại");
  const plan = p.outline.episodes[no - 1];
  const episode = await upsertEpisode(
    c,
    p.id,
    no,
    ensureFiction({ ...d, title: d.title || plan.title, cliffhanger: d.cliffhanger || plan.cliffhanger }),
    true,
  );
  return c.json({ episode, check: parseScript(episode.script) });
});

writer.put("/projects/:id/episodes/:no", async (c) => {
  const p = await loadProject(c, c.req.param("id"));
  const no = epNo(c, p);
  const b = await readJson(c.req.raw);
  const d: EpisodeData = {
    title: str(b.title, "Tiêu đề tập", { max: 200 }),
    script: str(b.script, "Kịch bản", { max: 200_000 }),
    cliffhanger: str(b.cliffhanger, "Móc câu", { max: 1000 }),
    teaser: str(b.teaser, "Đoạn mồi", { max: 10_000 }),
    seoTitle: str(b.seoTitle, "Tiêu đề SEO", { max: 200 }),
    seoDescription: str(b.seoDescription, "Mô tả SEO", { max: 5000 }),
    hashtags: str(b.hashtags, "Hashtag", { max: 500 }),
  };
  const episode = await upsertEpisode(c, p.id, no, d, true);
  return c.json({ episode, check: parseScript(episode.script) });
});

writer.post("/projects/:id/episodes/:no/send", async (c) => {
  const p = await loadProject(c, c.req.param("id"));
  const no = epNo(c, p);
  const ep = await loadEpisode(c, p.id, no);
  if (!ep || !ep.script.trim()) throw bad("Tập này chưa có kịch bản");
  const check = parseScript(ep.script);
  if (check.issues.length) {
    const first = check.issues[0];
    throw bad(`Kịch bản còn ${check.issues.length} dòng sai định dạng (dòng ${first.line}: ${first.message})`);
  }
  if (!check.lines.some((l) => l.kind === "speech")) throw bad("Kịch bản chưa có lời thoại nào");
  const t = nowSec();
  await c.env.DB.prepare("UPDATE writer_episodes SET status = 'sent', sent_at = ?, updated_at = ? WHERE id = ?").bind(t, t, ep.id).run();
  return c.json({ id: ep.id, status: "sent", sentAt: t, roles: check.roles, estSeconds: check.estSeconds });
});

// ---------- Cho Xưởng audio ----------

async function studioScript(c: C, row: EpisodeRow & { p_title: string; p_characters: string; p_count: number }): Promise<StudioScript> {
  const check = parseScript(row.script);
  return {
    id: row.id,
    projectId: row.project_id,
    projectTitle: row.p_title,
    epNo: row.ep_no,
    episodeCount: row.p_count,
    title: row.title,
    script: row.script,
    teaser: row.teaser,
    characters: jsonOr<WriterCharacter[]>(row.p_characters, []),
    roles: check.roles,
    estSeconds: check.estSeconds,
    sentAt: row.sent_at,
    updatedAt: row.updated_at,
  };
}

const STUDIO_SELECT = `SELECT e.*, p.title AS p_title, p.characters AS p_characters, p.episode_count AS p_count
  FROM writer_episodes e JOIN writer_projects p ON p.id = e.project_id`;

writer.get("/scripts", async (c) => {
  const { results } = await c.env.DB.prepare(`${STUDIO_SELECT} WHERE e.status = 'sent' ORDER BY e.sent_at DESC LIMIT 200`).all<
    EpisodeRow & { p_title: string; p_characters: string; p_count: number }
  >();
  return c.json({ items: await Promise.all(results.map((r) => studioScript(c, r))) });
});

writer.get("/scripts/:id", async (c) => {
  const r = await c.env.DB.prepare(`${STUDIO_SELECT} WHERE e.id = ?`).bind(c.req.param("id")).first<
    EpisodeRow & { p_title: string; p_characters: string; p_count: number }
  >();
  if (!r) throw new HttpError(404, "Không tìm thấy kịch bản");
  return c.json(await studioScript(c, r));
});

export default writer;
