// Trang HTML: lấy index.html từ ASSETS, chèn cấu hình + SEO (mô-đun ./seo: head, JSON-LD, khối .ssr-seo).
// Cùng sitemap (chỉ mục + trang), robots, ads.txt, ảnh OG SVG, chuyển 301 slug cũ.
import type { Context } from "hono";
import type { SiteSettings, Track } from "../../shared/types";
import type { AppEnv } from "./env";
import { getReadyTrackBySlug, getSettings, latestReady, publicConfig, queryTracks, siteTitleOf, tagSlug, toTrack, DEFAULT_SETTINGS, type TrackRow } from "./data";
import { escapeHtml, jsonForScript } from "./lib";
import * as seo from "./seo";

export const STATIC_PAGES: Record<string, string> = {
  "gioi-thieu": "Giới thiệu",
  "lien-he": "Liên hệ",
  "chinh-sach-bao-mat": "Chính sách bảo mật",
  "dieu-khoan": "Điều khoản sử dụng",
  "mien-tru-trach-nhiem": "Miễn trừ trách nhiệm",
};
// Đường dẫn cũ / biến thể vẫn nhận, canonical về bản chuẩn.
export const STATIC_ALIASES: Record<string, string> = { "dieu-khoan-su-dung": "dieu-khoan" };

/** Màu thanh trình duyệt — khớp web/index.html. */
const THEME_COLOR = "#14100e";

// Khung dự phòng khi ASSETS chưa có index.html (chưa build giao diện).
const FALLBACK_HTML = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title></title><!--ssr-head--></head>
<body><!--ssr-body--><div id="root"></div></body></html>`;

const XML_HEADERS = { "content-type": "application/xml; charset=utf-8", "cache-control": seo.cacheControl("sitemap") };

function siteOf(s: SiteSettings): seo.SeoSite {
  return {
    brandName: s.brand_name,
    siteTitle: siteTitleOf(s),
    tagline: s.tagline,
    contactEmail: s.contact_email || undefined,
    // Thứ tự ảnh OG (buildHead): ảnh bìa → default_og_image → /og/<slug>.svg
    defaultImage: s.default_og_image || null,
    themeColor: THEME_COLOR,
  };
}

interface Built {
  head: seo.HeadResult;
  body: string;
  cover: string | null;
}

const toTracks = (r: TrackRow[]): Track[] => r.map(toTrack);

/** Nạp dữ liệu theo route rồi dựng head + thân SSR. Trả Response khi cần chuyển hướng (slug cũ). */
async function build(c: Context<AppEnv>, s: SiteSettings, url: URL): Promise<Built | Response> {
  const origin = url.origin;
  let route = seo.matchRoute(url, STATIC_PAGES, STATIC_ALIASES);
  const data: seo.SeoData = {};

  switch (route.kind) {
    case "track": {
      const row = await getReadyTrackBySlug(c.env, route.slug);
      if (!row) {
        // Slug cũ (đổi tiêu đề) → 301 sang slug mới, giữ query (utm…).
        const r = await c.env.DB.prepare(seo.SLUG_REDIRECT_LOOKUP_SQL).bind(route.slug).first<{ slug: string }>();
        if (r && r.slug !== route.slug) return c.redirect(seo.redirectTo(origin, r.slug).location + url.search, 301);
        data.track = null;
        data.latest = toTracks(await latestReady(c.env, 10));
        break;
      }
      data.track = toTrack(row);
      data.latest = toTracks(await latestReady(c.env, 30, row.id));
      if (row.category) {
        const same = await queryTracks(c.env, { readyOnly: true, sort: "new", category: row.category, page: 1, pageSize: 13 });
        data.related = same.items.filter((t) => t.id !== row.id).slice(0, 12);
      }
      break;
    }
    case "category": {
      const slug = route.slug;
      const cat = s.categories.find((x) => x.slug === slug);
      if (cat) {
        const page = await queryTracks(c.env, { readyOnly: true, sort: "new", category: cat.slug, page: 1, pageSize: 50 });
        data.collection = { name: cat.name, description: cat.description };
        data.items = page.items;
      } else {
        data.collection = null;
        data.latest = toTracks(await latestReady(c.env, 10));
      }
      break;
    }
    case "tag": {
      const tag = tagSlug(route.slug);
      route = { ...route, slug: tag || route.slug };
      const page = tag ? await queryTracks(c.env, { readyOnly: true, sort: "new", tag, page: 1, pageSize: 50 }) : null;
      if (page && page.total) {
        data.collection = { name: `#${tag}`, description: `${page.total} truyện audio gắn tag #${tag} trên ${s.brand_name}.` };
        data.items = page.items;
      } else {
        data.collection = null;
        data.latest = toTracks(await latestReady(c.env, 10));
      }
      break;
    }
    case "home":
    case "notFound":
      data.latest = toTracks(await latestReady(c.env, 50));
      break;
    default:
      break;
  }

  const head = seo.buildHead(route, data, siteOf(s), origin);
  const body = seo.ssrBody(route, data, {
    brandName: s.brand_name,
    tagline: s.tagline,
    staticPages: STATIC_PAGES,
    categories: route.kind === "private" ? undefined : s.categories,
  });
  const cover = data.track?.coverUrl ? new URL(data.track.coverUrl, origin).href : null;
  return { head, body, cover };
}

/** Thay thế bằng hàm để không bị diễn giải "$&", "$1"… trong nội dung chèn. */
const put = (html: string, find: string | RegExp, value: string) => html.replace(find, () => value);

function inject(html: string, built: Built, s: SiteSettings): string {
  // Bỏ thẻ SEO tĩnh trùng trong index.html (head mới tự có title / meta / canonical / theme-color).
  html = html
    .replace(/<title[^>]*>[\s\S]*?<\/title>\s*/i, "")
    .replace(/<meta\b[^>]*\b(?:name|property)\s*=\s*["'](?:description|robots|theme-color|og:[^"']*|twitter:[^"']*)["'][^>]*>\s*/gi, "")
    .replace(/<link\b[^>]*\brel\s*=\s*["'](?:canonical|alternate)["'][^>]*>\s*/gi, "");

  const headTags = [
    seo.NO_FLASH_SCRIPT,
    built.head.html,
    // jsonForScript chặn "<" → không thoát khỏi <script> được.
    `<script>window.__SITE__=${jsonForScript(publicConfig(s))}</script>`,
    s.head_html,
  ]
    .filter(Boolean)
    .join("\n");
  html = html.includes("<!--ssr-head-->") ? put(html, "<!--ssr-head-->", headTags) : put(html, /<\/head>/i, headTags + "\n</head>");

  const body = built.body + `<noscript>Vui lòng bật JavaScript để nghe audio trên ${escapeHtml(s.brand_name)}.</noscript>`;
  if (html.includes("<!--ssr-body-->")) html = put(html, "<!--ssr-body-->", body);
  else html = html.replace(/<body[^>]*>/i, (m) => m + body);

  if (s.body_html) {
    const i = html.toLowerCase().lastIndexOf("</body>");
    html = i >= 0 ? html.slice(0, i) + s.body_html + "\n" + html.slice(i) : html + s.body_html;
  }
  return html;
}

async function loadShell(c: Context<AppEnv>): Promise<string> {
  try {
    const res = await c.env.ASSETS.fetch(new Request(new URL("/", c.req.url), { method: "GET" }));
    const type = res.headers.get("content-type") ?? "";
    if (res.ok && type.includes("text/html")) return await res.text();
  } catch {
    /* chưa có assets */
  }
  return FALLBACK_HTML;
}

export async function renderPage(c: Context<AppEnv>): Promise<Response> {
  const url = new URL(c.req.url);
  url.pathname = url.pathname.replace(/\/{2,}/g, "/");
  const shellP = loadShell(c);
  let s: SiteSettings;
  let built: Built;
  try {
    s = await getSettings(c.env);
    const r = await build(c, s, url);
    if (r instanceof Response) return r;
    built = r;
  } catch (e) {
    console.error("render page", e);
    s = { ...DEFAULT_SETTINGS };
    const head = seo.buildHead({ kind: "notFound", path: url.pathname }, {}, siteOf(s), url.origin);
    built = { head: { ...head, status: 200 }, body: "", cover: null };
  }
  const html = inject(await shellP, built, s);
  return new Response(c.req.method === "HEAD" ? null : html, {
    status: built.head.status,
    headers: seo.htmlHeaders(built.head, { preloadImage: built.cover }),
  });
}

/** /sitemap.xml — chỉ mục: sitemap-pages.xml + sitemap-tracks-N.xml. */
export async function sitemap(c: Context<AppEnv>): Promise<Response> {
  const origin = new URL(c.req.url).origin;
  const n = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM tracks WHERE status = 'ready'").first<number>("n");
  return new Response(seo.sitemapIndex(origin, n ?? 0), { headers: XML_HEADERS });
}

/** /sitemap-pages.xml — trang chủ, thể loại, trang tĩnh. */
export async function sitemapPages(c: Context<AppEnv>): Promise<Response> {
  const origin = new URL(c.req.url).origin;
  const s = await getSettings(c.env);
  const xml = seo.sitemapUrlset([
    { loc: origin + "/", changefreq: "daily", priority: 1 },
    ...s.categories.map((cat) => ({ loc: `${origin}/the-loai/${encodeURIComponent(cat.slug)}`, changefreq: "daily" as const, priority: 0.6 })),
    ...Object.keys(STATIC_PAGES).map((p) => ({ loc: `${origin}/${p}`, changefreq: "monthly" as const, priority: 0.3 })),
  ]);
  return new Response(xml, { headers: XML_HEADERS });
}

/** /sitemap-tracks-N.xml — 1000 track ready / tệp, có image:image từ ảnh bìa. */
export async function sitemapTracks(c: Context<AppEnv>): Promise<Response> {
  const origin = new URL(c.req.url).origin;
  const m = /^\/sitemap-tracks-(\d+)\.xml$/.exec(new URL(c.req.url).pathname);
  const page = m ? Number(m[1]) : 0;
  if (!Number.isInteger(page) || page < 1) return c.notFound();
  const { results } = await c.env.DB.prepare(
    "SELECT slug, title, cover_url, updated_at FROM tracks WHERE status = 'ready' ORDER BY created_at, id LIMIT ? OFFSET ?",
  )
    .bind(seo.SITEMAP_PAGE_SIZE, seo.sitemapOffset(page))
    .all<{ slug: string; title: string; cover_url: string | null; updated_at: number }>();
  if (!results.length && page > 1) return c.notFound();
  return new Response(seo.sitemapUrlset(results.map((r) => seo.trackSitemapEntry(origin, r))), { headers: XML_HEADERS });
}

export function robots(c: Context<AppEnv>): Response {
  return new Response(seo.robotsTxt(new URL(c.req.url).origin), {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": seo.cacheControl("robots") },
  });
}

export async function adsTxt(c: Context<AppEnv>): Promise<Response> {
  const s = await getSettings(c.env);
  const body = s.ads_txt.trim();
  if (!body) return new Response("", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return new Response(body + "\n", { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

/** /og/<slug>.svg — ảnh OG động 1200×630 (dùng khi track không có bìa và chưa đặt default_og_image). */
export async function ogImage(c: Context<AppEnv>): Promise<Response> {
  const file = new URL(c.req.url).pathname.slice("/og/".length);
  if (!/\.svg$/i.test(file) || file.includes("/")) return c.notFound();
  let slug = "";
  try {
    slug = decodeURIComponent(file.replace(/\.svg$/i, ""));
  } catch {
    return c.notFound();
  }
  const [s, row] = await Promise.all([getSettings(c.env), slug ? getReadyTrackBySlug(c.env, slug) : null]);
  if (!row) return c.notFound();
  const t = toTrack(row);
  const svg = seo.ogSvg({
    title: t.title,
    brandName: s.brand_name,
    subtitle: `${t.episodeCount > 1 ? t.episodeCount + " tập · " : ""}${seo.clock(t.durationSeconds)}`,
  });
  return new Response(c.req.method === "HEAD" ? null : svg, {
    headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": seo.cacheControl("og") },
  });
}
