// Trang duyệt: /the-loai/:slug, /tag/:tag, /tim-kiem?q=
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { Track } from "@shared/types";
import { CategoryChips } from "../components/CategoryChips";
import { Cover } from "../components/Cover";
import { FollowCategoryButton } from "../components/FollowButton";
import { IconChevronLeft, IconSearch, IconTag, IconX } from "../components/Icons";
import { EmptyState } from "../components/States";
import { SortTabs, TrackGrid, type Sort } from "../components/TrackList";
import { tagLabel, useCategories } from "../lib/categories";
import { parseCode, trackByCode } from "../lib/code";
import { fmtDurationLong } from "../lib/format";
import { useSeo } from "../lib/seo";
import { useSite } from "../site";
import { NotFound } from "./NotFound";

const PAGE_SIZE = 24;

function useSort(): [Sort, (s: Sort) => void] {
  const [params, setParams] = useSearchParams();
  const sort: Sort = params.get("sort") === "hot" ? "hot" : "new";
  const set = useCallback(
    (s: Sort) =>
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (s === "hot") n.set("sort", "hot");
          else n.delete("sort");
          return n;
        },
        { replace: true },
      ),
    [setParams],
  );
  return [sort, set];
}

function BackLink() {
  return (
    <Link to="/" className="inline-flex min-h-10 items-center gap-1 rounded-full pr-3 text-sm text-muted hover:text-text">
      <IconChevronLeft size={18} /> Tủ truyện
    </Link>
  );
}

const Count = ({ total }: { total: number | null }) =>
  total == null ? (
    <span className="skeleton ml-2 inline-block h-4 w-8 align-middle" aria-hidden="true" />
  ) : (
    <span className="ml-2 align-middle text-sm font-normal text-muted">({total})</span>
  );

/* ================= Thể loại ================= */

export function CategoryPage() {
  const { slug = "" } = useParams();
  const site = useSite();
  const { list, ready } = useCategories();
  const [sort, setSort] = useSort();
  const [total, setTotal] = useState<number | null>(null);
  const cat = list.find((c) => c.slug === slug);
  const name = cat?.name ?? (ready ? tagLabel(slug) : "");
  const notFound = ready && list.length > 0 && !cat;

  useSeo({
    title: name ? `${name} — truyện audio` : "Thể loại",
    description: name ? `Nghe truyện audio thể loại ${name} miễn phí trên ${site.brandName}. Truyện mới mỗi ngày, hẹn giờ tắt khi ngủ.` : undefined,
    noindex: notFound || total === 0,
  });

  const urlFor = useCallback(
    (p: number) => `/api/public/tracks?category=${encodeURIComponent(slug)}&page=${p}&pageSize=${PAGE_SIZE}&sort=${sort}`,
    [slug, sort],
  );

  if (notFound) return <NotFound what="thể loại" />;

  return (
    <div className="wrap pb-6 pt-6">
      <BackLink />
      <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Thể loại</p>
          <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-tight md:text-4xl">
            {name || <span className="skeleton inline-block h-8 w-48 align-middle" aria-label="Đang tải" />}
            <Count total={total} />
          </h1>
        </div>
        {name && <FollowCategoryButton slug={slug} name={name} />}
      </header>
      <CategoryChips active={slug} className="mt-5" label="Thể loại khác" />
      <section className="mt-8" aria-label={`Truyện thể loại ${name}`}>
        <div className="mb-5 flex justify-end">
          <SortTabs sort={sort} onChange={setSort} />
        </div>
        <TrackGrid
          urlFor={urlFor}
          onTotal={setTotal}
          empty={
            <EmptyState
              title="Thể loại này chưa có truyện"
              action={
                <Link to="/" className="btn btn-ghost">
                  Xem tất cả truyện
                </Link>
              }
            >
              Truyện mới sẽ sớm có. Bấm “Theo dõi” để thấy ngay trên trang chủ khi có truyện.
            </EmptyState>
          }
        />
      </section>
    </div>
  );
}

/* ================= Tag ================= */

export function TagPage() {
  const { tag = "" } = useParams();
  const site = useSite();
  const [sort, setSort] = useSort();
  const [total, setTotal] = useState<number | null>(null);
  const label = tagLabel(tag);

  useSeo({
    title: `Truyện audio “${label}”`,
    description: `Tuyển tập truyện audio về “${label}” trên ${site.brandName}. Nghe miễn phí, không cần tài khoản.`,
    // Ít hơn 3 truyện → noindex (tránh trang mỏng).
    noindex: total != null && total < 3,
  });

  const urlFor = useCallback(
    (p: number) => `/api/public/tracks?tag=${encodeURIComponent(tag)}&page=${p}&pageSize=${PAGE_SIZE}&sort=${sort}`,
    [tag, sort],
  );

  return (
    <div className="wrap pb-6 pt-6">
      <BackLink />
      <header className="mt-4">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          <IconTag size={14} /> Chủ đề
        </p>
        <h1 className="mt-1 break-words font-display text-[28px] font-bold leading-tight tracking-tight md:text-4xl">
          {label}
          <Count total={total} />
        </h1>
      </header>
      <CategoryChips className="mt-5" />
      <section className="mt-8" aria-label={`Truyện chủ đề ${label}`}>
        <div className="mb-5 flex justify-end">
          <SortTabs sort={sort} onChange={setSort} />
        </div>
        <TrackGrid
          urlFor={urlFor}
          onTotal={setTotal}
          empty={
            <EmptyState
              title="Chưa có truyện với chủ đề này"
              action={
                <Link to="/tim-kiem" className="btn btn-ghost">
                  Tìm truyện khác
                </Link>
              }
            />
          }
        />
      </section>
    </div>
  );
}

/* ================= Tìm kiếm ================= */

function CodeMatch({ code }: { code: number }) {
  const [state, setState] = useState<{ code: number; track: Track | null } | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    setState(null);
    trackByCode(code, ac.signal)
      .then((track) => setState({ code, track }))
      .catch(() => {});
    return () => ac.abort();
  }, [code]);

  if (!state || state.code !== code) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3" aria-busy="true">
        <div className="skeleton h-14 w-14 shrink-0 rounded-xl" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-3 w-24" />
          <div className="skeleton h-4 w-2/3" />
        </div>
      </div>
    );
  }
  if (!state.track) {
    return (
      <p className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted" role="status">
        Không có truyện mang mã số <span className="font-mono font-semibold text-text">{code}</span>. Kiểm tra lại số trong clip
        {" "}hoặc xem kết quả tìm theo tên bên dưới.
      </p>
    );
  }
  const t = state.track;
  return (
    <Link
      to={`/track/${t.slug}`}
      className="flex items-center gap-3 rounded-2xl border border-accent/50 bg-accent/10 p-3 transition-colors hover:border-accent"
    >
      <Cover src={t.coverUrl} className="w-14 shrink-0" rounded="rounded-xl" markSize={24} />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-accent">Mã số {code}</span>
        <span className="block truncate text-base font-semibold text-text">{t.title}</span>
        <span className="block text-xs text-muted">{fmtDurationLong(t.durationSeconds)}</span>
      </span>
      <span className="btn btn-primary min-h-10 shrink-0 px-4 text-sm">Nghe</span>
    </Link>
  );
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const q = (params.get("q") ?? "").trim();
  const [input, setInput] = useState(params.get("q") ?? "");
  const [total, setTotal] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const code = parseCode(q);

  useSeo({ title: q ? `Tìm “${q}”` : "Tìm truyện", noindex: true });

  // Trễ 250ms rồi mới đổi ?q (thay thế mục lịch sử, không làm đầy nút Quay lại).
  useEffect(() => {
    const v = input.trim();
    if (v === q) return;
    const id = window.setTimeout(() => {
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (v) n.set("q", v);
          else n.delete("q");
          return n;
        },
        { replace: true },
      );
    }, 250);
    return () => window.clearTimeout(id);
  }, [input, q, setParams]);

  // Đồng bộ ô nhập khi bấm Quay lại / Tới.
  useEffect(() => {
    setInput((cur) => (cur.trim() === q ? cur : q));
  }, [q]);

  // Gõ số rồi Enter → mở thẳng truyện có mã đó.
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const c = parseCode(input);
    if (c) {
      const t = await trackByCode(c).catch(() => null);
      if (t) navigate(`/track/${t.slug}`);
    }
    inputRef.current?.blur();
  };

  const urlFor = useCallback((p: number) => `/api/search?q=${encodeURIComponent(q)}&page=${p}`, [q]);
  const hotUrl = useCallback((p: number) => `/api/public/tracks?page=${p}&pageSize=${PAGE_SIZE}&sort=hot`, []);

  return (
    <div className="wrap pb-6 pt-6 md:pt-10">
      <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight md:text-4xl">Tìm truyện</h1>
      <form role="search" className="mt-4 max-w-xl" onSubmit={onSubmit}>
        <label htmlFor="search-q" className="sr-only">
          Tên truyện hoặc mã số
        </label>
        <div className="relative">
          <IconSearch size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input
            id="search-q"
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            autoFocus={!q}
            placeholder="Tên truyện, mã số…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="input min-h-[52px] rounded-full pl-12 pr-12 [&::-webkit-search-cancel-button]:hidden"
          />
          {input && (
            <button
              type="button"
              onClick={() => {
                setInput("");
                inputRef.current?.focus();
              }}
              className="icon-btn absolute right-1 top-1/2 -translate-y-1/2"
              aria-label="Xoá từ khoá"
            >
              <IconX size={18} />
            </button>
          )}
        </div>
        <p className="mt-2 pl-4 text-xs text-muted">Gõ không dấu cũng được. Nghe trong clip “số 123”? Gõ 123 rồi Enter.</p>
      </form>

      {code && (
        <div className="mt-6 max-w-xl">
          <CodeMatch code={code} />
        </div>
      )}

      {q ? (
        <section className="mt-10" aria-labelledby="search-h">
          <h2 id="search-h" className="mb-5 break-words font-display text-xl font-bold">
            Kết quả cho “<span className="text-accent">{q}</span>”
            <Count total={total} />
          </h2>
          <TrackGrid
            urlFor={urlFor}
            onTotal={setTotal}
            empty={
              <EmptyState
                title="Không tìm thấy truyện phù hợp"
                action={
                  <button type="button" className="btn btn-ghost" onClick={() => setInput("")}>
                    Xoá từ khoá
                  </button>
                }
              >
                Thử từ khoá ngắn hơn, hoặc chọn một thể loại bên dưới.
              </EmptyState>
            }
          />
          <CategoryChips className="mt-10" />
        </section>
      ) : (
        <>
          <CategoryChips className="mt-8" />
          <section className="mt-10" aria-labelledby="hot-h">
            <h2 id="hot-h" className="mb-5 font-display text-xl font-bold">
              Đang được nghe nhiều
            </h2>
            <TrackGrid urlFor={hotUrl} empty={<EmptyState title="Tủ truyện đang trống">Truyện mới sẽ sớm xuất hiện.</EmptyState>} />
          </section>
        </>
      )}
    </div>
  );
}
