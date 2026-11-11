import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { Track } from "@shared/types";
import { ApiError, apiGet, errorMessage, isAbort } from "../api";
import { Cover } from "../components/Cover";
import { IconChevronLeft, IconClock, IconHeadphones, IconList, IconLock, IconPause, IconPlay } from "../components/Icons";
import { FollowTrackButton } from "../components/FollowButton";
import { TrackLandingBanner } from "../components/LandingBanner";
import { ShareButton } from "../components/ShareButton";
import { ErrorState } from "../components/States";
import { tagLabel, useCategories } from "../lib/categories";
import { trackEvent } from "../lib/events";
import { refreshFollowedTrack } from "../lib/follow";
import { Eq, GRID, TrackCard } from "../components/TrackCard";
import { episodeAt, episodeList, episodeLocked } from "../lib/episodes";
import { fmtCount, fmtDate, fmtDurationLong, fmtTime } from "../lib/format";
import { isResumable } from "../lib/progress";
import { useSeo } from "../lib/seo";
import { SleepButton } from "../player/Controls";
import { usePlayer, usePlayerTime } from "../player/PlayerContext";
import { useSite } from "../site";
import { NotFound } from "./NotFound";

interface Data {
  track: Track;
  related: Track[];
}

function EpisodeList({ track, queue }: { track: Track; queue: Track[] }) {
  const { current, isPlaying, playEpisode } = usePlayer();
  const { currentTime, duration } = usePlayerTime();
  const site = useSite();
  const isCurrent = current?.id === track.id;
  const eps = episodeList(track, isCurrent ? duration : undefined);
  const activeEp = isCurrent ? episodeAt(track, currentTime, duration) : 0;
  const avg = eps.length ? (eps[eps.length - 1].end || track.durationSeconds) / eps.length : 0;

  return (
    <section aria-labelledby="eps-h" className="mt-10">
      <div className="flex items-end justify-between gap-3">
        <h2 id="eps-h" className="flex items-center gap-2 font-display text-xl font-bold">
          <IconList size={20} className="text-accent" />
          Danh sách tập <span className="text-base font-normal text-muted">({eps.length})</span>
        </h2>
        {avg > 0 && <p className="text-xs text-muted">Mỗi tập khoảng {fmtDurationLong(avg)}</p>}
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2">
        {eps.map((e) => {
          const active = e.n === activeEp;
          const locked = episodeLocked(track, site.gate?.checkpoints, e.n, isCurrent ? duration : undefined, site.gate?.unlockTtlHours);
          return (
            <li key={e.n}>
              <button
                type="button"
                onClick={() => playEpisode(track, e.n, queue)}
                disabled={track.status !== "ready"}
                aria-current={active ? "true" : undefined}
                aria-label={`Tập ${e.n}, ${fmtTime(e.start)} đến ${fmtTime(e.end)}${locked ? ", cần mở khoá" : ""}`}
                className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left transition-colors disabled:opacity-50 ${
                  active ? "border-accent/50 bg-accent/10" : "border-border bg-surface hover:border-accent/40"
                }`}
              >
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl font-mono text-sm font-semibold ${
                    active ? "bg-accent text-on-accent" : "bg-surface-2 text-text"
                  }`}
                >
                  {active ? <Eq on={isPlaying} /> : e.n}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-semibold ${active ? "text-accent" : "text-text"}`}>Tập {e.n}</span>
                  <span className="block font-mono text-xs text-muted">
                    {fmtTime(e.start)} – {fmtTime(e.end)}
                  </span>
                </span>
                {locked && <IconLock size={16} className="shrink-0 text-accent" />}
                <span className="shrink-0 font-mono text-xs text-muted">{fmtTime(e.end - e.start)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Actions({ track, queue, sharedAt }: { track: Track; queue: Track[]; sharedAt: number }) {
  const { current, isPlaying, toggle, playQueue, getSavedPosition } = usePlayer();
  const isCurrent = current?.id === track.id;
  const [saved, setSaved] = useState(() => getSavedPosition(track.id));
  useEffect(() => {
    setSaved(getSavedPosition(track.id));
    const on = () => setSaved(getSavedPosition(track.id));
    window.addEventListener("kd-progress", on);
    return () => window.removeEventListener("kd-progress", on);
  }, [track.id, getSavedPosition]);

  if (track.status !== "ready") {
    return (
      <div className="mt-6">
        <button type="button" className="btn btn-primary" disabled>
          <IconLock size={18} /> Đang xử lý
        </button>
        <p className="mt-2 text-sm text-muted">Audio đang được chuẩn bị, bạn quay lại sau ít phút nhé.</p>
      </div>
    );
  }

  const idx = Math.max(0, queue.findIndex((t) => t.id === track.id));
  // Link chia sẻ ?t=… thắng vị trí nghe dở: người mở link muốn nghe đúng đoạn được gửi.
  const shared = !isCurrent && sharedAt > 0 && sharedAt < (track.durationSeconds || Infinity) ? sharedAt : 0;
  const resumable = !isCurrent && !shared && isResumable(saved, track.durationSeconds);

  return (
    <div className="mt-6">
      {shared > 0 && (
        <p className="mb-3 text-sm text-muted">
          Bạn được chia sẻ đoạn bắt đầu từ <span className="font-mono font-semibold text-accent">{fmtTime(shared)}</span>.
        </p>
      )}
      {resumable && (
        <p className="mb-3 text-sm text-muted">
          Lần trước bạn dừng ở <span className="font-mono font-semibold text-accent">{fmtTime(saved)}</span>. Nghe tiếp từ đó?
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        {isCurrent ? (
          <button type="button" className="btn btn-primary min-w-40 text-base" onClick={toggle}>
            {isPlaying ? <IconPause size={18} /> : <IconPlay size={18} />}
            {isPlaying ? "Tạm dừng" : "Phát tiếp"}
          </button>
        ) : shared ? (
          <>
            <button type="button" className="btn btn-primary text-base" onClick={() => playQueue(queue, idx, shared)}>
              <IconPlay size={18} /> Nghe từ {fmtTime(shared)}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => playQueue(queue, idx, 0)}>
              Nghe từ đầu
            </button>
          </>
        ) : resumable ? (
          <>
            <button type="button" className="btn btn-primary text-base" onClick={() => playQueue(queue, idx, saved)}>
              <IconPlay size={18} /> Nghe tiếp {fmtTime(saved)}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => playQueue(queue, idx, 0)}>
              Nghe từ đầu
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-primary min-w-40 text-base" onClick={() => playQueue(queue, idx, 0)}>
            <IconPlay size={18} /> Nghe ngay
          </button>
        )}
        {isCurrent && <SleepButton placement="down" align="start" />}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        <FollowTrackButton track={track} />
        <ShareButton track={track} />
      </div>
    </div>
  );
}

function Description({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 320;
  return (
    <section aria-labelledby="desc-h" className="mt-10">
      <h2 id="desc-h" className="font-display text-xl font-bold">
        Giới thiệu
      </h2>
      <div className="relative mt-3">
        <p className={`whitespace-pre-line text-[15px] leading-relaxed text-text/90 ${long && !open ? "line-clamp-5" : ""}`}>{text}</p>
      </div>
      {long && (
        <button type="button" className="mt-1 min-h-10 text-sm font-semibold text-accent hover:underline" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Thu gọn" : "Xem thêm"}
        </button>
      )}
    </section>
  );
}

function Skeleton() {
  return (
    <div className="wrap py-8" aria-busy="true" aria-label="Đang tải">
      <div className="skeleton h-4 w-24" />
      <div className="mt-6 grid gap-6 md:grid-cols-[280px_1fr] md:gap-10">
        <div className="skeleton mx-auto aspect-square w-full max-w-[280px] rounded-3xl" />
        <div className="space-y-3 pt-2">
          <div className="skeleton h-3 w-28" />
          <div className="skeleton h-9 w-4/5" />
          <div className="skeleton h-4 w-2/3" />
          <div className="skeleton mt-6 h-12 w-44 rounded-full" />
        </div>
      </div>
      <div className="mt-10 grid gap-2 sm:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton h-14 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export function TrackPage() {
  const { slug = "" } = useParams();
  const [params] = useSearchParams();
  const sharedAt = Math.max(0, Math.floor(Number(params.get("t")) || 0));
  const site = useSite();
  const { current } = usePlayer();
  const { list: cats } = useCategories();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<{ msg: string; notFound: boolean } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    setData(null);
    setError(null);
    apiGet<Data>(`/api/public/tracks/${encodeURIComponent(slug)}`, ac.signal)
      .then((d) => setData({ track: d.track, related: d.related ?? [] }))
      .catch((e) => {
        if (isAbort(e)) return;
        setError({ msg: errorMessage(e), notFound: e instanceof ApiError && e.status === 404 });
      });
    return () => ac.abort();
  }, [slug, reload]);

  const track = data?.track;
  useEffect(() => {
    if (!track) return;
    trackEvent("view", { trackId: track.id });
    refreshFollowedTrack(track);
  }, [track]);
  useSeo({
    title: track?.title ?? (error?.notFound ? "Không tìm thấy" : "Đang tải…"),
    description: track ? (track.description?.slice(0, 155) || `Nghe “${track.title}” trên ${site.brandName}.`) : undefined,
    image: track?.coverUrl,
    noindex: !!error,
  });

  if (error?.notFound) return <NotFound what="truyện" />;
  if (error)
    return (
      <div className="wrap py-10">
        <ErrorState message={error.msg} onRetry={() => setReload((r) => r + 1)} />
      </div>
    );
  if (!data || !track) return <Skeleton />;

  const queue = [track, ...data.related.filter((t) => t.id !== track.id)];
  const n = Math.max(1, track.episodeCount);
  const cat = track.category ? cats.find((c) => c.slug === track.category) : undefined;
  const tags = (track.tags ?? []).filter(Boolean);

  return (
    <div className="wrap pb-6 pt-6">
      <Link to="/" className="inline-flex min-h-10 items-center gap-1 rounded-full pr-3 text-sm text-muted hover:text-text">
        <IconChevronLeft size={18} /> Tủ truyện
      </Link>

      <div className="mt-3">
        <TrackLandingBanner hidden={current?.id === track.id} atSec={sharedAt} />
      </div>

      <section className="relative mt-4 grid gap-6 md:grid-cols-[280px_1fr] md:items-end md:gap-10">
        <div className="relative mx-auto w-full max-w-[260px] md:max-w-none">
          <div
            className="absolute inset-4 -z-10 rounded-3xl opacity-60 blur-3xl"
            style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))" }}
            aria-hidden="true"
          />
          <Cover src={track.coverUrl} alt={`Ảnh bìa ${track.title}`} eager rounded="rounded-3xl" className="shadow-[var(--shadow)]" markSize={64} />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {track.code ? (
              <span className="inline-flex items-center rounded-lg border border-accent/50 bg-accent/12 px-2.5 py-1 font-mono text-sm font-bold text-accent">
                Mã số {track.code}
              </span>
            ) : null}
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
              {cat ? (
                <Link to={`/the-loai/${cat.slug}`} className="inline-flex min-h-10 items-center hover:underline">
                  {cat.name}
                </Link>
              ) : (
                "Truyện audio"
              )}
            </p>
          </div>
          <h1 className="mt-2 font-display text-[28px] font-bold leading-tight tracking-tight md:text-4xl">{track.title}</h1>
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Thông tin">
            <li className="chip">
              <IconClock size={13} /> {fmtDurationLong(track.durationSeconds)}
            </li>
            {n > 1 && (
              <li className="chip">
                <IconList size={13} /> {n} tập
              </li>
            )}
            <li className="chip">
              <IconHeadphones size={13} /> {fmtCount(track.playCount)} lượt nghe
            </li>
            {track.createdAt > 0 && <li className="chip">{fmtDate(track.createdAt)}</li>}
          </ul>
          <Actions track={track} queue={queue} sharedAt={sharedAt} />
        </div>
      </section>

      {(cat || tags.length > 0) && (
        <nav aria-label="Thể loại và chủ đề" className="mt-8">
          <ul className="flex flex-wrap gap-2">
            {cat && (
              <li>
                <Link
                  to={`/the-loai/${cat.slug}`}
                  className="inline-flex min-h-10 items-center rounded-full border border-accent/40 bg-accent/10 px-4 text-sm font-medium text-text hover:border-accent"
                >
                  {cat.name}
                </Link>
              </li>
            )}
            {tags.map((tg) => (
              <li key={tg}>
                <Link
                  to={`/tag/${encodeURIComponent(tg)}`}
                  className="inline-flex min-h-10 items-center rounded-full border border-border bg-surface px-4 text-sm text-muted hover:border-accent/50 hover:text-text"
                >
                  #{tagLabel(tg)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {track.description?.trim() && <Description text={track.description.trim()} />}

      {n > 1 && track.durationSeconds > 0 && <EpisodeList track={track} queue={queue} />}

      {data.related.length > 0 && (
        <section aria-labelledby="rel-h" className="mt-12">
          <h2 id="rel-h" className="font-display text-xl font-bold">
            Có thể bạn cũng thích
          </h2>
          <div className={`mt-5 ${GRID}`}>
            {data.related.map((t) => (
              <TrackCard key={t.id} track={t} list={data.related} index={data.related.indexOf(t)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
