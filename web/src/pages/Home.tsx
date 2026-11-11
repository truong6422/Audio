import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import type { HistoryItem, Track } from "@shared/types";
import { apiGet } from "../api";
import { useAuth } from "../auth";
import { CategoryChips } from "../components/CategoryChips";
import { Cover } from "../components/Cover";
import { IconBookmark, IconFlame, IconPlay, IconSearch, IconX } from "../components/Icons";
import { HomeLandingBanner } from "../components/LandingBanner";
import { EmptyState } from "../components/States";
import { SortTabs, TrackGrid, type Sort } from "../components/TrackList";
import { useCategories } from "../lib/categories";
import { parseCode, trackByCode } from "../lib/code";
import { useFollows } from "../lib/follow";
import { fmtTime } from "../lib/format";
import { isResumable, listProgress } from "../lib/progress";
import { useSeo } from "../lib/seo";
import { STREAK_MIN_SECONDS, useStreak } from "../lib/streak";
import { usePlayer } from "../player/PlayerContext";
import { useSite } from "../site";

const PAGE_SIZE = 24;

interface ContinueItem {
  track: Track;
  position: number;
  updatedAt: number;
}

function useContinueList(): ContinueItem[] {
  const { user } = useAuth();
  const [localItems, setLocalItems] = useState(() => listProgress());
  const [serverItems, setServerItems] = useState<HistoryItem[]>([]);

  useEffect(() => {
    const on = () => setLocalItems(listProgress());
    window.addEventListener("kd-progress", on);
    return () => window.removeEventListener("kd-progress", on);
  }, []);

  useEffect(() => {
    if (!user) {
      setServerItems([]);
      return;
    }
    const ac = new AbortController();
    apiGet<HistoryItem[]>("/api/history", ac.signal)
      .then((r) => setServerItems(r ?? []))
      .catch(() => {});
    return () => ac.abort();
  }, [user]);

  const map = new Map<string, ContinueItem>();
  for (const s of serverItems) map.set(s.track.id, { track: s.track, position: s.positionSeconds, updatedAt: s.updatedAt });
  for (const l of localItems) {
    const prev = map.get(l.track.id);
    if (!prev || l.updatedAt >= prev.updatedAt) map.set(l.track.id, { track: prev?.track ?? l.track, position: l.position, updatedAt: l.updatedAt });
  }
  return [...map.values()]
    .filter((i) => i.track.status === "ready" && isResumable(i.position, i.track.durationSeconds))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 8);
}

function ContinueRow() {
  const items = useContinueList();
  const { playQueue } = usePlayer();
  if (!items.length) return null;
  return (
    <section aria-labelledby="continue-h" className="mt-10">
      <h2 id="continue-h" className="font-display text-xl font-bold">
        Nghe tiếp
      </h2>
      <ul className="no-scrollbar -mx-4 mt-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        {items.map((it) => {
          const pct = it.track.durationSeconds > 0 ? Math.min(100, (it.position / it.track.durationSeconds) * 100) : 0;
          return (
            <li key={it.track.id} className="w-[260px] shrink-0 snap-start">
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-2.5 pr-3">
                <Cover src={it.track.coverUrl} className="w-14 shrink-0" rounded="rounded-xl" markSize={24} />
                <div className="min-w-0 flex-1">
                  <Link to={`/track/${it.track.slug}`} className="line-clamp-1 text-sm font-semibold hover:text-accent">
                    {it.track.title}
                  </Link>
                  <p className="mt-0.5 font-mono text-xs text-muted">
                    {fmtTime(it.position)} / {fmtTime(it.track.durationSeconds)}
                  </p>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-text/10">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <button
                  type="button"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-on-accent"
                  onClick={() => playQueue([it.track], 0, it.position)}
                  aria-label={`Nghe tiếp ${it.track.title} từ ${fmtTime(it.position)}`}
                >
                  <IconPlay size={16} className="translate-x-[1px]" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Chuỗi ngày nghe — nhỏ gọn, chỉ hiện khi đã có chuỗi ≥ 2 ngày. */
function StreakPill() {
  const { streak, todayDone, todaySeconds } = useStreak();
  if (streak < 2) return null;
  const leftMin = Math.max(1, Math.ceil((STREAK_MIN_SECONDS - todaySeconds) / 60));
  return (
    <p className="mt-4 inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-surface/80 px-3 py-1.5 text-xs text-muted">
      <IconFlame size={14} className="shrink-0 text-accent" />
      <span>
        <strong className="font-semibold text-text">{streak} ngày</strong> nghe liên tiếp
        {!todayDone && <> · nghe thêm {leftMin} phút hôm nay để giữ chuỗi</>}
      </span>
    </p>
  );
}

/** Hàng "Đang theo dõi": thể loại + truyện đã bấm Theo dõi. */
function FollowingRow() {
  const { tracks, cats } = useFollows();
  const { list } = useCategories();
  const { current, playQueue } = usePlayer();
  const catItems = cats.map((slug) => list.find((c) => c.slug === slug)).filter((c): c is NonNullable<typeof c> => !!c);
  if (!tracks.length && !catItems.length) return null;
  return (
    <section aria-labelledby="follow-h" className="mt-10">
      <h2 id="follow-h" className="flex items-center gap-2 font-display text-xl font-bold">
        <IconBookmark size={18} filled className="text-accent" />
        Đang theo dõi
      </h2>
      {catItems.length > 0 && (
        <ul className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 py-1 md:mx-0 md:flex-wrap md:px-0" aria-label="Thể loại đang theo dõi">
          {catItems.map((c) => (
            <li key={c.slug} className="shrink-0">
              <Link
                to={`/the-loai/${c.slug}`}
                className="inline-flex min-h-10 items-center whitespace-nowrap rounded-full border border-accent/40 bg-accent/10 px-4 text-sm font-medium text-text hover:border-accent"
              >
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {tracks.length > 0 && (
        <ul className="no-scrollbar -mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
          {tracks.map((t, i) => (
            <li key={t.id} className="w-[132px] shrink-0 snap-start sm:w-[148px]">
              <div className="relative">
                <Link to={`/track/${t.slug}`} tabIndex={-1} aria-hidden="true" className="block">
                  <Cover src={t.coverUrl} rounded="rounded-2xl" markSize={30} />
                </Link>
                {t.status === "ready" && (
                  <button
                    type="button"
                    onClick={() => playQueue(tracks, i)}
                    className="absolute bottom-2 left-2 grid h-10 w-10 place-items-center rounded-full bg-accent text-on-accent shadow-lg"
                    aria-label={`Phát ${t.title}`}
                  >
                    <IconPlay size={16} className="translate-x-[1px]" />
                  </button>
                )}
              </div>
              <Link
                to={`/track/${t.slug}`}
                className={`mt-2 line-clamp-2 text-sm font-semibold leading-snug hover:text-accent ${current?.id === t.id ? "text-accent" : ""}`}
              >
                {t.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Home() {
  const site = useSite();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const sort: Sort = params.get("sort") === "hot" ? "hot" : "new";
  const [input, setInput] = useState("");
  const [codeMiss, setCodeMiss] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const legacyQ = (params.get("q") ?? "").trim();
  const ma = parseCode(params.get("ma") ?? "");

  useSeo({ description: `Nghe truyện audio miễn phí trên ${site.brandName}. ${site.tagline}.` });

  // Link /?ma=123 (bio TikTok) → mở thẳng truyện có mã số đó (giữ utm).
  useEffect(() => {
    if (!ma) return;
    const ac = new AbortController();
    trackByCode(ma, ac.signal)
      .then((t) => {
        if (t) navigate(`/track/${t.slug}${location.search}`, { replace: true });
        else setCodeMiss(ma);
      })
      .catch(() => {});
    return () => ac.abort();
  }, [ma, navigate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const v = input.trim();
    if (!v) return navigate("/tim-kiem");
    const code = parseCode(v);
    if (code) {
      setBusy(true);
      const t = await trackByCode(code).catch(() => null);
      setBusy(false);
      if (t) return navigate(`/track/${t.slug}`);
    }
    navigate(`/tim-kiem?q=${encodeURIComponent(v)}`);
  };

  const setSort = (s: Sort) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (s === "hot") n.set("sort", "hot");
        else n.delete("sort");
        return n;
      },
      { replace: true },
    );

  const urlFor = useCallback((p: number) => `/api/public/tracks?page=${p}&pageSize=${PAGE_SIZE}&sort=${sort}`, [sort]);

  // Link cũ /?q=... → trang tìm kiếm.
  if (legacyQ) return <Navigate to={`/tim-kiem?q=${encodeURIComponent(legacyQ)}`} replace />;

  return (
    <div className="wrap pb-6">
      {/* Hero */}
      <section className="relative pt-6 md:pt-14">
        <HomeLandingBanner />
        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-accent">{site.brandName}</p>
        <h1 className="mt-2 max-w-2xl font-display text-[32px] font-bold leading-[1.1] tracking-tight md:text-5xl">
          Đêm nay, nghe một câu chuyện.
        </h1>
        <p className="mt-3 max-w-xl text-base text-muted">{site.tagline}. Chọn truyện, bấm nghe, hẹn giờ tắt — rồi cứ thế ngủ.</p>

        <form role="search" className="mt-6 max-w-xl" onSubmit={onSubmit}>
          <label htmlFor="q" className="sr-only">
            Tìm truyện theo tên hoặc mã số
          </label>
          <div className="relative">
            <IconSearch size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
            <input
              id="q"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              placeholder="Tên truyện, mã số…"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setCodeMiss(null);
              }}
              className="input min-h-[52px] rounded-full pl-12 pr-[124px] [&::-webkit-search-cancel-button]:hidden"
            />
            {input && (
              <button
                type="button"
                onClick={() => setInput("")}
                className="icon-btn absolute right-[76px] top-1/2 -translate-y-1/2"
                aria-label="Xoá từ khoá"
              >
                <IconX size={18} />
              </button>
            )}
            <button type="submit" className="btn btn-primary absolute right-1.5 top-1/2 min-h-10 w-[68px] -translate-y-1/2 px-0 text-sm" disabled={busy}>
              {busy ? "…" : "Tìm"}
            </button>
          </div>
          {codeMiss && (
            <p className="mt-2 pl-4 text-sm text-danger" role="alert">
              Không có truyện mang mã số {codeMiss}.
            </p>
          )}
        </form>
        <StreakPill />
      </section>

      <CategoryChips className="mt-8" />

      <ContinueRow />
      <FollowingRow />

      {/* Danh sách */}
      <section className="mt-10" aria-labelledby="list-h">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="list-h" className="font-display text-xl font-bold">
            Tủ truyện
          </h2>
          <SortTabs sort={sort} onChange={setSort} />
        </div>
        <div className="mt-5">
          <TrackGrid
            urlFor={urlFor}
            empty={<EmptyState title="Tủ truyện đang trống">Truyện mới sẽ sớm xuất hiện. Quay lại sau nhé!</EmptyState>}
          />
        </div>
      </section>
    </div>
  );
}
