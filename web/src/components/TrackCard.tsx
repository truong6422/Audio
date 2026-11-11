import { Link } from "react-router-dom";
import type { Track } from "@shared/types";
import { fmtCount, fmtTime } from "../lib/format";
import { usePlayer } from "../player/PlayerContext";
import { Cover } from "./Cover";
import { IconHeadphones, IconPause, IconPlay } from "./Icons";

export function Eq({ on, className = "" }: { on: boolean; className?: string }) {
  return (
    <span className={`eq ${on ? "on" : ""} ${className}`} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

export function TrackCard({ track, list, index, eager }: { track: Track; list: Track[]; index: number; eager?: boolean }) {
  const { current, isPlaying, playQueue, toggle } = usePlayer();
  const isCurrent = current?.id === track.id;
  const playing = isCurrent && isPlaying;
  const href = `/track/${track.slug}`;
  return (
    <article className="group">
      <div
        className={`relative rounded-2xl transition-[transform,box-shadow] duration-300 group-hover:-translate-y-1 group-hover:shadow-[var(--shadow)] ${
          isCurrent ? "ring-2 ring-accent ring-offset-2 ring-offset-bg" : ""
        }`}
      >
        <Link to={href} tabIndex={-1} aria-hidden="true" className="block">
          <Cover src={track.coverUrl} alt="" eager={eager} />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 rounded-b-2xl bg-gradient-to-t from-black/60 to-transparent" />
          <span className="absolute bottom-2 right-2 rounded-md bg-black/65 px-1.5 py-0.5 font-mono text-xs text-white/95 backdrop-blur">
            {fmtTime(track.durationSeconds)}
          </span>
          {track.episodeCount > 1 && (
            <span className="absolute left-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-xs font-medium text-white/95 backdrop-blur">
              {track.episodeCount} tập
            </span>
          )}
          {track.code ? (
            <span className="absolute right-2 top-2 rounded-md bg-accent px-1.5 py-0.5 font-mono text-xs font-bold text-on-accent shadow">
              Mã số {track.code}
            </span>
          ) : null}
        </Link>
        <button
          type="button"
          onClick={() => (isCurrent ? toggle() : playQueue(list, index))}
          aria-label={playing ? `Tạm dừng ${track.title}` : `Phát ${track.title}`}
          className={`absolute bottom-2 left-2 grid h-11 w-11 place-items-center rounded-full bg-accent text-on-accent shadow-lg transition-all duration-200 focus-visible:translate-y-0 focus-visible:opacity-100 md:translate-y-1 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100 ${
            isCurrent ? "md:translate-y-0 md:opacity-100" : ""
          }`}
        >
          {playing ? <IconPause size={18} /> : <IconPlay size={18} className="translate-x-[1px]" />}
        </button>
      </div>
      <Link to={href} className="mt-2.5 block rounded-md">
        <h3 className={`line-clamp-2 text-sm font-semibold leading-snug ${isCurrent ? "text-accent" : "text-text group-hover:text-accent"}`}>
          {isCurrent && <Eq on={playing} className="mr-1.5 align-[-1px] text-accent" />}
          {track.title}
        </h3>
        <p className="mt-1 flex items-center gap-1 text-xs text-muted">
          <IconHeadphones size={13} />
          {fmtCount(track.playCount)} lượt nghe
        </p>
      </Link>
    </article>
  );
}

export function TrackCardSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="skeleton aspect-square rounded-2xl" />
      <div className="skeleton mt-3 h-3.5 w-11/12" />
      <div className="skeleton mt-2 h-3 w-1/2" />
    </div>
  );
}

export const GRID = "grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5";
