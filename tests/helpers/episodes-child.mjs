// Tiến trình con: nạp web/src/lib/episodes.ts thật (Node --experimental-strip-types + ts-hooks),
// chạy các ca nhận qua biến môi trường CASES (JSON), in kết quả JSON ra stdout.
import { register } from "node:module";

register("./ts-hooks.mjs", import.meta.url);

// sessionStorage / localStorage giả (Node không có) + đồng hồ điều khiển được.
const store = new Map();
globalThis.sessionStorage = globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
let now = 1_800_000_000_000;
Date.now = () => now;

const ep = await import("../../web/src/lib/episodes.ts");
const types = await import("../../shared/types.ts");
const cases = JSON.parse(process.env.CASES);

const out = {
  UNLOCK_TTL_MS: types.UNLOCK_TTL_MS,
  episodeAt: cases.episodeAt.map(([track, t, md]) => ep.episodeAt(track, t, md ?? undefined)),
  checkpointFor: cases.checkpointFor.map(([cps, e]) => ep.checkpointFor(cps, e)?.id ?? null),
  unlock: cases.unlock.map(([ageMs]) => {
    store.clear();
    const cp = { id: "cpX", fromEp: 1 };
    now = 1_800_000_000_000;
    ep.markUnlocked(cp);
    now += ageMs;
    return ep.isUnlocked(cp);
  }),
  lockedCheckpoint: cases.lockedCheckpoint.map(([cps, e, unlockedIds]) => {
    store.clear();
    now = 1_800_000_000_000;
    for (const id of unlockedIds) ep.markUnlocked({ id });
    return ep.lockedCheckpoint(cps, e)?.id ?? null;
  }),
};
process.stdout.write(JSON.stringify(out));
