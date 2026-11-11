// Nhạc nền / hiệu ứng tổng hợp tại chỗ — dùng khi thư viện chưa có tệp trùng tên (thử nhịp, ducking; không phải nhạc thật).

const fold = (s: string) => s.toLowerCase().replace(/đ/g, "d").normalize("NFD").replace(/[̀-ͯ]/g, "");

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296) * 2 - 1;
  };
}

function seedOf(name: string) {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return h >>> 0;
}

const MIDI = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** Nhạc nền lặp liền 16 giây theo tâm trạng (pad hợp âm + nốt "piano" rải). */
export function synthMusic(name: string, sr: number): Float32Array {
  const f = fold(name);
  const dur = 16;
  const n = dur * sr;
  const x = new Float32Array(n);
  let chords: number[][];
  if (/kinh|ma|so|hoi hop|cang|toi|dem|u am|bi an/.test(f)) chords = [[45, 52, 56], [44, 51, 55]]; // nghịch, trầm
  else if (/vui|tuoi|hanh phuc|nhe|am ap/.test(f)) chords = [[48, 55, 64], [53, 57, 65], [55, 59, 67], [48, 55, 64]]; // trưởng
  else chords = [[45, 52, 60], [41, 48, 57], [48, 55, 64], [43, 50, 59]]; // buồn / mặc định: thứ
  const per = dur / chords.length;
  // Tần số làm tròn theo bội 1/dur để vòng lặp liền mạch.
  const q = (fq: number) => Math.round(fq * dur) / dur;
  for (let ci = 0; ci < chords.length; ci++) {
    const t0 = ci * per;
    for (const note of chords[ci]!) {
      const fq = q(MIDI(note));
      for (let i = Math.floor(t0 * sr); i < Math.floor((t0 + per) * sr); i++) {
        const t = i / sr - t0;
        const env = Math.min(1, t / 1.2, (per - t) / 1.2);
        x[i]! += Math.sin(2 * Math.PI * fq * (i / sr)) * 0.06 * env + Math.sin(2 * Math.PI * fq * 2 * (i / sr)) * 0.015 * env;
      }
    }
    // nốt rải
    const arp = chords[ci]!.map((m) => m + 12);
    for (let k = 0; k < 4; k++) {
      const start = Math.floor((t0 + k * (per / 4)) * sr);
      const fq = MIDI(arp[k % arp.length]!);
      for (let j = 0; j < sr * 2.5; j++) {
        const idx = (start + j) % n; // phần đuôi vòng về đầu → liền mạch
        const t = j / sr;
        x[idx]! += Math.sin(2 * Math.PI * fq * t) * 0.08 * Math.exp(-t * 2.2) * Math.min(1, t / 0.005);
      }
    }
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(x[i]!));
  if (peak > 0) for (let i = 0; i < n; i++) x[i]! *= 0.5 / peak;
  return x;
}

/** Hiệu ứng tổng hợp; loop = có thể lặp (mưa, gió). */
export function synthSfx(name: string, sr: number): { data: Float32Array; loopable: boolean } {
  const f = fold(name);
  const r = rng(seedOf(f));
  const make = (sec: number) => new Float32Array(Math.round(sec * sr));
  const norm = (x: Float32Array, to = 0.6) => {
    let p = 0;
    for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]!));
    if (p > 0) for (let i = 0; i < x.length; i++) x[i]! *= to / p;
    return x;
  };
  const thud = (x: Float32Array, at: number, fq: number, len: number, amp: number) => {
    const s = Math.floor(at * sr);
    for (let j = 0; j < len * sr && s + j < x.length; j++) {
      const t = j / sr;
      x[s + j]! += (Math.sin(2 * Math.PI * fq * t * (1 - t)) * 0.8 + r() * 0.3 * Math.exp(-t * 60)) * amp * Math.exp(-t * 18);
    }
  };

  if (/mua/.test(f)) {
    const x = make(8);
    let lp = 0;
    for (let i = 0; i < x.length; i++) {
      lp += (r() - lp) * 0.25;
      x[i] = lp * 0.5;
    }
    for (let k = 0; k < 160; k++) {
      const s = Math.floor(((r() + 1) / 2) * (x.length - sr * 0.02));
      for (let j = 0; j < sr * 0.015; j++) x[s + j]! += r() * 0.4 * Math.exp(-j / (sr * 0.003));
    }
    return { data: norm(crossfadeLoop(x, sr), 0.5), loopable: true };
  }
  if (/gio|bao/.test(f)) {
    const x = make(8);
    let lp = 0;
    let bp = 0;
    for (let i = 0; i < x.length; i++) {
      lp += (r() - lp) * 0.05;
      bp += (lp - bp) * 0.3;
      x[i] = (lp - bp) * (0.6 + 0.4 * Math.sin((2 * Math.PI * i) / x.length + 1));
    }
    return { data: norm(crossfadeLoop(x, sr), 0.5), loopable: true };
  }
  if (/sam|set/.test(f)) {
    const x = make(4);
    let lp = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      lp += (r() - lp) * 0.02;
      x[i] = lp * (t < 0.05 ? t / 0.05 : Math.exp(-(t - 0.05) * 1.3)) * (1 + 0.5 * Math.sin(t * 9));
    }
    return { data: norm(x, 0.8), loopable: false };
  }
  if (/go cua|go-cua|go/.test(f)) {
    const x = make(1.4);
    for (const at of [0, 0.32, 0.62]) thud(x, at, 140, 0.25, 1);
    return { data: norm(x, 0.7), loopable: false };
  }
  if (/cua/.test(f)) {
    const x = make(1.6);
    let ph = 0;
    for (let i = 0; i < sr * 1.1; i++) {
      const t = i / sr;
      ph += (2 * Math.PI * (90 + 60 * Math.sin(t * 5))) / sr;
      x[i] = (((ph / Math.PI) % 2) - 1) * 0.15 * Math.min(1, t / 0.1, (1.1 - t) / 0.1) * (0.6 + 0.4 * r());
    }
    thud(x, 1.15, 70, 0.4, 1);
    return { data: norm(x, 0.6), loopable: false };
  }
  if (/buoc|chan/.test(f)) {
    const x = make(2.4);
    for (let k = 0; k < 4; k++) thud(x, k * 0.55, 90, 0.2, 0.8);
    return { data: norm(x, 0.6), loopable: false };
  }
  if (/chuong|bell/.test(f)) {
    const x = make(3);
    for (const [m, a] of [[1, 1], [2.76, 0.5], [5.4, 0.25], [8.93, 0.12]] as const) {
      for (let i = 0; i < x.length; i++) {
        const t = i / sr;
        x[i]! += Math.sin(2 * Math.PI * 660 * m * t) * a * Math.exp(-t * (1.2 + m * 0.4));
      }
    }
    return { data: norm(x, 0.5), loopable: false };
  }
  // mặc định: tiếng "vút"
  const x = make(1.2);
  let lp = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / x.length;
    lp += (r() - lp) * (0.02 + 0.3 * t);
    x[i] = lp * Math.sin(Math.PI * t) ** 2;
  }
  return { data: norm(x, 0.5), loopable: false };
}

/** Làm hai đầu khớp nhau để lặp không nghe "cụp". */
function crossfadeLoop(x: Float32Array, sr: number) {
  const n = Math.min(Math.floor(sr * 0.5), Math.floor(x.length / 4));
  for (let i = 0; i < n; i++) {
    const a = i / n;
    const tailIdx = x.length - n + i;
    x[i] = x[i]! * a + x[tailIdx]! * (1 - a);
  }
  return x.subarray(0, x.length - n);
}
