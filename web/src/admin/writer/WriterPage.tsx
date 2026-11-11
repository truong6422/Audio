// Trợ lý viết kịch bản: ý tưởng → dàn ý (sửa được) → kịch bản từng tập → gửi sang Xưởng audio.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { errMsg } from "../adminApi";
import { Badge, Button, Card, ConfirmDialog, Empty, ErrorBox, Field, Loading, TextArea, TextInput, cx, fmtDate, useToast } from "../ui";
import { parseScript } from "./format";
import type { Outline, OutlineEpisode, WriterCharacter, WriterEpisode, WriterProject } from "./types";
import { writerApi, type EpisodeData, type ProjectInput, type ProjectListItem, type ProviderInfo } from "./writerApi";

const GENRES = ["mẹ chồng nàng dâu", "ngoại tình", "báo thù", "gia sản", "tình cảm"];
/** Bộ vai chuẩn của Xưởng audio (docs/giong-doc-doi-thu.md mục 4.1). */
const VOICES = ["Mẹ chồng", "Nàng dâu", "Chồng", "Bố chồng / ông", "Trẻ con"];
const BUSY_HINT = "AI đang viết… có thể mất 1–3 phút, đừng đóng trang.";

const fmtMin = (s: number) => {
  const m = Math.floor(s / 60);
  return m ? `${m} phút ${s % 60 ? `${s % 60} giây` : ""}`.trim() : `${s} giây`;
};

async function copy(text: string, toast: ReturnType<typeof useToast>) {
  try {
    await navigator.clipboard.writeText(text);
    toast("ok", "Đã chép");
  } catch {
    toast("err", "Không chép được, hãy chọn và chép tay");
  }
}

/* ---------- Nút chọn một trong vài giá trị (thay select) ---------- */
function Choice<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            "h-9 rounded-lg border px-3 text-sm transition",
            value === o.value
              ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]"
              : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:border-[var(--accent)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* =========================================================
   Trang
   ========================================================= */
export default function WriterPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [provider, setProvider] = useState<ProviderInfo | null>(null);

  useEffect(() => {
    writerApi.config().then(setProvider, () => setProvider(null));
  }, []);

  return (
    <div className="space-y-4">
      {provider && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
          <span>Mô hình:</span>
          <Badge tone={provider.provider === "mock" ? "warn" : provider.ready ? "ok" : "warn"}>
            {provider.provider === "mock" ? "Mẫu thử (không gọi AI)" : `${provider.provider} · ${provider.model}${provider.ready ? "" : " · thiếu khoá"}`}
          </Badge>
          {provider.provider === "mock" && <span>Đặt WRITER_PROVIDER=claude hoặc gemini để dùng AI thật.</span>}
        </div>
      )}
      {creating ? (
        <IdeaForm
          onCancel={() => setCreating(false)}
          onSaved={(p) => {
            setCreating(false);
            setOpenId(p.id);
          }}
        />
      ) : openId ? (
        <ProjectView id={openId} onBack={() => setOpenId(null)} />
      ) : (
        <ProjectList onOpen={setOpenId} onNew={() => setCreating(true)} />
      )}
    </div>
  );
}

/* ---------- Danh sách dự án ---------- */
function ProjectList({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: () => void }) {
  const [items, setItems] = useState<ProjectListItem[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setError("");
    setItems(null);
    writerApi.list().then(
      (r) => setItems(r.items),
      (e) => setError(errMsg(e)),
    );
  }, []);
  useEffect(load, [load]);

  return (
    <Card
      title="Trợ lý viết kịch bản"
      actions={
        <Button kind="primary" onClick={onNew}>
          + Truyện mới
        </Button>
      }
    >
      {error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : !items ? (
        <Loading />
      ) : !items.length ? (
        <Empty>Chưa có truyện nào. Bấm "Truyện mới" để nhập ý tưởng.</Empty>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {items.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onOpen(p.id)} className="flex w-full flex-col gap-1 py-3 text-left hover:opacity-80">
                <span className="font-medium text-[var(--text)]">{p.title || p.idea.slice(0, 80)}</span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                  <Badge tone="muted">{p.genre}</Badge>
                  <span>
                    {p.written}/{p.episodeCount} tập đã viết
                  </span>
                  {p.sent > 0 && <Badge tone="ok">{p.sent} tập đã gửi Xưởng</Badge>}
                  <span>· {fmtDate(p.updatedAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------- Form ý tưởng (tạo / sửa) ---------- */
const emptyInput = (): ProjectInput => ({
  title: "",
  genre: GENRES[0],
  idea: "",
  characters: [
    { name: "", gender: "nữ", age: "", role: "nhân vật chính", voice: "Nàng dâu" },
    { name: "", gender: "nữ", age: "", role: "", voice: "" },
  ],
  episodeMinutes: 10,
  episodeCount: 5,
  pov: "ngoi3",
  ending: "co-hau",
  notes: "",
});

function IdeaForm({ project, onCancel, onSaved }: { project?: WriterProject; onCancel: () => void; onSaved: (p: WriterProject) => void }) {
  const toast = useToast();
  const [f, setF] = useState<ProjectInput>(() =>
    project
      ? {
          title: project.title,
          genre: project.genre,
          idea: project.idea,
          characters: project.characters,
          episodeMinutes: project.episodeMinutes,
          episodeCount: project.episodeCount,
          pov: project.pov,
          ending: project.ending,
          notes: project.notes,
        }
      : emptyInput(),
  );
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ProjectInput>(k: K, v: ProjectInput[K]) => setF((s) => ({ ...s, [k]: v }));
  const setChar = (i: number, patch: Partial<WriterCharacter>) => set("characters", f.characters.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const customGenre = !GENRES.includes(f.genre);

  async function save() {
    setBusy(true);
    try {
      const body = { ...f, characters: f.characters.filter((c) => c.name.trim()) };
      const p = project ? await writerApi.update(project.id, body) : await writerApi.create(body);
      toast("ok", "Đã lưu ý tưởng");
      onSaved(p);
    } catch (e) {
      toast("err", errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={project ? "Sửa ý tưởng" : "Ý tưởng truyện mới"}>
      <div className="space-y-4">
        <Field label="Thể loại">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {[...GENRES, "khác"].map((g) => {
                const active = g === "khác" ? customGenre : f.genre === g;
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => set("genre", g === "khác" ? "" : g)}
                    className={cx(
                      "h-9 rounded-full border px-3 text-sm",
                      active ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]" : "border-[var(--border)] text-[var(--text)]",
                    )}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
            {customGenre && <TextInput value={f.genre} onChange={(e) => set("genre", e.target.value)} placeholder="Thể loại khác, vd. bí ẩn gia đình" maxLength={60} />}
          </div>
        </Field>
        <Field label="Tên truyện" hint="Để trống thì AI đặt khi sinh dàn ý.">
          <TextInput value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={200} />
        </Field>
        <Field label="Ý tưởng" hint="Vài câu: ai, chuyện gì, mâu thuẫn chính, điều muốn người nghe cảm thấy.">
          <TextArea value={f.idea} onChange={(e) => set("idea", e.target.value)} rows={4} maxLength={4000} placeholder="Nàng dâu nghèo về làm dâu nhà giàu, mẹ chồng coi thường…" />
        </Field>

        <div>
          <div className="mb-2 text-sm font-medium text-[var(--text)]">Nhân vật</div>
          <div className="space-y-3">
            {f.characters.map((c, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-[var(--border)] p-3 sm:grid-cols-[1fr_auto_5rem_2fr_auto]">
                <TextInput value={c.name} onChange={(e) => setChar(i, { name: e.target.value })} placeholder="Tên" maxLength={40} />
                <Choice value={c.gender} options={[{ value: "nữ", label: "Nữ" }, { value: "nam", label: "Nam" }]} onChange={(v) => setChar(i, { gender: v })} />
                <TextInput value={c.age} onChange={(e) => setChar(i, { age: e.target.value })} placeholder="Tuổi" maxLength={20} />
                <TextInput value={c.role} onChange={(e) => setChar(i, { role: e.target.value })} placeholder="Vai trò, tính cách" maxLength={300} />
                <Button kind="ghost" small onClick={() => set("characters", f.characters.filter((_, j) => j !== i))} aria-label="Bỏ nhân vật">
                  Bỏ
                </Button>
                <div className="col-span-full flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-[var(--muted)]">Vai chuẩn (gán giọng):</span>
                  {VOICES.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setChar(i, { voice: c.voice === v ? "" : v })}
                      className={cx(
                        "h-7 rounded-full border px-2.5 text-xs",
                        c.voice === v ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]" : "border-[var(--border)] text-[var(--muted)]",
                      )}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {f.characters.length < 12 && (
            <Button small className="mt-2" onClick={() => set("characters", [...f.characters, { name: "", gender: "nữ", age: "", role: "", voice: "" }])}>
              + Thêm nhân vật
            </Button>
          )}
          <p className="mt-1 text-xs text-[var(--muted)]">Nhân vật đầu tiên là nhân vật chính (người kể khi chọn ngôi thứ nhất). Để trống thì AI tự đặt.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Số tập">
            <TextInput type="number" min={1} max={30} value={f.episodeCount} onChange={(e) => set("episodeCount", Number(e.target.value))} />
          </Field>
          <Field label="Độ dài mỗi tập (phút)">
            <TextInput type="number" min={3} max={40} value={f.episodeMinutes} onChange={(e) => set("episodeMinutes", Number(e.target.value))} />
          </Field>
        </div>
        <Field label="Giọng kể">
          <Choice value={f.pov} options={[{ value: "ngoi3", label: "Ngôi thứ ba (Người kể)" }, { value: "ngoi1", label: "Ngôi thứ nhất (tôi)" }]} onChange={(v) => set("pov", v)} />
        </Field>
        <Field label="Kiểu kết">
          <Choice value={f.ending} options={[{ value: "co-hau", label: "Có hậu" }, { value: "twist", label: "Twist bất ngờ" }]} onChange={(v) => set("ending", v)} />
        </Field>
        <Field label="Ghi chú cho AI" hint="Không bắt buộc: bối cảnh, vùng miền, điều cần tránh…">
          <TextArea value={f.notes} onChange={(e) => set("notes", e.target.value)} rows={2} maxLength={2000} />
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onCancel} disabled={busy}>
            Huỷ
          </Button>
          <Button kind="primary" busy={busy} onClick={save} disabled={!f.genre.trim() || f.idea.trim().length < 10}>
            Lưu ý tưởng
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* ---------- Một dự án ---------- */
function ProjectView({ id, onBack }: { id: string; onBack: () => void }) {
  const toast = useToast();
  const [project, setProject] = useState<WriterProject | null>(null);
  const [episodes, setEpisodes] = useState<WriterEpisode[]>([]);
  const [error, setError] = useState("");
  const [editIdea, setEditIdea] = useState(false);
  const [epNo, setEpNo] = useState(1);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    setError("");
    writerApi.get(id).then(
      (r) => {
        setProject(r.project);
        setEpisodes(r.episodes);
      },
      (e) => setError(errMsg(e)),
    );
  }, [id]);
  useEffect(load, [load]);

  const putEpisode = (ep: WriterEpisode) => setEpisodes((s) => [...s.filter((x) => x.epNo !== ep.epNo), ep].sort((a, b) => a.epNo - b.epNo));

  async function del() {
    setDeleting(true);
    try {
      await writerApi.remove(id);
      toast("ok", "Đã xoá truyện");
      onBack();
    } catch (e) {
      toast("err", errMsg(e));
      setDeleting(false);
    }
  }

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!project) return <Loading />;

  const outlineEps = project.outline?.episodes ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button kind="ghost" small onClick={onBack}>
          ← Danh sách truyện
        </Button>
        <Button kind="ghost" small onClick={() => setConfirmDel(true)} className="text-[var(--danger)]">
          Xoá truyện
        </Button>
      </div>

      {editIdea ? (
        <IdeaForm
          project={project}
          onCancel={() => setEditIdea(false)}
          onSaved={(p) => {
            setProject(p);
            setEditIdea(false);
          }}
        />
      ) : (
        <Card
          title={project.title || "Truyện chưa đặt tên"}
          actions={
            <Button small onClick={() => setEditIdea(true)}>
              Sửa ý tưởng
            </Button>
          }
        >
          <div className="space-y-2 text-sm text-[var(--text)]">
            <div className="flex flex-wrap gap-2">
              <Badge tone="muted">{project.genre}</Badge>
              <Badge tone="muted">
                {project.episodeCount} tập × {project.episodeMinutes} phút
              </Badge>
              <Badge tone="muted">{project.pov === "ngoi1" ? "Ngôi thứ nhất" : "Ngôi thứ ba"}</Badge>
              <Badge tone="muted">{project.ending === "twist" ? "Kết twist" : "Kết có hậu"}</Badge>
            </div>
            <p className="whitespace-pre-wrap">{project.idea}</p>
            {project.characters.length > 0 && (
              <p className="text-[var(--muted)]">Nhân vật: {project.characters.map((c) => `${c.name} (${c.gender}${c.age ? `, ${c.age}` : ""})`).join(" · ")}</p>
            )}
          </div>
        </Card>
      )}

      <OutlineEditor project={project} onChange={setProject} />

      {outlineEps.length > 0 && (
        <Card title="Kịch bản từng tập">
          <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
            {outlineEps.map((e) => {
              const ep = episodes.find((x) => x.epNo === e.no);
              return (
                <button
                  key={e.no}
                  type="button"
                  onClick={() => setEpNo(e.no)}
                  className={cx(
                    "flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm",
                    epNo === e.no ? "border-[var(--accent)] text-[var(--text)]" : "border-[var(--border)] text-[var(--muted)]",
                  )}
                >
                  Tập {e.no}
                  <span
                    aria-hidden
                    className={cx(
                      "h-2 w-2 rounded-full",
                      ep?.status === "sent" ? "bg-[var(--success)]" : ep?.script ? "bg-[var(--accent-2)]" : "bg-[var(--border)]",
                    )}
                  />
                </button>
              );
            })}
          </div>
          {epNo <= outlineEps.length && (
            <EpisodeEditor
              key={`${project.id}-${epNo}`}
              project={project}
              plan={outlineEps[epNo - 1]}
              episode={episodes.find((x) => x.epNo === epNo) ?? null}
              onSaved={putEpisode}
            />
          )}
        </Card>
      )}

      <ConfirmDialog
        open={confirmDel}
        title="Xoá truyện này?"
        message="Dàn ý và mọi kịch bản tập sẽ bị xoá. Kịch bản đã gửi Xưởng audio cũng không còn đọc được."
        busy={deleting}
        onConfirm={del}
        onCancel={() => setConfirmDel(false)}
      />
    </div>
  );
}

/* ---------- Dàn ý ---------- */
function OutlineEditor({ project, onChange }: { project: WriterProject; onChange: (p: WriterProject) => void }) {
  const toast = useToast();
  const [o, setO] = useState<Outline | null>(project.outline);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"" | "gen" | "save">("");
  const [confirmGen, setConfirmGen] = useState(false);

  useEffect(() => {
    setO(project.outline);
    setDirty(false);
  }, [project.outline]);

  const edit = (patch: Partial<Outline>) => {
    setO((s) => (s ? { ...s, ...patch } : s));
    setDirty(true);
  };
  const editEp = (i: number, patch: Partial<OutlineEpisode>) => o && edit({ episodes: o.episodes.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  const renumber = (eps: OutlineEpisode[]) => eps.map((e, i) => ({ ...e, no: i + 1 }));

  async function gen() {
    setConfirmGen(false);
    setBusy("gen");
    try {
      onChange(await writerApi.genOutline(project.id));
      toast("ok", "Đã sinh dàn ý");
    } catch (e) {
      toast("err", errMsg(e));
    } finally {
      setBusy("");
    }
  }
  async function save() {
    if (!o) return;
    setBusy("save");
    try {
      onChange(await writerApi.update(project.id, { outline: o }));
      toast("ok", "Đã lưu dàn ý");
    } catch (e) {
      toast("err", errMsg(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <Card
      title="Dàn ý"
      actions={
        <>
          <Button small kind={o ? "outline" : "primary"} busy={busy === "gen"} disabled={!!busy} onClick={() => (o ? setConfirmGen(true) : gen())}>
            {o ? "Sinh lại dàn ý" : "Sinh dàn ý bằng AI"}
          </Button>
          {o && (
            <Button small kind="primary" busy={busy === "save"} disabled={!!busy || !dirty} onClick={save}>
              Lưu dàn ý
            </Button>
          )}
        </>
      }
    >
      {busy === "gen" ? (
        <Loading text={BUSY_HINT} />
      ) : !o ? (
        <Empty>Chưa có dàn ý. Bấm "Sinh dàn ý bằng AI" để AI chia truyện thành {project.episodeCount} tập.</Empty>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tên truyện">
              <TextInput value={o.title} onChange={(e) => edit({ title: e.target.value })} maxLength={200} />
            </Field>
            <Field label="Tiêu đề SEO (cả bộ)">
              <TextInput value={o.seoTitle} onChange={(e) => edit({ seoTitle: e.target.value })} maxLength={200} />
            </Field>
          </div>
          <Field label="Logline">
            <TextArea value={o.logline} onChange={(e) => edit({ logline: e.target.value })} rows={2} className="min-h-0" maxLength={500} />
          </Field>
          <Field label="Mô tả SEO (cả bộ)">
            <TextArea value={o.seoDescription} onChange={(e) => edit({ seoDescription: e.target.value })} rows={3} maxLength={2000} />
          </Field>
          <ol className="space-y-3">
            {o.episodes.map((e, i) => (
              <li key={i} className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-sm font-semibold text-[var(--accent)]">Tập {e.no}</span>
                  <TextInput value={e.title} onChange={(ev) => editEp(i, { title: ev.target.value })} placeholder="Tiêu đề tập" maxLength={200} />
                  <Button
                    kind="ghost"
                    small
                    disabled={o.episodes.length <= 1}
                    onClick={() => edit({ episodes: renumber(o.episodes.filter((_, j) => j !== i)) })}
                    aria-label={`Bỏ tập ${e.no}`}
                  >
                    Bỏ
                  </Button>
                </div>
                <TextArea value={e.summary} onChange={(ev) => editEp(i, { summary: ev.target.value })} rows={3} placeholder="Tóm tắt diễn biến" maxLength={3000} />
                <TextInput value={e.cliffhanger} onChange={(ev) => editEp(i, { cliffhanger: ev.target.value })} placeholder="Móc câu cuối tập" maxLength={1000} />
              </li>
            ))}
          </ol>
          {o.episodes.length < 30 && (
            <Button small onClick={() => edit({ episodes: renumber([...o.episodes, { no: 0, title: "", summary: "", cliffhanger: "" }]) })}>
              + Thêm tập
            </Button>
          )}
          {dirty && <p className="text-xs text-[var(--accent-2)]">Dàn ý có thay đổi chưa lưu — lưu trước khi sinh kịch bản để AI dùng bản mới.</p>}
        </div>
      )}
      <ConfirmDialog
        open={confirmGen}
        title="Sinh lại dàn ý?"
        message="Dàn ý hiện tại sẽ bị thay bằng bản AI mới. Kịch bản các tập đã viết vẫn giữ nguyên."
        confirmText="Sinh lại"
        onConfirm={gen}
        onCancel={() => setConfirmGen(false)}
      />
    </Card>
  );
}

/* ---------- Soạn một tập ---------- */
const toData = (e: WriterEpisode | null, plan: OutlineEpisode): EpisodeData => ({
  title: e?.title || plan.title,
  script: e?.script ?? "",
  cliffhanger: e?.cliffhanger || plan.cliffhanger,
  teaser: e?.teaser ?? "",
  seoTitle: e?.seoTitle ?? "",
  seoDescription: e?.seoDescription ?? "",
  hashtags: e?.hashtags ?? "",
});

function EpisodeEditor({
  project,
  plan,
  episode,
  onSaved,
}: {
  project: WriterProject;
  plan: OutlineEpisode;
  episode: WriterEpisode | null;
  onSaved: (e: WriterEpisode) => void;
}) {
  const toast = useToast();
  const [d, setD] = useState<EpisodeData>(() => toData(episode, plan));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"" | "gen" | "save" | "send">("");
  const [confirmGen, setConfirmGen] = useState(false);
  const [sentId, setSentId] = useState<string | null>(episode?.status === "sent" ? episode.id : null);

  const set = <K extends keyof EpisodeData>(k: K, v: EpisodeData[K]) => {
    setD((s) => ({ ...s, [k]: v }));
    setDirty(true);
  };
  const check = useMemo(() => parseScript(d.script), [d.script]);
  const teaserCheck = useMemo(() => parseScript(d.teaser), [d.teaser]);
  const status = dirty ? "Chưa lưu" : episode?.status === "sent" ? "Đã gửi Xưởng" : episode?.script ? "Bản nháp" : "Chưa viết";

  const apply = (ep: WriterEpisode) => {
    onSaved(ep);
    setD(toData(ep, plan));
    setDirty(false);
    setSentId(ep.status === "sent" ? ep.id : null);
  };

  async function gen() {
    setConfirmGen(false);
    setBusy("gen");
    try {
      const r = await writerApi.genEpisode(project.id, plan.no);
      apply(r.episode);
      toast("ok", r.check.issues.length ? `Đã sinh tập ${plan.no} — còn ${r.check.issues.length} dòng cần sửa định dạng` : `Đã sinh tập ${plan.no}`);
    } catch (e) {
      toast("err", errMsg(e));
    } finally {
      setBusy("");
    }
  }
  async function save(): Promise<boolean> {
    setBusy("save");
    try {
      apply((await writerApi.saveEpisode(project.id, plan.no, d)).episode);
      toast("ok", "Đã lưu");
      return true;
    } catch (e) {
      toast("err", errMsg(e));
      return false;
    } finally {
      setBusy("");
    }
  }
  async function send() {
    if (dirty && !(await save())) return;
    setBusy("send");
    try {
      const r = await writerApi.sendEpisode(project.id, plan.no);
      setSentId(r.id);
      if (episode) onSaved({ ...episode, status: "sent", sentAt: r.sentAt });
      toast("ok", "Đã gửi sang Xưởng audio");
    } catch (e) {
      toast("err", errMsg(e));
    } finally {
      setBusy("");
    }
  }

  if (busy === "gen") return <Loading text={BUSY_HINT} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[var(--text)]">
            Tập {plan.no}: {plan.title}
          </div>
          <div className="text-xs text-[var(--muted)]">{status}</div>
        </div>
        <Button kind={d.script ? "outline" : "primary"} small disabled={!!busy} onClick={() => (d.script ? setConfirmGen(true) : gen())}>
          {d.script ? "Sinh lại bằng AI" : `Sinh kịch bản tập ${plan.no}`}
        </Button>
      </div>

      <Field label="Tiêu đề tập">
        <TextInput value={d.title} onChange={(e) => set("title", e.target.value)} maxLength={200} />
      </Field>

      <Field label="Kịch bản" hint={<FormatHint />}>
        <TextArea
          value={d.script}
          onChange={(e) => set("script", e.target.value)}
          spellCheck={false}
          className="min-h-[55vh] font-mono text-[13px] leading-relaxed"
          placeholder={"[Người dẫn] Đêm ấy mưa to lắm.\n[Lan|thì thầm] Ai đấy?\n(nghỉ 1.5s)\n{nhạc: căng thẳng}\n{hiệu ứng: cửa mở}"}
        />
      </Field>
      {d.script.trim() && <CheckPanel check={check} target={project.episodeMinutes * 60} />}

      <Field label="Móc câu cuối tập">
        <TextInput value={d.cliffhanger} onChange={(e) => set("cliffhanger", e.target.value)} maxLength={1000} />
      </Field>

      <Field label="Đoạn mồi TikTok (30–60 giây)" hint="Cùng định dạng kịch bản; Xưởng audio dựng được thành clip riêng.">
        <TextArea value={d.teaser} onChange={(e) => set("teaser", e.target.value)} rows={6} spellCheck={false} className="font-mono text-[13px]" />
      </Field>
      {d.teaser.trim() && (
        <p className={cx("text-xs", teaserCheck.issues.length || teaserCheck.estSeconds > 70 ? "text-[var(--accent-2)]" : "text-[var(--muted)]")}>
          Mồi ≈ {fmtMin(teaserCheck.estSeconds)}
          {teaserCheck.issues.length ? ` · ${teaserCheck.issues.length} dòng sai định dạng` : ""}
          {teaserCheck.estSeconds > 70 ? " · hơi dài cho TikTok" : ""}
        </p>
      )}

      <div className="space-y-3 rounded-lg border border-[var(--border)] p-3">
        <div className="text-sm font-medium text-[var(--text)]">SEO</div>
        <CopyField label="Tiêu đề SEO" value={d.seoTitle} onChange={(v) => set("seoTitle", v)} onCopy={() => copy(d.seoTitle, toast)} />
        <Field label="Mô tả SEO">
          <TextArea value={d.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} rows={3} maxLength={5000} />
        </Field>
        <div className="flex justify-end">
          <Button small kind="ghost" disabled={!d.seoDescription} onClick={() => copy(`${d.seoDescription}\n\n${d.hashtags}`.trim(), toast)}>
            Chép mô tả + hashtag
          </Button>
        </div>
        <CopyField label="Hashtag" value={d.hashtags} onChange={(v) => set("hashtags", v)} onCopy={() => copy(d.hashtags, toast)} />
      </div>

      {sentId && !dirty && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--success)] px-3 py-2 text-sm text-[var(--success)]">
          <span>Đã gửi Xưởng audio · mã kịch bản:</span>
          <code className="break-all font-mono text-xs">{sentId}</code>
          <Button small kind="ghost" onClick={() => copy(sentId, toast)}>
            Chép mã
          </Button>
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-wrap justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:-mx-5 sm:px-5">
        <Button busy={busy === "save"} disabled={!!busy || !dirty} onClick={save}>
          Lưu
        </Button>
        <Button kind="primary" busy={busy === "send"} disabled={!!busy || !d.script.trim() || check.issues.length > 0} onClick={send}>
          Gửi sang Xưởng audio
        </Button>
      </div>

      <ConfirmDialog
        open={confirmGen}
        title={`Sinh lại tập ${plan.no}?`}
        message="Kịch bản, đoạn mồi và SEO của tập này sẽ bị thay bằng bản AI mới. Phần đã sửa tay sẽ mất."
        confirmText="Sinh lại"
        onConfirm={gen}
        onCancel={() => setConfirmGen(false)}
      />
    </div>
  );
}

function CheckPanel({ check, target }: { check: ReturnType<typeof parseScript>; target: number }) {
  const ratio = target ? check.estSeconds / target : 1;
  return (
    <div className="space-y-2 rounded-lg bg-[var(--surface-2)] p-3 text-xs text-[var(--muted)]">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span className={ratio < 0.75 || ratio > 1.3 ? "text-[var(--accent-2)]" : ""}>
          ≈ {fmtMin(check.estSeconds)} (mục tiêu {fmtMin(target)})
        </span>
        <span>{check.words.toLocaleString("vi-VN")} tiếng</span>
        <span>{check.lines.length} dòng</span>
        {check.issues.length ? <span className="text-[var(--danger)]">{check.issues.length} dòng sai định dạng</span> : <span className="text-[var(--success)]">Đúng định dạng</span>}
      </div>
      {check.roles.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span>Vai:</span>
          {check.roles.map((r) => (
            <Badge key={r} tone="muted">
              {r}
            </Badge>
          ))}
        </div>
      )}
      {check.issues.length > 0 && (
        <ul className="space-y-1 text-[var(--danger)]">
          {check.issues.slice(0, 6).map((i) => (
            <li key={i.line} className="break-words">
              Dòng {i.line}: {i.message} — <span className="font-mono">{i.raw.slice(0, 60)}</span>
            </li>
          ))}
          {check.issues.length > 6 && <li>… và {check.issues.length - 6} dòng khác</li>}
        </ul>
      )}
      {check.warnings.length > 0 && (
        <ul className="space-y-1 text-[var(--accent-2)]">
          {check.warnings.slice(0, 4).map((w, k) => (
            <li key={k} className="break-words">
              Dòng {w.line}: {w.message}
            </li>
          ))}
          {check.warnings.length > 4 && <li>… và {check.warnings.length - 4} lưu ý khác</li>}
        </ul>
      )}
    </div>
  );
}

function CopyField({ label, value, onChange, onCopy }: { label: string; value: string; onChange: (v: string) => void; onCopy: () => void }) {
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <TextInput value={value} onChange={(e) => onChange(e.target.value)} maxLength={500} />
        <Button small kind="ghost" className="h-10 shrink-0" disabled={!value} onClick={onCopy}>
          Chép
        </Button>
      </div>
    </Field>
  );
}

function FormatHint(): ReactNode {
  return (
    <span>
      Mỗi dòng một dạng: <code>[Vai] lời</code> · <code>[Vai|cảm xúc] lời</code> · <code>(nghỉ 1.5s)</code> · <code>{"{nhạc: buồn}"}</code> ·{" "}
      <code>{"{hiệu ứng: mưa}"}</code> · <code>---</code> chuyển cảnh. Lời dẫn dùng vai <code>[Người dẫn]</code>.
    </span>
  );
}
