// WAV PCM 16-bit: bọc PCM thô (Gemini / ElevenLabs trả PCM) và đọc thời lượng.

export function wavFromPcm16(pcm: Uint8Array, sampleRate: number, channels = 1): Uint8Array {
  const out = new Uint8Array(44 + pcm.byteLength);
  const v = new DataView(out.buffer);
  const w = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + pcm.byteLength, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, pcm.byteLength, true);
  out.set(pcm, 44);
  return out;
}

export function wavFromFloat(samples: Float32Array, sampleRate: number): Uint8Array {
  const pcm = new Uint8Array(samples.length * 2);
  const v = new DataView(pcm.buffer);
  for (let i = 0; i < samples.length; i++) {
    const x = Math.max(-1, Math.min(1, samples[i]!));
    v.setInt16(i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return wavFromPcm16(pcm, sampleRate, 1);
}

/** Thời lượng (ms) của WAV, đọc khối fmt/data. Không phải WAV → 0. */
export function wavDurationMs(buf: Uint8Array): number {
  if (buf.byteLength < 44) return 0;
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tag = (o: number) => String.fromCharCode(buf[o]!, buf[o + 1]!, buf[o + 2]!, buf[o + 3]!);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return 0;
  let off = 12;
  let byteRate = 0;
  while (off + 8 <= buf.byteLength) {
    const id = tag(off);
    const size = v.getUint32(off + 4, true);
    if (id === "fmt ") byteRate = v.getUint32(off + 16, true);
    if (id === "data") {
      const len = Math.min(size, buf.byteLength - off - 8);
      return byteRate ? Math.round((len / byteRate) * 1000) : 0;
    }
    off += 8 + size + (size & 1);
  }
  return 0;
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

interface PcmView {
  sampleRate: number;
  channels: number;
  dataOffset: number;
  dataLength: number;
}

function pcmView(buf: Uint8Array): PcmView | null {
  if (buf.byteLength < 44) return null;
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tag = (o: number) => String.fromCharCode(buf[o]!, buf[o + 1]!, buf[o + 2]!, buf[o + 3]!);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let off = 12;
  let sampleRate = 0;
  let channels = 0;
  let bits = 0;
  let fmt = 0;
  while (off + 8 <= buf.byteLength) {
    const id = tag(off);
    const size = v.getUint32(off + 4, true);
    if (id === "fmt ") {
      fmt = v.getUint16(off + 8, true);
      channels = v.getUint16(off + 10, true);
      sampleRate = v.getUint32(off + 12, true);
      bits = v.getUint16(off + 22, true);
    }
    if (id === "data") {
      if (fmt !== 1 || bits !== 16 || !channels || !sampleRate) return null;
      return { sampleRate, channels, dataOffset: off + 8, dataLength: Math.min(size, buf.byteLength - off - 8) & ~1 };
    }
    off += 8 + size + (size & 1);
  }
  return null;
}

export interface WavStats {
  durationMs: number;
  rmsDb: number; // RMS cả clip, dBFS
  peak: number; // 0..1
  longestSilenceSec: number; // khoảng lặng dài nhất GIỮA clip (< −45 dBFS)
}

/**
 * Cắt lặng hai đầu (ngưỡng −45 dBFS, giữ lại 30 ms — DEM_MANH của make-YT) và đo QC.
 * WAV không phải PCM 16-bit thì trả nguyên, stats = null.
 */
export function trimAndAnalyze(buf: Uint8Array): { wav: Uint8Array; stats: WavStats | null } {
  const p = pcmView(buf);
  if (!p) return { wav: buf, stats: null };
  const frameBytes = 2 * p.channels;
  const frames = Math.floor(p.dataLength / frameBytes);
  const v = new DataView(buf.buffer, buf.byteOffset + p.dataOffset, frames * frameBytes);
  const amp = (f: number) => {
    let m = 0;
    for (let ch = 0; ch < p.channels; ch++) m = Math.max(m, Math.abs(v.getInt16(f * frameBytes + ch * 2, true)) / 32768);
    return m;
  };
  const thr = Math.pow(10, -45 / 20);
  let first = 0;
  while (first < frames && amp(first) < thr) first++;
  let last = frames - 1;
  while (last > first && amp(last) < thr) last--;
  if (first >= frames) {
    return { wav: buf, stats: { durationMs: Math.round((frames / p.sampleRate) * 1000), rmsDb: -120, peak: 0, longestSilenceSec: frames / p.sampleRate } };
  }
  const pad = Math.round(0.03 * p.sampleRate);
  const a = Math.max(0, first - pad);
  const b = Math.min(frames, last + 1 + pad);
  let sum = 0;
  let peak = 0;
  let run = 0;
  let longest = 0;
  const win = Math.max(1, Math.round(p.sampleRate * 0.01)); // khối 10 ms để đo lặng
  let winMax = 0;
  for (let f = a; f < b; f++) {
    const x = amp(f);
    sum += x * x;
    if (x > peak) peak = x;
    if (x > winMax) winMax = x;
    if ((f - a) % win === win - 1) {
      if (winMax < thr) run += win;
      else run = 0;
      if (run > longest) longest = run;
      winMax = 0;
    }
  }
  const n = b - a;
  const rms = Math.sqrt(sum / Math.max(1, n));
  const pcm = buf.slice(p.dataOffset + a * frameBytes, p.dataOffset + b * frameBytes);
  return {
    wav: wavFromPcm16(pcm, p.sampleRate, p.channels),
    stats: {
      durationMs: Math.round((n / p.sampleRate) * 1000),
      rmsDb: rms > 0 ? 20 * Math.log10(rms) : -120,
      peak,
      longestSilenceSec: longest / p.sampleRate,
    },
  };
}
