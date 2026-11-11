// Các khối giao diện của Xưởng audio: bảng vai, danh sách lời, thư viện âm thanh, hộp nhập từ Trợ lý viết.
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Empty, ErrorBox, Loading, Modal, Picker, Spinner, TextInput, cx, useToast } from "../ui";
import { roleColor } from "./ScriptEditor";
import { errText, libSlug, studioApi, type LibraryItem, type ProviderInfo, type RoleVoice, type StudioSegment, type WriterScript } from "./studioApi";

/* ---------------------------------------------------------------- Bảng vai → giọng */

export function RolesTable({
  roles,
  provider,
  voices,
  effective,
  onChange,
}: {
  roles: string[];
  provider: ProviderInfo | undefined;
  voices: Record<string, RoleVoice>;
  effective: (role: string) => RoleVoice;
  onChange: (role: string, v: RoleVoice) => void;
}) {
  if (!roles.length) return <Empty>Chưa có vai — gõ kịch bản bên trái.</Empty>;
  const opts = (provider?.voices ?? []).map((v) => ({ value: v.id, label: v.label }));
  return (
    <ul className="space-y-3">
      {roles.map((role, i) => {
        const set = voices[role];
        const eff = effective(role);
        const v: RoleVoice = { voice: set?.voice || eff.voice, speed: set?.speed ?? eff.speed, persona: set?.persona ?? eff.persona };
        const custom = !opts.some((o) => o.value === v.voice);
        return (
          <li key={role} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold" style={{ color: roleColor(i) }}>
                {role}
              </span>
              {!set?.voice && <span className="text-xs text-[var(--muted)]">giọng mặc định</span>}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {opts.length > 0 && (
                <Picker
                  ariaLabel={`Giọng của ${role}`}
                  value={custom ? "" : v.voice}
                  placeholder="Chọn giọng…"
                  options={opts}
                  onChange={(voice) => onChange(role, { ...v, voice })}
                />
              )}
              <TextInput
                aria-label={`Mã giọng của ${role}`}
                value={v.voice}
                placeholder={provider?.id === "elevenlabs" ? "voice_id ElevenLabs" : "Mã giọng"}
                onChange={(e) => onChange(role, { ...v, voice: e.target.value })}
              />
            </div>
            <TextInput
              className="mt-2"
              aria-label={`Persona của ${role}`}
              value={v.persona}
              placeholder="Persona (vd. nữ 55 tuổi, giọng sắc, nhấn cuối câu)"
              onChange={(e) => onChange(role, { ...v, persona: e.target.value })}
            />
            <label className="mt-2 flex items-center gap-3 text-xs text-[var(--muted)]">
              <span className="w-20 shrink-0">Tốc độ {v.speed.toFixed(2)}</span>
              <input
                type="range"
                min={0.7}
                max={1.3}
                step={0.01}
                value={v.speed}
                onChange={(e) => onChange(role, { ...v, speed: Number(e.target.value) })}
                className="w-full accent-[var(--accent)]"
              />
            </label>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------------------------------------------------------- Danh sách lời */

const STATUS_LABEL: Record<StudioSegment["status"], string> = { pending: "Chờ", generating: "Đang đọc", done: "Xong", error: "Lỗi" };

export function SegmentList({
  segments,
  roles,
  emotionLabel,
  busyN,
  playingN,
  onPlay,
  onRegen,
}: {
  segments: StudioSegment[];
  roles: string[];
  emotionLabel: (id: string) => string;
  busyN: Set<number>;
  playingN: number | null;
  onPlay: (s: StudioSegment) => void;
  onRegen: (s: StudioSegment) => void;
}) {
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [limit, setLimit] = useState(100);
  const issues = segments.filter((s) => s.status === "error" || s.qc);
  const list = onlyIssues ? issues : segments;
  if (!segments.length) return <Empty>Chưa có lời. Lưu kịch bản để tạo danh sách lời.</Empty>;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <Button small kind={onlyIssues ? "outline" : "primary"} onClick={() => setOnlyIssues(false)}>
          Tất cả ({segments.length})
        </Button>
        <Button small kind={onlyIssues ? "primary" : "outline"} onClick={() => setOnlyIssues(true)}>
          Lỗi / nghi lỗi ({issues.length})
        </Button>
      </div>
      {!list.length ? (
        <Empty>Không có lời nào cần xem lại.</Empty>
      ) : (
        <ul className="max-h-[60vh] divide-y divide-[var(--border)] overflow-y-auto rounded-lg border border-[var(--border)]">
          {list.slice(0, limit).map((s) => {
            const ri = roles.indexOf(s.role);
            const busy = busyN.has(s.n) || s.status === "generating";
            return (
              <li key={s.n} className="flex gap-2 p-2.5 sm:gap-3">
                <span className="w-7 shrink-0 pt-0.5 text-right text-xs tabular-nums text-[var(--muted)]">{s.n + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="font-semibold" style={{ color: roleColor(ri) }}>
                      {s.role}
                    </span>
                    {s.emotion && <Badge tone="muted">{emotionLabel(s.emotion)}</Badge>}
                    <Badge tone={s.status === "done" ? (s.qc ? "warn" : "ok") : s.status === "error" ? "warn" : "muted"}>
                      {s.status === "done" && s.qc ? "Nghi lỗi" : STATUS_LABEL[s.status]}
                    </Badge>
                    {s.status === "done" && <span className="text-[var(--muted)]">{(s.durationMs / 1000).toFixed(1)} s</span>}
                    {s.cached && <span className="text-[var(--muted)]">· bộ đệm</span>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-[var(--text)]">{s.text}</p>
                  {s.ttsText !== s.text && <p className="mt-0.5 line-clamp-1 text-xs text-[var(--muted)]">Đọc: {s.ttsText}</p>}
                  {s.error && <p className="mt-1 text-xs text-[var(--danger)]">{s.error}</p>}
                  {s.qc && <p className="mt-1 text-xs text-[var(--accent-2)]">{s.qc} — nên đọc lại</p>}
                </div>
                <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
                  <Button small kind="ghost" aria-label="Nghe thử" disabled={s.status !== "done"} onClick={() => onPlay(s)}>
                    {playingN === s.n ? "■" : "▶"}
                  </Button>
                  <Button small kind="ghost" aria-label="Tạo lại lời này" disabled={busy} onClick={() => onRegen(s)}>
                    {busy ? <Spinner small /> : "↻"}
                  </Button>
                </div>
              </li>
            );
          })}
          {list.length > limit && (
            <li className="p-2 text-center">
              <Button small kind="ghost" onClick={() => setLimit((l) => l + 200)}>
                Xem thêm ({list.length - limit})
              </Button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Thư viện nhạc / hiệu ứng */

export function LibraryPanel({ items, onChanged }: { items: LibraryItem[] | null; onChanged: () => void }) {
  const toast = useToast();
  const [kind, setKind] = useState<"music" | "sfx">("music");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const upload = async (f: File | undefined) => {
    if (!f) return;
    const nm = libSlug(name || f.name.replace(/\.[^.]+$/, ""));
    setBusy(true);
    try {
      await studioApi.uploadLibrary(kind, nm, f);
      toast("ok", `Đã thêm ${kind === "music" ? "nhạc" : "hiệu ứng"} "${nm}"`);
      setName("");
      onChanged();
    } catch (e) {
      toast("err", errText(e));
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  };
  const remove = async (it: LibraryItem) => {
    try {
      await studioApi.deleteLibrary(it.kind, it.name);
      onChanged();
    } catch (e) {
      toast("err", errText(e));
    }
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--muted)]">
        Kịch bản gọi theo tên: <code>[nhạc mưa-đêm]</code> ↔ tệp <code>mua-dem</code>. Thiếu tệp thì Xưởng tự tổng hợp âm tạm (chỉ để thử nhịp). Chỉ dùng nhạc / hiệu ứng có giấy phép (Pixabay, Freesound CC0 / CC BY — nhớ ghi công).
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button small kind={kind === "music" ? "primary" : "outline"} onClick={() => setKind("music")}>
          Nhạc nền
        </Button>
        <Button small kind={kind === "sfx" ? "primary" : "outline"} onClick={() => setKind("sfx")}>
          Hiệu ứng
        </Button>
        <TextInput className="min-w-0 flex-1 basis-40" value={name} placeholder="Tên (vd. mưa đêm)" onChange={(e) => setName(e.target.value)} />
        <input ref={file} type="file" accept="audio/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
        <Button small busy={busy} onClick={() => file.current?.click()}>
          Chọn tệp
        </Button>
      </div>
      {items === null ? (
        <Loading />
      ) : !items.length ? (
        <Empty>Thư viện trống.</Empty>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          {items.map((it) => (
            <li key={it.key} className="flex items-center gap-2 px-3 py-2 text-sm">
              <Badge tone="muted">{it.kind === "music" ? "Nhạc" : "Hiệu ứng"}</Badge>
              <span className="min-w-0 flex-1 truncate">{it.name}</span>
              <span className="text-xs text-[var(--muted)]">{(it.size / 1048576).toFixed(1)} MB</span>
              <Button
                small
                kind="ghost"
                aria-label="Nghe"
                onClick={() => {
                  if (!audio.current) return;
                  audio.current.src = studioApi.libraryUrl(it.kind, it.name);
                  audio.current.play().catch(() => {});
                }}
              >
                ▶
              </Button>
              <Button small kind="ghost" aria-label="Xoá" onClick={() => remove(it)}>
                ✕
              </Button>
            </li>
          ))}
        </ul>
      )}
      <audio ref={audio} className="hidden" />
    </div>
  );
}

/* ---------------------------------------------------------------- Nhập từ Trợ lý viết */

export function WriterImportModal({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (s: WriterScript) => void }) {
  const [items, setItems] = useState<WriterScript[] | null>(null);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState("");
  const load = () => {
    setItems(null);
    setErr("");
    studioApi
      .writerScripts()
      .then((r) => setItems(r.items))
      .catch((e) => setErr(errText(e)));
  };
  useEffect(() => {
    if (open) load();
  }, [open]);
  const pick = async (id: string) => {
    setBusyId(id);
    try {
      onPick(await studioApi.writerScript(id));
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusyId("");
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Nhập từ Trợ lý viết">
      {err ? (
        <ErrorBox message={err} onRetry={load} />
      ) : items === null ? (
        <Loading />
      ) : !items.length ? (
        <Empty>Chưa có tập nào được gửi sang Xưởng. Trong Trợ lý viết, bấm "Gửi sang Xưởng audio".</Empty>
      ) : (
        <ul className="max-h-[60vh] divide-y divide-[var(--border)] overflow-y-auto rounded-lg border border-[var(--border)]">
          {items.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                disabled={!!busyId}
                onClick={() => pick(s.id)}
                className={cx("flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-[var(--surface-2)] disabled:opacity-60")}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {s.projectTitle} — Tập {s.epNo}/{s.episodeCount}
                  </p>
                  <p className="truncate text-xs text-[var(--muted)]">
                    {s.title} · {s.roles.length} vai · ~{Math.round(s.estSeconds / 60)} phút
                  </p>
                </div>
                {busyId === s.id && <Spinner small />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
