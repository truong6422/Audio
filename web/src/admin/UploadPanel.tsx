// Tải audio mới: thư mục HLS hoặc một tệp mp3/m4a.
import { useEffect, useRef, useState } from "react";
import type { Track } from "@shared/types";
import { adminApi, errMsg } from "./adminApi";
import { Button, Card, Field, ImageUpload, ProgressBar, TextArea, TextInput, cx, fmtDuration, useToast } from "./ui";
import { extOf, fmtBytes, planHls, readAudioDuration, suggestEpisodes, uploadAll, type HlsFile } from "./uploadLogic";

type Mode = "hls" | "file";
type Phase = "idle" | "reading" | "creating" | "uploading" | "finishing" | "done" | "error";

interface Source {
  files: HlsFile[];
  entry: string;
  durationSeconds: number;
  totalBytes: number;
  label: string; // mô tả ngắn nguồn đã chọn
}

const phaseText: Record<Phase, string> = {
  idle: "",
  reading: "Đang đọc tệp…",
  creating: "Đang tạo bản ghi…",
  uploading: "Đang tải lên…",
  finishing: "Đang hoàn tất…",
  done: "Đã tải xong",
  error: "Lỗi",
};

export default function UploadPanel({ onDone, onClose }: { onDone: (t: Track) => void; onClose: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("hls");
  const [source, setSource] = useState<Source | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [episodes, setEpisodes] = useState("1");
  const [episodesTouched, setEpisodesTouched] = useState(false);
  const [cover, setCover] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(0);
  const [doneFiles, setDoneFiles] = useState(0);
  const dirRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // webkitdirectory không có trong kiểu JSX — gắn bằng DOM.
  useEffect(() => {
    const el = dirRef.current;
    if (el) {
      el.setAttribute("webkitdirectory", "");
      el.setAttribute("directory", "");
    }
  }, [mode]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const busy = phase === "reading" || phase === "creating" || phase === "uploading" || phase === "finishing";

  const applySource = (s: Source, suggestedTitle: string) => {
    setSource(s);
    if (!title.trim() && suggestedTitle) setTitle(suggestedTitle);
    if (!episodesTouched) setEpisodes(String(suggestEpisodes(s.durationSeconds)));
    setError("");
    setPhase("idle");
  };

  const onPickDir = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setPhase("reading");
    try {
      const plan = await planHls(list);
      applySource(
        {
          files: plan.files,
          entry: plan.entry,
          durationSeconds: plan.durationSeconds,
          totalBytes: plan.totalBytes,
          label: `${plan.folderName || "Thư mục"} · ${plan.files.length} tệp · chính: ${plan.entry}`,
        },
        plan.folderName,
      );
    } catch (e) {
      setSource(null);
      setPhase("error");
      setError(errMsg(e));
    } finally {
      if (dirRef.current) dirRef.current.value = "";
    }
  };

  const onPickFile = async (f: File | undefined) => {
    if (!f) return;
    const ext = extOf(f.name);
    if (!["mp3", "m4a", "aac", "mp4"].includes(ext)) {
      setPhase("error");
      setError("Chỉ nhận tệp .mp3 hoặc .m4a");
      return;
    }
    setPhase("reading");
    try {
      const dur = await readAudioDuration(f);
      const entry = `audio.${ext}`;
      applySource(
        { files: [{ file: f, path: entry }], entry, durationSeconds: dur, totalBytes: f.size, label: f.name },
        f.name.replace(/\.[^.]+$/, ""),
      );
    } catch (e) {
      setSource(null);
      setPhase("error");
      setError(errMsg(e));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const switchMode = (m: Mode) => {
    if (busy || m === mode) return;
    setMode(m);
    setSource(null);
    setPhase("idle");
    setError("");
  };

  const epNum = Math.floor(Number(episodes));
  const canSubmit = !!source && title.trim().length > 0 && Number.isFinite(epNum) && epNum >= 1 && !busy;

  const submit = async () => {
    if (!source || !canSubmit) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError("");
    setLoaded(0);
    setDoneFiles(0);
    let trackId: string | null = null;
    try {
      setPhase("creating");
      const { track } = await adminApi.createTrack({
        title: title.trim(),
        description: description.trim(),
        format: mode,
        episodeCount: epNum,
      });
      trackId = track.id;
      setPhase("uploading");

      await uploadAll(
        track.id,
        source.files,
        (b, d) => {
          setLoaded(b);
          setDoneFiles(d);
        },
        ctrl.signal,
      );
      setPhase("finishing");
      let { track: done } = await adminApi.completeTrack(track.id, {
        durationSeconds: source.durationSeconds,
        entry: source.entry,
      });
      if (cover) ({ track: done } = await adminApi.updateTrack(track.id, { coverUrl: cover }));
      setPhase("done");
      toast("ok", `Đã tải lên “${done.title}”`);
      onDone(done);
    } catch (e) {
      setPhase("error");
      setError(errMsg(e));
      // Dọn bản ghi dở dang để thư viện không còn track "đang xử lý" hỏng.
      if (trackId) adminApi.deleteTrack(trackId).catch(() => {});
    } finally {
      abortRef.current = null;
    }
  };

  const percent = source && source.totalBytes > 0 ? (loaded / source.totalBytes) * 100 : 0;

  return (
    <Card
      title="Tải audio mới"
      actions={
        <Button small kind="ghost" onClick={() => (busy ? abortRef.current?.abort() : onClose())}>
          {busy ? "Huỷ tải" : "Đóng"}
        </Button>
      }
    >
      <div className="mb-4 inline-flex rounded-lg border border-[var(--border)] p-1">
        {(
          [
            ["hls", "Thư mục HLS"],
            ["file", "Một tệp mp3 / m4a"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            disabled={busy}
            onClick={() => switchMode(m)}
            className={cx(
              "rounded-md px-3 py-1.5 text-sm transition",
              mode === m ? "bg-[var(--accent)] text-[var(--on-accent)]" : "text-[var(--muted)] hover:text-[var(--text)]",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-4">
          <div>
            {mode === "hls" ? (
              <input ref={dirRef} type="file" multiple className="hidden" onChange={(e) => onPickDir(e.target.files)} />
            ) : (
              <input
                ref={fileRef}
                type="file"
                accept=".mp3,.m4a,audio/mpeg,audio/mp4,audio/x-m4a"
                className="hidden"
                onChange={(e) => onPickFile(e.target.files?.[0])}
              />
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => (mode === "hls" ? dirRef.current : fileRef.current)?.click()}
              className="flex w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--surface-2)] px-4 py-6 text-center text-sm text-[var(--muted)] transition hover:border-[var(--accent)] disabled:opacity-50"
            >
              <span className="font-medium text-[var(--text)]">
                {source ? "Chọn lại" : mode === "hls" ? "Chọn thư mục HLS" : "Chọn tệp audio"}
              </span>
              <span className="text-xs">
                {mode === "hls"
                  ? "Thư mục đã encode sẵn: .m3u8 + .ts / .m4s (tự tìm playlist chính)"
                  : "Thời lượng đọc tự động từ tệp"}
              </span>
            </button>
            {phase === "reading" && <p className="mt-2 text-xs text-[var(--muted)]">Đang đọc tệp…</p>}
            {source && (
              <div className="mt-2 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--muted)]">
                <div className="break-all text-[var(--text)]">{source.label}</div>
                <div>
                  Thời lượng {fmtDuration(source.durationSeconds)} · {fmtBytes(source.totalBytes)}
                </div>
              </div>
            )}
          </div>

          <Field label="Tiêu đề">
            <TextInput value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} disabled={busy} placeholder="Tên truyện" />
          </Field>
          <Field
            label="Số tập"
            hint={
              source
                ? `Gợi ý ${suggestEpisodes(source.durationSeconds)} tập (~1 tập / 10 phút). Tập chia đều thời lượng.`
                : "Gợi ý tự động sau khi chọn audio (~1 tập / 10 phút)."
            }
          >
            <TextInput
              type="number"
              min={1}
              inputMode="numeric"
              value={episodes}
              disabled={busy}
              onChange={(e) => {
                setEpisodes(e.target.value);
                setEpisodesTouched(true);
              }}
            />
          </Field>
        </div>

        <div className="space-y-4">
          <Field label="Mô tả">
            <TextArea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={5000}
              rows={5}
              disabled={busy}
              placeholder="Tóm tắt nội dung (hiển thị trên trang & cho SEO)"
            />
          </Field>
          <Field label="Ảnh bìa">
            <ImageUpload value={cover} onChange={setCover} />
          </Field>
        </div>
      </div>

      {(phase === "creating" || phase === "uploading" || phase === "finishing" || phase === "done") && source && (
        <div className="mt-4 space-y-1.5">
          <ProgressBar value={phase === "done" || phase === "finishing" ? 100 : percent} />
          <div className="flex justify-between text-xs text-[var(--muted)]">
            <span>{phaseText[phase]}</span>
            <span>
              {doneFiles}/{source.files.length} tệp · {Math.floor(phase === "done" ? 100 : percent)}%
            </span>
          </div>
        </div>
      )}
      {phase === "error" && error && (
        <p className="mt-4 rounded-lg border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p>
      )}

      <div className="mt-4 flex justify-end">
        <Button kind="primary" disabled={!canSubmit} busy={busy && phase !== "reading"} onClick={submit}>
          Tải lên
        </Button>
      </div>
    </Card>
  );
}

