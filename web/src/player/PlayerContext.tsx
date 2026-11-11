import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { HistoryItem, LockPoint, PlaybackInfo, Track } from "@shared/types";
import type Hls from "hls.js";
import { apiGet, apiPost, errorMessage } from "../api";
import { useAuth } from "../auth";
import { getSite, useSite } from "../site";
import { episodeAt, episodeBounds, episodeCountOf, lockedAt, markUnlocked } from "../lib/episodes";
import { trackEvent } from "../lib/events";
import { markListened } from "../lib/pwa";
import { addListenSeconds } from "../lib/streak";
import { clearProgress, getProgress, isResumable, saveProgress } from "../lib/progress";
import { local } from "../lib/storage";

/* ================= Kiểu ================= */

export type SleepMode = { kind: "time"; endAt: number } | { kind: "track" } | { kind: "episode"; ep: number } | null;

/** Bài kế đang chờ tự phát (đếm ngược). */
export interface UpNext {
  track: Track;
  at: number; // Date.now() lúc sẽ phát
}

export const SKIP_BACK = 15;
export const SKIP_FWD = 30;
const UP_NEXT_MS = 5000;

export interface GateState {
  open: boolean;
  point: LockPoint | null;
  dismissed: boolean;
}

export interface PlayerState {
  queue: Track[];
  index: number;
  current: Track | null;
  isPlaying: boolean;
  loading: boolean;
  error: string | null;
  rate: number;
  sleep: SleepMode;
  sleepLeftMs: number | null;
  gate: GateState;
  resumeOffer: { trackId: string; position: number } | null;
  upNext: UpNext | null;
}

export interface PlayerActions {
  /** Phát danh sách bắt đầu ở index. startSec bỏ trống = từ đầu (có hỏi "nghe tiếp" nếu đã nghe dở). */
  playQueue(tracks: Track[], index: number, startSec?: number): void;
  toggle(): void;
  play(): void;
  pause(): void;
  next(): void;
  prev(): void;
  seek(sec: number): void;
  seekBy(delta: number): void;
  playEpisode(track: Track, ep: number, queue?: Track[]): void;
  setRate(r: number): void;
  setSleep(mode: number | "track" | "episode" | null): void;
  playUpNext(): void;
  cancelUpNext(): void;
  unlockGate(): void;
  dismissGate(): void;
  reopenGate(): void;
  acceptResume(): void;
  declineResume(): void;
  getSavedPosition(trackId: string): number;
}

export interface PlayerTime {
  currentTime: number;
  duration: number;
}

/* ================= Hằng ================= */

const RATE_KEY = "kd_rate";
export const RATE_MIN = 0.25;
export const RATE_MAX = 2;
const LOCAL_SAVE_MS = 5000;
const SERVER_SAVE_MS = 15000;

export function clampRate(r: number): number {
  if (!Number.isFinite(r)) return 1;
  return Math.round(Math.min(RATE_MAX, Math.max(RATE_MIN, r)) * 100) / 100;
}

function readRate(): number {
  const v = Number(local.get(RATE_KEY));
  return Number.isFinite(v) && v >= RATE_MIN && v <= RATE_MAX ? v : 1;
}

const isAdminPath = () => location.pathname.startsWith("/admin");

/* ================= Context ================= */

const StateCtx = createContext<(PlayerState & PlayerActions) | null>(null);
const TimeCtx = createContext<PlayerTime>({ currentTime: 0, duration: 0 });

export function usePlayer() {
  const v = useContext(StateCtx);
  if (!v) throw new Error("usePlayer ngoài PlayerProvider");
  return v;
}
export const usePlayerTime = () => useContext(TimeCtx);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const site = useSite();

  const audioRef = useRef<HTMLAudioElement | null>(null);
  if (!audioRef.current && typeof Audio !== "undefined") {
    const a = new Audio();
    a.preload = "metadata";
    audioRef.current = a;
  }
  const hlsRef = useRef<Hls | null>(null);
  const loadToken = useRef(0);
  const intentRef = useRef(false); // muốn phát khi nguồn sẵn sàng và không bị khoá
  const pendingSeekRef = useRef<number | null>(null);
  const lastLocalSave = useRef(0);
  const lastServerSave = useRef(0);
  const serverPos = useRef(new Map<string, { position: number; updatedAt: number }>());

  const [queue, setQueue] = useState<Track[]>([]);
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rate, setRateState] = useState<number>(readRate);
  const [sleep, setSleepState] = useState<SleepMode>(null);
  const [sleepLeftMs, setSleepLeft] = useState<number | null>(null);
  const [gate, setGate] = useState<GateState>({ open: false, point: null, dismissed: false });
  const [resumeOffer, setResumeOffer] = useState<PlayerState["resumeOffer"]>(null);
  const [time, setTime] = useState<PlayerTime>({ currentTime: 0, duration: 0 });
  const [upNext, setUpNext] = useState<UpNext | null>(null);

  // Đếm thời gian nghe (chuỗi ngày + "đã nghe ≥ 1 phút" cho lời mời cài app) và sự kiện "play" một lần mỗi lần nạp.
  const playedToken = useRef(-1);
  const lastTick = useRef(0);
  const listenAcc = useRef(0);
  const trackListen = useRef({ id: "", sec: 0 });

  const current = queue[index] ?? null;

  // Gương ref cho các handler sự kiện (tránh closure cũ).
  const S = useRef({ queue, index, current, gate, sleep, rate, user });
  S.current = { queue, index, current, gate, sleep, rate, user };

  const flushListen = useCallback(() => {
    if (listenAcc.current > 0) {
      addListenSeconds(listenAcc.current);
      listenAcc.current = 0;
    }
  }, []);

  /* ---------- Lưu vị trí ---------- */

  const pushServer = useCallback((track: Track, position: number, keepalive = false) => {
    if (!S.current.user) return;
    const pos = Math.max(0, Math.floor(position));
    serverPos.current.set(track.id, { position: pos, updatedAt: Math.floor(Date.now() / 1000) });
    fetch(`/api/history/${encodeURIComponent(track.id)}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positionSeconds: pos }),
      keepalive,
    }).catch(() => {});
  }, []);

  const persistNow = useCallback(
    (keepalive = false) => {
      const a = audioRef.current;
      const track = S.current.current;
      if (!a || !track || a.ended) return;
      const t = a.currentTime;
      if (!(t > 3)) return;
      saveProgress(track, t);
      pushServer(track, t, keepalive);
      lastLocalSave.current = lastServerSave.current = Date.now();
    },
    [pushServer],
  );

  // Vị trí đã lưu trên máy chủ (khi đăng nhập) — nạp một lần.
  useEffect(() => {
    serverPos.current.clear();
    if (!user) return;
    apiGet<HistoryItem[]>("/api/history")
      .then((items) => {
        for (const it of items ?? []) serverPos.current.set(it.track.id, { position: it.positionSeconds, updatedAt: it.updatedAt });
      })
      .catch(() => {});
  }, [user]);

  const getSavedPosition = useCallback((trackId: string) => {
    const l = getProgress(trackId);
    const s = serverPos.current.get(trackId);
    if (l && s) return l.updatedAt >= s.updatedAt ? l.position : s.position;
    return l?.position ?? s?.position ?? 0;
  }, []);

  /* ---------- Khoá ---------- */

  const lockAt = useCallback((track: Track, t: number): LockPoint | null => {
    if (isAdminPath()) return null;
    const cps = getSite().gate?.checkpoints;
    if (!cps?.length) return null;
    return lockedAt(track, cps, t, audioRef.current?.duration, getSite().gate?.unlockTtlHours);
  }, []);

  const openGate = useCallback((cp: LockPoint, forTrack?: Track) => {
    const g = S.current.gate;
    if (!(g.open && g.point?.id === cp.id)) trackEvent("gate_shown", { trackId: (forTrack ?? S.current.current)?.id, checkpointId: cp.id });
    S.current.gate = { open: true, point: cp, dismissed: false };
    setGate({ open: true, point: cp, dismissed: false });
  }, []);

  /* ---------- Nạp nguồn ---------- */

  const destroyHls = () => {
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {
        /* bỏ qua */
      }
      hlsRef.current = null;
    }
  };

  const tryPlay = useCallback(() => {
    const a = audioRef.current;
    if (!a || !a.src && !hlsRef.current) return;
    a.play().catch((e: unknown) => {
      if ((e as Error)?.name === "NotAllowedError") {
        // Trình duyệt chặn tự phát: chờ người dùng bấm Phát.
        intentRef.current = false;
        setIsPlaying(false);
        setLoading(false);
      }
    });
  }, []);

  const loadTrack = useCallback(
    async (track: Track, start: number, wantPlay: boolean) => {
      const a = audioRef.current;
      if (!a) return;
      const token = ++loadToken.current;
      destroyHls();
      a.pause();
      a.removeAttribute("src");
      try {
        a.load();
      } catch {
        /* bỏ qua */
      }
      setError(null);
      setLoading(true);
      setIsPlaying(false);
      setTime({ currentTime: start, duration: track.durationSeconds || 0 });
      lastLocalSave.current = lastServerSave.current = Date.now();
      pendingSeekRef.current = start > 0 ? start : null;
      intentRef.current = wantPlay;

      const cp = lockAt(track, start);
      if (cp) openGate(cp, track);
      else {
        S.current.gate = { open: false, point: null, dismissed: false };
        setGate((g) => (g.open || g.dismissed ? { open: false, point: null, dismissed: false } : g));
      }

      let info: PlaybackInfo;
      try {
        info = await apiGet<PlaybackInfo>(`/api/playback/${encodeURIComponent(track.id)}`);
      } catch (e) {
        if (token !== loadToken.current) return;
        setLoading(false);
        setError(errorMessage(e));
        return;
      }
      if (token !== loadToken.current) return;

      const nativeHls = a.canPlayType("application/vnd.apple.mpegurl") !== "";
      if (info.format === "hls" && !nativeHls) {
        let HlsCtor: typeof Hls;
        try {
          HlsCtor = (await import("hls.js/light")).default;
        } catch {
          if (token !== loadToken.current) return;
          setLoading(false);
          setError("Không tải được bộ phát. Thử tải lại trang.");
          return;
        }
        if (token !== loadToken.current) return;
        if (!HlsCtor.isSupported()) {
          setLoading(false);
          setError("Trình duyệt này không hỗ trợ phát luồng HLS.");
          return;
        }
        const hls = new HlsCtor({ enableWorker: true, lowLatencyMode: false, startPosition: start > 0 ? start : -1 });
        hlsRef.current = hls;
        let mediaRecovered = false;
        hls.on(HlsCtor.Events.ERROR, (_evt, data) => {
          if (!data.fatal) return;
          if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR && !mediaRecovered) {
            mediaRecovered = true;
            hls.recoverMediaError();
          } else {
            setLoading(false);
            setIsPlaying(false);
            setError("Lỗi phát luồng audio. Thử lại sau ít phút.");
          }
        });
        hls.loadSource(info.url);
        hls.attachMedia(a);
      } else {
        a.src = info.url;
      }
      a.defaultPlaybackRate = S.current.rate;
      a.playbackRate = S.current.rate;
      if (intentRef.current && !S.current.gate.open && !lockAt(track, start)) tryPlay();
      else setLoading(false);
    },
    [lockAt, openGate, tryPlay],
  );

  /* ---------- Hành động ---------- */

  const startAt = useCallback(
    (tracks: Track[], i: number, startSec: number | undefined, wantPlay = true) => {
      // Lưu bài đang nghe trước khi đổi.
      persistNow();
      flushListen();
      const track = tracks[i];
      if (!track) return;
      setUpNext(null);
      setQueue(tracks);
      setIndex(i);
      let start = startSec ?? 0;
      setResumeOffer(null);
      if (startSec === undefined) {
        const saved = getSavedPosition(track.id);
        if (isResumable(saved, track.durationSeconds)) setResumeOffer({ trackId: track.id, position: saved });
        start = 0;
      }
      void loadTrack(track, Math.max(0, start), wantPlay);
    },
    [getSavedPosition, loadTrack, persistNow, flushListen],
  );

  const playQueue = useCallback(
    (tracks: Track[], i: number, startSec?: number) => {
      const ready = tracks.filter((t) => t.status === "ready");
      const target = tracks[i];
      if (!target || target.status !== "ready") {
        setError("Audio này đang được xử lý, quay lại sau nhé.");
        return;
      }
      startAt(ready, ready.indexOf(target), startSec);
    },
    [startAt],
  );

  const play = useCallback(() => {
    const a = audioRef.current;
    const track = S.current.current;
    if (!a || !track) return;
    setUpNext(null);
    const cp = lockAt(track, a.currentTime);
    intentRef.current = true;
    if (cp) {
      a.pause();
      openGate(cp);
      return;
    }
    tryPlay();
  }, [lockAt, openGate, tryPlay]);

  const pause = useCallback(() => {
    intentRef.current = false;
    audioRef.current?.pause();
  }, []);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a || !S.current.current) return;
    if (a.paused) play();
    else pause();
  }, [play, pause]);

  const seek = useCallback(
    (sec: number) => {
      const a = audioRef.current;
      const track = S.current.current;
      if (!a || !track) return;
      const dur = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : track.durationSeconds;
      const target = Math.max(0, Math.min(dur > 0 ? dur - 0.25 : sec, sec));
      const cp = lockAt(track, target);
      if (cp) {
        a.pause();
        intentRef.current = true;
        openGate(cp);
      }
      if (a.readyState >= 1) a.currentTime = target;
      else pendingSeekRef.current = target;
      setTime((t) => ({ ...t, currentTime: target }));
      setResumeOffer(null);
      // "Hết tập này": tua sang tập khác thì dừng ở cuối tập mới.
      const sl = S.current.sleep;
      if (sl?.kind === "episode") {
        const ep = episodeAt(track, target, a.duration);
        if (ep !== sl.ep) setSleepState({ kind: "episode", ep });
      }
    },
    [lockAt, openGate],
  );

  const seekBy = useCallback((delta: number) => {
    const a = audioRef.current;
    if (!a) return;
    seek(a.currentTime + delta);
  }, [seek]);

  const ensurePlaying = useCallback(() => {
    const a = audioRef.current;
    if (a && a.paused && !S.current.gate.open) play();
  }, [play]);

  const next = useCallback(() => {
    const a = audioRef.current;
    const { current: track, queue: q, index: i } = S.current;
    if (!a || !track) return;
    const n = episodeCountOf(track);
    const ep = episodeAt(track, a.currentTime, a.duration);
    if (n > 1 && ep < n) {
      seek(episodeBounds(track, ep + 1, a.duration).start);
      ensurePlaying();
      return;
    }
    if (i < q.length - 1) startAt(q, i + 1, undefined);
  }, [seek, ensurePlaying, startAt]);

  const prev = useCallback(() => {
    const a = audioRef.current;
    const { current: track, queue: q, index: i } = S.current;
    if (!a || !track) return;
    const t = a.currentTime;
    const n = episodeCountOf(track);
    if (n > 1) {
      const ep = episodeAt(track, t, a.duration);
      const b = episodeBounds(track, ep, a.duration);
      if (t - b.start > 3) return seek(b.start);
      if (ep > 1) return seek(episodeBounds(track, ep - 1, a.duration).start);
    } else if (t > 3) {
      return seek(0);
    }
    if (i > 0) startAt(q, i - 1, 0);
    else seek(0);
  }, [seek, startAt]);

  const playEpisode = useCallback(
    (track: Track, ep: number, q?: Track[]) => {
      const a = audioRef.current;
      if (S.current.current?.id === track.id && a) {
        seek(episodeBounds(track, ep, a.duration).start);
        ensurePlaying();
        return;
      }
      const list = q && q.some((t) => t.id === track.id) ? q : [track];
      const ready = list.filter((t) => t.status === "ready");
      const i = ready.findIndex((t) => t.id === track.id);
      if (i < 0) return;
      startAt(ready, i, episodeBounds(track, ep).start);
    },
    [seek, ensurePlaying, startAt],
  );

  const setRate = useCallback((r: number) => {
    const v = clampRate(r);
    setRateState(v);
    local.set(RATE_KEY, String(v));
    const a = audioRef.current;
    if (a) {
      a.defaultPlaybackRate = v;
      a.playbackRate = v;
    }
  }, []);

  const setSleep = useCallback((mode: number | "track" | "episode" | null) => {
    const a = audioRef.current;
    if (a) a.volume = 1;
    const track = S.current.current;
    if (mode === null) {
      setSleepState(null);
      setSleepLeft(null);
    } else if (mode === "episode" && track && a && episodeCountOf(track) > 1) {
      setSleepState({ kind: "episode", ep: episodeAt(track, a.currentTime, a.duration) });
      setSleepLeft(null);
    } else if (mode === "track" || mode === "episode") {
      setSleepState({ kind: "track" });
      setSleepLeft(null);
    } else {
      const endAt = Date.now() + mode * 60_000;
      setSleepState({ kind: "time", endAt });
      setSleepLeft(mode * 60_000);
    }
  }, []);

  const unlockGate = useCallback(() => {
    const cp = S.current.gate.point;
    const track = S.current.current;
    if (!cp) return;
    markUnlocked(cp);
    // Mở link ngay trong thao tác bấm (tránh bị chặn popup).
    if (cp.link) window.open(cp.link, "_blank", "noopener");
    setGate({ open: false, point: null, dismissed: false });
    S.current.gate = { open: false, point: null, dismissed: false };
    intentRef.current = true;
    const a = audioRef.current;
    if (a && (a.src || hlsRef.current)) tryPlay();
    apiPost("/api/public/unlock", { checkpointId: cp.id, trackId: track?.id ?? "" }).catch(() => {});
    trackEvent("unlock", { trackId: track?.id, checkpointId: cp.id });
  }, [tryPlay]);

  const dismissGate = useCallback(() => {
    intentRef.current = false;
    audioRef.current?.pause();
    const point = S.current.gate.point;
    if (point) trackEvent("gate_dismiss", { trackId: S.current.current?.id, checkpointId: point.id });
    S.current.gate = { open: false, point, dismissed: true };
    setGate((g) => ({ open: false, point: g.point, dismissed: true }));
  }, []);

  const reopenGate = useCallback(() => {
    const a = audioRef.current;
    const track = S.current.current;
    const cp = (track && a && lockAt(track, a.currentTime)) || S.current.gate.point;
    if (cp) {
      intentRef.current = true;
      openGate(cp);
    } else {
      setGate({ open: false, point: null, dismissed: false });
      play();
    }
  }, [lockAt, openGate, play]);

  const playUpNext = useCallback(() => {
    const { queue: q, index: i } = S.current;
    setUpNext(null);
    if (i < q.length - 1) startAt(q, i + 1, undefined);
  }, [startAt]);

  const cancelUpNext = useCallback(() => setUpNext(null), []);

  const acceptResume = useCallback(() => {
    const offer = resumeOffer;
    setResumeOffer(null);
    if (offer && S.current.current?.id === offer.trackId) {
      seek(offer.position);
      ensurePlaying();
    }
  }, [resumeOffer, seek, ensurePlaying]);

  const declineResume = useCallback(() => setResumeOffer(null), []);

  /* ---------- Sự kiện audio ---------- */

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const onTime = () => {
      const t = a.currentTime;
      setTime({ currentTime: t, duration: Number.isFinite(a.duration) ? a.duration : S.current.current?.durationSeconds ?? 0 });
      const track = S.current.current;
      if (!track) return;
      // Chạm vùng khoá khi đang phát.
      if (!a.paused && !S.current.gate.open) {
        const cp = lockAt(track, t);
        if (cp) {
          a.pause();
          intentRef.current = true;
          openGate(cp);
          return;
        }
      }
      if (!a.paused) {
        // Thời gian nghe thật (đồng hồ tường, bỏ quãng ngắt > 3 giây).
        const nowP = performance.now();
        const d = (nowP - lastTick.current) / 1000;
        lastTick.current = nowP;
        if (d > 0 && d < 3) {
          listenAcc.current += d;
          if (listenAcc.current >= 15) flushListen();
          const tl = trackListen.current;
          if (tl.id !== track.id) trackListen.current = { id: track.id, sec: d };
          else if (tl.sec < 60 && (tl.sec += d) >= 60) markListened(track.id);
        }
        // Hẹn giờ "Hết tập này": dừng ở cuối tập, nhỏ dần 10 giây cuối.
        const sl = S.current.sleep;
        if (sl?.kind === "episode") {
          const end = episodeBounds(track, sl.ep, a.duration).end;
          const left = end - t;
          const isLast = sl.ep >= episodeCountOf(track);
          if (!isLast && left <= 0.3) {
            intentRef.current = false;
            a.pause();
            a.volume = 1;
            setSleepState(null);
            setSleepLeft(null);
            return;
          }
          a.volume = left < 10 && left > 0 ? Math.max(0.05, left / 10) : 1;
        }
      }
      if (!a.paused && t > 3) {
        const now = Date.now();
        if (now - lastLocalSave.current > LOCAL_SAVE_MS) {
          lastLocalSave.current = now;
          saveProgress(track, t);
        }
        if (S.current.user && now - lastServerSave.current > SERVER_SAVE_MS) {
          lastServerSave.current = now;
          pushServer(track, t);
        }
      }
    };
    const onMeta = () => {
      const p = pendingSeekRef.current;
      if (p != null) {
        pendingSeekRef.current = null;
        try {
          a.currentTime = p;
        } catch {
          /* bỏ qua */
        }
      }
      a.playbackRate = S.current.rate;
      setTime({ currentTime: a.currentTime, duration: Number.isFinite(a.duration) ? a.duration : 0 });
    };
    const onPlay = () => {
      setIsPlaying(true);
      setError(null);
    };
    const onPlaying = () => {
      setIsPlaying(true);
      setLoading(false);
      lastTick.current = performance.now();
      const track = S.current.current;
      if (track && playedToken.current !== loadToken.current) {
        playedToken.current = loadToken.current;
        trackEvent("play", { trackId: track.id });
      }
    };
    const onPause = () => {
      setIsPlaying(false);
      persistNow();
      flushListen();
    };
    const onWaiting = () => setLoading(true);
    const onCanPlay = () => {
      setLoading(false);
      if (intentRef.current && a.paused && !S.current.gate.open) {
        const track = S.current.current;
        if (track && !lockAt(track, a.currentTime)) tryPlay();
      }
    };
    const onError = () => {
      if (hlsRef.current) return; // hls.js tự xử lý
      if (!a.getAttribute("src")) return;
      setLoading(false);
      setIsPlaying(false);
      setError("Không phát được audio này. Thử lại sau.");
    };
    const onEnded = () => {
      const { current: track, queue: q, index: i, sleep: sl } = S.current;
      flushListen();
      if (track) {
        clearProgress(track.id);
        pushServer(track, 0);
        trackEvent("complete", { trackId: track.id });
      }
      a.volume = 1;
      if (sl?.kind === "track" || sl?.kind === "episode") {
        setSleepState(null);
        setSleepLeft(null);
        intentRef.current = false;
        setIsPlaying(false);
        return;
      }
      if (i < q.length - 1) {
        // Màn đang ẩn (khoá máy) → phát luôn, khỏi đếm ngược; đang xem → đếm 5 giây, huỷ được.
        if (document.visibilityState === "hidden") startAt(q, i + 1, undefined);
        else {
          setIsPlaying(false);
          setUpNext({ track: q[i + 1], at: Date.now() + UP_NEXT_MS });
        }
      } else setIsPlaying(false);
    };

    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onMeta);
    a.addEventListener("play", onPlay);
    a.addEventListener("playing", onPlaying);
    a.addEventListener("pause", onPause);
    a.addEventListener("waiting", onWaiting);
    a.addEventListener("canplay", onCanPlay);
    a.addEventListener("error", onError);
    a.addEventListener("ended", onEnded);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("durationchange", onMeta);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("playing", onPlaying);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("waiting", onWaiting);
      a.removeEventListener("canplay", onCanPlay);
      a.removeEventListener("error", onError);
      a.removeEventListener("ended", onEnded);
    };
  }, [lockAt, openGate, persistNow, pushServer, startAt, tryPlay, flushListen]);

  // Đếm ngược tự phát bài kế.
  useEffect(() => {
    if (!upNext) return;
    const id = window.setTimeout(() => {
      const { queue: q, index: i } = S.current;
      setUpNext(null);
      if (q[i + 1]?.id === upNext.track.id) startAt(q, i + 1, undefined);
    }, Math.max(0, upNext.at - Date.now()));
    return () => window.clearTimeout(id);
  }, [upNext, startAt]);

  // Lưu khi rời trang / ẩn tab.
  useEffect(() => {
    const onHide = () => {
      persistNow(true);
      flushListen();
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") onHide();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [persistNow, flushListen]);

  /* ---------- Hẹn giờ ---------- */

  useEffect(() => {
    if (sleep?.kind !== "time") return;
    const tick = () => {
      const left = sleep.endAt - Date.now();
      const a = audioRef.current;
      if (left <= 0) {
        intentRef.current = false;
        a?.pause();
        if (a) a.volume = 1;
        setSleepState(null);
        setSleepLeft(null);
        return;
      }
      // Nhỏ dần trong 10 giây cuối cho êm.
      if (a) a.volume = left < 10_000 ? Math.max(0.05, left / 10_000) : 1;
      setSleepLeft(left);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [sleep]);

  /* ---------- Gợi ý nghe tiếp tự ẩn ---------- */

  useEffect(() => {
    if (!resumeOffer) return;
    const id = window.setTimeout(() => setResumeOffer(null), 12_000);
    return () => window.clearTimeout(id);
  }, [resumeOffer]);

  /* ---------- Media Session ---------- */

  useEffect(() => {
    if (!("mediaSession" in navigator) || !current) return;
    try {
      const artwork = current.coverUrl
        ? [
            { src: current.coverUrl, sizes: "512x512" },
            { src: current.coverUrl, sizes: "256x256" },
          ]
        : [{ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }];
      navigator.mediaSession.metadata = new MediaMetadata({ title: current.title, artist: site.brandName, album: site.brandName, artwork });
    } catch {
      /* bỏ qua */
    }
  }, [current, site.brandName]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const set = (action: MediaSessionAction, h: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(action, h);
      } catch {
        /* trình duyệt không hỗ trợ hành động này */
      }
    };
    set("play", () => play());
    set("pause", () => pause());
    set("previoustrack", () => prev());
    set("nexttrack", () => next());
    set("seekbackward", (d) => seekBy(-(d.seekOffset || SKIP_BACK)));
    set("seekforward", (d) => seekBy(d.seekOffset || SKIP_FWD));
    set("seekto", (d) => {
      if (d.seekTime != null) seek(d.seekTime);
    });
  }, [play, pause, prev, next, seek, seekBy]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = current ? (isPlaying ? "playing" : "paused") : "none";
  }, [isPlaying, current]);

  const posTick = Math.floor(time.currentTime / 5);
  useEffect(() => {
    if (!("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
    const d = time.duration;
    if (!(d > 0) || !Number.isFinite(d)) return;
    try {
      navigator.mediaSession.setPositionState({ duration: d, position: Math.min(d, Math.max(0, time.currentTime)), playbackRate: rate });
    } catch {
      /* bỏ qua */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posTick, time.duration, rate]);

  /* ---------- Phím tắt ---------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (isAdminPath() || !S.current.current || S.current.gate.open) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      if (e.key === " " || e.code === "Space") {
        if (tag === "BUTTON" || tag === "A" || el?.getAttribute("role") === "button") return;
        e.preventDefault();
        toggle();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        seekBy(-SKIP_BACK);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        seekBy(SKIP_FWD);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, seekBy]);

  // Dọn khi gỡ.
  useEffect(
    () => () => {
      destroyHls();
      audioRef.current?.pause();
    },
    [],
  );

  const value = useMemo(
    () => ({
      queue,
      index,
      current,
      isPlaying,
      loading,
      error,
      rate,
      sleep,
      sleepLeftMs,
      gate,
      resumeOffer,
      upNext,
      playQueue,
      toggle,
      play,
      pause,
      next,
      prev,
      seek,
      seekBy,
      playEpisode,
      setRate,
      setSleep,
      playUpNext,
      cancelUpNext,
      unlockGate,
      dismissGate,
      reopenGate,
      acceptResume,
      declineResume,
      getSavedPosition,
    }),
    [
      queue, index, current, isPlaying, loading, error, rate, sleep, sleepLeftMs, gate, resumeOffer, upNext, playUpNext, cancelUpNext,
      playQueue, toggle, play, pause, next, prev, seek, seekBy, playEpisode, setRate, setSleep,
      unlockGate, dismissGate, reopenGate, acceptResume, declineResume, getSavedPosition,
    ],
  );

  return (
    <StateCtx.Provider value={value}>
      <TimeCtx.Provider value={time}>{children}</TimeCtx.Provider>
    </StateCtx.Provider>
  );
}
