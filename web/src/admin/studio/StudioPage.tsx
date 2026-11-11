// Xưởng audio: soạn kịch bản → gán giọng → tạo giọng từng lời (worker /api/admin/studio) → ghép + nhạc nền + chuẩn hoá
// trên trình duyệt → đăng thành track. Gắn: <Route path="studio" element={<StudioPage />} /> + tab "Xưởng audio".
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminApi } from "../adminApi";
import { Badge, Button, Card, ConfirmDialog, ErrorBox, Field, Loading, Modal, Picker, ProgressBar, TextArea, TextInput, useToast } from "../ui";
import { DEFAULT_MIX, fmt, mixAll, wavSize, type MixOptions, type MixResult } from "./mixer";
import { LibraryPanel, RolesTable, SegmentList, WriterImportModal } from "./panels";
import ScriptEditor from "./ScriptEditor";
import {
  errText,
  libSlug,
  studioApi,
  StudioError,
  type Estimate,
  type JobPayload,
  type LibraryItem,
  type ParseResult,
  type ProviderId,
  type ProvidersResponse,
  type RoleVoice,
  type StudioJob,
  type StudioSegment,
  type WriterScript,
} from "./studioApi";

const SAMPLE = `# Đêm mưa ở phố cũ
@nhạc buồn vol=0.08 fade=3

## Chương 1 — Người về
[sfx mưa vol=0.3 loop until=chương]
Người dẫn: Đêm ấy trời mưa tầm tã. Con phố cũ chỉ còn ánh đèn vàng hắt xuống mặt đường loang loáng…
[nghỉ 1.2]
[sfx gõ cửa]
Lan (thì thầm, run rẩy): Anh… anh về rồi à?
Hùng (giận, quát): Cô còn dám hỏi câu đó sao?!
Lan (khóc nấc): Em xin lỗi… <sigh> em đã đợi anh suốt 10 năm.
[Mẹ chồng|lạnh lùng] Về rồi thì vào nhà. Đứng đó cho hàng xóm cười à?
`;

const FORMATS = [
  { value: "24000-1", label: "24 kHz · mono (nhẹ, đích −19 LUFS)" },
  { value: "44100-2", label: "44,1 kHz · stereo (đích −16 LUFS)" },
  { value: "48000-2", label: "48 kHz · stereo (đích −16 LUFS)" },
];

/** Tên riêng nữ phổ biến — giữ đồng bộ với FEMALE_NAMES ở worker/src/tts/routes.ts. */
const FEMALE_NAMES = new Set(
  "lan hoa mai hương linh ngọc trang thảo hằng nga thu hạnh yến nhung vy my vân loan phương hà huyền trinh uyên quyên diệp thúy thuý tuyết nhi ngân châu xuân hồng cúc liên oanh dung duyên giang hiền thơ trâm quỳnh diễm kiều ly thư hân nhàn tuyền thắm lụa đào".split(" "),
);

/** Tốc độ gợi ý theo vai chuẩn của Trợ lý viết (docs/giong-doc-doi-thu.md 4.1). */
const STD_SPEED: Record<string, number> = { "dẫn chuyện": 0.92, "mẹ chồng": 1, "nàng dâu": 0.97, chồng: 0.97, "bố chồng / ông": 0.9, "trẻ con": 1.02 };

type Snapshot = { title: string; script: string; provider: ProviderId; voices: string };

export default function StudioPage() {
  const toast = useToast();
  const [prov, setProv] = useState<ProvidersResponse | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [jobs, setJobs] = useState<StudioJob[]>([]);
  const [library, setLibrary] = useState<LibraryItem[] | null>(null);

  const [jobId, setJobId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [provider, setProvider] = useState<ProviderId>("mock");
  const [voices, setVoices] = useState<Record<string, RoleVoice>>({});
  const [segments, setSegments] = useState<StudioSegment[]>([]);
  const [items, setItems] = useState<JobPayload["items"]>([]);
  const [saved, setSaved] = useState<Snapshot | null>(null);
  const [parse, setParse] = useState<ParseResult | null>(null);
  const [saving, setSaving] = useState(false);

  const [genRunning, setGenRunning] = useState(false);
  const [busyN, setBusyN] = useState<Set<number>>(new Set());
  const stopGen = useRef(false);
  const [confirmCost, setConfirmCost] = useState<{ est: Estimate; resolve: (ok: boolean) => void } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const player = useRef<HTMLAudioElement>(null);
  const [playingN, setPlayingN] = useState<number | null>(null);

  const [mixOpt, setMixOpt] = useState<MixOptions>(DEFAULT_MIX);
  const [mixing, setMixing] = useState<{ stage: string; frac: number } | null>(null);
  const mixAbort = useRef<AbortController | null>(null);
  const [mix, setMix] = useState<(MixResult & { url: string }) | null>(null);

  const [pub, setPub] = useState({ title: "", description: "", episodeCount: 1 });
  const [publishing, setPublishing] = useState<number | null>(null);
  const [published, setPublished] = useState<string | null>(null);

  const providerInfo = prov?.providers.find((p) => p.id === provider);
  const effectiveProvider = prov?.live ? provider : "mock";
  const effInfo = prov?.providers.find((p) => p.id === effectiveProvider);

  /* ---------- nạp ban đầu ---------- */
  const loadAll = useCallback(async () => {
    setLoadErr("");
    try {
      const [p, j] = await Promise.all([studioApi.providers(), studioApi.jobs()]);
      setProv(p);
      setJobs(j.jobs);
    } catch (e) {
      setLoadErr(errText(e));
    }
    studioApi
      .library()
      .then((r) => setLibrary(r.items))
      .catch(() => setLibrary([]));
  }, []);
  useEffect(() => {
    loadAll();
  }, [loadAll]);
  useEffect(
    () => () => {
      if (mix?.url) URL.revokeObjectURL(mix.url);
    },
    [mix],
  );

  /* ---------- phân tích (trễ 400 ms) ---------- */
  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(() => {
      studioApi
        .parse(script, ctl.signal)
        .then(setParse)
        .catch(() => {});
    }, 400);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [script]);

  const roles = parse?.roles ?? [];
  const dirty = !saved || saved.title !== title || saved.script !== script || saved.provider !== provider || saved.voices !== JSON.stringify(voices);

  const applyPayload = (p: JobPayload) => {
    setJobId(p.job.id);
    setTitle(p.job.title);
    setScript(p.job.script);
    setProvider(p.job.provider);
    setVoices(p.job.voices);
    setSegments(p.segments);
    setItems(p.items);
    setSaved({ title: p.job.title, script: p.job.script, provider: p.job.provider, voices: JSON.stringify(p.job.voices) });
    setJobs((js) => [p.job, ...js.filter((j) => j.id !== p.job.id)]);
  };

  const resetMix = () => {
    setMix(null);
    setPublished(null);
  };

  const openJob = async (id: string) => {
    if (!id) return newJob();
    try {
      const p = await studioApi.job(id);
      applyPayload(p);
      resetMix();
      setPub((s) => ({ ...s, title: p.job.title }));
    } catch (e) {
      toast("err", errText(e));
    }
  };

  const newJob = (preset?: { title: string; script: string; voices: Record<string, RoleVoice> }) => {
    setJobId(null);
    setTitle(preset?.title ?? "");
    setScript(preset?.script ?? "");
    setVoices(preset?.voices ?? {});
    setSegments([]);
    setItems([]);
    setSaved(null);
    resetMix();
    setPub({ title: preset?.title ?? "", description: "", episodeCount: 1 });
  };

  const save = async (): Promise<JobPayload | null> => {
    if (!script.trim()) {
      toast("err", "Kịch bản đang trống");
      return null;
    }
    setSaving(true);
    try {
      const body = { title: title.trim() || parse?.title || "Kịch bản chưa đặt tên", script, provider, voices };
      const p = jobId ? await studioApi.saveJob(jobId, body) : await studioApi.createJob(body);
      applyPayload(p);
      resetMix();
      if (p.parse?.warnings.length) toast("err", `Đã lưu — ${p.parse.warnings.length} cảnh báo trong kịch bản`);
      else toast("ok", "Đã lưu kịch bản");
      return p;
    } catch (e) {
      toast("err", errText(e));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const removeJob = async () => {
    if (!jobId) return;
    try {
      await studioApi.deleteJob(jobId);
      setJobs((js) => js.filter((j) => j.id !== jobId));
      newJob();
      toast("ok", "Đã xoá phiên");
    } catch (e) {
      toast("err", errText(e));
    } finally {
      setConfirmDelete(false);
    }
  };

  /* ---------- giọng mặc định cho vai (giống máy chủ voiceFor) ---------- */
  const effectiveVoice = useCallback(
    (role: string): RoleVoice => {
      const d = effInfo?.defaultVoice ?? { narrator: "", female: "", male: "" };
      const hint = parse?.cast[role];
      const hintOk = hint && (!hint.provider || hint.provider === effectiveProvider);
      // Giống máy chủ isFemaleRole (worker/src/tts/routes.ts): từ chỉ nữ, "o", hoặc tên nữ phổ biến ở từ cuối.
      const words = role.toLowerCase().trim().split(/\s+/);
      const female =
        /(mẹ|má|bà|cô|chị|em gái|con gái|vợ|nàng|thím|mợ|dì|nữ|cháu gái|bé gái|dâu)/i.test(role) ||
        words[0] === "o" ||
        FEMALE_NAMES.has(words[words.length - 1] ?? "");
      const elder = /(mẹ chồng|mẹ vợ|bố chồng|bố vợ|bà|ông|cụ|bác|già|lão|mẹ|bố|cha|má)/i.test(role);
      const fallback =
        role === prov?.narrator ? d.narrator : female ? (elder && d.elderFemale) || d.female : (elder && d.elderMale) || d.male;
      return { voice: (hintOk ? hint.voice : "") || fallback, speed: hint?.speed ?? 1, persona: hint?.persona ?? "" };
    },
    [effInfo, parse, effectiveProvider, prov],
  );

  /* ---------- nhập từ Trợ lý viết ---------- */
  const importWriter = (s: WriterScript) => {
    const info = prov?.providers.find((p) => p.id === provider);
    const d = info?.defaultVoice ?? { narrator: "", female: "", male: "" };
    const v: Record<string, RoleVoice> = {};
    for (const ch of s.characters) {
      v[ch.name] = {
        voice: (() => {
          const elder = Number(ch.age) >= 50 || /(mẹ chồng|mẹ vợ|bố chồng|bố vợ|bà|ông|cụ|bác|già)/i.test(`${ch.name} ${ch.voice}`);
          return ch.gender === "nữ" ? (elder && d.elderFemale) || d.female : (elder && d.elderMale) || d.male;
        })(),
        speed: STD_SPEED[ch.voice.toLowerCase()] ?? 1,
        persona: [ch.voice, ch.gender, ch.age && `${ch.age} tuổi`, ch.role].filter(Boolean).join(", "),
      };
    }
    if (prov?.narrator && !v[prov.narrator]) v[prov.narrator] = { voice: d.narrator, speed: STD_SPEED["dẫn chuyện"]!, persona: "người dẫn chuyện, ấm, rõ dấu" };
    newJob({ title: `${s.projectTitle} — Tập ${s.epNo}${s.title ? `: ${s.title}` : ""}`, script: s.script, voices: v });
    setPub({ title: `${s.projectTitle} — Tập ${s.epNo}`, description: s.teaser, episodeCount: 1 });
    setImportOpen(false);
    toast("ok", "Đã nhập kịch bản — kiểm bảng vai rồi bấm Lưu");
  };

  /* ---------- tạo giọng ---------- */
  const updateSeg = (s: StudioSegment) => setSegments((list) => list.map((x) => (x.n === s.n ? s : x)));
  const markBusy = (n: number, on: boolean) =>
    setBusyN((prev) => {
      const next = new Set(prev);
      if (on) next.add(n);
      else next.delete(n);
      return next;
    });

  const generateAll = async () => {
    let p: JobPayload | null = null;
    if (dirty || !jobId) p = await save();
    const id = p?.job.id ?? jobId;
    if (!id) return;
    const segs = p?.segments ?? segments;
    let est: Estimate;
    try {
      est = await studioApi.estimate(id);
    } catch (e) {
      toast("err", errText(e));
      return;
    }
    if (est.usd > 0) {
      const ok = await new Promise<boolean>((resolve) => setConfirmCost({ est, resolve }));
      setConfirmCost(null);
      if (!ok) return;
    }
    const todo = segs.filter((s) => s.status !== "done").map((s) => s.n);
    if (!todo.length) return toast("ok", "Mọi lời đã có giọng");
    stopGen.current = false;
    setGenRunning(true);
    let fatal = "";
    let failed = 0;
    const worker = async () => {
      while (!stopGen.current && !fatal) {
        const n = todo.shift();
        if (n === undefined) return;
        markBusy(n, true);
        try {
          const r = await studioApi.generate(id, n);
          updateSeg(r.segment);
        } catch (e) {
          failed++;
          const st = e instanceof StudioError ? e.status : 0;
          if (st === 402 || st === 400 || st === 401 || st === 403) fatal = errText(e);
          setSegments((list) => list.map((x) => (x.n === n ? { ...x, status: "error", error: errText(e) } : x)));
        } finally {
          markBusy(n, false);
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setGenRunning(false);
    if (fatal) toast("err", fatal);
    else if (stopGen.current) toast("ok", "Đã dừng — bấm Tạo giọng để tiếp tục phần còn lại");
    else if (failed) toast("err", `${failed} lời lỗi — bấm ↻ để thử lại`);
    else toast("ok", "Đã tạo giọng xong");
  };

  const regen = async (s: StudioSegment) => {
    if (!jobId) return;
    if (dirty) return toast("err", "Kịch bản đã sửa — bấm Lưu trước khi tạo lại");
    markBusy(s.n, true);
    try {
      const r = await studioApi.generate(jobId, s.n, true);
      updateSeg(r.segment);
      resetMix();
    } catch (e) {
      toast("err", errText(e));
    } finally {
      markBusy(s.n, false);
    }
  };

  const play = (s: StudioSegment) => {
    const a = player.current;
    if (!a || !jobId) return;
    if (playingN === s.n) {
      a.pause();
      setPlayingN(null);
      return;
    }
    a.src = studioApi.segmentUrl(jobId, s.n, s.hash);
    a.play().then(
      () => setPlayingN(s.n),
      () => toast("err", "Không phát được"),
    );
  };

  /* ---------- ghép ---------- */
  const doneCount = segments.filter((s) => s.status === "done").length;
  const allDone = segments.length > 0 && doneCount === segments.length && !dirty;

  const runMix = async () => {
    if (!jobId || !allDone) return;
    const ctl = new AbortController();
    mixAbort.current = ctl;
    resetMix();
    setMixing({ stage: "Chuẩn bị", frac: 0 });
    const libIndex = new Map((library ?? []).map((it) => [`${it.kind}:${it.name}`, it]));
    const segByN = new Map(segments.map((s) => [s.n, s]));
    try {
      const res = await mixAll(
        {
          items,
          durations: new Map(segments.map((s) => [s.n, s.durationMs])),
          fetchSegment: async (n) => {
            const s = segByN.get(n)!;
            const r = await fetch(studioApi.segmentUrl(jobId, n, s.hash), { credentials: "include", signal: ctl.signal });
            if (!r.ok) throw new Error(`Không tải được lời ${n + 1}`);
            return r.arrayBuffer();
          },
          fetchLibrary: async (kind, name) => {
            const slug = libSlug(name);
            if (!libIndex.has(`${kind}:${slug}`)) return null;
            const r = await fetch(studioApi.libraryUrl(kind, slug), { credentials: "include", signal: ctl.signal });
            return r.ok ? r.arrayBuffer() : null;
          },
        },
        mixOpt,
        (stage, frac) => setMixing({ stage, frac }),
        ctl.signal,
      );
      setMix({ ...res, url: URL.createObjectURL(res.blob) });
      setPub((p) => ({ ...p, title: p.title || title, episodeCount: Math.max(p.episodeCount, res.chapters.length || 1) }));
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) toast("err", "Ghép lỗi: " + errText(e));
    } finally {
      setMixing(null);
      mixAbort.current = null;
    }
  };

  /* ---------- đăng ---------- */
  const publish = async () => {
    if (!mix || !jobId) return;
    const t = pub.title.trim();
    if (!t) return toast("err", "Nhập tiêu đề track");
    setPublishing(0);
    let trackId = "";
    try {
      const { track } = await adminApi.createTrack({ title: t, description: pub.description.trim(), format: "file", episodeCount: Math.max(1, pub.episodeCount) });
      trackId = track.id;
      await studioApi.publish(jobId, trackId, mix.blob, mix.durationSec, (f) => setPublishing(f));
      setPublished(track.slug);
      setJobs((js) => js.map((j) => (j.id === jobId ? { ...j, status: "published", trackId } : j)));
      toast("ok", "Đã đăng thành track");
    } catch (e) {
      toast("err", "Đăng lỗi: " + errText(e));
      if (trackId) adminApi.deleteTrack(trackId).catch(() => {});
    } finally {
      setPublishing(null);
    }
  };

  /* ---------- hiển thị ---------- */
  const emotionLabel = useCallback((id: string) => prov?.emotions.find((e) => e.id === id)?.label ?? id, [prov]);
  const fmtKey = `${mixOpt.sampleRate}-${mixOpt.channels}`;
  const estSize = useMemo(() => (parse ? wavSize(parse.estSeconds, mixOpt.sampleRate, mixOpt.channels) : 0), [parse, mixOpt]);
  const jobOptions = [{ value: "", label: "+ Kịch bản mới" }, ...jobs.map((j) => ({ value: j.id, label: j.title || "(chưa đặt tên)", hint: j.status }))];

  if (loadErr) return <ErrorBox message={loadErr} onRetry={loadAll} />;
  if (!prov) return <Loading />;

  return (
    <div className="space-y-4">
      {!prov.live && (
        <div className="rounded-lg border border-[var(--accent)] bg-[var(--surface-2)] px-4 py-2.5 text-sm text-[var(--text)]">
          Đang ở <b>chế độ thử</b> (TTS_MODE chưa là <code>live</code>) — giọng là tiếng "ư ư" tổng hợp, không gọi mạng, không tốn tiền.
        </div>
      )}

      <Card
        title="Xưởng audio"
        actions={
          <>
            <Button small onClick={() => setImportOpen(true)}>
              Nhập từ Trợ lý viết
            </Button>
            {jobId && (
              <Button small kind="ghost" onClick={() => setConfirmDelete(true)}>
                Xoá phiên
              </Button>
            )}
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Phiên làm việc">
            <Picker ariaLabel="Phiên làm việc" value={jobId ?? ""} options={jobOptions} onChange={openJob} />
          </Field>
          <Field label="Tên kịch bản">
            <TextInput value={title} placeholder={parse?.title || "Tên truyện / tập"} onChange={(e) => setTitle(e.target.value)} />
          </Field>
        </div>
        <div className="mt-3">
          <span className="mb-1 block text-sm font-medium">Nhà cung cấp giọng</span>
          <div className="flex flex-wrap gap-2">
            {prov.providers.map((p) => (
              <Button key={p.id} small kind={provider === p.id ? "primary" : "outline"} onClick={() => setProvider(p.id)} title={p.unavailable ?? p.model}>
                {p.label}
                {p.unavailable && p.id !== "mock" ? " ·" : ""}
              </Button>
            ))}
          </div>
          {providerInfo?.unavailable && <p className="mt-1 text-xs text-[var(--muted)]">{providerInfo.unavailable}</p>}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card
          title="Kịch bản"
          actions={
            <>
              {!script && (
                <Button small kind="ghost" onClick={() => setScript(SAMPLE)}>
                  Chèn mẫu
                </Button>
              )}
              <Button small kind="primary" busy={saving} disabled={!dirty || genRunning} onClick={save}>
                {dirty ? "Lưu" : "Đã lưu"}
              </Button>
            </>
          }
        >
          <ScriptEditor
            value={script}
            onChange={setScript}
            roles={roles}
            placeholder={'Người dẫn: Đêm ấy trời mưa…\nLan (thì thầm): Anh về rồi à?\n[nghỉ 1.2]\n[nhạc buồn]\n— xem worker/src/tts/FORMAT.md'}
          />
          {parse && (
            <div className="mt-3 space-y-2 text-xs text-[var(--muted)]">
              <p>
                {parse.speechCount} lời · {roles.length} vai · {parse.chapters.length} chương · ~{fmt(parse.estSeconds)} · {parse.chars.toLocaleString("vi-VN")} ký tự · WAV ≈{" "}
                {(estSize / 1048576).toFixed(0)} MB
              </p>
              {parse.warnings.length > 0 && (
                <ul className="max-h-32 space-y-0.5 overflow-y-auto rounded-md border border-[var(--border)] p-2 text-[var(--accent-2)]">
                  {parse.warnings.slice(0, 30).map((w, i) => (
                    <li key={i}>
                      Dòng {w.line}: {w.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>

        <Card title="Vai → giọng">
          <RolesTable
            roles={roles}
            provider={effInfo}
            voices={voices}
            effective={effectiveVoice}
            onChange={(role, v) => setVoices((s) => ({ ...s, [role]: v }))}
          />
          {!prov.live && provider !== "mock" && <p className="mt-2 text-xs text-[var(--muted)]">Chế độ thử: bảng giọng đang theo MOCK.</p>}
        </Card>
      </div>

      <Card
        title="Tạo giọng"
        actions={
          genRunning ? (
            <Button small kind="danger" onClick={() => (stopGen.current = true)}>
              Dừng
            </Button>
          ) : (
            <Button small kind="primary" busy={saving} disabled={!script.trim()} onClick={generateAll}>
              {dirty ? "Lưu & tạo giọng" : "Tạo giọng"}
            </Button>
          )
        }
      >
        {segments.length > 0 && (
          <div className="mb-3 space-y-1">
            <ProgressBar value={(doneCount / segments.length) * 100} />
            <p className="text-xs text-[var(--muted)]">
              {doneCount}/{segments.length} lời xong
              {segments.some((s) => s.qc) && ` · ${segments.filter((s) => s.qc).length} nghi lỗi`}
              {segments.some((s) => s.status === "error") && ` · ${segments.filter((s) => s.status === "error").length} lỗi`}
              {` · chi ước $${segments.reduce((s, x) => s + x.costUsd, 0).toFixed(3)}`}
            </p>
          </div>
        )}
        <SegmentList segments={segments} roles={roles} emotionLabel={emotionLabel} busyN={busyN} playingN={playingN} onPlay={play} onRegen={regen} />
        <audio ref={player} className="hidden" onEnded={() => setPlayingN(null)} onPause={() => setPlayingN(null)} />
      </Card>

      <Card title="Ghép & xem trước">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Định dạng xuất">
            <Picker
              ariaLabel="Định dạng xuất"
              value={fmtKey}
              options={FORMATS}
              onChange={(v) => {
                const [sr, ch] = v.split("-").map(Number);
                setMixOpt((o) => ({ ...o, sampleRate: sr!, channels: ch === 2 ? 2 : 1, targetLufs: ch === 2 ? -16 : -19 }));
              }}
            />
          </Field>
          <Field label={`Độ to đích ${mixOpt.targetLufs} LUFS · trần đỉnh ${mixOpt.ceilingDb} dBFS`}>
            <input type="range" min={-24} max={-14} step={1} value={mixOpt.targetLufs} onChange={(e) => setMixOpt((o) => ({ ...o, targetLufs: Number(e.target.value) }))} className="w-full accent-[var(--accent)]" />
          </Field>
          <Field label={`Nhạc nền ${Math.round(mixOpt.musicVolume * 100)}% (≈ ${(20 * Math.log10(mixOpt.musicVolume || 0.001)).toFixed(0)} dB)`}>
            <input type="range" min={0} max={0.3} step={0.01} value={mixOpt.musicVolume} onChange={(e) => setMixOpt((o) => ({ ...o, musicVolume: Number(e.target.value) }))} className="w-full accent-[var(--accent)]" />
          </Field>
          <Field label={`Giảm nhạc khi có lời ${mixOpt.duckDb} dB`}>
            <input type="range" min={-15} max={0} step={1} value={mixOpt.duckDb} onChange={(e) => setMixOpt((o) => ({ ...o, duckDb: Number(e.target.value) }))} className="w-full accent-[var(--accent)]" />
          </Field>
          <Field label={`Hiệu ứng ${Math.round(mixOpt.sfxVolume * 100)}%`}>
            <input type="range" min={0} max={1} step={0.05} value={mixOpt.sfxVolume} onChange={(e) => setMixOpt((o) => ({ ...o, sfxVolume: Number(e.target.value) }))} className="w-full accent-[var(--accent)]" />
          </Field>
          <Field label={`Nhịp nghỉ ×${mixOpt.pauseScale.toFixed(2)}`}>
            <input type="range" min={0.6} max={1.6} step={0.05} value={mixOpt.pauseScale} onChange={(e) => setMixOpt((o) => ({ ...o, pauseScale: Number(e.target.value) }))} className="w-full accent-[var(--accent)]" />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {mixing ? (
            <Button kind="danger" onClick={() => mixAbort.current?.abort()}>
              Dừng ghép
            </Button>
          ) : (
            <Button kind="primary" disabled={!allDone} onClick={runMix}>
              Ghép bản nghe thử
            </Button>
          )}
          {!allDone && <span className="text-xs text-[var(--muted)]">{dirty ? "Lưu kịch bản trước." : "Cần tạo giọng đủ mọi lời."}</span>}
        </div>
        {mixing && (
          <div className="mt-3 space-y-1">
            <ProgressBar value={mixing.frac * 100} />
            <p className="text-xs text-[var(--muted)]">{mixing.stage}</p>
          </div>
        )}
        {mix && (
          <div className="mt-4 space-y-2">
            <audio controls src={mix.url} className="w-full" />
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge tone="muted">{fmt(mix.durationSec)}</Badge>
              <Badge tone="muted">{(mix.blob.size / 1048576).toFixed(1)} MB WAV</Badge>
              <Badge tone={Math.abs(mix.finalLufs - mixOpt.targetLufs) <= 1 ? "ok" : "warn"}>{mix.finalLufs.toFixed(1)} LUFS</Badge>
              <Badge tone={mix.peakDb <= mixOpt.ceilingDb + 0.1 ? "ok" : "warn"}>đỉnh {mix.peakDb.toFixed(1)} dBFS</Badge>
              <Badge tone="muted">bù {mix.gainDb >= 0 ? "+" : ""}{mix.gainDb.toFixed(1)} dB</Badge>
              <a href={mix.url} download={`${libSlug(title || "xuong-audio")}.wav`} className="text-[var(--accent)] underline">
                Tải WAV
              </a>
            </div>
            {mix.chapters.length > 0 && (
              <p className="text-xs text-[var(--muted)]">Chương: {mix.chapters.map((c) => `${fmt(c.start)} ${c.title}`).join(" · ")}</p>
            )}
            {mix.synthesized.length > 0 && <p className="text-xs text-[var(--muted)]">Âm tổng hợp tạm (thư viện chưa có): {mix.synthesized.join(", ")}</p>}
            {mix.warnings.length > 0 && (
              <ul className="space-y-0.5 text-xs text-[var(--accent-2)]">
                {mix.warnings.slice(0, 20).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <p className="mt-3 text-xs text-[var(--muted)]">
          Xuất WAV PCM 16-bit: 24 kHz mono ≈ 170 MB/giờ, 44,1 kHz stereo ≈ 600 MB/giờ (Worker nhận tối đa 100 MB/request ở gói thường → truyện dài nên chọn mono hoặc chia chương). Bước sau: mã hoá AAC/HLS bằng WebCodecs (≈ 43 MB/giờ) rồi dùng luồng tải HLS có sẵn.
        </p>
      </Card>

      <Card title="Đăng thành track">
        {!mix ? (
          <p className="text-sm text-[var(--muted)]">Ghép bản nghe thử trước.</p>
        ) : published ? (
          <p className="text-sm">
            Đã đăng.{" "}
            <a className="text-[var(--accent)] underline" href={`/track/${encodeURIComponent(published)}`} target="_blank" rel="noreferrer">
              Mở trang track
            </a>{" "}
            — sửa ảnh bìa / thể loại ở mục Thư viện.
          </p>
        ) : (
          <div className="space-y-3">
            <Field label="Tiêu đề">
              <TextInput value={pub.title} onChange={(e) => setPub((p) => ({ ...p, title: e.target.value }))} />
            </Field>
            <Field label="Mô tả" hint='Nên ghi "Giọng đọc tạo bằng AI".'>
              <TextArea value={pub.description} onChange={(e) => setPub((p) => ({ ...p, description: e.target.value }))} />
            </Field>
            <Field label="Số tập" hint="Hợp đồng hiện chia tập đều theo thời lượng.">
              <TextInput
                type="number"
                min={1}
                max={500}
                value={pub.episodeCount}
                onChange={(e) => setPub((p) => ({ ...p, episodeCount: Math.max(1, Math.min(500, Number(e.target.value) || 1)) }))}
              />
            </Field>
            {publishing !== null && <ProgressBar value={publishing * 100} />}
            <Button kind="primary" busy={publishing !== null} onClick={publish}>
              Đăng thành track
            </Button>
          </div>
        )}
      </Card>

      <Card title="Thư viện nhạc nền & hiệu ứng">
        <LibraryPanel
          items={library}
          onChanged={() =>
            studioApi
              .library()
              .then((r) => setLibrary(r.items))
              .catch(() => {})
          }
        />
      </Card>

      <WriterImportModal open={importOpen} onClose={() => setImportOpen(false)} onPick={importWriter} />

      <Modal
        open={!!confirmCost}
        onClose={() => confirmCost?.resolve(false)}
        title="Xác nhận chi phí tạo giọng"
        footer={
          <>
            <Button kind="ghost" onClick={() => confirmCost?.resolve(false)}>
              Huỷ
            </Button>
            <Button kind="primary" onClick={() => confirmCost?.resolve(true)}>
              Tạo giọng (~${confirmCost?.est.usd.toFixed(2)})
            </Button>
          </>
        }
      >
        {confirmCost && (
          <div className="space-y-1">
            <p>
              {confirmCost.est.pending} lời chưa có giọng · {confirmCost.est.chars.toLocaleString("vi-VN")} ký tự · ~{fmt(confirmCost.est.seconds)} audio ({confirmCost.est.provider}).
            </p>
            {confirmCost.est.cachedChars > 0 && <p className="text-[var(--muted)]">{confirmCost.est.cachedChars.toLocaleString("vi-VN")} ký tự lấy từ bộ đệm (miễn phí).</p>}
            <p>
              Ước chi <b>${confirmCost.est.usd.toFixed(3)}</b> · đã tiêu tháng này ${confirmCost.est.spentUsd.toFixed(2)} / ngân sách ${confirmCost.est.budgetUsd.toFixed(2)}.
            </p>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="Xoá phiên làm việc?"
        message="Xoá kịch bản và mọi tệp giọng đã tạo của phiên này. Track đã đăng không bị xoá."
        onConfirm={removeJob}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
