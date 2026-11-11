import { UNLOCK_TTL_MS, type LockPoint, type Track } from "@shared/types";
import { local as session } from "./storage"; // mở khoá lưu localStorage: còn hiệu lực khi đóng tab, hết hạn theo unlockTtlHours

type TrackLen = Pick<Track, "episodeCount" | "durationSeconds">;

export interface Episode {
  n: number; // 1-based
  start: number;
  end: number;
}

export function effectiveDuration(track: Pick<Track, "durationSeconds">, mediaDuration?: number): number {
  if (mediaDuration && Number.isFinite(mediaDuration) && mediaDuration > 0) return mediaDuration;
  return track.durationSeconds > 0 ? track.durationSeconds : 0;
}

export function episodeCountOf(track: Pick<Track, "episodeCount">): number {
  return Math.max(1, Math.floor(track.episodeCount || 1));
}

/** Tập (1-based) tại vị trí t: floor(t / (dur/n)) + 1, kẹp trong [1, n]. */
export function episodeAt(track: TrackLen, t: number, mediaDuration?: number): number {
  const n = episodeCountOf(track);
  const dur = effectiveDuration(track, mediaDuration);
  if (n <= 1 || dur <= 0) return 1;
  const seg = dur / n;
  return Math.min(n, Math.max(1, Math.floor(Math.max(0, t) / seg) + 1));
}

export function episodeList(track: TrackLen, mediaDuration?: number): Episode[] {
  const n = episodeCountOf(track);
  const dur = effectiveDuration(track, mediaDuration);
  if (dur <= 0) return [{ n: 1, start: 0, end: 0 }];
  const seg = dur / n;
  return Array.from({ length: n }, (_, i) => ({ n: i + 1, start: i * seg, end: i === n - 1 ? dur : (i + 1) * seg }));
}

export function episodeBounds(track: TrackLen, ep: number, mediaDuration?: number): Episode {
  const list = episodeList(track, mediaDuration);
  return list[Math.min(list.length, Math.max(1, ep)) - 1];
}

/* ===== Khoá theo chốt ===== */
const unlockKey = (id: string) => `kd_unlock:${id}`;

/** Giây bắt đầu khoá của một chốt trên bài này: atSecond (nếu có) ưu tiên hơn fromEp. Infinity = không áp dụng. */
export function checkpointStart(track: TrackLen, cp: LockPoint, mediaDuration?: number): number {
  if (cp.atSecond != null && Number.isFinite(cp.atSecond) && cp.atSecond >= 0) return cp.atSecond;
  const ep = Math.max(1, Math.floor(cp.fromEp || 1));
  if (ep === 1) return 0;
  const n = episodeCountOf(track);
  const dur = effectiveDuration(track, mediaDuration);
  if (ep > n || dur <= 0) return Infinity;
  return (dur / n) * (ep - 1);
}

/** Chốt áp dụng tại giây t = chốt có điểm bắt đầu lớn nhất mà ≤ t (bằng nhau thì chốt sau thắng). */
export function checkpointAt(track: TrackLen, checkpoints: LockPoint[] | undefined, t: number, mediaDuration?: number): LockPoint | null {
  if (!checkpoints?.length) return null;
  let found: LockPoint | null = null;
  let foundAt = -Infinity;
  for (const cp of checkpoints) {
    const s = checkpointStart(track, cp, mediaDuration);
    if (s <= t + 0.05 && s >= foundAt) {
      found = cp;
      foundAt = s;
    }
  }
  return found;
}

/** Thời hạn mở khoá (ms) từ cấu hình gate.unlockTtlHours; thiếu / sai → 6 giờ. */
function ttlMs(ttlHours?: number | null): number {
  return ttlHours != null && Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours * 3_600_000 : UNLOCK_TTL_MS;
}

export function isUnlocked(cp: Pick<LockPoint, "id">, ttlHours?: number | null): boolean {
  const ts = Number(session.get(unlockKey(cp.id)));
  return Number.isFinite(ts) && ts > 0 && Date.now() - ts < ttlMs(ttlHours);
}

/** Chốt áp dụng theo tập (bỏ qua atSecond) = chốt cuối có fromEp ≤ tập (danh sách đã xếp tăng). */
export function checkpointFor(checkpoints: LockPoint[] | undefined, ep: number): LockPoint | null {
  if (!checkpoints?.length) return null;
  let found: LockPoint | null = null;
  for (const cp of checkpoints) {
    if (cp.fromEp <= ep) found = cp;
    else break;
  }
  return found;
}

/** Chốt đang khoá ở tập ep (theo fromEp), hoặc null. */
export function lockedCheckpoint(checkpoints: LockPoint[] | undefined, ep: number, ttlHours?: number | null): LockPoint | null {
  const cp = checkpointFor(checkpoints, ep);
  return cp && !isUnlocked(cp, ttlHours) ? cp : null;
}

export function markUnlocked(cp: Pick<LockPoint, "id">) {
  session.set(unlockKey(cp.id), String(Date.now()));
}

/** Chốt đang khoá (chưa mở) tại giây t, hoặc null. */
export function lockedAt(
  track: TrackLen,
  checkpoints: LockPoint[] | undefined,
  t: number,
  mediaDuration?: number,
  ttlHours?: number | null,
): LockPoint | null {
  const cp = checkpointAt(track, checkpoints, t, mediaDuration);
  return cp && !isUnlocked(cp, ttlHours) ? cp : null;
}

/** Tập ep có đoạn nào đang bị khoá không (để hiện biểu tượng khoá). */
export function episodeLocked(
  track: TrackLen,
  checkpoints: LockPoint[] | undefined,
  ep: number,
  mediaDuration?: number,
  ttlHours?: number | null,
): boolean {
  if (!checkpoints?.length) return false;
  const b = episodeBounds(track, ep, mediaDuration);
  if (lockedAt(track, checkpoints, b.start, mediaDuration, ttlHours)) return true;
  for (const cp of checkpoints) {
    const s = checkpointStart(track, cp, mediaDuration);
    if (s > b.start && s < b.end && lockedAt(track, checkpoints, s, mediaDuration, ttlHours)) return true;
  }
  return false;
}

/** Các mốc khoá (chưa mở) nằm trong khoảng (from, to) — để vẽ vạch nhỏ trên thanh tiến độ. */
export function lockMarks(
  track: TrackLen,
  checkpoints: LockPoint[] | undefined,
  from: number,
  to: number,
  mediaDuration?: number,
  ttlHours?: number | null,
): number[] {
  if (!checkpoints?.length) return [];
  const out: number[] = [];
  for (const cp of checkpoints) {
    const s = checkpointStart(track, cp, mediaDuration);
    if (s > from + 0.5 && s < to - 0.5 && lockedAt(track, checkpoints, s, mediaDuration, ttlHours) === cp) out.push(s);
  }
  return out;
}
