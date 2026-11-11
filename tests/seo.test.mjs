// Chạy: node --experimental-strip-types --test tests/seo.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pageTitle, clipWords, isoDuration, episodeStarts, matchRoute, canonicalUrl, buildHead, ssrBody,
  safeJson, sitemapIndex, sitemapUrlset, trackSitemapEntry, ogSvg, wrapLines, robotsTxt, htmlHeaders,
} from "../worker/src/seo/index.ts";

const site = { brandName: "Kể Đêm Audio", siteTitle: "Kể Đêm Audio – Truyện audio drama", tagline: "Nghe truyện đêm khuya" };
const O = "https://kedem.vn";
const track = {
  id: "t1", slug: "con-ma-<b>", title: "Chuyện ma làng Vũ Đại </script>", description: "Một câu chuyện\u2028rùng rợn ".repeat(20),
  coverUrl: "/media/assets/a.jpg", format: "hls", durationSeconds: 3725, episodeCount: 3, status: "ready", playCount: 9, createdAt: 1700000000,
};
const STATIC = { "gioi-thieu": "Giới thiệu" };

test("tiêu đề ≤ 60 và theo mẫu", () => {
  assert.equal(pageTitle("Ma làng", "Kể Đêm Audio"), "Ma làng – Nghe audio full | Kể Đêm Audio");
  const long = pageTitle("Một truyện rất dài với tên kéo mãi không dừng lại được nữa đâu", "Kể Đêm Audio");
  assert.ok(long.length <= 60, long);
  assert.ok(long.endsWith("| Kể Đêm Audio"));
});

test("cắt mô tả theo từ", () => {
  const s = clipWords("xin chào các bạn thân mến của tôi", 20);
  assert.ok(s.length <= 20 && s.endsWith("…") && !s.includes("thâ…"), s);
});

test("ISO 8601 + chia tập", () => {
  assert.equal(isoDuration(3725), "PT1H2M5S");
  assert.equal(isoDuration(0), "PT0S");
  assert.deepEqual(episodeStarts(300, 3), [0, 100, 200]);
});

test("route + canonical bỏ query trừ page", () => {
  const r = matchRoute(new URL(O + "/?utm_source=fb&page=2"), STATIC);
  assert.deepEqual(r, { kind: "home", page: 2 });
  assert.equal(canonicalUrl(O, r), O + "/?page=2");
  assert.equal(matchRoute(new URL(O + "/login"), STATIC).kind, "private");
  assert.equal(matchRoute(new URL(O + "/khong-co"), STATIC).kind, "notFound");
});

test("head trang truyện: escape, JSON-LD an toàn, og", () => {
  const h = buildHead({ kind: "track", slug: track.slug }, { track }, site, O);
  assert.equal(h.status, 200);
  assert.ok(h.title.length <= 60);
  assert.ok(h.description.length <= 155);
  assert.ok(!h.html.includes("</script>\"") && !/<\/script>[^\n]*Vũ Đại/.test(h.html.split("ld+json")[1] ?? ""));
  assert.ok(!h.html.includes("\u2028"));
  assert.ok(h.html.includes('property="og:locale" content="vi_VN"'));
  assert.ok(h.html.includes("summary_large_image"));
  assert.ok(h.html.includes(`<link rel="canonical" href="${O}/track/con-ma-%3Cb%3E">`));
  assert.ok(h.jsonLd.some((x) => x["@type"] === "AudioObject" && x.duration === "PT1H2M5S" && !("contentUrl" in x)));
});

test("noindex,follow cho login / tìm kiếm / 404", () => {
  for (const r of [{ kind: "private", key: "login" }, { kind: "search", q: "ma", page: 1 }, { kind: "notFound", path: "/x" }]) {
    const h = buildHead(r, {}, site, O);
    assert.equal(h.robots, "noindex, follow");
    assert.ok(!h.html.includes('rel="canonical"'));
  }
  assert.equal(buildHead({ kind: "track", slug: "x" }, { track: null }, site, O).status, 404);
});

test("trang chủ có WebSite + SearchAction", () => {
  const h = buildHead({ kind: "home", page: 1 }, { latest: [track] }, site, O);
  const ws = h.jsonLd.find((x) => x["@type"] === "WebSite");
  // Giao diện dùng /tim-kiem (không phải /search) → SearchAction trỏ /tim-kiem?q=
  assert.match(ws.potentialAction.target.urlTemplate, /\/tim-kiem\?q=\{search_term_string\}/);
  assert.ok(h.jsonLd.some((x) => x["@type"] === "ItemList"));
});

test("route thể loại / tag / tìm kiếm: canonical, 404 khi không có nhóm", () => {
  const r = matchRoute(new URL(O + "/the-loai/gia-dinh?utm_source=x"), STATIC);
  assert.deepEqual(r, { kind: "category", slug: "gia-dinh", page: 1 });
  assert.equal(canonicalUrl(O, r), O + "/the-loai/gia-dinh");
  assert.equal(matchRoute(new URL(O + "/tag/bao-thu"), STATIC).kind, "tag");
  assert.equal(matchRoute(new URL(O + "/tim-kiem?q=ma"), STATIC).kind, "search");
  const h = buildHead(r, { collection: { name: "Gia đình" }, items: [track] }, site, O);
  assert.equal(h.status, 200);
  assert.equal(h.robots, "index, follow");
  assert.ok(h.jsonLd.some((x) => x["@type"] === "ItemList") && h.jsonLd.some((x) => x["@type"] === "BreadcrumbList"));
  const nf = buildHead(r, { collection: null }, site, O);
  assert.equal(nf.status, 404);
  assert.equal(nf.robots, "noindex, follow");
  const b = ssrBody(r, { collection: { name: "Gia đình" }, items: [track] }, { brandName: "B", categories: [{ slug: "gia-dinh", name: "Gia đình" }] });
  assert.ok(b.includes("<h1>Gia đình</h1>") && b.includes('href="/the-loai/gia-dinh"'));
});

test("ảnh OG: bìa → ảnh mặc định → SVG động", () => {
  const og = (t, s) => /property="og:image" content="([^"]+)"/.exec(buildHead({ kind: "track", slug: t.slug }, { track: t }, s, O).html)[1];
  assert.equal(og(track, site), O + "/media/assets/a.jpg");
  const noCover = { ...track, slug: "khong-bia", coverUrl: null };
  assert.equal(og(noCover, { ...site, defaultImage: "/og.png" }), O + "/og.png");
  assert.equal(og(noCover, site), O + "/og/khong-bia.svg");
});

test("ssrBody có h1, danh sách tập, liên kết", () => {
  const b = ssrBody({ kind: "track", slug: track.slug }, { track, related: [{ ...track, id: "t2", slug: "khac", title: "Khác" }] }, { brandName: "Kể Đêm Audio" });
  assert.ok(b.startsWith('<div class="ssr-seo">'));
  assert.ok(b.includes("<h1>Chuyện ma làng Vũ Đại &lt;/script&gt;</h1>"));
  assert.ok(b.includes("Tập 3"));
  assert.ok(b.includes('href="/track/khac"'));
});

test("sitemap index + ảnh", () => {
  const idx = sitemapIndex(O, 2500);
  assert.equal((idx.match(/<sitemap>/g) ?? []).length, 4);
  const set = sitemapUrlset([trackSitemapEntry(O, { slug: "a&b", title: "A & B", cover_url: "/c.jpg", updated_at: 1700000000 })]);
  assert.ok(set.includes("xmlns:image") && set.includes("<image:loc>https://kedem.vn/c.jpg</image:loc>") && set.includes("a%26b") && !set.includes("A & B<"));
  assert.ok(robotsTxt(O).includes("Sitemap: https://kedem.vn/sitemap.xml"));
});

test("OG SVG tách dòng, escape", () => {
  const svg = ogSvg({ title: "Chuyện <ma> ".repeat(10), brandName: "Kể Đêm Audio" });
  assert.ok(svg.startsWith("<svg") && !svg.includes("<ma>"));
  assert.ok(wrapLines("một hai ba bốn năm sáu bảy tám chín mười", 10, 2).length === 2);
});

test("safeJson + header", () => {
  const j = safeJson({ a: "</script>" + String.fromCharCode(0x2028) });
  assert.ok(!j.includes("<") && !j.includes(String.fromCharCode(0x2028)) && j.includes("u003c") && j.includes("u2028"), j);
  assert.deepEqual(JSON.parse(j), { a: "</script>" + String.fromCharCode(0x2028) });
  const h = htmlHeaders({ robots: "index, follow", canonical: O }, { preloadImage: O + "/c.jpg" });
  assert.match(h["link"], /rel=preload; as=image/);
  assert.equal(htmlHeaders({ robots: "noindex, follow", canonical: O })["cache-control"], "no-store");
});
