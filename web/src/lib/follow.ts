// "Theo dõi" truyện / thể loại — lưu ở máy (localStorage), chưa đồng bộ tài khoản.
import { useCallback, useEffect, useState } from "react";
import type { Track } from "@shared/types";
import { local } from "./storage";

const KEY = "kd_follow";
const EVT = "kd-follow";
const MAX_TRACKS = 60;

interface FollowStore {
  tracks: { track: Track; at: number }[];
  cats: string[];
}

const read = (): FollowStore => {
  const s = local.getJSON<Partial<FollowStore>>(KEY, {});
  return { tracks: Array.isArray(s.tracks) ? s.tracks.filter((x) => x?.track?.id) : [], cats: Array.isArray(s.cats) ? s.cats : [] };
};

function write(s: FollowStore) {
  local.setJSON(KEY, s);
  window.dispatchEvent(new Event(EVT));
}

export function toggleFollowTrack(track: Track): boolean {
  const s = read();
  const has = s.tracks.some((x) => x.track.id === track.id);
  s.tracks = has ? s.tracks.filter((x) => x.track.id !== track.id) : [{ track, at: Date.now() }, ...s.tracks].slice(0, MAX_TRACKS);
  write(s);
  return !has;
}

export function toggleFollowCategory(slug: string): boolean {
  const s = read();
  const has = s.cats.includes(slug);
  s.cats = has ? s.cats.filter((c) => c !== slug) : [slug, ...s.cats];
  write(s);
  return !has;
}

/** Cập nhật bản lưu của truyện đang theo dõi (tên / ảnh bìa đổi). */
export function refreshFollowedTrack(track: Track) {
  const s = read();
  const i = s.tracks.findIndex((x) => x.track.id === track.id);
  if (i < 0) return;
  const old = s.tracks[i].track;
  if (old.title === track.title && old.coverUrl === track.coverUrl && old.slug === track.slug && old.durationSeconds === track.durationSeconds) return;
  s.tracks[i] = { ...s.tracks[i], track };
  write(s);
}

export function useFollows() {
  const [store, setStore] = useState(read);
  useEffect(() => {
    const on = () => setStore(read());
    window.addEventListener(EVT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  const isTrack = useCallback((id: string) => store.tracks.some((x) => x.track.id === id), [store]);
  const isCat = useCallback((slug: string) => store.cats.includes(slug), [store]);
  return { tracks: store.tracks.map((x) => x.track), cats: store.cats, isTrack, isCat };
}
