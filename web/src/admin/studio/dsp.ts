// Xử lý âm thanh thuần TS: mã hoá WAV, đo độ to ITU-R BS.1770 (LUFS), bộ giới hạn đỉnh nhìn trước.

/* ---------------------------------------------------------------- WAV */

/** Ghép các khối PCM 16-bit (đã xen kênh) thành Blob WAV — không dồn thành một mảng lớn. */
export function wavBlob(chunks: Int16Array[], sampleRate: number, channels: number): Blob {
  const dataBytes = chunks.reduce((s, c) => s + c.byteLength, 0);
  if (dataBytes > 0xffffffff - 44) throw new Error("WAV vượt 4 GB — hãy xuất từng chương");
  const h = new DataView(new ArrayBuffer(44));
  const w = (o: number, s: string) => [...s].forEach((ch, i) => h.setUint8(o + i, ch.charCodeAt(0)));
  w(0, "RIFF");
  h.setUint32(4, 36 + dataBytes, true);
  w(8, "WAVE");
  w(12, "fmt ");
  h.setUint32(16, 16, true);
  h.setUint16(20, 1, true);
  h.setUint16(22, channels, true);
  h.setUint32(24, sampleRate, true);
  h.setUint32(28, sampleRate * channels * 2, true);
  h.setUint16(32, channels * 2, true);
  h.setUint16(34, 16, true);
  w(36, "data");
  h.setUint32(40, dataBytes, true);
  return new Blob([h.buffer, ...chunks.map((c) => c.buffer as ArrayBuffer)], { type: "audio/wav" });
}

/** Float32 từng kênh → Int16 xen kênh (có dither tam giác nhẹ). */
export function toInt16(channels: Float32Array[], from = 0, to = channels[0]!.length): Int16Array {
  const nc = channels.length;
  const out = new Int16Array((to - from) * nc);
  let k = 0;
  for (let i = from; i < to; i++) {
    for (let c = 0; c < nc; c++) {
      const x = channels[c]![i]! * 32767 + (Math.random() - Math.random()) * 0.5;
      out[k++] = x > 32767 ? 32767 : x < -32768 ? -32768 : Math.round(x);
    }
  }
  return out;
}

/* ---------------------------------------------------------------- LUFS (BS.1770-4) */

class Biquad {
  z1 = 0;
  z2 = 0;
  constructor(private b0: number, private b1: number, private b2: number, private a1: number, private a2: number) {}
  run(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

/** Hai tầng lọc K cho tần số mẫu bất kỳ (công thức của libebur128). */
function kFilters(fs: number): [Biquad, Biquad] {
  // Tầng 1: kệ cao (high shelf) ~ +4 dB trên 1,5 kHz
  let f0 = 1681.974450955533;
  const G = 3.999843853973347;
  let Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / fs);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const pre = new Biquad((Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0);
  // Tầng 2: lọc thông cao RLB ~ 38 Hz
  f0 = 38.13547087602444;
  Q = 0.5003270373238773;
  K = Math.tan((Math.PI * f0) / fs);
  a0 = 1 + K / Q + K * K;
  const rlb = new Biquad(1, -2, 1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0);
  return [pre, rlb];
}

/** Đo độ to tích hợp theo luồng (nạp từng cửa sổ liên tiếp). */
export class LoudnessMeter {
  private filters: [Biquad, Biquad][];
  private sub: number[] = []; // năng lượng từng khối con 100 ms (tổng các kênh)
  private acc = 0;
  private cnt = 0;
  private readonly subLen: number;
  constructor(private fs: number, channels: number) {
    this.filters = Array.from({ length: channels }, () => kFilters(fs));
    this.subLen = Math.round(fs * 0.1);
  }
  push(chans: Float32Array[], from = 0, to = chans[0]!.length) {
    const nc = chans.length;
    for (let i = from; i < to; i++) {
      let e = 0;
      for (let c = 0; c < nc; c++) {
        const [a, b] = this.filters[c]!;
        const y = b.run(a.run(chans[c]![i]!));
        e += y * y;
      }
      this.acc += e;
      if (++this.cnt === this.subLen) {
        this.sub.push(this.acc / this.subLen);
        this.acc = 0;
        this.cnt = 0;
      }
    }
  }
  /** LUFS tích hợp (cổng tuyệt đối −70, tương đối −10). -Infinity nếu im lặng. */
  integrated(): number {
    const blocks: number[] = [];
    for (let i = 0; i + 4 <= this.sub.length; i++) blocks.push((this.sub[i]! + this.sub[i + 1]! + this.sub[i + 2]! + this.sub[i + 3]!) / 4);
    const L = (z: number) => -0.691 + 10 * Math.log10(z);
    const abs = blocks.filter((z) => z > 0 && L(z) > -70);
    if (!abs.length) return -Infinity;
    const rel = L(abs.reduce((s, z) => s + z, 0) / abs.length) - 10;
    const gated = abs.filter((z) => L(z) > rel);
    return gated.length ? L(gated.reduce((s, z) => s + z, 0) / gated.length) : -Infinity;
  }
}

/* ---------------------------------------------------------------- Giới hạn đỉnh */

/**
 * Bộ giới hạn nhìn trước (lookahead 5 ms, nhả 80 ms) chạy theo cửa sổ liên tiếp.
 * Mỗi lần process nhận n mẫu cần ra + L mẫu nhìn trước (của cửa sổ kế); trả n mẫu đã giới hạn.
 */
export class Limiter {
  readonly L: number;
  private ceil: number;
  private rel: number;
  private hist: Float32Array; // L−1 giá trị gmin cuối của lần trước (cho trung bình trượt)
  private gs = 1;
  constructor(fs: number, ceilingDb = -1.5) {
    this.L = Math.max(2, Math.round(fs * 0.005));
    this.ceil = Math.pow(10, ceilingDb / 20);
    this.rel = 1 - Math.exp(-1 / (fs * 0.08));
    this.hist = new Float32Array(this.L - 1).fill(1);
  }
  /** chans: mỗi kênh dài ≥ n + L (thiếu thì coi là 0). Ghi kết quả vào out (mỗi kênh dài n). */
  process(chans: Float32Array[], n: number, out: Float32Array[]) {
    const L = this.L;
    const m = n + L;
    const req = new Float32Array(m);
    for (let i = 0; i < m; i++) {
      let p = 0;
      for (const ch of chans) {
        const v = i < ch.length ? Math.abs(ch[i]!) : 0;
        if (v > p) p = v;
      }
      req[i] = p > this.ceil ? this.ceil / p : 1;
    }
    // gmin[i] = min(req[i..i+L]) — hàng đợi đơn điệu O(n)
    const gmin = new Float32Array(n);
    const dq = new Int32Array(m + 1);
    let head = 0;
    let tail = 0;
    for (let j = 0; j < Math.min(m, L); j++) {
      while (tail > head && req[dq[tail - 1]!]! >= req[j]!) tail--;
      dq[tail++] = j;
    }
    for (let i = 0; i < n; i++) {
      const j = i + L;
      if (j < m) {
        while (tail > head && req[dq[tail - 1]!]! >= req[j]!) tail--;
        dq[tail++] = j;
      }
      while (dq[head]! < i) head++;
      gmin[i] = req[dq[head]!]!;
    }
    // trung bình trượt L mẫu (nối với lịch sử) → dốc vào mượt; rồi nhả theo hàm mũ
    let sum = 0;
    for (let k = 0; k < this.hist.length; k++) sum += this.hist[k]!;
    const at = (k: number) => (k < 0 ? this.hist[this.hist.length + k]! : gmin[k]!);
    for (let i = 0; i < n; i++) {
      sum += gmin[i]!;
      const g2 = sum / L;
      sum -= at(i - (L - 1));
      this.gs = g2 < this.gs ? g2 : this.gs + (g2 - this.gs) * this.rel;
      for (let c = 0; c < out.length; c++) out[c]![i] = (i < chans[c]!.length ? chans[c]![i]! : 0) * this.gs;
    }
    const keep = new Float32Array(this.hist.length);
    for (let k = 0; k < keep.length; k++) keep[k] = at(n - keep.length + k);
    this.hist = keep;
  }
}
