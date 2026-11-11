# SEO — Kể Đêm Audio

Mã: `worker/src/seo/index.ts` (hàm thuần, chỉ `import type`), gợi ý bảng `worker/src/seo/schema.sql`, kiểm thử `tests/seo.test.mjs`
(`node --experimental-strip-types --test tests/seo.test.mjs`).

| Hàm | Việc |
|---|---|
| `matchRoute(url, STATIC_PAGES, ALIASES)` | URL → `SeoRoute` (home / track / search / static / private / notFound) |
| `buildHead(route, data, site, origin)` | `<title>`, description, canonical, hreflang, OG, Twitter, theme-color, robots, JSON-LD → `{ html, status, robots, canonical… }` |
| `ssrBody(route, data, opt)` | HTML ngữ nghĩa cho bot (h1, mô tả, danh sách tập + thời điểm, liên quan / mới nhất, nav trang tĩnh) |
| `sitemapIndex`, `sitemapUrlset`, `trackSitemapEntry`, `sitemapOffset`, `robotsTxt` | sitemap chỉ mục + trang 1000 URL có `image:image` |
| `ogSvg({ title, brandName, subtitle })` | ảnh OG SVG 1200×630 |
| `cacheControl`, `htmlHeaders` | Cache-Control, X-Robots-Tag, Link preload ảnh bìa |
| `SLUG_REDIRECT_*_SQL`, `redirectTo` | 301 slug cũ → slug mới |

## 1. Danh sách kiểm — kỹ thuật

- [ ] Mỗi trang có **một** `<title>` ≤ 60 ký tự, mẫu `Tên truyện – Nghe audio full | Kể Đêm Audio` (`pageTitle` tự rút gọn: bỏ hậu tố → cắt tên theo từ).
- [ ] Meta description ≤ 155 ký tự, cắt theo từ (`clipWords`), không trùng giữa các trang.
- [ ] Canonical tuyệt đối, bỏ `utm_*`, `fbclid`, `t=`… — chỉ giữ `?page=N` (N > 1). Trang noindex không phát canonical.
- [ ] `robots: noindex, follow` + header `X-Robots-Tag` cho `/login`, `/register`, `/history`, `/admin/*`, `/search` (mọi `q`), 404 (kể cả `/track/<slug không có>` — trả **mã 404 thật**, không soft-404).
- [ ] `hreflang="vi"` + `x-default`, `og:locale=vi_VN`, `<html lang="vi">`.
- [ ] OG đủ: type/url/title/description/image/site_name; `twitter:card=summary_large_image`; trang truyện có `og:audio` **chỉ khi** truyền `audioUrl` (mặc định không lộ link tệp).
- [ ] JSON-LD: trang chủ `WebSite` + `SearchAction` (`/search?q={search_term_string}` — **giao diện phải có route `/search?q=`**, nếu tên khác thì sửa `ldWebSite` + `matchRoute`), `Organization`, `ItemList`; trang truyện `AudioObject` (hoặc `PodcastEpisode`, `ldTrack(..., { type: "PodcastEpisode" })`) với `duration` ISO 8601, `inLanguage: vi`, `BreadcrumbList`; `FAQPage` khi truyền `data.faq`. Mọi JSON đi qua `safeJson` (chặn `<`, `>`, `&`, U+2028/2029).
- [ ] Sitemap: `/sitemap.xml` là **chỉ mục** → `/sitemap-pages.xml` (trang chủ + trang tĩnh) + `/sitemap-tracks-N.xml` (1000 URL/tệp, `lastmod` = `updated_at`, `image:image` từ ảnh bìa).
- [ ] `robots.txt` (`robotsTxt`) trỏ sitemap; chặn `/api/` nhưng mở `/api/public/`, `/media/`, `/og/`.
- [ ] Đổi tiêu đề → slug mới → ghi `slug_redirects`; slug cũ trả **301** (không 302) tới slug mới.
- [ ] Kiểm bằng: Rich Results Test, URL Inspection (Search Console), `curl -A Googlebot https://…/track/<slug>` thấy h1 + JSON-LD trong HTML thô.

## 2. Danh sách kiểm — nội dung

**Tiêu đề / mô tả mẫu cho truyện drama**

- Tiêu đề: `Chồng Tôi Là Ma – Nghe audio full | Kể Đêm Audio`; truyện nhiều tập: tên truyện trước, không nhồi "truyện ma hay nhất 2026".
- Mô tả (≤ 155): *"Nghe Chồng Tôi Là Ma full 12 tập miễn phí: cô dâu mới về nhà chồng phát hiện bí mật dưới gian thờ. Giọng đọc truyền cảm, nghe đêm khuya."* — tên truyện + số tập + móc truyện + lợi ích.
- Mô tả trong quản trị nên viết 2–4 đoạn (≥ 300 chữ): tóm tắt không tiết lộ kết, nhân vật, thể loại, người đọc. `ssrBody` tách đoạn theo dòng trống.
- Câu hỏi thường gặp (FAQ) cho truyện ăn khách: "Truyện có bao nhiêu tập?", "Nghe có mất phí không?" → `data.faq`.

**Trang nên có (chưa có trong hợp đồng — cần thêm cột / bảng, đề xuất)**

- Thể loại: `/the-loai/truyen-ma`, `/the-loai/ngon-tinh`, `/the-loai/trinh-tham`, `/the-loai/kinh-di`, `/the-loai/xuyen-khong` — mỗi trang có đoạn giới thiệu 100–200 chữ riêng, danh sách phân trang `?page=`.
- Tag / người đọc (giọng đọc): `/tag/<slug>`, `/giong-doc/<slug>` — chỉ index khi ≥ 3 truyện (ít hơn thì noindex, follow).
- Trang "Mới cập nhật", "Nghe nhiều" (`sort=new|hot`).

**Liên kết nội bộ**

- Trang truyện: "Truyện liên quan" (`related` từ API) + "Mới cập nhật"; breadcrumb Trang chủ › (Thể loại ›) Truyện.
- Trang chủ: 30 truyện mới nhất + phân trang `?page=2` (canonical giữ `page`).
- Footer: trang tĩnh (giới thiệu, liên hệ, chính sách) — đã có trong `ssrBody`.
- Văn bản neo là tên truyện, không dùng "bấm vào đây".

## 3. Core Web Vitals cho SPA

- **LCP** (thường là ảnh bìa trang truyện): `htmlHeaders(head, { preloadImage: coverAbs })` gửi `Link: <…>; rel=preload; as=image; fetchpriority=high`; trong React đặt `<img fetchpriority="high" loading="eager" width height>` cho bìa, ảnh dưới màn hình `loading="lazy"`; phục vụ ảnh bìa ≤ 100 KB, WebP; `preconnect` tới `MEDIA_PUBLIC_BASE` nếu dùng miền R2 riêng.
- **CLS**: thanh phát cố định đáy — giữ chỗ trước bằng `padding-bottom: var(--player-h)` trên `body` **ngay từ HTML đầu** (lớp `has-player` đặt trước khi vẽ nếu có phiên nghe dở), không chèn thanh đẩy nội dung; ảnh luôn có `width/height` hoặc `aspect-ratio`; phông chữ `font-display: swap` + `size-adjust`.
- **INP**: không chạy việc nặng trong onClick nút phát (khởi tạo hls.js lười — `import()` khi bấm lần đầu là được vì chỉ tách mã, không thêm thư viện); cập nhật tiến độ phát bằng `requestAnimationFrame` / mỗi 250 ms, không setState mỗi `timeupdate`; danh sách dài dùng phân trang.
- HTML: `cacheControl("html")` = `public, max-age=0, s-maxage=300, stale-while-revalidate=600` (HTML không chứa dữ liệu riêng người dùng). Muốn cache biên thật sự cần `caches.default` trong Worker — tuỳ chọn, xoá khi sửa truyện. Trang noindex: `no-store`.

### Không nhấp nháy khối SSR

Hiện `web/src/index.css` đặt `.ssr-seo { display: none }` **luôn luôn** → người tắt JS không thấy gì, và nội dung ẩn hoàn toàn có thể bị coi là cloaking nhẹ. Đề xuất (bên web):

```css
html.js .ssr-seo { display: none; }   /* thay cho .ssr-seo { display:none } */
```

và Worker chèn `NO_FLASH_SCRIPT` (`<script>document.documentElement.classList.add("js")</script>`) **đầu `<head>`** → lớp `js` có trước lần vẽ đầu, không nhấp nháy. Phương án khác: đặt khối SSR **bên trong** `<div id="root">`; `createRoot().render()` xoá nội dung cũ ở lần render đầu (giữ cùng bố cục để không giật).

## 4. Ảnh OG động

Route `/og/:slug.svg` sinh SVG 1200×630 (tiêu đề tách tối đa 3 dòng, cỡ chữ theo độ dài, tên thương hiệu, nền gradient).

**Hạn chế**: Facebook, Zalo, X/Twitter, LinkedIn **không nhận `og:image` SVG**; Google Discover cũng cần ảnh raster ≥ 1200 px. Vì vậy `buildHead` chọn ảnh theo thứ tự: **ảnh bìa có sẵn → `site.defaultImage` (PNG/JPG thương hiệu) → SVG động** (chỉ hữu ích cho Google / Telegram / Discord).

Phương án lấy PNG (cần chủ dự án duyệt):
1. (Khuyên dùng) Bắt buộc ảnh bìa 1200×630 khi đăng truyện ở trang quản trị; đặt `defaultImage` = `/og-default.png` trong `public/`.
2. Cloudflare Images / Image Resizing (`/cdn-cgi/image/...`) — không vẽ được chữ lên SVG nhưng chuyển định dạng ảnh bìa.
3. `workers-og` / `@resvg/resvg-wasm` chuyển SVG → PNG trong Worker — **là thư viện mới**, chưa được duyệt.
4. Trình duyệt quản trị vẽ SVG lên `<canvas>` → `toBlob("image/png")` → `POST /api/admin/assets` → lưu làm `coverUrl` (không thêm thư viện, làm một lần lúc đăng).

## 5. Gửi sitemap lên Search Console

1. Search Console → Thêm thuộc tính **Miền** (xác minh DNS TXT) hoặc **Tiền tố URL** (dán thẻ meta xác minh vào Cài đặt → `head_html`).
2. Sitemaps → nhập `sitemap.xml` → Gửi. Chỉ cần gửi chỉ mục; các tệp con tự được đọc.
3. Kiểm "Trang" → lý do không lập chỉ mục; URL Inspection → "Kiểm tra URL đang hoạt động" để xem HTML đã chèn.
4. Bing Webmaster Tools: nhập từ Search Console. Khi có truyện mới có thể ping IndexNow (tuỳ chọn).

## 6. Hướng dẫn gắn vào `worker/src/index.ts`

Ví dụ dưới dùng hàm có sẵn ở `data.ts` (`getSettings`, `getReadyTrackBySlug`, `latestReady`, `toTrack`, `siteTitleOf`) và `STATIC_PAGES` ở `pages.ts` (cần `export` thêm `STATIC_ALIASES`). Có thể thay thân `renderPage` / `sitemap` / `robots` trong `pages.ts` bằng đoạn này.

```ts
import * as seo from "./seo";
import { getReadyTrackBySlug, getSettings, latestReady, publicConfig, siteTitleOf, toTrack } from "./data";
import { STATIC_PAGES, STATIC_ALIASES } from "./pages";
import { jsonForScript } from "./lib";

async function seoPage(c: Context<AppEnv>): Promise<Response> {
  const url = new URL(c.req.url);
  const origin = url.origin;
  const route = seo.matchRoute(url, STATIC_PAGES, STATIC_ALIASES);
  const s = await getSettings(c.env);
  const site: seo.SeoSite = {
    brandName: s.brand_name, siteTitle: siteTitleOf(s), tagline: s.tagline,
    contactEmail: s.contact_email, defaultImage: "/og-default.png", logoUrl: "/icon-512.png",
  };
  const data: seo.SeoData = {};
  if (route.kind === "track") {
    const row = await getReadyTrackBySlug(c.env, route.slug);
    if (!row) {
      // 301 slug cũ (sau khi đã tạo bảng slug_redirects từ schema.sql)
      const r = await c.env.DB.prepare(seo.SLUG_REDIRECT_LOOKUP_SQL).bind(route.slug).first<{ slug: string }>();
      if (r) return c.redirect(seo.redirectTo(origin, r.slug).location, 301);
    }
    data.track = row ? toTrack(row) : null;
    data.related = (await latestReady(c.env, 12, row?.id)).map(toTrack); // hoặc related từ data.ts
    data.latest = data.related;
  } else if (route.kind === "home" || route.kind === "notFound") {
    data.latest = (await latestReady(c.env, 50)).map(toTrack);
  }
  const head = seo.buildHead(route, data, site, origin);
  const body = seo.ssrBody(route, data, { brandName: s.brand_name, tagline: s.tagline, staticPages: STATIC_PAGES });

  let html = await loadShell(c); // như pages.ts
  html = html.replace(/<title>[\s\S]*?<\/title>/i, "");
  html = html.replace("<!--ssr-head-->",
    seo.NO_FLASH_SCRIPT + head.html +
    `<script>window.__SITE__=${jsonForScript(publicConfig(s))}</script>` + (s.head_html || ""));
  html = html.replace("<!--ssr-body-->", body);
  // ... chèn s.body_html trước </body> như pages.ts

  const cover = data.track?.coverUrl ? new URL(data.track.coverUrl, origin).href : null;
  return new Response(c.req.method === "HEAD" ? null : html, {
    status: head.status,
    headers: seo.htmlHeaders(head, { preloadImage: cover }),
  });
}

// Sitemap
app.get("/sitemap.xml", async (c) => {
  const origin = new URL(c.req.url).origin;
  const n = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM tracks WHERE status='ready'").first<number>("n");
  return new Response(seo.sitemapIndex(origin, n ?? 0), {
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": seo.cacheControl("sitemap") },
  });
});
app.get("/sitemap-pages.xml", (c) => {
  const origin = new URL(c.req.url).origin;
  const xml = seo.sitemapUrlset([
    { loc: origin + "/", changefreq: "daily", priority: 1 },
    ...Object.keys(STATIC_PAGES).map((p) => ({ loc: `${origin}/${p}`, changefreq: "monthly" as const, priority: 0.3 })),
  ]);
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": seo.cacheControl("sitemap") } });
});
app.get("/:file{sitemap-tracks-[0-9]+\\.xml}", async (c) => {
  const origin = new URL(c.req.url).origin;
  const page = Number(/(\d+)/.exec(c.req.param("file"))![1]);
  const { results } = await c.env.DB.prepare(
    "SELECT slug, title, cover_url, updated_at FROM tracks WHERE status='ready' ORDER BY created_at, id LIMIT ? OFFSET ?",
  ).bind(seo.SITEMAP_PAGE_SIZE, seo.sitemapOffset(page)).all<{ slug: string; title: string; cover_url: string | null; updated_at: number }>();
  if (!results.length && page > 1) return c.notFound();
  return new Response(seo.sitemapUrlset(results.map((r) => seo.trackSitemapEntry(origin, r))), {
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": seo.cacheControl("sitemap") },
  });
});
app.get("/robots.txt", (c) =>
  new Response(seo.robotsTxt(new URL(c.req.url).origin), {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": seo.cacheControl("robots") },
  }));

// Ảnh OG — PHẢI đặt trước route "*" (route "*" đang đẩy mọi đường dẫn có dấu chấm sang ASSETS)
app.get("/og/:file{.+\\.svg}", async (c) => {
  const slug = decodeURIComponent(c.req.param("file").replace(/\.svg$/, ""));
  const [s, row] = await Promise.all([getSettings(c.env), getReadyTrackBySlug(c.env, slug)]);
  if (!row) return c.notFound();
  const t = toTrack(row);
  const svg = seo.ogSvg({
    title: t.title, brandName: s.brand_name,
    subtitle: `${t.episodeCount > 1 ? t.episodeCount + " tập · " : ""}${seo.clock(t.durationSeconds)}`,
  });
  return new Response(svg, { headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": seo.cacheControl("og") } });
});
```

Ghi chú khi gắn:
- Thứ tự route: `/sitemap*.xml`, `/robots.txt`, `/og/*` phải khai báo **trước** `app.get("*")` (nhánh "có dấu chấm → ASSETS").
- Thanh `<title>` trong `index.html` gốc bị bỏ để không có hai thẻ title.
- `/search` chưa thấy trong route giao diện hiện tại — cần bên web thêm (hoặc đổi `urlTemplate`).
- Khi thêm thể loại / tag: thêm nhánh vào `SeoRoute`, `matchRoute`, `buildHead`, `ssrBody`, sitemap.
