// SEO cho Kể Đêm Audio — HÀM THUẦN (không đụng Hono / D1 / Env), gắn vào worker/src/index.ts theo docs/seo.md.
// Một tệp duy nhất, chỉ `import type` → chạy thẳng bằng `node --experimental-strip-types` (tests/seo.test.mjs).
import type { Track } from "../../../shared/types";

/* ───────────────────────────── Kiểu ───────────────────────────── */

export type SeoRoute =
  | { kind: "home"; page: number }
  | { kind: "track"; slug: string }
  | { kind: "search"; q: string; page: number }
  | { kind: "category"; slug: string; page: number }
  | { kind: "tag"; slug: string; page: number }
  | { kind: "static"; key: string; name: string }
  | { kind: "private"; key: "login" | "register" | "history" | "admin" }
  | { kind: "notFound"; path: string };

export interface SeoSite {
  brandName: string;
  siteTitle: string;
  tagline: string;
  /** Ảnh mặc định cho og:image (tuyệt đối hoặc /đường-dẫn). */
  defaultImage?: string | null;
  logoUrl?: string | null;
  themeColor?: string; // mặc định #0b0b12
  sameAs?: string[]; // Fanpage, YouTube, TikTok…
  contactEmail?: string;
  twitterSite?: string; // @handle
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface SeoData {
  track?: Track | null;
  related?: Track[];
  latest?: Track[];
  /** URL audio công khai cho og:audio / contentUrl. Bỏ trống = không lộ đường dẫn tệp. */
  audioUrl?: string | null;
  faq?: FaqItem[];
  /** Tổng số tập ready (cho phân trang trang chủ). */
  total?: number;
  /** Trang thể loại / tag: thông tin nhóm (null = không có → 404). */
  collection?: { name: string; description?: string } | null;
  /** Danh sách truyện của trang thể loại / tag. */
  items?: Track[];
}

export interface HeadResult {
  status: number;
  title: string;
  description: string;
  canonical: string;
  robots: "index, follow" | "noindex, follow";
  /** Chuỗi chèn vào <head> (thay <title> có sẵn + meta + link + JSON-LD). */
  html: string;
  jsonLd: Record<string, unknown>[];
}

/* ───────────────────────────── Tiện ích chữ ───────────────────────────── */

export const TITLE_MAX = 60;
export const DESC_MAX = 155;

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[ch]!);
}

const BS = String.fromCharCode(92);
const LS_RE = new RegExp(String.fromCharCode(0x2028), "g");
const PS_RE = new RegExp(String.fromCharCode(0x2029), "g");
/** JSON an toàn trong <script>: chặn </script>, <!--, & và U+2028 / U+2029. */
export function safeJson(v: unknown): string {
  return JSON.stringify(v)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(LS_RE, BS + "u2028")
    .replace(PS_RE, BS + "u2029");
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** Cắt theo từ, không cắt giữa chữ; thêm "…" khi có cắt. Kết quả ≤ max ký tự. */
export function clipWords(input: string, max: number): string {
  const s = squash(input);
  if (s.length <= max) return s;
  const room = s.slice(0, max - 1);
  const sp = room.lastIndexOf(" ");
  const cut = sp > max * 0.5 ? room.slice(0, sp) : room;
  return cut.replace(/[\s,.;:–—-]+$/u, "") + "…";
}

/** "Tên truyện – Nghe audio full | Brand", rút gọn dần để ≤ 60 ký tự. */
export function pageTitle(name: string, brand: string, suffix = "Nghe audio full"): string {
  const n = squash(name);
  const tail = ` | ${brand}`;
  const full = `${n} – ${suffix}${tail}`;
  if (full.length <= TITLE_MAX) return full;
  if (n.length + tail.length <= TITLE_MAX) return n + tail; // bỏ hậu tố
  const room = TITLE_MAX - tail.length;
  if (room >= 20) return clipWords(n, room) + tail;
  return clipWords(n, TITLE_MAX); // tên thương hiệu quá dài → chỉ giữ tên truyện
}

/** Giây → ISO 8601 (PT1H2M3S). */
export function isoDuration(sec: number): string {
  const t = Math.max(0, Math.round(sec));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return "PT" + (h ? `${h}H` : "") + (m ? `${m}M` : "") + (s || (!h && !m) ? `${s}S` : "");
}

/** Giây → "1:02:03" / "02:03". */
export function clock(sec: number): string {
  const t = Math.max(0, Math.floor(sec));
  const h = Math.floor(t / 3600);
  const mm = String(Math.floor((t % 3600) / 60)).padStart(2, "0");
  const ss = String(t % 60).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Điểm bắt đầu từng tập: chia đều thời lượng (khớp quy ước shared/types.ts). */
export function episodeStarts(durationSeconds: number, episodeCount: number): number[] {
  const n = Math.max(1, Math.floor(episodeCount));
  if (durationSeconds <= 0) return [0];
  const per = durationSeconds / n;
  return Array.from({ length: n }, (_, i) => Math.floor(i * per));
}

const absUrl = (origin: string, u: string) => (/^https?:\/\//i.test(u) ? u : origin + (u.startsWith("/") ? u : "/" + u));
const trackPath = (slug: string) => `/track/${encodeURIComponent(slug)}`;
const isoDate = (sec: number) => new Date(sec * 1000).toISOString();

/* ───────────────────────────── Định tuyến ───────────────────────────── */

const PRIVATE = new Set(["login", "register", "history", "admin"]);

/** Nhận diện route từ URL (cùng bảng trang tĩnh với pages.ts: STATIC_PAGES + bí danh). */
export function matchRoute(url: URL, staticPages: Record<string, string>, aliases: Record<string, string> = {}): SeoRoute {
  const path = url.pathname.replace(/\/{2,}/g, "/");
  const page = Math.max(1, Math.floor(Number(url.searchParams.get("page")) || 1));
  if (path === "/") return { kind: "home", page };
  const tm = /^\/track\/([^/]+)\/?$/.exec(path);
  if (tm) {
    try {
      return { kind: "track", slug: decodeURIComponent(tm[1]!) };
    } catch {
      return { kind: "notFound", path };
    }
  }
  if (/^\/(tim-kiem|search)\/?$/.test(path)) return { kind: "search", q: squash(url.searchParams.get("q") ?? ""), page };
  const cm = /^\/(the-loai|tag)\/([^/]+)\/?$/.exec(path);
  if (cm) {
    try {
      return { kind: cm[1] === "tag" ? "tag" : "category", slug: decodeURIComponent(cm[2]!), page };
    } catch {
      return { kind: "notFound", path };
    }
  }
  const seg = path.replace(/^\/|\/$/g, "");
  const first = seg.split("/")[0]!;
  if (PRIVATE.has(first)) return { kind: "private", key: first as "login" };
  const key = staticPages[seg] ? seg : aliases[seg];
  if (key && staticPages[key]) return { kind: "static", key, name: staticPages[key]! };
  return { kind: "notFound", path };
}

/** Canonical tuyệt đối: bỏ mọi query trừ ?page (>1), bỏ / cuối (trừ gốc). */
export function canonicalUrl(origin: string, route: SeoRoute, rawPath?: string): string {
  switch (route.kind) {
    case "home":
      return origin + "/" + (route.page > 1 ? `?page=${route.page}` : "");
    case "track":
      return origin + trackPath(route.slug);
    case "static":
      return `${origin}/${route.key}`;
    case "search":
      return origin + "/tim-kiem" + (route.page > 1 ? `?page=${route.page}` : "");
    case "category":
    case "tag":
      return `${origin}/${route.kind === "tag" ? "tag" : "the-loai"}/${encodeURIComponent(route.slug)}` + (route.page > 1 ? `?page=${route.page}` : "");
    case "private":
      return `${origin}/${route.key}`;
    case "notFound": {
      const p = (rawPath ?? route.path).replace(/\/+$/, "") || "/";
      return origin + p;
    }
  }
}

/** Trang không nên lập chỉ mục (vẫn follow để bot đi tiếp liên kết). */
export function isNoindex(route: SeoRoute, hasTrack: boolean): boolean {
  // Thể loại / tag: hasTrack = có nhóm (data.collection).
  if (route.kind === "category" || route.kind === "tag") return !hasTrack;
  if (route.kind === "private" || route.kind === "notFound") return true;
  if (route.kind === "search") return true; // có q hay không đều là trang kết quả nội bộ
  if (route.kind === "track") return !hasTrack;
  return false;
}

/* ───────────────────────────── JSON-LD ───────────────────────────── */

type Ld = Record<string, unknown>;
const CTX = "https://schema.org";

export function ldWebSite(site: SeoSite, origin: string): Ld {
  return {
    "@context": CTX,
    "@type": "WebSite",
    "@id": origin + "/#website",
    name: site.brandName,
    alternateName: site.siteTitle !== site.brandName ? site.siteTitle : undefined,
    url: origin + "/",
    inLanguage: "vi",
    publisher: { "@id": origin + "/#org" },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${origin}/tim-kiem?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

export function ldOrganization(site: SeoSite, origin: string): Ld {
  return {
    "@context": CTX,
    "@type": "Organization",
    "@id": origin + "/#org",
    name: site.brandName,
    url: origin + "/",
    logo: site.logoUrl ? absUrl(origin, site.logoUrl) : undefined,
    email: site.contactEmail || undefined,
    sameAs: site.sameAs?.length ? site.sameAs : undefined,
  };
}

export function ldBreadcrumb(origin: string, items: { name: string; path: string }[]): Ld {
  return {
    "@context": CTX,
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absUrl(origin, it.path) })),
  };
}

export function ldItemList(origin: string, name: string, tracks: Track[]): Ld {
  return {
    "@context": CTX,
    "@type": "ItemList",
    name,
    itemListElement: tracks.map((t, i) => ({ "@type": "ListItem", position: i + 1, url: origin + trackPath(t.slug), name: t.title })),
  };
}

export interface TrackLdOptions {
  /** "AudioObject" (mặc định) hoặc "PodcastEpisode" (kèm associatedMedia). */
  type?: "AudioObject" | "PodcastEpisode";
  audioUrl?: string | null;
}

export function ldTrack(site: SeoSite, origin: string, t: Track, opt: TrackLdOptions = {}): Ld {
  const url = origin + trackPath(t.slug);
  const description = clipWords(t.description || `Nghe ${t.title} trên ${site.brandName}.`, 300);
  const audio: Ld = {
    "@type": "AudioObject",
    name: t.title,
    description,
    url,
    inLanguage: "vi",
    uploadDate: isoDate(t.createdAt),
    duration: t.durationSeconds > 0 ? isoDuration(t.durationSeconds) : undefined,
    thumbnailUrl: t.coverUrl ? absUrl(origin, t.coverUrl) : undefined,
    encodingFormat: t.format === "hls" ? "application/vnd.apple.mpegurl" : "audio/mpeg",
    contentUrl: opt.audioUrl ? absUrl(origin, opt.audioUrl) : undefined,
    isAccessibleForFree: true,
    publisher: { "@id": origin + "/#org" },
    interactionStatistic: t.playCount > 0
      ? { "@type": "InteractionCounter", interactionType: "https://schema.org/ListenAction", userInteractionCount: t.playCount }
      : undefined,
  };
  if (opt.type === "PodcastEpisode") {
    return {
      "@context": CTX,
      "@type": "PodcastEpisode",
      name: t.title,
      description,
      url,
      inLanguage: "vi",
      datePublished: isoDate(t.createdAt),
      timeRequired: audio.duration,
      image: audio.thumbnailUrl,
      partOfSeries: { "@type": "PodcastSeries", name: site.brandName, url: origin + "/" },
      associatedMedia: audio,
    };
  }
  return { "@context": CTX, ...audio };
}

export function ldFaq(items: FaqItem[]): Ld | null {
  if (!items.length) return null;
  return {
    "@context": CTX,
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

/** Bỏ khoá undefined (JSON.stringify cũng bỏ, nhưng giữ đối tượng gọn cho test / so sánh). */
function prune<T>(v: T): T {
  if (Array.isArray(v)) return v.map(prune) as T;
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) o[k] = prune(x);
    return o as T;
  }
  return v;
}

export function jsonLdScripts(blocks: Ld[]): string {
  return blocks.map((b) => `<script type="application/ld+json">${safeJson(prune(b))}</script>`).join("\n");
}

/* ───────────────────────────── <head> ───────────────────────────── */

const PRIVATE_NAMES: Record<string, string> = { login: "Đăng nhập", register: "Đăng ký", history: "Lịch sử nghe", admin: "Quản trị" };

export function buildHead(route: SeoRoute, data: SeoData, site: SeoSite, origin: string): HeadResult {
  const brand = site.brandName;
  const track = route.kind === "track" ? (data.track ?? null) : null;
  const collection = route.kind === "category" || route.kind === "tag" ? (data.collection ?? null) : null;
  const noindex = isNoindex(route, !!(track || collection));
  const canonical = canonicalUrl(origin, route);
  let status = 200;
  let title: string;
  let description: string;
  let ogType = "website";
  let image = site.defaultImage ? absUrl(origin, site.defaultImage) : null;
  const ld: Ld[] = [];
  const crumbs: { name: string; path: string }[] = [{ name: "Trang chủ", path: "/" }];

  switch (route.kind) {
    case "home": {
      title = clipWords(route.page > 1 ? `${site.siteTitle} – Trang ${route.page}` : site.siteTitle, TITLE_MAX);
      description = clipWords(
        `${site.tagline ? site.tagline + ". " : ""}Nghe truyện audio drama, truyện ma, ngôn tình… miễn phí, full tập, cập nhật mỗi ngày trên ${brand}.`,
        DESC_MAX,
      );
      ld.push(ldWebSite(site, origin), ldOrganization(site, origin));
      if (data.latest?.length) ld.push(ldItemList(origin, `Audio mới nhất – ${brand}`, data.latest.slice(0, 50)));
      break;
    }
    case "track": {
      if (!track) {
        status = 404;
        title = `Không tìm thấy audio | ${brand}`;
        description = "Audio này không tồn tại hoặc đã bị gỡ. Khám phá các truyện audio mới nhất khác.";
        break;
      }
      title = pageTitle(track.title, brand);
      const eps = track.episodeCount > 1 ? ` ${track.episodeCount} tập` : "";
      const dur = track.durationSeconds > 0 ? `, thời lượng ${clock(track.durationSeconds)}` : "";
      description = clipWords(
        track.description ? track.description : `Nghe ${track.title} full${eps}${dur} miễn phí trên ${brand}.`,
        DESC_MAX,
      );
      ogType = "music.song"; // gần nghĩa "audio" nhất trong Open Graph; Facebook vẫn chấp nhận
      if (track.coverUrl) image = absUrl(origin, track.coverUrl);
      // Không bìa: ảnh mặc định PNG/JPG (Facebook/Zalo/X không nhận SVG) → cuối cùng mới tới SVG động.
      else if (!image) image = `${origin}/og/${encodeURIComponent(track.slug)}.svg`;
      crumbs.push({ name: track.title, path: trackPath(track.slug) });
      ld.push(ldTrack(site, origin, track, { audioUrl: data.audioUrl }), ldBreadcrumb(origin, crumbs));
      break;
    }
    case "static": {
      title = clipWords(`${route.name} | ${brand}`, TITLE_MAX);
      description = clipWords(`${route.name} – ${brand}${site.tagline ? `: ${site.tagline}` : ""}.`, DESC_MAX);
      crumbs.push({ name: route.name, path: `/${route.key}` });
      ld.push(ldBreadcrumb(origin, crumbs));
      break;
    }
    case "category":
    case "tag": {
      if (!collection) {
        status = 404;
        title = route.kind === "tag" ? `Không có audio cho tag này | ${brand}` : `Không tìm thấy thể loại | ${brand}`;
        description = "Trang bạn tìm không tồn tại. Quay về trang chủ để nghe các truyện audio mới nhất.";
        break;
      }
      title = clipWords(`${collection.name} | ${brand}`, TITLE_MAX);
      description = clipWords(
        collection.description || `Nghe truyện audio ${route.kind === "tag" ? "gắn tag " : "thể loại "}${collection.name} miễn phí, full tập trên ${brand}.`,
        DESC_MAX,
      );
      crumbs.push({ name: collection.name, path: canonical.slice(origin.length) });
      ld.push(ldBreadcrumb(origin, crumbs));
      if (data.items?.length) ld.push(ldItemList(origin, `${collection.name} – ${brand}`, data.items.slice(0, 50)));
      break;
    }
    case "search": {
      title = clipWords(route.q ? `Tìm “${route.q}” | ${brand}` : `Tìm kiếm | ${brand}`, TITLE_MAX);
      description = `Tìm truyện audio trên ${brand}.`;
      break;
    }
    case "private": {
      title = `${PRIVATE_NAMES[route.key]} | ${brand}`;
      description = `${PRIVATE_NAMES[route.key]} – ${brand}.`;
      break;
    }
    case "notFound": {
      status = 404;
      title = `Không tìm thấy trang | ${brand}`;
      description = "Trang bạn tìm không tồn tại. Quay về trang chủ để nghe các truyện audio mới nhất.";
      break;
    }
  }
  if (data.faq?.length) {
    const f = ldFaq(data.faq);
    if (f) ld.push(f);
  }

  const robots: HeadResult["robots"] = noindex ? "noindex, follow" : "index, follow";
  const e = escapeHtml;
  const m = (attr: "name" | "property", k: string, v: string | null | undefined) =>
    v ? `<meta ${attr}="${k}" content="${e(v)}">` : "";
  const lines = [
    `<title>${e(title)}</title>`,
    m("name", "description", description),
    m("name", "robots", noindex ? robots : "index, follow, max-image-preview:large, max-snippet:-1"),
    noindex ? "" : `<link rel="canonical" href="${e(canonical)}">`,
    noindex ? "" : `<link rel="alternate" hreflang="vi" href="${e(canonical)}">`,
    noindex ? "" : `<link rel="alternate" hreflang="x-default" href="${e(canonical)}">`,
    m("name", "theme-color", site.themeColor ?? "#0b0b12"),
    m("property", "og:site_name", brand),
    m("property", "og:locale", "vi_VN"),
    m("property", "og:type", ogType),
    m("property", "og:url", canonical),
    m("property", "og:title", title),
    m("property", "og:description", description),
    m("property", "og:image", image),
    image && !/\.svg(\?|$)/i.test(image) ? m("property", "og:image:alt", title) : "",
    track && data.audioUrl ? m("property", "og:audio", absUrl(origin, data.audioUrl)) : "",
    track && data.audioUrl ? m("property", "og:audio:type", track.format === "hls" ? "application/vnd.apple.mpegurl" : "audio/mpeg") : "",
    track && track.durationSeconds > 0 ? m("property", "music:duration", String(Math.round(track.durationSeconds))) : "",
    m("name", "twitter:card", image ? "summary_large_image" : "summary"),
    m("name", "twitter:site", site.twitterSite),
    m("name", "twitter:title", title),
    m("name", "twitter:description", description),
    m("name", "twitter:image", image),
    jsonLdScripts(ld),
  ];
  return { status, title, description, canonical, robots, html: lines.filter(Boolean).join("\n"), jsonLd: ld.map(prune) };
}

/* ───────────────────────────── Thân HTML cho bot ───────────────────────────── */

function trackLinks(tracks: Track[] | undefined, heading: string): string {
  if (!tracks?.length) return "";
  const li = tracks
    .map((t) => `<li><a href="${trackPath(t.slug)}">${escapeHtml(t.title)}</a>${t.durationSeconds > 0 ? ` <small>(${clock(t.durationSeconds)})</small>` : ""}</li>`)
    .join("");
  return `<section><h2>${escapeHtml(heading)}</h2><ul>${li}</ul></section>`;
}

export interface SsrBodyOptions {
  brandName: string;
  tagline?: string;
  staticPages?: Record<string, string>;
  /** Thể loại cho thanh điều hướng (liên kết nội bộ). */
  categories?: { slug: string; name: string }[];
  /** Lớp bao — mặc định "ssr-seo" (CSS ẩn khi JS đã chạy, xem docs/seo.md). */
  className?: string;
}

/**
 * HTML ngữ nghĩa cho bot / người tắt JS. Chèn vào <!--ssr-body-->.
 * Không gây nhấp nháy: ẩn bằng `html.js .ssr-seo{display:none}` (script nhỏ trong <head> gắn lớp js trước khi vẽ),
 * hoặc đặt bên trong #root để createRoot thay thế ngay lần render đầu.
 */
export function ssrBody(route: SeoRoute, data: SeoData, opt: SsrBodyOptions): string {
  const e = escapeHtml;
  const nav =
    (opt.categories?.length
      ? `<nav aria-label="Thể loại"><h2>Thể loại</h2><ul>${opt.categories
          .map((x) => `<li><a href="/the-loai/${encodeURIComponent(x.slug)}">${e(x.name)}</a></li>`)
          .join("")}</ul></nav>`
      : "") +
    (opt.staticPages
      ? `<nav aria-label="Thông tin"><ul>${Object.entries(opt.staticPages).map(([k, n]) => `<li><a href="/${k}">${e(n)}</a></li>`).join("")}</ul></nav>`
      : "");
  const home = `<p><a href="/">${e(opt.brandName)} – Trang chủ</a></p>`;
  let main = "";
  switch (route.kind) {
    case "home":
      main =
        `<h1>${e(opt.brandName)}${opt.tagline ? ` – ${e(opt.tagline)}` : ""}</h1>` +
        `<p>Nghe truyện audio drama miễn phí, full tập, cập nhật mỗi ngày.</p>` +
        trackLinks(data.latest?.slice(0, 30), "Audio mới nhất") +
        (data.total && data.total > 30 && route.page * 30 < data.total ? `<p><a href="/?page=${route.page + 1}">Trang sau</a></p>` : "");
      break;
    case "track": {
      const t = data.track;
      if (!t) {
        main = `<h1>Không tìm thấy audio</h1>${home}` + trackLinks(data.latest?.slice(0, 10), "Audio mới nhất");
        break;
      }
      const starts = episodeStarts(t.durationSeconds, t.episodeCount);
      const eps =
        starts.length > 1
          ? `<section><h2>Danh sách tập</h2><ol>${starts
              .map((s, i) => `<li>Tập ${i + 1} – <time datetime="${isoDuration(s)}">${clock(s)}</time></li>`)
              .join("")}</ol></section>`
          : "";
      main =
        `<article><h1>${e(t.title)}</h1>` +
        (t.coverUrl ? `<img src="${e(t.coverUrl)}" alt="${e(t.title)}" width="600" height="600" loading="lazy">` : "") +
        (t.description ? t.description.split(/\n{2,}/).map((p) => `<p>${e(squash(p))}</p>`).join("") : "") +
        `<p>Thời lượng: <time datetime="${isoDuration(t.durationSeconds)}">${clock(t.durationSeconds)}</time>` +
        (t.episodeCount > 1 ? ` · ${t.episodeCount} tập` : "") +
        `</p>${eps}</article>` +
        home +
        trackLinks(data.related, "Truyện liên quan") +
        trackLinks(data.latest?.filter((x) => x.id !== t.id).slice(0, 10), "Mới cập nhật");
      break;
    }
    case "category":
    case "tag": {
      const col = data.collection;
      main = col
        ? `<h1>${e(col.name)}</h1>` +
          (col.description ? `<p>${e(squash(col.description))}</p>` : "") +
          trackLinks(data.items, "Danh sách truyện") +
          home
        : `<h1>Không tìm thấy trang</h1>${home}` + trackLinks(data.latest?.slice(0, 10), "Audio mới nhất");
      break;
    }
    case "static":
      main = `<h1>${e(route.name)}</h1>${home}`;
      break;
    case "search":
      main = `<h1>Tìm kiếm${route.q ? `: ${e(route.q)}` : ""}</h1>${home}`;
      break;
    case "private":
      main = "";
      break;
    case "notFound":
      main = `<h1>Không tìm thấy trang</h1>${home}` + trackLinks(data.latest?.slice(0, 10), "Audio mới nhất");
      break;
  }
  if (!main) return "";
  return `<div class="${opt.className ?? "ssr-seo"}"><main>${main}</main>${nav}</div>`;
}

/** Script chèn đầu <head>: gắn lớp js trước lần vẽ đầu → CSS ẩn khối SSR, không nhấp nháy. */
export const NO_FLASH_SCRIPT = `<script>document.documentElement.classList.add("js")</script>`;

/* ───────────────────────────── Sitemap / robots ───────────────────────────── */

export const SITEMAP_PAGE_SIZE = 1000;

export interface SitemapEntry {
  loc: string; // tuyệt đối
  lastmod?: number; // giây Unix
  changefreq?: "daily" | "weekly" | "monthly";
  priority?: number;
  images?: { loc: string; title?: string }[];
}

export function sitemapPageCount(total: number, size = SITEMAP_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

/** /sitemap.xml: chỉ mục trỏ tới sitemap-pages.xml + sitemap-tracks-<n>.xml. */
export function sitemapIndex(origin: string, trackTotal: number, lastmods: (number | undefined)[] = [], size = SITEMAP_PAGE_SIZE): string {
  const n = sitemapPageCount(trackTotal, size);
  const items = [`${origin}/sitemap-pages.xml`, ...Array.from({ length: n }, (_, i) => `${origin}/sitemap-tracks-${i + 1}.xml`)];
  const body = items
    .map((loc, i) => {
      const lm = i > 0 ? lastmods[i - 1] : undefined;
      return `<sitemap><loc>${escapeXml(loc)}</loc>${lm ? `<lastmod>${isoDate(lm)}</lastmod>` : ""}</sitemap>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>`;
}

export function sitemapUrlset(entries: SitemapEntry[]): string {
  const hasImg = entries.some((x) => x.images?.length);
  const body = entries
    .map((x) => {
      const parts = [`<loc>${escapeXml(x.loc)}</loc>`];
      if (x.lastmod) parts.push(`<lastmod>${isoDate(x.lastmod)}</lastmod>`);
      if (x.changefreq) parts.push(`<changefreq>${x.changefreq}</changefreq>`);
      if (x.priority != null) parts.push(`<priority>${x.priority.toFixed(1)}</priority>`);
      for (const im of x.images ?? [])
        parts.push(`<image:image><image:loc>${escapeXml(im.loc)}</image:loc>${im.title ? `<image:title>${escapeXml(im.title)}</image:title>` : ""}</image:image>`);
      return `<url>${parts.join("")}</url>`;
    })
    .join("\n");
  const ns = `xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${hasImg ? ` xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"` : ""}`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset ${ns}>\n${body}\n</urlset>`;
}

/** Dòng D1 (snake_case) hoặc Track → mục sitemap có ảnh bìa. */
export function trackSitemapEntry(
  origin: string,
  t: { slug: string; title: string; cover_url?: string | null; coverUrl?: string | null; updated_at?: number; createdAt?: number },
): SitemapEntry {
  const cover = t.cover_url ?? t.coverUrl ?? null;
  return {
    loc: origin + trackPath(t.slug),
    lastmod: t.updated_at ?? t.createdAt,
    changefreq: "weekly",
    priority: 0.7,
    images: cover ? [{ loc: absUrl(origin, cover), title: t.title }] : undefined,
  };
}

/** Trang sitemap thứ n (1-based) → OFFSET cho truy vấn D1. */
export const sitemapOffset = (n: number, size = SITEMAP_PAGE_SIZE) => (Math.max(1, n) - 1) * size;

export function robotsTxt(origin: string, extraDisallow: string[] = []): string {
  return [
    "User-agent: *",
    "Allow: /",
    "Allow: /api/public/",
    "Allow: /media/",
    "Allow: /og/",
    "Disallow: /api/",
    "Disallow: /admin",
    "Disallow: /login",
    "Disallow: /register",
    "Disallow: /history",
    "Disallow: /tim-kiem?",
    "Disallow: /search?",
    ...extraDisallow.map((p) => `Disallow: ${p}`),
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
}

/* ───────────────────────────── Ảnh OG động (SVG) ───────────────────────────── */

/** Tách dòng theo từ, ước lượng bề rộng (chữ Việt có dấu ~0.56em). */
export function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
  const words = squash(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = clipWords(kept[maxLines - 1] + " " + lines.slice(maxLines).join(" "), maxChars);
    return kept.map((l) => (l.length > maxChars ? clipWords(l, maxChars) : l));
  }
  return lines.map((l) => (l.length > maxChars ? clipWords(l, maxChars) : l));
}

export interface OgSvgInput {
  title: string;
  brandName: string;
  subtitle?: string; // vd "12 tập · 3:20:00"
  accent?: string; // màu nhấn, mặc định #e11d48
}

/** SVG 1200×630. LƯU Ý: Facebook/Zalo không nhận og:image SVG — xem docs/seo.md (ưu tiên ảnh bìa / PNG). */
export function ogSvg(inp: OgSvgInput): string {
  const accent = inp.accent ?? "#e11d48";
  const len = squash(inp.title).length;
  const size = len > 60 ? 56 : len > 34 ? 68 : 80;
  const maxChars = Math.floor(1040 / (size * 0.56));
  const lines = wrapLines(inp.title, maxChars, 3);
  const lh = Math.round(size * 1.18);
  const top = 315 - ((lines.length - 1) * lh) / 2 + size * 0.35 - 30;
  const font = `'Be Vietnam Pro','Noto Sans','Segoe UI',Arial,sans-serif`;
  const x = escapeXml;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b0b12"/><stop offset="1" stop-color="#2a0f1f"/></linearGradient></defs>
<rect width="1200" height="630" fill="url(#g)"/>
<circle cx="1080" cy="110" r="220" fill="${x(accent)}" opacity="0.12"/>
<rect x="80" y="80" width="64" height="6" rx="3" fill="${x(accent)}"/>
<text font-family="${font}" font-weight="800" font-size="${size}" fill="#ffffff">${lines
    .map((l, i) => `<tspan x="80" y="${Math.round(top + i * lh)}">${x(l)}</tspan>`)
    .join("")}</text>
${inp.subtitle ? `<text x="80" y="520" font-family="${font}" font-size="32" fill="#cbd5e1">${x(inp.subtitle)}</text>` : ""}
<text x="80" y="574" font-family="${font}" font-weight="700" font-size="34" fill="${x(accent)}">${x(inp.brandName)}</text>
<text x="1120" y="574" text-anchor="end" font-family="${font}" font-size="28" fill="#94a3b8">Nghe audio full</text>
</svg>`;
}

/* ───────────────────────────── Header ───────────────────────────── */

export type CacheKind = "html" | "html-private" | "sitemap" | "robots" | "og";

/** HTML không chứa dữ liệu riêng người dùng (phiên lấy qua /api) → cho CDN giữ ngắn, trình duyệt luôn hỏi lại. */
export function cacheControl(kind: CacheKind): string {
  switch (kind) {
    case "html":
      return "public, max-age=0, s-maxage=300, stale-while-revalidate=600";
    case "html-private":
      return "no-store";
    case "sitemap":
      return "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400";
    case "robots":
      return "public, max-age=86400";
    case "og":
      return "public, max-age=86400, s-maxage=604800";
  }
}

/** Header cho trang HTML đã dựng: Cache-Control, X-Robots-Tag, Link preload (ảnh bìa = phần tử LCP). */
export function htmlHeaders(head: Pick<HeadResult, "robots" | "canonical">, opt: { preloadImage?: string | null; preconnect?: string[] } = {}): Record<string, string> {
  const h: Record<string, string> = {
    "content-type": "text/html; charset=utf-8",
    "cache-control": cacheControl(head.robots.startsWith("noindex") ? "html-private" : "html"),
  };
  if (head.robots.startsWith("noindex")) h["x-robots-tag"] = "noindex, follow";
  const links: string[] = [];
  for (const o of opt.preconnect ?? []) links.push(`<${o}>; rel=preconnect; crossorigin`);
  if (opt.preloadImage) links.push(`<${opt.preloadImage}>; rel=preload; as=image; fetchpriority=high`);
  if (links.length) h["link"] = links.join(", ");
  return h;
}

/* ───────────────────────────── Chuyển 301 slug cũ ───────────────────────────── */

/** SQL tra slug cũ (bảng slug_redirects, xem schema.sql). Gọi khi /track/:slug không thấy bản ready. */
export const SLUG_REDIRECT_LOOKUP_SQL =
  "SELECT t.slug AS slug FROM slug_redirects r JOIN tracks t ON t.id = r.track_id WHERE r.old_slug = ? AND t.status = 'ready' LIMIT 1";
/** Ghi khi PATCH đổi tiêu đề làm đổi slug: (old_slug, track_id, created_at). */
export const SLUG_REDIRECT_INSERT_SQL =
  "INSERT INTO slug_redirects (old_slug, track_id, created_at) VALUES (?, ?, ?) ON CONFLICT(old_slug) DO UPDATE SET track_id = excluded.track_id, created_at = excluded.created_at";

export function redirectTo(origin: string, slug: string): { status: 301; location: string } {
  return { status: 301, location: origin + trackPath(slug) };
}
