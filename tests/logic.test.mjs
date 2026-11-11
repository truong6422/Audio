// Logic thuần phía người nghe theo docs/spec-nguoi-nghe.md §4.4 và §5.1:
//  - tập ảo: ep = clamp(floor(t / (dur/n)) + 1, 1, n); n ≤ 1 hoặc dur ≤ 0 → 1
//  - chốt khoá: chốt cuối cùng (danh sách xếp tăng) có fromEp ≤ ep; không có → không khoá
//  - mở khoá có hạn 6 giờ: còn hiệu lực khi now - ts < 6h
// Mỗi ca chạy trên BẢN THAM CHIẾU dưới đây và trên mã thật web/src/lib/episodes.ts
// (nạp trong tiến trình con với --experimental-strip-types vì Node 22.11 chưa chạy .ts mặc định).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SIX_HOURS = 6 * 60 * 60 * 1000;

// ---------- Bản tham chiếu ----------
export function refEpisodeAt(track, t, mediaDuration) {
  const n = Math.max(1, Math.floor(track.episodeCount || 1));
  const dur = mediaDuration > 0 && Number.isFinite(mediaDuration) ? mediaDuration : track.durationSeconds > 0 ? track.durationSeconds : 0;
  if (n <= 1 || dur <= 0) return 1;
  return Math.min(n, Math.max(1, Math.floor(t / (dur / n)) + 1));
}
export function refCheckpointFor(cps, ep) {
  let found = null;
  for (const cp of cps ?? []) if (cp.fromEp <= ep) found = cp;
  return found;
}
export const refIsUnlocked = (ts, now, ttl = SIX_HOURS) => Number.isFinite(ts) && ts > 0 && now - ts < ttl;

// ---------- Ca kiểm ----------
const T = (durationSeconds, episodeCount) => ({ durationSeconds, episodeCount });
// [track, t, mediaDuration|null, kỳ vọng]
const EP_CASES = [
  [T(300, 3), 0, null, 1],
  [T(300, 3), 99.999, null, 1],
  [T(300, 3), 100, null, 2], // đúng biên → tập sau
  [T(300, 3), 199, null, 2],
  [T(300, 3), 200, null, 3],
  [T(300, 3), 300, null, 3], // t = dur → kẹp n
  [T(300, 3), 9999, null, 3], // vượt → kẹp n
  [T(300, 3), -5, null, 1], // âm → kẹp 1
  [T(300, 1), 250, null, 1], // không chia tập
  [T(0, 5), 100, null, 1], // chưa biết thời lượng
  [T(0, 5), 100, 500, 2], // dùng thời lượng media khi có
  [T(300, 3), 150, 600, 1], // thời lượng media ưu tiên hơn durationSeconds
  [T(300, 3), 150, 0, 2], // media 0 → dùng durationSeconds
  [T(3600, 10), 3599, null, 10],
  [T(3600, 10), 360, null, 2],
  [T(10, 3), 10 / 3, null, 2],
  [T(10, 3), 6.67, null, 3],
];

const CP = (id, fromEp) => ({ id, fromEp, name: id, title: "", link: "https://example.com", imageUrl: "", button: "", description: "" });
const CPS = [CP("a", 2), CP("b", 5), CP("c", 9)];
// [checkpoints, ep, kỳ vọng id]
const CP_CASES = [
  [CPS, 1, null],
  [CPS, 2, "a"],
  [CPS, 4, "a"],
  [CPS, 5, "b"],
  [CPS, 8, "b"],
  [CPS, 9, "c"],
  [CPS, 100, "c"],
  [[CP("x", 1)], 1, "x"], // fromEp = 1 → khoá ngay từ đầu
  [[], 3, null],
  [[CP("p", 3), CP("q", 3)], 3, "q"], // cùng fromEp → chốt cuối
];

// [tuổi mở khoá ms, kỳ vọng còn hiệu lực]
const UNLOCK_CASES = [
  [0, true],
  [60 * 1000, true],
  [SIX_HOURS - 1, true],
  [SIX_HOURS, false],
  [SIX_HOURS + 1, false],
  [24 * SIX_HOURS, false],
];

// [checkpoints, ep, id đã mở, kỳ vọng chốt còn khoá]
const LOCKED_CASES = [
  [CPS, 3, [], "a"],
  [CPS, 3, ["a"], null],
  [CPS, 6, ["a"], "b"], // mỗi chốt mở độc lập
  [CPS, 6, ["b"], null],
  [CPS, 1, [], null],
];

describe("bản tham chiếu theo đặc tả", () => {
  test("tập ảo floor(t/(dur/n))+1, kẹp [1,n]", () => {
    for (const [tr, t, md, want] of EP_CASES) assert.equal(refEpisodeAt(tr, t, md ?? undefined), want, JSON.stringify({ tr, t, md }));
  });
  test("chốt = chốt cuối có fromEp ≤ tập", () => {
    for (const [cps, ep, want] of CP_CASES) assert.equal(refCheckpointFor(cps, ep)?.id ?? null, want, `ep=${ep}`);
  });
  test("mở khoá hết hạn sau đúng 6 giờ", () => {
    const now = 1_800_000_000_000;
    for (const [age, want] of UNLOCK_CASES) assert.equal(refIsUnlocked(now - age, now), want, `age=${age}`);
    assert.equal(refIsUnlocked(NaN, now), false);
    assert.equal(refIsUnlocked(0, now), false);
  });
});

describe("web/src/lib/episodes.ts khớp đặc tả", () => {
  let res;
  const run = () => {
    if (res) return res;
    const cases = {
      episodeAt: EP_CASES.map(([tr, t, md]) => [tr, t, md]),
      checkpointFor: CP_CASES.map(([cps, ep]) => [cps, ep]),
      unlock: UNLOCK_CASES.map(([age]) => [age]),
      lockedCheckpoint: LOCKED_CASES.map(([cps, ep, ids]) => [cps, ep, ids]),
    };
    // Thêm ca ngẫu nhiên để đối chiếu với bản tham chiếu.
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 300; i++) {
      const dur = Math.floor(rnd() * 7200);
      const n = 1 + Math.floor(rnd() * 40);
      cases.episodeAt.push([T(dur, n), rnd() * dur * 1.1 - 5, null]);
    }
    const p = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "--no-warnings", join(HERE, "helpers", "episodes-child.mjs")],
      { env: { ...process.env, CASES: JSON.stringify(cases) }, encoding: "utf8", timeout: 60_000 },
    );
    assert.equal(p.status, 0, `Không nạp được episodes.ts:\n${p.stderr}`);
    res = { cases, out: JSON.parse(p.stdout) };
    return res;
  };

  test("UNLOCK_TTL_MS = 6 giờ (shared/types.ts)", () => {
    assert.equal(run().out.UNLOCK_TTL_MS, SIX_HOURS);
  });

  test("episodeAt khớp kỳ vọng và bản tham chiếu (cả 300 ca ngẫu nhiên)", () => {
    const { cases, out } = run();
    EP_CASES.forEach(([tr, t, md, want], i) => assert.equal(out.episodeAt[i], want, JSON.stringify({ tr, t, md })));
    cases.episodeAt.forEach(([tr, t, md], i) => assert.equal(out.episodeAt[i], refEpisodeAt(tr, t, md ?? undefined), JSON.stringify({ tr, t, md })));
  });

  test("checkpointFor chọn chốt cuối có fromEp ≤ tập", () => {
    const { out } = run();
    CP_CASES.forEach(([, ep, want], i) => assert.equal(out.checkpointFor[i], want, `ep=${ep}`));
  });

  test("isUnlocked hết hạn sau 6 giờ", () => {
    const { out } = run();
    UNLOCK_CASES.forEach(([age, want], i) => assert.equal(out.unlock[i], want, `age=${age}`));
  });

  test("lockedCheckpoint: mỗi chốt mở khoá độc lập", () => {
    const { out } = run();
    LOCKED_CASES.forEach(([, ep, ids, want], i) => assert.equal(out.lockedCheckpoint[i], want, `ep=${ep} mở=${ids}`));
  });
});
