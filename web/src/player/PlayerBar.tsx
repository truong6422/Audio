import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from "react";
import { Link } from "react-router-dom";
import { Cover } from "../components/Cover";
import { FollowTrackButton } from "../components/FollowButton";
import {
  IconBack15,
  IconChevronDown,
  IconFwd30,
  IconLock,
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
  IconX,
} from "../components/Icons";
import { ShareButton } from "../components/ShareButton";
import { episodeAt, episodeBounds, episodeCountOf, episodeList, episodeLocked, lockMarks } from "../lib/episodes";
import { fmtTime } from "../lib/format";
import { useSite } from "../site";
import { NowSubline, SeekBar, SleepButton, SpeedButton, UpNextCard } from "./Controls";
import { SKIP_BACK, SKIP_FWD, usePlayer, usePlayerTime } from "./PlayerContext";

function PlayButton({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const { isPlaying, loading, toggle } = usePlayer();
  const dims = size === "lg" ? "h-[72px] w-[72px]" : size === "md" ? "h-12 w-12" : "h-11 w-11";
  const icon = size === "lg" ? 30 : 20;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isPlaying ? "Tạm dừng" : "Phát"}
      className={`relative grid shrink-0 place-items-center rounded-full bg-accent text-on-accent shadow-[0_10px_30px_-10px_var(--accent)] transition-transform active:scale-95 ${dims}`}
    >
      {loading && isPlaying ? (
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-on-accent/30 border-t-on-accent" aria-hidden="true" />
      ) : null}
      {isPlaying ? <IconPause size={icon} /> : <IconPlay size={icon} className="translate-x-[1px]" />}
    </button>
  );
}

function SkipBack({ size }: { size: number }) {
  const { seekBy } = usePlayer();
  return (
    <button type="button" className="icon-btn" onClick={() => seekBy(-SKIP_BACK)} aria-label={`Lùi ${SKIP_BACK} giây`}>
      <IconBack15 size={size} />
    </button>
  );
}

function SkipFwd({ size }: { size: number }) {
  const { seekBy } = usePlayer();
  return (
    <button type="button" className="icon-btn" onClick={() => seekBy(SKIP_FWD)} aria-label={`Tới ${SKIP_FWD} giây`}>
      <IconFwd30 size={size} />
    </button>
  );
}

/** Vạch tiến độ mảnh trên đầu thanh mini (điện thoại), kèm mốc khoá. */
function ThinProgress() {
  const { current } = usePlayer();
  const { currentTime, duration } = usePlayerTime();
  const site = useSite();
  if (!current) return null;
  const ep = episodeAt(current, currentTime, duration);
  const b = episodeBounds(current, ep, duration);
  const len = b.end - b.start;
  const pct = len > 0 ? Math.min(100, ((currentTime - b.start) / len) * 100) : 0;
  const marks = len > 0 ? lockMarks(current, site.gate?.checkpoints, b.start, b.end, duration, site.gate?.unlockTtlHours) : [];
  return (
    <div className="absolute inset-x-0 top-0 h-[3px] bg-text/10" aria-hidden="true">
      <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
      {marks.map((m) => (
        <span key={m} className="absolute top-0 h-full w-[3px] -translate-x-1/2 bg-accent-2" style={{ left: `${((m - b.start) / len) * 100}%` }} />
      ))}
    </div>
  );
}

export function PlayerBar() {
  const { current, prev, next, queue, index } = usePlayer();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("has-player", !!current);
    return () => document.documentElement.classList.remove("has-player");
  }, [current]);

  // Nút Back (Android) đóng màn Đang phát thay vì rời trang.
  const open = useCallback(() => {
    try {
      history.pushState({ ...(history.state ?? {}), kdFull: 1 }, "");
    } catch {
      /* bỏ qua */
    }
    setExpanded(true);
  }, []);
  const close = useCallback(() => {
    if (history.state?.kdFull) history.back();
    else setExpanded(false);
  }, []);
  useEffect(() => {
    if (!expanded) return;
    const onPop = () => {
      if (!history.state?.kdFull) setExpanded(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [expanded]);

  if (!current) return null;
  const hasNext = episodeCountOf(current) > 1 || index < queue.length - 1;

  return (
    <>
      {!expanded && (
        <div
          className="pointer-events-none fixed inset-x-0 z-30 flex justify-center px-3"
          style={{ bottom: "calc(var(--player-h) + env(safe-area-inset-bottom) + 12px)" }}
        >
          <UpNextCard className="pointer-events-auto" />
        </div>
      )}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/85 backdrop-blur-xl safe-bottom"
        role="region"
        aria-label="Trình phát"
      >
        {/* Điện thoại */}
        <div className="relative md:hidden">
          <ThinProgress />
          <div className="flex h-[72px] items-center gap-2 px-3">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left"
              onClick={open}
              aria-label={`Mở trình phát: ${current.title}`}
            >
              <Cover src={current.coverUrl} className="w-12 shrink-0" rounded="rounded-xl" markSize={24} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-text">{current.title}</span>
                <NowSubline />
              </span>
            </button>
            <PlayButton size="sm" />
            <button type="button" className="icon-btn" onClick={next} disabled={!hasNext} aria-label="Tiếp theo">
              <IconNext size={20} />
            </button>
          </div>
        </div>

        {/* Máy tính */}
        <div className="wrap hidden h-[88px] items-center gap-6 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={open} aria-label="Mở trình phát toàn màn" className="shrink-0 rounded-xl">
              <Cover src={current.coverUrl} className="w-14" rounded="rounded-xl" markSize={26} />
            </button>
            <div className="min-w-0">
              <Link to={`/track/${current.slug}`} className="block truncate text-sm font-semibold text-text hover:text-accent">
                {current.title}
              </Link>
              <NowSubline />
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-2">
              <button type="button" className="icon-btn" onClick={prev} aria-label="Trước">
                <IconPrev size={18} />
              </button>
              <SkipBack size={20} />
              <PlayButton />
              <SkipFwd size={20} />
              <button type="button" className="icon-btn" onClick={next} disabled={!hasNext} aria-label="Tiếp theo">
                <IconNext size={18} />
              </button>
            </div>
            <SeekBar className="w-full" />
          </div>
          <div className="flex items-center justify-end gap-1">
            <SpeedButton />
            <SleepButton align="end" />
            <button type="button" className="icon-btn" onClick={open} aria-label="Mở trình phát toàn màn">
              <IconChevronDown size={20} className="rotate-180" />
            </button>
          </div>
        </div>
      </div>
      {expanded && <FullPlayer onClose={close} onNavigate={() => setExpanded(false)} />}
    </>
  );
}

const DISMISS_PX = 110;

/** Trình phát mở rộng toàn màn (chủ yếu cho điện thoại). Vuốt xuống / Esc / Back để thu nhỏ. */
function FullPlayer({ onClose, onNavigate }: { onClose: () => void; onNavigate: () => void }) {
  const { current, prev, next, playEpisode, queue, index, gate } = usePlayer();
  const { currentTime, duration } = usePlayerTime();
  const site = useSite();
  const gateOpen = useRef(gate.open);
  gateOpen.current = gate.open;
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [showEps, setShowEps] = useState(false);
  const [closing, setClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [entered, setEntered] = useState(false); // bỏ lớp hoạt ảnh sau khi vào để transform khi vuốt có tác dụng
  const drag = useRef<{ y: number; t: number; id: number } | null>(null);
  const closingRef = useRef(false);

  const animateClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return onClose();
    setClosing(true);
    window.setTimeout(onClose, 220);
  }, [onClose]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const prevFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !gateOpen.current) animateClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      prevFocus?.focus?.();
    };
  }, [animateClose]);

  // Vuốt xuống từ vùng đầu / ảnh bìa để thu nhỏ (chỉ cảm ứng, khi đang ở đầu màn).
  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" || (sheetRef.current?.scrollTop ?? 0) > 0) return;
    if ((e.target as HTMLElement).closest("button, a, input")) return;
    drag.current = { y: e.clientY, t: performance.now(), id: e.pointerId };
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dy = Math.max(0, e.clientY - d.y);
    if (dy > 6 && !dragActive) {
      setDragActive(true);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* bỏ qua */
      }
    }
    setDragY(dy);
  };
  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    setDragActive(false);
    if (!d) return;
    const dy = Math.max(0, e.clientY - d.y);
    const v = dy / Math.max(1, performance.now() - d.t); // px/ms
    if (dy > DISMISS_PX || (dy > 40 && v > 0.6)) animateClose();
    else setDragY(0);
  };

  if (!current) return null;
  const n = episodeCountOf(current);
  const ep = episodeAt(current, currentTime, duration);
  const eps = n > 1 ? episodeList(current, duration) : [];
  const hasNext = n > 1 || index < queue.length - 1;
  const style: CSSProperties | undefined = closing
    ? { transform: "translateY(100%)", transition: "transform 220ms cubic-bezier(0.4, 0, 1, 1)" }
    : dragY > 0
      ? { transform: `translateY(${dragY}px)`, transition: dragActive ? "none" : "transform 200ms ease-out" }
      : undefined;

  return (
    <div
      ref={sheetRef}
      className={`${entered ? "" : "sheet-up "}fixed inset-0 z-50 flex flex-col overflow-y-auto overscroll-contain bg-bg`}
      style={style}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) setEntered(true);
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Đang phát: ${current.title}`}
    >
      {current.coverUrl && (
        <div
          className="pointer-events-none absolute inset-0 opacity-30 blur-3xl"
          style={{ backgroundImage: `url("${current.coverUrl}")`, backgroundSize: "cover", backgroundPosition: "center" }}
          aria-hidden="true"
        />
      )}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "linear-gradient(180deg, color-mix(in srgb, var(--bg) 40%, transparent), var(--bg) 75%)" }}
        aria-hidden="true"
      />
      <div className="relative mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(8px,env(safe-area-inset-top))] sm:px-5">
        <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} className="touch-pan-x select-none">
          <div className="mx-auto mt-1 h-1 w-10 rounded-full bg-text/25 md:hidden" aria-hidden="true" />
          <div className="flex items-center justify-between">
            <button ref={closeRef} type="button" className="icon-btn" onClick={animateClose} aria-label="Thu nhỏ trình phát">
              <IconChevronDown size={24} />
            </button>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Đang phát</p>
            <FollowTrackButton track={current} compact />
          </div>
          <Cover
            src={current.coverUrl}
            className="mx-auto mt-3 w-full max-w-[min(320px,40dvh)] shadow-[var(--shadow)]"
            rounded="rounded-3xl"
            eager
            markSize={72}
          />
        </div>

        <div className="mt-5 flex flex-1 flex-col justify-center gap-5">
          <div className="text-center">
            <Link
              to={`/track/${current.slug}`}
              replace={!!history.state?.kdFull}
              onClick={onNavigate}
              className="font-display text-2xl font-bold leading-tight text-text hover:text-accent"
            >
              {current.title}
            </Link>
            <p className="mt-1 text-sm text-muted">
              {current.code ? `Mã số ${current.code}` : site.brandName}
              {n > 1 ? ` · Tập ${ep}/${n}` : ""}
            </p>
            <NowSubline className="mt-1 text-center" />
          </div>
          <SeekBar />
          <div className="flex items-center justify-center gap-1 min-[380px]:gap-3">
            <button type="button" className="icon-btn" onClick={prev} aria-label="Trước">
              <IconPrev size={22} />
            </button>
            <SkipBack size={26} />
            <PlayButton size="lg" />
            <SkipFwd size={26} />
            <button type="button" className="icon-btn" onClick={next} disabled={!hasNext} aria-label="Tiếp theo">
              <IconNext size={22} />
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-1">
            <SpeedButton />
            <SleepButton />
            {n > 1 && (
              <button
                type="button"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm text-text hover:bg-text/8"
                onClick={() => setShowEps((s) => !s)}
                aria-expanded={showEps}
              >
                Danh sách tập
              </button>
            )}
            <ShareButton track={current} placement="up" align="end" compact />
          </div>
          <UpNextCard className="mx-auto" />
        </div>

        {showEps && n > 1 && (
          <div className="pop-in mt-6 rounded-2xl border border-border bg-surface/80 p-2">
            <div className="flex items-center justify-between px-2 py-1">
              <p className="text-sm font-semibold">
                Tập {ep}/{n}
              </p>
              <button type="button" className="icon-btn h-10 w-10" onClick={() => setShowEps(false)} aria-label="Ẩn danh sách tập">
                <IconX size={16} />
              </button>
            </div>
            <ul className="max-h-[40vh] overflow-y-auto">
              {eps.map((e) => {
                const locked = episodeLocked(current, site.gate?.checkpoints, e.n, duration, site.gate?.unlockTtlHours);
                const active = e.n === ep;
                return (
                  <li key={e.n}>
                    <button
                      type="button"
                      onClick={() => playEpisode(current, e.n)}
                      aria-current={active ? "true" : undefined}
                      className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                        active ? "bg-accent/12 text-accent" : "text-text hover:bg-text/5"
                      }`}
                    >
                      <span className="w-8 font-mono text-xs text-muted">{String(e.n).padStart(2, "0")}</span>
                      <span className="flex-1">Tập {e.n}</span>
                      {locked && <IconLock size={14} className="text-accent" aria-label="Cần mở khoá" />}
                      <span className="font-mono text-xs text-muted">{fmtTime(e.end - e.start)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
