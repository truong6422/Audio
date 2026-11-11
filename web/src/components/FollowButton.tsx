import type { Track } from "@shared/types";
import { toggleFollowCategory, toggleFollowTrack, useFollows } from "../lib/follow";
import { IconBookmark } from "./Icons";

export function FollowTrackButton({ track, compact = false }: { track: Track; compact?: boolean }) {
  const { isTrack } = useFollows();
  const on = isTrack(track.id);
  const label = on ? "Đang theo dõi" : "Theo dõi";
  return (
    <button
      type="button"
      onClick={() => toggleFollowTrack(track)}
      aria-pressed={on}
      aria-label={compact ? (on ? `Bỏ theo dõi ${track.title}` : `Theo dõi ${track.title}`) : undefined}
      title={on ? "Bỏ theo dõi" : "Theo dõi truyện này"}
      className={
        compact
          ? `inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-2.5 transition-colors hover:bg-text/8 ${on ? "text-accent" : "text-text"}`
          : `btn btn-ghost ${on ? "border-accent/60 text-accent" : ""}`
      }
    >
      <IconBookmark size={18} filled={on} />
      {!compact && <span>{label}</span>}
    </button>
  );
}

export function FollowCategoryButton({ slug, name }: { slug: string; name: string }) {
  const { isCat } = useFollows();
  const on = isCat(slug);
  return (
    <button
      type="button"
      onClick={() => toggleFollowCategory(slug)}
      aria-pressed={on}
      aria-label={on ? `Bỏ theo dõi thể loại ${name}` : `Theo dõi thể loại ${name}`}
      className={`btn btn-ghost ${on ? "border-accent/60 text-accent" : ""}`}
    >
      <IconBookmark size={18} filled={on} />
      <span>{on ? "Đang theo dõi" : "Theo dõi"}</span>
    </button>
  );
}
