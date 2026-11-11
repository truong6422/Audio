// Ghép ở trình duyệt: dựng dòng thời gian → kết xuất từng cửa sổ 3 phút bằng OfflineAudioContext (không dồn cả giờ vào RAM)
// → lượt 1 đo LUFS → lượt 2 bù độ to + giới hạn đỉnh → WAV PCM 16-bit.
// Ducking xác định: biết chính xác lúc có lời nên tự động hoá gain của nhạc (giảm duckDb, vào ~50 ms, nhả ~300 ms).

import { LoudnessMeter, Limiter, toInt16, wavBlob } from "./dsp";
import type { ScriptItem } from "./studioApi";
import { synthMusic, synthSfx } from "./synth";

export interface MixOptions {
  sampleRate: number; // 24000 | 44100 | 48000
  channels: 1 | 2;
  musicVolume: number; // 0..1, mặc định 0.08 (≈ −22 dB) — như make-YT
  duckDb: number; // dB giảm nhạc khi có lời (âm), mặc định −6
  sfxVolume: number; // mặc định 0.35
  speechRmsDb: number; // chuẩn hoá từng lời về RMS này trước khi trộn, mặc định −20 dBFS
  targetLufs: number; // −16 (stereo) / −19 (mono)
  ceilingDb: number; // −1.5 dBFS
  pauseScale: number; // nhân mọi khoảng nghỉ (1 = như kịch bản)
}

export const DEFAULT_MIX: MixOptions = {
  sampleRate: 24000,
  channels: 1,
  musicVolume: 0.08,
  duckDb: -6,
  sfxVolume: 0.35,
  speechRmsDb: -20,
  targetLufs: -19,
  ceilingDb: -1.5,
  pauseScale: 1,
};

export interface MixInput {
  items: ScriptItem[];
  durations: Map<number, number>; // n → ms
  fetchSegment: (n: number) => Promise<ArrayBuffer>;
  /** null = thư viện không có → dùng âm tổng hợp. */
  fetchLibrary: (kind: "music" | "sfx", name: string) => Promise<ArrayBuffer | null>;
}

export interface MixResult {
  blob: Blob;
  durationSec: number;
  measuredLufs: number; // trước khi bù
  finalLufs: number;
  peakDb: number;
  gainDb: number;
  chapters: { title: string; start: number }[];
  warnings: string[];
  synthesized: string[]; // tên nhạc / hiệu ứng phải tổng hợp vì thư viện thiếu
}

interface Clip {
  n: number;
  start: number;
  dur: number;
}
interface MusicSeg {
  asset: string;
  start: number;
  end: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
}
interface SfxEv {
  asset: string;
  start: number;
  end: number | null; // null = hết tệp
  volume: number;
  loop: boolean;
  untilChapter: boolean;
  chapter: number;
}

const WINDOW_SEC = 180;
const GRID = 0.02; // bước lưới tự động hoá gain (giây)
const LEAD_IN = 0.4;
const TAIL = 2;

export function buildTimeline(items: ScriptItem[], durations: Map<number, number>, opt: MixOptions) {
  const clips: Clip[] = [];
  const music: MusicSeg[] = [];
  const sfx: SfxEv[] = [];
  const chapters: { title: string; start: number }[] = [];
  const levelEvents: { t: number; db: number; over: number }[] = [];
  let t = LEAD_IN;
  let cur: Omit<MusicSeg, "end" | "fadeOut"> | null = null;
  let level = 0;
  let chapter = 0;
  const close = (at: number, fadeOut: number) => {
    if (cur) music.push({ ...cur, end: Math.max(cur.start + 0.1, at), fadeOut });
    cur = null;
  };
  for (const it of items) {
    switch (it.type) {
      case "speech": {
        const dur = (durations.get(it.n) ?? 0) / 1000;
        clips.push({ n: it.n, start: t, dur });
        t += dur + it.pauseAfter * opt.pauseScale;
        break;
      }
      case "pause":
        t += it.seconds * opt.pauseScale;
        break;
      case "chapter":
        chapter = it.index;
        chapters.push({ title: it.title, start: t });
        break;
      case "music":
        if (it.action === "gain") {
          level += it.db ?? 0;
          levelEvents.push({ t, db: level, over: Math.max(0.05, it.fade ?? 1) });
        } else if (it.action === "stop") close(t + (it.fade ?? 3), it.fade ?? 3);
        else {
          close(t + (it.fade ?? 1.5), it.fade ?? 2);
          level = 0;
          levelEvents.push({ t, db: 0, over: 0.05 });
          cur = { asset: it.asset ?? "nen", start: t, volume: it.volume ?? opt.musicVolume, fadeIn: it.fade ?? 1.5 };
        }
        break;
      case "sfx":
        sfx.push({
          asset: it.asset,
          start: t,
          end: it.seconds !== null ? t + it.seconds : null,
          volume: it.volume ?? opt.sfxVolume,
          loop: it.loop,
          untilChapter: it.untilChapter || (it.loop && it.seconds === null),
          chapter,
        });
        break;
    }
  }
  const total = t + TAIL;
  close(total, 3);
  for (const s of sfx) {
    if (s.untilChapter) {
      const next = chapters.find((c, i) => i + 1 > s.chapter && c.start > s.start);
      s.end = next ? next.start : total;
    }
    if (s.end !== null) s.end = Math.min(s.end, total);
  }
  return { clips, music, sfx, chapters, levelEvents, total };
}

type Timeline = ReturnType<typeof buildTimeline>;

/** Hệ số ducking trên lưới GRID cho cả bài (1 = không giảm). */
function duckCurve(tl: Timeline, duckDb: number): Float32Array {
  const n = Math.ceil(tl.total / GRID) + 2;
  const active = new Uint8Array(n);
  for (const c of tl.clips) {
    const a = Math.max(0, Math.floor((c.start - 0.15) / GRID));
    const b = Math.min(n - 1, Math.ceil((c.start + c.dur + 0.05) / GRID));
    for (let k = a; k <= b; k++) active[k] = 1;
  }
  const low = Math.pow(10, duckDb / 20);
  const out = new Float32Array(n);
  const att = 1 - Math.exp(-GRID / 0.05);
  const rel = 1 - Math.exp(-GRID / 0.3);
  let y = 1;
  for (let k = 0; k < n; k++) {
    const target = active[k] ? low : 1;
    y += (target - y) * (target < y ? att : rel);
    out[k] = y;
  }
  return out;
}

function levelAt(tl: Timeline, t: number): number {
  let db = 0;
  let prevDb = 0;
  for (const e of tl.levelEvents) {
    if (e.t > t) break;
    const k = Math.min(1, (t - e.t) / e.over);
    db = prevDb + (e.db - prevDb) * k;
    prevDb = k >= 1 ? e.db : db;
  }
  return Math.pow(10, db / 20);
}

function rmsDb(buf: AudioBuffer): number {
  const x = buf.getChannelData(0);
  const gate = Math.pow(10, -50 / 20);
  let s = 0;
  let c = 0;
  for (let i = 0; i < x.length; i += 2) {
    const v = x[i]!;
    if (Math.abs(v) > gate) {
      s += v * v;
      c++;
    }
  }
  return c ? 10 * Math.log10(s / c) : -120;
}

export async function mixAll(input: MixInput, opt: MixOptions, onProgress: (stage: string, frac: number) => void, signal?: AbortSignal): Promise<MixResult> {
  if (typeof OfflineAudioContext === "undefined") throw new Error("Trình duyệt không hỗ trợ Web Audio (OfflineAudioContext)");
  const sr = opt.sampleRate;
  const nc = opt.channels;
  const tl = buildTimeline(input.items, input.durations, opt);
  if (!tl.clips.length) throw new Error("Kịch bản chưa có lời nào");
  const duck = duckCurve(tl, opt.duckDb);
  const decoder = new OfflineAudioContext(1, 1, sr);
  const warnings: string[] = [];
  const synthesized = new Set<string>();

  // Bộ nhớ đệm giải mã: lời (bỏ khi đã qua), nhạc / hiệu ứng (giữ cả bài).
  const clipBufs = new Map<number, { buf: AudioBuffer; gain: number }>();
  const libBufs = new Map<string, AudioBuffer>();
  const getClip = async (n: number) => {
    let c = clipBufs.get(n);
    if (!c) {
      const buf = await decoder.decodeAudioData(await input.fetchSegment(n));
      const g = Math.pow(10, (opt.speechRmsDb - rmsDb(buf)) / 20);
      c = { buf, gain: Math.min(4, Math.max(0.25, g)) };
      clipBufs.set(n, c);
    }
    return c;
  };
  const getLib = async (kind: "music" | "sfx", name: string) => {
    const key = `${kind}:${name}`;
    let b = libBufs.get(key);
    if (b) return b;
    let raw: ArrayBuffer | null = null;
    try {
      raw = await input.fetchLibrary(kind, name);
    } catch {
      raw = null;
    }
    if (raw) {
      try {
        b = await decoder.decodeAudioData(raw);
      } catch {
        warnings.push(`Không giải mã được tệp ${kind === "music" ? "nhạc" : "hiệu ứng"} "${name}" — dùng âm tổng hợp`);
      }
    }
    if (!b) {
      synthesized.add(`${kind === "music" ? "nhạc" : "hiệu ứng"} "${name}"`);
      const data = kind === "music" ? synthMusic(name, sr) : synthSfx(name, sr).data;
      b = decoder.createBuffer(1, data.length, sr);
      b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
    }
    libBufs.set(key, b);
    return b;
  };
  // Nạp trước nhạc / hiệu ứng để biết độ dài hiệu ứng không lặp.
  for (const m of tl.music) await getLib("music", m.asset);
  for (const s of tl.sfx) {
    const b = await getLib("sfx", s.asset);
    if (s.end === null) s.end = Math.min(tl.total, s.start + b.duration);
  }

  const renderWindow = async (w0: number, w1: number): Promise<Float32Array[]> => {
    const len = Math.max(1, Math.round((w1 - w0) * sr));
    const ctx = new OfflineAudioContext(nc, len, sr);
    for (const c of tl.clips) {
      if (c.start + c.dur <= w0 || c.start >= w1) continue;
      const { buf, gain } = await getClip(c.n);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(g).connect(ctx.destination);
      src.start(Math.max(0, c.start - w0), Math.max(0, w0 - c.start));
    }
    for (const m of tl.music) {
      if (m.end <= w0 || m.start >= w1) continue;
      const buf = await getLib("music", m.asset);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = ctx.createGain();
      const a = Math.max(w0, m.start);
      const b = Math.min(w1, m.end);
      const val = (t: number) => {
        const fin = Math.min(1, (t - m.start) / Math.max(0.01, m.fadeIn));
        const fout = Math.min(1, (m.end - t) / Math.max(0.01, m.fadeOut));
        const k = Math.min(duck.length - 1, Math.max(0, Math.round(t / GRID)));
        return Math.max(0, m.volume * Math.max(0, Math.min(fin, fout)) * duck[k]! * levelAt(tl, t));
      };
      g.gain.setValueAtTime(val(a), a - w0);
      for (let t = Math.ceil(a / GRID) * GRID; t < b; t += GRID) g.gain.linearRampToValueAtTime(val(t), t - w0);
      src.connect(g).connect(ctx.destination);
      src.start(a - w0, (a - m.start) % buf.duration);
      if (m.end < w1) src.stop(m.end - w0);
    }
    for (const s of tl.sfx) {
      const end = s.end ?? s.start;
      if (end <= w0 || s.start >= w1) continue;
      const buf = await getLib("sfx", s.asset);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = s.loop;
      const g = ctx.createGain();
      const a = Math.max(w0, s.start);
      const fadeAt = Math.max(s.start, end - 0.4);
      g.gain.setValueAtTime(s.volume, a - w0);
      if (s.loop && fadeAt < w1) {
        g.gain.setValueAtTime(s.volume, Math.max(a, fadeAt) - w0);
        g.gain.linearRampToValueAtTime(0.0001, Math.min(end, w1) - w0);
      }
      src.connect(g).connect(ctx.destination);
      const offset = a - s.start;
      if (!s.loop && offset >= buf.duration) continue;
      src.start(a - w0, s.loop ? offset % buf.duration : offset);
      if (end < w1) src.stop(end - w0);
    }
    const rendered = await ctx.startRendering();
    // giải phóng lời đã qua
    for (const c of tl.clips) if (c.start + c.dur < w0) clipBufs.delete(c.n);
    return Array.from({ length: nc }, (_, i) => rendered.getChannelData(i));
  };

  const windows: [number, number][] = [];
  for (let w = 0; w < tl.total; w += WINDOW_SEC) windows.push([w, Math.min(tl.total, w + WINDOW_SEC)]);
  const check = () => {
    if (signal?.aborted) throw new DOMException("Đã dừng", "AbortError");
  };

  // Lượt 1: đo độ to.
  const meter = new LoudnessMeter(sr, nc);
  for (let i = 0; i < windows.length; i++) {
    check();
    onProgress("Lượt 1/2: dựng & đo độ to", i / windows.length);
    const [w0, w1] = windows[i]!;
    meter.push(await renderWindow(w0, w1));
  }
  const measured = meter.integrated();
  if (!Number.isFinite(measured)) throw new Error("Bản ghép im lặng — kiểm lại các lời");
  const gainDb = Math.max(-20, Math.min(20, opt.targetLufs - measured));
  const gain = Math.pow(10, gainDb / 20);

  // Lượt 2: bù độ to + giới hạn đỉnh → PCM 16-bit.
  const limiter = new Limiter(sr, opt.ceilingDb);
  const lookSec = (limiter.L + 1) / sr;
  const meter2 = new LoudnessMeter(sr, nc);
  const chunks: Int16Array[] = [];
  let peak = 0;
  const silThr = Math.pow(10, -50 / 20);
  let silRun = 0;
  let pos = 0;
  for (let i = 0; i < windows.length; i++) {
    check();
    onProgress("Lượt 2/2: chuẩn hoá & xuất WAV", i / windows.length);
    const [w0, w1] = windows[i]!;
    const n = Math.round((w1 - w0) * sr);
    const raw = await renderWindow(w0, Math.min(tl.total, w1 + lookSec));
    for (const ch of raw) for (let k = 0; k < ch.length; k++) ch[k]! *= gain;
    const out = Array.from({ length: nc }, () => new Float32Array(n));
    limiter.process(raw, n, out);
    meter2.push(out);
    for (let k = 0; k < n; k++) {
      let p = 0;
      for (const ch of out) p = Math.max(p, Math.abs(ch[k]!));
      if (p > peak) peak = p;
      if (p < silThr) silRun++;
      else {
        if (silRun > 2.5 * sr && pos + k - silRun > LEAD_IN * sr) {
          const at = (pos + k - silRun) / sr;
          warnings.push(`Lặng ${(silRun / sr).toFixed(1)} s tại ${fmt(at)} — kiểm có cố ý không`);
        }
        silRun = 0;
      }
    }
    pos += n;
    chunks.push(toInt16(out));
  }
  onProgress("Xong", 1);
  const finalLufs = meter2.integrated();
  const peakDb = peak > 0 ? 20 * Math.log10(peak) : -120;
  if (Math.abs(finalLufs - opt.targetLufs) > 2) warnings.push(`Độ to cuối ${finalLufs.toFixed(1)} LUFS lệch đích ${opt.targetLufs} > 2 LU (nhạc / hiệu ứng quá to?)`);
  if (peakDb > opt.ceilingDb + 0.1) warnings.push(`Đỉnh ${peakDb.toFixed(1)} dBFS vượt trần ${opt.ceilingDb}`);
  return {
    blob: wavBlob(chunks, sr, nc),
    durationSec: pos / sr,
    measuredLufs: measured,
    finalLufs,
    peakDb,
    gainDb,
    chapters: tl.chapters,
    warnings,
    synthesized: [...synthesized],
  };
}

export function fmt(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (x: number) => String(x).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** Ước dung lượng WAV (byte). */
export const wavSize = (sec: number, sr: number, nc: number) => 44 + Math.round(sec * sr) * nc * 2;
