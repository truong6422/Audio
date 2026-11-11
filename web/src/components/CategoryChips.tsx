import { Link } from "react-router-dom";
import { useCategories } from "../lib/categories";
import { useFollows } from "../lib/follow";
import { IconBookmark } from "./Icons";

/** Dải chip thể loại cuộn ngang (điện thoại) / xuống dòng (máy tính). Thể loại đang theo dõi lên đầu. */
export function CategoryChips({ active, className = "", label = "Thể loại" }: { active?: string; className?: string; label?: string }) {
  const { list, ready } = useCategories();
  const { isCat } = useFollows();
  if (ready && !list.length) return null;
  const sorted = [...list].sort((a, b) => Number(isCat(b.slug)) - Number(isCat(a.slug)));
  return (
    <nav aria-label={label} className={className}>
      <ul className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1 md:mx-0 md:flex-wrap md:px-0">
        {!ready
          ? Array.from({ length: 6 }, (_, i) => (
              <li key={i} aria-hidden="true">
                <span className="skeleton block h-10 w-28 rounded-full" />
              </li>
            ))
          : sorted.map((c) => {
              const on = c.slug === active;
              return (
                <li key={c.slug} className="shrink-0">
                  <Link
                    to={`/the-loai/${c.slug}`}
                    aria-current={on ? "page" : undefined}
                    className={`inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors ${
                      on
                        ? "border-accent bg-accent text-on-accent"
                        : "border-border bg-surface text-text hover:border-accent/50 hover:text-accent"
                    }`}
                  >
                    {isCat(c.slug) && <IconBookmark size={13} filled className={on ? "" : "text-accent"} />}
                    {c.name}
                  </Link>
                </li>
              );
            })}
      </ul>
    </nav>
  );
}
