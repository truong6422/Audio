import { useEffect, useState, type CSSProperties } from "react";
import { Cover } from "../components/Cover";
import { Popover } from "../components/Popover";
import { IconTimer, IconX } from "../components/Icons";
import { episodeAt, episodeBounds, episodeCountOf, lockMarks } from "../lib/episodes";
import { fmtTime } from "../lib/format";
import { useSite } from "../site";
import { RATE_MAX, RATE_MIN, usePlayer, usePlayerTime } from "./PlayerContext";

const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const SLEEPS = [15, 30, 45, 60];

const fmtRate = (r: number) => `${String(r).replace(".", ",")}×`;

/** Thanh tua theo TẬP hiện tại (0 → độ dài tập). Kéo chỉ đổi hiển thị, nhả mới tua. */
export function SeekBar({ showTimes = true, className = "" }: { showTimes?: boolean; className?: string }) {
  const { current, seek, gate } = usePlayer();
  const { currentTime, duration } = usePlayerTime();
  const site = useSite();
  const [drag, setDrag] = useState<number | null>(null);
  if (!current) return null;
  const ep = episodeAt(current, currentTime, duration);
  const b = episodeBounds(current, ep, duration);
  const len = Math.max(0, b.end - b.start);
  // gate.point dùng làm phụ thuộc gián tiếp: mở khoá xong thì vạch biến mất ở lần vẽ sau.
  const marks = len > 0 && !gate.open ? lockMarks(current, site.gate?.checkpoints, b.start, b.end, duration, site.gate?.unlockTtlHours) : [];
  const rel = drag ?? Math.min(len, Math.max(0, currentTime - b.start));
  const pct = len > 0 ? (rel / len) * 100 : 0;
  const commit = () => {
    if (drag != null) {
      seek(b.start + drag);
      setDrag(null);
    }
  };
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {showTimes && <span className="w-12 shrink-0 text-right font-mono text-xs text-muted tabular-nums">{fmtTime(rel)}</span>}
      <div className="relative min-w-0 flex-1">
      {marks.map((m) => (
        <span
          key={m}
          className="pointer-events-none absolute top-1/2 z-[1] h-[11px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-2 ring-2 ring-bg"
          style={{ left: `calc(7.5px + (100% - 15px) * ${(m - b.start) / len})` }}
          title={`Mở khoá tại ${fmtTime(m - b.start)}`}
          aria-hidden="true"
        />
      ))}
      <input
        type="range"
        className="range relative"
        min={0}
        max={Math.max(1, Math.floor(len))}
        step={1}
        value={Math.floor(rel)}
        aria-label={episodeCountOf(current) > 1 ? `Tua trong tập ${ep}` : "Tua"}
        aria-valuetext={`${fmtTime(rel)} trên ${fmtTime(len)}`}
        style={{ "--pct": `${pct}%` } as CSSProperties}
        onChange={(e) => setDrag(Number(e.target.value))}
        onPointerUp={commit}
        onTouchEnd={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      </div>
      {showTimes && <span className="w-12 shrink-0 font-mono text-xs text-muted tabular-nums">{fmtTime(len)}</span>}
    </div>
  );
}

/** Dòng phụ: lỗi / đang tải / Tập x/N · trạng thái. */
export function NowSubline({ className = "" }: { className?: string }) {
  const { current, isPlaying, loading, error } = usePlayer();
  const { currentTime, duration } = usePlayerTime();
  if (!current) return null;
  if (error) return <p className={`truncate text-xs text-danger ${className}`} role="alert">{error}</p>;
  const n = episodeCountOf(current);
  const ep = episodeAt(current, currentTime, duration);
  const state = loading ? "Đang tải…" : isPlaying ? "Đang phát" : "Tạm dừng";
  return (
    <p className={`truncate text-xs text-muted ${className}`}>
      {n > 1 ? `Tập ${ep}/${n} · ` : ""}
      {state}
    </p>
  );
}

export function SpeedPanel() {
  const { rate, setRate } = usePlayer();
  const pct = ((rate - RATE_MIN) / (RATE_MAX - RATE_MIN)) * 100;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm text-muted">Tốc độ phát</span>
        <span className="font-mono text-base font-semibold text-accent">{fmtRate(rate)}</span>
      </div>
      <input
        type="range"
        className="range"
        min={RATE_MIN}
        max={RATE_MAX}
        step={0.05}
        value={rate}
        aria-label="Tốc độ phát"
        aria-valuetext={fmtRate(rate)}
        style={{ "--pct": `${pct}%` } as CSSProperties}
        onChange={(e) => setRate(Number(e.target.value))}
      />
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {RATES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRate(r)}
            aria-pressed={rate === r}
            className={`min-h-10 rounded-lg border text-xs font-medium transition-colors ${
              rate === r ? "border-accent bg-accent/15 text-accent" : "border-border text-text hover:border-accent/50"
            }`}
          >
            {r === 1 ? "Chuẩn" : fmtRate(r)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SleepPanel({ onDone }: { onDone?: () => void }) {
  const { sleep, sleepLeftMs, setSleep, current } = usePlayer();
  const multi = !!current && episodeCountOf(current) > 1;
  return (
    <div>
      {sleep && (
        <div className="mb-3 flex items-center justify-between rounded-xl bg-accent/10 px-3 py-2">
          <span className="text-sm text-text">
            {sleep.kind === "track" ? "Dừng khi hết bài này" : sleep.kind === "episode" ? `Dừng khi hết tập ${sleep.ep}` : `Còn lại ${fmtTime((sleepLeftMs ?? 0) / 1000)}`}
          </span>
          <button
            type="button"
            className="text-xs font-semibold text-accent underline-offset-2 hover:underline"
            onClick={() => {
              setSleep(null);
              onDone?.();
            }}
          >
            Tắt
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        {SLEEPS.map((m) => (
          <button
            key={m}
            type="button"
            className="min-h-10 rounded-lg border border-border text-sm text-text transition-colors hover:border-accent/60"
            onClick={() => {
              setSleep(m);
              onDone?.();
            }}
          >
            {m} phút
          </button>
        ))}
        {multi && (
          <button
            type="button"
            className={`col-span-2 min-h-10 rounded-lg border text-sm transition-colors ${
              sleep?.kind === "episode" ? "border-accent bg-accent/15 text-accent" : "border-border text-text hover:border-accent/60"
            }`}
            aria-pressed={sleep?.kind === "episode"}
            onClick={() => {
              setSleep("episode");
              onDone?.();
            }}
          >
            Hết tập này
          </button>
        )}
        <button
          type="button"
          className={`col-span-2 min-h-10 rounded-lg border text-sm transition-colors ${
            sleep?.kind === "track" ? "border-accent bg-accent/15 text-accent" : "border-border text-text hover:border-accent/60"
          }`}
          aria-pressed={sleep?.kind === "track"}
          onClick={() => {
            setSleep("track");
            onDone?.();
          }}
        >
          Hết bài này
        </button>
      </div>
    </div>
  );
}

export function SpeedButton({ placement = "up" }: { placement?: "up" | "down" }) {
  const { rate } = usePlayer();
  return (
    <Popover
      label={`Tốc độ phát, hiện ${fmtRate(rate)}`}
      title="Tốc độ"
      placement={placement}
      buttonClassName={`inline-flex min-h-11 min-w-12 items-center justify-center rounded-full px-2 font-mono text-sm font-semibold transition-colors hover:bg-text/8 ${
        rate !== 1 ? "text-accent" : "text-text"
      }`}
      button={() => fmtRate(rate)}
    >
      {() => <SpeedPanel />}
    </Popover>
  );
}

export function SleepButton({ placement = "up", align = "center" }: { placement?: "up" | "down"; align?: "start" | "center" | "end" }) {
  const { sleep, sleepLeftMs } = usePlayer();
  const label = sleep ? (sleep.kind === "track" ? "Hết bài" : sleep.kind === "episode" ? "Hết tập" : fmtTime((sleepLeftMs ?? 0) / 1000)) : null;
  return (
    <Popover
      label={sleep ? `Hẹn giờ tắt: ${label}` : "Hẹn giờ tắt"}
      title="Hẹn giờ tắt"
      placement={placement}
      align={align}
      buttonClassName={`inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-2.5 text-sm transition-colors hover:bg-text/8 ${
        sleep ? "text-accent" : "text-text"
      }`}
      button={() => (
        <>
          <IconTimer size={19} />
          {label && <span className="font-mono text-xs tabular-nums">{label}</span>}
        </>
      )}
    >
      {(close) => <SleepPanel onDone={close} />}
    </Popover>
  );
}

/** Thẻ "Tiếp theo" đếm ngược 5 giây khi hết bài — Phát ngay / Huỷ. */
export function UpNextCard({ className = "" }: { className?: string }) {
  const { upNext, playUpNext, cancelUpNext } = usePlayer();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!upNext) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [upNext]);
  if (!upNext) return null;
  const left = Math.max(0, Math.ceil((upNext.at - now) / 1000));
  const pct = Math.min(100, Math.max(0, 100 - ((upNext.at - now) / 5000) * 100));
  return (
    <div
      role="status"
      aria-live="polite"
      className={`pop-in flex w-full max-w-md items-center gap-3 rounded-2xl border border-border bg-surface/95 p-2 pr-1.5 shadow-[var(--shadow)] backdrop-blur ${className}`}
    >
      <Cover src={upNext.track.coverUrl} className="w-12 shrink-0" rounded="rounded-xl" markSize={22} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">
          Tiếp theo sau <span className="font-mono font-semibold text-accent tabular-nums">{left}s</span>
        </p>
        <p className="truncate text-sm font-semibold text-text">{upNext.track.title}</p>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-text/10" aria-hidden="true">
          <div className="h-full rounded-full bg-accent transition-[width] duration-200 ease-linear" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <button type="button" className="btn btn-primary min-h-10 shrink-0 px-3.5 text-sm" onClick={playUpNext}>
        Phát ngay
      </button>
      <button type="button" className="icon-btn h-10 w-10 shrink-0" onClick={cancelUpNext} aria-label="Huỷ tự phát bài kế">
        <IconX size={18} />
      </button>
    </div>
  );
}
